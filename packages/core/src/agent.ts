import { ToolLoopAgent, tool as createTool, experimental_generateImage } from 'ai'
import type { IFileSystem } from './storage/in-memory-fs/interface.js'
import type {
  Agent,
  AgentCallParameters,
  AgentStreamParameters,
  GenerateTextResult,
  StreamTextResult,
  ToolSet,
} from 'ai'
import { createDefaultTools } from './default-tools.js'
import type { MCPServerConfig } from './mcp/types.js'
import { prepareModelForAgent } from './model-preparation.js'
import { MemoryFileSystem } from './storage/memory-fs.js'
import { ToolFileSystem } from './storage/tool-fs.js'
import { buildDefaultSystemPrompt } from './system-prompt.js'
import { createTodoWriteTool } from './tools/todo.js'
import { createGenerateImageTool } from './tools/generate-image.js'
import { createSkillTool } from './skills/skill-tool.js'
import { loadSkills } from './skills/loader.js'
import type { Skill } from './skills/skill-tool.js'
import type { AgentOverrides, NanoCodanaConfig, Sandbox, Tool, ToolContext } from './types.js'
import type { MCPClientManager } from './mcp/client-manager.js'

/** Conventional skill directories scanned in the agent's own filesystem. */
const DEFAULT_SKILL_DIRS = ['.agents/skills', '.claude/skills']

/** Shallow Object.is comparison of two dependency lists. */
function depsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false
  }
  return true
}

/**
 * A single-slot memo: caches one value plus the dependency list it was built
 * from. `get(deps, build)` returns the cached value when `deps` is unchanged
 * (Object.is per element), otherwise rebuilds and re-caches. This is the
 * "build once, save in memory, rebuild only on change" primitive — each
 * compiled artifact (model, skills, tools, prompt, agent) gets its own Memo,
 * and listing an upstream artifact's *built value* in a downstream Memo's deps
 * makes invalidation cascade automatically.
 */
class Memo<T> {
  private cur?: { deps: readonly unknown[]; value: T }
  get(deps: readonly unknown[], build: () => T): T {
    if (this.cur && depsEqual(this.cur.deps, deps)) return this.cur.value
    const value = build()
    this.cur = { deps, value }
    return value
  }
}

/** Decode a base64 string to bytes without Node's Buffer (browser-safe). */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Read an AI SDK GeneratedFile / generated image as raw bytes. */
function generatedFileToBytes(file: {
  uint8Array?: Uint8Array
  base64?: string
}): Uint8Array {
  if (file.uint8Array instanceof Uint8Array) return file.uint8Array
  if (typeof file.base64 === 'string') return base64ToBytes(file.base64)
  throw new Error('Generated file has neither uint8Array nor base64 data')
}

/** Insert `-<index>` before a path's extension: hero.png → hero-0.png. */
function indexedPath(path: string, index: number): string {
  const dot = path.lastIndexOf('.')
  if (dot <= path.lastIndexOf('/')) return `${path}-${index}`
  return `${path.slice(0, dot)}-${index}${path.slice(dot)}`
}

export class NanoCodana<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = ToolSet,
> implements Agent<CALL_OPTIONS, TOOLS>
{
  readonly version = 'agent-v1' as const

  private readonly idValue?: string
  // `model` holds the unprepared model from construction (the per-interaction
  // default). Preparation is memoized in memoModel, so the parser middleware
  // (and its yaml dep) only loads when toolMiddleware is configured. Apps
  // using native-tool models pay zero.
  private readonly model: any
  // Optional image model (per-interaction default). When set, a GenerateImage
  // tool is exposed. `imageOutputDir` is where images emitted directly by a
  // multimodal `model` (result.files) get auto-saved; `generatedImageSeq` names
  // them deterministically without a clock.
  private readonly imageModel?: any
  private readonly imageOutputDir: string
  private generatedImageSeq = 0
  private readonly toolMiddleware: NanoCodanaConfig['toolMiddleware']
  private readonly promptCaching: NanoCodanaConfig['promptCaching']
  // Built-in default tools (fs/sandbox-backed) — construction-fixed, since they
  // close over the filesystem. `configTools` is the per-interaction-default
  // custom tool set (record or factory); `toolContext` is saved so a factory
  // override can be re-run against the same fs/sandbox. `todoTool` is the
  // always-present TodoWrite, built once.
  private readonly baseTools: Record<string, Tool>
  private readonly configTools?: NanoCodanaConfig['tools']
  private readonly toolContext?: ToolContext
  private readonly todoTool: Tool
  // A user-supplied system prompt, if any. The DEFAULT prompt is built lazily
  // in getAgent() (not here) so it can enumerate skills discovered async by
  // ensureSkills() — building it in the constructor would omit the Skill tool.
  private readonly customSystemPrompt?: string
  private readonly stopWhen: any
  private readonly mcpConfig?: Record<string, MCPServerConfig>
  private readonly compact: boolean
  /**
   * The agent's filesystem, exposed so host apps can read and write the same
   * files the agent works on (`agent.fs.write(...)`, `agent.fs.readFile(...)`,
   * `agent.fs.delete(...)`, `agent.fs.list()`, …). Writes made through it are
   * tracked exactly like the agent's own tool writes — `onFilesChange` fires —
   * so UI mirrors (editors, previews) stay in sync in both directions.
   *
   * NOTE: `fs.read()` returns TOOL-formatted output (line numbers +
   * truncation) intended for the model; use `fs.readFile(path)` for raw
   * content, or `fs.rawFs` for the full underlying IFileSystem.
   *
   * Undefined when the agent is backed by a sandbox, or when custom `tools`
   * are passed as a plain record without any fs-related config
   * (fs/initialFiles/onFilesChange).
   */
  readonly fs?: ToolFileSystem
  private readonly sandbox?: Sandbox
  private readonly approvalPolicy?: NanoCodanaConfig['needsApproval']
  // Skills explicitly passed in config, plus the conventional dirs to scan in
  // the agent's filesystem (defaults used when an interaction doesn't override).
  private readonly configSkills: Skill[]
  private readonly skillDirs: string[]
  // The last-resolved skill set and custom tools from the most recent
  // interaction, kept so the synchronous `tools` getter reflects what the last
  // interaction actually used (including per-call overrides), not just the
  // construction-time defaults. `lastResolvedSkills` is also primed by
  // ensureSkills(). Both are undefined until the first interaction.
  private lastResolvedSkills?: Skill[]
  private lastCustomTools?: Record<string, Tool>
  private lastCustomToolsSet = false
  private lastActiveTools?: string[]
  private lastDisableTools?: string[]
  private lastImageModel?: any
  private mcpManager?: MCPClientManager
  private mcpTools: Record<string, any> = {}
  private mcpConnected = false

  // Compiled-artifact memory. Each Memo holds one built value plus the inputs
  // it was built from; the next interaction reuses it when those inputs are
  // unchanged and rebuilds only what changed. Async artifacts cache the
  // Promise so concurrent interactions dedupe.
  private readonly memoModel = new Memo<Promise<any>>()
  private readonly memoSkills = new Memo<Promise<Skill[]>>()
  // Resolves a tools factory to a record once per distinct input, so a factory
  // override behaves like a stable record for the downstream tool/prompt memos
  // (the factory runs only when its reference changes, not every interaction).
  private readonly memoCustomTools = new Memo<Record<string, Tool> | undefined>()
  private readonly memoTools = new Memo<Record<string, any>>()
  private readonly memoPrompt = new Memo<string>()
  private readonly memoAgent = new Memo<ToolLoopAgent<CALL_OPTIONS, TOOLS>>()

  constructor(config: NanoCodanaConfig) {
    this.idValue = config.id
    this.stopWhen = config.stopWhen
    this.compact = config.compact ?? false
    this.model = config.model
    this.imageModel = config.imageModel
    this.imageOutputDir = config.imageOutputDir ?? 'generated'
    this.toolMiddleware = config.toolMiddleware
    this.promptCaching = config.promptCaching
    this.mcpConfig = config.mcpServers
    this.approvalPolicy = config.needsApproval
    this.configSkills = config.skills ?? []
    this.skillDirs = config.skillDirs ?? DEFAULT_SKILL_DIRS

    let baseTools: Record<string, Tool> = {}
    let toolContext: ToolContext | undefined
    const shouldCreateDefaultTools =
      !config.tools || !!config.fs || config.initialFiles || config.onFilesChange || !!config.sandbox
    const shouldCreateContext = shouldCreateDefaultTools || typeof config.tools === 'function'

    // virtualBash defaults to true (backward compat). false drops the Bash tool;
    // an object both enables it and configures the shell (see VirtualShellOptions).
    const virtualBash = config.virtualBash ?? true

    if (config.sandbox) {
      this.sandbox = config.sandbox
      toolContext = { sandbox: config.sandbox }
      if (shouldCreateDefaultTools) {
        baseTools = createDefaultTools({ sandbox: config.sandbox, virtualBash })
      }
    } else if (shouldCreateContext) {
      this.fs = config.fs
        ? new ToolFileSystem(config.fs, '/', config.onFilesChange)
        : new MemoryFileSystem(config.initialFiles, config.onFilesChange)
      toolContext = { fs: this.fs.rawFs }
      if (shouldCreateDefaultTools) {
        baseTools = createDefaultTools({ fs: this.fs, virtualBash })
      }
    }

    this.baseTools = baseTools
    this.toolContext = toolContext
    this.configTools = config.tools
    this.todoTool = createTodoWriteTool()
    this.customSystemPrompt = config.systemPrompt
  }

  get id(): string | undefined {
    return this.idValue
  }

  get tools(): TOOLS {
    // Synchronous snapshot of what the most recent interaction used (including
    // per-call overrides), falling back to construction-time defaults before
    // the first interaction. Uses the configured approval policy + compact mode.
    const skills = this.lastResolvedSkills ?? this.configSkills
    const customTools = this.lastCustomToolsSet
      ? this.lastCustomTools
      : this.resolveCustomTools(this.configTools)
    return this.buildAgentTools(
      customTools,
      skills,
      this.approvalPolicy,
      this.compact,
      this.lastImageModel ?? this.imageModel,
      this.lastActiveTools,
      this.lastDisableTools,
    ) as TOOLS
  }

  /** Resolve a custom-tools input (record or factory) to a record. */
  private resolveCustomTools(
    toolsInput: NanoCodanaConfig['tools'],
  ): Record<string, Tool> | undefined {
    return typeof toolsInput === 'function'
      ? toolsInput(this.toolContext ?? { fs: this.createFallbackFs() })
      : toolsInput
  }

  private async connectMCP(): Promise<void> {
    if (this.mcpConnected || !this.mcpConfig || Object.keys(this.mcpConfig).length === 0) {
      return
    }

    const { MCPClientManager } = await import('./mcp/client-manager.js')
    this.mcpManager = new MCPClientManager()
    this.mcpTools = await this.mcpManager.connectServers(this.mcpConfig)
    this.mcpConnected = true
  }

  /**
   * Apply the optional approval policy on top of a tool's own needsApproval.
   * A name list forces those tools to require approval; a predicate forces
   * true/false or returns undefined to keep the tool's own setting.
   */
  private resolveNeedsApproval(
    name: string,
    toolDefault: Tool['needsApproval'],
    policy: NanoCodanaConfig['needsApproval'],
  ): Tool['needsApproval'] {
    if (!policy) return toolDefault
    if (Array.isArray(policy)) return policy.includes(name) ? true : toolDefault
    const forced = policy(name)
    return forced === undefined ? toolDefault : forced
  }

  /**
   * Discover skills from the agent's own filesystem at the conventional
   * directories (.agents/skills, .claude/skills), exactly the same on every
   * platform: on Node those are real files under the working dir, in the
   * browser they're entries seeded into the in-memory / IndexedDB FS via
   * initialFiles. Explicit `configSkills` are merged in and win on name
   * collisions.
   */
  private async resolveSkills(
    configSkills: Skill[],
    skillDirs: string[],
  ): Promise<Skill[]> {
    const found = new Map<string, Skill>()
    if (this.fs && skillDirs.length > 0) {
      for (const dir of skillDirs) {
        for (const skill of await loadSkills(this.fs.rawFs, dir)) {
          found.set(skill.name, skill)
        }
      }
    }
    // Explicit skills passed in config take precedence over discovered ones.
    for (const skill of configSkills) found.set(skill.name, skill)
    return [...found.values()]
  }

  /**
   * Eagerly resolve skills (with the configured defaults) and remember them so
   * the synchronous `tools` getter reflects discovered skills. Primes the same
   * Memo a default-input interaction uses, so no rework happens later. Retained
   * as a convenience / for tests; getAgent() resolves skills on its own.
   */
  async ensureSkills(): Promise<void> {
    this.lastResolvedSkills = await this.memoSkills.get(
      [this.configSkills, this.skillDirs, this.fs],
      () => this.resolveSkills(this.configSkills, this.skillDirs),
    )
  }

  /**
   * The full tool-definition set, including the synthesized `Skill` tool.
   * Single source of truth shared by buildAgentTools() (what the model can
   * call) and the default system prompt (what the model is told it has), so
   * the two never disagree.
   */
  /**
   * Apply the per-turn capability gate to a record keyed by tool name:
   * `activeTools` (allow-list) keeps only the named tools; `disableTools`
   * (deny-list) then drops any named tools. Allow is applied before deny.
   * Returns a new record; the input is not mutated. Used for both the built-in
   * tool defs and the MCP tools so a gated tool vanishes from everywhere.
   */
  private applyToolGate<T>(
    record: Record<string, T>,
    activeTools?: string[],
    disableTools?: string[],
  ): Record<string, T> {
    if (!activeTools && (!disableTools || disableTools.length === 0)) return record
    const allow = activeTools ? new Set(activeTools) : undefined
    const deny = disableTools && disableTools.length > 0 ? new Set(disableTools) : undefined
    const out: Record<string, T> = {}
    for (const [name, value] of Object.entries(record)) {
      if (allow && !allow.has(name)) continue
      if (deny && deny.has(name)) continue
      out[name] = value
    }
    return out
  }

  private buildToolDefs(
    customTools: Record<string, Tool> | undefined,
    skills: Skill[],
    imageModel?: any,
    activeTools?: string[],
    disableTools?: string[],
  ): Record<string, Tool> {
    // Precedence (later wins): built-in default tools < GenerateImage < custom
    // tools < TodoWrite < Skill. GenerateImage sits below custom tools so a
    // user-supplied tool of the same name can override it. Matches the original
    // construction-time merge order otherwise.
    const defs: Record<string, Tool> = {
      ...this.baseTools,
      ...(imageModel ? { GenerateImage: this.buildImageTool(imageModel) } : {}),
      ...customTools,
      TodoWrite: this.todoTool,
      ...(skills.length > 0 ? { Skill: createSkillTool(skills) } : {}),
    }
    // Per-turn capability gate: keep only allowed / drop denied tools, so
    // neither the tool set nor the generated prompt exposes them this turn.
    return this.applyToolGate(defs, activeTools, disableTools)
  }

  private buildAgentTools(
    customTools: Record<string, Tool> | undefined,
    skills: Skill[],
    policy: NanoCodanaConfig['needsApproval'],
    compact: boolean,
    imageModel?: any,
    activeTools?: string[],
    disableTools?: string[],
  ): Record<string, any> {
    const builtTools: Record<string, any> = {}

    for (const [name, toolDef] of Object.entries(
      this.buildToolDefs(customTools, skills, imageModel, activeTools, disableTools),
    )) {
      builtTools[name] = createTool({
        description:
          compact && toolDef.compactDescription
            ? toolDef.compactDescription
            : toolDef.description,
        // toolDef.parameters is typed as `unknown` in our public Tool
        // interface so core doesn't bind to a specific validator. AI SDK's
        // `tool()` accepts any FlexibleSchema (zod, jsonSchema(), Standard
        // Schema, etc.). The cast is the meeting point.
        inputSchema: toolDef.parameters as any,
        needsApproval: this.resolveNeedsApproval(name, toolDef.needsApproval, policy),
        execute: toolDef.execute,
      })
    }

    // MCP tools are subject to the same per-turn gate.
    const mcpTools = this.applyToolGate(this.mcpTools, activeTools, disableTools)

    return {
      ...builtTools,
      ...mcpTools,
    }
  }

  /**
   * Build the GenerateImage tool over a specific image model. The execute
   * generates the image(s) with the AI SDK, then writes the bytes to the
   * filesystem (Node, browser, or sandbox — same code path), so the result
   * lands where Read/Edit and the rest of the tools can see it.
   */
  private buildImageTool(imageModel: any): Tool {
    return createGenerateImageTool(async ({ prompt, path, size, aspectRatio, n }) => {
      // generateImage is strongly typed (size is a `${n}x${n}` template); we
      // accept plain strings from the model, so build the args loosely.
      const genOpts: Record<string, unknown> = { model: imageModel, prompt }
      if (typeof n === 'number' && n > 0) genOpts.n = n
      if (size) genOpts.size = size
      if (aspectRatio) genOpts.aspectRatio = aspectRatio

      const result = await experimental_generateImage(genOpts as any)
      const images = result.images ?? []
      if (images.length === 0) {
        return 'No images were generated.'
      }

      const written: string[] = []
      for (let i = 0; i < images.length; i++) {
        const target = images.length > 1 ? indexedPath(path, i) : path
        await this.writeImageBytes(target, generatedFileToBytes(images[i]))
        written.push(target)
      }
      return `Generated ${images.length} image(s): ${written.join(', ')}`
    })
  }

  /** Whether a backend is available to persist generated image bytes. */
  private canWriteImages(): boolean {
    return !!this.fs || !!this.sandbox
  }

  /** Write raw image bytes to the active backend (fs or sandbox). */
  private async writeImageBytes(path: string, bytes: Uint8Array): Promise<void> {
    if (this.fs) {
      await this.fs.writeBytes(path, bytes)
    } else if (this.sandbox) {
      await this.sandbox.writeFiles([{ path, content: bytes }])
    } else {
      throw new Error('NanoCodana: no filesystem available to write generated image')
    }
  }

  /**
   * Persist images emitted *directly by a multimodal model* (i.e. in
   * `result.files`, not via the GenerateImage tool) to `imageOutputDir`. This
   * is the single-model image path: point `model` at a multimodal image model
   * and any images it returns are saved automatically. Always safe to call —
   * a no-op when there are no image files (e.g. a text-only model). Best-effort:
   * a write failure for one file never breaks the turn.
   */
  private async persistGeneratedImages(files: unknown): Promise<void> {
    if (!this.canWriteImages() || !Array.isArray(files) || files.length === 0) return
    for (const file of files as Array<{ mediaType?: string; uint8Array?: Uint8Array; base64?: string }>) {
      const mediaType = file?.mediaType
      if (!mediaType || !mediaType.startsWith('image/')) continue
      const ext = mediaType.split('/')[1] || 'png'
      const path = `${this.imageOutputDir}/image-${this.generatedImageSeq++}.${ext}`
      try {
        await this.writeImageBytes(path, generatedFileToBytes(file))
      } catch {
        // Best-effort: image persistence never breaks a turn.
      }
    }
  }

  /**
   * Build (or reuse from memory) the underlying ToolLoopAgent for this
   * interaction. Each compiled artifact has its own Memo keyed on its inputs;
   * unchanged inputs return the cached value, and because a downstream Memo
   * lists the upstream artifact's *built value* among its deps, a rebuild
   * cascades only as far as it must. On the first interaction everything is
   * built and cached; subsequent interactions rebuild only what changed.
   */
  private async getAgent(
    overrides: AgentOverrides,
  ): Promise<ToolLoopAgent<CALL_OPTIONS, TOOLS>> {
    // Effective inputs: per-call override, else the value from construction.
    const model = overrides.model ?? this.model
    const imageModel = overrides.imageModel ?? this.imageModel
    const toolMiddleware = overrides.toolMiddleware ?? this.toolMiddleware
    // Normalized to a boolean so `undefined` and an explicit `true` share one
    // memo entry (both prepare the identical model).
    const promptCaching = overrides.promptCaching ?? this.promptCaching ?? true
    const toolsInput = overrides.tools ?? this.configTools
    const skillsInput = overrides.skills ?? this.configSkills
    const skillDirs = overrides.skillDirs ?? this.skillDirs
    const systemPrompt = overrides.systemPrompt ?? this.customSystemPrompt
    const compact = overrides.compact ?? this.compact
    const policy = overrides.needsApproval ?? this.approvalPolicy
    const activeTools = overrides.activeTools
    const disableTools = overrides.disableTools
    const stopWhen = overrides.stopWhen ?? this.stopWhen

    // Custom tools (sync). Resolve a factory to a record once per distinct
    // input so it's a stable dep for the tool/prompt memos below.
    const customTools = this.memoCustomTools.get([toolsInput], () =>
      this.resolveCustomTools(toolsInput),
    )

    // Model (async). Re-prepares only when model/middleware change. The first
    // prepare may dynamic-import the parser middleware; later calls reuse it.
    const modelPromise = this.memoModel.get([model, toolMiddleware, promptCaching], () =>
      prepareModelForAgent({ model, toolMiddleware, promptCaching }),
    )

    // Skills (async). Re-resolves only when skills/dirs/fs change.
    const skillsPromise = this.memoSkills.get([skillsInput, skillDirs, this.fs], () =>
      this.resolveSkills(skillsInput, skillDirs),
    )

    const [preparedModel, skills] = await Promise.all([
      modelPromise,
      skillsPromise,
      this.connectMCP(),
    ])
    // Remember what this interaction used so the sync `tools` getter reflects it.
    this.lastResolvedSkills = skills
    this.lastCustomTools = customTools
    this.lastCustomToolsSet = true
    this.lastActiveTools = activeTools
    this.lastDisableTools = disableTools
    this.lastImageModel = imageModel

    // Tools (sync). Rebuild when custom tools, skills, the image model, approval
    // policy, compact, the per-turn tool gate, or the set of connected MCP tools
    // change.
    const tools = this.memoTools.get(
      [customTools, skills, imageModel, policy, compact, activeTools, disableTools, this.mcpTools],
      () => this.buildAgentTools(customTools, skills, policy, compact, imageModel, activeTools, disableTools),
    )

    // System prompt (sync). A user-supplied prompt is used verbatim; otherwise
    // the default is generated from the resolved (gated) tool set so it lists
    // exactly the tools the model can call this turn (including GenerateImage
    // when an image model is configured).
    const instructions = this.memoPrompt.get(
      [systemPrompt, customTools, skills, imageModel, compact, activeTools, disableTools],
      () =>
        systemPrompt ||
        buildDefaultSystemPrompt(
          this.buildToolDefs(customTools, skills, imageModel, activeTools, disableTools),
          compact,
        ),
    )

    // Underlying agent (sync). Rebuilt only when one of its built inputs
    // changed — the cascade above guarantees that's exactly when it must.
    return this.memoAgent.get(
      [preparedModel, instructions, tools, stopWhen],
      () =>
        new ToolLoopAgent<CALL_OPTIONS, TOOLS>({
          id: this.idValue,
          model: preparedModel,
          instructions,
          tools: tools as TOOLS,
          ...(stopWhen ? { stopWhen } : {}),
        }),
    )
  }

  /** Split per-call overrides out of the call options. */
  private splitOverrides<O extends AgentOverrides>(
    options: O,
  ): { overrides: AgentOverrides; rest: Omit<O, keyof AgentOverrides> } {
    const {
      model,
      imageModel,
      toolMiddleware,
      promptCaching,
      tools,
      skills,
      skillDirs,
      systemPrompt,
      compact,
      needsApproval,
      activeTools,
      disableTools,
      stopWhen,
      ...rest
    } = options
    return {
      overrides: {
        model,
        imageModel,
        toolMiddleware,
        promptCaching,
        tools,
        skills,
        skillDirs,
        systemPrompt,
        compact,
        needsApproval,
        activeTools,
        disableTools,
        stopWhen,
      },
      rest,
    }
  }

  async generate(
    options: AgentCallParameters<CALL_OPTIONS, TOOLS> & AgentOverrides,
  ): Promise<GenerateTextResult<TOOLS, never>> {
    const { overrides, rest } = this.splitOverrides(options)
    const agent = await this.getAgent(overrides)
    const result = await agent.generate(rest as AgentCallParameters<CALL_OPTIONS, TOOLS>)
    // Single-model image path: persist any images a multimodal model returned
    // directly (result.files). No-op for text-only models / tool-based gen.
    if (this.canWriteImages()) {
      await this.persistGeneratedImages((result as unknown as { files?: unknown }).files)
    }
    return result
  }

  async stream(
    options: AgentStreamParameters<CALL_OPTIONS, TOOLS> & AgentOverrides,
  ): Promise<StreamTextResult<TOOLS, never>> {
    const { overrides, rest } = this.splitOverrides(options)
    const agent = await this.getAgent(overrides)
    const result = await agent.stream(rest as AgentStreamParameters<CALL_OPTIONS, TOOLS>)
    // Single-model image path: when the stream finishes, persist any images a
    // multimodal model emitted directly (result.files resolves at the end).
    // Best-effort and fire-and-forget so we don't hold up the returned stream.
    if (this.canWriteImages()) {
      const filesPromise = (result as unknown as { files?: PromiseLike<unknown> }).files
      if (filesPromise && typeof filesPromise.then === 'function') {
        Promise.resolve(filesPromise)
          .then((files) => this.persistGeneratedImages(files))
          .catch(() => {})
      }
    }
    return result
  }

  async close(): Promise<void> {
    if (this.mcpManager) {
      await this.mcpManager.closeAll()
    }
  }

  private createFallbackFs(): IFileSystem {
    const fallback = new MemoryFileSystem()
    return fallback.rawFs
  }
}

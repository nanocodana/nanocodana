import {
  NanoCodana,
  type Tool,
  type MCPServerConfig,
  type Skill,
  type VirtualShellOptions
} from '@nanocodana/core/no-bash'
import { NodeFileSystem } from './storage/node-fs.js'
import {
  createNodeGlobTool,
  createNodeGrepTool,
  createNodeWebFetchTool,
  createNodeBashTool,
  createRipgrepTool,
  resolveRipgrepPath
} from './tools/index.js'

export interface NodeAgentConfig {
  model: any
  /**
   * Optional image-generation model (any AI SDK `ImageModel`). When set, a
   * `GenerateImage` tool is exposed that writes generated images to the working
   * directory. Image gen is a separate capability from `model`.
   */
  imageModel?: any
  /** Dir (under workingDirectory) where a multimodal model's direct image output is auto-saved. Default 'generated'. */
  imageOutputDir?: string
  toolMiddleware?: any | any[] | 'auto' | 'hermes' | 'morphXml'
  /** Automatic Anthropic prompt caching (default true) — see `NanoCodanaConfig['promptCaching']`. */
  promptCaching?: boolean
  workingDirectory?: string
  tools?: Record<string, Tool>
  mcpServers?: Record<string, MCPServerConfig>
  onFilesChange?: (changes: Array<{ path: string; content?: string }>) => void
  systemPrompt?: string
  compact?: boolean
  stopWhen?: any
  /** Tool names that must be approved before running (or a predicate). */
  needsApproval?: string[] | ((toolName: string) => boolean | undefined)
  /** Loadable skills (use loadSkillsFromDir/loadSkillsFromDirs to read them). */
  skills?: Skill[]
  /**
   * Directories scanned in the agent's filesystem to auto-discover skills.
   * Defaults to core's ['.agents/skills', '.claude/skills'] (project scope,
   * relative to workingDirectory). Pass [] to disable — e.g. the CLI does its
   * own loading across home + project + --skills with a defined precedence.
   */
  skillDirs?: string[]
  /**
   * Include the virtual Bash tool (just-bash) operating against the real
   * Node filesystem. Defaults to true. Pass an object to configure the shell —
   * see `VirtualShellOptions`.
   *
   * This adapter uses the full just-bash, so unlike core and the browser adapter
   * the native/wasm-backed commands are available: `sqlite3` works out of the
   * box, and `{ python: true }` / `{ javascript: true }` enable `python3` and
   * `js-exec`.
   */
  virtualBash?: boolean | VirtualShellOptions
  /**
   * Allow the Bash tool to escalate to the **real host shell** with
   * `host: true`. Defaults to **false**.
   *
   * Off, the agent is confined to the sandbox: an interpreter over the working
   * directory with no child processes and no access to system binaries. That is
   * the right default for anything running someone else's prompts — a server, a
   * hosted product, a CI job — where handing out a shell is not something to do
   * implicitly.
   *
   * On, `host: true` runs commands via `child_process` and always requires
   * approval through `needsApproval`. Appropriate for a local developer tool
   * operating on the user's own machine, which is why `codana` enables it.
   *
   * Note this is a *capability* gate, not an approval gate. With it off the
   * parameter is not offered to the model at all, and an explicit `host: true`
   * is refused rather than quietly downgraded to a sandbox run.
   */
  hostShell?: boolean
}

export function NodeAgent(config: NodeAgentConfig): NanoCodana {
  const workingDirectory = config.workingDirectory || process.cwd()
  const fs = new NodeFileSystem(workingDirectory, config.onFilesChange)

  // Create Node.js-specific tools on top of the shared core filesystem tools.
  // Bash here supersedes core's virtual Bash: it runs in the just-bash sandbox
  // by default and can escalate to the real host shell (host: true) with
  // approval — so we disable core's virtualBash below to avoid two Bash tools.
  // Grep ladder: ripgrep when a binary is resolvable (the @vscode/ripgrep
  // optionalDependency, else a system rg), the zero-dependency ignore-aware JS
  // search otherwise — a missing binary can only slow searches, never break
  // the agent. Force either via `tools: { Grep: ... }`.
  const rgPath = resolveRipgrepPath()

  const shellOptions =
    typeof config.virtualBash === 'object' && config.virtualBash !== null
      ? config.virtualBash
      : {}

  const nodeTools: Record<string, Tool> = {
    Glob: createNodeGlobTool(workingDirectory),
    Grep: rgPath
      ? createRipgrepTool(workingDirectory, rgPath)
      : createNodeGrepTool(workingDirectory),
    WebFetch: createNodeWebFetchTool()
  }

  // `virtualBash: false` now genuinely drops the tool. It previously only turned
  // off core's virtual Bash while this adapter added its own unconditionally, so
  // the option did nothing — contradicting its own documentation.
  if (config.virtualBash !== false) {
    nodeTools.Bash = createNodeBashTool(
      fs,
      workingDirectory,
      shellOptions,
      config.hostShell ?? false,
    )
  }

  // Merge built-in Node.js tools with custom tools
  const allTools = { ...nodeTools, ...config.tools }

  return new NanoCodana({
    model: config.model,
    imageModel: config.imageModel,
    imageOutputDir: config.imageOutputDir,
    toolMiddleware: config.toolMiddleware,
    promptCaching: config.promptCaching,
    fs: fs.rawFs,
    tools: allTools,
    mcpServers: config.mcpServers,
    systemPrompt: config.systemPrompt,
    compact: config.compact,
    stopWhen: config.stopWhen,
    needsApproval: config.needsApproval,
    skills: config.skills,
    skillDirs: config.skillDirs,
    // Always false: the node Bash tool above replaces core's virtual Bash, and
    // enabling both would load core's vendored shell for a tool that is then
    // immediately overridden.
    virtualBash: false,
  })
}

export { NodeFileSystem }
export { loadSkillsFromDir, loadSkillsFromDirs } from './skills.js'
export { createNodeGrepTool, createRipgrepTool, resolveRipgrepPath } from './tools/index.js'

// This adapter's own surface is expressed in core's types: NodeAgent returns a
// NanoCodana, and NodeAgentConfig above is built from Tool, MCPServerConfig,
// Skill and VirtualShellOptions. Re-exported so consumers can name them without
// taking a direct dependency on core — and, when they do, they get them through
// the /no-bash entry rather than the one that carries the 1.2 MB shell.
export { NanoCodana } from '@nanocodana/core/no-bash'
export type {
  Tool,
  MCPServerConfig,
  Skill,
  VirtualShellOptions,
  IFileSystem
} from '@nanocodana/core/no-bash'

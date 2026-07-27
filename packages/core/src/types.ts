import type { MCPServerConfig } from './mcp/types.js'
import type { IFileSystem } from './storage/in-memory-fs/interface.js'
import type { Skill } from './skills/skill-tool.js'

export type ToolMiddlewareMode = 'auto' | 'hermes' | 'morphXml'

/**
 * Content for a seeded file. Either an eager string, or a provider called on
 * first read (sync or async) so a large backing store can hydrate lazily
 * instead of loading every file up front — list the paths cheaply, fetch each
 * file's bytes only when the agent actually touches it. A write to the path
 * replaces the provider before it is ever called.
 *
 * Caveat: any operation that reads the whole tree (Glob/Grep, or LS over a
 * directory) materializes every lazy file it visits — so for search-heavy work
 * over a remote store, hydrate eagerly instead.
 */
export type InitialFileContent =
  | string
  | (() => string | Uint8Array | Promise<string | Uint8Array>)

/** One entry for `initialFiles`: a path and its (possibly lazy) content. */
export interface InitialFile {
  path: string
  content: InitialFileContent
}

export interface Tool {
  name: string
  description: string
  compactDescription?: string
  /**
   * A schema accepted by the AI SDK `tool()` helper. Pass either a zod
   * schema, a jsonSchema() output, or any FlexibleSchema-compatible value
   * (see ai-sdk/provider-utils types). Typed as `unknown` here so core
   * doesn't take a runtime dependency on any specific validator.
   */
  parameters: unknown
  needsApproval?: boolean | ((args: any) => Promise<boolean> | boolean)
  execute: (params: any) => Promise<any>
}

export interface SandboxCommandResult {
  stdout: () => Promise<string>
  stderr: () => Promise<string>
  exitCode?: number
}

export interface Sandbox {
  runCommand: (
    command: string,
    args: string[],
    options?: { signal?: AbortSignal }
  ) => Promise<SandboxCommandResult>
  writeFiles: (files: Array<{ path: string; content: Uint8Array }>) => Promise<void>
  readFileToBuffer?: (options: { path: string }) => Promise<Uint8Array | ArrayBuffer | null>
  readFile?: (
    options: { path: string }
  ) => Promise<ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer | null>
}

export type ToolContext =
  | { fs: IFileSystem }
  | { sandbox: Sandbox }

export interface NanoCodanaConfig {
  id?: string
  model: any
  /**
   * Optional image-generation model (any AI SDK `ImageModel`). When provided, a
   * `GenerateImage` tool is registered that the agent can call to generate images
   * and write them to the filesystem. Image generation is a separate capability
   * from the text `model`, so it takes its own model object. When unset, no
   * GenerateImage tool is exposed.
   */
  imageModel?: any
  /**
   * Directory (relative to the working dir / FS root) where images emitted by a
   * multimodal `model` directly (i.e. in `result.files`, not via the
   * GenerateImage tool) are auto-saved. Defaults to 'generated'. The
   * GenerateImage tool ignores this and uses the explicit `path` it's given.
   */
  imageOutputDir?: string
  toolMiddleware?: any | any[] | ToolMiddlewareMode
  /**
   * Automatic Anthropic prompt caching. Defaults to true. When the model is an
   * Anthropic provider instance (or a Claude model via OpenRouter), the agent
   * marks the system prompt + tool definitions and the conversation tail as
   * cacheable, so each loop step re-reads the growing history at ~0.1x the
   * input price instead of re-paying full price (roughly a 90% input-cost cut
   * on long sessions). No-op for other providers — OpenAI/Google/DeepSeek
   * cache automatically server-side.
   *
   * Detection covers provider INSTANCES only: gateway model strings
   * (`model: 'anthropic/claude-...'`) and Claude via Bedrock/Vertex are not
   * auto-detected — wrap those models with the exported
   * `promptCachingMiddleware` yourself if the route forwards Anthropic
   * provider options. Set false to manage `cacheControl` yourself; prompts or
   * tools that already carry a manual breakpoint (anthropic or openrouter
   * namespace) are left untouched either way.
   */
  promptCaching?: boolean
  fs?: IFileSystem
  tools?: Record<string, Tool> | ((context: ToolContext) => Record<string, Tool>)
  mcpServers?: Record<string, MCPServerConfig>
  systemPrompt?: string
  initialFiles?: InitialFile[]
  onFilesChange?: (changes: Array<{ path: string; content?: string }>) => void
  compact?: boolean
  stopWhen?: any
  sandbox?: Sandbox
  /**
   * Approval policy applied when building the tool set. Either a list of tool
   * NAMES that must be approved before running (forcing needsApproval=true for
   * those, overriding their own default), or a predicate returning true/false
   * to force a decision or undefined to defer to the tool's own setting.
   * Read-only tools are typically omitted. When unset, each tool's own
   * needsApproval is used unchanged.
   */
  needsApproval?: string[] | ((toolName: string) => boolean | undefined)
  /**
   * Loadable skills (Anthropic Agent Skills). When provided, a `Skill` tool is
   * registered whose description lists them; the model loads one by name to
   * pull its full instructions into context on demand.
   */
  skills?: Skill[]
  /**
   * Directories scanned in the agent's OWN filesystem to auto-discover skills,
   * the same on every platform. Defaults to ['.agents/skills', '.claude/skills'].
   * On Node these are real files under the working directory; in the browser
   * they're entries seeded into the in-memory / IndexedDB FS via initialFiles.
   * Discovered skills merge with `skills` (config wins on name collisions).
   * Pass [] to disable filesystem discovery entirely.
   */
  skillDirs?: string[]
  /**
   * Whether to include the in-memory virtual Bash tool (powered by just-bash).
   * Defaults to true for backward compatibility.
   *
   * Set to false in apps that don't need shell access. When false, the Bash tool
   * is not registered and the shell chunk is never *fetched* — the dynamic import
   * in Bash.execute is the only reference. With a code-splitting bundler
   * (webpack, Vite, Next.js) that saves the shell on initial paint.
   *
   * It does NOT shrink single-file bundles: no bundler can eliminate a reachable
   * dynamic import based on a runtime flag, so an esbuild/Workers build contains
   * the shell either way (verified — byte-identical output).
   *
   * Pass an object to configure the shell instead of just enabling it:
   *
   *   virtualBash: { env: { CI: '1' }, maxCommandCount: 500 }
   *
   * Note: this only controls the *virtual* Bash. The sandbox-backed Bash tool
   * (when a Sandbox is provided) is unaffected.
   */
  virtualBash?: boolean | VirtualShellOptions
}

/**
 * Configuration forwarded to the virtual shell (just-bash's `BashOptions`).
 *
 * Availability differs by package, because the shell build differs:
 *
 * - `@nanocodana/core` and `@nanocodana/browser` ship a **Node-free** build.
 *   Commands needing native or wasm backends — `sqlite3`, `python3`, `js-exec`,
 *   `tar`, `yq`, `xan` — are unavailable there regardless of these options, and
 *   `gzip`/`gunzip`/`zcat`/`rg -z` work — the vendored build supplies its own
 *   compression rather than node:zlib.
 * - `@nanocodana/nodejs` uses the full just-bash, where all of the above work.
 *
 * Options are passed through as given, so anything just-bash supports is
 * reachable even if it isn't named here.
 */
export interface VirtualShellOptions {
  /** Environment variables visible to the shell. */
  env?: Record<string, string>
  /**
   * Restrict the shell to these commands. Note this is a *runtime* filter — it
   * does not make the bundle smaller, since every command is still reachable.
   */
  commands?: string[]
  /** Enable `python3`/`python`. Requires the full just-bash (Node only). */
  python?: boolean
  /** Enable `js-exec`, sandboxed JS via QuickJS. Requires the full just-bash. */
  javascript?: boolean | Record<string, unknown>
  /** Enable `curl`/`wget`. Without this (or `fetch`), network commands are absent. */
  network?: Record<string, unknown>
  /** Supply the fetch used by network commands. Also enables them. */
  fetch?: typeof globalThis.fetch
  /** Resource ceilings for a single `exec` (output size, live bytes, timeouts). */
  executionLimits?: Record<string, unknown>
  /** Named preset for the above. */
  executionLimitProfile?: string
  /** Max nesting depth for function calls and subshells. */
  maxCallDepth?: number
  /** Max commands executed in a single `exec`. */
  maxCommandCount?: number
  /** Max iterations per loop. */
  maxLoopIterations?: number
  /** Extra commands, defined with just-bash's `defineCommand`. */
  customCommands?: unknown[]
  /** Sandbox hardening. Leave at the default unless you know why you're changing it. */
  defenseInDepth?: boolean | Record<string, unknown>
  /** Values reported by `$$`, `$PPID`, `id`, etc. */
  processInfo?: { pid?: number; ppid?: number; uid?: number; gid?: number }
  /**
   * Anything else just-bash accepts, without core having to restate its option
   * types on every release.
   *
   * ⚠️ The cost is that this signature accepts *any* key, so a misspelled option
   * type-checks and is then silently ignored — `{ pyton: true }` compiles, and
   * `python3` stays off with no error at construction or at call time. If an
   * option appears to do nothing, check its spelling against just-bash's
   * `BashOptions` first. The named fields above are the ones core has verified;
   * they are the safe set.
   */
  [option: string]: unknown
}

/**
 * Per-interaction overrides that can be passed to generate()/stream() to change
 * what the agent compiles, without constructing a new agent. Any field left
 * undefined falls back to the value supplied at construction. The agent caches
 * each compiled artifact (prepared model, resolved skills, tools, system
 * prompt, underlying agent) and rebuilds ONLY the parts whose inputs changed
 * since the previous interaction — unchanged parts are reused from memory.
 */
export interface AgentOverrides {
  /** Swap the model. Re-prepares the model (and re-wraps the underlying agent). */
  model?: NanoCodanaConfig['model']
  /**
   * Swap (or enable/disable) the image-generation model for this turn. Set to a
   * model to expose the `GenerateImage` tool; the tool set + prompt rebuild to
   * include it. Omit to reuse the construction default. Pass a stable reference
   * across turns to reuse from memory.
   */
  imageModel?: NanoCodanaConfig['imageModel']
  /** Change tool middleware (affects model preparation). */
  toolMiddleware?: NanoCodanaConfig['toolMiddleware']
  /** Toggle automatic Anthropic prompt caching (affects model preparation). */
  promptCaching?: NanoCodanaConfig['promptCaching']
  /**
   * Replace the custom tool set (a record or a factory over the tool context).
   * Rebuilds tools + prompt. Built-in default tools, the Skill tool, and
   * TodoWrite are always present; this overrides only the *custom* tools. Pass
   * a stable reference (or factory) for unchanged turns to reuse from memory —
   * a fresh record each call rebuilds every turn.
   */
  tools?: NanoCodanaConfig['tools']
  /** Replace the explicit skill set. Re-resolves skills + rebuilds tools/prompt. */
  skills?: Skill[]
  /** Change the directories scanned for skills. Re-resolves skills. */
  skillDirs?: string[]
  /** Override the system prompt. Pass '' to fall back to the generated default. */
  systemPrompt?: string
  /** Toggle compact tool descriptions + prompt. Rebuilds tools/prompt. */
  compact?: boolean
  /** Change the approval policy. Rebuilds tools. */
  needsApproval?: NanoCodanaConfig['needsApproval']
  /**
   * Per-turn capability gate (allow-list): the tool NAMES the agent may use
   * this interaction. When set, ONLY these tools are exposed — anything not
   * listed is dropped from both the tool set and the generated system prompt.
   * Applied before `disableTools`. Built-in, custom, Skill, and MCP tools are
   * all eligible. Omit for no allow-list (all tools available). Rebuilds tools
   * + prompt. Pass a stable array across turns to reuse from memory.
   */
  activeTools?: string[]
  /**
   * Per-turn capability gate (deny-list): tool NAMES the agent may NOT use this
   * interaction (e.g. ['Bash']). The named tools are dropped from both the tool
   * set and the generated system prompt, so the model neither sees nor can call
   * them this turn. Applied AFTER `activeTools`. Built-in, custom, Skill, and
   * MCP tools are all eligible. Omit (or pass []) for no gate. Rebuilds tools +
   * prompt. Pass a stable array across turns to reuse from memory.
   */
  disableTools?: string[]
  /** Change the loop stop condition. Rebuilds the underlying agent only. */
  stopWhen?: NanoCodanaConfig['stopWhen']
}

export interface PrepareModelOptions {
  model: any
  toolMiddleware?: any | any[] | ToolMiddlewareMode
  /** Automatic Anthropic prompt caching. Defaults to true. */
  promptCaching?: boolean
}

import {
  NanoCodana,
} from '@nanocodana/core'
import type {
  IFileSystem,
  InitialFile,
  MCPServerConfig,
  Skill,
  VirtualShellOptions
} from '@nanocodana/core'
import { IndexedDBFileSystem } from './storage/indexeddb-fs.js'

export interface BrowserAgentConfig {
  model: any
  /**
   * Optional image-generation model (any AI SDK `ImageModel`). When set, a
   * `GenerateImage` tool is exposed that writes generated images into the
   * in-browser filesystem. Image gen is a separate capability from `model`.
   */
  imageModel?: any
  /** Dir where a multimodal model's direct image output is auto-saved. Default 'generated'. */
  imageOutputDir?: string
  toolMiddleware?: any | any[] | 'auto' | 'hermes' | 'morphXml'
  /** Automatic Anthropic prompt caching (default true) — see `NanoCodanaConfig['promptCaching']`. */
  promptCaching?: boolean
  persist?: boolean // Default: true. Use IndexedDB for persistence, false for in-memory only
  persistKey?: string
  /**
   * Provide an existing RAW filesystem (IFileSystem, e.g. an
   * IndexedDBFileSystem or in-memory fs) to back the agent, instead of
   * letting BrowserAgent create one. Note: this is the raw backend — do NOT
   * pass another agent's `agent.fs` (that is a ToolFileSystem wrapper, not
   * an IFileSystem). When set, the caller owns seeding —
   * `initialFiles`/`persist`/`persistKey` are ignored (a warning is logged
   * if they are also supplied).
   */
  fs?: IFileSystem
  tools?: Record<string, any>
  systemPrompt?: string
  /**
   * Seed files. `content` may be a string, or a provider called on first read
   * (sync or async) to hydrate lazily from a store — see `InitialFileContent`.
   * With `persist: true`, lazy providers are resolved once while seeding the
   * IndexedDB store (which is itself the durable copy).
   */
  initialFiles?: InitialFile[]
  onFilesChange?: (changes: Array<{ path: string; content?: string }>) => void
  mcpServers?: Record<string, MCPServerConfig>
  compact?: boolean // Use compact system prompt and tool descriptions to reduce token usage
  stopWhen?: any
  /** Tool names that must be approved before running (or a predicate). */
  needsApproval?: string[] | ((toolName: string) => boolean | undefined)
  /**
   * Skills are auto-discovered from this agent's OWN filesystem at the
   * conventional dirs (.agents/skills, .claude/skills) — exactly like Node.
   * Just seed them through `initialFiles`, e.g.
   *   { path: '.agents/skills/csv/SKILL.md', content: '---\nname: csv\n...' }
   * and the agent registers a `Skill` tool automatically. No loader call.
   *
   * `skills` here is for *additional* bundled/fetched skills (objects, not
   * files); they merge with discovered ones and win on name collisions.
   */
  skills?: Skill[]
  /**
   * Override the directories scanned for skills in the agent's filesystem.
   * Defaults to ['.agents/skills', '.claude/skills']. Pass [] to disable.
   */
  skillDirs?: string[]
  /**
   * Include the in-memory virtual Bash tool. Defaults to true. Set false to drop
   * the shell from the bundle in apps that don't need it, or pass an object to
   * configure it — see `VirtualShellOptions`.
   *
   * The shell here is core's Node-free build, so commands needing native or wasm
   * backends (`sqlite3`, `python3`, `js-exec`, `tar`) are unavailable, and
   * `gzip`/`gunzip`/`zcat` work — the vendored build supplies its own
   * compression rather than node:zlib. Everything else works in the tab.
   */
  virtualBash?: boolean | VirtualShellOptions
}

export function BrowserAgent(config: BrowserAgentConfig): NanoCodana {
  const persist = config.persist ?? true

  // Everything except the filesystem wiring is identical across the three
  // modes — build it once so a new config option can't silently apply to only
  // some of them.
  const base = {
    model: config.model,
    imageModel: config.imageModel,
    imageOutputDir: config.imageOutputDir,
    toolMiddleware: config.toolMiddleware,
    promptCaching: config.promptCaching,
    tools: config.tools,
    systemPrompt: config.systemPrompt,
    onFilesChange: config.onFilesChange,
    mcpServers: config.mcpServers,
    compact: config.compact,
    stopWhen: config.stopWhen,
    needsApproval: config.needsApproval,
    skills: config.skills,
    skillDirs: config.skillDirs,
    virtualBash: config.virtualBash,
  }

  // Caller-supplied filesystem: use the exact instance so the app and the agent
  // share one coherent store. The caller is responsible for seeding it.
  if (config.fs) {
    if (config.initialFiles || config.persistKey || config.persist !== undefined) {
      console.warn(
        '[nanocodana] BrowserAgent: `fs` was provided, so `initialFiles`/`persist`/`persistKey` are ignored. Seed the filesystem you pass in (IndexedDBFileSystem accepts { initialFiles }).'
      )
    }
    return new NanoCodana({ ...base, fs: config.fs })
  }

  if (persist) {
    // One shared IndexedDBFileSystem per persistKey (see getBrowserFs): agents
    // rebuilt over the same key reuse the same instance, so a write made
    // through an old agent is never invisible to a new one via a stale
    // per-instance cache. initialFiles seed inside the fs's ready gate: every
    // operation awaits readiness, so the agent can never observe a
    // half-seeded store.
    const fs = getBrowserFs(config.persistKey || 'nanocodana-fs', {
      initialFiles: config.initialFiles,
    })
    return new NanoCodana({ ...base, fs })
  }

  // Use core's default in-memory filesystem and tools
  return new NanoCodana({ ...base, initialFiles: config.initialFiles })
}

// One live IndexedDBFileSystem per database name. Two instances over the same
// DB each keep a private in-memory cache that never learns about the other's
// writes, so every consumer (agents across rebuilds, app-side reads/clears)
// must share the instance to stay coherent.
const browserFsCache = new Map<string, IndexedDBFileSystem>()

/**
 * The shared IndexedDBFileSystem for a persist key. BrowserAgent uses this
 * internally; apps should use it too for any direct store access (hydration
 * reads, clearing a project) instead of constructing their own instance —
 * `new IndexedDBFileSystem(key)` creates a second cache over the same DB that
 * can serve stale reads. `options.initialFiles` applies only on first
 * construction (and only seeds an empty store).
 */
export function getBrowserFs(
  persistKey: string = 'nanocodana-fs',
  options?: { initialFiles?: ReadonlyArray<InitialFile> }
): IndexedDBFileSystem {
  let fs = browserFsCache.get(persistKey)
  if (!fs) {
    fs = new IndexedDBFileSystem(persistKey, options)
    browserFsCache.set(persistKey, fs)
  }
  return fs
}

export { IndexedDBFileSystem }
// Re-export the FS-agnostic skill loader so browser apps can discover skills
// from their own IFileSystem (IndexedDB / in-memory), the same way Node does.
export { loadSkills, loadSkillsFrom } from '@nanocodana/core'

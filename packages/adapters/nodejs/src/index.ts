import { NanoCodana, type Tool, type MCPServerConfig, type Skill } from '@nanocodana/core'
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
   * Node filesystem. Defaults to true.
   */
  virtualBash?: boolean
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

  const nodeTools: Record<string, Tool> = {
    Bash: createNodeBashTool(fs, workingDirectory),
    Glob: createNodeGlobTool(workingDirectory),
    Grep: rgPath
      ? createRipgrepTool(workingDirectory, rgPath)
      : createNodeGrepTool(workingDirectory),
    WebFetch: createNodeWebFetchTool()
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
    // The node Bash tool replaces the core virtual Bash.
    virtualBash: config.virtualBash ?? false,
  })
}

export { NodeFileSystem }
export { loadSkillsFromDir, loadSkillsFromDirs } from './skills.js'
export { createNodeGrepTool, createRipgrepTool, resolveRipgrepPath } from './tools/index.js'

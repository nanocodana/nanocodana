// MCPClientManager is intentionally a type-only re-export here. Its
// implementation lives in client-manager.js, which is dynamic-imported
// from agent.ts (see connectMCP). Re-exporting the value here would create
// a second, static path that defeats the code-split. Bundlers like
// Vite/rolldown surface this as an INEFFECTIVE_DYNAMIC_IMPORT warning.
export type { MCPClientManager } from './client-manager.js'
export { parseMCPConfig } from './config-loader.js'
export type { MCPServerConfig, MCPConfig } from './types.js'

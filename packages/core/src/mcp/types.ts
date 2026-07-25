export interface MCPServerConfig {
  transport: 'stdio' | 'http' | 'sse'

  // For stdio transport
  command?: string
  args?: string[]
  env?: Record<string, string>

  // For http/sse transport
  url?: string
  headers?: Record<string, string>
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}

import type { MCPConfig, MCPServerConfig } from './types.js'

/**
 * Load MCP configuration from a JSON string
 */
export function parseMCPConfig(jsonContent: string): Record<string, MCPServerConfig> {
  try {
    const config: MCPConfig = JSON.parse(jsonContent)

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('Invalid .mcp.json format: missing "mcpServers" object')
    }

    // Validate each server config
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      if (!serverConfig.transport) {
        throw new Error(`MCP server "${name}": missing "transport" field`)
      }

      if (!['stdio', 'http', 'sse'].includes(serverConfig.transport)) {
        throw new Error(`MCP server "${name}": invalid transport "${serverConfig.transport}"`)
      }

      if (serverConfig.transport === 'stdio') {
        if (!serverConfig.command) {
          throw new Error(`MCP server "${name}": stdio transport requires "command" field`)
        }
        if (!serverConfig.args) {
          throw new Error(`MCP server "${name}": stdio transport requires "args" field`)
        }
      } else {
        if (!serverConfig.url) {
          throw new Error(`MCP server "${name}": ${serverConfig.transport} transport requires "url" field`)
        }
      }
    }

    return config.mcpServers
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse MCP config: ${error.message}`)
    }
    throw error
  }
}

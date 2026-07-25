import { createMCPClient } from '@ai-sdk/mcp'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { MCPServerConfig } from './types.js'

interface MCPClientInfo {
  name: string
  client: any // MCP client from createMCPClient
  transport: Transport
}

/**
 * MCP Client Manager
 * Handles connecting to MCP servers and getting their tools
 */
export class MCPClientManager {
  private clients: Map<string, MCPClientInfo> = new Map()

  /**
   * Connect to MCP servers and return all available tools
   */
  async connectServers(
    serverConfigs: Record<string, MCPServerConfig>
  ): Promise<Record<string, any>> {
    const allTools: Record<string, any> = {}

    for (const [serverName, config] of Object.entries(serverConfigs)) {
      try {
        const tools = await this.connectServer(serverName, config)
        Object.assign(allTools, tools)
      } catch (error) {
        console.error(`Failed to connect to MCP server "${serverName}":`, error)
        // Continue with other servers even if one fails
      }
    }

    return allTools
  }

  /**
   * Connect to a single MCP server
   */
  private async connectServer(
    serverName: string,
    config: MCPServerConfig
  ): Promise<Record<string, any>> {
    // Create transport based on config
    const transport = await this.createTransport(config)

    // Create MCP client using Vercel AI SDK
    const client = await createMCPClient({ transport })

    // Store client info
    this.clients.set(serverName, {
      name: serverName,
      client,
      transport
    })

    // Get tools from MCP server (already in AI SDK format)
    const mcpTools = await client.tools()

    // Prefix tool names with server name: mcp_<servername>_<toolname>
    const tools: Record<string, any> = {}
    for (const [toolName, mcpTool] of Object.entries(mcpTools)) {
      const prefixedName = `mcp_${serverName}_${toolName}`
      tools[prefixedName] = mcpTool
    }

    return tools
  }

  /**
   * Create transport based on config
   */
  private async createTransport(config: MCPServerConfig): Promise<Transport> {
    switch (config.transport) {
      case 'stdio':
        // Disabled for now because exposing stdio transport from core causes
        // browser bundlers to follow Node-only MCP code paths.
        /*
        if (!config.command || !config.args) {
          throw new Error('stdio transport requires command and args')
        }
        try {
          const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
          return new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env
          })
        } catch (e) {
          throw new Error('stdio transport requires Node.js environment and is not available in the browser')
        }
        */
        throw new Error('stdio transport is temporarily disabled in core')

      case 'sse':
        if (!config.url) {
          throw new Error('sse transport requires url')
        }
        // TODO: Add header support when MCP SDK supports it
        return new SSEClientTransport(new URL(config.url))

      case 'http':
        if (!config.url) {
          throw new Error('http transport requires url')
        }
        // TODO: Add header support when MCP SDK supports it
        return new StreamableHTTPClientTransport(new URL(config.url))

      default:
        throw new Error(`Unknown transport: ${(config as any).transport}`)
    }
  }

  /**
   * Close all MCP clients
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.clients.values()).map(({ client }) =>
      client.close().catch((err: any) => {
        console.error('Error closing MCP client:', err)
      })
    )

    await Promise.all(closePromises)
    this.clients.clear()
  }

  /**
   * Close a specific MCP client
   */
  async close(serverName: string): Promise<void> {
    const clientInfo = this.clients.get(serverName)
    if (clientInfo) {
      await clientInfo.client.close()
      this.clients.delete(serverName)
    }
  }
}

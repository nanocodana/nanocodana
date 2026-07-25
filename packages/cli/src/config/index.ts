import Conf from 'conf'
import type { MCPServerConfig } from '@nanocodana/core'
import { getProvider } from '../providers.js'

export interface StoredSession {
  messages: any[]
  updatedAt: number
}

export interface CLIConfig {
  /** Legacy single Anthropic key (still honored as a fallback). */
  apiKey?: string
  model?: string
  /** Selected provider id (anthropic | openai | custom). */
  provider?: string
  /** Per-provider API keys. */
  apiKeys?: Record<string, string>
  /** Base URL for the OpenAI-compatible (custom) provider. */
  baseUrl?: string
  mcpServers?: Record<string, MCPServerConfig>
  /** Last conversation per working directory, for --continue. */
  sessions?: Record<string, StoredSession>
}

const config = new Conf<CLIConfig>({
  projectName: 'nanocodana',
  defaults: {
    model: 'claude-sonnet-4-5'
  }
})

export function setModel(model: string): void {
  config.set('model', model)
}

export function getModel(): string {
  return config.get('model') || getProvider(getProviderId()).defaultModel
}

// --- Provider selection + per-provider keys ---

export function getProviderId(): string {
  return config.get('provider') || 'anthropic'
}

export function setProviderId(id: string): void {
  config.set('provider', id)
}

export function setApiKeyFor(providerId: string, key: string): void {
  const keys = config.get('apiKeys') || {}
  keys[providerId] = key
  config.set('apiKeys', keys)
}

/**
 * Resolve a provider's API key: stored per-provider key → that provider's env
 * var → the legacy single key (Anthropic only) → process env as a last resort.
 */
export function resolveApiKey(providerId: string): string | undefined {
  const keys = config.get('apiKeys') || {}
  if (keys[providerId]) return keys[providerId]
  const provider = getProvider(providerId)
  if (provider.envVar && process.env[provider.envVar]) return process.env[provider.envVar]
  if (providerId === 'anthropic') return config.get('apiKey') || process.env.ANTHROPIC_API_KEY
  return undefined
}

export function setBaseUrl(url: string): void {
  config.set('baseUrl', url)
}

export function getBaseUrl(): string | undefined {
  return config.get('baseUrl')
}

export function setMCPServers(servers: Record<string, MCPServerConfig>): void {
  config.set('mcpServers', servers)
}

export function getMCPServers(): Record<string, MCPServerConfig> {
  return config.get('mcpServers') || {}
}

export function addMCPServer(name: string, server: MCPServerConfig): void {
  const servers = getMCPServers()
  servers[name] = server
  setMCPServers(servers)
}

export function removeMCPServer(name: string): void {
  const servers = getMCPServers()
  delete servers[name]
  setMCPServers(servers)
}

export function clearConfig(): void {
  config.clear()
}

export function getConfigPath(): string {
  return config.path
}

// --- Session persistence (keyed by working directory) ---

function sessionKey(): string {
  return process.cwd()
}

export function saveSession(messages: any[]): void {
  const sessions = config.get('sessions') || {}
  sessions[sessionKey()] = { messages, updatedAt: Date.now() }
  config.set('sessions', sessions)
}

export function loadSession(): StoredSession | null {
  const sessions = config.get('sessions') || {}
  return sessions[sessionKey()] ?? null
}

export function clearSession(): void {
  const sessions = config.get('sessions') || {}
  delete sessions[sessionKey()]
  config.set('sessions', sessions)
}

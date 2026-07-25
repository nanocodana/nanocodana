/**
 * Provider registry for the CLI.
 *
 * Anthropic and OpenAI are first-class (native AI SDK providers). Everything
 * else is reached through a single OpenAI-compatible provider — most vendors
 * (OpenRouter, DeepSeek, Together, Groq, xAI, Fireworks) and local servers
 * (Ollama, LM Studio) expose an OpenAI-compatible endpoint, so a base URL +
 * key + model id covers them all.
 */

export type ProviderKind = 'anthropic' | 'openai' | 'openai-compatible'

export interface CliModel {
  id: string
  name: string
  recommended?: boolean
}

export interface CliProvider {
  id: string
  name: string
  kind: ProviderKind
  /** Env var consulted for the API key when none is stored in config. */
  envVar?: string
  /** OpenAI-compatible providers need a base URL. */
  requiresBaseUrl?: boolean
  /** Default API endpoint. Shown as the placeholder in the base-URL prompt;
   *  for native providers, left blank means "use the SDK default". */
  defaultBaseUrl?: string
  defaultModel: string
  /** Suggested models (free-form ids are also allowed). */
  models: CliModel[]
  /** Example base URLs shown for the custom provider. */
  examples?: string[]
}

export const PROVIDERS: Record<string, CliProvider> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', recommended: true },
      { id: 'claude-opus-4-1', name: 'Claude 4.1 Opus' },
      { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-haiku-4-5', name: 'Claude 4.5 Haiku' },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    envVar: 'OPENAI_API_KEY',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', recommended: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
      { id: 'o3-mini', name: 'o3-mini' },
      { id: 'o1', name: 'o1' },
    ],
  },
  custom: {
    id: 'custom',
    name: 'OpenAI-compatible',
    kind: 'openai-compatible',
    envVar: 'OPENAI_COMPATIBLE_API_KEY',
    requiresBaseUrl: true,
    defaultModel: '',
    models: [],
    examples: [
      'OpenRouter   https://openrouter.ai/api/v1',
      'DeepSeek     https://api.deepseek.com',
      'Together     https://api.together.xyz/v1',
      'Groq         https://api.groq.com/openai/v1',
      'xAI          https://api.x.ai/v1',
      'Ollama       http://localhost:11434/v1',
      'LM Studio    http://localhost:1234/v1',
    ],
  },
}

export function getProvider(id: string | undefined): CliProvider {
  return (id && PROVIDERS[id]) || PROVIDERS.anthropic
}

export function providerIds(): string[] {
  return Object.keys(PROVIDERS)
}

/** Native providers need an API key up front; OpenAI-compatible ones don't
 *  (the key may be optional for local servers and is sent through as-is). */
export function requiresApiKey(provider: CliProvider): boolean {
  return provider.kind !== 'openai-compatible'
}

/** Providers offered in the interactive /model and /provider picker, OpenAI
 *  first. The custom OpenAI-compatible provider is included now that the flow
 *  asks for a base URL. */
export function getSelectableProviders(): CliProvider[] {
  return Object.values(PROVIDERS).sort((a, b) =>
    a.id === 'openai' ? -1 : b.id === 'openai' ? 1 : 0,
  )
}

/**
 * Validate that a provider is usable, returning a human-readable error message
 * or null. Shared by CLI startup (prints + exits) and the chat runtime (shows
 * a system message) so the rules and wording live in one place.
 */
export function validateSetup(
  provider: CliProvider,
  opts: { apiKey?: string; baseUrl?: string; model?: string },
): string | null {
  if (!opts.model) {
    return `No model set for ${provider.name}. Use /model <id> (or pass --model).`
  }
  if (requiresApiKey(provider) && !opts.apiKey) {
    return `No API key for ${provider.name}. Set it: codana config --provider ${provider.id} --api-key <key>${provider.envVar ? ` (or export ${provider.envVar})` : ''}`
  }
  if (provider.requiresBaseUrl && !opts.baseUrl) {
    return `${provider.name} needs a base URL. Set it: codana config --provider ${provider.id} --base-url <url>`
  }
  return null
}

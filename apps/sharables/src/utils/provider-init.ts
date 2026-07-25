import { type LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createXai } from '@ai-sdk/xai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createTogetherAI } from '@ai-sdk/togetherai'
import { createAIMLAPI } from '@ai-ml.api/aimlapi-vercel-ai'
import { createHuggingFace } from '@ai-sdk/huggingface'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOllama } from 'ollama-ai-provider'
import { webLLM } from '@browser-ai/web-llm'
import { getProviderById, getApiKeyPolicy } from '../config/providers'

/** Whether a provider's key is required, via the shared policy (unknown → required). */
function providerRequiresApiKey(providerId?: string): boolean {
  const provider = providerId ? getProviderById(providerId) : undefined
  return provider ? getApiKeyPolicy(provider) === 'required' : true
}

/**
 * Normalize a user-edited Ollama host so appending an API path can't produce
 * `//`, `/v1/v1`, or `/api/v1`: trims, drops trailing slashes, and strips an
 * already-present /v1 or /api suffix.
 */
function normalizeOllamaHost(url: string | undefined, fallback: string): string {
  return (url || fallback)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(v1|api)$/, '')
}

/**
 * Probe the Ollama daemon before wiring a model to it, so opaque network/CORS
 * failures become actionable errors. The daemon's default OLLAMA_ORIGINS only
 * allows localhost origins — when this app is served from anywhere else, the
 * fix is on the Ollama side, so say so.
 */
async function assertOllamaReachable(host: string): Promise<void> {
  try {
    const res = await fetch(`${host}/api/tags`)
    if (!res.ok) throw new Error(`status ${res.status}`)
  } catch {
    let message = `Cannot reach Ollama at ${host}. Make sure Ollama is running (ollama serve) and signed in (ollama signin).`
    if (typeof window !== 'undefined') {
      const { hostname, origin } = window.location
      if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
        message += ` This app is served from ${origin}, which Ollama blocks by default — start Ollama with OLLAMA_ORIGINS=${origin} (or "*") to allow it.`
      }
    }
    throw new Error(message)
  }
}

export interface ProviderInitConfig {
  providerId: string
  apiKey?: string
  modelId: string
  customUrl?: string
}

// To support both strict modern providers (OpenAI, Anthropic) and exotic 
// Web providers (web-llm, ollama) we use an intersect type that suppresses 
// TS errors but ensures the downstream Core Provider treats it correctly
export interface InitResult {
  model: LanguageModel | any
  modelId: string
  toolMiddleware?: 'auto'
}

/**
 * Initialize a cloud provider
 */
export async function initializeCloudProvider(config: ProviderInitConfig): Promise<InitResult> {
  const { providerId, apiKey, modelId } = config

  if (!apiKey && providerRequiresApiKey(providerId)) {
    throw new Error(`API key is required for ${providerId}`)
  }

  let provider: (base: string) => LanguageModel | any
  let toolMiddleware: 'auto' | undefined

  switch (providerId) {
    case 'anthropic':
      provider = createAnthropic({
        apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
      })
      break

    case 'openai':
      provider = createOpenAI({ apiKey })
      if (modelId.startsWith('o1-')) {
        toolMiddleware = 'auto'
      }
      break

    case 'google':
      provider = createGoogleGenerativeAI({ apiKey })
      break

    case 'xai':
      provider = createXai({ apiKey })
      break

    case 'openrouter':
    case 'openrouter-free':
      provider = createOpenRouter({ apiKey })
      break

    case 'together':
      provider = createTogetherAI({ apiKey })
      break

    case 'aimlapi':
      provider = createAIMLAPI({ apiKey })
      break

    case 'huggingface':
      provider = createHuggingFace({ apiKey })
      break

    case 'deepseek':
      provider = createDeepSeek({ apiKey })
      break

    case 'ollama-cloud': {
      // ollama.com can't be reached from a browser (no CORS headers). Instead
      // route through the user's LOCAL Ollama daemon, which serves cloud models
      // when signed in (`ollama signin`) and is browser-reachable on localhost.
      const host = normalizeOllamaHost(
        config.customUrl,
        getProviderById(providerId)?.defaultUrl ?? 'http://localhost:11434'
      )
      await assertOllamaReachable(host)
      provider = createOpenAICompatible({
        name: 'ollama-cloud',
        apiKey,
        baseURL: `${host}/v1`
      })
      break
    }

    default: {
      // Any provider declaring an OpenAI-compatible base URL in its config
      // (e.g. zai, nanogpt) works generically — no bespoke arm needed.
      const compatBaseURL = getProviderById(providerId)?.openAICompatibleBaseURL
      if (!compatBaseURL) {
        throw new Error(`Unknown provider: ${providerId}`)
      }
      provider = createOpenAICompatible({
        name: providerId,
        apiKey,
        baseURL: compatBaseURL
      })
      break
    }
  }

  const model = provider(modelId)

  return { model, modelId, toolMiddleware }
}

/**
 * Initialize a local engine
 */
export async function initializeLocalEngine(config: ProviderInitConfig): Promise<InitResult> {
  const { providerId, modelId, customUrl } = config

  let model: LanguageModel | any
  let toolMiddleware: 'auto' | undefined = 'auto'

  switch (providerId) {
    case 'ollama': {
      const host = normalizeOllamaHost(customUrl, 'http://localhost:11434')

      // Test connection first
      try {
        await fetch(`${host}/api/tags`)
      } catch {
        throw new Error(`Cannot connect to Ollama at ${host}. Make sure Ollama is running with: ollama serve`)
      }

      // Build the provider against the same host so model traffic honors the
      // configured Server URL (the default `ollama` instance is hardwired to
      // 127.0.0.1:11434).
      model = createOllama({ baseURL: `${host}/api` })(modelId)
      break
    }

    case 'lmstudio': {
      const baseURL = customUrl || 'http://localhost:1234/v1'

      // Test connection
      try {
        await fetch(`${baseURL}/models`)
      } catch {
        throw new Error(`Cannot connect to LM Studio at ${baseURL}. Make sure LM Studio server is running.`)
      }

      const provider = createOpenAICompatible({
        name: 'lmstudio',
        baseURL
      })
      model = provider(modelId)
      break
    }

    case 'webllm': {
      model = webLLM(modelId)

      // Check availability
      const availability = await model.availability()

      if (availability === 'unavailable') {
        throw new Error("Your browser doesn't support WebLLM. Try Chrome/Edge with WebGPU enabled.")
      }

      if (availability === 'downloadable') {
        // Model needs to be downloaded
        console.log('Downloading WebLLM model...')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (model as any).createSessionWithProgress((progress: any) => {
          console.log(`Download progress: ${JSON.stringify(progress)}`)
          // TODO: Emit progress event for UI
        })
      }
      break
    }

    default:
      throw new Error(`Unknown local engine: ${providerId}`)
  }

  return { model, modelId, toolMiddleware }
}

/**
 * Initialize a custom OpenAI-compatible endpoint
 */
export async function initializeCustomProvider(config: {
  name: string
  baseURL: string
  modelId: string
  apiKey?: string
}): Promise<InitResult> {
  const { name, baseURL, modelId, apiKey } = config

  if (!baseURL) {
    throw new Error('Base URL is required for custom provider')
  }

  const provider = createOpenAICompatible({
    name,
    apiKey,
    baseURL
  })

  const model = provider(modelId)

  return { model, modelId, toolMiddleware: 'auto' }
}

/**
 * Main initialization function - routes to appropriate initializer
 */
export async function initializeProvider(
  tab: 'providers' | 'local' | 'custom',
  config: Partial<ProviderInitConfig> & { name?: string; baseURL?: string }
): Promise<InitResult> {
  switch (tab) {
    case 'providers':
      return initializeCloudProvider(config as ProviderInitConfig)

    case 'local':
      return initializeLocalEngine(config as ProviderInitConfig)

    case 'custom':
      return initializeCustomProvider(config as { name: string; baseURL: string; modelId: string; apiKey?: string })

    default:
      throw new Error(`Unknown tab: ${tab}`)
  }
}

/**
 * Validate configuration before initialization
 */
export function validateConfig(
  tab: 'providers' | 'local' | 'custom',
  config: Partial<ProviderInitConfig> & { name?: string; baseURL?: string }
): { valid: boolean; error?: string } {
  if (tab === 'providers') {
    if (!config.providerId) {
      return { valid: false, error: 'Please select a provider' }
    }
    if (!config.apiKey && providerRequiresApiKey(config.providerId)) {
      return { valid: false, error: 'API key is required' }
    }
    if (!config.modelId) {
      return { valid: false, error: 'Please select or enter a model' }
    }
  }

  if (tab === 'local') {
    if (!config.providerId) {
      return { valid: false, error: 'Please select a local engine' }
    }
    if (!config.modelId) {
      return { valid: false, error: 'Please select or enter a model' }
    }
    if (config.providerId === 'ollama' || config.providerId === 'lmstudio') {
      if (!config.customUrl) {
        return { valid: false, error: 'URL is required' }
      }
    }
  }

  if (tab === 'custom') {
    if (!config.name) {
      return { valid: false, error: 'Provider name is required' }
    }
    if (!config.baseURL) {
      return { valid: false, error: 'Base URL is required' }
    }
    if (!config.modelId) {
      return { valid: false, error: 'Model ID is required' }
    }
  }

  return { valid: true }
}

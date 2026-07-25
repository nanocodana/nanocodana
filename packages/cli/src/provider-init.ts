import { getProvider } from './providers.js'

export interface BuildModelOptions {
  providerId: string
  modelId: string
  apiKey?: string
  baseUrl?: string
}

/**
 * Instantiate an AI SDK language model for the given provider. Provider
 * packages are dynamic-imported so only the selected one loads.
 */
export async function buildModel(opts: BuildModelOptions): Promise<any> {
  const provider = getProvider(opts.providerId)

  // For native providers, only forward a base URL that's a real, custom
  // override — i.e. set AND different from the provider's known default. This
  // makes the SDK fall back to its own (correct, versioned) default endpoint
  // for blank or default-equal values, so a stale/partial stored base URL
  // (e.g. an old "https://api.anthropic.com" without /v1) can't break requests.
  const customBaseUrl =
    opts.baseUrl && opts.baseUrl !== provider.defaultBaseUrl ? opts.baseUrl : undefined

  switch (provider.kind) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic(
        customBaseUrl ? { apiKey: opts.apiKey, baseURL: customBaseUrl } : { apiKey: opts.apiKey },
      )(opts.modelId)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI(
        customBaseUrl ? { apiKey: opts.apiKey, baseURL: customBaseUrl } : { apiKey: opts.apiKey },
      )(opts.modelId)
    }
    case 'openai-compatible': {
      if (!opts.baseUrl) {
        throw new Error('A base URL is required for the OpenAI-compatible provider')
      }
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      const compat = createOpenAICompatible({
        name: 'custom',
        apiKey: opts.apiKey,
        baseURL: opts.baseUrl,
      })
      return compat(opts.modelId)
    }
    default:
      throw new Error(`Unknown provider kind: ${(provider as any).kind}`)
  }
}

export interface ModelConfig {
  id: string
  name: string
  description?: string
  toolLoopReady?: boolean
  recommended?: boolean
}

export type ProviderType = 'cloud' | 'local'

export interface ProviderConfig {
  id: string
  name: string
  icon: string
  type: ProviderType
  models: ModelConfig[]
  description?: string
  noteUrl?: string // Link for additional info
  modelListUrl?: string // Link to official model list

  // Cloud provider fields
  // NOTE: consumers must read these through getApiKeyPolicy(), never directly,
  // so the picker UI and provider initialization can't disagree.
  requiresApiKey?: boolean
  /** Show the API-key field but don't require it (e.g. Ollama Cloud via local signin). */
  optionalApiKey?: boolean
  /** Placeholder/hint for the API-key field (e.g. how to authenticate without one). */
  apiKeyHint?: string
  /** Base URL for providers served through @ai-sdk/openai-compatible — providers
   * with this set need no bespoke switch arm in provider-init. */
  openAICompatibleBaseURL?: string
  customModelPlaceholder?: string
  getKeyUrl?: string

  // Local engine fields
  defaultUrl?: string
  canFetchModels?: boolean
  browserOnly?: boolean
}

// Provider ID constants
export const PROVIDER_IDS = {
  // Cloud providers
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GOOGLE: 'google',
  XAI: 'xai',
  OPENROUTER: 'openrouter',
  OPENROUTER_FREE: 'openrouter-free',
  OLLAMA_CLOUD: 'ollama-cloud',
  TOGETHER: 'together',
  AIMLAPI: 'aimlapi',
  HUGGINGFACE: 'huggingface',
  DEEPSEEK: 'deepseek',
  ZAI: 'zai',
  NANOGPT: 'nanogpt',
  CUSTOM: 'custom',
  // Local engines
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
  WEBLLM: 'webllm'
} as const

export const PROVIDERS: Record<string, ProviderConfig> = {
  // Cloud providers
  [PROVIDER_IDS.ANTHROPIC]: {
    id: PROVIDER_IDS.ANTHROPIC,
    name: 'Anthropic',
    icon: '/icons/anthropic.ico',
    type: 'cloud',
    description: 'Best for coding & complex agents',
    modelListUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
    requiresApiKey: true,
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    customModelPlaceholder: 'e.g. claude-sonnet-4-5-20250929',
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', recommended: true, toolLoopReady: true, description: 'Sept 2025 - Best for complex agents & coding' },
      { id: 'claude-opus-4-1', name: 'Claude 4.1 Opus', toolLoopReady: true, description: 'Aug 2025 - Maximum capability & reasoning' },
      { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', toolLoopReady: true, description: 'Feb 2025 - Legacy reliable workhorse' },
      { id: 'claude-haiku-4', name: 'Claude 4 Haiku', toolLoopReady: true, description: 'Blazing fast & cost-effective' }
    ]
  },
  [PROVIDER_IDS.OPENAI]: {
    id: PROVIDER_IDS.OPENAI,
    name: 'OpenAI',
    icon: '/icons/openai.png',
    type: 'cloud',
    description: 'The industry standard for reliable, high-performance AI models.',
    noteUrl: 'https://openai.com/gpt-4',
    modelListUrl: 'https://platform.openai.com/docs/models',
    requiresApiKey: true,
    getKeyUrl: 'https://platform.openai.com/api-keys',
    customModelPlaceholder: 'e.g. gpt-5, ft:gpt-4.1:org:model-id',
    models: [
      { id: 'gpt-5', name: 'GPT-5', recommended: true, toolLoopReady: true, description: 'Aug 2025 - The new standard for AGI' },
      { id: 'o3-pro', name: 'o3 Pro', toolLoopReady: true, description: 'Deep reasoning & planning specialist' },
      { id: 'gpt-4.5-turbo', name: 'GPT-4.5 Turbo', toolLoopReady: true, description: 'High speed, massive context' },
      { id: 'gpt-4o', name: 'GPT-4o', toolLoopReady: true, description: 'Reliable multimodal legacy' }
    ]
  },
  [PROVIDER_IDS.GOOGLE]: {
    id: PROVIDER_IDS.GOOGLE,
    name: 'Google',
    icon: '/icons/google.png',
    type: 'cloud',
    description: 'Generous free tier',
    requiresApiKey: true,
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    customModelPlaceholder: 'e.g. gemini-2.5-pro-preview',
    modelListUrl: 'https://ai.google.dev/models/gemini',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', recommended: true, toolLoopReady: true, description: 'Latest - 2M context & adaptive thinking' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', toolLoopReady: true, description: 'Sub-100ms latency, multimodal' },
      { id: 'gemini-2.0-ultra', name: 'Gemini 2.0 Ultra', toolLoopReady: true, description: 'Maximum reasoning capability' }
    ]
  },
  [PROVIDER_IDS.XAI]: {
    id: PROVIDER_IDS.XAI,
    name: 'xAI',
    icon: '/icons/xai.png',
    type: 'cloud',
    description: 'Grok models with 2M context',
    requiresApiKey: true,
    getKeyUrl: 'https://console.x.ai',
    customModelPlaceholder: 'e.g. grok-4, grok-code-fast-1',
    modelListUrl: 'https://docs.x.ai/docs/models',
    models: [
      { id: 'grok-4', name: 'Grok 4', recommended: true, toolLoopReady: true, description: '256K context, real-time knowledge' },
      { id: 'grok-code-ultra', name: 'Grok Code Ultra', toolLoopReady: true, description: 'Specialized for complex architecture' },
      { id: 'grok-3', name: 'Grok 3', toolLoopReady: true, description: 'Legacy powerful model' }
    ]
  },
  [PROVIDER_IDS.OPENROUTER_FREE]: {
    id: PROVIDER_IDS.OPENROUTER_FREE,
    name: 'OpenRouter (Free)',
    icon: '/icons/openrouter.ico',
    type: 'cloud',
    description: 'Access free, experimental, and open-source models.',
    noteUrl: 'https://openrouter.ai/',
    modelListUrl: 'https://openrouter.ai/models?q=free',
    requiresApiKey: true,
    getKeyUrl: 'https://openrouter.ai/keys',
    customModelPlaceholder: 'e.g. google/gemini-2.0-flash-exp:free',
    models: [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp', recommended: true, toolLoopReady: true, description: 'Fast, multimodal, & free' },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', toolLoopReady: true, description: 'Top-tier reasoning for free' },
      { id: 'qwen/qwen3-coder:free', name: 'Qwen 3 Coder', toolLoopReady: true, description: 'Best free coding model' },
      { id: 'meta-llama/llama-3.3-70b:free', name: 'Llama 3.3 70B', toolLoopReady: true, description: 'Reliable open source workhorse' }
    ]
  },
  [PROVIDER_IDS.OLLAMA_CLOUD]: {
    id: PROVIDER_IDS.OLLAMA_CLOUD,
    name: 'Ollama Cloud',
    icon: '/icons/ollama.png',
    type: 'cloud',
    description: 'Cloud models via your local Ollama (run it + `ollama signin`)',
    // No key required: the local daemon authenticates cloud models via `ollama
    // signin`. The key field is shown but optional, so users can still provide
    // or clear one if their setup wants a Bearer token.
    requiresApiKey: false,
    optionalApiKey: true,
    apiKeyHint: 'Optional — leave blank to use ollama signin',
    getKeyUrl: 'https://ollama.com/settings/keys',
    // Served by the local Ollama daemon; editable for non-default ports / hosts.
    defaultUrl: 'http://localhost:11434',
    customModelPlaceholder: 'e.g. deepseek-v3.1:671b-cloud',
    modelListUrl: 'https://ollama.com/library',
    models: [
      { id: 'deepseek-v3.1:671b-cloud', name: 'DeepSeek V3.1 671B', recommended: true, toolLoopReady: true, description: 'Most capable cloud model' },
      { id: 'qwen3-coder:480b-cloud', name: 'Qwen 3 Coder 480B', toolLoopReady: true, description: 'Coding specialist' },
      { id: 'gpt-oss:120b-cloud', name: 'GPT OSS 120B', toolLoopReady: true, description: 'Large open model' },
      { id: 'kimi-k2:1t-cloud', name: 'Kimi K2 1T', toolLoopReady: true, description: 'Multi-modal' },
      { id: 'gpt-oss:20b-cloud', name: 'GPT OSS 20B', toolLoopReady: true, description: 'Fast & efficient' },
      { id: 'glm-4.6:cloud', name: 'GLM 4.6', toolLoopReady: true, description: 'General purpose' }
    ]
  },
  [PROVIDER_IDS.OPENROUTER]: {
    id: PROVIDER_IDS.OPENROUTER,
    name: 'OpenRouter',
    icon: '/icons/openrouter.ico',
    type: 'cloud',
    description: 'Access all major AI models',
    requiresApiKey: true,
    getKeyUrl: 'https://openrouter.ai/keys',
    customModelPlaceholder: 'e.g. x-ai/grok-code-fast-1, anthropic/claude-sonnet-4-5-20250929',
    modelListUrl: 'https://openrouter.ai/docs#models',
    models: [
      { id: 'x-ai/grok-code-fast-1', name: 'Grok Code Fast 1', recommended: true, toolLoopReady: true, description: 'Most popular coding model (55% share)' },
      { id: 'anthropic/claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', toolLoopReady: true, description: 'Sept 2025 - Best all-rounder' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', toolLoopReady: true, description: '2M context & deep reasoning' },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', toolLoopReady: true, description: '400B MoE - Enterprise grade' },
      { id: 'openai/gpt-5', name: 'GPT-5', toolLoopReady: true, description: 'The SOTA benchmark' }
    ]
  },
  [PROVIDER_IDS.TOGETHER]: {
    id: PROVIDER_IDS.TOGETHER,
    name: 'Together AI',
    icon: '/icons/together.svg',
    type: 'cloud',
    description: 'Fastest inference for open-source models (Llama, Mixtral, Qwen).',
    noteUrl: 'https://www.together.ai/',
    modelListUrl: 'https://docs.together.ai/docs/inference-models',
    requiresApiKey: true,
    getKeyUrl: 'https://api.together.xyz/settings/api-keys',
    customModelPlaceholder: 'e.g. meta-llama/Llama-4-Scout-17B-16E-Instruct',
    models: [
      { id: 'meta-llama/Llama-4-Maverick', name: 'Llama 4 Maverick', recommended: true, toolLoopReady: true, description: '17B Active Params - Beats GPT-4o' },
      { id: 'meta-llama/Llama-4-Scout', name: 'Llama 4 Scout', toolLoopReady: true, description: 'Codebase specialist - 10M context' },
      { id: 'Qwen/Qwen3-Coder-480B', name: 'Qwen 3 Coder', toolLoopReady: true, description: 'Autonomous task completion' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', toolLoopReady: true, description: 'Fast & reliable' }
    ]
  },
  [PROVIDER_IDS.AIMLAPI]: {
    id: PROVIDER_IDS.AIMLAPI,
    name: 'AIMLAPI',
    icon: '/icons/aimlapi.ico',
    type: 'cloud',
    description: 'Multi-provider API aggregator',
    requiresApiKey: true,
    getKeyUrl: 'https://aimlapi.com',
    customModelPlaceholder: 'e.g. gpt-4o, claude-sonnet-4-5',
    modelListUrl: 'https://aimlapi.com/models',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', recommended: true, toolLoopReady: true },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', toolLoopReady: true },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', toolLoopReady: true }
    ]
  },
  [PROVIDER_IDS.HUGGINGFACE]: {
    id: PROVIDER_IDS.HUGGINGFACE,
    name: 'Hugging Face',
    icon: '/icons/huggingface.png',
    type: 'cloud',
    description: 'Run any open-source model via serverless inference.',
    noteUrl: 'https://huggingface.co/',
    modelListUrl: 'https://huggingface.co/models?pipeline_tag=text-generation&sort=trending',
    requiresApiKey: true,
    getKeyUrl: 'https://huggingface.co/settings/tokens',
    customModelPlaceholder: 'e.g. deepseek-ai/DeepSeek-V3-0324',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', recommended: true, toolLoopReady: true, description: 'State-of-the-art open model' },
      { id: 'meta-llama/Llama-4-405B', name: 'Llama 4 405B', toolLoopReady: true, description: 'Massive scale intelligence' },
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder', toolLoopReady: true, description: 'Efficient coding specialist' },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', toolLoopReady: true, description: 'Powerful MoE' }
    ]
  },
  [PROVIDER_IDS.DEEPSEEK]: {
    id: PROVIDER_IDS.DEEPSEEK,
    name: 'Deepseek',
    icon: '/icons/deepseek.png',
    type: 'cloud',
    description: 'Advanced reasoning & coding',
    requiresApiKey: true,
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
    customModelPlaceholder: 'e.g. deepseek-chat, deepseek-reasoner',
    modelListUrl: 'https://platform.deepseek.com/docs/api/models',
    models: [
      { id: 'deepseek-v3', name: 'DeepSeek V3', recommended: true, toolLoopReady: true, description: 'State-of-the-art open model' },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', toolLoopReady: true, description: 'Specialized coding model' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', toolLoopReady: true, description: 'Chain-of-thought specialist' }
    ]
  },
  [PROVIDER_IDS.ZAI]: {
    id: PROVIDER_IDS.ZAI,
    name: 'Z.ai',
    icon: '/icons/zai.svg',
    type: 'cloud',
    description: '$3/mo',
    requiresApiKey: true,
    openAICompatibleBaseURL: 'https://api.z.ai/api/coding/paas/v4',
    getKeyUrl: 'https://z.ai',
    customModelPlaceholder: 'e.g. gpt-4o, claude-sonnet-4-5',
    modelListUrl: 'https://z.ai/models',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', recommended: true, toolLoopReady: true },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', toolLoopReady: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', toolLoopReady: true }
    ]
  },
  [PROVIDER_IDS.NANOGPT]: {
    id: PROVIDER_IDS.NANOGPT,
    name: 'NanoGPT',
    icon: '/icons/nanogpt.ico',
    type: 'cloud',
    description: '$8/mo',
    requiresApiKey: true,
    openAICompatibleBaseURL: 'https://nano-gpt.com/api/v1',
    getKeyUrl: 'https://nano-gpt.com',
    customModelPlaceholder: 'e.g. glm-4.6, deepseek-v3.2',
    modelListUrl: 'https://nano-gpt.com/models',
    models: [
      { id: 'glm-4.6', name: 'GLM 4.6', recommended: true, toolLoopReady: true, description: 'General purpose' },
      { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', toolLoopReady: true, description: 'Advanced reasoning' },
      { id: 'qwen3-coder', name: 'Qwen 3 Coder', toolLoopReady: true, description: 'Coding specialist' },
      { id: 'kimi-k2', name: 'Kimi K2', toolLoopReady: true, description: 'Multi-modal' }
    ]
  },

  // NVIDIA NIM was evaluated (2026-07-07) and can't be added: this app is
  // frontend-only and integrate.api.nvidia.com sends no CORS headers, so
  // browsers block it (POST /chat/completions dies with net::ERR_FAILED).
  // Unlike Anthropic there is no browser-access opt-in header. Self-hosted
  // NIM containers with CORS enabled work via the Custom Endpoint tab.

  // Custom OpenAI-compatible endpoint. The picker's Custom tab configures it
  // inline (URL + key + model); it's registered here so selection persistence
  // can resolve it by id like any other provider, and so the agent init can
  // route it to initializeCustomProvider.
  [PROVIDER_IDS.CUSTOM]: {
    id: PROVIDER_IDS.CUSTOM,
    name: 'Custom Endpoint',
    icon: '/icons/custom.svg',
    type: 'cloud',
    description: 'Any OpenAI-compatible API endpoint',
    requiresApiKey: true,
    customModelPlaceholder: 'e.g. gpt-4, claude-3-opus, custom-model',
    models: []
  },

  // Local engines
  [PROVIDER_IDS.OLLAMA]: {
    id: PROVIDER_IDS.OLLAMA,
    name: 'Ollama',
    icon: '/icons/ollama.png',
    type: 'local',
    description: 'Run LLMs locally on your machine (macOS, Linux, Windows).',
    noteUrl: 'https://ollama.com/',
    modelListUrl: 'https://ollama.com/library',
    defaultUrl: 'http://localhost:11434',
    canFetchModels: true,
    models: [
      { id: 'llama4:scout', name: 'Llama 4 Scout', recommended: true, toolLoopReady: true, description: 'Multimodal MoE' },
      { id: 'deepseek-r1', name: 'DeepSeek R1', toolLoopReady: true, description: 'Advanced reasoning' },
      { id: 'phi4', name: 'Phi-4', toolLoopReady: true, description: 'High-efficiency 14B model' },
      { id: 'llama3.3', name: 'Llama 3.3', toolLoopReady: true, description: 'Reliable standard' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', toolLoopReady: true, description: 'Coding specialist' }
    ]
  },
  [PROVIDER_IDS.LMSTUDIO]: {
    id: PROVIDER_IDS.LMSTUDIO,
    name: 'LM Studio',
    icon: '/icons/lmstudio.png',
    type: 'local',
    description: 'Desktop app for running LLMs',
    modelListUrl: 'https://lmstudio.ai/models',
    defaultUrl: 'http://localhost:1234/v1',
    canFetchModels: false,
    models: []
  },
  [PROVIDER_IDS.WEBLLM]: {
    id: PROVIDER_IDS.WEBLLM,
    name: 'WebLLM (Browser)',
    icon: '/icons/webllm.png',
    type: 'local',
    description: 'Run models directly in browser',
    modelListUrl: 'https://mlc.ai/models',
    defaultUrl: '',
    browserOnly: true,
    models: [
      { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', recommended: true, toolLoopReady: true, description: 'Fastest browser model' },
      { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi-3.5 Mini', toolLoopReady: true, description: 'High reasoning capabilities' },
      { id: 'gemma-2-9b-it-q4f16_1-MLC', name: 'Gemma 2 9B', toolLoopReady: true, description: 'Google\'s efficient open model' },
      { id: 'Hermes-3-Llama-3.1-8B-q4f32_1-MLC', name: 'Hermes 3', toolLoopReady: true, description: 'Uncensored & creative' }
    ]
  }
}

// Provider organization
export interface ProviderSection {
  title: string
  description?: string
  providerIds: string[]
}

// Hides the cheap-subscription providers (Z.ai, NanoGPT) from the picker
// without stranding their configs — flip to re-enable. Persisted selections
// keep working either way (PROVIDERS still carries the entries).
const SHOW_CHEAP_SUBSCRIPTIONS = false

export const CLOUD_SECTIONS: ProviderSection[] = [
  {
    title: 'Free Models',
    description: 'Free tiers and generous limits',
    providerIds: [PROVIDER_IDS.OPENROUTER_FREE, PROVIDER_IDS.OLLAMA_CLOUD, PROVIDER_IDS.GOOGLE]
  },
  ...(SHOW_CHEAP_SUBSCRIPTIONS
    ? [{
        title: 'Cheap Subscriptions',
        description: 'Affordable paid plans',
        providerIds: [PROVIDER_IDS.ZAI, PROVIDER_IDS.NANOGPT]
      }]
    : []),
  {
    title: 'Premium Providers',
    description: 'Top-tier models and capabilities',
    providerIds: [PROVIDER_IDS.ANTHROPIC, PROVIDER_IDS.OPENAI, PROVIDER_IDS.XAI, PROVIDER_IDS.DEEPSEEK]
  },
  {
    title: 'Aggregators & Specialized',
    description: 'Multi-provider access and specialized platforms',
    providerIds: [PROVIDER_IDS.OPENROUTER, PROVIDER_IDS.TOGETHER, PROVIDER_IDS.HUGGINGFACE, PROVIDER_IDS.AIMLAPI]
  }
]

export interface ProviderTabConfig {
  cloud: {
    sections: ProviderSection[]
  }
  local: {
    providerIds: string[]
  }
}

export const PROVIDER_TABS: ProviderTabConfig = {
  cloud: {
    sections: CLOUD_SECTIONS
  },
  local: {
    providerIds: [PROVIDER_IDS.OLLAMA, PROVIDER_IDS.LMSTUDIO, PROVIDER_IDS.WEBLLM]
  }
}

// Helper functions
export function getAllProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS)
}

export function getCloudProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS).filter(p => p.type === 'cloud')
}

export function getLocalProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS).filter(p => p.type === 'local')
}

export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDERS[id]
}

export function getProvidersByIds(ids: string[]): ProviderConfig[] {
  return ids.map(id => PROVIDERS[id]).filter(Boolean)
}

export type ProviderTab = 'providers' | 'local' | 'custom'

export type ApiKeyPolicy = 'required' | 'optional' | 'none'

/**
 * Single interpreter for the API-key flags, shared by the picker UI and
 * provider initialization so they can never disagree. Cloud providers default
 * to 'required' when neither flag is set (the field is always shown for them);
 * `optionalApiKey` or an explicit `requiresApiKey: false` shows the field
 * without requiring it; local engines take no key.
 */
export function getApiKeyPolicy(provider: ProviderConfig): ApiKeyPolicy {
  if (provider.requiresApiKey) return 'required'
  if (provider.optionalApiKey || provider.requiresApiKey === false) return 'optional'
  return provider.type === 'cloud' ? 'required' : 'none'
}

// --- Image generation models (separate, optional capability) ---
// `mode` is how the AI SDK reaches the model:
//   'generateImage' → experimental_generateImage (dedicated image models)
//   'multimodal'    → generateText, image returned in result.files (Gemini Nano Banana)
// `providerId` maps to a chat provider so the picker can offer to reuse its key.
export type ImageModelMode = 'generateImage' | 'multimodal'

/** A concrete model the user can pick (or type their own) under an image provider. */
export interface ImageModelExample {
  modelId: string
  label: string
  description?: string
  /**
   * Override the provider's default mode. Needed within Google, where the
   * Gemini "Nano Banana" models are multimodal but Imagen models are dedicated
   * image models reached through `generateImage`.
   */
  mode?: ImageModelMode
}

export interface ImageModelConfig {
  /** Routing id used by the generator to pick the SDK ('openai' | 'gemini' | 'grok'). */
  id: string
  name: string
  icon: string
  providerId: string
  /** Default mode for models typed by the user (examples may override per-model). */
  mode: ImageModelMode
  description?: string
  getKeyUrl?: string
  modelListUrl?: string
  customModelPlaceholder?: string
  /** Example models shown as hints (first = preferred); the user enters/keeps any model ID. */
  models: ImageModelExample[]
}

export const IMAGE_MODELS: ImageModelConfig[] = [
  {
    id: 'gemini',
    name: 'Google Nano Banana',
    icon: '/icons/google.png',
    providerId: PROVIDER_IDS.GOOGLE,
    mode: 'multimodal',
    description: 'Google Gemini image models (+ Imagen).',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    modelListUrl: 'https://ai.google.dev/gemini-api/docs/models',
    customModelPlaceholder: 'e.g. gemini-3.1-flash-image, imagen-4.0-generate-001',
    models: [
      { modelId: 'gemini-3.1-flash-image', label: 'Nano Banana 2', description: 'Fast & high-volume', mode: 'multimodal' },
      { modelId: 'gemini-2.5-flash-image', label: 'Nano Banana', description: 'The original', mode: 'multimodal' },
      { modelId: 'imagen-4.0-generate-001', label: 'Imagen 4', description: 'Photorealistic', mode: 'generateImage' },
      { modelId: 'imagen-4.0-fast-generate-001', label: 'Imagen 4 Fast', description: 'Faster Imagen', mode: 'generateImage' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '/icons/openai.png',
    providerId: PROVIDER_IDS.OPENAI,
    mode: 'generateImage',
    description: 'High-quality, flexible image generation.',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    modelListUrl: 'https://platform.openai.com/docs/models',
    customModelPlaceholder: 'e.g. gpt-image-1, dall-e-3',
    models: [
      { modelId: 'gpt-image-1', label: 'GPT Image 1', description: 'Latest, highest quality' },
      { modelId: 'gpt-image-1-mini', label: 'GPT Image 1 Mini', description: 'Faster & cheaper' },
      { modelId: 'dall-e-3', label: 'DALL·E 3', description: 'Reliable classic' },
    ],
  },
  {
    id: 'grok',
    name: 'Grok',
    icon: '/icons/xai.png',
    providerId: PROVIDER_IDS.XAI,
    mode: 'generateImage',
    description: "xAI's image model.",
    getKeyUrl: 'https://console.x.ai',
    modelListUrl: 'https://docs.x.ai/docs/models',
    customModelPlaceholder: 'e.g. grok-imagine-image',
    models: [
      { modelId: 'grok-imagine-image', label: 'Grok Imagine', description: "xAI's image model" },
      { modelId: 'grok-imagine-image-pro', label: 'Grok Imagine Pro', description: 'Higher quality' },
    ],
  },
]

/**
 * Resolve how the generator should reach a (possibly user-typed) model:
 * an explicit example mode wins; otherwise Google infers Imagen → generateImage
 * vs Gemini → multimodal, and other providers fall back to their default mode.
 */
export function resolveImageMode(m: ImageModelConfig, modelId: string): ImageModelMode {
  const example = m.models.find((e) => e.modelId === modelId)
  if (example?.mode) return example.mode
  if (m.id === 'gemini') return /imagen/i.test(modelId) ? 'generateImage' : m.mode
  return m.mode
}

/**
 * Mode resolution by image-provider id — for persisted picks that predate
 * `mode` on ImageSelection. Unknown ids fall back to `generateImage`.
 */
export function resolveImageModeFor(imageProviderId: string, modelId: string): ImageModelMode {
  const config = IMAGE_MODELS.find((m) => m.id === imageProviderId)
  return config ? resolveImageMode(config, modelId) : 'generateImage'
}

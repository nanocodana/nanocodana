import type { LanguageModelMiddleware } from 'ai'

/**
 * Anthropic prompt caching is OPT-IN per request: without `cache_control`
 * breakpoints the API re-processes the entire prompt at full input price on
 * every call. In an agent loop that re-sends the whole (growing) history each
 * step, that is the difference between ~$20 and ~$2 for the same session —
 * cached reads bill at ~0.1x the input rate.
 *
 * This middleware places two breakpoints on the final prompt:
 *
 *  - the last system message (message-level) — tools render before system in
 *    Anthropic's prompt layout, so this one breakpoint caches the tool
 *    definitions AND the system prompt together;
 *  - the last content PART of the last message — a moving breakpoint over the
 *    conversation. Each step appends messages and re-marks the new tail; the
 *    previous tail's entry becomes the read point via Anthropic's backward
 *    cache lookup, so hits accrue as the loop runs.
 *
 * The tail marker is part-level, not message-level, deliberately: OpenRouter
 * fans a message-level marker out to EVERY tool result in the message (one
 * `role: "tool"` entry per result), so a step with 4+ parallel tool calls
 * would exceed Anthropic's 4-breakpoint cap and fail the request — and it
 * applies message-level markers only to text parts, dropping the breakpoint
 * for attachment-only user messages. A single part-level marker maps 1:1 on
 * every supported provider.
 *
 * Prefixes shorter than the model's cacheable minimum (1-4K tokens) are
 * silently not cached by the API, so early small turns are unaffected rather
 * than broken.
 */
const EPHEMERAL_CACHE = { cacheControl: { type: 'ephemeral' } } as const

type ProviderOptions = Record<string, Record<string, unknown>>

type PromptPart = {
  type?: string
  providerOptions?: ProviderOptions
}

type PromptMessage = {
  role: string
  content: string | PromptPart[]
  providerOptions?: ProviderOptions
}

/**
 * Whether a providerOptions bag carries a manual cache breakpoint. Both the
 * `anthropic` and `openrouter` namespaces count: the OpenRouter provider
 * honors its own key first (`openrouter.cacheControl`), and stacking our
 * markers on top of either kind can exceed Anthropic's 4-breakpoint cap.
 */
function hasCacheControlKey(options: ProviderOptions | undefined): boolean {
  if (!options) return false
  for (const namespace of ['anthropic', 'openrouter']) {
    const bag = options[namespace]
    // Untyped consumers can put primitives here; `in` on a non-object throws.
    if (bag && typeof bag === 'object' && ('cacheControl' in bag || 'cache_control' in bag)) {
      return true
    }
  }
  return false
}

function hasManualCacheControl(message: PromptMessage): boolean {
  if (hasCacheControlKey(message.providerOptions)) return true
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (hasCacheControlKey(part.providerOptions)) return true
    }
  }
  return false
}

function withCacheControl<T extends { providerOptions?: ProviderOptions }>(target: T): T {
  return {
    ...target,
    providerOptions: {
      ...target.providerOptions,
      anthropic: { ...target.providerOptions?.anthropic, ...EPHEMERAL_CACHE },
    },
  }
}

/**
 * Parts that cannot carry a cache breakpoint: providers drop
 * tool-approval-response parts during conversion, and Anthropic rejects
 * cache_control on thinking blocks — a marker on either silently vanishes.
 */
function isMarkablePart(part: PromptPart): boolean {
  return part.type !== 'tool-approval-response' && part.type !== 'reasoning'
}

function lastMarkablePartIndex(content: PromptPart[]): number {
  for (let i = content.length - 1; i >= 0; i--) {
    if (isMarkablePart(content[i])) return i
  }
  return -1
}

/**
 * Mark a message as the conversation tail, or return null when it can't
 * carry a breakpoint. Placement is role-aware because the two supported
 * providers read markers differently:
 *
 *  - system (string content): message-level — both providers map it onto the
 *    emitted system block.
 *  - tool: PART-level only, on the last markable tool result. Message-level
 *    would be fanned out by OpenRouter into one cache_control per result
 *    (4-breakpoint cap overflow on parallel tool calls). All approval-only
 *    content → null (nothing survives conversion; caller walks back).
 *  - user/assistant: part-level on the last markable part (Anthropic reads
 *    it on any part type) PLUS message-level (OpenRouter ignores part-level
 *    on assistant messages and URL-file parts). The two never double up: each
 *    provider reads exactly one of them per message. Exception: when an
 *    assistant message ends in a reasoning part, message-level is skipped —
 *    Anthropic would map it onto the thinking block and reject it with a
 *    per-request warning (OpenRouter loses the marker on that shape; the
 *    system breakpoint still stands).
 */
function markTail(message: PromptMessage): PromptMessage | null {
  if (!Array.isArray(message.content)) {
    return withCacheControl(message)
  }
  const target = lastMarkablePartIndex(message.content)
  if (message.role === 'tool') {
    if (target === -1) return null
    return {
      ...message,
      content: message.content.map((part, i) => (i === target ? withCacheControl(part) : part)),
    }
  }
  if (target === -1) {
    // No markable part (e.g. reasoning-only assistant message): message-level
    // would land on an unmarkable part — skip this message entirely.
    return null
  }
  const lastPartMarkable = isMarkablePart(message.content[message.content.length - 1])
  const marked = {
    ...message,
    content: message.content.map((part, i) => (i === target ? withCacheControl(part) : part)),
  }
  return lastPartMarkable ? withCacheControl(marked) : marked
}

/**
 * Whether the model routes to Anthropic's Messages API and honors
 * `providerOptions.anthropic.cacheControl`: the Anthropic provider itself, or
 * OpenRouter serving a Claude model (its provider forwards the same option as
 * `cache_control`). Everything else no-ops — OpenAI, Google, and DeepSeek
 * cache automatically server-side and need no markers.
 *
 * Scope note: this detects provider INSTANCES only. Gateway model strings
 * (`model: 'anthropic/claude-...'`) and Claude via Bedrock/Vertex objects are
 * not auto-detected — wrap those yourself with the exported
 * `promptCachingMiddleware` if the route forwards Anthropic provider options.
 * Models below spec version 'v3' are excluded: `wrapLanguageModel` stamps the
 * wrapper as 'v3', which would bypass the AI SDK's v2 compatibility
 * conversion and corrupt usage/finish handling.
 */
export function supportsAnthropicPromptCache(model: unknown): boolean {
  if (typeof model !== 'object' || model === null) return false
  const { provider, modelId, specificationVersion } = model as {
    provider?: unknown
    modelId?: unknown
    specificationVersion?: unknown
  }
  if (specificationVersion !== 'v3') return false
  const providerName = typeof provider === 'string' ? provider.toLowerCase() : ''
  if (providerName.includes('anthropic')) return true
  if (providerName.includes('openrouter')) {
    const id = typeof modelId === 'string' ? modelId.toLowerCase() : ''
    return id.includes('anthropic/') || id.includes('claude')
  }
  return false
}

export const promptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => {
    const prompt = params.prompt as PromptMessage[] | undefined
    if (!Array.isArray(prompt) || prompt.length === 0) return params

    // The caller placed breakpoints by hand — anywhere in the messages OR on
    // tool definitions (tools count against the same 4-breakpoint budget) —
    // so theirs win: adding ours could blow the cap or shadow deliberate
    // placement.
    if (prompt.some(hasManualCacheControl)) return params
    const tools = (params as { tools?: Array<{ providerOptions?: ProviderOptions }> }).tools
    if (tools?.some((tool) => hasCacheControlKey(tool.providerOptions))) return params

    let lastSystemIndex = -1
    for (let i = 0; i < prompt.length; i++) {
      if (prompt[i].role === 'system') lastSystemIndex = i
    }

    // The moving tail breakpoint goes on the LAST message that can carry one
    // — walking back past unmarkable tails (e.g. an approval-only tool
    // message) so the conversation still gets its incremental cache entry.
    let tailIndex = -1
    let markedTail: PromptMessage | null = null
    for (let i = prompt.length - 1; i >= 0; i--) {
      markedTail = markTail(prompt[i])
      if (markedTail !== null) {
        tailIndex = i
        break
      }
    }

    return {
      ...params,
      prompt: prompt.map((message, i) => {
        if (i === tailIndex) return markedTail as PromptMessage
        if (i === lastSystemIndex) return withCacheControl(message)
        return message
      }) as typeof params.prompt,
    }
  },
}

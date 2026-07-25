import { wrapLanguageModel } from 'ai'
import type { PrepareModelOptions, ToolMiddlewareMode } from './types.js'
import { promptCachingMiddleware, supportsAnthropicPromptCache } from './prompt-caching.js'

function isToolMiddlewareMode(value: string): value is ToolMiddlewareMode {
  return value === 'auto' || value === 'hermes' || value === 'morphXml'
}

/**
 * Lazily resolves a built-in middleware mode to the matching parser
 * middleware. The dynamic import keeps `@ai-sdk-tool/parser` (and `yaml`
 * transitively, ~90 KB gzipped) out of bundles that never call this.
 */
export async function resolveToolMiddlewareMode(mode: ToolMiddlewareMode = 'auto') {
  const { hermesToolMiddleware, morphXmlToolMiddleware } = await import(
    '@ai-sdk-tool/parser'
  )
  switch (mode) {
    case 'auto':
    case 'hermes':
      return hermesToolMiddleware
    case 'morphXml':
      return morphXmlToolMiddleware
  }
}

/**
 * Wraps the model with tool-parser middleware if requested, and with the
 * Anthropic prompt-caching middleware when the model supports it (opt out via
 * `promptCaching: false`). The function is async because resolving a built-in
 * mode pulls the parser bundle dynamically — bundles without `toolMiddleware`
 * never touch it.
 */
export async function prepareModelForAgent({
  model,
  toolMiddleware,
  promptCaching = true,
}: PrepareModelOptions) {
  let prepared = model

  // Wrapped FIRST so it sits closest to the model: outer middlewares run
  // before inner ones, so the cache breakpoints land on the final prompt —
  // after any tool-parser transform has rewritten system/messages.
  if (promptCaching && supportsAnthropicPromptCache(prepared)) {
    prepared = wrapLanguageModel({
      model: prepared,
      middleware: promptCachingMiddleware,
    })
  }

  if (!toolMiddleware) {
    return prepared
  }

  const middleware =
    typeof toolMiddleware === 'string' && isToolMiddlewareMode(toolMiddleware)
      ? await resolveToolMiddlewareMode(toolMiddleware)
      : toolMiddleware

  return wrapLanguageModel({
    model: prepared,
    middleware,
  })
}

# @nanocodana/browser

A full [NanoCodana](https://github.com/nanocodana/nanocodana) coding agent that
runs **entirely in the browser** — the agent loop, the tools, and the filesystem
all live in the tab. No server, no proxy, nothing to deploy.

Because there's no backend, a user's API key never leaves their machine — which
makes this the adapter for BYOK products.

```bash
npm install @nanocodana/browser ai
```

## Quick start

```ts
import { BrowserAgent } from '@nanocodana/browser'
import { openai } from '@ai-sdk/openai'

const agent = BrowserAgent({
  model: openai('gpt-5.1'),
  initialFiles: [{ path: 'index.html', content: '<h1>hi</h1>' }],
  persist: true, // IndexedDB (default). false = in-memory only.
})

const result = await agent.stream({
  messages: [{ role: 'user', content: 'Add a dark-mode toggle to index.html.' }],
})

for await (const chunk of result.fullStream) {
  if (chunk.type === 'text-delta') process.stdout.write(chunk.text)
}
```

## The virtual filesystem

- `persist: true` (default) backs the FS with **IndexedDB**, so projects survive
  reloads. `false` keeps everything in memory.
- `initialFiles` seeds it at construction — `content` may be a function for lazy
  hydration from your own store.
- `onFilesChange` fires on every create/edit/delete, so your editor or preview
  can mirror the agent's work live.
- Agent Skills are auto-discovered from the agent's own filesystem: seed a
  `.agents/skills/<name>/SKILL.md` and it registers automatically.

## Calling providers from a tab

The browser talks to the model API directly, so the provider must allow
cross-origin requests. Anthropic has an explicit opt-in header for this;
OpenAI-compatible endpoints vary — check CORS before committing to one for a
frontend-only product. For local models without native tool calling (Ollama,
WebLLM), set `toolMiddleware: 'hermes'`.

## Seen in production

[Sharables](https://sharables.ai) is this package doing the work: describe a
React Native app, watch the agent build it file-by-file in your tab, preview it
live, and share it with a link.

**Docs:** <https://nanocodana.github.io/docs/browser/> · MIT

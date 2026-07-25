<p align="center">
  <img src="assets/logo.png" alt="NanoCodana" width="160" height="160" />
</p>

<h1 align="center">NanoCodana</h1>

<p align="center"><strong>A tiny but mighty agent that runs in your browser, on your phone, or at the edge.</strong></p>

NanoCodana packs everything a coding agent needs — file tools, a virtual shell,
MCP support, tool-approval gating, Anthropic-style Agent Skills, and any model
the [Vercel AI SDK](https://sdk.vercel.ai) supports — into something you can run
in the browser, in a serverless function, or embedded in your own app.

**Docs: [nanocodana.github.io/docs](https://nanocodana.github.io/docs/)**

## In the browser

The whole agent — the loop, the tools, the filesystem — runs client-side in the
tab. No server, no upload: a user's API key never leaves their machine.

```ts
import { BrowserAgent } from '@nanocodana/browser'
import { openai } from '@ai-sdk/openai'

const agent = BrowserAgent({
  model: openai('gpt-5.1'),
  initialFiles: [{ path: 'index.html', content: '<h1>hi</h1>' }],
  persist: true, // IndexedDB (default). false = in-memory only.
})

await agent.stream({
  messages: [{ role: 'user', content: 'Add a dark-mode toggle to index.html.' }],
})
```

This is what powers [Sharables](https://sharables.ai): React Native apps
described in chat, built file-by-file in the tab, previewed live, and shared
with a link. Read more about persistence, seeding files, and calling providers
from a tab in the [Browser docs](https://nanocodana.github.io/docs/browser/).

## On Node

Same API, real files.

```ts
import { NodeAgent } from '@nanocodana/nodejs'
import { anthropic } from '@ai-sdk/anthropic'

const agent = NodeAgent({
  model: anthropic('claude-sonnet-5'),
  workingDirectory: process.cwd(),
  needsApproval: ['Write', 'Edit', 'MultiEdit', 'Delete'], // gate risky tools
})

const result = await agent.stream({
  messages: [{ role: 'user', content: 'Add a CHANGELOG.md summarizing recent commits.' }],
})

for await (const chunk of result.fullStream) {
  if (chunk.type === 'text-delta') process.stdout.write(chunk.text)
}
```

Read more about the default tool set and the sandboxed shell in the
[Node docs](https://nanocodana.github.io/docs/node/).

## Anywhere else (core)

`@nanocodana/core` is the same agent with the runtime unplugged — hand it your
own filesystem or sandbox and it runs inside anything:

```ts
import { NanoCodana } from '@nanocodana/core'

const agent = new NanoCodana({
  model,
  fs: myFileSystem,      // any IFileSystem
  // or: sandbox: mySandbox
})
```

Read more about custom filesystems and sandboxes in the
[Core docs](https://nanocodana.github.io/docs/core/).

## Packages

Pick by where the files live: a real disk → `nodejs`, a browser tab →
`browser`, anywhere else (a database, blob storage, a sandbox) → `core`.

| Package | Use it when… |
|---|---|
| **`@nanocodana/browser`** | running the agent fully client-side over an in-memory / IndexedDB FS — `BrowserAgent(config)` |
| **`@nanocodana/nodejs`** | building a CLI, server, or script on real files — `NodeAgent(config)` |
| **`@nanocodana/core`** | embedding with your own filesystem or sandbox — `new NanoCodana(config)` |
| **`@nanocodana/cli`** | a ready-to-use terminal coding agent — `codana chat` |

## Install

```bash
npm install @nanocodana/browser ai    # browser
npm install @nanocodana/nodejs ai     # node
npm install @nanocodana/core ai       # anywhere else — bring your own filesystem
npm install -g @nanocodana/cli        # `codana`, the terminal agent
```

Add the AI SDK provider for your model: `@ai-sdk/anthropic`, `@ai-sdk/openai`,
or `@ai-sdk/openai-compatible` (OpenRouter, DeepSeek, Groq, Ollama, LM Studio, …).

## Talking to the agent

`agent.stream({ messages })` (or `generate` for one-shot) returns an AI SDK
result:

- **`result.fullStream`** — typed chunks: `text-delta`, `tool-call`,
  `tool-result`, `tool-approval-request`, `error`.
- **`result.response`** — the final messages; append them to your history.
- **`result.totalUsage`** — token counts, including cached input tokens.

When a tool gated by `needsApproval` wants to run, the stream emits a
`tool-approval-request`. Push a `tool-approval-response` message and stream
again to resume — see [Tool Approval](https://nanocodana.github.io/docs/tool-approval).

## Configuration

| Option | Description |
|---|---|
| `model` | **Required.** Any AI SDK `LanguageModel`. |
| `needsApproval` | Tool names (or a predicate) that require human approval before running. |
| `systemPrompt` | Override the generated prompt. |
| `tools` | Extra tools (a record, or `(ctx) => record`), merged with the built-ins. |
| `toolMiddleware` | `'auto' \| 'hermes' \| 'morphXml'` or any AI SDK middleware. Parses tool calls the model emits as plain text — so models *without* native tool calling can still drive the agent. |
| `promptCaching` | Default `true`. Automatic Anthropic prompt caching: marks the system prompt, tools, and conversation tail as cacheable, cutting input cost up to ~90% on long sessions. No-op for providers that cache server-side. |
| `skills` / `skillDirs` | Explicit skills / directories to scan (default `.agents/skills`, `.claude/skills`). |
| `mcpServers` | MCP servers to connect; their tools are merged in. |
| `imageModel` | Optional AI SDK `ImageModel`. Exposes a `GenerateImage` tool that writes images to the filesystem. |
| `imageOutputDir` | Where images a multimodal `model` emits directly are auto-saved. Default `generated`. |
| `initialFiles` | Seed the agent's filesystem with `{ path, content }` entries. `content` may be a function (sync or async) to hydrate lazily on first read. Not on `NodeAgent`, which works against a real directory. |
| `onFilesChange` | Callback fired with every file the agent creates, edits, or deletes — the hook for mirroring the agent's work into your own UI or store. |
| `compact` | Compact tool descriptions + prompt to save tokens. |
| `stopWhen` | When the tool loop should stop. |
| `virtualBash` | Include the in-memory Bash tool (default `true`). `false` drops it and its ~157 KB chunk. |
| `workingDirectory` | *(Node)* Root directory for the file tools. |
| `persist` / `persistKey` | *(Browser)* IndexedDB (default) vs in-memory only, and which store to use. |
| `fs` / `sandbox` | *(Core)* Your own filesystem or sandbox backend. |

Nearly everything can also be changed **per call** — `stream()` accepts the same
options and rebuilds only what changed:

```ts
await agent.stream({ messages, model: openai('gpt-5.1') })      // swap model this turn
await agent.stream({ messages, activeTools: ['Read', 'Grep'] }) // read-only turn
```

See [Configuration](https://nanocodana.github.io/docs/configuration) and
[Per-call Overrides](https://nanocodana.github.io/docs/overrides) for the full detail.

## See it in action

- **[Sharables](https://sharables.ai)** ([apps/sharables](./apps/sharables)) —
  the product: describe a React Native app, watch the agent build it in your
  browser, run it on your phone via Expo Go, share it with a link.
- **Forge** ([apps/node](./apps/node), `npm run forge`) — the self-referential
  demo: a NanoCodana agent whose job is to design, write, and *test* brand-new
  NanoCodana agents. You describe the agent you want; Forge scaffolds it, runs
  it, and iterates until it works.
- **`codana`** ([packages/cli](./packages/cli)) — the framework as a terminal
  app: `codana chat` in any directory, with approvals, skills, `/model`,
  `/cost`, and `@`-file references.
- **Serverless** ([apps/serverless](./apps/serverless), `npm start`) — run the
  agent in a function with your files in a database: hydrated lazily per
  invocation (only the files it touches are fetched) and persisted back.
- **Minimal examples** — [apps/web](./apps/web) (vanilla Vite, BYOK agent fully
  in the tab), [apps/nextjs](./apps/nextjs) (`@nanocodana/core` behind an API
  route with `useChat`), [apps/node](./apps/node) (chat loop, skills, image-gen
  demos).

## Development

npm-workspaces monorepo: `npm install`, then `npm run build` to build every
package. Agent code lives in `packages/core` with thin adapters in
`packages/adapters/{nodejs,browser}`; example apps live in `apps/*`. The CLI has
an offline test suite: `cd packages/cli && npm run build && node smoke.test.mjs`.

## License

MIT

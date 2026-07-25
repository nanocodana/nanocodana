# Sharables

**Describe it. Build it. Share it.**

Powered by [nanocodana](../../README.md).

Sharables is a browser app for building and sharing React Native apps with AI.
You describe the app you want in chat; an AI agent generates and iterates on a
real React Native (Expo Snack) project.

## How it works

1. Describe your app in the chat panel.
2. The agent writes and edits the project files live.
3. You get an instant web preview in the browser.
4. Scan a QR code with Expo Go to run it on a real device.
5. Share the result with a link.

## Bring your own key (BYOK)

Sharables supports multiple AI providers — Anthropic, OpenAI, Google, DeepSeek,
xAI, Together, OpenRouter, Ollama, and in-browser WebLLM among others (see
`src/config/providers.ts`). Keys are configured in-app and processing runs
client-side in the browser.

## Development

From the repo root:

```bash
npm install
npm run dev:sharables   # serves on http://localhost:3004
```

Sharables is a workspace of the nanocodana monorepo and consumes
`@nanocodana/core` and `@nanocodana/browser`.

## Powered by nanocodana

The AI-engineering engine behind Sharables is
[nanocodana](../../README.md) — the open engine that powers the product.

# apps/web

A vanilla JS + Vite demo of `@nanocodana/browser` running entirely client-side.
You paste an Anthropic API key (BYOK, sent directly from the browser via
`anthropic-dangerous-direct-browser-access`), chat with the agent, and watch it
edit a virtual filesystem live. Commented code in `main.js` shows local-model
alternatives via WebLLM and transformers-js. Part of the nanocodana monorepo —
run it from the repo root with `npm run dev -w apps/web`.

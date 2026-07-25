# Contributing

Thanks for looking. NanoCodana is pre-1.0 and moving, so the most useful things
right now are bug reports with a reproduction, and small focused PRs.

## Setup

npm workspaces monorepo, Node 20+:

```bash
npm install
npm run build        # builds every package
```

```bash
cd packages/cli && node smoke.test.mjs   # offline CLI render/logic tests
```

## Layout

| Path | What |
|---|---|
| `packages/core` | the agent, tools, skills, MCP, approval gating — no Node or DOM deps |
| `packages/adapters/nodejs` | `NodeAgent` — real filesystem, host-capable Bash |
| `packages/adapters/browser` | `BrowserAgent` — in-memory / IndexedDB |
| `packages/cli` | `codana`, the terminal app |
| `apps/*` | runnable examples (see each app's README) |

Behavior belongs in **core** unless it's genuinely platform-specific; adapters
should stay thin — a filesystem plus the tools only that platform can offer.

## Pull requests

- Run `npm run build` and the CLI smoke tests before pushing.
- Keep the diff focused; unrelated cleanups in their own PR.
- Match the surrounding code — comment density, naming, and idiom included.
- Adding or changing a tool? Update its description too. The description is
  the model's only documentation, so vague wording is a real bug.
- Touching config surface? `NanoCodanaConfig` in `packages/core/src/types.ts` is
  the source of truth; keep the README table and the docs site in sync.

## Docs

The site lives in a separate repository and is published at
<https://nanocodana.github.io>. For changes to the framework's own docs, note
what needs updating in your PR and we'll carry it across.

## Security

Please don't file public issues for vulnerabilities — see [SECURITY.md](./SECURITY.md).

By contributing you agree your work is licensed under the [MIT License](./LICENSE).

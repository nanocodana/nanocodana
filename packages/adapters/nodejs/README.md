# @nanocodana/nodejs

A [NanoCodana](https://github.com/nanocodana/nanocodana) coding agent over your
**real filesystem** — point it at a directory and it gets the full file toolset
plus a `Bash` tool that runs in a sandbox, and can optionally escalate to the
host shell with approval. For CLIs, servers, bots, scripts, and CI.

```bash
npm install @nanocodana/nodejs ai
```

## Quick start

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
  else if (chunk.type === 'tool-call') console.log(`\n↳ ${chunk.toolName}`, chunk.input)
}
```

`workingDirectory` is the root for every file tool — the agent can't wander
outside it. Agent Skills are auto-discovered beneath it from `.agents/skills/`
and `.claude/skills/`, so skills you already keep for other agents just work.

## Approval and the Bash sandbox

Tools named in `needsApproval` emit a `tool-approval-request` on the stream;
push a `tool-approval-response` message and stream again to resume.

Shell commands run in a **sandbox**: an interpreter over the working directory
with 80+ built-in coreutils, no child processes, and no access to system
binaries. Reaching the real machine shell requires opting in:

```ts
NodeAgent({ model, workingDirectory, hostShell: true })
```

**`hostShell` defaults to `false`** — handing out a shell isn't something a
library should do implicitly. Leave it off for anything running someone else's
prompts (a server, a hosted product, CI) and the agent has no path to the host at
all: the `host` parameter isn't offered to the model, and an explicit `host: true`
is refused rather than silently downgraded. Turn it on for a local developer tool
on the user's own machine, where `git` and `npm` are the point. Host runs still
always require approval.

## Search

`Grep` picks the best engine automatically: bundled ripgrep (the
`@vscode/ripgrep` optional dependency, ~4 MB for your platform), else a system
`rg`, else a zero-dependency JS search that honors `.gitignore` and skips build
output and binaries. A missing binary only makes search slower — it never breaks
the agent. Force one with `tools: { Grep: createNodeGrepTool(cwd) }` or
`createRipgrepTool(cwd)`.

## Install size

A default install is **141 MB across 212 packages**. That number surprises
people, so here is exactly where it goes and what you can do about it.

### Where it comes from

Two dependency trees, and neither is mostly *code*:

| | | |
|---|---|---|
| the AI SDK | ~59 MB | `@ai-sdk/*` 15 MB, `ai` 10 MB, `zod` 7 MB, MCP SDK 6 MB |
| `just-bash` | ~78 MB | the virtual shell and its runtimes |

Inside just-bash, the weight is almost entirely payloads rather than logic:

| | size | what actually loads |
|---|---|---|
| `sql.js` | 19 MB | `sql-wasm.wasm` — **660 kB**. The rest is asm.js and debug builds for pre-wasm environments, published to everyone because the package has no `files` field. |
| CPython (in-tree) | 10 MB | only when you set `python: true` |
| `@mixmark-io/domino` | 9 MB | turndown's DOM, for WebFetch's HTML→markdown |
| `quickjs-emscripten` | 4 MB | only when you set `javascript: true` |
| `@vscode/ripgrep` | 4.4 MB | the `rg` binary |
| native codecs | ~4 MB | `tar -J` / `tar --zstd` |

The useful way to read that: **80 of the ~83 shell commands are pure JavaScript
and total under 2 MB.** Three commands — `sqlite3`, `python3`, `js-exec` — plus
ripgrep account for nearly everything else.

Note that runtime options do **not** change install size. `python` and
`javascript` default to off and you still get their payloads on disk; just-bash's
lazy command registry defers *loading*, not *installing*.

### What you can do about it

| | install | packages |
|---|---|---|
| default | 141 MB | 212 |
| `--omit=optional` | **131 MB** | **175** |
| `--omit=optional`, then delete `node_modules/just-bash/vendor/` | **~121 MB** | 175 |

```bash
npm install @nanocodana/nodejs --omit=optional
```

Three payloads are optional. Each unlocks one capability and is dead weight
otherwise; the shell dynamic-imports all three inside `try`/`catch` and reports
an actionable error when one is missing, so a pruned install is a supported
configuration rather than a broken one:

| dependency | unlocks | when absent |
|---|---|---|
| `node-liblzma` | `tar -J` (xz) | error naming the package |
| `@mongodb-js/zstd` | `tar --zstd` | error naming the package |
| `@vscode/ripgrep` | native ripgrep | falls back to the JS implementation |

just-bash declares the two codecs itself, so only ripgrep is listed here and one
flag prunes all three. Everything else is unaffected: the other ~80 commands,
`sqlite3`, `python3`, `js-exec` and every file tool keep working.

CPython is the one payload npm cannot prune, because it ships inside just-bash's
own tarball rather than as a dependency. It is read only when `python: true`, so
a deployment that leaves python off can delete it outright.

### If you bundle, none of this ships

Install size is a *build-time* cost. Bundle your app and only the module graph
travels — the wasm payloads and binaries are loaded from disk at runtime and are
never part of it:

| | |
|---|---|
| bundled as a single file | **3.58 MB** (1.02 MB gzipped) |
| bundled with code splitting | **387 kB** entry chunk |

With splitting on, just-bash's per-command registry does its job: every command
becomes its own chunk and arrives on first use, so a run that never shells out
loads none of them.

What you still ship beside the bundle is only what is loaded by *path*: three
worker files (~326 kB), `sql-wasm.wasm` (660 kB), and CPython (10 MB) if python
is enabled. A full deployment with every capability lands around 33 MB; a lean
one is nearer 5 MB.

### Why this package doesn't vendor the shell

`just-bash` is a normal dependency here, unlike in core. Core vendors it to solve
a correctness problem that only exists off Node — its browser build statically
imports `node:zlib`, which makes the module unloadable on workerd. On Node,
`node:zlib` resolves and just-bash's worker and CPython assets resolve inside
`node_modules` exactly as designed, so vendoring would only trade install size
for a second build script reproducing a fragile asset layout.

Core is imported through its `/no-bash` entry, so core's own bundled shell never
ends up in your build alongside this one — that would be ~1.2 MB that can never
run, since this adapter supplies its own Bash tool.

## Built on

[`@nanocodana/core`](https://www.npmjs.com/package/@nanocodana/core) — the same
agent, tools, skills, MCP, and prompt caching, wired to Node's filesystem.
Want a ready-made terminal app instead? See
[`@nanocodana/cli`](https://www.npmjs.com/package/@nanocodana/cli).

**Docs:** <https://nanocodana.github.io/docs/node/> · MIT

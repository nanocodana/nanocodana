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

## Built on

[`@nanocodana/core`](https://www.npmjs.com/package/@nanocodana/core) — the same
agent, tools, skills, MCP, and prompt caching, wired to Node's filesystem.
Want a ready-made terminal app instead? See
[`@nanocodana/cli`](https://www.npmjs.com/package/@nanocodana/cli).

**Docs:** <https://nanocodana.github.io/docs/node/> · MIT

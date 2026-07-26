# @nanocodana/core

The [NanoCodana](https://github.com/nanocodana/nanocodana) agent engine — the
agent loop, the file tools, a virtual shell, Agent Skills, MCP, and
tool-approval gating, built on the [Vercel AI SDK](https://sdk.vercel.ai).

It imports no Node builtins and touches no DOM, so it runs wherever JavaScript
does — a serverless function, an edge runtime, a container, a remote sandbox, or
embedded in your own app — over whatever storage you hand it.

> Most apps want an adapter instead: **[@nanocodana/browser](https://www.npmjs.com/package/@nanocodana/browser)**
> (in-tab, IndexedDB) or **[@nanocodana/nodejs](https://www.npmjs.com/package/@nanocodana/nodejs)**
> (real disk). Reach for core when the filesystem is yours.

```bash
npm install @nanocodana/core ai
```

## Bring your own filesystem

```ts
import { NanoCodana } from '@nanocodana/core'

const agent = new NanoCodana({
  model,
  fs: myFileSystem,      // any IFileSystem
  // or: sandbox: mySandbox
})

const result = await agent.stream({
  messages: [{ role: 'user', content: 'Add a health check route.' }],
})

for await (const chunk of result.fullStream) {
  if (chunk.type === 'text-delta') process.stdout.write(chunk.text)
}
```

## Or seed files and persist the changes

You usually don't need to implement a filesystem. Seed the built-in in-memory FS
and mirror every edit back to your store — `content` may be a function (sync or
async) so a large project hydrates lazily, one file per actual read:

```ts
const paths = await db.listPaths(projectId)        // cheap: names only

const agent = new NanoCodana({
  model,
  initialFiles: paths.map((path) => ({
    path,
    content: () => db.readFile(projectId, path),   // fetched on first read
  })),
  onFilesChange: (changes) => persist(projectId, changes),
})
```

## What you get

`Read` · `Write` · `Edit` · `MultiEdit` · `Delete` · `Glob` · `Grep` · `LS` ·
`TodoWrite` · a virtual `Bash`, plus optional `GenerateImage`, MCP tools, and
Anthropic-style Agent Skills discovered from the agent's own filesystem.
Automatic Anthropic prompt caching is on by default.

## The shell

`Bash` is a real POSIX-ish shell running against the agent's filesystem — no
child processes, no host access. Core ships a **Node-free build** of it, so this
package loads unmodified on Cloudflare Workers, in a browser, and anywhere else
JavaScript runs, with no bundler configuration and no `nodejs_compat`.

The trade: commands needing native or wasm backends are unavailable here —
`sqlite3`, `python3`, `js-exec` and `tar` throw. Everything else works normally,
including `gzip`, `gunzip`, `zcat` and `rg -z`, which the Node-free build
implements without `node:zlib`.
[`@nanocodana/nodejs`](https://www.npmjs.com/package/@nanocodana/nodejs) uses the
full shell and has all of them.

Need the agent but not the shell? Import
`@nanocodana/core/no-bash` — the same API without the bundled shell (~1.2 MB).

Configure it by passing an object instead of a boolean:

```ts
new NanoCodana({ model, virtualBash: { env: { CI: '1' }, maxCommandCount: 500 } })
```

Set `virtualBash: false` to drop the tool entirely.

**Docs:** <https://nanocodana.github.io/docs/core/> · MIT

# NanoCodana on Cloudflare Workers

`@nanocodana/core` running on **workerd**, with the project stored in **D1**
instead of on disk. There is no filesystem here at all — the database *is* the
filesystem, hydrated lazily per request and persisted back in one batch.

This is [`apps/serverless`](../serverless) ported to a real edge runtime. The
agent logic is identical; only the store, the secret source, and the write flush
change. It exists to prove the claim rather than assert it: everything below was
verified against `wrangler dev`, which runs the same `workerd` binary
Cloudflare runs in production.

## Run it

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars   # add ANTHROPIC_API_KEY
```

```bash
npm run db:setup                 # create the local D1 tables + seed a demo project
```

```bash
npm run dev
```

Local dev needs **no Cloudflare account** — D1 runs on a local SQLite file under
`.wrangler/state`, and `wrangler dev` never phones home.

| Endpoint | |
|---|---|
| `GET /health` | runtime + D1 check, no API key needed |
| `GET /files?projectId=acme` | read the project straight out of D1 |
| `POST /agent` | `{ projectId, prompt }` — run one turn |

```bash
curl -s localhost:8787/health
```

```bash
curl -s localhost:8787/agent -X POST -H 'content-type: application/json' -d '{"projectId":"acme","prompt":"Read src/config.ts and change the port to 9090."}'
```

## What running it actually showed

**One static `node:zlib` import decides whether this Worker starts at all.**
Core imports zero Node builtins. But its virtual shell, `just-bash/browser`, has
two static top-level `import ... from "node:zlib"` for `gzip`/`gunzip`/`zcat` and
rg's gzip-search. Browser bundlers auto-polyfill `node:zlib`, which is why
nothing has ever noticed. workerd does not, and a *static* import is fatal:

```
✘ [ERROR] service core:user:nanocodana-agent: Uncaught Error: No such module "node:zlib".
✘ [ERROR] The Workers runtime failed to start.
```

A boot failure, not a degraded runtime. There are two ways out, and this app
takes the second:

| | |
|---|---|
| `"compatibility_flags": ["nodejs_compat"]` | everything works, including `gzip`. Adds a Node polyfill layer. |
| `"alias": { "node:zlib": "./src/zlib-shim.js" }` | **zero Node surface.** `gzip`/`gunzip`/`zcat`/`rg -z` throw a clear error; nothing else changes. |

Verified with the alias and *no* compat flag: `Bash` (`ls -R`, `wc -l`), `Grep`,
`Edit`, and the full D1 round trip all work untouched, and `gzip` fails with an
actionable message rather than a mystery. Swap to the flag if you need gzip in
the shell.

**Lazy hydration pays off, and whole-tree tools defeat it.** Reading one file
fetched `1/10` from D1. A turn using `Grep` fetched `10/10`: `Glob`, `Grep`, and
`LS` enumerate the tree, which materializes every lazy provider. Scope those
tools, or hydrate eagerly, when the project is large.

**Prompt caching works at the edge.** Core's Anthropic caching middleware needs
nothing extra here — turns came back with ~97% of input tokens served as cache
reads.

**Bundle size is not a problem.** `npm run bundle` reports **4196 KiB raw /
816 KiB gzipped**, against Workers' 3 MB gzipped limit on the free plan.

**`virtualBash: false` does not help here.** The obvious move — drop the shell you
don't need — has no effect on a Worker: bundle output was byte-identical and the
Worker still refused to boot. No bundler can eliminate a *reachable* dynamic
import based on a runtime flag, so `just-bash` (and its `node:zlib`) is in the
build either way. The option is real, but what it saves is a code-splitting
bundler *fetching* the chunk — a browser initial-paint win, not a bundle-size one.

**What *does* shrink the bundle: aliasing the shell itself.** Since the only
runtime reference to just-bash is one dynamic import, pointing that import at a
stub removes the shell — and with it the `node:zlib` problem, since zlib came
from just-bash in the first place. Measured:

| Build | raw | gzipped | shell |
|---|---|---|---|
| Full agent (default here) | 4196 KiB | 816 KiB | ✅ Bash |
| `just-bash/browser` aliased out | **2544 KiB** | **448 KiB** (−45%) | ❌ |

Verified working: 9 tools — Read, Write, Edit, MultiEdit, Delete, Glob, Grep, LS,
TodoWrite — all core-native and unaffected. Only `Bash` disappears.

**`node:zlib` is the only genuine Node dependency in the shell.** Audited the
whole browser bundle: two `node:zlib` imports, and that's it. Every `Buffer`
reference is feature-detected (`typeof Buffer < "u" ? … : fallback`), and the
`process`/`setImmediate` hits are entries in just-bash's own sandbox denylist,
not calls. So one alias really does buy a Node-free Worker.

## Why the shim is a stub, not a polyfill

The obvious upgrade — back `node:zlib` with [fflate](https://github.com/101arrowz/fflate)
so the compression commands actually work — takes more than a zlib replacement.
Two things block it, both worth knowing before anyone tries:

- **`Buffer` is also missing.** With fflate aliased in, `gzip` gets past
  `node:zlib` and dies on `gzip: Buffer is not defined` — `gzip.ts:271` calls
  `Buffer.from(data).toString("latin1")` with no feature guard. `Buffer` is a
  *global*, so it needs an esbuild `inject`, not an `alias`.
- **fflate can't enforce the decompression cap the same way.** node's zlib
  applies `maxOutputLength` *during* inflation, and just-bash depends on that:
  `gzip.ts:323` carries an explicit `@banned-pattern-ignore` justified by "zlib
  maxOutputLength bound allocation before decode", and it reserves
  `maxOutput * 2` bytes on that assumption. Checking the size *after* inflating
  would defeat it — a gzip with a lying ISIZE footer allocates unbounded first.
  A correct version uses fflate's streaming `Gunzip` with an incremental counter.

So a real polyfill is two shims plus a test suite borrowed from just-bash
(`gzip.security.test.ts`, `rg.decompression-limits.test.ts`), which belongs in
core's build rather than in an example app. Until then: a stub that fails loudly.

## Dropping the shell

If the agent doesn't need `Bash`, two changes cut the bundle nearly in half and
remove the `node:zlib` problem at its source. In `wrangler.jsonc`, swap which
module is aliased:

```jsonc
"alias": { "just-bash/browser": "./src/no-bash-shim.js" }
```

and pass `virtualBash: false` when constructing the agent in `src/worker.js`.
Both shims are committed here so the swap is one line each way.

`virtualBash: false` **alone does nothing** — the alias is what removes the
module. See the finding above for why.

## `await` vs `ctx.waitUntil`

`waitUntil` keeps the isolate alive past the response, but guarantees nothing
about ordering against the *next* request. So the file flush is **awaited** —
a client that edits a file and immediately re-reads it must not miss its own
write — while the usage-log row, which nothing reads back, is handed to
`waitUntil`. Durability the caller depends on belongs before the response.

The flush is a single `db.batch()` round trip rather than one write per file,
since `onFilesChange` is synchronous and can only collect statements.

## Deploying

```bash
npx wrangler d1 create nanocodana-files
```

Paste the returned id into `wrangler.jsonc`, apply the schema remotely, and set
the key as a real secret (never in `wrangler.jsonc`, which is committed):

```bash
npx wrangler d1 execute nanocodana-files --remote --file=./schema.sql
```

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

```bash
npm run deploy
```

`/agent` has **no authentication** — it's a demo. Anything public needs auth in
front of it, since the endpoint runs a coding agent against your database.

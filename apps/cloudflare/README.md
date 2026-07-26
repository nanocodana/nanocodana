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

**No `nodejs_compat`, no bundler config.** `wrangler.jsonc` has no
`compatibility_flags` and no `alias` block, because `@nanocodana/core` ships a
**Node-free build of its virtual shell**: just-bash's browser artifact,
re-bundled at core's build time with `node:zlib` aliased to a stub. The published
artifact has zero `node:` imports, so it loads on workerd as-is.

That matters more than it sounds. just-bash's browser bundle has two *static*
top-level `import ... from "node:zlib"` (for `gzip`/`gunzip`/`zcat` and `rg -z`).
Browser bundlers auto-polyfill `node:zlib`, which is why this went unnoticed for
years — but workerd doesn't, and a static import is fatal rather than degrading:

```
✘ [ERROR] Uncaught Error: No such module "node:zlib".
✘ [ERROR] The Workers runtime failed to start.
```

Four optional commands taking down the whole shell. Vendoring moves that decision
into core's build so no consumer ever meets it. The cost is that
`gzip`/`gunzip`/`zcat`/`rg -z` throw here; everything else — `Bash`, `Grep`,
`Glob`, `LS` and the file tools — works untouched. On Node, `@nanocodana/nodejs`
uses the real just-bash and has all of them.

**Lazy hydration pays off, and whole-tree tools defeat it.** Reading one file
fetched `1/10` from D1. A turn using `Grep` fetched `10/10`: `Glob`, `Grep`, and
`LS` enumerate the tree, which materializes every lazy provider. Scope those
tools, or hydrate eagerly, when the project is large.

**Prompt caching works at the edge.** Core's Anthropic caching middleware needs
nothing extra here — turns came back with ~97% of input tokens served as cache
reads.

**Bundle size is not a problem.** `npm run bundle` reports **4145 KiB raw /
808 KiB gzipped**, against Workers' 3 MB gzipped limit on the free plan.

**`virtualBash: false` doesn't shrink a Worker bundle.** The obvious move — drop
the shell you don't need — has no effect here: output is byte-identical. No
bundler can eliminate a *reachable* dynamic import based on a runtime flag, so
the shell is in the build either way. The option is still real, but what it saves
is a code-splitting bundler *fetching* the chunk — a browser initial-paint win,
not a bundle-size one. To actually drop the shell from a single-file build, alias
`@nanocodana/core`'s `dist/shell/bundle.js` to a stub in `wrangler.jsonc`; that
takes this Worker from 808 KB to roughly 450 KB gzipped, leaving the nine
core-native tools (Read, Write, Edit, MultiEdit, Delete, Glob, Grep, LS, Todo).

## Configuring the shell

`virtualBash` also accepts options, forwarded to just-bash:

```js
new NanoCodana({ model, virtualBash: { env: { CI: '1' }, maxCommandCount: 500 } })
```

Availability differs by package, because the shell build differs. Here — core's
Node-free build — `gzip`/`gunzip`/`zcat`/`rg -z` throw, and the wasm-backed
commands (`sqlite3`, `python3`, `js-exec`, `tar`) are unavailable regardless of
options. On `@nanocodana/nodejs` all of them work, and `{ python: true }` /
`{ javascript: true }` switch on `python3` and `js-exec`.

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

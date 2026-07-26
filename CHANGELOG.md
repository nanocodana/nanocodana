# Changelog

All four `@nanocodana/*` packages share a version and are released together.

## 0.2.0

### The virtual shell is now vendored into `@nanocodana/core`

Core no longer depends on `just-bash` at runtime. Its build re-bundles just-bash's
published browser artifact once, with `node:zlib` aliased to a stub, and ships the
result as a single self-contained file.

**Why:** just-bash's browser bundle has two *static* top-level
`import ... from "node:zlib"`. Browser bundlers auto-polyfill that, so it went
unnoticed for years — but runtimes without a Node polyfill layer refuse to load
the module at all. On Cloudflare Workers the build succeeded and the Worker then
failed to start:

```
✘ Uncaught Error: No such module "node:zlib".
✘ The Workers runtime failed to start.
```

Four optional commands taking down the entire shell, with no way for a consumer
to fix it from their side other than per-bundler configuration.

| | 0.1.1 | 0.2.0 |
|---|---|---|
| `@nanocodana/core` install | 129 MB / 169 packages | **59 MB / 112 packages** |
| `@nanocodana/core` download | 49.6 kB | 415 kB |
| Runs on workerd | needs `nodejs_compat` or an alias | **works as-is** |

Vendoring is what makes this possible rather than merely cheaper: as a normal
dependency `just-bash` adds 76 MB and 77 packages to a core install, and on
workerd the `node:zlib` import means it does not run at any size. Still true as
of just-bash 3.2.0, which this release builds against.

`apps/cloudflare` demonstrates the result: no `compatibility_flags`, no `alias`
block, no shims.

#### ⚠️ Breaking: `gzip`, `gunzip`, `zcat` and `rg -z` now throw in core and browser

These worked wherever `node:zlib` resolved — on Node, and in browser bundles whose
bundler polyfilled it (webpack, Next.js). They now throw a clear error naming the
cause. Everything else is unchanged: `Bash`, `Grep`, `Glob`, `LS` and the file
tools behave identically.

**`@nanocodana/nodejs` is unaffected** — it uses the full just-bash and keeps
`gzip`, `sqlite3`, `tar` and the rest. If you need compression in the shell on
Node, use that adapter.

### ⚠️ Breaking: host shell access is off by default on `@nanocodana/nodejs`

`NodeAgent` no longer lets the agent escalate to the real machine shell unless you
ask for it:

```ts
NodeAgent({ model, hostShell: true })   // was the implicit behaviour
```

Handing out a shell shouldn't be the default for a library. Anything running
someone else's prompts — a server, a hosted product, a CI job — now gets a
sandbox with no path to the host, which is the safe default for that shape. Local
developer tools opt in; `codana` does, since `git` and `npm` are the point.

This is a **capability** gate, not just an approval gate. With it off:

- the `host` parameter is not offered to the model at all, so it can't be asked for
- an explicit `host: true` is **refused** (exit 126), never quietly downgraded to a
  sandbox run — a downgrade would misreport where the command executed
- the tool description tells the model the host is unreachable, so it stops
  suggesting `git`/`npm` and reports the limitation instead

Set `hostShell: true` to restore the previous behaviour. Host runs still require
approval via `needsApproval`.

### Added: `virtualBash` accepts configuration

`virtualBash` now takes `boolean | VirtualShellOptions`, forwarded to just-bash:

```ts
new NanoCodana({ model, virtualBash: { env: { CI: '1' }, maxCommandCount: 500 } })
```

`fs` and `cwd` remain owned by the tool and cannot be overridden. Availability
differs by package: on `@nanocodana/nodejs`, `{ python: true }` and
`{ javascript: true }` enable `python3` and `js-exec`; on core and browser the
wasm-backed commands are unavailable regardless.

### Added: a smaller install via `--omit=optional`

The three native/prebuilt payloads are now `optionalDependencies` on both
`@nanocodana/nodejs` and `@nanocodana/cli`. Each unlocks exactly one capability
and is dead weight otherwise, and the shell already dynamic-imports all three
inside `try`/`catch` with an actionable error:

| dependency | unlocks | absent |
|---|---|---|
| `node-liblzma` | `tar -J` (xz) | error naming the package |
| `@mongodb-js/zstd` | `tar --zstd` | error naming the package |
| `@vscode/ripgrep` | native ripgrep | falls back to the JS implementation |

```bash
npm install @nanocodana/nodejs --omit=optional
```

| | full | `--omit=optional` |
|---|---|---|
| `@nanocodana/nodejs` | 103 MB / 184 packages | **92 MB / 145 packages** |
| `@nanocodana/cli` | 38 MB / 50 packages | **28 MB / 8 packages** |

Nothing else changes: the other ~80 commands, `sqlite3`, `python3`, `js-exec`
and every file tool are unaffected. The shell matrix runs green in both
configurations — the two compression cases assert on *how* they fail when the
dependency is missing, so a crash or a silent wrong answer would still be caught.

### Fixed

- **`virtualBash: false` now drops the Bash tool on `@nanocodana/nodejs`.** It
  previously only disabled core's virtual shell while the adapter added its own
  unconditionally, so the documented option did nothing.
- Passing shell options to `NodeAgent` no longer enables both core's shell and
  the adapter's.
- Corrected the `virtualBash` docs, which claimed a bundler could tree-shake the
  shell away. No bundler can eliminate a *reachable* dynamic import based on a
  runtime flag — the option keeps a code-splitting bundler from *fetching* the
  chunk, but single-file builds contain it either way.

### Testing

New `packages/cli/shell.test.mjs` exercises the shell across all four just-bash
backends — pure JS, worker, wasm, native — plus the optional-dependency tier and
the host-escalation gate. The worker- and wasm-backed commands load files at
runtime, so they break silently when the package is bundled without its assets:
the module still imports and the command still exists, failing only when run.
Verified to catch exactly that.

Point it at any build to diff that build against the baseline:

```bash
NANOCODANA_ADAPTER=../../some/bundle.js node shell.test.mjs
```

## 0.1.1

README fixes for the npm package pages. No code changes.

## 0.1.0

Initial public release.

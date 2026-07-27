# Changelog

All four `@nanocodana/*` packages share a version and are released together.

## 0.2.0

### The virtual shell is now vendored into `@nanocodana/core`

Core no longer depends on `just-bash` at runtime. Its build re-bundles just-bash's
published browser artifact once, with `node:zlib` aliased to an fflate-backed
implementation, and ships the result as a single self-contained file.

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

#### `gzip`, `gunzip`, `zcat` and `rg -z` now work on browser and edge

They previously needed `node:zlib`, so they worked on Node and in browser bundles
whose bundler polyfilled it (webpack, Next.js), and failed everywhere else. The
vendored build supplies its own implementation instead, so they work the same on
every runtime. This costs 10 kB.

The replacement preserves a guarantee that is easy to lose. Every call site passes
`maxOutputLength`, and Node's zlib enforces it *during* inflation — that is what
makes a decompression bomb a bounded error rather than an out-of-memory crash. A
drop-in that inflates first and checks afterwards would have the bomb in memory
before the check ran, which on a 128 MB isolate is a denial of service. So the
replacement drives fflate's synchronous streaming decoder and counts bytes per
chunk, aborting mid-inflation. `packages/cli/shell.test.mjs` asserts this with a
payload that expands 1024x.

### The Node adapter deliberately does *not* vendor

`@nanocodana/nodejs` depends on `just-bash` normally. Vendoring solves a
correctness problem that only exists off Node: there, `node:zlib` resolves, and
just-bash's worker and CPython assets resolve inside `node_modules` exactly as
designed. Vendoring it there bought smaller installs at the cost of a second
build script reproducing a fragile asset layout, so the adapter now uses the
package directly and the layout is encoded in exactly one place — the CLI's
bundler, which is the only thing that needs it.

| | vendored | as a dependency |
|---|---|---|
| `@nanocodana/nodejs` install | 103 MB / 184 packages | **141 MB / 212 packages** |
| `@nanocodana/nodejs` download | 7.65 MB | **18.7 kB** |

#### Added: `@nanocodana/core/no-bash`

The same API as `@nanocodana/core` without the bundled shell. The shell is reached
through a *reachable* dynamic import, and no bundler can drop one of those on a
runtime flag — `virtualBash: false` stops a code-splitting bundler from *fetching*
the chunk, but the bytes are still in the build. Omitting it therefore needs a
separate entry point.

This matters most for `@nanocodana/nodejs`, which supplies its own Bash tool and
so would otherwise ship two complete shells. Measured on a bundled Node app:
**3.58 MB**, rising to **4.81 MB** the moment anything imports core's default
entry — a 1.23 MB delta against a 1.22 MB shell. The adapter now imports
`/no-bash` throughout, and a test asserts core's shell never reaches its bundle.

Use it when something else provides the Bash tool, or with `virtualBash: false`.

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

### Added: `codana -p` — one prompt, no TUI

The CLI could only be used interactively: `cli.input[0]` was read as a command
name, so `codana "fix the bug"` was an unknown command, and a piped invocation
crashed inside Ink with `Raw mode is not supported`. Now:

```bash
codana -p "write a commit message" | pbcopy
git diff | codana -p "review this"
codana -p "which tests are failing?" --json | jq -r .text
```

Piped stdin becomes context, so the caller doesn't have to quote a diff into the
prompt. Streamed text goes to stdout and progress to stderr, so a pipe receives
only the answer. `--json` emits one object with the text, the tools used, which
were denied, and token usage.

**Approval-gated tools are denied by default, and the run exits 2.** There is
nobody to answer a prompt, and the stream cannot resume until every request has a
response, so the only options are yes to everything or no to everything. No is
the default, which makes `-p` safe to pipe into without reading this first: it
reads, searches and reasons across the project, and reports what it wanted to do
rather than doing it. `--yolo` answers yes, including host-shell escalation.

Two consequences worth knowing:

- **`Bash` is denied too**, unlike in interactive chat where it self-governs via
  its `host` argument. Sandbox runs are only harmless when a human is watching:
  with `Write` denied and `Bash` free, the model simply reaches for `echo > file`
  and the denial becomes theatre. That is measured, not theoretical — it did
  exactly that, wrote the file, and the run still exited 2 claiming it had been
  blocked. So without `--yolo` what remains genuinely cannot mutate: `Read`,
  `Grep`, `Glob`, `LS`.
- **MCP servers are only passed with `--yolo`.** The deny-list is a list of tool
  *names*, and an MCP server contributes names we don't know, so nothing could
  deny them — a configured filesystem or git server would be fully callable while
  the run reported everything blocked.

Exit codes: `0` ok, `1` error, `2` something was denied — so a script can tell
"failed" from "refused".

Restoring the sandbox safely, by backing it with a read-only filesystem instead
of a longer deny-list, is planned for a later release.

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

Three native/prebuilt payloads are optional. Each unlocks exactly one capability
and is dead weight otherwise, and the shell already dynamic-imports all three
inside `try`/`catch` with an actionable error:

| dependency | unlocks | absent |
|---|---|---|
| `node-liblzma` | `tar -J` (xz) | error naming the package |
| `@mongodb-js/zstd` | `tar --zstd` | error naming the package |
| `@vscode/ripgrep` | native ripgrep | falls back to the JS implementation |

just-bash 3.2.0 declares the two codecs as `optionalDependencies` upstream, so we
only declare ripgrep; one flag prunes all three.

```bash
npm install @nanocodana/nodejs --omit=optional
```

| | full | `--omit=optional` |
|---|---|---|
| `@nanocodana/nodejs` | 141 MB / 212 packages | **131 MB / 175 packages** |
| `@nanocodana/cli` | 36 MB / 50 packages | **27 MB / 8 packages** |

Nothing else changes: the other ~80 commands, `sqlite3`, `python3`, `js-exec` and
every file tool are unaffected, and the shell matrix runs green in both
configurations — the two compression cases assert on *how* they fail when the
dependency is missing, so a crash or a silent wrong answer would still be caught.

CPython is a separate case: it ships inside just-bash's own tarball, so npm's
optional mechanism cannot reach it. It is only read when `python: true`, and a
deployment that leaves python off can delete
`node_modules/just-bash/vendor/` for another ~10 MB.

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

New `packages/cli/shell.test.mjs`, 25 cases across every way this can break:

- **the four just-bash backends** — pure JS, worker, wasm, native. The last three
  load files at runtime, so they break silently when a package is bundled without
  its assets: the module still imports and the command still exists, failing only
  when run. Smoke tests that import source modules cannot see this.
- **the optional-dependency tier** — asserting on *how* `tar -J` and `tar --zstd`
  fail when the native codec is absent, so a supported install stays supported.
- **core's polyfilled compression path** — everything else runs on the Node
  adapter and its real `node:zlib`, so these four commands had no coverage at all
  on the build where they were most likely to break. Plus a decompression bomb
  that must abort mid-inflation.
- **one shell per bundle** — asserts against esbuild's module graph that core's
  shell never reaches `@nanocodana/nodejs`. That fix is a convention spread over a
  dozen files, and a single stray import would silently undo it.
- **the host-escalation gate** — that the parameter is hidden when disabled, and
  that an explicit `host: true` is refused rather than downgraded.

Point it at any build to diff that build against the baseline:

```bash
NANOCODANA_ADAPTER=../../some/bundle.js node shell.test.mjs
```

CI additionally boots the published CLI bundle and asserts the tarball contains
its `bin` and CPython — `npm pack` alone will happily produce a 5.9 kB tarball
with neither and exit 0.

## 0.1.1

README fixes for the npm package pages. No code changes.

## 0.1.0

Initial public release.

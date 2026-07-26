// Bundles `codana` into a single file plus the handful of assets that cannot be
// inlined, so installing the CLI pulls a few packages instead of ~300.
//
// WHAT CANNOT BE BUNDLED, AND WHY
//
//   native addons   @mongodb-js/zstd, node-liblzma — .node files, compiled per
//                   platform. esbuild refuses them outright.
//   executables     @vscode/ripgrep ships an `rg` binary that gets spawned.
//   wasm payloads   sql.js (sqlite3) and quickjs-emscripten (js-exec) load .wasm
//                   at runtime; the glue bundles, the payload cannot.
//
// Those stay as real dependencies. Everything else — the TUI, the AI SDK, the
// agent, the whole shell — collapses into one file.
//
// WHERE THE SHELL ASSETS COME FROM
//
// just-bash, resolved *through* @nanocodana/nodejs rather than from here — see
// the note above `adapterEntry` for why that distinction is load-bearing. The
// adapter depends on just-bash normally instead of vendoring it, so this script
// is the only place in the repo that reproduces just-bash's asset layout, and
// the only place that bundles at all.
//
// THE LAYOUT IS LOAD-BEARING. The shell resolves its worker files and CPython
// assets by walking relative paths from whichever directory the calling module
// ends up in, and the two rules conflict unless the depth is exactly right:
//
//   sqlite3 looks for  <dir>/sqlite3-worker.js          → workers must sit
//                                                         BESIDE the bundle
//   python3's worker looks for  <dir>/../../../vendor/  → that dir must be
//                                                         3 levels below vendor
//
// Hence `dist/bundle/lib/` for the bundle and all three workers, with `vendor/`
// at the package root. Verified by shell.test.mjs — a flat or two-deep layout
// silently loses python3, and a chunks/ subdirectory silently loses sqlite3.
import { build } from 'esbuild'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageRootOf } from '../../../build/package-root.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')
const outDir = join(pkgRoot, 'dist', 'bundle', 'lib')
const vendorDir = join(pkgRoot, 'vendor')

// Kept out of the bundle — see the header.
//
// THIS IS WHY THE CLI'S MANIFEST LOOKS INVERTED. Everything the CLI imports is
// inlined into codana.mjs here, so it belongs in `devDependencies`; declaring
// those as runtime `dependencies` is what made the published install 163 MB.
// What remains in `dependencies` is only what a bundler cannot inline: native
// .node addons, and wasm/binaries loaded from disk at runtime. Of those, three
// are `optionalDependencies` — each unlocks one capability and errors clearly
// when absent — while quickjs stays required because the CLI enables js-exec by
// default.
//
// sql.js is deliberately NOT here: see BUNDLED_WORKERS below.
const EXTERNAL = [
  'quickjs-emscripten',
  '@mongodb-js/zstd',
  'node-liblzma',
  '@vscode/ripgrep',
]

// Copied verbatim from just-bash. The adapter depends on just-bash normally
// rather than vendoring it, so this is the one place in the repo that has to
// reproduce its asset layout — and the one place that bundles at all.
//
// js-exec's worker stays verbatim on purpose: quickjs-emscripten resolves its
// wasm variant dynamically, and bundling it breaks the worker's wire protocol
// ("Malformed worker response: invalid protocol token"). Not worth ~7 MB.
const WORKERS = ['worker.js', 'js-exec-worker.js']

// Re-bundled with their JS dependency inlined, so the dependency can be dropped
// and only its wasm payload shipped.
//
// sql.js installs 19 MB but its live path is 45 kB of glue plus a 660 kB .wasm —
// the rest is asm.js fallbacks and debug builds for environments that predate
// wasm, shipped to everyone because the package has no `files` field. Inlining
// the glue here and copying the wasm beside it removes the dependency outright.
//
// The `__dirname` shim in the banner is required: sql.js locates its wasm via
// __dirname, which does not exist in ESM.
const BUNDLED_WORKERS = [
  { worker: 'sqlite3-worker.js', assets: [['sql.js', 'dist/sql-wasm.wasm']] },
]

const CJS_GLOBALS_BANNER =
  "import{createRequire as __cr}from'node:module';" +
  "import{fileURLToPath as __f}from'node:url';" +
  "import{dirname as __d}from'node:path';" +
  'const require=__cr(import.meta.url);' +
  'const __filename=__f(import.meta.url);' +
  'const __dirname=__d(__filename);'

// Resolved THROUGH @nanocodana/nodejs, not from here. The CLI does not depend on
// just-bash and must not: declaring its own range would let npm satisfy the CLI
// and the adapter with different copies, and then codana.mjs would contain shell
// code bundled from the adapter's copy while the workers and CPython beside it
// came from ours. Same version, mismatched builds, failing only at runtime.
//
// Going through the adapter makes the assets provably the same copy that got
// inlined into the bundle.
const adapterEntry = fileURLToPath(import.meta.resolve('@nanocodana/nodejs'))
const { dir: shellPkgDir } = packageRootOf(
  createRequire(adapterEntry).resolve('just-bash'),
  'just-bash',
)
const chunksDir = join(shellPkgDir, 'dist', 'bundle', 'chunks')

await rm(outDir, { recursive: true, force: true })
await rm(vendorDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

await build({
  entryPoints: [join(pkgRoot, 'dist', 'index.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: join(outDir, 'codana.mjs'),
  external: EXTERNAL,
  alias: { 'react-devtools-core': join(here, 'shims', 'react-devtools-core.mjs') },
  legalComments: 'none',
  banner: {
    // No shebang here: esbuild preserves the entry point's own, and a second one
    // on line 2 is a syntax error rather than a comment.
    //
    // Bundled ESM still contains CJS `require` calls from inlined dependencies.
    js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);",
  },
})

for (const worker of WORKERS) {
  await cp(join(chunksDir, worker), join(outDir, worker))
}

for (const { worker, assets } of BUNDLED_WORKERS) {
  await build({
    entryPoints: [join(chunksDir, worker)],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: join(outDir, worker),
    external: EXTERNAL,
    legalComments: 'none',
    banner: { js: CJS_GLOBALS_BANNER },
  })
  for (const [pkg, assetPath] of assets) {
    const { dir } = packageRootOf(fileURLToPath(import.meta.resolve(pkg)), pkg)
    await cp(join(dir, ...assetPath.split('/')), join(outDir, assetPath.split('/').pop()))
  }
}

// CPython, for python3. Large (~10 MB) but already downloaded as part of
// just-bash — copying just moves where it lives, it doesn't add weight.
await cp(join(shellPkgDir, 'vendor'), vendorDir, { recursive: true })

// Apache-2.0 requires the licence to travel with redistributed builds, and
// just-bash's code ends up inside codana.mjs.
await cp(join(shellPkgDir, 'LICENSE'), join(outDir, 'LICENSE.just-bash'))

const bytes = (await readFile(join(outDir, 'codana.mjs'))).byteLength
console.log(
  `  codana: ${(bytes / 1024 / 1024).toFixed(2)} MB + ${WORKERS.length + BUNDLED_WORKERS.length} workers + CPython`,
)

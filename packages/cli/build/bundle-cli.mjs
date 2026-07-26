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
// @nanocodana/nodejs already vendors the shell and lays its assets out in
// dist/shell/lib (workers, sqlite3's wasm) with CPython at its package root.
// We copy that arrangement rather than re-deriving it from just-bash: the CLI
// has no just-bash dependency of its own, and duplicating the sql.js inlining
// here meant two places to keep in step.
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
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, '..')
const outDir = join(pkgRoot, 'dist', 'bundle', 'lib')
const vendorDir = join(pkgRoot, 'vendor')

// Kept out of the bundle — see the header. These remain in `dependencies`.
//
// sql.js is deliberately NOT here: see BUNDLED_WORKERS below.
const EXTERNAL = [
  'quickjs-emscripten',
  '@mongodb-js/zstd',
  'node-liblzma',
  '@vscode/ripgrep',
]

// Taken as-is from @nanocodana/nodejs/dist/shell/lib, which built them.
//
// `bundle.js` is deliberately absent: esbuild inlines it into codana.mjs when it
// follows the adapter's import. Only what the shell loads by *path* at runtime
// needs to be a file on disk.
//
// LICENSE.just-bash travels with them — the shell's code ends up inside
// codana.mjs, so the Apache-2.0 notice has to ship too.
const SHELL_ASSETS = [
  'worker.js',
  'js-exec-worker.js',
  'sqlite3-worker.js',
  'sql-wasm.wasm',
  'LICENSE.just-bash',
]

function packageRootOf(startFile, name) {
  let dir = dirname(startFile)
  const { root } = parse(dir)
  while (true) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
      if (pkg.name === name) return dir
    }
    if (dir === root) throw new Error(`Could not locate the ${name} package root`)
    dir = dirname(dir)
  }
}

const adapterDir = packageRootOf(
  fileURLToPath(import.meta.resolve('@nanocodana/nodejs')),
  '@nanocodana/nodejs',
)
const adapterShellDir = join(adapterDir, 'dist', 'shell', 'lib')

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

for (const asset of SHELL_ASSETS) {
  const from = join(adapterShellDir, asset)
  if (!existsSync(from)) {
    throw new Error(
      `Missing ${asset} in ${adapterShellDir}. Build @nanocodana/nodejs first — ` +
        `the CLI copies its shell assets from the adapter, it no longer derives them from just-bash.`,
    )
  }
  await cp(from, join(outDir, asset))
}

// CPython, for python3. Large (~10 MB) but already present as part of the
// adapter — copying just moves where it lives, it doesn't add weight.
await cp(join(adapterDir, 'vendor'), vendorDir, { recursive: true })

const bytes = (await readFile(join(outDir, 'codana.mjs'))).byteLength
console.log(
  `  codana: ${(bytes / 1024 / 1024).toFixed(2)} MB + ${SHELL_ASSETS.length} shell assets + CPython`,
)

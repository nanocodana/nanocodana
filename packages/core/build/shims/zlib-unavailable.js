// Stand-in for node:zlib in the vendored browser shell (see build/bundle-shell.mjs).
//
// just-bash's browser bundle statically imports node:zlib for four commands —
// gzip, gunzip, zcat, and `rg -z`. A *static* import means any runtime without a
// Node polyfill layer refuses to load the module at all: on workerd the Worker
// fails to start with `No such module "node:zlib"`, and strict bundlers refuse
// to resolve it. That takes down the whole shell for four optional commands.
//
// Aliasing the import here keeps every other command working with zero Node
// compatibility surface. The four compression commands throw instead.
//
// Why a stub and not a real implementation (e.g. fflate): making them genuinely
// work needs more than a zlib replacement. just-bash's gzip path also reaches
// the `Buffer` global unguarded, and node's `maxOutputLength` bounds allocation
// *during* inflation — a guarantee just-bash depends on explicitly (its gzip.ts
// carries a `@banned-pattern-ignore` citing it). A drop-in that inflates first
// and checks after would quietly weaken that. If upstream lands the fix
// (vercel-labs/just-bash#81), this file and the build step both go away.
const unavailable = (name) => () => {
  throw new Error(
    `${name} is unavailable: @nanocodana/core ships a Node-free build of the ` +
      `virtual shell, and ${name} requires node:zlib. Every other command works. ` +
      `On Node, use @nanocodana/nodejs, whose shell has the real implementation.`,
  )
}

export const gzipSync = unavailable('gzip')
export const gunzipSync = unavailable('gunzip')

// Read only at call time, but exported with real values so module evaluation and
// incidental property access behave predictably.
export const constants = {
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
}

export default { gzipSync, gunzipSync, constants }

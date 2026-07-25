// Stand-in for `just-bash/browser`, aliased in at build time (see wrangler.jsonc).
//
// Core reaches just-bash through exactly one runtime reference — a dynamic
// `import('just-bash/browser')` inside Bash.execute. `virtualBash: false` stops
// that from ever running, but a *reachable* dynamic import is still bundled, so
// the shell (and its node:zlib import) ships either way.
//
// Aliasing the module is what actually removes it. Paired with
// `virtualBash: false` the stub below is never even constructed — it exists only
// to satisfy the import so the bundler has something to point at.
//
// This also makes the node:zlib alias unnecessary: zlib came from just-bash, and
// just-bash is now gone.
export class Bash {
  constructor() {
    throw new Error(
      'The virtual Bash tool is not available: this build aliases just-bash away ' +
        'to shrink the bundle. Remove the "just-bash/browser" alias in ' +
        'wrangler.jsonc (and drop virtualBash: false) to restore shell access.',
    )
  }
}

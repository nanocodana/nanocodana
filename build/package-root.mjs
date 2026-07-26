// Shared by the package bundlers (packages/core/build/bundle-shell.mjs and
// packages/cli/build/bundle-cli.mjs). Repo-internal tooling — not published:
// every package's `files` field ships only `dist`, so this never leaves the
// repo and the relative imports back up to it are safe.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

/**
 * Walk up from a resolved module file to the root of the package that owns it.
 *
 * Needed because `import.meta.resolve` hands back a *file* inside the package,
 * while the assets these builds copy — worker chunks, CPython, LICENSE — are
 * addressed from the package root. Reading `<name>/package.json` directly is
 * not an option: just-bash's exports map does not expose it, so a bare
 * `resolve('just-bash/package.json')` throws ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * The name check matters. Walking up from a nested dependency would otherwise
 * stop at the first package.json it meets, which may belong to something else
 * entirely depending on how npm hoisted the tree.
 *
 * @param {string} startFile absolute path to a file inside the package
 * @param {string} name the package's declared `name`
 * @returns {{ dir: string, pkg: Record<string, unknown> }}
 */
export function packageRootOf(startFile, name) {
  let dir = dirname(startFile)
  const { root } = parse(dir)
  while (true) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
      if (pkg.name === name) return { dir, pkg }
    }
    if (dir === root) throw new Error(`Could not locate the ${name} package root`)
    dir = dirname(dir)
  }
}

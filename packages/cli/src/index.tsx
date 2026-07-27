#!/usr/bin/env node
// Entry point for the `codana` binary, and the library face of the published
// bundle.
//
// The CLI body lives in ./cli-main.js and is loaded only when this file is the
// process entry. That matters because build/bundle-cli.mjs compiles this module
// into the single file we publish, and the shell matrix drives that file
// directly (NANOCODANA_ADAPTER=./dist/bundle/lib/codana.mjs) to verify the
// artifact users actually install — its workers, sql.js wasm and CPython all
// resolve relative to the bundle, so the source tree passing proves nothing
// about the bundle. Importing it must therefore not parse argv, render a TUI,
// or call process.exit.
//
// esbuild inlines the dynamic import below (no code splitting), so the bin
// remains one file.
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export { NodeAgent, loadSkillsFromDirs } from '@nanocodana/nodejs'

/**
 * True when this module is the process entry point.
 *
 * argv[1] must be realpath'd first. npm installs a bin as a *symlink*
 * (node_modules/.bin/codana -> ../@nanocodana/cli/dist/bundle/lib/codana.mjs),
 * and Node resolves the ESM main module to its real path while leaving argv[1]
 * as the link. Comparing them raw makes this false for every installed copy, so
 * the CLI exits 0 having done nothing — `npx`, `npm i -g` and local bin alike.
 * Tests that invoke the bundle by its real path do not see it.
 */
function isEntryPoint(): boolean {
  const argv1 = process.argv[1]
  if (!argv1) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href
  } catch {
    // argv[1] can be a name that isn't a file (a REPL eval, a deleted script).
    return import.meta.url === pathToFileURL(argv1).href
  }
}

if (isEntryPoint()) {
  await import('./cli-main.js')
}

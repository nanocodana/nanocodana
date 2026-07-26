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
import { pathToFileURL } from 'node:url'

export { NodeAgent, loadSkillsFromDirs } from '@nanocodana/nodejs'

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  await import('./cli-main.js')
}

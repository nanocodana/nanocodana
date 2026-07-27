// Static check for the plain-JS example apps.
//
// apps/node and apps/serverless are runnable demos, not libraries: their files
// execute on import and most of them call a model, so nothing can import them
// in CI. That left them with no coverage at all — an export could be renamed in
// a package and the examples would keep sitting there, broken, until someone ran
// one by hand.
//
// So check them without executing them:
//
//   1. parse every source file (`node --check`) — catches syntax errors
//   2. resolve each `@nanocodana/*` they import and assert the named bindings
//      they destructure actually exist on it
//
// (2) is the one that earns its keep. Renaming or dropping an export is exactly
// the kind of change that looks harmless in the packages and silently breaks
// every example downstream.
//
//   node ../../build/check-example.mjs .
import { readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, extname, relative, resolve } from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('usage: check-example.mjs <dir>')
  process.exit(2)
}

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs'])

// Dependencies the example declares. Importing a package it never declared is
// the failure that keeps recurring here — the CLI lost `ink`, `meow` and later
// `esbuild` exactly that way, each working only because npm had hoisted them —
// so check the manifest rather than trusting resolution to reveal it.
//
// (Resolution itself stays as `import(pkg)`, which finds the workspace copy.
// Resolving from the example's own directory would be stricter, but
// createRequire uses the `require` condition and these packages are ESM-only.
// In a workspace the two resolve to the same file anyway; the manifest check is
// what has actual teeth.)
const declared = (() => {
  try {
    const manifest = JSON.parse(readFileSync(join(resolve(target), 'package.json'), 'utf8'))
    return new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ])
  } catch {
    return null
  }
})()

async function sourceFiles(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) found.push(full)
  }
  return found
}

/** `import { a, b } from '@nanocodana/x'` -> [['@nanocodana/x', ['a','b']]] */
function nanocodanaImports(code) {
  const pattern = /import\s*\{([^}]+)\}\s*from\s*['"](@nanocodana\/[^'"]+)['"]/g
  return [...code.matchAll(pattern)].map(([, names, pkg]) => [
    pkg,
    names
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
      .filter((n) => n && n !== 'type'),
  ])
}

let failures = 0
const files = await sourceFiles(target)

for (const file of files) {
  const shown = relative(target, file)
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (err) {
    failures++
    console.log(`✗ ${shown} — syntax error`)
    console.log(`   ${String(err.stderr ?? err).split('\n').slice(0, 3).join('\n   ')}`)
    continue
  }

  for (const [pkg, names] of nanocodanaImports(readFileSync(file, 'utf8'))) {
    if (declared && !declared.has(pkg)) {
      failures++
      console.log(`✗ ${shown} — imports ${pkg}, which is not in this example's package.json`)
      continue
    }
    let exports
    try {
      exports = await import(pkg)
    } catch (err) {
      failures++
      console.log(`✗ ${shown} — cannot resolve ${pkg}`)
      console.log(`   ${err.message.split('\n')[0]}`)
      continue
    }
    const missing = names.filter((n) => !(n in exports))
    if (missing.length > 0) {
      failures++
      console.log(`✗ ${shown} — ${pkg} no longer exports: ${missing.join(', ')}`)
    }
  }
}

console.log(
  failures === 0
    ? `✓ ${files.length} example source file(s) parse and their @nanocodana imports resolve`
    : `\n${failures} FAILED`
)
process.exit(failures === 0 ? 0 : 1)


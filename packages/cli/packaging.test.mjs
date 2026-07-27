// Packaging invariants — offline, no API key.
//
// These are not shell tests. They assert properties of what we *ship*: which
// modules end up in which bundle, and whether the published artifacts are
// complete. Each one guards a mistake that produces no error at build time and
// no error at runtime — it just makes the wrong bytes reach users.
//
//   node packaging.test.mjs
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoPackages = join(here, '..')

let failures = 0

function check(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) {
    failures++
    for (const line of detail ?? []) console.log(`   ${line}`)
  }
}

/** Modules esbuild pulls into a single-file bundle of `entry`. */
async function bundledModules(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    external: ['quickjs-emscripten', '@mongodb-js/zstd', 'node-liblzma', '@vscode/ripgrep'],
  })
  const output = result.metafile.outputs[Object.keys(result.metafile.outputs)[0]]
  return Object.keys(output.inputs)
}

// ---------------------------------------------------------------------------
// Exactly one shell per bundle.
//
// @nanocodana/nodejs supplies its own Bash tool, so core's vendored shell is
// dead weight for it — but core reaches that shell through a *reachable*
// dynamic import, and no bundler can drop one of those on a runtime flag.
// Importing core's default entry anywhere in the adapter therefore adds ~1.2 MB
// that can never run: measured at 3.58 MB vs 4.81 MB for the same app.
//
// The defence is that every adapter file imports @nanocodana/core/no-bash. That
// is a convention across a dozen files, and one stray default import silently
// undoes it — nothing fails, the bundle just quietly grows. So assert it against
// the real module graph rather than trusting the convention.
{
  const entry = join(repoPackages, 'adapters', 'nodejs', 'dist', 'index.js')
  if (!existsSync(entry)) {
    check("core's shell stays out of @nanocodana/nodejs", false, [
      `${entry} not found — build @nanocodana/nodejs first`,
    ])
  } else {
    const leaked = (await bundledModules(entry)).filter((f) =>
      /core\/dist\/shell\/(bundle|register)/.test(f)
    )
    check("core's shell stays out of @nanocodana/nodejs", leaked.length === 0, [
      "core's shell reached the adapter's bundle via:",
      ...leaked.map((f) => `  ${f}`),
      "something imports '@nanocodana/core' instead of '@nanocodana/core/no-bash'",
    ])
  }
}

// ---------------------------------------------------------------------------
// The vendored shell must have no `node:` imports.
//
// core/build/bundle-shell.mjs already fails the build on this, but that guard
// only runs when core is rebuilt. This catches a stale or hand-edited artifact
// being published — the exact shape of the original bug, where the build
// succeeded and the Worker then refused to start.
{
  const bundle = join(repoPackages, 'core', 'dist', 'shell', 'bundle.js')
  if (!existsSync(bundle)) {
    check('vendored shell has zero node: imports', false, [`${bundle} not found — build core first`])
  } else {
    const code = await import('node:fs/promises').then((fs) => fs.readFile(bundle, 'utf8'))
    const found = [...new Set([...code.matchAll(/from\s*["'](node:[a-z_/]+)["']/g)].map((m) => m[1]))]
    check('vendored shell has zero node: imports', found.length === 0, [
      `found: ${found.join(', ')}`,
      'this artifact will not load on workerd — see core/build/bundle-shell.mjs',
    ])
  }
}

// ---------------------------------------------------------------------------
// Redistributed licences travel with the build.
//
// bundle.js contains just-bash's code (Apache-2.0) and fflate's (MIT), and the
// build runs esbuild with legalComments: 'none', which strips the inline
// notices. Both licences therefore have to ship as files.
{
  const shellDir = join(repoPackages, 'core', 'dist', 'shell')
  for (const name of ['LICENSE.just-bash', 'LICENSE.fflate']) {
    check(`${name} ships beside the vendored shell`, existsSync(join(shellDir, name)), [
      `missing ${join(shellDir, name)}`,
    ])
  }
}

// ---------------------------------------------------------------------------
// The CLI's bin exists.
//
// `bin` points into dist/bundle, which only build/bundle-cli.mjs produces. When
// that was not wired into `npm run build`, a clean publish shipped a 5.9 kB
// tarball with no binary — and `npm pack` exits 0 on it, so nothing caught it.
{
  const bin = join(here, 'dist', 'bundle', 'lib', 'codana.mjs')
  check('CLI bin exists after build', existsSync(bin), [
    `missing ${bin}`,
    "the CLI's build script must run build/bundle-cli.mjs",
  ])

  // python3 resolves ../../../vendor relative to the bundle, so CPython has to
  // sit at the package root — three levels up, not beside the bundle.
  check(
    'CPython sits where the shell looks for it',
    existsSync(join(here, 'vendor', 'cpython-emscripten')),
    [`missing ${join(here, 'vendor', 'cpython-emscripten')} — python3 would fail at runtime`]
  )
}

// ---------------------------------------------------------------------------
// Install the tarball and run the bin the way a user does.
//
// This is the check whose absence let a total failure ship-ready: the entry
// guard compared `import.meta.url` against a raw `process.argv[1]`, npm installs
// a bin as a *symlink*, and Node realpaths the ESM main module — so `codana`
// exited 0 having done nothing, on every install path there is. Everything that
// existed at the time invoked `dist/bundle/lib/codana.mjs` directly, by its real
// path, which is the one route that happens to work.
//
// Skipped with SKIP_INSTALL_TEST=1 for a fast inner loop; CI must not set it.
if (process.env.SKIP_INSTALL_TEST === '1') {
  console.log('- installed-bin checks skipped (SKIP_INSTALL_TEST=1)')
} else {
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, rmSync, existsSync: exists } = await import('node:fs')
  const { tmpdir } = await import('node:os')

  const sandbox = mkdtempSync(join(tmpdir(), 'nanocodana-install-'))
  try {
    const tarball = execFileSync('npm', ['pack', '--silent', '--pack-destination', sandbox], {
      cwd: here,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .pop()

    execFileSync('npm', ['init', '-y'], { cwd: sandbox, stdio: 'ignore' })
    execFileSync('npm', ['install', join(sandbox, tarball), '--silent', '--no-audit', '--no-fund'], {
      cwd: sandbox,
      stdio: 'ignore',
    })

    const bin = join(sandbox, 'node_modules', '.bin', 'codana')
    check('npm creates the bin', exists(bin), [`missing ${bin}`])

    // Through the symlink, exactly as `npx` / `npm i -g` / a package script do.
    let version = ''
    try {
      version = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim()
    } catch (err) {
      version = `<failed: ${err.message.split('\n')[0]}>`
    }
    check(`installed bin runs via its symlink (got ${JSON.stringify(version)})`, /^\d+\.\d+\.\d+/.test(version), [
      'the bin produced no usable output — the entry-point guard is not matching',
      'argv[1] is the symlink; Node realpaths import.meta.url. Compare realpathSync(argv[1]).',
    ])

    // The built-in skills ship at the package root while the bundle lives three
    // levels down; a fixed '..' silently found nothing and /forge stopped working.
    const skillsDir = join(sandbox, 'node_modules', '@nanocodana', 'cli', 'example-skills')
    check('built-in skills ship with the package', exists(join(skillsDir, 'build-agent')), [
      `missing ${join(skillsDir, 'build-agent')} — /forge is advertised in --help`,
    ])
  } catch (err) {
    check('installed-bin checks ran', false, [err.message.split('\n')[0]])
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)

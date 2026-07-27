// Differential shell matrix — offline, no API key.
//
// The CLI's Bash tool runs on just-bash, whose commands sit on four very
// different backends. They fail independently, and only some of them survive
// being bundled or vendored:
//
//   pure JS  — inlines into any bundle, never breaks
//   worker   — loads a sibling .js file at runtime (path-sensitive)
//   wasm     — loads .wasm / .zip assets at runtime (path-sensitive)
//   native   — .node addons and node: builtins, can never be bundled
//
// A single-file build silently loses the path-sensitive ones: the module still
// imports, the command still exists, and it fails only when actually run. That
// is exactly what this matrix catches, and what `--version`-style smoke tests
// cannot: smoke.test.mjs imports ./dist/components/*.js, so it verifies source
// modules rather than the artifact that ships.
//
//   node shell.test.mjs
//   NANOCODANA_ADAPTER=../../some/bundle.js node shell.test.mjs
//
// Point NANOCODANA_ADAPTER at an alternative build to diff it against this
// baseline. Same matrix, same expectations — any divergence is a packaging bug.
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const adapter = process.env.NANOCODANA_ADAPTER || '@nanocodana/nodejs'
const { NodeAgent } = await import(adapter)

const dir = mkdtempSync(join(tmpdir(), 'nanocodana-shell-'))
// Registered up front rather than cleaned up at the end: several assertions
// below throw by design when a contract changes, and an unhandled rejection
// would otherwise leave a workspace behind in tmpdir on every failed run.
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
writeFileSync(join(dir, 'a.txt'), 'hello\nworld\n')
writeFileSync(join(dir, 'b.js'), 'const x = 1\n')

// A model is required to construct the agent but never called: every case below
// invokes the Bash tool directly.
const stubModel = {
  modelId: 'stub',
  provider: 'stub',
  specificationVersion: 'v2',
  doGenerate: async () => ({}),
  doStream: async () => ({}),
}

const agent = NodeAgent({
  model: stubModel,
  workingDirectory: dir,
  virtualBash: { env: { MATRIX_VAR: 'from-options' } },
})

// Mirrors what `codana chat` actually constructs (see commands/chat.tsx).
// python3 and js-exec are gated behind flags in just-bash, so this both proves
// the VirtualShellOptions pass-through works and guards the CLI's real config.
const cliConfigured = NodeAgent({
  model: stubModel,
  workingDirectory: dir,
  virtualBash: { python: true, javascript: true },
})

// [backend, label, command, expected stdout (trimmed)]
const MATRIX = [
  ['pure-js', 'cat', 'cat a.txt', 'hello\nworld'],
  ['pure-js', 'grep', 'grep -n world a.txt', '2:world'],
  ['pure-js', 'rg', 'rg -n const .', 'b.js:1:const x = 1'],
  ['pure-js', 'wc', 'wc -l a.txt', '2 a.txt'],
  ['pure-js', 'sed', 'sed s/hello/HI/ a.txt', 'HI\nworld'],
  ['pure-js', 'awk', 'awk "{print NR}" a.txt', '1\n2'],
  ['pure-js', 'head', 'head -1 a.txt', 'hello'],
  ['pure-js', 'pipe', 'cat a.txt | sort | head -1', 'hello'],
  ['options', 'env pass-through', 'echo $MATRIX_VAR', 'from-options'],
  // Everything below loads something from disk at runtime. These are the cases
  // that break when the package is bundled without its assets.
  ['worker', 'sqlite3', 'sqlite3 :memory: "select 42"', '42'],
  ['native', 'gzip (node:zlib)', 'gzip -c a.txt | wc -c', '32'],
  ['native', 'tar round-trip', 'tar -cf out.tar a.txt && tar -tf out.tar', 'a.txt'],
]

// js-exec's worker imports `stripTypeScriptTypes` from node:module, which does
// not exist before Node 22 — just-bash declares engines >=20.18.1 but this one
// command needs 22. The CLI raises its own floor to 22 because it enables
// js-exec by default; the Node adapter stays at 20.18.1 because it does not.
// Reported rather than silently skipped: a quiet skip is how a capability stops
// being tested without anyone noticing.
const NODE_MAJOR = Number(process.versions.node.split('.')[0])
const JS_EXEC_SUPPORTED = NODE_MAJOR >= 22

const CLI_MATRIX = [
  ['wasm', 'python3 (CLI default)', 'python3 -c "print(6*7)"', '42'],
  ...(JS_EXEC_SUPPORTED
    ? [['wasm', 'js-exec (CLI default)', 'echo "console.log(6*7)" > s.js && js-exec s.js', '42']]
    : []),
]

// Capabilities backed by optionalDependencies (native addons). Both outcomes are
// correct: present → it works, absent → a clear error naming the package. What
// must never happen is a stack trace, a hang, or a silent wrong answer.
//
// These are the only commands that reach node-liblzma / @mongodb-js/zstd, and
// nothing exercised them before — the plain `tar -cf` case above uses no codec —
// so `--omit=optional` was untested in both directions.
const OPTIONAL_MATRIX = [
  [
    'optional',
    'tar -J round-trip (node-liblzma)',
    'tar -cJf out.txz a.txt && tar -tJf out.txz',
    'a.txt',
    /node-liblzma/,
  ],
  [
    'optional',
    'tar --zstd round-trip (@mongodb-js/zstd)',
    'tar --zstd -cf out.tzst a.txt && tar --zstd -tf out.tzst',
    'a.txt',
    /@mongodb-js\/zstd/,
  ],
]

let failures = 0

/**
 * Execute one case. Shared by both runners, which previously carried identical
 * copies of this and would have drifted the moment either grew a timeout or an
 * extra assertion.
 */
async function exec(target, command) {
  const bash = target.tools?.Bash
  if (!bash) return { stdout: '', stderr: 'no Bash tool registered', exitCode: -1, missing: true }
  try {
    const r = await bash.execute({ command })
    return {
      stdout: String(r.stdout ?? '').trim(),
      stderr: String(r.stderr ?? '').trim(),
      exitCode: r.exitCode,
    }
  } catch (err) {
    return { stdout: '', stderr: `THREW: ${err.message}`, exitCode: -1 }
  }
}

async function run(target, [backend, label, command, expected]) {
  const { stdout, stderr, exitCode, missing } = await exec(target, command)
  if (missing) {
    console.log(`✗ [${backend}] ${label} — no Bash tool registered`)
    failures++
    return
  }
  // Exit status is part of the contract: a command that prints the right bytes
  // while failing is not a passing command.
  const ok = stdout === expected && exitCode === 0
  console.log(`${ok ? '✓' : '✗'} [${backend}] ${label}`)
  if (!ok) {
    failures++
    console.log(`   command:  ${command}`)
    console.log(`   expected: ${JSON.stringify(expected)} (exit 0)`)
    console.log(`   got:      ${JSON.stringify(stdout)}  exit=${exitCode}`)
    if (stderr) console.log(`   stderr:   ${JSON.stringify(stderr.slice(0, 160))}`)
  }
}

// Passes on either outcome — see OPTIONAL_MATRIX. A missing optional dependency
// is a supported install, not a broken one, so the assertion is on *how* it
// fails, not whether it succeeds.
async function runOptional(target, [backend, label, command, expected, missing]) {
  const r = await exec(target, command)
  if (r.missing) {
    console.log(`✗ [${backend}] ${label} — no Bash tool registered`)
    failures++
    return
  }
  if (r.stdout === expected && r.exitCode === 0) {
    console.log(`✓ [${backend}] ${label} — installed`)
    return
  }
  if (missing.test(r.stderr) && !r.stderr.startsWith('THREW:')) {
    console.log(`✓ [${backend}] ${label} — not installed, degraded cleanly`)
    return
  }
  failures++
  console.log(`✗ [${backend}] ${label}`)
  console.log(`   command:  ${command}`)
  console.log(`   expected: ${JSON.stringify(expected)} or an error matching ${missing}`)
  console.log(`   got:      ${JSON.stringify(r.stdout)}  exit=${r.exitCode}`)
  if (r.stderr) console.log(`   stderr:   ${JSON.stringify(r.stderr.slice(0, 160))}`)
}

console.log(`shell matrix via ${adapter}\n`)
for (const testCase of MATRIX) await run(agent, testCase)
for (const testCase of CLI_MATRIX) await run(cliConfigured, testCase)
if (!JS_EXEC_SUPPORTED) {
  console.log(`- [wasm] js-exec skipped — needs Node >=22, running ${process.versions.node}`)
}
for (const testCase of OPTIONAL_MATRIX) await runOptional(agent, testCase)

// virtualBash: false must actually drop the tool — it previously did not, which
// made the documented option a no-op on this adapter.
{
  const off = NodeAgent({ model: stubModel, workingDirectory: dir, virtualBash: false })
  const ok = !off.tools?.Bash
  console.log(`${ok ? '✓' : '✗'} [config] virtualBash:false drops the Bash tool`)
  if (!ok) failures++
}

// Core's vendored shell, exercised directly rather than through an adapter.
//
// Everything above runs on @nanocodana/nodejs, which uses the real just-bash and
// therefore the real node:zlib. Core ships a Node-free build whose node:zlib is
// replaced by an fflate-backed shim (core/build/shims/zlib-fflate.js), so these
// four commands take a completely different code path there — one nothing else
// covers. They are also the commands that were broken on edge to begin with.
{
  // Reached by path, not by specifier: core's exports map deliberately hides
  // dist internals, so this block only works inside the repo — which is right,
  // it is testing how core is *built*, not what it exposes.
  const coreDir = new URL('../core/', import.meta.url)
  if (!existsSync(new URL('dist/shell/bundle.js', coreDir))) {
    console.log("✗ [core-shell] core is not built — run `npm run build` first")
    failures++
  } else {
  const { Bash, InMemoryFs } = await import(new URL('dist/shell/bundle.js', coreDir).href)
  const coreShell = () =>
    new Bash({ fs: new InMemoryFs({ '/a.txt': 'hello\nworld\n' }), cwd: '/' })

  for (const [label, command, expected] of [
    ['gzip', 'gzip -c a.txt | wc -c', '32'],
    ['gunzip round-trip', 'gzip -c a.txt > a.gz && gunzip -c a.gz', 'hello\nworld'],
    ['zcat', 'gzip -c a.txt > b.gz && zcat b.gz', 'hello\nworld'],
    ['rg -z over gzip', 'gzip -c a.txt > c.gz && rg -z world c.gz', 'world'],
  ]) {
    const r = await coreShell().exec(command)
    const got = String(r.stdout ?? '').trim()
    const ok = got === expected
    console.log(`${ok ? '✓' : '✗'} [core-shell] ${label} (fflate, no node:zlib)`)
    if (!ok) {
      failures++
      console.log(`   expected: ${JSON.stringify(expected)}`)
      console.log(`   got:      ${JSON.stringify(got)}  exit=${r.exitCode}`)
      if (r.stderr) console.log(`   stderr:   ${JSON.stringify(String(r.stderr).slice(0, 160))}`)
    }
  }

  // The cap must abort *during* inflation. fflate's one-shot gunzipSync would
  // allocate the whole payload before any length check, so a post-hoc guard here
  // would read as passing while having lost the guarantee entirely.
  const { gzipSync, gunzipSync } = await import(
    new URL('build/shims/zlib-fflate.js', coreDir).href
  )
  const bomb = gzipSync(new Uint8Array(40 * 1024 * 1024))
  let bounded = false
  try {
    gunzipSync(bomb, { maxOutputLength: 1024 * 1024 })
  } catch (err) {
    bounded = err?.code === 'ERR_BUFFER_TOO_LARGE'
  }
  console.log(`${bounded ? '✓' : '✗'} [core-shell] decompression bomb is bounded mid-inflation`)
  if (!bounded) failures++
  }
}

// Host escalation is a capability gate, not just an approval gate: with it off
// the model must not even be offered the parameter, and an explicit host:true
// must be refused rather than quietly downgraded to a sandbox run — which would
// misreport where the command executed.
{
  const sandboxed = NodeAgent({ model: stubModel, workingDirectory: dir })
  const hostCapable = NodeAgent({ model: stubModel, workingDirectory: dir, hostShell: true })

  // Core exposes the tool as an AI SDK tool: `parameters` becomes `inputSchema`,
  // wrapping the raw JSON Schema. Reading the wrong key here would make both
  // assertions pass against `{}` — vacuously, which is worse than failing.
  const schemaOf = (a) => {
    const schema = a.tools.Bash.inputSchema
    if (!schema) throw new Error('Bash tool has no inputSchema — the tool shape changed')
    return JSON.stringify(schema)
  }
  const hidden = !schemaOf(sandboxed).includes('"host"')
  console.log(`${hidden ? '✓' : '✗'} [security] host param hidden from the model by default`)
  if (!hidden) failures++

  const offered = schemaOf(hostCapable).includes('"host"')
  console.log(`${offered ? '✓' : '✗'} [security] host param offered when hostShell: true`)
  if (!offered) failures++

  // `whoami` exists in the sandbox, so a silent downgrade would look successful.
  const r = await sandboxed.tools.Bash.execute({ command: 'whoami', host: true })
  const refused = r.exitCode === 126 && /disabled/i.test(r.stderr || '')
  console.log(`${refused ? '✓' : '✗'} [security] explicit host:true is refused, not downgraded`)
  if (!refused) {
    failures++
    console.log(`   got: ${JSON.stringify({ exitCode: r.exitCode, stderr: (r.stderr || '').slice(0, 80) })}`)
  }
}


console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)

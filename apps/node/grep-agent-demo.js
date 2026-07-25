// Grep demo — watch a real agent search this monorepo, and see which engine
// (ripgrep vs the zero-dependency JS fallback) NodeAgent resolved.
//
//   cd apps/node
//   cp .env.example .env   # add ANTHROPIC_API_KEY (or OPENAI_API_KEY)
//   node grep-agent-demo.js
//
// Optional: NANOCODANA_FORCE_JS_GREP=1 forces the JS engine so you can compare.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NodeAgent,
  createNodeGrepTool,
  createRipgrepTool,
  resolveRipgrepPath,
} from '@nanocodana/nodejs'
import { buildModel, streamTurn, createIO, dim, bold, cyan, green } from './demo-runtime.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Search the whole monorepo — a real codebase, not a toy fixture.
const repoRoot = path.resolve(__dirname, '..', '..')

const rgPath = resolveRipgrepPath()
const forceJs = process.env.NANOCODANA_FORCE_JS_GREP === '1'
const engine = forceJs ? 'JS (forced)' : rgPath ? `ripgrep (${rgPath})` : 'JS (no rg found)'

console.log(bold('\nNanoCodana grep demo'))
console.log(`  working dir : ${dim(repoRoot)}`)
console.log(`  grep engine : ${green(engine)}\n`)

const agent = NodeAgent({
  model: await buildModel(),
  workingDirectory: repoRoot,
  // Read-only run: no approvals needed, and we only want it to search + read.
  disableTools: ['Bash', 'Write', 'Edit', 'MultiEdit', 'Delete', 'WebFetch'],
  // Pin the engine so the demo proves the exact tool it claims to use.
  ...(forceJs ? { tools: { Grep: createNodeGrepTool(repoRoot) } } : {}),
})

// A question that can only be answered by searching the codebase.
const prompt =
  'Search this codebase: where is `resolveRipgrepPath` defined, and which files call it? ' +
  'Use Grep, then give me the file paths and a one-line summary of what it does.'

console.log(bold('You: ') + prompt)

// Highlight Grep calls specifically so the tool under test is easy to spot.
const messages = [{ role: 'user', content: prompt }]
const { rl, ask } = createIO()
await streamTurn(agent, messages, ask, {
  onToolCall: (chunk) => {
    const tag = chunk.toolName === 'Grep' ? cyan('↳ Grep') : dim(`↳ ${chunk.toolName}`)
    console.log(`\n${tag} ${dim(JSON.stringify(chunk.input))}`)
  },
})
rl.close()
console.log('\n')

// Interactive chat over an agent whose files live in a database and are fetched
// LAZILY (with simulated latency). Type prompts and watch which files it opens —
// each is pulled from the store only on first read, then cached.
//
//   cd apps/serverless
//   cp .env.example .env   # add ANTHROPIC_API_KEY (or OPENAI_API_KEY)
//   node chat.js
//
// Commands:  /files  show the store's current contents
//            /stats  fetches so far
//            /reset  fresh agent instance (files un-cached, conversation cleared)
//            exit    quit
import { NanoCodana } from '@nanocodana/core'
import { buildModel, streamTurn, createIO, bold, dim, cyan, green, yellow } from './runtime.js'

// --- The backing store (stands in for Postgres / S3 / a KV namespace) ------
const database = new Map([
  ['package.json', '{\n  "name": "acme-api",\n  "version": "1.2.0"\n}\n'],
  ['README.md', '# acme-api\n\nInternal orders service.\n'],
  ['src/index.ts', "import { config } from './config'\nconsole.log('listening on', config.port)\n"],
  ['src/config.ts', 'export const config = {\n  port: 8080,\n  region: "eu-west-1",\n}\n'],
  ['src/routes/orders.ts', "export const listOrders = () => db.query('select * from orders')\n"],
  ['src/routes/users.ts', "export const listUsers = () => db.query('select * from users')\n"],
  ['src/routes/health.ts', "export const health = () => ({ ok: true })\n"],
  ['src/utils/format.ts', 'export const money = (n) => `$${n.toFixed(2)}`\n'],
  ['src/utils/http.ts', 'export const get = (url) => fetch(url).then((r) => r.json())\n'],
  ['tests/orders.test.ts', "test('lists orders', () => { /* ... */ })\n"],
])

// Real reads aren't instant — this latency is what lazy hydration saves.
const DB_LATENCY_MS = 40
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const db = {
  listPaths: async () => (await sleep(DB_LATENCY_MS), [...database.keys()]),
  readFile: async (path) => (await sleep(DB_LATENCY_MS), database.get(path)),
  saveFile: async (path, content) => (await sleep(DB_LATENCY_MS), void database.set(path, content)),
  deleteFile: async (path) => (await sleep(DB_LATENCY_MS), void database.delete(path)),
}

// --- Fetch tracking (reset with the agent) ---------------------------------
let fetches = 0
const fetchedPaths = new Set()
// onFilesChange is a sync callback, so persistence promises land here and the
// loop flushes them after each turn (never fire-and-forget: a store read right
// after an edit must see the write).
const pendingWrites = []

// Build a fresh agent from the CURRENT store state: every file is a lazy
// provider, so a rebuilt agent re-fetches on demand (like a new invocation).
async function buildAgent(model) {
  fetches = 0
  fetchedPaths.clear()
  const paths = await db.listPaths()
  const initialFiles = paths.map((path) => ({
    path,
    content: async () => {
      fetches++
      fetchedPaths.add(path)
      console.log(dim(`   📥 fetched ${path} (${DB_LATENCY_MS}ms)`))
      return db.readFile(path)
    },
  }))
  const onFilesChange = (changes) => {
    for (const { path, content } of changes) {
      pendingWrites.push(content === undefined ? db.deleteFile(path) : db.saveFile(path, content))
      console.log(dim(`   💾 persisted ${path}`))
    }
  }
  return { agent: new NanoCodana({ model, initialFiles, onFilesChange }), total: paths.length }
}

// --- REPL ------------------------------------------------------------------
let model
try {
  model = await buildModel()
} catch {
  console.error('Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) in apps/serverless/.env first.')
  process.exit(1)
}

let { agent, total } = await buildAgent(model)
const { rl, ask } = createIO()
const messages = []

console.log(bold('\nLazy-files chat') + dim(`  —  ${total} files in the store, fetched on demand\n`))
console.log(dim('Try: "read src/config.ts and bump the port to 9090", then "which routes exist?"'))
console.log(dim('(a request that searches the whole project will fetch every file — the caveat)'))
console.log(dim('Commands: /files  /stats  /reset  exit\n'))

while (true) {
  const input = (await ask(bold('You: ')))?.trim()
  if (!input) continue
  if (input === 'exit' || input === 'quit') break

  if (input === '/files') {
    for (const [path, content] of database) {
      console.log(`  ${cyan(path)} ${dim(`(${content.length}b)`)}`)
    }
    console.log('')
    continue
  }
  if (input === '/stats') {
    console.log(dim(`  fetched ${fetchedPaths.size}/${total} unique files · ` +
      `${fetches} total reads · ~${fetches * DB_LATENCY_MS}ms of store time\n`))
    continue
  }
  if (input === '/reset') {
    pendingWrites.length = 0
    ;({ agent, total } = await buildAgent(model))
    messages.length = 0
    console.log(dim('  fresh agent — files un-cached, conversation cleared\n'))
    continue
  }

  const before = fetches
  messages.push({ role: 'user', content: input })
  await streamTurn(agent, messages, ask, {
    onToolCall: (chunk) => {
      const t = chunk.toolName
      const tag = t === 'Grep' || t === 'Glob' || t === 'LS' ? yellow(`↳ ${t}`) : dim(`↳ ${t}`)
      console.log(`\n${tag} ${dim(JSON.stringify(chunk.input))}`)
    },
  })
  // Flush this turn's persistence before prompting again, so /files and the
  // next turn see a fully-written store.
  await Promise.all(pendingWrites.splice(0))
  console.log(
    dim(`\n   [this turn fetched ${green(String(fetches - before))} file(s) · ` +
      `${fetchedPaths.size}/${total} unique so far]\n`),
  )
}

rl.close()
console.log('')

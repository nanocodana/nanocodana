// NanoCodana in a serverless function.
//
// The files live in a database, not on disk. Each invocation spins up a fresh
// agent, hydrates the project LAZILY (only the files the agent actually touches
// are fetched from the store), runs a turn, persists any edits back through
// `onFilesChange`, and returns — then the instance is gone.
//
// Uses @nanocodana/core (`new NanoCodana`), NOT NodeAgent: NodeAgent is backed
// by a real working directory, but here there is no disk — the store is the
// filesystem. This is the "anywhere else → core" path from the docs.
//
//   cd apps/serverless
//   cp .env.example .env   # add ANTHROPIC_API_KEY (or OPENAI_API_KEY)
//   npm start
import { NanoCodana } from '@nanocodana/core'
import { buildModel, bold, dim, green, cyan } from './runtime.js'

// --- The backing store (stands in for Postgres / S3 / a KV namespace) ------
// It lives OUTSIDE the function, so it survives across invocations — unlike the
// agent's in-memory filesystem, which is thrown away when the function returns.
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

// Real database/S3/KV reads aren't instant. This simulated round-trip is what
// makes lazy hydration worth it: you pay it per file the agent actually opens,
// not once for every file in the whole project.
const DB_LATENCY_MS = 40
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A real app scopes every query by projectId; the single Map here ignores it to
// keep the example small, but the signatures show where it goes.
const db = {
  listPaths: async (_projectId) => {
    await sleep(DB_LATENCY_MS) // one cheap "SELECT path FROM files"
    return [...database.keys()]
  },
  readFile: async (_projectId, path) => {
    await sleep(DB_LATENCY_MS)
    return database.get(path)
  },
  saveFile: async (_projectId, path, content) => {
    await sleep(DB_LATENCY_MS)
    database.set(path, content)
  },
  deleteFile: async (_projectId, path) => {
    await sleep(DB_LATENCY_MS)
    database.delete(path)
  },
}

// === Your serverless handler ===============================================
// Deploy this as a Vercel Function / Lambda / Cloud Function. Everything below
// runs per request; nothing is shared between invocations except the database.
export async function handler({ projectId, prompt }) {
  let fetched = 0

  // 1. Hydrate lazily: list the paths (cheap), and give each file a provider
  //    that pulls its bytes from the store on first read. A project with
  //    thousands of files costs nothing until the agent opens one.
  const paths = await db.listPaths(projectId)
  const initialFiles = paths.map((path) => ({
    path,
    content: async () => {
      fetched++
      return db.readFile(projectId, path)
    },
  }))

  // 2. Persist the agent's edits back to the store. onFilesChange is a sync
  //    callback, so collect the async writes and flush them before returning:
  //    a serverless instance can be frozen the instant the response is sent, so
  //    a fire-and-forget write would be lost.
  const writes = []
  const onFilesChange = (changes) => {
    for (const { path, content } of changes) {
      writes.push(
        content === undefined
          ? db.deleteFile(projectId, path)
          : db.saveFile(projectId, path, content),
      )
    }
  }

  const agent = new NanoCodana({ model: await buildModel(), initialFiles, onFilesChange })

  // 3. Run one turn, flush every pending write, then return. (generate =
  //    one-shot; use stream to pipe tokens back through a streaming response.)
  const result = await agent.generate({ messages: [{ role: 'user', content: prompt }] })
  await Promise.all(writes)

  return { text: result.text, filesFetched: fetched, totalFiles: paths.length }
}

// === Local driver ==========================================================
// Simulates two separate requests to the deployed function — no real infra.
// Each call is a fresh agent (a fresh "instance"); the database is what carries
// state between them.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(bold('\nServerless agent — files in a database, hydrated per request\n'))

  // Report how much store time the agent spent, and what eager hydration
  // (fetching every file up front) would have cost at the same latency.
  const report = (r) => {
    const lazyMs = r.filesFetched * DB_LATENCY_MS
    const eagerMs = r.totalFiles * DB_LATENCY_MS
    console.log(
      `  fetched ${green(`${r.filesFetched}/${r.totalFiles}`)} files ` +
        `→ ${green(`~${lazyMs}ms`)} of store reads ` +
        dim(`(eager hydration would've been ~${eagerMs}ms)`),
    )
  }

  console.log(bold('▸ Invocation 1: ') + 'change the port in src/config.ts to 9090')
  const r1 = await handler({
    projectId: 'acme',
    prompt:
      'Open src/config.ts (read it directly — do not list or grep the project) ' +
      'and change the port to 9090.',
  })
  console.log(dim(`  agent: ${r1.text.replace(/\s+/g, ' ').slice(0, 100)}…`))
  report(r1)
  const portAfter = (await db.readFile('acme', 'src/config.ts')).match(/port:\s*(\d+)/)?.[1]
  console.log(`  store now holds port: ${cyan(portAfter)}\n`)

  console.log(bold('▸ Invocation 2: ') + 'a brand-new instance reads the same file')
  const r2 = await handler({
    projectId: 'acme',
    prompt: 'What port does src/config.ts use? Read it directly and answer with just the number.',
  })
  console.log(dim(`  agent: ${r2.text.replace(/\s+/g, ' ').trim()}`))
  report(r2)
  console.log(
    dim(`  → invocation 2 sees invocation 1's edit — the change round-tripped through the DB.\n`),
  )
}

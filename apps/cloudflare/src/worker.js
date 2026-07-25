// NanoCodana on Cloudflare Workers — the project lives in D1, not on disk.
//
// This is apps/serverless ported to a real edge runtime. The agent logic is
// unchanged: hydrate lazily via `initialFiles`, run a turn, persist through
// `onFilesChange`. Only three things differ from the Node version:
//
//   1. the store is D1 instead of a Map,
//   2. secrets come from `env`, not `process.env` (there is no process),
//   3. writes flush as one batched D1 round trip instead of Promise.all.
//
// Uses @nanocodana/core (`new NanoCodana`), NOT NodeAgent: NodeAgent needs a
// real working directory, and a Worker has no filesystem at all. This is the
// "anywhere else → core" path from the docs, and the reason core imports zero
// Node builtins.
//
//   cd apps/cloudflare
//   cp .dev.vars.example .dev.vars   # add ANTHROPIC_API_KEY
//   npm run db:setup                 # create local D1 tables + seed the demo
//   npm run dev
import { NanoCodana } from '@nanocodana/core'
import { createAnthropic } from '@ai-sdk/anthropic'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

// --- The store: D1 replaces the in-memory Map from apps/serverless ----------
// Reads run immediately; writes are *returned as statements* so the whole turn's
// changes can go over the wire in a single batch.
function createStore(db, projectId) {
  const upsert =
    'INSERT INTO files (project_id, path, content) VALUES (?, ?, ?) ' +
    'ON CONFLICT (project_id, path) DO UPDATE SET content = excluded.content'

  return {
    listPaths: async () => {
      const { results } = await db
        .prepare('SELECT path FROM files WHERE project_id = ?')
        .bind(projectId)
        .all()
      return results.map((row) => row.path)
    },

    readFile: async (path) => {
      const row = await db
        .prepare('SELECT content FROM files WHERE project_id = ? AND path = ?')
        .bind(projectId, path)
        .first()
      return row?.content
    },

    saveStatement: (path, content) => db.prepare(upsert).bind(projectId, path, content),

    deleteStatement: (path) =>
      db.prepare('DELETE FROM files WHERE project_id = ? AND path = ?').bind(projectId, path),
  }
}

// Conventional scratch trees. `onFilesChange` reports paths without a leading
// slash (core strips it), but tolerate one so this stays correct if that changes.
const SCRATCH_PREFIXES = ['tmp/', 'var/', 'dev/', 'proc/', 'sys/', 'run/']
const isScratch = (path) => {
  const p = path.replace(/^\/+/, '')
  return SCRATCH_PREFIXES.some((prefix) => p.startsWith(prefix))
}

// === One turn ===============================================================
async function runTurn({ db, ctx, projectId, prompt, apiKey, modelId }) {
  const store = createStore(db, projectId)
  let fetched = 0

  // 1. Hydrate lazily. One cheap "SELECT path" gives the agent the whole tree
  //    structure; each file's *content* is a provider that runs on first read.
  //    A 5,000-file project costs one query until the agent opens something.
  const paths = await store.listPaths()
  const initialFiles = paths.map((path) => ({
    path,
    content: async () => {
      fetched++
      return store.readFile(path)
    },
  }))

  // 2. Collect the agent's edits. onFilesChange is synchronous, so it can only
  //    build statements — it cannot await them.
  //
  //    Note the isScratch filter: the store is mounted at "/", so a shell
  //    redirect like `> /tmp/out` lands in the same namespace as source files and
  //    would otherwise be persisted into your database. An app that mounts the
  //    project under a prefix (say /workspace) should allowlist that prefix
  //    instead — a denylist is only right because here the project *is* the root.
  const pending = []
  const onFilesChange = (changes) => {
    for (const { path, content } of changes) {
      if (isScratch(path)) continue
      pending.push(
        content === undefined ? store.deleteStatement(path) : store.saveStatement(path, content),
      )
    }
  }

  const model = createAnthropic({ apiKey })(modelId)
  // Full agent, Bash included. For a ~45% smaller bundle without the shell, see
  // "Dropping the shell" in the README — it's a one-line alias swap plus
  // `virtualBash: false` here.
  const agent = new NanoCodana({ model, initialFiles, onFilesChange })

  const result = await agent.generate({ messages: [{ role: 'user', content: prompt }] })

  // 3. AWAIT the file writes. Do not hand these to ctx.waitUntil():
  //    waitUntil keeps the isolate alive past the response, but promises nothing
  //    about ordering against the *next* request. A client that edits a file and
  //    immediately re-reads it could miss its own write. Durability the caller
  //    depends on belongs before the response — d1.batch() makes that one trip.
  if (pending.length > 0) await db.batch(pending)

  // 4. waitUntil is for work nobody is waiting on. Nothing reads `turns` back,
  //    so this row may land after the response without anyone noticing.
  ctx.waitUntil(
    db
      .prepare(
        'INSERT INTO turns (project_id, prompt, files_fetched, total_files, usage) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(projectId, prompt, fetched, paths.length, JSON.stringify(result.usage ?? {}))
      .run(),
  )

  return { text: result.text, filesFetched: fetched, totalFiles: paths.length }
}

// === The Worker =============================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const modelId = env.NANOCODANA_MODEL_ID || 'claude-sonnet-4-5'

    // Boot check — no API key needed. If this responds, workerd loaded the
    // bundle (so core pulled in no Node builtins) and the D1 binding is live.
    if (url.pathname === '/health') {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM files').first()
      return json({
        ok: true,
        runtime: navigator.userAgent,
        coreLoaded: typeof NanoCodana === 'function',
        filesInD1: row?.n ?? 0,
        modelId,
        hasApiKey: Boolean(env.ANTHROPIC_API_KEY),
      })
    }

    // Inspect the store — useful for seeing an edit round-trip.
    if (url.pathname === '/files') {
      const projectId = url.searchParams.get('projectId') || 'acme'
      const { results } = await env.DB.prepare(
        'SELECT path, content FROM files WHERE project_id = ? ORDER BY path',
      )
        .bind(projectId)
        .all()
      return json({ projectId, files: results })
    }

    if (url.pathname === '/agent') {
      if (request.method !== 'POST') return json({ error: 'POST required' }, 405)
      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: 'ANTHROPIC_API_KEY is not set — add it to .dev.vars' }, 500)
      }

      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'Body must be JSON: { projectId, prompt }' }, 400)
      }

      const { projectId = 'acme', prompt } = body
      if (!prompt) return json({ error: 'prompt is required' }, 400)

      try {
        const result = await runTurn({
          db: env.DB,
          ctx,
          projectId,
          prompt,
          apiKey: env.ANTHROPIC_API_KEY,
          modelId,
        })
        return json(result)
      } catch (err) {
        // Surface the real reason: on a Worker the interesting failures are
        // upstream (a rejected key, a model id that doesn't exist), not local.
        return json({ error: err.message, name: err.name }, 502)
      }
    }

    return json(
      {
        endpoints: {
          'GET  /health': 'runtime + D1 check, no API key needed',
          'GET  /files?projectId=acme': 'read the project out of D1',
          'POST /agent': '{ projectId, prompt } — run one turn',
        },
      },
      404,
    )
  },
}

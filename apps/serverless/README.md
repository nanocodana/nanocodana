# apps/serverless

Running NanoCodana in a **serverless function**, where the project's files live
in a database rather than on disk.

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY (or OPENAI_API_KEY)
npm start
```

`agent-function.js` is a `handler({ projectId, prompt })` you could deploy as a
Vercel Function, Lambda, or Cloud Function. Each invocation:

1. **Hydrates lazily** — lists the project's paths (cheap), and gives each file
   an `initialFiles` provider that fetches its content from the store only on
   first read. A project with thousands of files costs nothing until the agent
   opens one.
2. **Runs the agent** over that virtual filesystem.
3. **Persists** every edit straight back to the store via `onFilesChange`.

It uses [`@nanocodana/core`](../../packages/core) directly (`new NanoCodana`),
not `NodeAgent` — there is no disk here, so you bring the filesystem. This is the
"anywhere else → core" path.

The local driver fires **two invocations** against the same in-memory store (no
real infra) to show the shape end to end: each is a fresh instance that fetches
only the files it touches, and the second invocation sees the first's edit,
because the change round-tripped through the database.

> Search caveat: a Glob or Grep over the whole tree materializes every lazy file
> it visits. For search-heavy work, hydrate eagerly (plain string `content`)
> instead.

## Interactive: `npm run chat`

`chat.js` is a REPL over the same lazy DB-backed filesystem — type prompts and
watch which files the agent fetches (`📥`) and writes back (`💾`) in real time.

```bash
npm run chat
```

Each turn reports how many files it fetched; `/stats` shows the running total,
`/files` dumps the store, and `/reset` gives you a fresh agent instance (files
un-cached) so you can compare a cold hydrate against a warm one. Ask it to
"search the project for X" to watch the whole-tree caveat happen live.


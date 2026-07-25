---
name: build-agent
description: Scaffold, write, and test a brand-new NanoCodana agent (a runnable NodeAgent script, plus a skill if useful) from a plain-language description
---

# Build Agent Skill

Turn a description like "an agent that writes commit messages" into a working,
tested NanoCodana agent. NanoCodana is a coding-agent framework on the Vercel AI
SDK: an agent is created with `NodeAgent({ ... })` and run with
`agent.generate({ prompt })` or `agent.stream({ messages })`.

## Template — a minimal runnable agent

Write a file like this to the current working directory (adapt the name, model,
system prompt, and tools to the request). It reads the API key from the
environment — no dotenv needed, because it inherits the parent process's env.

```js
import { NodeAgent } from '@nanocodana/nodejs'
import { createAnthropic } from '@ai-sdk/anthropic'

const model = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(
  'claude-sonnet-4-5',
)

const agent = NodeAgent({
  model,
  workingDirectory: process.cwd(),
  systemPrompt: `<one paragraph describing this agent's single job>`,
  // Optional: gate or restrict tools for safety, e.g.
  //   needsApproval: ['Write', 'Edit', 'Delete'],
})

// The task comes in as the first CLI arg (fallback for a quick smoke test).
const task = process.argv[2] ?? '<a representative default task>'
const result = await agent.generate({ prompt: task })
console.log(result.text)
```

If `OPENAI_API_KEY` is set instead of `ANTHROPIC_API_KEY`, use
`createOpenAI(...)('gpt-4o')` from `@ai-sdk/openai`.

## Steps

1. **Clarify** the agent's single purpose, its model, and which tools it needs.
   Keep the scope to one clear job.
2. **Write** the agent script to `<name>.mjs` in the current working directory.
3. **(Optional) Write a skill** at `.agents/skills/<name>/SKILL.md` if the agent
   needs reusable, loadable instructions — then have the generated agent load it
   (omit `skills` to let it auto-discover from its working dir).
4. **Test it** by running it with the host shell and a representative task:
   ```
   node <name>.mjs "a representative task for this agent"
   ```
   (Use Bash with `host: true` — running Node needs the real shell.)
5. **Read the output.** If the agent misbehaves, fix the script or its system
   prompt / skill and run it again. Don't stop until it produces a sensible
   result.
6. **Summarize** what you built: the file(s) created, the agent's purpose, and
   the exact command to run it.

## Rules

- Keep generated agents minimal — only `@nanocodana/nodejs` plus one AI SDK
  provider. No extra dependencies.
- Default to safe tools. Do not enable host Bash or destructive tools in a
  generated agent unless the user explicitly asks.
- Always test before declaring done.
- Do NOT build an agent whose job is to build other agents (no recursion).

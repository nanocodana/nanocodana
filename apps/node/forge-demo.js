// Forge — an agent that builds NanoCodana agents.
//
// The most self-referential demo: a NanoCodana agent whose job is to design,
// write, and TEST brand-new NanoCodana agents. You describe the agent you want;
// Forge loads the `build-agent` skill for the recipe, scaffolds a runnable
// NodeAgent script into its workspace, runs it (host Bash → approval), reads the
// output, and iterates until it works.
//
//   npm run forge
//
// Requires ANTHROPIC_API_KEY (or OPENAI_API_KEY) in apps/node/.env
import path from 'node:path'
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NodeAgent, loadSkillsFromDirs } from '@nanocodana/nodejs'
import { dim, cyan, bold, green, yellow, buildModel, repl } from './demo-runtime.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Generated agents land here. It sits inside apps/node, so a generated script's
// `import '@nanocodana/nodejs'` resolves up to apps/node/node_modules, and host
// Bash (which runs with cwd = workingDirectory and inherits process.env) gives
// the child the API key automatically.
const workspace = path.join(__dirname, 'forge-workspace')
mkdirSync(workspace, { recursive: true })

// Forge loads the bundled build-agent skill (plus any of your global skills).
const exampleSkills = path.resolve(__dirname, '../../packages/cli/example-skills')
const skills = await loadSkillsFromDirs([
  path.join(os.homedir(), '.agents', 'skills'),
  path.join(os.homedir(), '.claude', 'skills'),
  exampleSkills, // changelog, scaffold-component, build-agent
])

const SYSTEM_PROMPT = `You are Forge, an agent that designs, writes, and tests new NanoCodana agents.

NanoCodana is a coding-agent framework built on the Vercel AI SDK. A NanoCodana
agent is created with NodeAgent({ model, workingDirectory, systemPrompt, ... })
from "@nanocodana/nodejs" and run with agent.generate({ prompt }) or
agent.stream({ messages }).

When the user describes an agent they want:
1. Load the "build-agent" skill — it has the authoritative recipe and a template.
2. Follow it: write a runnable agent script (and a SKILL.md if useful) into your
   current working directory, then TEST it by actually running it.
3. Report what you built and the exact command to run it.

Keep generated agents minimal and test before declaring done. Never build an
agent whose job is to build other agents.`

const agent = NodeAgent({
  model: await buildModel(),
  workingDirectory: workspace,
  systemPrompt: SYSTEM_PROMPT,
  skills,
  // File writes prompt for approval so you see what's being scaffolded; running
  // the generated agent uses host Bash, which self-gates on approval too.
  needsApproval: ['Write', 'Edit', 'MultiEdit', 'Delete'],
})

/** Tool-call renderer tuned for the forge story: skill, scaffold, test. */
function onToolCall(chunk) {
  const input = chunk.input ?? {}
  const name = chunk.toolName
  if (name === 'Skill') {
    console.log(`\n${cyan(`↳ Skill(${JSON.stringify(input.name)})`)} ${dim('— loading the build recipe')}`)
  } else if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
    const file = input.path ?? input.file_path ?? ''
    console.log(`\n${green(`↳ ${name}(${JSON.stringify(file)})`)} ${dim('— scaffolding the agent')}`)
  } else if (name === 'Bash') {
    const cmd = String(input.command ?? '')
    console.log(`\n${yellow('↳ Bash')} ${dim(cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd)} ${dim('— testing it')}`)
  } else {
    const preview = JSON.stringify(input)
    console.log(dim(`\n↳ ${name}(${preview.length > 80 ? preview.slice(0, 77) + '...' : preview})`))
  }
}

repl({
  agent,
  onToolCall,
  banner() {
    console.log(bold('\n🏭 NanoCodana — Forge (an agent that builds agents)'))
    console.log(`Workspace: ${dim(workspace)}`)
    console.log(
      dim('Forge loads the "build-agent" skill, scaffolds a runnable NodeAgent, then tests it.\n'),
    )
    console.log('Describe an agent you want. Try:\n')
    console.log(`  ${dim('› ')}Build an agent that writes a conventional-commit message from a git diff`)
    console.log(`  ${dim('› ')}Make an agent that summarizes a text file into three bullet points`)
    console.log(
      `\n${dim('Approvals appear for file writes; running the generated agent uses host Bash.')}`,
    )
    console.log(`Type ${bold('exit')} to quit.\n`)
  },
})

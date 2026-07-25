// Project-skills demo — ZERO-CONFIG auto-discovery.
//
// The agent is created with NO skills passed in — just a working directory:
//
//     NodeAgent({ model, workingDirectory: '.../skills-project' })
//
// Core scans `.agents/skills` and `.claude/skills` relative to that directory,
// finds `skills-project/.claude/skills/conventional-commit/SKILL.md`, and
// registers a `Skill` tool automatically. You describe a task in plain
// language; the agent loads the skill on its own. Watch for `↳ Skill(...)`.
//
//   npm run project-skills-demo
//
// Requires ANTHROPIC_API_KEY (or OPENAI_API_KEY) in apps/node/.env
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeAgent, loadSkillsFromDirs } from '@nanocodana/nodejs'
import { dim, cyan, bold, buildModel, repl } from './demo-runtime.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workingDirectory = path.join(__dirname, 'skills-project')

// The ONLY config: model + workingDirectory. No `skills`, no `skillDirs`.
// Core discovers project skills from the working dir on its own.
const agent = NodeAgent({
  model: await buildModel(),
  workingDirectory,
})

// Display-only scan of the same dirs core scans, just to show what's there.
// The agent itself discovers them automatically — this is purely for the banner.
const discovered = await loadSkillsFromDirs([
  path.join(workingDirectory, '.agents', 'skills'),
  path.join(workingDirectory, '.claude', 'skills'),
])

repl({
  agent,
  banner() {
    console.log(bold('\n🤖 NanoCodana — Project-skills demo (zero config)'))
    console.log(`Project dir: ${dim(workingDirectory)}`)
    console.log(dim('NodeAgent was given NO skills — just this working directory.\n'))
    console.log(`The agent auto-discovered ${bold(String(discovered.length))} project skill(s):`)
    for (const s of discovered) console.log(`  ${cyan('•')} ${bold(s.name)} — ${s.description}`)
    console.log(`
Just describe a task — don't name the skill. Try:

  ${dim('› ')}Write a commit message for adding a dark mode toggle to settings
  ${dim('› ')}Give me a commit message for fixing a null crash in the parser

Watch for ${cyan('↳ Skill(name)')} — the agent loading the project skill itself.
Type ${bold('exit')} to quit.
`)
  },
})

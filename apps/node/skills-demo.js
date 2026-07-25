// Skills demo — show the agent deciding ON ITS OWN to load a skill.
//
// You describe a task in plain language. You never name the skill. The agent
// sees the skill catalog (names + one-line descriptions are always in context)
// and, when a task matches, calls the `Skill` tool to pull that skill's full
// instructions into context before acting. Watch for the cyan `↳ Skill(...)`.
//
//   npm run skills-demo
//
// Requires ANTHROPIC_API_KEY (or OPENAI_API_KEY) in apps/node/.env
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { NodeAgent, loadSkillsFromDirs } from '@nanocodana/nodejs'
import { dim, cyan, bold, buildModel, repl } from './demo-runtime.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workingDirectory = path.join(__dirname, 'working-dir')

// Skill discovery follows the cross-agent convention (home + project
// .agents/skills & .claude/skills) plus this repo's bundled examples. Later
// dirs win on a name collision, so project skills override global ones.
const exampleSkills = path.resolve(__dirname, '../../packages/cli/example-skills')
const skills = await loadSkillsFromDirs([
  path.join(os.homedir(), '.agents', 'skills'),
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(process.cwd(), '.agents', 'skills'),
  path.join(process.cwd(), '.claude', 'skills'),
  exampleSkills, // bundled examples: changelog, scaffold-component, build-agent
])

const agent = NodeAgent({
  model: await buildModel(),
  workingDirectory,
  skills, // <- the only line that turns skills on
})

repl({
  agent,
  banner() {
    console.log(bold('\n🤖 NanoCodana — Skills demo'))
    console.log(`Working dir: ${dim(workingDirectory)}\n`)
    console.log(`Loaded ${bold(String(skills.length))} skill(s):`)
    for (const s of skills) console.log(`  ${cyan('•')} ${bold(s.name)} — ${s.description}`)
    console.log(`
You don't name the skill — just describe the task and the agent decides whether
to load one. Try:

  ${dim('› ')}Make a new React component called UserCard in src/components
  ${dim('› ')}Draft a changelog entry for the staged git changes

Watch for ${cyan('↳ Skill(name)')} — that's the agent choosing to load a skill.
Type ${bold('exit')} to quit.
`)
  },
})

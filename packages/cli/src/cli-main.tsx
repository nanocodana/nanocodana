import React from 'react'
import os from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { render } from 'ink'
import meow from 'meow'
import { loadSkillsFromDirs } from '@nanocodana/nodejs'
import { ChatMode } from './commands/chat.js'
import { runPrint, readStdin } from './commands/print.js'
import {
  getModel,
  setModel,
  getConfigPath,
  getProviderId,
  setProviderId,
  setApiKeyFor,
  resolveApiKey,
  setBaseUrl,
  getBaseUrl,
} from './config/index.js'
import { PROVIDERS, getProvider, validateSetup } from './providers.js'

const cli = meow(
  `
  Usage
    $ codana [command] [options]

  Commands
    chat          Start interactive chat mode (default)
    config        Manage configuration
    version       Show version information

  In chat, type /help for slash commands (incl. /forge to build a new agent).

  Options
    --provider      Provider: ${Object.keys(PROVIDERS).join(' | ')}
    --api-key       API key for the selected provider
    --base-url      Base URL (for the openai-compatible "custom" provider)
    --model         Model id to use
    --print, -p     Run one prompt non-interactively and exit. Reads piped
                    stdin as extra context. Approval-gated tools are DENIED
                    (exit 2) unless --yolo is given, since there is nobody
                    to ask.
    --json          With --print, emit one JSON object instead of text
    --continue, -c  Resume the most recent conversation in this directory
    --yolo          Auto-approve all tool calls (skip approval prompts)
    --skills        Extra skills directory (loaded on top of the built-in
                    skills and .agents/skills + .claude/skills from home/project)
    --help          Show this help message

  Examples
    $ codana chat
    $ codana chat --continue
    $ codana config --provider anthropic --api-key sk-ant-...
    $ codana config --provider openai --api-key sk-...
    $ codana config --provider custom --base-url https://openrouter.ai/api/v1 --api-key sk-or-...
    $ codana chat --model gpt-4o
    $ codana -p "write a commit message for the staged diff"
    $ git diff | codana -p "review this"
    $ codana -p "which tests are failing?" --json | jq -r .text
`,
  {
    importMeta: import.meta,
    flags: {
      provider: { type: 'string' },
      apiKey: { type: 'string' },
      baseUrl: { type: 'string' },
      model: { type: 'string' },
      print: { type: 'string', shortFlag: 'p' },
      json: { type: 'boolean' },
      continue: { type: 'boolean', shortFlag: 'c' },
      yolo: { type: 'boolean' },
      skills: { type: 'string' },
    },
  },
)

/**
 * The `example-skills/` directory shipped with the package.
 *
 * Found by walking up rather than by a fixed offset, because this module runs
 * from two different depths: `src/` under `tsx` in development, and
 * `dist/bundle/lib/` in the published bundle. A hardcoded `'..'` was correct
 * for the former and silently wrong for the latter — and since
 * `loadSkillsFromDirs` skips missing directories without complaint, every
 * published CLI loaded zero built-in skills, including `build-agent`, which
 * `/forge` depends on and `--help` advertises.
 */
function builtinSkillsDir(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(dir, 'example-skills')
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const command = cli.input[0] || 'chat'

// Handle config command
if (command === 'config') {
  const targetProvider = cli.flags.provider || getProviderId()
  let changed = false

  if (cli.flags.provider) {
    if (!PROVIDERS[cli.flags.provider]) {
      console.error(`Unknown provider "${cli.flags.provider}". Options: ${Object.keys(PROVIDERS).join(', ')}`)
      process.exit(1)
    }
    setProviderId(cli.flags.provider)
    console.log(`✓ Provider set to ${cli.flags.provider}`)
    changed = true
  }
  if (cli.flags.apiKey) {
    setApiKeyFor(targetProvider, cli.flags.apiKey)
    console.log(`✓ API key saved for ${targetProvider}`)
    changed = true
  }
  if (cli.flags.baseUrl) {
    setBaseUrl(cli.flags.baseUrl)
    console.log(`✓ Base URL set to ${cli.flags.baseUrl}`)
    changed = true
  }
  if (cli.flags.model) {
    setModel(cli.flags.model)
    console.log(`✓ Model set to ${cli.flags.model}`)
    changed = true
  }

  if (!changed) {
    console.log(`Configuration stored at: ${getConfigPath()}`)
    console.log(`\nProvider: ${getProviderId()}`)
    console.log(`Model:    ${getModel()}`)
    const base = getBaseUrl()
    if (base) console.log(`Base URL: ${base}`)
    console.log(`\nProviders:`)
    for (const p of Object.values(PROVIDERS)) {
      const key = resolveApiKey(p.id)
      const mark = key ? `key ***${key.slice(-4)}` : 'no key'
      console.log(`  ${p.id === getProviderId() ? '●' : '○'} ${p.id.padEnd(10)} ${p.name.padEnd(20)} ${mark}`)
    }
  }
  process.exit(0)
}

// Handle version command
if (command === 'version') {
  console.log(`NanoCodana CLI v${cli.pkg.version}`)
  process.exit(0)
}

// Handle chat command (default)
if (command === 'chat') {
  const providerId = cli.flags.provider || getProviderId()
  const provider = getProvider(providerId)
  // Prefer an explicit --model, then the provider's default, then the stored
  // model. (custom's defaultModel is '', so fall through to getModel.)
  const model = cli.flags.model || provider.defaultModel || getModel()

  // Apply any one-shot flags so the chat session and config agree.
  if (cli.flags.apiKey) setApiKeyFor(providerId, cli.flags.apiKey)
  if (cli.flags.baseUrl) setBaseUrl(cli.flags.baseUrl)

  const problem = validateSetup(provider, {
    apiKey: resolveApiKey(providerId),
    baseUrl: getBaseUrl(),
    model,
  })
  if (problem) {
    console.error(problem)
    process.exit(1)
  }

  // Skills, in increasing precedence (later dirs win on a name collision):
  //   1. built-in skills shipped with the CLI (includes `build-agent`, so
  //      codana can forge new NanoCodana agents out of the box — see /forge)
  //   2. home-global .agents/skills and .claude/skills
  //   3. project .agents/skills and .claude/skills
  //   4. an explicit --skills dir
  // So a user's own skill of the same name always overrides a built-in one.
  const home = os.homedir()
  const cwd = process.cwd()
  const skills = await loadSkillsFromDirs([
    ...(builtinSkillsDir() ? [builtinSkillsDir()!] : []),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, '.claude', 'skills'),
    ...(cli.flags.skills ? [cli.flags.skills] : []),
  ])

  // `-p` is a flag rather than a command because the command slot is already
  // taken: `cli.input[0]` is read as a command name, so `codana "fix the bug"`
  // would be an unknown command rather than a prompt.
  if (cli.flags.print !== undefined) {
    // Piped input becomes context, so `git diff | codana -p "review this"`
    // works without the caller quoting a whole diff into the prompt.
    const piped = await readStdin()
    const prompt = piped.trim()
      ? `${cli.flags.print}\n\n<stdin>\n${piped.trimEnd()}\n</stdin>`
      : cli.flags.print

    if (!prompt.trim()) {
      console.error('Nothing to do: pass a prompt, e.g. codana -p "explain this repo"')
      process.exit(1)
    }

    // `process.exitCode`, never `process.exit()`: stdout is asynchronous when
    // piped, and exiting discards whatever has not drained — measured at 128 kB
    // delivered out of 5 MB. Letting the process end naturally flushes it, which
    // matters most for the case this mode exists for (`… | jq`, `… | pbcopy`).
    process.exitCode = await runPrint({
      prompt,
      providerId,
      modelId: model,
      apiKey: resolveApiKey(providerId),
      baseUrl: getBaseUrl(),
      skills,
      yolo: cli.flags.yolo ?? false,
      json: cli.flags.json ?? false,
    })
  } else {
    render(
      <ChatMode
        provider={providerId}
        model={model}
        resume={cli.flags.continue ?? false}
        yolo={cli.flags.yolo ?? false}
        skills={skills}
      />,
    )
  }
} else {
  console.error(`Unknown command: ${command}`)
  console.error('Run "codana --help" for usage information')
  process.exit(1)
}

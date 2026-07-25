// Shared runtime for the NanoCodana CLI demos (skills-demo, project-skills-demo,
// forge-demo). Provides: ANSI helpers, model selection from env, a readline
// line-queue that never drops input, a single streamed turn (with the approval
// loop), and an interactive REPL. Each demo just builds its agent + banner.
import * as readline from 'readline'
import dotenv from 'dotenv'

dotenv.config()

// --- ANSI helpers (just enough to make tool decisions pop) ---
export const dim = (s) => `\x1b[2m${s}\x1b[0m`
export const cyan = (s) => `\x1b[36m${s}\x1b[0m`
export const bold = (s) => `\x1b[1m${s}\x1b[0m`
export const green = (s) => `\x1b[32m${s}\x1b[0m`
export const yellow = (s) => `\x1b[33m${s}\x1b[0m`

/** Build a model from the environment: Anthropic if available, else OpenAI. */
export async function buildModel() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (anthropicKey) {
    const { createAnthropic } = await import('@ai-sdk/anthropic')
    return createAnthropic({ apiKey: anthropicKey })(
      process.env.NANOCODANA_MODEL_ID || 'claude-sonnet-4-5',
    )
  }
  if (openaiKey) {
    const { createOpenAI } = await import('@ai-sdk/openai')
    return createOpenAI({ apiKey: openaiKey })(process.env.NANOCODANA_MODEL_ID || 'gpt-4o')
  }
  throw new Error('Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) in a .env file (see .env.example)')
}

/**
 * A readline interface with a line queue: 'line' events that arrive while no
 * question is pending are buffered, so piped input is never dropped (an approval
 * prompt always gets its answer). EOF/Ctrl-D resolves any waiter — and future
 * asks — with null.
 */
export function createIO() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const queue = []
  let waiter = null
  let closed = false

  rl.on('line', (line) => {
    if (waiter) {
      const resolve = waiter
      waiter = null
      resolve(line)
    } else {
      queue.push(line)
    }
  })
  rl.on('close', () => {
    closed = true
    if (waiter) {
      const resolve = waiter
      waiter = null
      resolve(null)
    }
  })

  const ask = (q) => {
    process.stdout.write(q)
    if (queue.length > 0) return Promise.resolve(queue.shift())
    if (closed) return Promise.resolve(null)
    return new Promise((resolve) => {
      waiter = resolve
    })
  }

  return { rl, ask }
}

/** Default tool-call line renderer: highlight Skill, dim everything else. */
export function defaultToolCall(chunk) {
  const input = chunk.input ?? {}
  if (chunk.toolName === 'Skill') {
    console.log(`\n${cyan(`↳ Skill(${JSON.stringify(input.name)})`)} ${dim('— loading instructions')}`)
  } else {
    const preview = JSON.stringify(input)
    console.log(dim(`\n↳ ${chunk.toolName}(${preview.length > 80 ? preview.slice(0, 77) + '...' : preview})`))
  }
}

/**
 * Run one streamed turn against `agent`, appending to `messages`. Handles the
 * approval loop: if a tool needs approval, ask via `ask`, push the decision,
 * and continue the turn (which may itself need more approvals).
 */
export async function streamTurn(agent, messages, ask, { onToolCall = defaultToolCall } = {}) {
  const result = await agent.stream({ messages })
  let pendingApproval = null
  let wroteLabel = false

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      if (!wroteLabel) {
        process.stdout.write(bold('\nAgent: '))
        wroteLabel = true
      }
      process.stdout.write(chunk.text)
    } else if (chunk.type === 'tool-call') {
      wroteLabel = false
      onToolCall(chunk)
    } else if (chunk.type === 'tool-approval-request') {
      pendingApproval = chunk
      console.log(`\n⚠️  Approval required: ${bold(chunk.toolCall.toolName)}`)
      console.log(dim(`   ${JSON.stringify(chunk.toolCall.input)}`))
    }
  }

  const response = await result.response
  if (response?.messages) messages.push(...response.messages)

  if (pendingApproval) {
    const answer = await ask(bold('Approve? (y/n): '))
    const approved = (answer ?? '').trim().toLowerCase() === 'y'
    messages.push({
      role: 'tool',
      content: [
        { type: 'tool-approval-response', approvalId: pendingApproval.approvalId, approved },
      ],
    })
    await streamTurn(agent, messages, ask, { onToolCall })
  }
}

/** Interactive REPL: optional banner, then read → stream → repeat until exit. */
export async function repl({ agent, banner, onToolCall }) {
  const { rl, ask } = createIO()
  const messages = []
  if (banner) banner()
  while (true) {
    const input = await ask(bold('\nYou: '))
    if (input === null) break // EOF / Ctrl-D
    const message = input.trim()
    if (!message) continue
    if (message.toLowerCase() === 'exit') break
    try {
      messages.push({ role: 'user', content: message })
      await streamTurn(agent, messages, ask, { onToolCall })
      console.log('')
    } catch (err) {
      console.error(`\nError: ${err.message}`)
    }
  }
  console.log('\nGoodbye!')
  rl.close()
  process.exit(0)
}

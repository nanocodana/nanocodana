// Non-interactive mode: `codana -p "..."`.
//
// One turn, no TUI, exit when done — so codana composes with other tools:
//
//   codana -p "write a commit message" | pbcopy
//   git diff | codana -p "review this"
//   codana -p "list the failing tests" --json | jq -r .text
//
// APPROVALS WITHOUT A TERMINAL
//
// The interactive session halts on `tool-approval-request` and asks. Here there
// is nobody to ask, and the stream cannot resume until every request has a
// response, so the only choices are to answer them all yes or all no.
//
// Default is **no**: gated tools are denied and the run exits 2 if any were, so
// `-p` is safe to pipe into without reading the docs first. It can read, search
// and reason across the project, and it reports what it wanted to do rather
// than doing it. `--yolo` answers yes to everything, including host-shell
// escalation.
//
// BASH IS GATED HERE, UNLIKE IN CHAT. Interactively, Bash is deliberately not
// approval-gated: it self-governs, because sandbox runs are harmless and only
// `host: true` prompts. That reasoning does not survive the loss of the prompt.
// The sandbox operates on the *real* working directory, so with Write denied
// and Bash free the model simply reaches for `echo > file` and the denial
// becomes theatre — measured, not hypothetical: it did exactly that, wrote the
// file, and the run still exited 2 claiming it had been blocked.
//
// So without --yolo the whole shell is off, and what remains genuinely cannot
// mutate: Read, Grep, Glob, LS.
//
// The better fix is a read-only filesystem rather than a longer deny-list —
// just-bash ships OverlayFs with `readOnly: true` for exactly this — but
// NodeAgent builds its own filesystem and has no injection point, so that is an
// adapter change and deserves to be designed rather than bolted on here.
import { buildModel } from '../provider-init.js'
import { getMCPServers } from '../config/index.js'

const GATED_TOOLS = ['Write', 'Edit', 'MultiEdit', 'Delete', 'WebFetch', 'Bash']
const APPROVE_NOTHING = () => false

export interface PrintOptions {
  prompt: string
  providerId: string
  modelId: string
  apiKey?: string
  baseUrl?: string
  skills: unknown[]
  /** Answer yes to every approval, and allow host-shell escalation. */
  yolo: boolean
  /** Emit one JSON object instead of streaming text. */
  json: boolean
}

interface ToolRecord {
  name: string
  /** Matched against the approval's toolCallId — names are not unique per turn. */
  id?: string
  input: unknown
  denied?: boolean
}

/**
 * Read piped stdin, if any. Returns '' for a TTY or an empty pipe, so callers
 * can treat "no stdin" and "empty stdin" the same way.
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * @returns process exit code — 0 ok, 1 error, 2 a gated tool was denied.
 */
export async function runPrint(options: PrintOptions): Promise<number> {
  const { NodeAgent } = await import('@nanocodana/nodejs')

  let model: unknown
  try {
    model = await buildModel({
      providerId: options.providerId,
      modelId: options.modelId,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    })
  } catch (err: any) {
    process.stderr.write(`Failed to initialize model: ${err.message}\n`)
    return 1
  }

  const agent = NodeAgent({
    model,
    workingDirectory: process.cwd(),
    // MCP servers only with --yolo. GATED_TOOLS is a list of *names*, and an MCP
    // server contributes names we don't know, so nothing here can deny them — a
    // configured filesystem or git server would be fully callable while the run
    // reported that everything was blocked, and exit 2 would be a lie.
    //
    // This stands on its own: a developer who configures an MCP server has
    // granted it deliberately, so the issue is not the grant but that `-p`
    // promises "nothing mutating ran" and cannot keep that promise for names it
    // has never seen. (Core separately applies its approval policy only to
    // built-in tools, so a predicate policy never sees MCP tools either. Worth
    // fixing there, but this gate does not depend on it.)
    mcpServers: options.yolo ? getMCPServers() : {},
    skills: options.skills as never,
    // The CLI has already loaded every skills directory; don't rescan.
    skillDirs: [],
    needsApproval: options.yolo ? APPROVE_NOTHING : GATED_TOOLS,
    virtualBash: { python: true, javascript: true },
    // Only --yolo reaches the real machine. Without it the agent still has the
    // sandbox, so most read-and-reason tasks work unchanged.
    hostShell: options.yolo,
  } as never)

  // Status goes to stderr so `codana -p ... | pbcopy` receives only the answer.
  const status = (line: string) => {
    if (!options.json) process.stderr.write(`${line}\n`)
  }

  const messages: any[] = [{ role: 'user', content: options.prompt }]
  const tools: ToolRecord[] = []
  let text = ''
  let denied = false
  const usage = { input: 0, output: 0, cacheRead: 0 }

  // One iteration per approval round: the stream halts when it needs answers,
  // we record a response for every request, then resume. Bounded because each
  // round must answer at least one request, and denied tools are not re-asked.
  const MAX_ROUNDS = 32
  let hitRoundCap = true
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const approvals: Array<{ approvalId: string; toolName: string; toolCallId?: string }> = []

    let result: any
    let response: any
    try {
      result = await agent.stream({ messages } as never)

      for await (const chunk of result.fullStream as AsyncIterable<any>) {
        if (chunk.type === 'text-delta') {
          text += chunk.text
          if (!options.json) process.stdout.write(chunk.text)
        } else if (chunk.type === 'tool-call') {
          tools.push({ name: chunk.toolName, id: chunk.toolCallId, input: chunk.input ?? {} })
          status(`· ${chunk.toolName}`)
        } else if (chunk.type === 'tool-approval-request') {
          approvals.push({
            approvalId: chunk.approvalId,
            toolName: chunk.toolCall.toolName,
            toolCallId: chunk.toolCall.toolCallId,
          })
        } else if (chunk.type === 'error') {
          throw chunk.error ?? new Error('stream error')
        }
      }
      // Inside the try: this settles separately from the iterator and rejects on
      // its own (a failed final request, an aborted call). Awaiting it outside
      // turned a reportable error into an unhandled rejection and a stack trace.
      response = await result.response
    } catch (err: any) {
      if (!options.json && text && !text.endsWith('\n')) process.stdout.write('\n')
      process.stderr.write(`Error: ${err.message}\n`)
      return 1
    }

    if (response?.messages) messages.push(...response.messages)

    try {
      const u = await result.totalUsage
      if (u) {
        usage.input += u.inputTokens ?? 0
        usage.output += u.outputTokens ?? 0
        usage.cacheRead += u.inputTokenDetails?.cacheReadTokens ?? 0
      }
    } catch {
      /* usage is not always reported */
    }

    if (approvals.length === 0) {
      hitRoundCap = false
      break
    }

    // Every request needs a response before the stream can resume; one missing
    // answer fails the next call with MissingToolResultsError.
    for (const approval of approvals) {
      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: approval.approvalId,
            approved: options.yolo,
          },
        ],
      })
      if (!options.yolo) {
        denied = true
        // Match on toolCallId: two Write calls in one round are
        // indistinguishable by name, and the flag would land on the wrong one.
        const record =
          tools.find((t) => t.id !== undefined && t.id === approval.toolCallId) ??
          tools.find((t) => t.name === approval.toolName && !t.denied)
        if (record) record.denied = true
        // A request with no matching tool-call chunk would otherwise vanish
        // from tools[] while the top-level `denied` said true.
        else tools.push({ name: approval.toolName, id: approval.toolCallId, input: {}, denied: true })
        status(`✗ denied ${approval.toolName} — re-run with --yolo to allow it`)
      }
    }
  }

  if (hitRoundCap) {
    // Reaching the cap means the model kept asking for tools it had already been
    // refused. The answer below is whatever it managed in the meantime.
    process.stderr.write(
      `Stopped after ${MAX_ROUNDS} approval rounds — the result may be incomplete.\n`,
    )
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          text,
          tools: tools.map((t) => ({ name: t.name, denied: Boolean(t.denied) })),
          denied,
          usage,
        },
        null,
        2,
      )}\n`,
    )
  } else if (text && !text.endsWith('\n')) {
    process.stdout.write('\n')
  }

  return denied ? 2 : 0
}

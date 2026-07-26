import { jsonSchema } from 'ai'
import type { Tool, BashResult, VirtualShellOptions } from '@nanocodana/core/no-bash'
import { spawn } from 'node:child_process'

/**
 * Bash with sandbox-by-default and opt-in host escalation.
 *
 * - Default: runs in the just-bash sandbox (a contained shell with built-in
 *   coreutils, rooted at the working directory — no system binaries, no
 *   escaping the project).
 * - `host: true`: runs on the real machine shell via child_process. This is
 *   gated by `needsApproval` (a function of the args), so the host path always
 *   prompts the user, while sandbox calls run freely.
 *
 * When the sandbox reports a command isn't available, the result includes a
 * hint telling the model to retry with `host: true`, which produces the
 * approval prompt — the Cursor-style "run outside the sandbox?" escalation.
 */

interface NodeBashArgs {
  command: string
  host?: boolean
  timeout?: number
  description?: string
}

const COMMON_PROPERTIES = {
  command: { type: 'string' as const, description: 'The shell command to run.' },
  timeout: {
    type: 'number' as const,
    description: 'Optional timeout in milliseconds (max 600000).',
  },
  description: {
    type: 'string' as const,
    description: 'Clear, concise 5-10 word description of what this command does.',
  },
}

// Two schemas rather than one with an ignored flag: when host escalation is off,
// the model should not be told the door exists. Advertising a capability that
// always refuses wastes tokens and invites retries.
const SANDBOX_ONLY_SCHEMA = jsonSchema<NodeBashArgs>({
  type: 'object',
  properties: { ...COMMON_PROPERTIES },
  required: ['command'],
  additionalProperties: false,
})

const HOST_CAPABLE_SCHEMA = jsonSchema<NodeBashArgs>({
  type: 'object',
  properties: {
    ...COMMON_PROPERTIES,
    host: {
      type: 'boolean',
      description:
        'Run on the REAL host shell instead of the sandbox. Requires user approval and runs outside the project sandbox. Use only when the sandbox reports a command is unavailable (e.g. git, npm, node, docker) or you explicitly need installed system tools.',
    },
  },
  required: ['command'],
  additionalProperties: false,
})

const SANDBOX_MODES = `- Sandbox: a contained shell rooted at the working directory with built-in coreutils (ls, cat, grep, sed, awk, find, jq, gzip, tar, …). Operates on the project's real files but cannot run system binaries or escape the project directory.`

const SANDBOX_ONLY_DESCRIPTION = `Runs a shell command in a sandboxed shell.

${SANDBOX_MODES}

This agent has NO access to the host machine. System binaries (git, npm, node, docker) are unavailable and there is no way to reach them — do not suggest running them; report what the sandbox can do instead.

Guidance:
- Quote paths containing spaces. Chain commands with ';' or '&&' — do not use newlines.
- Do NOT use 'find' or 'grep' for searching files; use the Grep and Glob tools instead.`

const HOST_CAPABLE_DESCRIPTION = `Runs a shell command.

Execution modes:
${SANDBOX_MODES} Safe — no approval needed.
- Host (host: true): runs on the real machine shell. Can use installed tools like git, npm, node, docker. This runs OUTSIDE the sandbox and REQUIRES user approval.

Guidance:
- Prefer the sandbox. Only set host: true when the sandbox reports "command not found" or you explicitly need an installed system tool.
- Quote paths containing spaces. Chain commands with ';' or '&&' — do not use newlines.
- Do NOT use 'find' or 'grep' for searching files; use the Grep and Glob tools instead.`

const MAX_OUT = 30000
const DEFAULT_TIMEOUT = 120000
const MAX_TIMEOUT = 600000

function runOnHost(command: string, cwd: string, timeoutMs: number): Promise<BashResult> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { cwd, env: { ...process.env } })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr: `${stderr}\n${String(err)}`.trim(), exitCode: 1 })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        stdout: stdout.slice(0, MAX_OUT),
        stderr: ((timedOut ? `Command timed out after ${timeoutMs}ms\n` : '') + stderr).slice(0, MAX_OUT),
        exitCode: timedOut ? 124 : code ?? 0,
      })
    })
  })
}

export function createNodeBashTool(
  sandboxFs: { rawFs: any; cwd: string },
  workingDirectory: string,
  shellOptions: VirtualShellOptions = {},
  allowHost = false,
): Tool {
  // The real just-bash, not core's vendored Node-free build: on Node the native
  // and wasm backends are available, so `sqlite3` works and `python`/`javascript`
  // can be switched on. That's why this adapter keeps just-bash as a dependency.
  let bashPromise: Promise<any> | undefined
  const getSandbox = () => {
    if (!bashPromise) {
      bashPromise = import('just-bash').then(
        (mod) =>
          new mod.Bash({
            // Caller options first — fs and cwd are the tool's contract and
            // must not be overridable.
            //
            // Cast: `VirtualShellOptions` is intentionally open (it has an index
            // signature) so callers can reach anything just-bash supports without
            // core re-stating their types. That makes it a superset of
            // `BashOptions`, which TypeScript rejects on principle. Validation is
            // just-bash's job at construction.
            ...shellOptions,
            fs: sandboxFs.rawFs,
            cwd: sandboxFs.cwd,
          } as unknown as ConstructorParameters<typeof mod.Bash>[0]),
      )
    }
    return bashPromise
  }

  return {
    name: 'Bash',
    description: allowHost ? HOST_CAPABLE_DESCRIPTION : SANDBOX_ONLY_DESCRIPTION,
    compactDescription: allowHost
      ? 'Shell command. Sandbox by default; host:true runs the real shell (needs approval).'
      : 'Shell command, sandboxed. No host access.',
    parameters: allowHost ? HOST_CAPABLE_SCHEMA : SANDBOX_ONLY_SCHEMA,
    // Host runs always prompt; sandbox runs never do.
    needsApproval: (input: any) => allowHost && input?.host === true,
    execute: async ({ command, host, timeout }: NodeBashArgs): Promise<BashResult> => {
      const effectiveTimeout = Math.min(timeout && timeout > 0 ? timeout : DEFAULT_TIMEOUT, MAX_TIMEOUT)

      if (host) {
        // Defence in depth: the flag isn't in the schema when escalation is off,
        // but a model can still emit it. Refuse rather than silently running the
        // command in the sandbox, which would misreport where it executed.
        if (!allowHost) {
          return {
            stdout: '',
            stderr:
              'Host execution is disabled for this agent. This shell has no access to the host machine; run the command inside the sandbox or ask the operator to enable hostShell.',
            exitCode: 126,
          }
        }
        return runOnHost(command, workingDirectory, effectiveTimeout)
      }

      const bash = await getSandbox()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), effectiveTimeout)
      try {
        const r = await bash.exec(command, { signal: controller.signal })
        const notFound =
          r.exitCode !== 0 && /command not found|not found|unknown command/i.test(r.stderr || '')
        const hint = !notFound
          ? ''
          : allowHost
            ? '\n\n[sandbox] This command is not available in the sandboxed shell. Retry with host: true to run it on the host (this will ask the user for approval).'
            : '\n\n[sandbox] This command is not available in the sandboxed shell, and this agent cannot reach the host machine. Do not retry — use a built-in command or report the limitation.'
        return {
          stdout: (r.stdout || '').slice(0, MAX_OUT),
          stderr: ((r.stderr || '') + hint).slice(0, MAX_OUT + 200),
          exitCode: r.exitCode,
        }
      } catch {
        return { stdout: '', stderr: `Sandbox command timed out after ${effectiveTimeout}ms`, exitCode: 124 }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

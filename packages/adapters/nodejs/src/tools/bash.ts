import { jsonSchema } from 'ai'
import type { Tool, BashResult } from '@nanocodana/core'
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

const SCHEMA = jsonSchema<NodeBashArgs>({
  type: 'object',
  properties: {
    command: { type: 'string', description: 'The shell command to run.' },
    host: {
      type: 'boolean',
      description:
        'Run on the REAL host shell instead of the sandbox. Requires user approval and runs outside the project sandbox. Use only when the sandbox reports a command is unavailable (e.g. git, npm, node, docker) or you explicitly need installed system tools.',
    },
    timeout: { type: 'number', description: 'Optional timeout in milliseconds (max 600000).' },
    description: {
      type: 'string',
      description: 'Clear, concise 5-10 word description of what this command does.',
    },
  },
  required: ['command'],
  additionalProperties: false,
})

const DESCRIPTION = `Runs a shell command.

Execution modes:
- Sandbox (default): a contained shell rooted at the working directory with built-in coreutils (ls, cat, grep, sed, awk, find, jq, curl, gzip, tar, …). Operates on the project's real files but cannot run system binaries or escape the project directory. Safe — no approval needed.
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
): Tool {
  let bashPromise: Promise<any> | undefined
  const getSandbox = () => {
    if (!bashPromise) {
      bashPromise = import('just-bash').then(
        (mod) => new mod.Bash({ fs: sandboxFs.rawFs, cwd: sandboxFs.cwd }),
      )
    }
    return bashPromise
  }

  return {
    name: 'Bash',
    description: DESCRIPTION,
    compactDescription:
      'Shell command. Sandbox by default; host:true runs the real shell (needs approval).',
    parameters: SCHEMA,
    // Host runs always prompt; sandbox runs never do.
    needsApproval: (input: any) => input?.host === true,
    execute: async ({ command, host, timeout }: NodeBashArgs): Promise<BashResult> => {
      const effectiveTimeout = Math.min(timeout && timeout > 0 ? timeout : DEFAULT_TIMEOUT, MAX_TIMEOUT)

      if (host) {
        return runOnHost(command, workingDirectory, effectiveTimeout)
      }

      const bash = await getSandbox()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), effectiveTimeout)
      try {
        const r = await bash.exec(command, { signal: controller.signal })
        const notFound =
          r.exitCode !== 0 && /command not found|not found|unknown command/i.test(r.stderr || '')
        const hint = notFound
          ? '\n\n[sandbox] This command is not available in the sandboxed shell. Retry with host: true to run it on the host (this will ask the user for approval).'
          : ''
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

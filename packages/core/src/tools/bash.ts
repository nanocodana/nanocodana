import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface BashArgs {
  command: string
  timeout?: number
  description?: string
  run_in_background?: boolean
}

export const BASH_TOOL_SCHEMA = jsonSchema<BashArgs>({
  type: 'object',
  properties: {
    command: { type: 'string', description: 'The command to execute' },
    timeout: { type: 'number', description: 'Optional timeout in milliseconds (max 600000)' },
    description: { type: 'string', description: 'Clear, concise description of what this command does in 5-10 words' },
    run_in_background: {
      type: 'boolean',
      description: 'Set to true to run this command in the background. Use BashOutput to read the output later.'
    }
  },
  required: ['command'],
  additionalProperties: false
})

export interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  shellId?: string // For background processes
}

interface CreateBashToolOptions {
  description?: string
  compactDescription?: string
  needsApproval?: Tool['needsApproval']
}

export function createBashTool(
  execute: (params: BashArgs) => Promise<BashResult>,
  options: CreateBashToolOptions = {}
): Tool {
  return {
    name: 'Bash',
    description: options.description ?? `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use the LS tool to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use LS to check that "foo" exists and is the intended parent directory

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes (e.g., cd "path with spaces/file.txt")
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

Usage notes:
  - The command argument is required.
  - You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 120000ms (2 minutes).
  - It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
  - If the output exceeds 30000 characters, output will be truncated before being returned to you.
  - VERY IMPORTANT: You MUST avoid using search commands like 'find' and 'grep'. Instead use Grep, Glob to search. You MUST avoid read tools like 'cat', 'head', 'tail', and 'ls', and use Read and LS to read files.
  - When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines.
  - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of 'cd'.`,
    compactDescription: options.compactDescription,
    parameters: BASH_TOOL_SCHEMA,
    needsApproval: options.needsApproval ?? true,
    execute
  }
}

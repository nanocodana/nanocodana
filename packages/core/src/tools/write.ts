import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface WriteArgs {
  path: string
  content: string
}

export const WRITE_TOOL_SCHEMA = jsonSchema<WriteArgs>({
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The path to the file to write' },
    content: { type: 'string', description: 'The content to write to the file' }
  },
  required: ['path', 'content'],
  additionalProperties: false
})

export function createWriteTool(
  execute: (params: WriteArgs) => Promise<string>
): Tool {
  return {
    name: 'Write',
    description: `Writes a file to the filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- Prefer the Edit tool for modifying existing files — it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`,
    compactDescription: 'Creates or overwrites files. Read first if file exists. Prefer Edit for modifications.',
    parameters: WRITE_TOOL_SCHEMA,
    execute
  }
}

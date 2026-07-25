import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface ReadArgs {
  path: string
  offset?: number
  limit?: number
}

export const READ_TOOL_SCHEMA = jsonSchema<ReadArgs>({
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'The path to the file to read'
    },
    offset: {
      type: 'number',
      description: 'The line number to start reading from. Only provide if the file is too large to read at once'
    },
    limit: {
      type: 'number',
      description: 'The number of lines to read. Only provide if the file is too large to read at once'
    }
  },
  required: ['path'],
  additionalProperties: false
})

export function createReadTool(execute: (params: ReadArgs) => Promise<string>): Tool {
  return {
    name: 'Read',
    description: `Reads a file from the filesystem.

Usage:
- Use relative paths from the working directory (e.g. 'README.md', 'src/index.ts')
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Results are returned using cat -n format, with line numbers starting at 1
- This tool can read any file type. When reading an image file the contents are presented visually.
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents`,
    compactDescription: 'Reads file content with line numbers.',
    parameters: READ_TOOL_SCHEMA,
    execute
  }
}

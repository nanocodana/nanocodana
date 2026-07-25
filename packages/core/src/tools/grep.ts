import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface GrepArgs {
  pattern: string
  filePattern?: string
  caseSensitive?: boolean
}

export const GREP_TOOL_SCHEMA = jsonSchema<GrepArgs>({
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'Regular expression pattern to search for' },
    filePattern: { type: 'string', description: 'Optional glob pattern to filter files (e.g., "**/*.ts")' },
    caseSensitive: { type: 'boolean', description: 'Whether the search is case sensitive (default: true)' }
  },
  required: ['pattern'],
  additionalProperties: false
})

export interface GrepResult {
  file: string
  line: number
  content: string
}

export function createGrepTool(
  execute: (params: GrepArgs) => Promise<GrepResult[]>
): Tool {
  return {
    name: 'Grep',
    description: 'Searches for a pattern in files using regex. Returns matching lines with file paths and line numbers.',
    compactDescription: 'Search files with regex. Returns line matches.',
    parameters: GREP_TOOL_SCHEMA,
    execute
  }
}

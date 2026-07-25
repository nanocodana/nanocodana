import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface GlobArgs {
  pattern: string
  path?: string
}

export const GLOB_TOOL_SCHEMA = jsonSchema<GlobArgs>({
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'The glob pattern to match files against' },
    path: {
      type: 'string',
      description: 'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.'
    }
  },
  required: ['pattern'],
  additionalProperties: false
})

export function createGlobTool(execute: (params: GlobArgs) => Promise<string[]>): Tool {
  return {
    name: 'Glob',
    description: `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.`,
    compactDescription: 'Finds files by glob pattern (e.g. "**/*.ts").',
    parameters: GLOB_TOOL_SCHEMA,
    execute
  }
}

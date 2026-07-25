import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface LsArgs {
  path: string
  ignore?: string[]
}

export const LS_TOOL_SCHEMA = jsonSchema<LsArgs>({
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'The absolute path to the directory to list (must be absolute, not relative)'
    },
    ignore: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of glob patterns to ignore'
    }
  },
  required: ['path'],
  additionalProperties: false
})

export interface LsEntry {
  name: string
  type: 'file' | 'directory'
  path: string
}

export function createLsTool(
  execute: (params: LsArgs) => Promise<LsEntry[]>
): Tool {
  return {
    name: 'LS',
    description: 'Lists files and directories in a given path. The path parameter must be an absolute path, not a relative path. You can optionally provide an array of glob patterns to ignore with the ignore parameter. You should generally prefer the Glob and Grep tools, if you know which directories to search.',
    compactDescription: 'Lists files/dirs at path (absolute paths only).',
    parameters: LS_TOOL_SCHEMA,
    execute
  }
}

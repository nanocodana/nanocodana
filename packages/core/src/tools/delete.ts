import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface DeleteArgs {
  path: string
}

export const DELETE_TOOL_SCHEMA = jsonSchema<DeleteArgs>({
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The path to the file to delete' }
  },
  required: ['path'],
  additionalProperties: false
})

export function createDeleteTool(execute: (params: DeleteArgs) => Promise<string>): Tool {
  return {
    name: 'Delete',
    description: 'Deletes a file from storage',
    compactDescription: 'Deletes a file.',
    parameters: DELETE_TOOL_SCHEMA,
    execute
  }
}

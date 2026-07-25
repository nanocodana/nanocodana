import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface EditArgs {
  path: string
  oldText: string
  newText: string
  replaceAll?: boolean
}

export const EDIT_TOOL_SCHEMA = jsonSchema<EditArgs>({
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The path to the file to modify' },
    oldText: { type: 'string', description: 'The text to replace' },
    newText: { type: 'string', description: 'The text to replace it with (must be different from oldText)' },
    replaceAll: {
      type: 'boolean',
      default: false,
      description: 'Replace all occurrences of oldText (default false)'
    }
  },
  required: ['path', 'oldText', 'newText'],
  additionalProperties: false
})

export function createEditTool(
  execute: (params: EditArgs) => Promise<string>
): Tool {
  return {
    name: 'Edit',
    description: `Performs exact string replacements in files.

Usage:
- You must use your Read tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the oldText or newText.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if oldText is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use replaceAll to change every instance of oldText.
- Use replaceAll for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
    compactDescription: 'Replaces exact text in file. oldText must be unique or use replaceAll.',
    parameters: EDIT_TOOL_SCHEMA,
    execute
  }
}

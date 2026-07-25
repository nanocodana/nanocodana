/** Slash command metadata, used by /help and for parsing user input. */
export interface SlashCommand {
  name: string
  args?: string
  description: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Show available commands' },
  { name: 'clear', description: 'Clear the conversation and start fresh' },
  { name: 'model', args: '[id]', description: 'Show the current model, or switch with /model <id>' },
  { name: 'provider', args: '[id]', description: 'Show providers, or switch with /provider <id>' },
  { name: 'yolo', description: 'Toggle auto-approve (run tools without asking)' },
  { name: 'skills', description: 'List the skills available to the agent' },
  { name: 'forge', args: '<description>', description: 'Build a new NanoCodana agent from a description' },
  { name: 'cost', description: 'Show token usage for this session' },
  { name: 'exit', description: 'Quit NanoCodana' },
]

export interface ParsedSlash {
  name: string
  arg: string
}

/** Parse "/model claude-x" → { name: 'model', arg: 'claude-x' }. */
export function parseSlash(input: string): ParsedSlash | null {
  if (!input.startsWith('/')) return null
  const trimmed = input.slice(1).trim()
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { name: trimmed.toLowerCase(), arg: '' }
  return {
    name: trimmed.slice(0, spaceIdx).toLowerCase(),
    arg: trimmed.slice(spaceIdx + 1).trim(),
  }
}

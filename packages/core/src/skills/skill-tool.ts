import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

/**
 * A loadable skill (Anthropic Agent Skills model): a name + short description
 * that lives in the tool catalog, plus a full markdown body of instructions
 * that's only pulled into context when the model loads the skill.
 */
export interface Skill {
  name: string
  description: string
  /** Full markdown body shown when the skill is loaded. */
  instructions: string
  /** Optional on-disk directory of the skill's files (for running scripts). */
  path?: string
}

export interface SkillArgs {
  name: string
}

/**
 * Build the `Skill` tool. Its description auto-lists the available skills
 * (cheap, always in context); calling it returns one skill's full
 * instructions (progressive disclosure).
 */
export function createSkillTool(skills: Skill[]): Tool {
  const byName = new Map(skills.map((s) => [s.name, s]))

  const list =
    skills.length > 0
      ? skills.map((s) => `  - ${s.name}: ${s.description}`).join('\n')
      : '  (none)'

  return {
    name: 'Skill',
    description: `Load a skill's full instructions on demand. Call this with a skill name to get authoritative, step-by-step guidance for that kind of task before doing it. Treat the returned instructions as authoritative.

Available skills:
${list}`,
    compactDescription: 'Loads a skill’s instructions by name.',
    parameters: jsonSchema<SkillArgs>({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the skill to load' },
      },
      required: ['name'],
      additionalProperties: false,
    }),
    execute: async ({ name }: SkillArgs) => {
      const skill = byName.get(name)
      if (!skill) {
        const names = skills.map((s) => s.name).join(', ') || 'none'
        return `Skill "${name}" not found. Available skills: ${names}`
      }
      return skill.path
        ? `${skill.instructions}\n\n(This skill's files are at: ${skill.path})`
        : skill.instructions
    },
  }
}

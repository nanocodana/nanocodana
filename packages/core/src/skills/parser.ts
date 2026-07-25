import type { Skill } from './skill-tool.js'

/**
 * Parse a SKILL.md document: YAML-ish frontmatter (name, description) followed
 * by a markdown body of instructions. Dependency-free — we only need a couple
 * of scalar keys, so a small splitter beats pulling in a YAML library.
 *
 * Returns null if the required `name`/`description` fields are missing.
 */
export function parseSkill(content: string): Omit<Skill, 'path'> | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) return null

  const [, frontmatter, body] = match
  const meta: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key) meta[key] = value
  }

  if (!meta.name || !meta.description) return null
  return {
    name: meta.name,
    description: meta.description,
    instructions: body.trim(),
  }
}

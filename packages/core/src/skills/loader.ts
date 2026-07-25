import type { IFileSystem } from 'just-bash'
import { parseSkill } from './parser.js'
import type { Skill } from './skill-tool.js'

/**
 * Discover skills under `dir` using any IFileSystem — the same abstraction the
 * Node (real disk) and browser (IndexedDB / in-memory) adapters already
 * implement. Each subdirectory with a SKILL.md becomes a Skill, with `path`
 * set to its location *in that filesystem* (so the agent's Bash, which runs on
 * the same FS, can reach its scripts).
 *
 * Returns [] for a missing/unreadable directory.
 */
export async function loadSkills(fs: IFileSystem, dir: string): Promise<Skill[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }

  const skills: Skill[] = []
  for (const name of names) {
    const skillDir = fs.resolvePath(dir, name)
    try {
      const stat = await fs.stat(skillDir)
      if (!stat.isDirectory) continue
      const content = await fs.readFile(fs.resolvePath(skillDir, 'SKILL.md'), 'utf8')
      const parsed = parseSkill(content)
      if (parsed) skills.push({ ...parsed, path: skillDir })
    } catch {
      /* no SKILL.md, unreadable, or not a dir — skip */
    }
  }
  return skills
}

/**
 * Load skills from several directories on one filesystem, de-duped by name
 * (later directories win, so a project skill can override a global one).
 */
export async function loadSkillsFrom(fs: IFileSystem, dirs: string[]): Promise<Skill[]> {
  const byName = new Map<string, Skill>()
  for (const dir of dirs) {
    for (const skill of await loadSkills(fs, dir)) byName.set(skill.name, skill)
  }
  return [...byName.values()]
}

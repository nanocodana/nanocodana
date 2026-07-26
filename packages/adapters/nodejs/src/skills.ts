import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadSkills, loadSkillsFrom, type Skill, type IFileSystem } from '@nanocodana/core/no-bash'

/**
 * A minimal IFileSystem over Node's real filesystem (absolute paths, no root
 * confinement) — only the methods core's loadSkills needs. This lets the
 * shared discovery/parse algorithm in core run against the *platform's own
 * filesystem*, the same way the browser adapter runs it against IndexedDB.
 */
const nodeRealFs = {
  readdir: (path: string) => readdir(path),
  readFile: (path: string) => readFile(path, 'utf8'),
  resolvePath: (base: string, path: string) => resolve(base, path),
  async stat(path: string) {
    const s = await stat(path)
    return {
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      isSymbolicLink: s.isSymbolicLink(),
      mode: s.mode,
      size: s.size,
      mtime: s.mtime,
    }
  },
} as unknown as IFileSystem

/** Load skills from a directory on the real filesystem. */
export function loadSkillsFromDir(dir: string): Promise<Skill[]> {
  return loadSkills(nodeRealFs, dir)
}

/** Load skills from several real-filesystem directories (later dirs win). */
export function loadSkillsFromDirs(dirs: string[]): Promise<Skill[]> {
  return loadSkillsFrom(nodeRealFs, dirs)
}

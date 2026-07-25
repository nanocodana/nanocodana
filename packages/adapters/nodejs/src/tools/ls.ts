import { createLsTool, type LsEntry } from '@nanocodana/core'
import { readdir } from 'fs/promises'
import { join } from 'path'
import { minimatch } from 'minimatch'

export function createNodeLsTool(workingDirectory: string) {
  return createLsTool(async ({ path, ignore }) => {
    // Resolve the full path
    const fullPath = path.startsWith('/') ? path : join(workingDirectory, path)

    // Read directory entries
    const dirents = await readdir(fullPath, { withFileTypes: true })

    // Convert to LsEntry format
    const entries: LsEntry[] = []

    for (const dirent of dirents) {
      // Apply ignore patterns
      if (ignore && ignore.some(pattern => minimatch(dirent.name, pattern))) {
        continue
      }

      entries.push({
        name: dirent.name,
        type: dirent.isDirectory() ? 'directory' : 'file',
        path: join(fullPath, dirent.name)
      })
    }

    // Sort: directories first, then files, both alphabetically
    return entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  })
}

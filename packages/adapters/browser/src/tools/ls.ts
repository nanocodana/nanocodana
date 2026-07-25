import { createLsTool, type LsEntry } from '@nanocodana/core'
import type { MemoryFileSystem } from '../storage/memory-fs.js'

// `minimatch` (~28 KB gzipped) is only needed when an LS call passes an
// `ignore` array. Lazy-imported on first such call and cached after.
let minimatchPromise: Promise<typeof import('minimatch').minimatch> | undefined
function getMinimatch() {
  if (!minimatchPromise) {
    minimatchPromise = import('minimatch').then((mod) => mod.minimatch)
  }
  return minimatchPromise
}

export function createBrowserLsTool(fs: MemoryFileSystem) {
  return createLsTool(async ({ path, ignore }) => {
    // Normalize path
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path
    const searchPrefix = normalizedPath === '' ? '' : normalizedPath + '/'

    // Get all files
    const allFiles = await fs.list()

    // Find files in this directory
    const filesInDir = allFiles.filter(filePath => {
      // For root directory, check if path doesn't start with /
      if (normalizedPath === '' || normalizedPath === '/') {
        return !filePath.startsWith('/')
      }
      return filePath.startsWith(searchPrefix)
    })

    // Extract immediate children (files and directories)
    const entries = new Map<string, LsEntry>()

    // Only load minimatch when the call actually filters by ignore patterns.
    // Calls without `ignore` never touch the chunk.
    const minimatch = ignore && ignore.length > 0 ? await getMinimatch() : null

    for (const filePath of filesInDir) {
      // Get relative path from the directory
      const relativePath = filePath.substring(searchPrefix.length)

      // Skip if empty
      if (!relativePath) continue

      // Check if this is a direct child or nested
      const firstSlash = relativePath.indexOf('/')

      if (firstSlash === -1) {
        // Direct file
        const name = relativePath

        // Apply ignore patterns
        if (minimatch && ignore!.some(pattern => minimatch(name, pattern))) {
          continue
        }

        entries.set(name, {
          name,
          type: 'file',
          path: filePath
        })
      } else {
        // Nested - this represents a directory
        const dirName = relativePath.substring(0, firstSlash)

        // Apply ignore patterns
        if (minimatch && ignore!.some(pattern => minimatch(dirName, pattern))) {
          continue
        }

        // Only add if not already added
        if (!entries.has(dirName)) {
          entries.set(dirName, {
            name: dirName,
            type: 'directory',
            path: searchPrefix + dirName
          })
        }
      }
    }

    return Array.from(entries.values()).sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  })
}

import { createEditTool } from '@nanocodana/core'
import type { MemoryFileSystem } from '../storage/memory-fs.js'

export function createBrowserEditTool(fs: MemoryFileSystem) {
  return createEditTool(async ({ path, oldText, newText, replaceAll }) => {
    await fs.edit(path, oldText, newText, replaceAll)
    return `Successfully replaced text in ${path}`
  })
}

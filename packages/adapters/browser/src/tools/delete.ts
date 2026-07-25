import { createDeleteTool } from '@nanocodana/core'
import type { MemoryFileSystem } from '../storage/memory-fs.js'

export function createBrowserDeleteTool(fs: MemoryFileSystem) {
  return createDeleteTool(async ({ path }) => {
    await fs.delete(path)
    return `Successfully deleted ${path}`
  })
}

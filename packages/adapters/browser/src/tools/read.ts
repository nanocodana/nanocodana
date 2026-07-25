import { createReadTool } from '@nanocodana/core'
import type { MemoryFileSystem } from '../storage/memory-fs.js'

export function createBrowserReadTool(fs: MemoryFileSystem) {
  return createReadTool(async ({ path }) => {
    return await fs.read(path)
  })
}

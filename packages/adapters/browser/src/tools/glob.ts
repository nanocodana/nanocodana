import { createGlobTool } from '@nanocodana/core'
import type { MemoryFileSystem } from '../storage/memory-fs.js'

export function createBrowserGlobTool(fs: MemoryFileSystem) {
  return createGlobTool(async ({ pattern }) => {
    return await fs.glob(pattern)
  })
}

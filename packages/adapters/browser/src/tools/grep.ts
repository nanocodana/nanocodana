import { createGrepTool } from '@nanocodana/core'
import type { MemoryFileSystem } from '../storage/memory-fs.js'

export function createBrowserGrepTool(fs: MemoryFileSystem) {
  return createGrepTool(async ({ pattern, filePattern, caseSensitive }) => {
    return await fs.grep(pattern, filePattern, caseSensitive ?? true)
  })
}

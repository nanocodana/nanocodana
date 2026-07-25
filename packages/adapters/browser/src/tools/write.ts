import { createWriteTool } from '@nanocodana/core'
import type { MemoryFileSystem } from '../storage/memory-fs.js'

export function createBrowserWriteTool(fs: MemoryFileSystem) {
  return createWriteTool(async ({ path, content }) => {
    await fs.write(path, content)
    return `Successfully wrote ${content.length} characters to ${path}`
  })
}

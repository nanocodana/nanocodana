import { createDeleteTool } from '@nanocodana/core'
import type { NodeFileSystem } from '../storage/node-fs.js'

export function createNodeDeleteTool(fs: NodeFileSystem) {
  return createDeleteTool(async ({ path }) => {
    await fs.delete(path)
    return `Successfully deleted ${path}`
  })
}

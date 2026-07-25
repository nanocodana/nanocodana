import { createReadTool } from '@nanocodana/core'
import type { NodeFileSystem } from '../storage/node-fs.js'

export function createNodeReadTool(fs: NodeFileSystem) {
  return createReadTool(async ({ path, offset, limit }) => {
    return await fs.read(path, offset, limit)
  })
}

import { createReadTool } from '@nanocodana/core/no-bash'
import type { NodeFileSystem } from '../storage/node-fs.js'

export function createNodeReadTool(fs: NodeFileSystem) {
  return createReadTool(async ({ path, offset, limit }) => {
    return await fs.read(path, offset, limit)
  })
}

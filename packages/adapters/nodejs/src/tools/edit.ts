import { createEditTool } from '@nanocodana/core'
import type { NodeFileSystem } from '../storage/node-fs.js'

export function createNodeEditTool(fs: NodeFileSystem) {
  return createEditTool(async ({ path, oldText, newText, replaceAll }) => {
    await fs.edit(path, oldText, newText, replaceAll)
    return `Successfully replaced text in ${path}`
  })
}

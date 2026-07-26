import { createMultiEditTool } from '@nanocodana/core/no-bash'
import { NodeFileSystem } from '../storage/node-fs.js'

export function createNodeMultiEditTool(fs: NodeFileSystem) {
  return createMultiEditTool(async ({ file_path, edits }) => {
    await fs.multiEdit(file_path, edits)
    return `Successfully applied ${edits.length} edit(s) to ${file_path}`
  })
}

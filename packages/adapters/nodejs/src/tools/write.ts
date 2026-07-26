import { createWriteTool } from '@nanocodana/core/no-bash'
import type { NodeFileSystem } from '../storage/node-fs.js'

export function createNodeWriteTool(fs: NodeFileSystem) {
  return createWriteTool(async ({ path, content }) => {
    await fs.write(path, content)
    return `Successfully wrote ${content.length} characters to ${path}`
  })
}

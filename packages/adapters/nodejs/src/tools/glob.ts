import { createGlobTool } from '@nanocodana/core/no-bash'
import fg from 'fast-glob'
import { join } from 'path'

export function createNodeGlobTool(workingDirectory: string) {
  return createGlobTool(async ({ pattern, path }) => {
    const searchDir = path ? join(workingDirectory, path) : workingDirectory
    const files = await fg(pattern, {
      cwd: searchDir,
      dot: true,
      onlyFiles: true
    })
    return files
  })
}

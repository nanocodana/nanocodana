import { ToolFileSystem } from '@nanocodana/core'
// The vendored shell (build/bundle-shell.mjs), not the just-bash package:
// just-bash is a devDependency here and does not exist in a consumer's tree.
import { ReadWriteFs } from '../shell/lib/bundle.js'

export class NodeFileSystem extends ToolFileSystem {
  private readonly workspaceRoot: string

  constructor(
    workingDirectory: string = process.cwd(),
    onFilesChange?: (changes: Array<{ path: string; content?: string }>) => void
  ) {
    const resolvedWorkingDirectory = workingDirectory || process.cwd()
    super(
      new ReadWriteFs({
        root: resolvedWorkingDirectory
      }),
      '/',
      onFilesChange
    )
    this.workspaceRoot = resolvedWorkingDirectory
  }

  get root(): string {
    return this.workspaceRoot
  }

  protected override resolvePath(path: string): string {
    if (path.startsWith(this.workspaceRoot)) {
      const relativePath = path.slice(this.workspaceRoot.length).replace(/^\/+/, '')
      return super.resolvePath(relativePath)
    }

    if (path.startsWith('/')) {
      return super.resolvePath(path.slice(1))
    }

    return super.resolvePath(path)
  }
}

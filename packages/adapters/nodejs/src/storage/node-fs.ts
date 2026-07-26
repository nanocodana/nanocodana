import { ToolFileSystem, type IFileSystem } from '@nanocodana/core/no-bash'
// The real just-bash, not core's vendored build: ReadWriteFs needs node:fs and
// is excluded from the browser entry that core ships.
import { ReadWriteFs } from 'just-bash'

export class NodeFileSystem extends ToolFileSystem {
  private readonly workspaceRoot: string

  constructor(
    workingDirectory: string = process.cwd(),
    onFilesChange?: (changes: Array<{ path: string; content?: string }>) => void
  ) {
    const resolvedWorkingDirectory = workingDirectory || process.cwd()
    super(
      // Cast across the vendoring seam. Core declares `IFileSystem` itself so
      // that consumers on browser and edge — who have no just-bash — can still
      // type-check it. just-bash 3.x brands `ByteString` with a `unique symbol`,
      // which is nominal, so the two declarations are structurally identical but
      // not assignable. This adapter is the one place both exist, and this is the
      // one line where they meet.
      new ReadWriteFs({
        root: resolvedWorkingDirectory
      }) as unknown as IFileSystem,
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

import type { IFileSystem } from 'just-bash'
import type { EditOperation } from '../tools/multi-edit.js'
import type { LsEntry } from '../tools/ls.js'

export type FileChange = Array<{ path: string; content?: string }>

interface FileTypeEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

export function formatReadOutput(content: string, offset?: number, limit?: number): string {
  const lines = content.split('\n')
  const startLine = offset || 0
  const endLine = limit ? startLine + limit : Math.min(lines.length, startLine + 2000)
  const selectedLines = lines.slice(startLine, endLine)

  return selectedLines
    .map((line, index) => {
      const lineNumber = startLine + index + 1
      const truncatedLine = line.length > 2000 ? line.substring(0, 2000) : line
      return `${lineNumber.toString().padStart(6, ' ')}\t${truncatedLine}`
    })
    .join('\n')
}

function globToRegex(pattern: string): RegExp {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
    .replace(/\/\*\*/g, '__SLASH_GLOBSTAR__')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/__GLOBSTAR_SLASH__/g, '(?:(?:[^/]+/)*)')
    .replace(/__SLASH_GLOBSTAR__/g, '(?:/.*)?')
    .replace(/__GLOBSTAR__/g, '.*')

  return new RegExp(`^${regexPattern}$`)
}

function toDisplayPath(path: string): string {
  return path.replace(/^\/+/, '')
}

function shouldIgnore(name: string, ignore?: string[]): boolean {
  return ignore?.some(pattern => {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
    return regex.test(name)
  }) ?? false
}

async function snapshotFiles(fs: IFileSystem, roots: string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const normalizedRoots = Array.from(
    new Set(
      roots
        .map(root => root.replace(/\/+$/, '') || '/')
        .filter(Boolean)
    )
  )
  // getAllPaths() is the one synchronous method in the IFileSystem contract,
  // so async-init backends (e.g. IndexedDB) can't gate it on readiness. Force
  // readiness through a gated no-op first so the snapshot can't observe a
  // cold, half-loaded cache.
  await fs.exists('/')
  const allPaths = fs.getAllPaths()

  for (const path of allPaths) {
    if (!path || path === '/') continue

    const isRelevant = normalizedRoots.some(root =>
      path === root || path.startsWith(`${root}/`)
    )

    if (!isRelevant) continue

    try {
      const stats = await fs.stat(path)
      if (!stats.isFile) continue
      files.set(path, await fs.readFile(path, 'utf8'))
    } catch {
      // Ignore unstable paths during snapshotting.
    }
  }

  for (const root of normalizedRoots) {
    if (root === '/') continue

    try {
      const stats = await fs.stat(root)
      if (stats.isFile && !files.has(root)) {
        files.set(root, await fs.readFile(root, 'utf8'))
      }
    } catch {
      // Ignore missing roots.
    }
  }

  return files
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>): FileChange {
  const changes: FileChange = []

  for (const [path, content] of after.entries()) {
    if (before.get(path) !== content) {
      changes.push({
        path: toDisplayPath(path),
        content
      })
    }
  }

  for (const path of before.keys()) {
    if (!after.has(path)) {
      changes.push({
        path: toDisplayPath(path)
      })
    }
  }

  return changes
}

export class DelegatingFileSystem implements IFileSystem {
  constructor(protected readonly inner: IFileSystem) {}

  async readFile(path: string, options?: Parameters<IFileSystem['readFile']>[1]): Promise<string> {
    return this.inner.readFile(path, options)
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.inner.readFileBuffer(path)
  }

  async writeFile(path: string, content: Parameters<IFileSystem['writeFile']>[1], options?: Parameters<IFileSystem['writeFile']>[2]): Promise<void> {
    await this.inner.writeFile(path, content, options)
  }

  async appendFile(path: string, content: Parameters<IFileSystem['appendFile']>[1], options?: Parameters<IFileSystem['appendFile']>[2]): Promise<void> {
    await this.inner.appendFile(path, content, options)
  }

  async exists(path: string): Promise<boolean> {
    return this.inner.exists(path)
  }

  async stat(path: string) {
    return this.inner.stat(path)
  }

  async lstat(path: string) {
    return this.inner.lstat(path)
  }

  async mkdir(path: string, options?: Parameters<IFileSystem['mkdir']>[1]): Promise<void> {
    await this.inner.mkdir(path, options)
  }

  async readdir(path: string): Promise<string[]> {
    return this.inner.readdir(path)
  }

  async readdirWithFileTypes(path: string): Promise<FileTypeEntry[]> {
    if (this.inner.readdirWithFileTypes) {
      return this.inner.readdirWithFileTypes(path)
    }

    const entries = await this.inner.readdir(path)
    return Promise.all(
      entries.map(async entry => {
        const fullPath = this.inner.resolvePath(path, entry)
        const stats = await this.inner.stat(fullPath)
        return {
          name: entry,
          isFile: stats.isFile,
          isDirectory: stats.isDirectory,
          isSymbolicLink: stats.isSymbolicLink
        }
      })
    )
  }

  async rm(path: string, options?: Parameters<IFileSystem['rm']>[1]): Promise<void> {
    await this.inner.rm(path, options)
  }

  async cp(src: string, dest: string, options?: Parameters<IFileSystem['cp']>[2]): Promise<void> {
    await this.inner.cp(src, dest, options)
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.inner.mv(src, dest)
  }

  resolvePath(base: string, path: string): string {
    return this.inner.resolvePath(base, path)
  }

  getAllPaths(): string[] {
    return this.inner.getAllPaths()
  }

  async chmod(path: string, mode: number): Promise<void> {
    await this.inner.chmod(path, mode)
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.inner.symlink(target, linkPath)
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    await this.inner.link(existingPath, newPath)
  }

  async readlink(path: string): Promise<string> {
    return this.inner.readlink(path)
  }

  async realpath(path: string): Promise<string> {
    return this.inner.realpath(path)
  }

  async utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    await this.inner.utimes(path, atime, mtime)
  }
}

export class TrackedFileSystem extends DelegatingFileSystem {
  constructor(
    inner: IFileSystem,
    private readonly onFilesChange?: (changes: FileChange) => void
  ) {
    super(inner)
  }

  private emit(changes: FileChange): void {
    if (changes.length > 0) {
      this.onFilesChange?.(changes)
    }
  }

  private async track(roots: string[], action: () => Promise<void>): Promise<void> {
    const before = await snapshotFiles(this.inner, roots)
    await action()
    if (!this.onFilesChange) return

    const after = await snapshotFiles(this.inner, roots)
    const changes = diffSnapshots(before, after)
    if (changes.length > 0) {
      this.onFilesChange(changes)
    }
  }

  override async writeFile(path: string, content: Parameters<IFileSystem['writeFile']>[1], options?: Parameters<IFileSystem['writeFile']>[2]): Promise<void> {
    await super.writeFile(path, content, options)
    const text = typeof content === 'string'
      ? content
      : await this.inner.readFile(path, 'utf8')
    this.emit([{ path: toDisplayPath(path), content: text }])
  }

  override async appendFile(path: string, content: Parameters<IFileSystem['appendFile']>[1], options?: Parameters<IFileSystem['appendFile']>[2]): Promise<void> {
    await super.appendFile(path, content, options)
    const text = await this.inner.readFile(path, 'utf8')
    this.emit([{ path: toDisplayPath(path), content: text }])
  }

  override async rm(path: string, options?: Parameters<IFileSystem['rm']>[1]): Promise<void> {
    await this.track([path], async () => {
      await super.rm(path, options)
    })
  }

  override async cp(src: string, dest: string, options?: Parameters<IFileSystem['cp']>[2]): Promise<void> {
    await this.track([src, dest], async () => {
      await super.cp(src, dest, options)
    })
  }

  override async mv(src: string, dest: string): Promise<void> {
    await this.track([src, dest], async () => {
      await super.mv(src, dest)
    })
  }

  override async symlink(target: string, linkPath: string): Promise<void> {
    await this.track([linkPath], async () => {
      await super.symlink(target, linkPath)
    })
  }

  override async link(existingPath: string, newPath: string): Promise<void> {
    await this.track([existingPath, newPath], async () => {
      await super.link(existingPath, newPath)
    })
  }
}

export class ToolFileSystem {
  private readonly workingDirectory: string
  readonly rawFs: IFileSystem

  constructor(
    fs: IFileSystem,
    workingDirectory: string = '/',
    onFilesChange?: (changes: FileChange) => void
  ) {
    this.rawFs = new TrackedFileSystem(fs, onFilesChange)
    this.workingDirectory = workingDirectory
  }

  get cwd(): string {
    return this.workingDirectory
  }

  protected resolvePath(path: string): string {
    if (!path || path === '.' || path === './') {
      return this.workingDirectory
    }

    return this.rawFs.resolvePath(this.workingDirectory, path)
  }

  async read(path: string, offset?: number, limit?: number): Promise<string> {
    const content = await this.rawFs.readFile(this.resolvePath(path), 'utf8')
    return formatReadOutput(content, offset, limit)
  }

  /**
   * Raw file content, unformatted. `read()` returns TOOL-formatted output
   * (line numbers, 2000-line/2000-char truncation) for the model; host apps
   * that round-trip content (editors, exporters) must use this instead.
   */
  async readFile(path: string): Promise<string> {
    return this.rawFs.readFile(this.resolvePath(path), 'utf8')
  }

  async write(path: string, content: string): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    await this.rawFs.writeFile(resolvedPath, content, 'utf8')
  }

  /**
   * Write raw bytes (e.g. a generated image) to `path`, stored as binary rather
   * than utf8-encoded text. Parent directories are created as needed. Note: when
   * onFilesChange is wired, the change callback receives a lossy utf8 view of
   * binary content (see TrackedFileSystem) — consumers that care about the bytes
   * should read them back through the filesystem.
   */
  async writeBytes(path: string, content: Uint8Array): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    const slash = resolvedPath.lastIndexOf('/')
    if (slash > 0) {
      try {
        await this.rawFs.mkdir(resolvedPath.slice(0, slash), { recursive: true })
      } catch {
        // Directory may already exist, or the backend may auto-create it.
      }
    }
    await this.rawFs.writeFile(resolvedPath, content)
  }

  async edit(path: string, oldText: string, newText: string, replaceAll: boolean = false): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    const content = await this.rawFs.readFile(resolvedPath, 'utf8')

    if (!content.includes(oldText)) {
      throw new Error(`Text not found in file: ${oldText}`)
    }

    const updatedContent = replaceAll
      ? content.replaceAll(oldText, newText)
      : content.replace(oldText, newText)

    await this.rawFs.writeFile(resolvedPath, updatedContent, 'utf8')
  }

  async multiEdit(path: string, edits: EditOperation[]): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    const content = await this.rawFs.readFile(resolvedPath, 'utf8')

    let currentContent = content
    for (let i = 0; i < edits.length; i++) {
      const { old_string, new_string, replace_all = false } = edits[i]

      if (!currentContent.includes(old_string)) {
        throw new Error(`Edit ${i + 1}: Text not found in file: ${old_string}`)
      }

      currentContent = replace_all
        ? currentContent.replaceAll(old_string, new_string)
        : currentContent.replace(old_string, new_string)
    }

    await this.rawFs.writeFile(resolvedPath, currentContent, 'utf8')
  }

  async list(): Promise<string[]> {
    // Same readiness forcing as snapshotFiles: getAllPaths() is synchronous
    // and can't await an async-init backend's ready gate, so a cold cache
    // would report an empty filesystem to LS/Glob/Grep. exists('/') is gated.
    await this.rawFs.exists('/')
    const allPaths = this.rawFs.getAllPaths()
    const files: string[] = []

    for (const path of allPaths) {
      if (!path || path === '/') continue

      try {
        const stats = await this.rawFs.stat(path)
        if (stats.isFile) {
          files.push(toDisplayPath(path))
        }
      } catch {
        // Ignore unreadable paths.
      }
    }

    return files
  }

  async glob(pattern: string, path?: string): Promise<string[]> {
    let allFiles = await this.list()

    if (path) {
      const normalizedPath = toDisplayPath(this.resolvePath(path)).replace(/\/+$/, '')
      if (normalizedPath) {
        allFiles = allFiles.filter(file => file.startsWith(`${normalizedPath}/`) || file === normalizedPath)
      }
    }

    if (pattern === '**/*' || pattern === '**' || pattern === '*') {
      return allFiles
    }

    const regex = globToRegex(pattern)
    return allFiles.filter(file => regex.test(file))
  }

  async grep(
    pattern: string,
    filePattern?: string,
    caseSensitive: boolean = true
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const filesToSearch = filePattern ? await this.glob(filePattern) : await this.list()
    const results: Array<{ file: string; line: number; content: string }> = []
    const flags = caseSensitive ? 'g' : 'gi'

    for (const file of filesToSearch) {
      const content = await this.rawFs.readFile(this.resolvePath(file), 'utf8')
      const lines = content.split('\n')

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index]
        const regex = new RegExp(pattern, flags)
        if (regex.test(line)) {
          results.push({
            file,
            line: index + 1,
            content: line
          })
        }
      }
    }

    return results
  }

  async exists(path: string): Promise<boolean> {
    return this.rawFs.exists(this.resolvePath(path))
  }

  async delete(path: string): Promise<void> {
    const resolvedPath = this.resolvePath(path)
    await this.rawFs.rm(resolvedPath, { recursive: true, force: false })
  }

  async ls(path: string, ignore?: string[]): Promise<LsEntry[]> {
    const resolvedPath = this.resolvePath(path)
    const entries = this.rawFs.readdirWithFileTypes
      ? await this.rawFs.readdirWithFileTypes(resolvedPath)
      : await this.readDirEntries(resolvedPath)

    return entries
      .filter(entry => !shouldIgnore(entry.name, ignore))
      .map(entry => {
        const fullPath = this.rawFs.resolvePath(resolvedPath, entry.name)
        return {
          name: entry.name,
          type: entry.isDirectory ? 'directory' : 'file',
          path: toDisplayPath(fullPath)
        }
      })
  }

  private async readDirEntries(path: string): Promise<FileTypeEntry[]> {
    const entries = await this.rawFs.readdir(path)

    return Promise.all(
      entries.map(async entry => {
        const fullPath = this.rawFs.resolvePath(path, entry)
        const stats = await this.rawFs.stat(fullPath)
        return {
          name: entry,
          isFile: stats.isFile,
          isDirectory: stats.isDirectory,
          isSymbolicLink: stats.isSymbolicLink
        }
      })
    )
  }
}

import type { IFileSystem, InitialFile } from '@nanocodana/core'

type BufferEncoding = 'utf8' | 'utf-8' | 'ascii' | 'binary' | 'base64' | 'hex' | 'latin1'
type FileContent = string | Uint8Array
type ReadFileOptions = { encoding?: BufferEncoding | null }
type WriteFileOptions = { encoding?: BufferEncoding }
type MkdirOptions = { recursive?: boolean }
type RmOptions = { recursive?: boolean; force?: boolean }
type CpOptions = { recursive?: boolean }
type FsStat = {
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
  mode: number
  size: number
  mtime: Date
}
type DirentEntry = {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

type StoredFileEntry = {
  path: string
  type: 'file'
  content: string | Uint8Array
  mode: number
  mtime: number
}

type StoredDirectoryEntry = {
  path: string
  type: 'directory'
  mode: number
  mtime: number
}

type StoredSymlinkEntry = {
  path: string
  type: 'symlink'
  target: string
  mode: number
  mtime: number
}

type StoredEntry = StoredFileEntry | StoredDirectoryEntry | StoredSymlinkEntry
type LegacyStoredEntry = { path: string; content?: string }

const STORE_NAME = 'files'
const DEFAULT_DIR_MODE = 0o755
const DEFAULT_FILE_MODE = 0o644
const DEFAULT_SYMLINK_MODE = 0o777
const MAX_SYMLINK_DEPTH = 40

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function normalizePath(path: string): string {
  const segments = (path || '/').split('/')
  const normalized: string[] = []

  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }

  return `/${normalized.join('/')}`.replace(/\/+$/, '') || '/'
}

function dirname(path: string): string {
  const normalizedPath = normalizePath(path)
  if (normalizedPath === '/') return '/'

  const lastSlash = normalizedPath.lastIndexOf('/')
  return lastSlash <= 0 ? '/' : normalizedPath.slice(0, lastSlash)
}

function joinPath(parent: string, child: string): string {
  return normalizePath(parent === '/' ? `/${child}` : `${parent}/${child}`)
}

function resolvePath(base: string, path: string): string {
  if (path.startsWith('/')) {
    return normalizePath(path)
  }

  return normalizePath(base === '/' ? `/${path}` : `${base}/${path}`)
}

function resolveSymlinkTarget(symlinkPath: string, target: string): string {
  if (target.startsWith('/')) {
    return normalizePath(target)
  }

  return resolvePath(dirname(symlinkPath), target)
}

function toDisplayPath(path: string): string {
  return path.replace(/^\/+/, '')
}

function cloneContent(content: string | Uint8Array): string | Uint8Array {
  return typeof content === 'string' ? content : new Uint8Array(content)
}

function getEncoding(
  options?: ReadFileOptions | WriteFileOptions | BufferEncoding | null
): BufferEncoding {
  if (!options) return 'utf8'
  if (typeof options === 'string') return options
  return options.encoding ?? 'utf8'
}

function bytesToString(bytes: Uint8Array, encoding: BufferEncoding): string {
  switch (encoding) {
    case 'base64': {
      let binary = ''
      for (const byte of bytes) {
        binary += String.fromCharCode(byte)
      }
      return btoa(binary)
    }
    case 'hex':
      return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
    case 'binary':
    case 'latin1':
    case 'ascii':
      return Array.from(bytes).map(byte => String.fromCharCode(byte)).join('')
    case 'utf-8':
    case 'utf8':
    default:
      return textDecoder.decode(bytes)
  }
}

function stringToBytes(value: string, encoding: BufferEncoding): Uint8Array {
  switch (encoding) {
    case 'base64': {
      const binary = atob(value)
      return Uint8Array.from(binary, char => char.charCodeAt(0))
    }
    case 'hex': {
      const bytes = new Uint8Array(value.length / 2)
      for (let i = 0; i < value.length; i += 2) {
        bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16)
      }
      return bytes
    }
    case 'binary':
    case 'latin1':
    case 'ascii':
      return Uint8Array.from(value, char => char.charCodeAt(0))
    case 'utf-8':
    case 'utf8':
    default:
      return textEncoder.encode(value)
  }
}

function contentToBytes(content: FileContent, encoding: BufferEncoding): Uint8Array {
  if (content instanceof Uint8Array) {
    return new Uint8Array(content)
  }

  return stringToBytes(content, encoding)
}

function contentSize(content: string | Uint8Array): number {
  return typeof content === 'string' ? textEncoder.encode(content).length : content.length
}

function toFsStat(entry: StoredEntry): FsStat {
  return {
    isFile: entry.type === 'file',
    isDirectory: entry.type === 'directory',
    isSymbolicLink: entry.type === 'symlink',
    mode: entry.mode,
    size: entry.type === 'file'
      ? contentSize(entry.content)
      : entry.type === 'symlink'
        ? entry.target.length
        : 0,
    mtime: new Date(entry.mtime),
  }
}

function normalizeStoredEntry(rawEntry: LegacyStoredEntry | StoredEntry): StoredEntry {
  const path = normalizePath(rawEntry.path)
  const mtimeValue = (rawEntry as { mtime?: unknown }).mtime
  const mtime = typeof mtimeValue === 'number'
    ? mtimeValue
    : mtimeValue instanceof Date
      ? mtimeValue.getTime()
      : Date.now()

  if ('type' in rawEntry) {
    if (rawEntry.type === 'file') {
      return {
        path,
        type: 'file',
        content: cloneContent(rawEntry.content),
        mode: rawEntry.mode ?? DEFAULT_FILE_MODE,
        mtime,
      }
    }

    if (rawEntry.type === 'directory') {
      return {
        path,
        type: 'directory',
        mode: rawEntry.mode ?? DEFAULT_DIR_MODE,
        mtime,
      }
    }

    return {
      path,
      type: 'symlink',
      target: rawEntry.target,
      mode: rawEntry.mode ?? DEFAULT_SYMLINK_MODE,
      mtime,
    }
  }

  return {
    path,
    type: 'file',
    content: rawEntry.content ?? '',
    mode: DEFAULT_FILE_MODE,
    mtime,
  }
}

/**
 * IndexedDB-backed virtual filesystem for browser persistence.
 */
export class IndexedDBFileSystem implements IFileSystem {
  private readonly dbName: string
  private readonly dbPromise: Promise<IDBDatabase>
  private readonly readyPromise: Promise<void>
  private readonly entryCache = new Map<string, StoredEntry>()

  constructor(
    dbName: string = 'nanocodana-fs',
    options?: { initialFiles?: ReadonlyArray<InitialFile> }
  ) {
    this.dbName = dbName
    this.entryCache.set('/', {
      path: '/',
      type: 'directory',
      mode: DEFAULT_DIR_MODE,
      mtime: Date.now(),
    })

    this.dbPromise = this.initDB()
    // Seeding runs inside the ready gate: every public operation awaits
    // ensureReady(), so callers can construct-and-use immediately without
    // racing the initial writes (files land only if the store is empty).
    // Seed failures are caught and logged — a failed seed must never poison
    // readyPromise, or every subsequent operation would reject forever.
    const initialFiles = options?.initialFiles
    this.readyPromise = initialFiles?.length
      ? this.loadCache().then(() =>
          this.seedIfEmpty(initialFiles).catch((err) =>
            console.error('Error writing initial files:', err)
          )
        )
      : this.loadCache()
  }

  /** Seed initialFiles into a brand-new store, inside the ready gate.
   *  Deliberately avoids ensureReady() — it IS part of the ready chain.
   *  "Empty" counts only FILE entries, so an interrupted earlier seed that
   *  left stray directory rows doesn't block reseeding. Lazy providers are
   *  resolved first (see below); then all entries are persisted in ONE
   *  IndexedDB transaction, so the durable store is seeded atomically. If a
   *  provider rejects, nothing is written (the cache stays empty too); if only
   *  the transaction fails, the in-memory cache is still populated so the
   *  session works without persistence. */
  private async seedIfEmpty(files: ReadonlyArray<InitialFile>): Promise<void> {
    const hasFiles = Array.from(this.entryCache.values()).some((e) => e.type === 'file')
    if (hasFiles) return

    // Resolve every lazy provider up front, in parallel, BEFORE touching the
    // cache or the store. IndexedDB is the durable copy, so a provider runs
    // once and its content persists. Resolving first is what keeps the seed
    // atomic for the in-memory cache too: if any provider rejects, this throws
    // before a single entryCache write, so the FS stays consistently empty
    // rather than half-populated. (Parallel, not a serial await-in-loop, so N
    // remote reads don't serialize.)
    const resolved = await Promise.all(
      files.map(async ({ path, content }) => ({
        path,
        content: typeof content === 'function' ? await content() : content,
      })),
    )

    const entries: StoredEntry[] = []
    for (const { path, content } of resolved) {
      const normalizedPath = normalizePath(path)
      // Collect missing parent directories (mirrors ensureParentDirectories,
      // but into the batch instead of one write per entry).
      const dirsToCreate: string[] = []
      let currentPath = dirname(normalizedPath)
      while (currentPath !== '/' && !this.entryCache.has(currentPath)) {
        dirsToCreate.push(currentPath)
        currentPath = dirname(currentPath)
      }
      for (const directoryPath of dirsToCreate.reverse()) {
        const directoryEntry: StoredDirectoryEntry = {
          path: directoryPath,
          type: 'directory',
          mode: DEFAULT_DIR_MODE,
          mtime: Date.now(),
        }
        this.entryCache.set(directoryPath, directoryEntry)
        entries.push(directoryEntry)
      }
      const entry: StoredFileEntry = {
        path: normalizedPath,
        type: 'file',
        content,
        mode: DEFAULT_FILE_MODE,
        mtime: Date.now(),
      }
      this.entryCache.set(normalizedPath, entry)
      entries.push(entry)
    }

    if (entries.length === 0) return
    const db = await this.dbPromise
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      for (const entry of entries) store.put(entry)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('seed transaction aborted'))
    })
  }

  private async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'path' })
        }
      }
    })
  }

  private async ensureReady(): Promise<void> {
    await this.readyPromise
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    handler: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
  ): Promise<T> {
    const db = await this.dbPromise

    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], mode)
      const store = transaction.objectStore(STORE_NAME)
      handler(store, resolve, reject)
    })
  }

  private async loadCache(): Promise<void> {
    const entries = await this.withStore<Array<LegacyStoredEntry | StoredEntry>>('readonly', (store, resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as Array<LegacyStoredEntry | StoredEntry>)
    })

    for (const entry of entries) {
      const normalizedEntry = normalizeStoredEntry(entry)
      this.entryCache.set(normalizedEntry.path, normalizedEntry)
      const entryMtime = (entry as { mtime?: unknown }).mtime

      const entryNeedsMigration =
        entry.path !== normalizedEntry.path ||
        !('type' in entry) ||
        entryMtime instanceof Date

      if (entryNeedsMigration) {
        await this.persistEntry(normalizedEntry)
        if (entry.path !== normalizedEntry.path) {
          await this.deleteStoreKey(entry.path)
        }
      }
    }
  }

  private async persistEntry(entry: StoredEntry): Promise<void> {
    await this.withStore<void>('readwrite', (store, resolve, reject) => {
      const request = store.put(entry)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  private async deleteStoreKey(key: string): Promise<void> {
    if (key === '/' || !key) return
    await this.withStore<void>('readwrite', (store, resolve, reject) => {
      const request = store.delete(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  private async deleteStoredEntry(path: string): Promise<void> {
    await this.deleteStoreKey(normalizePath(path))
  }

  private getEntry(path: string): StoredEntry | undefined {
    return this.entryCache.get(normalizePath(path))
  }

  private requireEntry(path: string): StoredEntry {
    const entry = this.getEntry(path)
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
    }
    return entry
  }

  private async ensureParentDirectories(path: string): Promise<void> {
    const directoriesToCreate: string[] = []
    let currentPath = dirname(path)

    while (currentPath !== '/' && !this.entryCache.has(currentPath)) {
      directoriesToCreate.push(currentPath)
      currentPath = dirname(currentPath)
    }

    for (const directoryPath of directoriesToCreate.reverse()) {
      const directoryEntry: StoredDirectoryEntry = {
        path: directoryPath,
        type: 'directory',
        mode: DEFAULT_DIR_MODE,
        mtime: Date.now(),
      }
      this.entryCache.set(directoryPath, directoryEntry)
      await this.persistEntry(directoryEntry)
    }
  }

  private async resolvePathWithSymlinks(path: string): Promise<string> {
    const normalizedPath = normalizePath(path)
    if (normalizedPath === '/') return '/'

    const parts = normalizedPath.slice(1).split('/')
    let currentPath = ''
    const visited = new Set<string>()

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`
      let entry = this.entryCache.get(currentPath)
      let depth = 0

      while (entry?.type === 'symlink' && depth < MAX_SYMLINK_DEPTH) {
        if (visited.has(currentPath)) {
          throw new Error(`ELOOP: too many levels of symbolic links, open '${path}'`)
        }

        visited.add(currentPath)
        currentPath = resolveSymlinkTarget(currentPath, entry.target)
        entry = this.entryCache.get(currentPath)
        depth++
      }

      if (depth >= MAX_SYMLINK_DEPTH) {
        throw new Error(`ELOOP: too many levels of symbolic links, open '${path}'`)
      }
    }

    return currentPath || '/'
  }

  private async resolveIntermediateSymlinks(path: string): Promise<string> {
    const normalizedPath = normalizePath(path)
    if (normalizedPath === '/') return '/'

    const parts = normalizedPath.slice(1).split('/')
    if (parts.length <= 1) return normalizedPath

    let currentPath = ''
    const visited = new Set<string>()

    for (let index = 0; index < parts.length - 1; index++) {
      currentPath = currentPath ? `${currentPath}/${parts[index]}` : `/${parts[index]}`
      let entry = this.entryCache.get(currentPath)
      let depth = 0

      while (entry?.type === 'symlink' && depth < MAX_SYMLINK_DEPTH) {
        if (visited.has(currentPath)) {
          throw new Error(`ELOOP: too many levels of symbolic links, lstat '${path}'`)
        }

        visited.add(currentPath)
        currentPath = resolveSymlinkTarget(currentPath, entry.target)
        entry = this.entryCache.get(currentPath)
        depth++
      }

      if (depth >= MAX_SYMLINK_DEPTH) {
        throw new Error(`ELOOP: too many levels of symbolic links, lstat '${path}'`)
      }
    }

    return currentPath === '/' ? normalizedPath : `${currentPath}/${parts[parts.length - 1]}`
  }

  private directChildren(path: string): DirentEntry[] {
    const normalizedPath = normalizePath(path)
    const prefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`
    const children = new Map<string, DirentEntry>()

    for (const entryPath of this.entryCache.keys()) {
      if (entryPath === '/' || entryPath === normalizedPath || !entryPath.startsWith(prefix)) {
        continue
      }

      const relativePath = entryPath.slice(prefix.length)
      if (!relativePath) continue

      const [name, ...rest] = relativePath.split('/')
      if (!name || children.has(name)) continue

      if (rest.length > 0) {
        children.set(name, {
          name,
          isFile: false,
          isDirectory: true,
          isSymbolicLink: false,
        })
        continue
      }

      const entry = this.entryCache.get(entryPath)
      if (!entry) continue

      children.set(name, {
        name,
        isFile: entry.type === 'file',
        isDirectory: entry.type === 'directory',
        isSymbolicLink: entry.type === 'symlink',
      })
    }

    return Array.from(children.values()).sort((left, right) => left.name.localeCompare(right.name))
  }

  async readFile(path: string, options?: ReadFileOptions | BufferEncoding): Promise<string> {
    await this.ensureReady()
    const resolvedPath = await this.resolvePathWithSymlinks(path)
    const entry = this.requireEntry(resolvedPath)

    if (entry.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`)
    }

    if (typeof entry.content === 'string') {
      const encoding = getEncoding(options)
      if (encoding === 'utf8' || encoding === 'utf-8') {
        return entry.content
      }

      return bytesToString(textEncoder.encode(entry.content), encoding)
    }

    return bytesToString(entry.content, getEncoding(options))
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    await this.ensureReady()
    const resolvedPath = await this.resolvePathWithSymlinks(path)
    const entry = this.requireEntry(resolvedPath)

    if (entry.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`)
    }

    return typeof entry.content === 'string'
      ? textEncoder.encode(entry.content)
      : new Uint8Array(entry.content)
  }

  async writeFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    await this.ensureReady()
    const normalizedPath = normalizePath(path)
    const existingEntry = this.getEntry(normalizedPath)

    if (existingEntry?.type === 'directory') {
      throw new Error(`EISDIR: illegal operation on a directory, write '${path}'`)
    }

    await this.ensureParentDirectories(normalizedPath)

    const encoding = getEncoding(options)
    const storedContent =
      typeof content === 'string' && (encoding === 'utf8' || encoding === 'utf-8')
        ? content
        : cloneContent(contentToBytes(content, encoding))

    const entry: StoredFileEntry = {
      path: normalizedPath,
      type: 'file',
      content: storedContent,
      mode: existingEntry?.type === 'file' ? existingEntry.mode : DEFAULT_FILE_MODE,
      mtime: Date.now(),
    }

    this.entryCache.set(normalizedPath, entry)
    await this.persistEntry(entry)
  }

  async appendFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    await this.ensureReady()
    const normalizedPath = normalizePath(path)
    const existingEntry = this.getEntry(normalizedPath)

    if (existingEntry?.type === 'directory') {
      throw new Error(`EISDIR: illegal operation on a directory, write '${path}'`)
    }

    const encoding = getEncoding(options)

    if (!existingEntry) {
      await this.writeFile(normalizedPath, content, options)
      return
    }

    if (existingEntry.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, write '${path}'`)
    }

    let updatedContent: string | Uint8Array

    if (typeof existingEntry.content === 'string' && typeof content === 'string' && (encoding === 'utf8' || encoding === 'utf-8')) {
      updatedContent = existingEntry.content + content
    } else {
      const existingBytes = typeof existingEntry.content === 'string'
        ? textEncoder.encode(existingEntry.content)
        : existingEntry.content
      const contentBytes = contentToBytes(content, encoding)
      updatedContent = new Uint8Array(existingBytes.length + contentBytes.length)
      updatedContent.set(existingBytes)
      updatedContent.set(contentBytes, existingBytes.length)
    }

    const entry: StoredFileEntry = {
      path: normalizedPath,
      type: 'file',
      content: updatedContent,
      mode: existingEntry.mode,
      mtime: Date.now(),
    }

    this.entryCache.set(normalizedPath, entry)
    await this.persistEntry(entry)
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureReady()

    try {
      const resolvedPath = await this.resolvePathWithSymlinks(path)
      return this.entryCache.has(resolvedPath)
    } catch {
      return false
    }
  }

  async stat(path: string): Promise<FsStat> {
    await this.ensureReady()
    const resolvedPath = await this.resolvePathWithSymlinks(path)
    return toFsStat(this.requireEntry(resolvedPath))
  }

  async lstat(path: string): Promise<FsStat> {
    await this.ensureReady()
    const resolvedPath = await this.resolveIntermediateSymlinks(path)
    return toFsStat(this.requireEntry(resolvedPath))
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    await this.ensureReady()
    const normalizedPath = normalizePath(path)

    if (normalizedPath === '/') return

    const existingEntry = this.getEntry(normalizedPath)
    if (existingEntry) {
      if (existingEntry.type === 'directory' && options?.recursive) {
        return
      }

      throw new Error(`EEXIST: file already exists, mkdir '${path}'`)
    }

    const parentPath = dirname(normalizedPath)
    const parentEntry = this.getEntry(parentPath)

    if (!parentEntry) {
      if (!options?.recursive) {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`)
      }
      await this.ensureParentDirectories(normalizedPath)
    } else if (parentEntry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, mkdir '${path}'`)
    }

    const entry: StoredDirectoryEntry = {
      path: normalizedPath,
      type: 'directory',
      mode: DEFAULT_DIR_MODE,
      mtime: Date.now(),
    }

    this.entryCache.set(normalizedPath, entry)
    await this.persistEntry(entry)
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await this.readdirWithFileTypes(path)
    return entries.map(entry => entry.name)
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    await this.ensureReady()
    const resolvedPath = await this.resolvePathWithSymlinks(path)
    const entry = this.requireEntry(resolvedPath)

    if (entry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`)
    }

    return this.directChildren(resolvedPath)
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    await this.ensureReady()
    const normalizedPath = normalizePath(path)
    const entry = this.getEntry(normalizedPath)

    if (!entry) {
      if (options?.force) return
      throw new Error(`ENOENT: no such file or directory, rm '${path}'`)
    }

    if (normalizedPath === '/') {
      if (!options?.recursive) {
        throw new Error(`ENOTEMPTY: directory not empty, rm '${path}'`)
      }
      await this.clear()
      return
    }

    if (entry.type === 'directory') {
      const children = this.directChildren(normalizedPath)
      if (children.length > 0 && !options?.recursive) {
        throw new Error(`ENOTEMPTY: directory not empty, rm '${path}'`)
      }

      for (const child of children) {
        await this.rm(joinPath(normalizedPath, child.name), options)
      }
    }

    this.entryCache.delete(normalizedPath)
    await this.deleteStoredEntry(normalizedPath)
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    await this.ensureReady()
    const normalizedSrc = normalizePath(src)
    const normalizedDest = normalizePath(dest)
    const entry = this.getEntry(normalizedSrc)

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, cp '${src}'`)
    }

    if (entry.type === 'directory') {
      if (!options?.recursive) {
        throw new Error(`EISDIR: is a directory, cp '${src}'`)
      }

      await this.mkdir(normalizedDest, { recursive: true })
      const children = this.directChildren(normalizedSrc)
      for (const child of children) {
        await this.cp(joinPath(normalizedSrc, child.name), joinPath(normalizedDest, child.name), options)
      }
      return
    }

    await this.ensureParentDirectories(normalizedDest)

    if (entry.type === 'file') {
      const copy: StoredFileEntry = {
        path: normalizedDest,
        type: 'file',
        content: cloneContent(entry.content),
        mode: entry.mode,
        mtime: entry.mtime,
      }
      this.entryCache.set(normalizedDest, copy)
      await this.persistEntry(copy)
      return
    }

    const copy: StoredSymlinkEntry = {
      path: normalizedDest,
      type: 'symlink',
      target: entry.target,
      mode: entry.mode,
      mtime: entry.mtime,
    }
    this.entryCache.set(normalizedDest, copy)
    await this.persistEntry(copy)
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.cp(src, dest, { recursive: true })
    await this.rm(src, { recursive: true })
  }

  resolvePath(base: string, path: string): string {
    return resolvePath(base, path)
  }

  getAllPaths(): string[] {
    return Array.from(this.entryCache.keys())
  }

  async chmod(path: string, mode: number): Promise<void> {
    await this.ensureReady()
    const normalizedPath = normalizePath(path)
    const entry = this.getEntry(normalizedPath)

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, chmod '${path}'`)
    }

    const updatedEntry: StoredEntry = {
      ...entry,
      mode,
    }

    this.entryCache.set(normalizedPath, updatedEntry)
    await this.persistEntry(updatedEntry)
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.ensureReady()
    const normalizedLinkPath = normalizePath(linkPath)

    if (this.entryCache.has(normalizedLinkPath)) {
      throw new Error(`EEXIST: file already exists, symlink '${linkPath}'`)
    }

    await this.ensureParentDirectories(normalizedLinkPath)

    const entry: StoredSymlinkEntry = {
      path: normalizedLinkPath,
      type: 'symlink',
      target,
      mode: DEFAULT_SYMLINK_MODE,
      mtime: Date.now(),
    }

    this.entryCache.set(normalizedLinkPath, entry)
    await this.persistEntry(entry)
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    await this.ensureReady()
    const normalizedExistingPath = normalizePath(existingPath)
    const normalizedNewPath = normalizePath(newPath)

    const existingEntry = this.getEntry(normalizedExistingPath)
    if (!existingEntry) {
      throw new Error(`ENOENT: no such file or directory, link '${existingPath}'`)
    }

    if (existingEntry.type !== 'file') {
      throw new Error(`EPERM: operation not permitted, link '${existingPath}'`)
    }

    if (this.entryCache.has(normalizedNewPath)) {
      throw new Error(`EEXIST: file already exists, link '${newPath}'`)
    }

    await this.ensureParentDirectories(normalizedNewPath)

    const entry: StoredFileEntry = {
      path: normalizedNewPath,
      type: 'file',
      content: cloneContent(existingEntry.content),
      mode: existingEntry.mode,
      mtime: existingEntry.mtime,
    }

    this.entryCache.set(normalizedNewPath, entry)
    await this.persistEntry(entry)
  }

  async readlink(path: string): Promise<string> {
    await this.ensureReady()
    const resolvedPath = await this.resolveIntermediateSymlinks(path)
    const entry = this.requireEntry(resolvedPath)

    if (entry.type !== 'symlink') {
      throw new Error(`EINVAL: invalid argument, readlink '${path}'`)
    }

    return entry.target
  }

  async realpath(path: string): Promise<string> {
    await this.ensureReady()
    const resolvedPath = await this.resolvePathWithSymlinks(path)
    this.requireEntry(resolvedPath)
    return resolvedPath
  }

  async utimes(path: string, _atime: Date, mtime: Date): Promise<void> {
    await this.ensureReady()
    const resolvedPath = await this.resolvePathWithSymlinks(path)
    const entry = this.requireEntry(resolvedPath)

    const updatedEntry: StoredEntry = {
      ...entry,
      mtime: mtime.getTime(),
    }

    this.entryCache.set(resolvedPath, updatedEntry)
    await this.persistEntry(updatedEntry)
  }

  async list(): Promise<string[]> {
    await this.ensureReady()
    return Array.from(this.entryCache.keys())
      .filter(path => path !== '/')
      .map(toDisplayPath)
      .sort((left, right) => left.localeCompare(right))
  }

  async clear(): Promise<void> {
    await this.ensureReady()
    this.entryCache.clear()
    this.entryCache.set('/', {
      path: '/',
      type: 'directory',
      mode: DEFAULT_DIR_MODE,
      mtime: Date.now(),
    })

    await this.withStore<void>('readwrite', (store, resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

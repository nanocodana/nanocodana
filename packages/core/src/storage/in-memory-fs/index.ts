// Re-exports for the local InMemoryFs adaptation. See in-memory-fs.ts
// header for source/license attribution.
export { InMemoryFs } from './in-memory-fs.js'
export type {
  IFileSystem,
  BufferEncoding,
  FileContent,
  FileEntry,
  DirectoryEntry,
  DirentEntry,
  FsEntry,
  FsStat,
  InitialFiles,
  MkdirOptions,
  ReadFileOptions,
  WriteFileOptions,
  RmOptions,
  CpOptions,
} from './interface.js'

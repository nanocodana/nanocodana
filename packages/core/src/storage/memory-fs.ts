// `InMemoryFs` is now sourced from our local copy (see in-memory-fs/) instead
// of `just-bash/browser`. The just-bash browser bundle is monolithic (~313 KB
// gzipped) and gets pulled into the main chunk regardless of tree-shaking, so
// importing only `InMemoryFs` from it costs us the whole bundle. The local
// copy is ~5-10 KB gzipped — see in-memory-fs/in-memory-fs.ts header for
// source/license attribution.
import { InMemoryFs } from './in-memory-fs/index.js'
import { ToolFileSystem, type FileChange } from './tool-fs.js'
import type { InitialFile } from '../types.js'

export class MemoryFileSystem extends ToolFileSystem {
  constructor(
    initialFiles?: InitialFile[],
    onFilesChange?: (changes: FileChange) => void
  ) {
    // String content seeds eagerly; a function is stored as a lazy provider
    // (InMemoryFs calls it on first read). Both flow through untouched.
    const files = Object.fromEntries(
      (initialFiles ?? []).map(({ path, content }) => [
        path.startsWith('/') ? path : `/${path}`,
        content
      ])
    )

    super(new InMemoryFs(files), '/', onFilesChange)

    // Echo eager seeds so a host can persist a scaffold it didn't load from a
    // store. Lazy entries are skipped: their content came FROM the host's store
    // (the provider reads it), so echoing it back is a pointless round-trip —
    // and the value here is the provider function, not the content.
    if (initialFiles && initialFiles.length > 0) {
      const eager = initialFiles.filter(
        (f): f is { path: string; content: string } => typeof f.content === 'string'
      )
      if (eager.length > 0) {
        onFilesChange?.(
          eager.map(({ path, content }) => ({
            path: path.replace(/^\/+/, ''),
            content
          }))
        )
      }
    }
  }
}

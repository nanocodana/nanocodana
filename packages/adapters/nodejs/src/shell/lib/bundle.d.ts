// Type declaration for the vendored shell.
//
// `dist/shell/lib/bundle.js` is generated at build time by
// build/bundle-shell.mjs (just-bash's published Node build, re-bundled with its
// pure-JS dependencies inlined). It does not exist in source, so tsc resolves
// the imports in storage/node-fs.ts and tools/bash.ts through this file. The
// build script copies this declaration next to the generated bundle.
//
// Only what this adapter actually uses is declared. Unlike core's Node-free
// build, this one keeps the real `node:fs`-backed filesystems and the full
// command set — that's the point of the Node adapter.
import type { IFileSystem } from '@nanocodana/core'

export declare class Bash {
  constructor(
    options: {
      fs: unknown
      cwd?: string
    } & Record<string, unknown>,
  )

  exec(
    command: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

/** Direct read-write access to a real directory, backed by node:fs. */
export declare class ReadWriteFs implements IFileSystem {
  constructor(options: { root: string } & Record<string, unknown>)
  readFile(path: string, options?: unknown): Promise<string>
  readFileBuffer(path: string): Promise<Uint8Array>
  writeFile(path: string, content: string | Uint8Array, options?: unknown): Promise<void>
  appendFile(path: string, content: string | Uint8Array, options?: unknown): Promise<void>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<any>
  lstat(path: string): Promise<any>
  mkdir(path: string, options?: unknown): Promise<void>
  readdir(path: string): Promise<string[]>
  rm(path: string, options?: unknown): Promise<void>
  cp(src: string, dest: string, options?: unknown): Promise<void>
  mv(src: string, dest: string): Promise<void>
  resolvePath(base: string, path: string): string
  getAllPaths(): string[]
  chmod(path: string, mode: number): Promise<void>
  symlink(target: string, linkPath: string): Promise<void>
  link(existingPath: string, newPath: string): Promise<void>
  readlink(path: string): Promise<string>
  realpath(path: string): Promise<string>
  utimes(path: string, atime: Date, mtime: Date): Promise<void>
}

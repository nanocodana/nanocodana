/**
 * Indirection so `default-tools.ts` never names the vendored shell bundle.
 *
 * WHY THIS EXISTS
 *
 * `import('./bundle.js')` is a *reachable* dynamic import, and no bundler can
 * drop one of those based on a runtime flag — `virtualBash: false` keeps a
 * code-splitting bundler from *fetching* the chunk, but the 1.2 MB is still in
 * the build. That is fine for core's own entry point, where the shell is the
 * point. It is pure dead weight for `@nanocodana/nodejs`, which replaces the
 * Bash tool with one backed by the real just-bash: without this indirection a
 * bundled Node app carries two complete shells.
 *
 * So the import lives in `register.ts`, which only `index.ts` pulls in. The
 * `no-bash` entry point re-exports the same API without it, and a bundler
 * following that entry never sees the bundle at all.
 */

/**
 * Structural rather than a type-import of the bundle: some bundlers treat even
 * a type-only import as a runtime reference, which would defeat the whole
 * arrangement.
 */
export type BashInstance = {
  exec: (
    command: string,
    options?: { signal?: AbortSignal }
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
}

export type ShellFactory = (options: Record<string, unknown>) => Promise<BashInstance>

let factory: ShellFactory | undefined

/** Called by the side-effect module `./register.js`. */
export function registerShell(create: ShellFactory): void {
  factory = create
}

/** Undefined when the consumer imported `@nanocodana/core/no-bash`. */
export function getShellFactory(): ShellFactory | undefined {
  return factory
}

// Type declaration for the vendored virtual shell.
//
// `dist/shell/bundle.js` is generated at build time by build/bundle-shell.mjs
// (just-bash's published browser artifact, re-bundled with node:zlib aliased to
// a stub). It does not exist in source, so tsc resolves the dynamic
// `import('./shell/bundle.js')` in default-tools.ts through this file instead.
// The build script copies this declaration next to the generated bundle.
//
// Only the surface core actually touches is declared. The options bag is
// deliberately open: it is forwarded straight to just-bash's `BashOptions`, and
// we don't want to vendor their type definitions just to re-state them.
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

// Default entry point: the full agent plus the vendored virtual shell.
//
// The side-effect import below is what binds the shell into the registry, and
// it is the only thing that pulls dist/shell/bundle.js (~1.2 MB) into a
// consumer's build. `@nanocodana/core/no-bash` re-exports the identical API
// without it, for adapters that supply their own Bash tool.
import './shell/register.js'

export * from './exports.js'

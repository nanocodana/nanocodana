// Same API as @nanocodana/core, minus the bundled virtual shell.
//
// Importing this instead of the default entry keeps ~1.2 MB of vendored shell
// out of the build. Use it when something else provides the Bash tool —
// @nanocodana/nodejs does, backed by the real just-bash — or when the agent
// runs with `virtualBash: false`. Calling Bash without a registered shell
// throws with an explanation rather than failing silently.
export * from './exports.js'

// Stand-in for node:zlib, aliased in at build time (see wrangler.jsonc).
//
// just-bash's browser bundle statically imports node:zlib for four shell
// commands — gzip, gunzip, zcat, and `rg -z` — even though nothing else in the
// bundle needs Node. A static import means workerd refuses to start the Worker
// at all unless `nodejs_compat` is on. Aliasing the module to this file
// satisfies the import without pulling in a Node polyfill, so the agent runs
// with zero Node compatibility surface.
//
// The trade: those four commands now fail loudly instead of working. That is the
// right trade for an agent editing source files, and a clear error beats
// silently-wrong bytes. If you need gzip in the shell, drop this alias and set
// "compatibility_flags": ["nodejs_compat"] instead.
const unsupported = (name) => () => {
  throw new Error(
    `${name} is unavailable: this Worker aliases node:zlib away to stay free of ` +
      `Node polyfills. Remove the "alias" entry in wrangler.jsonc and add ` +
      `"compatibility_flags": ["nodejs_compat"] to enable gzip/gunzip/zcat/rg -z.`,
  )
}

export const gzipSync = unsupported('gzip')
export const gunzipSync = unsupported('gunzip')

// Read at call time only, but exported with real values so module evaluation and
// any incidental property access behave predictably.
export const constants = {
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
}

export default { gzipSync, gunzipSync, constants }

/**
 * Side-effect module: binds the vendored shell into the registry.
 *
 * This is the ONLY file in core that names `./bundle.js`, so it is the only
 * thing standing between a consumer's bundle and 1.2 MB of shell. `index.ts`
 * imports it; `no-bash.ts` deliberately does not.
 */
import { registerShell, type BashInstance } from './registry.js'

registerShell(
  (options) =>
    import('./bundle.js').then(
      (mod) => new mod.Bash(options as never) as unknown as BashInstance
    )
)

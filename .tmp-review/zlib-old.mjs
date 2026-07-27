// node:zlib replacement for the vendored browser shell (see build/bundle-shell.mjs).
//
// just-bash's browser bundle statically imports node:zlib for gzip, gunzip, zcat
// and `rg -z`. A static import means runtimes without a Node polyfill layer
// refuse to load the module at all — on workerd the Worker fails to start with
// `No such module "node:zlib"`. Aliasing it here keeps the whole shell loadable
// with zero Node compatibility surface, and — unlike a throwing stub — keeps the
// four compression commands working.
//
// THE BOUNDED-INFLATION REQUIREMENT
//
// Every call site passes `{ maxOutputLength }` alongside an
// `executionScope.reserveBytes(...)` reservation. Node's zlib enforces that cap
// *during* inflation and throws before allocating past it — that is what makes a
// decompression bomb a bounded error rather than an OOM. fflate's own
// `gunzipSync` has no such option, so checking the length afterwards would mean
// the bomb is already in memory: a 40 kB payload expanding 1024x would take out
// a 128 MB isolate before the check ran.
//
// So gunzip here drives fflate's *streaming* decoder, which is synchronous, and
// counts bytes as chunks arrive. Exceeding the cap aborts mid-inflation, which is
// the guarantee the call sites are written against.
import { gzipSync as fflateGzip, Gunzip } from 'fflate'

/** Node accepts Buffer/Uint8Array; latin1 strings appear on just-bash's ByteString paths. */
function toBytes(data) {
  if (typeof data !== 'string') return data
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff
  return out
}

class RangeErrorTooLarge extends RangeError {
  constructor(limit) {
    super(`Cannot create a Buffer larger than ${limit} bytes`)
    // Node reports this code, and just-bash's catch blocks release their memory
    // lease on any throw — matching it keeps error handling identical.
    this.code = 'ERR_BUFFER_TOO_LARGE'
  }
}

export function gzipSync(data, options = {}) {
  const level = typeof options.level === 'number' && options.level >= 0 ? options.level : 6
  // Deflate output is bounded by the input, so no bomb risk: a post-check is
  // sufficient here in a way it is not for inflation.
  const out = fflateGzip(toBytes(data), { level: Math.min(level, 9) })
  const max = options.maxOutputLength
  if (max != null && out.length > max) throw new RangeErrorTooLarge(max)
  return out
}

export function gunzipSync(data, options = {}) {
  const max = options.maxOutputLength ?? Infinity
  const chunks = []
  let total = 0
  const inflate = new Gunzip((chunk) => {
    total += chunk.length
    // Thrown from inside push() below — aborts before the next chunk allocates.
    if (total > max) throw new RangeErrorTooLarge(max)
    chunks.push(chunk)
  })
  inflate.push(toBytes(data), true)
  if (chunks.length === 1) return chunks[0]
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export const constants = {
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
}

export default { gzipSync, gunzipSync, constants }

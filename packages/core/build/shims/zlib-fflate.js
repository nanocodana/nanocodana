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
// decompression bomb a bounded error rather than an OOM.
//
// fflate cannot be handed that job directly. Its `gunzipSync` has no such
// option, and its streaming `Gunzip` decides its own output granularity: push a
// whole gzip stream in one call and `ondata` fires once with the entire payload.
// Measured — a 200 kB bomb yields a single 200 MB chunk and ~300 MB of RSS
// before any callback can object. Counting bytes as they arrive is therefore
// NOT sufficient on its own; it is a post-hoc check wearing a streaming costume,
// which is exactly the failure this comment used to claim it avoided.
//
// What actually bounds it is feeding the *input* in slices, because the decoder
// cannot emit more than one slice's worth per call. DEFLATE's maximum expansion
// is ~1032:1, so a slice of `maxOutputLength / 1032` bytes can overshoot the cap
// by at most one cap's worth before the counter trips. Peak memory is then
// ~2x the cap rather than the full bomb.
import { gzipSync as fflateGzip, Gunzip } from 'fflate'

/** DEFLATE's worst-case expansion ratio (RFC 1951 stored/huffman bounds). */
const MAX_DEFLATE_RATIO = 1032

/**
 * Input slice size that keeps a single decoder callback within one cap.
 * Clamped so a tiny cap doesn't degenerate into byte-at-a-time pushes and a
 * huge one doesn't reintroduce an unbounded chunk.
 */
function inputSliceFor(maxOutputLength) {
  if (!Number.isFinite(maxOutputLength)) return 256 * 1024
  return Math.min(256 * 1024, Math.max(1024, Math.floor(maxOutputLength / MAX_DEFLATE_RATIO)))
}

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
  // A non-numeric or NaN cap must not silently mean "unbounded": `total > NaN`
  // is always false, so the entire bomb guarantee would disappear on a caller
  // bug rather than failing loudly. Infinity stays a legitimate "no limit".
  const requested = options.maxOutputLength ?? Infinity
  if (typeof requested !== 'number' || Number.isNaN(requested) || requested < 0) {
    throw new TypeError(`maxOutputLength must be a non-negative number, got ${String(requested)}`)
  }
  const max = requested
  const bytes = toBytes(data)

  // node's zlib rejects an empty payload (Z_BUF_ERROR). Returning an empty
  // buffer instead would make a truncated or zero-length archive look like a
  // valid empty file, so `gunzip`/`zcat` would report success on corrupt input.
  if (bytes.length === 0) {
    const err = new Error('unexpected end of file')
    err.code = 'Z_BUF_ERROR'
    throw err
  }
  const chunks = []
  let total = 0

  const inflate = new Gunzip((chunk) => {
    total += chunk.length
    // Thrown from inside push() below, so the next slice is never decoded.
    if (total > max) throw new RangeErrorTooLarge(max)
    chunks.push(chunk)
  })

  // Slice the input rather than pushing it whole — see the header. Without this
  // the decoder emits the entire payload in one callback and the check above
  // runs only after the bomb is already resident.
  const slice = inputSliceFor(max)
  for (let offset = 0; offset < bytes.length; offset += slice) {
    const end = Math.min(offset + slice, bytes.length)
    inflate.push(bytes.subarray(offset, end), end === bytes.length)
  }

  if (chunks.length === 1) return chunks[0]
  const out = new Uint8Array(total)
  let written = 0
  for (const chunk of chunks) {
    out.set(chunk, written)
    written += chunk.length
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

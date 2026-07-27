import { gunzipSync as oldG } from './zlib-old.mjs'
import { gunzipSync as newG, gzipSync } from '/Users/andrepimenta/Documents/coding/nanocodana/packages/core/build/shims/zlib-fflate.js'
import zlib from 'node:zlib'
function t(name, fn) {
  try { console.log(`  ${name}: OK -> ${fn()}`) }
  catch (e) { console.log(`  ${name}: THREW code=${e.code} msg=${e.message}`) }
}
const data = new TextEncoder().encode('hello\nworld\n')
const gz = gzipSync(data)
console.log('empty:')
t('old', () => `len=${oldG(new Uint8Array(0)).length}`)
t('new', () => `len=${newG(new Uint8Array(0)).length}`)
console.log('truncated trailer (-6):')
const st = new Uint8Array(gz.subarray(0, gz.length-6))
t('old', () => `len=${oldG(st).length}`)
t('new', () => `len=${newG(st).length}`)
console.log('corrupt crc:')
const c = new Uint8Array(gz); c[c.length-5] ^= 0xff
t('old', () => `len=${oldG(c).length}`)
t('new', () => `len=${newG(c).length}`)
console.log('tiny inputs 1..12 bytes of a valid gz prefix:')
for (const n of [1,2,3,4,5,10,12,18]) {
  const p = new Uint8Array(gz.subarray(0,n))
  t(`new n=${n}`, () => `len=${newG(p).length}`)
  t(`node n=${n}`, () => `len=${zlib.gunzipSync(Buffer.from(p)).length}`)
}

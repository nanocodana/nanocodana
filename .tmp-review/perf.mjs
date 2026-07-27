import { gunzipSync as oldG } from './zlib-old.mjs'
import { gunzipSync as newG } from '../packages/core/build/shims/zlib-fflate.js'
import zlib from 'node:zlib'

// 50MB of moderately compressible text
const chunk = Buffer.from('the quick brown fox jumps over the lazy dog 0123456789\n'.repeat(1000))
const parts = []
for (let i=0;i<1000;i++) parts.push(chunk)
const raw = Buffer.concat(parts)
console.log('raw MB', (raw.length/1048576).toFixed(1))
const gz = zlib.gzipSync(raw)
console.log('gz MB', (gz.length/1048576).toFixed(2))
const u = new Uint8Array(gz)
for (const [name, fn, opts] of [['old', oldG, {}], ['new(no cap)', newG, {}], ['new(cap 100MB)', newG, {maxOutputLength: 100*1024*1024}], ['node', (d,o)=>zlib.gunzipSync(Buffer.from(d), o), {}]]) {
  const t0 = Date.now()
  const r = fn(u, opts)
  console.log(`  ${name}: ${Date.now()-t0} ms, len=${r.length}, rss=${(process.memoryUsage().rss/1048576).toFixed(0)}MB`)
}

import { gunzipSync as oldG } from './zlib-old.mjs'
import { gunzipSync as newG } from '../packages/core/build/shims/zlib-fflate.js'
import zlib from 'node:zlib'
const which = process.argv[2]
const capMB = Number(process.argv[3] ?? 1)
const bombMB = Number(process.argv[4] ?? 500)
const bomb = new Uint8Array(zlib.gzipSync(Buffer.alloc(bombMB*1024*1024)))
console.log(`bomb compressed=${bomb.length} B -> ${bombMB} MB, cap=${capMB} MB, impl=${which}`)
const base = process.memoryUsage().rss
let peak = base
const iv = setInterval(()=>{ const r = process.memoryUsage().rss; if (r>peak) peak=r }, 1)
const fn = which === 'old' ? oldG : which === 'node' ? ((d,o)=>zlib.gunzipSync(Buffer.from(d), o)) : newG
try { const r = fn(bomb, { maxOutputLength: capMB*1024*1024 }); console.log('NO THROW len=', r.length) }
catch (e) { console.log('threw code=', e.code, e.message) }
clearInterval(iv)
const after = process.memoryUsage().rss
if (after > peak) peak = after
console.log(`baseline rss=${(base/1048576).toFixed(0)}MB peak=${(peak/1048576).toFixed(0)}MB delta=${((peak-base)/1048576).toFixed(0)}MB`)

// Runs runPrint against the fake server and reports exit code + stream separation.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))

const scenario = process.argv[2]
const SCRIPTS = {
  // model calls Write (gated) then answers
  denied: [{ toolCalls: [{ id: 'call_1', name: 'Write', args: { path: 'zzz-review-probe.txt', content: 'x' } }] }, { text: 'I could not write the file.' }],
  // two Write calls in one turn
  denied2: [{ toolCalls: [{ id: 'call_1', name: 'Write', args: { path: 'a.txt', content: 'x' } }, { id: 'call_2', name: 'Write', args: { path: 'b.txt', content: 'y' } }] }, { text: 'blocked twice' }],
  // model just answers
  plain: [{ text: 'hello world' }],
  // model calls a NON-gated tool then answers
  read: [{ toolCalls: [{ id: 'call_1', name: 'LS', args: { path: '.' } }] }, { text: 'listed' }],
  // model keeps asking for Write forever -> loop bound
  loop: [{ toolCalls: [{ id: 'call_x', name: 'Write', args: { path: 'a.txt', content: 'x' } }] }],
  http500: [{ http: 500 }],
  yoloBash: [{ toolCalls: [{ id: 'c1', name: 'Bash', args: { command: 'echo "console.log(6*7)" > s.js && js-exec s.js' } }] }, { text: 'done' }],
  yoloHost: [{ toolCalls: [{ id: 'c1', name: 'Bash', args: { command: 'echo hostrun', host: true } }] }, { text: 'done' }],
  mixed: [{ toolCalls: [{ id: 'c1', name: 'Write', args: { path: 'a.txt', content: 'x' } }, { id: 'c2', name: 'LS', args: { path: '.' } }, { id: 'c3', name: 'Write', args: { path: 'b.txt', content: 'y' } }] }, { text: 'mixed done' }],
  yoloNodeE: [{ toolCalls: [{ id: 'c1', name: 'Bash', args: { command: 'node -e "console.log(6*7)"' } }] }, { text: 'done' }],
  yoloEcho: [{ toolCalls: [{ id: 'c1', name: 'Bash', args: { command: 'echo hi' } }] }, { text: 'done' }],
  yoloSqlite: [{ toolCalls: [{ id: 'c1', name: 'Bash', args: { command: 'sqlite3 t.db "create table a(b); insert into a values(1); select * from a;"' } }] }, { text: 'done' }],
  yoloPy: [{ toolCalls: [{ id: 'c1', name: 'Bash', args: { command: 'python3 -c "print(6*7)"' } }] }, { text: 'done' }],
  yoloWrite: [{ toolCalls: [{ id: 'c1', name: 'Write', args: { path: 'probe.txt', content: 'written' } }] }, { text: 'done' }],
  midstream: [{ text: 'partial answer here', abort: true }],
  denyThenAbort: [{ toolCalls: [{ id: 'call_1', name: 'Write', args: { path: 'a.txt', content: 'x' } }] }, { text: 'part', abort: true }],
}
const script = JSON.stringify(SCRIPTS[scenario])
const srv = spawn(process.execPath, [join(here, 'fake-server.mjs')], { env: { ...process.env, SCRIPT: script }, stdio: ['ignore', 'inherit', 'pipe', 'ipc'] })
let port = await new Promise((r) => srv.once('message', (m) => r(m.port)))

const runner = join(here, process.env.RUNNER || 'run-print.mjs')
const t0 = Date.now()
const child = spawn(process.execPath, ['--import','tsx', runner], {
  cwd: process.env.RUN_CWD || join(here, '..', 'packages', 'cli'),
  env: { ...process.env, PRINT_BASE_URL: `http://127.0.0.1:${port}`, PRINT_JSON: process.env.PRINT_JSON ?? '', PRINT_YOLO: process.env.PRINT_YOLO ?? '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = '', err = ''
child.stdout.on('data', (d) => (out += d))
child.stderr.on('data', (d) => (err += d))
const timer = setTimeout(() => { console.log('!!! TIMEOUT after 45s — process did not exit'); child.kill('SIGKILL') }, 45000)
const code = await new Promise((r) => child.on('exit', (c, s) => r(`${c}/${s}`)))
clearTimeout(timer)
console.log(`--- scenario=${scenario} json=${process.env.PRINT_JSON||'0'} yolo=${process.env.PRINT_YOLO||'0'} exit=${code} elapsed=${Date.now()-t0}ms`)
console.log('STDOUT:\n' + out)
console.log('STDERR:\n' + err)
srv.kill('SIGTERM')

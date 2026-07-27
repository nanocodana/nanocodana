import http from 'node:http'
// Scripted OpenAI-compatible chat/completions SSE server.
// SCRIPT env var: JSON array of "turns"; each turn is {text?, toolCalls?:[{id,name,args}]}
const script = JSON.parse(process.env.SCRIPT)
let turn = 0
const bodies = []
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    bodies.push(body)
    const t = script[Math.min(turn, script.length - 1)]
    turn++
    if (t.http) { res.writeHead(t.http, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:'boom'}})); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    const base = { id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'fake' }
    send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })
    if (t.text) {
      for (const ch of t.text.match(/.{1,5}/gs) ?? []) {
        send({ ...base, choices: [{ index: 0, delta: { content: ch }, finish_reason: null }] })
      }
    }
    if (t.toolCalls) {
      t.toolCalls.forEach((tc, i) => {
        send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }] }, finish_reason: null }] })
      })
    }
    if (t.abort) { res.socket.destroy(); return }
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: t.toolCalls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })
    res.write('data: [DONE]\n\n')
    res.end()
  })
})
server.listen(0, '127.0.0.1', () => {
  process.send?.({ port: server.address().port })
  console.error(`FAKE_PORT=${server.address().port}`)
})
process.on('SIGTERM', () => { console.error('REQUESTS=' + bodies.length); server.close(); process.exit(0) })

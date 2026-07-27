import { runPrint } from '../packages/cli/src/commands/print.js'
const code = await runPrint({
  prompt: 'do the thing', providerId: 'custom', modelId: 'fake-model', apiKey: 'sk-test',
  baseUrl: process.env.PRINT_BASE_URL, skills: [], yolo: true, json: false,
})
process.exitCode = code
process.stderr.write(`\n### runPrint returned ${code} at t=${process.uptime().toFixed(2)}s\n`)
let n = 0
const iv = setInterval(() => {
  n++
  process.stderr.write(`### t=${process.uptime().toFixed(1)}s handles=${JSON.stringify(process.getActiveResourcesInfo())}\n`)
  if (n >= 8) { process.stderr.write('### forcing exit\n'); process.exit(code) }
}, 3000)
iv.unref()

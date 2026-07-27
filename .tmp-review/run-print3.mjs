import { runPrint } from '../packages/cli/src/commands/print.js'
const code = await runPrint({
  prompt: 'do the thing', providerId: 'custom', modelId: 'fake-model', apiKey: 'sk-test',
  baseUrl: process.env.PRINT_BASE_URL, skills: [],
  yolo: process.env.PRINT_YOLO === '1', json: process.env.PRINT_JSON === '1',
})
process.exitCode = code
process.stderr.write(`\n### runPrint returned ${code} at t=${process.uptime().toFixed(2)}s\n`)
setTimeout(() => {
  process.stderr.write(`### STILL ALIVE 3s later. handles=${JSON.stringify(process.getActiveResourcesInfo())}\n`)
  process.stderr.write(`### forcing exit\n`)
  process.exit(code)
}, 3000).unref()

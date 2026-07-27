process.on('unhandledRejection', (r) => { console.error('### UNHANDLED REJECTION:', r?.message ?? r) })
process.on('uncaughtException', (e) => { console.error('### UNCAUGHT:', e?.message ?? e) })
const origErr = console.error
console.error = (...a) => { origErr('### console.error called:', new Error('trace').stack.split('\n').slice(1,6).join('\n')); origErr(...a) }
import('../packages/cli/src/commands/print.js').then(async ({ runPrint }) => {
  process.exitCode = await runPrint({
    prompt: 'do the thing', providerId: 'custom', modelId: 'fake-model', apiKey: 'sk-test',
    baseUrl: process.env.PRINT_BASE_URL, skills: [], yolo: false, json: false,
  })
})

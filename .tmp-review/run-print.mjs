import { runPrint } from '../packages/cli/src/commands/print.js'
process.exitCode = await runPrint({
  prompt: 'do the thing',
  providerId: 'custom',
  modelId: 'fake-model',
  apiKey: 'sk-test',
  baseUrl: process.env.PRINT_BASE_URL,
  skills: [],
  yolo: process.env.PRINT_YOLO === '1',
  json: process.env.PRINT_JSON === '1',
})

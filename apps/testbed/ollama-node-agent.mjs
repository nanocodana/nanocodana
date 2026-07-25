import dotenv from 'dotenv'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createOllama, ollama } from 'ai-sdk-ollama'
import { NodeAgent } from '@nanocodana/nodejs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

dotenv.config({ path: path.join(repoRoot, '.env') })

const apiKey = process.env.OLLAMA_API_KEY || process.env.OLLAMACLOUD_KEY
if (!apiKey) {
  console.error(
    'OLLAMA_API_KEY or OLLAMACLOUD_KEY is required in the repo root .env file.',
  )
  process.exit(1)
}

const modelId = process.env.TESTBED_OLLAMA_MODEL || 'gemma3:4b-cloud'
const baseURL = process.env.TESTBED_OLLAMA_HOST || 'https://ollama.com'
const workingDirectory =
  process.env.TESTBED_WORKDIR || "./working-dir"
const prompt =
  process.argv.slice(2).join(' ').trim() ||
  'List the top-level files in this working directory and summarize what this project appears to be.'
/*
const ollama = createOllama({
  apiKey,
  baseURL,
})
*/
const agent = NodeAgent({
  model: ollama("gemma3:27b-cloud"),
  toolMiddleware: 'auto',
  workingDirectory,
  compact: true
})

console.log('NanoCodana Testbed')
console.log(`Provider: Ollama`)
console.log(`Model: ${modelId}`)
console.log(`Base URL: ${baseURL}`)
console.log(`Working directory: ${workingDirectory}`)
console.log(`Prompt: ${prompt}`)
console.log('')

const result = await agent.stream({ prompt })

for await (const chunk of result.fullStream) {
  if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.text)
  } else if (chunk.type === 'tool-call') {
    console.log(`\n\n[tool] ${chunk.toolName}`)
    console.log(JSON.stringify(chunk.input ?? {}, null, 2))
  } else if (chunk.type === 'tool-result') {
    console.log(`\n[result] ${chunk.toolName}`)
    console.log(
      typeof chunk.output === 'string'
        ? chunk.output
        : JSON.stringify(chunk.output, null, 2),
    )
  } else if (chunk.type === 'tool-approval-request') {
    console.log(`\n[approval] ${chunk.toolCall.toolName}`)
    console.log(JSON.stringify(chunk.toolCall.input, null, 2))
    throw new Error('This testbed script does not support approval flows.')
  }
}

console.log('\n')

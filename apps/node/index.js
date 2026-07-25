import * as readline from 'readline'
import dotenv from 'dotenv'
import { pathToFileURL } from 'node:url'

// Load environment variables from .env file
dotenv.config()

const workingDirectory = process.cwd() + "/working-dir"
const messages = []
const promptArgIndex = process.argv.indexOf('--prompt')
const oneShotPrompt =
  promptArgIndex >= 0 ? process.argv[promptArgIndex + 1]?.trim() : undefined

async function createAgent() {
  const testAgentModule = process.env.NANOCODANA_TEST_AGENT_MODULE

  if (testAgentModule) {
    const moduleUrl = testAgentModule.startsWith('file:')
      ? testAgentModule
      : pathToFileURL(testAgentModule).href
    const testAgentFactoryModule = await import(moduleUrl)
    const createTestAgent =
      testAgentFactoryModule.createAgent ?? testAgentFactoryModule.default

    if (typeof createTestAgent !== 'function') {
      throw new Error('Test agent module must export createAgent or default')
    }

    return createTestAgent({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'cli-testbed',
      workingDirectory,
    })
  }

  const provider = process.env.NANOCODANA_MODEL_PROVIDER
  const apiKey = process.env.ANTHROPIC_API_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY
  const modelId = process.env.NANOCODANA_MODEL_ID

  const useOpenAI =
    provider === 'openai' || (!provider && !apiKey && Boolean(openaiApiKey))

  if (!useOpenAI && !apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }
  if (useOpenAI && !openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }

  const [{ NodeAgent }, { wrapLanguageModel }, { devToolsMiddleware }] =
    await Promise.all([
      import('@nanocodana/nodejs'),
      import('ai'),
      import('@ai-sdk/devtools'),
    ])

  let providerModel

  if (useOpenAI) {
    const { createOpenAI } = await import('@ai-sdk/openai')
    const openai = createOpenAI({ apiKey: openaiApiKey })
    providerModel = openai(modelId || 'gpt-4o-mini')
  } else {
    const { createAnthropic } = await import('@ai-sdk/anthropic')
    const anthropic = createAnthropic({ apiKey })
    providerModel = anthropic(modelId || 'claude-haiku-4-5')
  }

  const model = wrapLanguageModel({
    model: providerModel,
    middleware: devToolsMiddleware()
  })

  return NodeAgent({
    model,
    workingDirectory,
    mcpServers: {
      "coingecko": {
        "transport": "http",
        "url": "https://mcp.api.coingecko.com/mcp",
      }
    },
    onFilesChange: (changes) => {
      console.log('\n📁 Files changed:')
      changes.forEach(({ path, content }) => {
        if (content !== undefined) {
          console.log(`  ✏️  ${path} (${content.length} characters)`)
        } else {
          console.log(`  🗑️  ${path} (deleted)`)
        }
      })
    }
  })
}

let agent

console.log('NanoCodana CLI')
console.log('===================')
console.log(`Working directory: ${workingDirectory}`)
console.log('Type your message or "exit" to quit\n')

// Set up readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function prompt() {
  rl.question('You: ', async (input) => {
    const message = input.trim()

    if (!message) {
      prompt()
      return
    }

    if (message.toLowerCase() === 'exit') {
      console.log('Goodbye!')
      rl.close()
      process.exit(0)
    }

    try {
      await handleMessage(message)
      console.log('\n')
      prompt()
    } catch (error) {
      console.error(`\nError: ${error.message}`)
      console.log('\n')
      prompt()
    }
  })
}

try {
  agent = await createAgent()
  if (oneShotPrompt) {
    await handleMessage(oneShotPrompt)
    process.exit(0)
  } else {
    prompt()
  }
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}

async function handleMessage(message) {
  console.log(`You: ${message}`)
  console.log('\nAssistant: ')
  messages.push({ role: 'user', content: message })
  await streamAgent()
}

async function streamAgent() {
  const result = await agent.stream({ messages })
  let pendingApproval = null

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      process.stdout.write(chunk.text)
    } else if (chunk.type === 'tool-call') {
      console.log(`\n🔧 Tool: ${chunk.toolName}`)
      console.log(`   Input: ${JSON.stringify(chunk.input ?? {}, null, 2)}`)
    } else if (chunk.type === 'tool-result') {
      const output = chunk.output
      console.log(`\n✓ Result: ${typeof output === 'string' ? output : JSON.stringify(output, null, 2)}`)
    } else if (chunk.type === 'tool-approval-request') {
      pendingApproval = chunk
      console.log(`\n⚠️  APPROVAL REQUIRED: ${chunk.toolCall.toolName}`)
      console.log(`   Input: ${JSON.stringify(chunk.toolCall.input, null, 2)}`)
    }
  }

  const response = await result.response
  if (response?.messages) {
    messages.push(...response.messages)
  }

  if (pendingApproval) {
    if (oneShotPrompt) {
      throw new Error('One-shot mode does not support approval flows')
    }

    const approved = await new Promise(resolve => {
      rl.question('Approve? (y/n): ', answer => {
        resolve(answer.toLowerCase().trim() === 'y')
      })
    })

    messages.push({
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: pendingApproval.approvalId,
          approved,
        },
      ],
    })

    await streamAgent()
  }
}

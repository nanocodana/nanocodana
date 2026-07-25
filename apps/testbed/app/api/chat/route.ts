import dotenv from 'dotenv'
import { convertToModelMessages, type UIMessage } from 'ai'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

dotenv.config({
  path: path.resolve(process.cwd(), '../../.env'),
})

const runtimeImport = new Function(
  'modulePath',
  'return import(modulePath)'
) as (modulePath: string) => Promise<{ NodeAgent: typeof import('@nanocodana/nodejs').NodeAgent }>

async function createAgent() {
  const nodeAgentModulePath = pathToFileURL(
    path.resolve(process.cwd(), '../../packages/adapters/nodejs/dist/index.js')
  ).href

  const [{ createOpenAI }, { NodeAgent }] = await Promise.all([
    import('@ai-sdk/openai'),
    runtimeImport(nodeAgentModulePath),
  ])

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })

  return NodeAgent({
    model: openai(process.env.TESTBED_OPENAI_MODEL || 'gpt-4o-mini'),
    workingDirectory: process.env.TESTBED_WORKDIR || path.resolve(process.cwd(), './working-dir'),
  })
}

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json()
  const agent = await createAgent()

  const result = await agent.stream({
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
  })
}

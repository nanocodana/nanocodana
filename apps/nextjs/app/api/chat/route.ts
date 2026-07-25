import { NanoCodana } from '@nanocodana/core'
import { convertToModelMessages, type UIMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const agent = new NanoCodana({
  model: openai('gpt-4o'),
  initialFiles: [
    { path: 'README.md', content: '# My Project\n\nA demo project.' },
    { path: 'src/index.ts', content: 'console.log("hello world")' },
  ]
})

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()
  const result = await agent.stream({
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
  })
}

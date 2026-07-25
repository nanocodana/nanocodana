import { BrowserAgent } from '@nanocodana/browser'
// User installs their own model provider:
// import { createOpenAI } from '@ai-sdk/openai'
// import { webLLM } from '@browser-ai/web-llm'
// import { transformersJS } from '@browser-ai/transformers-js'
//import { browserAI } from '@browser-ai/core'
import { createAnthropic } from '@ai-sdk/anthropic';

let agent = null
let isProcessing = false
let conversationMessages = []

// DOM elements
const chat = document.getElementById('chat')
const input = document.getElementById('input')
const sendBtn = document.getElementById('send')
const apiKeyInput = document.getElementById('apiKey')
const persistCheckbox = document.getElementById('persist')
const fileList = document.getElementById('fileList')

// Initialize agent when API key is provided
apiKeyInput.addEventListener('change', async () => {
  const apiKey = apiKeyInput.value.trim()
  if (apiKey) {

    const anthropic = createAnthropic({
      apiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
    });

    const model = anthropic("claude-sonnet-4-5")

    // Create OpenAI model
    //const openai = createOpenAI({ apiKey })
    //const model = openai('gpt-4o')

    // For WebLLM (runs locally in browser):
    /*const model = webLLM("Hermes-3-Llama-3.1-8B-q4f32_1-MLC");
    const availability = await model.availability();

    if (availability === "unavailable") {
      console.log("Browser doesn't support built-in AI models");
      return;
    }

    if (availability === "downloadable") {
      await model.createSessionWithProgress((progress) => {
        console.log(`Download progress: ${JSON.stringify(progress)}`);
      });
    }*/

    //const model = transformersJS('HuggingFaceTB/SmolLM2-360M-Instruct')

    //const model = builtInAI()

    addMessage('system', 'Initializing agent...')

    agent = BrowserAgent({
      model,
      initialFiles: [
        { path: 'README.md', content: '# My Project\n\nWelcome to my coding project!' },
        { path: 'src/utils.ts', content: `export function add(a: number, b: number): number {
  return a + b
}

export function multiply(a: number, b: number): number {
  return a * b
}` },
        { path: 'src/index.ts', content: `import { add, multiply } from './utils'

console.log('2 + 3 =', add(2, 3))
console.log('4 * 5 =', multiply(4, 5))` }
      ],
      onFilesChange: (changes) => {
        changes.forEach(({ path, content }) => {
          console.log('File changed:', path, content?.length)
          if (content !== undefined) {
            if (!currentFiles.includes(path)) {
              currentFiles.push(path)
            }
          } else {
            currentFiles = currentFiles.filter(f => f !== path)
          }
        })
        updateFileList()
      }
    })
    conversationMessages = []
    currentFiles = ['README.md', 'src/utils.ts', 'src/index.ts']
    updateFileList()
    addMessage('system', `Agent initialized! Ready to help. Files: README.md, src/utils.ts, src/index.ts`)
  }
})

// Send message
sendBtn.addEventListener('click', handleSend)
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !isProcessing) {
    handleSend()
  }
})

async function handleSend() {
  if (!agent) {
    addMessage('system', 'Please enter your Anthropic API key first.')
    return
  }

  const message = input.value.trim()
  if (!message) return

  addMessage('user', message)
  input.value = ''
  isProcessing = true
  sendBtn.disabled = true

  const assistantMsgEl = addMessage('assistant', '')
  let fullText = ''

  try {
    conversationMessages.push({
      role: 'user',
      content: message,
    })

    const result = await agent.stream({
      messages: conversationMessages,
    })

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'text-delta') {
        fullText += chunk.text
        assistantMsgEl.querySelector('.message-content').textContent = fullText
      } else if (chunk.type === 'tool-call') {
        addToolCall(chunk.toolName, chunk.input ?? {})
      } else if (chunk.type === 'tool-result') {
        addToolResult(chunk.toolName, chunk.output)
      }
      chat.scrollTop = chat.scrollHeight
    }

    const response = await result.response
    if (response?.messages) {
      conversationMessages.push(...response.messages)
    }

    if (!fullText) {
      const text = await result.text
      if (text) {
        assistantMsgEl.querySelector('.message-content').textContent = text
      }
    }
  } catch (error) {
    console.error('Error:', error)
    addMessage('system', `Error: ${error.message}`)
  } finally {
    isProcessing = false
    sendBtn.disabled = false
    input.focus()
  }
}

function addMessage(role, content) {
  const messageEl = document.createElement('div')
  messageEl.className = `message ${role}`

  const contentEl = document.createElement('div')
  contentEl.className = 'message-content'
  contentEl.textContent = content

  messageEl.appendChild(contentEl)
  chat.appendChild(messageEl)

  chat.scrollTop = chat.scrollHeight

  return messageEl
}

function addToolCall(toolName, params) {
  const messageEl = document.createElement('div')
  messageEl.className = 'message tool'

  const contentEl = document.createElement('div')
  contentEl.className = 'message-content'

  const toolHeader = document.createElement('div')
  toolHeader.className = 'tool-header'
  toolHeader.textContent = `🔧 ${toolName}`

  const paramsEl = document.createElement('pre')
  paramsEl.className = 'tool-params'
  paramsEl.textContent = JSON.stringify(params, null, 2)

  contentEl.appendChild(toolHeader)
  contentEl.appendChild(paramsEl)
  messageEl.appendChild(contentEl)

  const assistantMsg = chat.querySelector('.message.assistant:last-child')
  if (assistantMsg) {
    chat.insertBefore(messageEl, assistantMsg)
  } else {
    chat.appendChild(messageEl)
  }

  chat.scrollTop = chat.scrollHeight
}

function addToolResult(toolName, result) {
  const messageEl = document.createElement('div')
  messageEl.className = 'message tool-result'

  const contentEl = document.createElement('div')
  contentEl.className = 'message-content'

  const toolHeader = document.createElement('div')
  toolHeader.className = 'tool-header'
  toolHeader.textContent = `✓ ${toolName} result`

  const resultEl = document.createElement('pre')
  resultEl.className = 'tool-params'
  resultEl.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2)

  contentEl.appendChild(toolHeader)
  contentEl.appendChild(resultEl)
  messageEl.appendChild(contentEl)

  const assistantMsg = chat.querySelector('.message.assistant:last-child')
  if (assistantMsg) {
    chat.insertBefore(messageEl, assistantMsg)
  } else {
    chat.appendChild(messageEl)
  }

  chat.scrollTop = chat.scrollHeight
}

let currentFiles = []

async function updateFileList() {
  if (currentFiles.length === 0) {
    fileList.innerHTML = '<li class="file-item">No files yet</li>'
  } else {
    fileList.innerHTML = currentFiles
      .sort()
      .map(file => `<li class="file-item">${file}</li>`)
      .join('')
  }
}

// Focus input on load
input.focus()

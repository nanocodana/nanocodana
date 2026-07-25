// Image-generation demo — the agent generates images and writes them to disk.
//
// Two models, two jobs: a text model (Anthropic or OpenAI, from your .env) does
// the reasoning, and an OpenAI image model makes the pictures. Setting
// `imageModel` on the agent exposes a `GenerateImage` tool the agent calls on
// its own — you just describe what you want and where to save it. Watch for the
// cyan `↳ GenerateImage → path`.
//
//   npm run image-demo
//
// Requires OPENAI_API_KEY in apps/node/.env (the image model is OpenAI's).
// The text model uses ANTHROPIC_API_KEY if present, else OPENAI_API_KEY.
// Override the image model with NANOCODANA_IMAGE_MODEL_ID (e.g. dall-e-3 if your
// account doesn't have gpt-image-1 access).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeAgent } from '@nanocodana/nodejs'
import { dim, cyan, bold, green, buildModel, repl, defaultToolCall } from './demo-runtime.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workingDirectory = path.join(__dirname, 'image-workspace')
fs.mkdirSync(workingDirectory, { recursive: true })

// The image model is OpenAI here — image generation is a separate capability
// from the text model, so it gets its own model object.
if (!process.env.OPENAI_API_KEY) {
  throw new Error('Set OPENAI_API_KEY in apps/node/.env — the image model is OpenAI.')
}
const { createOpenAI } = await import('@ai-sdk/openai')
const imageModelId = process.env.NANOCODANA_IMAGE_MODEL_ID || 'gpt-image-1'
const imageModel = createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).image(imageModelId)

const agent = NodeAgent({
  model: await buildModel(), // codes / reasons
  imageModel, // <- the only line that turns image generation on
  workingDirectory,
})

/** Highlight GenerateImage with its prompt + destination path. */
function onToolCall(chunk) {
  if (chunk.toolName === 'GenerateImage') {
    const { prompt = '', path: dest, size, aspectRatio, n } = chunk.input ?? {}
    const opts = [size && `size ${size}`, aspectRatio && `${aspectRatio}`, n && `n=${n}`]
      .filter(Boolean)
      .join(' · ')
    console.log(`\n${cyan('↳ GenerateImage')} → ${bold(dest)}${opts ? dim(`  (${opts})`) : ''}`)
    console.log(dim(`   "${prompt.length > 100 ? prompt.slice(0, 97) + '...' : prompt}"`))
  } else {
    defaultToolCall(chunk)
  }
}

repl({
  agent,
  onToolCall,
  banner() {
    console.log(bold('\n🎨 NanoCodana — Image generation demo'))
    console.log(`Text model:  ${dim(process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')}`)
    console.log(`Image model: ${dim(`openai/${imageModelId}`)}`)
    console.log(`Output dir:  ${dim(workingDirectory)}\n`)
    console.log(`You describe the image and where to save it — the agent calls the
${cyan('GenerateImage')} tool on its own and writes the file. Try:

  ${dim('› ')}Generate a minimalist orange monkey mascot logo and save it to logo.png
  ${dim('› ')}Make a 16:9 hero banner of a misty forest at sunrise as hero.png
  ${dim('› ')}Create three icon variations of a banana and save them to icon.png

Files land in ${green('image-workspace/')}. Type ${bold('exit')} to quit.
`)
  },
})

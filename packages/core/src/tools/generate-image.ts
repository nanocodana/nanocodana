import { jsonSchema } from 'ai'
import type { Tool } from '../types.js'

export interface GenerateImageArgs {
  prompt: string
  path: string
  /** Pixel dimensions like "1024x1024". Provider-dependent. */
  size?: string
  /** Aspect ratio like "16:9" or "1:1". Use instead of `size` where the model prefers it. */
  aspectRatio?: string
  /** Number of images to generate (default 1). */
  n?: number
}

export const GENERATE_IMAGE_TOOL_SCHEMA = jsonSchema<GenerateImageArgs>({
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'A detailed description of the image to generate.'
    },
    path: {
      type: 'string',
      description:
        'Filesystem path to write the image to, e.g. "public/hero.png". The extension hints the format. For n>1, an index is inserted before the extension (hero-0.png, hero-1.png, …).'
    },
    size: {
      type: 'string',
      description:
        'Pixel dimensions like "1024x1024". Provider-dependent — omit if unsure or if using aspectRatio.'
    },
    aspectRatio: {
      type: 'string',
      description:
        'Aspect ratio like "16:9" or "1:1". Use instead of size for models that prefer it (e.g. Imagen, Flux, Grok).'
    },
    n: {
      type: 'number',
      description: 'How many images to generate (default 1).'
    }
  },
  required: ['prompt', 'path'],
  additionalProperties: false
})

export function createGenerateImageTool(
  execute: (params: GenerateImageArgs) => Promise<string>
): Tool {
  return {
    name: 'GenerateImage',
    description: `Generates one or more images from a text prompt using the configured image model and writes them to the filesystem.

Usage:
- Provide a detailed \`prompt\` and a \`path\` to save the image to (e.g. "public/hero.png"). The extension hints the output format.
- Set \`n\` to produce several variations; an index is inserted into the filename for each.
- Use \`size\` ("1024x1024") OR \`aspectRatio\` ("16:9") depending on what the image model supports — omit both to use the model's default.
- After it returns, the written file is on the filesystem: Read it, move it, or reference its path in code.
- This tool is only available when an image model is configured on the agent.`,
    compactDescription: 'Generates image(s) from a prompt and writes them to the given path.',
    parameters: GENERATE_IMAGE_TOOL_SCHEMA,
    needsApproval: false,
    execute
  }
}

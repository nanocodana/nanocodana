import { jsonSchema } from 'ai'
import type { Tool } from '@nanocodana/core'
import TurndownService from 'turndown'

interface WebFetchArgs {
  url: string
  prompt: string
}

const WEBFETCH_TOOL_SCHEMA = jsonSchema<WebFetchArgs>({
  type: 'object',
  properties: {
    url: { type: 'string', format: 'uri', description: 'The URL to fetch content from' },
    prompt: { type: 'string', description: 'The prompt to run on the fetched content' }
  },
  required: ['url', 'prompt'],
  additionalProperties: false
})

interface CacheEntry {
  content: string
  timestamp: number
}

// 15-minute cache
const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 15 * 60 * 1000

function cleanCache() {
  const now = Date.now()
  for (const [url, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(url)
    }
  }
}

export function createNodeWebFetchTool(): Tool {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  })

  return {
    name: 'WebFetch',
    description: `
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions. All MCP-provided tools start with "mcp__".
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
`,
    parameters: WEBFETCH_TOOL_SCHEMA,
    execute: async ({ url, prompt }: WebFetchArgs) => {
    // Clean expired cache entries
    cleanCache()

    // Upgrade HTTP to HTTPS
    const fetchUrl = url.replace(/^http:\/\//i, 'https://')

    // Check cache
    const cached = cache.get(fetchUrl)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return `Content from ${fetchUrl}:\n\n${cached.content}\n\n---\n\nTask: ${prompt}`
    }

    try {
      // Fetch with manual redirect handling to detect cross-origin redirects
      const response = await fetch(fetchUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NanoCodana/1.0)'
        }
      })

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (location) {
          const redirectUrl = new URL(location, fetchUrl).toString()
          const originalHost = new URL(fetchUrl).host
          const redirectHost = new URL(redirectUrl).host

          if (originalHost !== redirectHost) {
            return `The URL redirects to a different host.\n\nOriginal: ${fetchUrl}\nRedirect: ${redirectUrl}\n\nPlease make a new WebFetch request with the redirect URL to fetch the content.`
          }

          // Follow same-host redirects automatically
          const redirectResponse = await fetch(redirectUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; NanoCodana/1.0)'
            }
          })

          if (!redirectResponse.ok) {
            throw new Error(`HTTP ${redirectResponse.status}: ${redirectResponse.statusText}`)
          }

          const html = await redirectResponse.text()
          const markdown = turndown.turndown(html)

          // Cache the result
          cache.set(fetchUrl, { content: markdown, timestamp: Date.now() })

          return `Content from ${fetchUrl} (redirected to ${redirectUrl}):\n\n${markdown}\n\n---\n\nTask: ${prompt}`
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type') || ''
      const html = await response.text()

      // Convert to markdown if HTML, otherwise return as-is
      let content: string
      if (contentType.includes('text/html')) {
        content = turndown.turndown(html)
      } else {
        content = html
      }

      // Cache the result
      cache.set(fetchUrl, { content, timestamp: Date.now() })

      return `Content from ${fetchUrl}:\n\n${content}\n\n---\n\nTask: ${prompt}`
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch ${fetchUrl}: ${error.message}`)
      }
      throw error
    }
    }
  }
}

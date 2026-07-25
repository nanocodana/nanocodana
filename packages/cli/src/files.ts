import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  'build',
  'coverage',
  '.turbo',
  '.cache',
])

const MAX_FILES = 2000
const MAX_DEPTH = 8
const MAX_MENTION_BYTES = 64 * 1024

/**
 * Bounded recursive listing of project files as paths relative to `root`.
 * Skips heavy/generated dirs, caps total count and depth so it stays fast
 * even in large repos. Used for @-mention suggestions.
 */
export function listProjectFiles(root: string): string[] {
  const out: string[] = []

  const walk = (dir: string, depth: number) => {
    if (out.length >= MAX_FILES || depth > MAX_DEPTH) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return
      if (entry.name.startsWith('.') && entry.name !== '.env.example') {
        // Skip dotfiles/dirs (but the ignored-set covers .git etc. anyway).
        if (entry.isDirectory()) continue
      }
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        walk(full, depth + 1)
      } else if (entry.isFile()) {
        out.push(relative(root, full).split(sep).join('/'))
      }
    }
  }

  walk(root, 0)
  return out
}

/** The trailing "@partial" token being typed, if any (for live suggestions). */
export function activeMention(input: string): string | null {
  const m = input.match(/(?:^|\s)@(\S*)$/)
  return m ? m[1] : null
}

/** Up to `limit` file paths matching the partial (substring, case-insensitive). */
export function matchFiles(files: string[], partial: string, limit = 8): string[] {
  if (partial === '') return files.slice(0, limit)
  const needle = partial.toLowerCase()
  return files.filter((f) => f.toLowerCase().includes(needle)).slice(0, limit)
}

export interface ResolvedMentions {
  /** The message to send to the model (original text + inlined file contents). */
  text: string
  /** Relative paths that were successfully attached. */
  attached: string[]
}

/**
 * Expands @path tokens in a message by inlining the referenced files'
 * contents as fenced blocks. The original text is preserved (so the model
 * sees the reference in context); file bodies are appended below.
 */
export function resolveMentions(input: string, root: string): ResolvedMentions {
  const tokens = [...input.matchAll(/(?:^|\s)@(\S+)/g)].map((m) => m[1])
  const attached: string[] = []
  const blocks: string[] = []

  for (const token of tokens) {
    const rel = token.replace(/[.,;:]$/, '') // trailing punctuation
    const full = join(root, rel)
    try {
      const st = statSync(full)
      if (!st.isFile() || st.size > MAX_MENTION_BYTES) continue
      const content = readFileSync(full, 'utf8')
      attached.push(rel)
      blocks.push(`\n\nContents of \`${rel}\`:\n\`\`\`\n${content}\n\`\`\``)
    } catch {
      /* not a readable file — leave the @mention as plain text */
    }
  }

  return { text: blocks.length > 0 ? input + blocks.join('') : input, attached }
}

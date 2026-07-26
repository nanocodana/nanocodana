import { jsonSchema } from 'ai'
import type { Tool } from '@nanocodana/core/no-bash'
import { promises as fs } from 'fs'
import { join, relative, sep } from 'path'

/**
 * The default Grep for the Node adapter: a zero-dependency JS search over the
 * real filesystem. Ignore-aware (built-in skips + .gitignore), binary-safe,
 * and capped, so pointing it at a large repo can't melt the agent loop. Devs
 * who want ripgrep speed on big codebases override the tool with
 * `createRipgrepTool` (system rg) via the `tools` config — see the docs.
 */

export interface NodeGrepParams {
  pattern: string
  path?: string
  glob?: string
  output_mode?: 'content' | 'files_with_matches' | 'count'
  '-B'?: number
  '-A'?: number
  '-C'?: number
  '-n'?: boolean
  '-i'?: boolean
  type?: string
  head_limit?: number
  multiline?: boolean
}

export const NODE_GREP_TOOL_SCHEMA = jsonSchema<NodeGrepParams>({
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'The regular expression pattern (JavaScript RegExp syntax) to search for in file contents' },
    path: { type: 'string', description: 'File or directory to search in. Defaults to current working directory.' },
    glob: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.js", "src/**/*.ts")' },
    output_mode: {
      type: 'string',
      enum: ['content', 'files_with_matches', 'count'],
      description: 'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".'
    },
    '-B': { type: 'number', description: 'Number of lines to show before each match. Requires output_mode: "content", ignored otherwise.' },
    '-A': { type: 'number', description: 'Number of lines to show after each match. Requires output_mode: "content", ignored otherwise.' },
    '-C': { type: 'number', description: 'Number of lines to show before and after each match. Requires output_mode: "content", ignored otherwise.' },
    '-n': { type: 'boolean', description: 'Show line numbers in output. Requires output_mode: "content", ignored otherwise.' },
    '-i': { type: 'boolean', description: 'Case insensitive search' },
    type: { type: 'string', description: 'File type to search. Common types: js, ts, py, rust, go, java, c, cpp, rb, php, sh, md, json, yaml, html, css' },
    head_limit: { type: 'number', description: 'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes.' },
    multiline: { type: 'boolean', description: 'Enable multiline mode where . matches newlines and patterns can span lines. Default: false.' }
  },
  required: ['pattern'],
  additionalProperties: false
})

// Directories no search should ever descend into, .gitignore or not.
const ALWAYS_SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', '.turbo', '.cache', '.vercel',
  'dist', 'build', 'out', 'coverage'
])

// Guardrails: a grep is a peek, not an indexing job.
const MAX_FILE_SIZE = 1_000_000 // bytes; larger files are skipped
const MAX_OUTPUT_LINES = 2000
const MAX_FILES_SCANNED = 50_000

const TYPE_EXTENSIONS: Record<string, string[]> = {
  js: ['js', 'jsx', 'mjs', 'cjs'],
  ts: ['ts', 'tsx', 'mts', 'cts'],
  py: ['py'],
  rust: ['rs'],
  go: ['go'],
  java: ['java'],
  c: ['c', 'h'],
  cpp: ['cpp', 'cc', 'cxx', 'hpp', 'hh'],
  rb: ['rb'],
  php: ['php'],
  sh: ['sh', 'bash', 'zsh'],
  md: ['md', 'markdown'],
  json: ['json'],
  yaml: ['yaml', 'yml'],
  html: ['html', 'htm'],
  css: ['css', 'scss', 'less']
}

interface IgnoreRule {
  regex: RegExp
  dirOnly: boolean
  /** Path of the directory the .gitignore lives in, relative to the search root ('' = root). */
  base: string
}

/** Converts one gitignore pattern into a regex over root-relative paths. */
function gitignorePatternToRule(pattern: string, base: string): IgnoreRule | null {
  let p = pattern.trim()
  if (!p || p.startsWith('#')) return null
  // Negation re-includes are rare and interact subtly with skips — we treat
  // negated patterns as unsupported rather than half-supporting them.
  if (p.startsWith('!')) return null

  const dirOnly = p.endsWith('/')
  if (dirOnly) p = p.slice(0, -1)

  // A slash anywhere anchors the pattern to the .gitignore's directory;
  // otherwise it matches the basename at any depth below it.
  const anchored = p.includes('/')
  if (p.startsWith('/')) p = p.slice(1)

  let regexStr = ''
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]
    if (ch === '*') {
      if (p[i + 1] === '*') {
        regexStr += '.*'
        i++
        if (p[i + 1] === '/') i++ // "**/" swallows the slash too
      } else {
        regexStr += '[^/]*'
      }
    } else if (ch === '?') {
      regexStr += '[^/]'
    } else {
      regexStr += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }

  const prefix = base ? `${base}/` : ''
  const body = anchored ? `${prefix}${regexStr}` : `${prefix}(?:.*/)?${regexStr}`
  return { regex: new RegExp(`^${body}(?:/.*)?$`), dirOnly, base }
}

async function loadIgnoreRules(dirAbs: string, dirRel: string): Promise<IgnoreRule[]> {
  try {
    const content = await fs.readFile(join(dirAbs, '.gitignore'), 'utf8')
    return content
      .split('\n')
      .map(line => gitignorePatternToRule(line, dirRel))
      .filter((rule): rule is IgnoreRule => rule !== null)
  } catch {
    return []
  }
}

function isIgnored(relPath: string, isDir: boolean, rules: IgnoreRule[]): boolean {
  return rules.some(rule => (!rule.dirOnly || isDir) && rule.regex.test(relPath))
}

/** rg-style glob filter: no slash = basename match at any depth, slash = full path. */
function globToRegex(glob: string): { regex: RegExp; onBasename: boolean } {
  const onBasename = !glob.includes('/')
  let regexStr = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        regexStr += '.*'
        i++
        if (glob[i + 1] === '/') i++
      } else {
        regexStr += '[^/]*'
      }
    } else if (ch === '?') {
      regexStr += '[^/]'
    } else if (ch === '{') {
      regexStr += '('
    } else if (ch === '}') {
      regexStr += ')'
    } else if (ch === ',' && regexStr.lastIndexOf('(') > regexStr.lastIndexOf(')')) {
      regexStr += '|'
    } else {
      regexStr += ch.replace(/[.+^$()|[\]\\]/g, '\\$&')
    }
  }
  return { regex: new RegExp(`^${regexStr}$`), onBasename }
}

function looksBinary(buffer: Buffer): boolean {
  const probe = buffer.subarray(0, 8192)
  return probe.includes(0)
}

interface FileMatch {
  file: string
  /** 1-based line numbers that matched. */
  lines: number[]
  /** All lines of the file (only kept in content mode). */
  allLines?: string[]
}

export function createNodeGrepTool(workingDirectory: string): Tool {
  return {
    name: 'Grep',
    description: `A fast content-search tool over the working directory.

  Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Patterns use JavaScript RegExp syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with the glob parameter (e.g., "*.js", "src/**/*.tsx") or the type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Skips .gitignore'd files, common build/dependency directories, binary files, and files over 1 MB
  - Multiline matching: by default patterns match within single lines only; use \`multiline: true\` for patterns that span lines
`,
    compactDescription: 'Search file contents with a JS regex. Returns file paths by default; content mode shows matching lines.',
    parameters: NODE_GREP_TOOL_SCHEMA,
    execute: async (params: NodeGrepParams) => {
      const {
        pattern,
        path,
        glob,
        output_mode = 'files_with_matches',
        '-B': beforeContext,
        '-A': afterContext,
        '-C': context,
        '-n': showLineNumbers,
        '-i': caseInsensitive,
        type,
        head_limit,
        multiline
      } = params

      let regex: RegExp
      try {
        regex = new RegExp(pattern, `${caseInsensitive ? 'i' : ''}${multiline ? 's' : ''}`)
      } catch (error) {
        return `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`
      }

      let typeExts: Set<string> | undefined
      if (type) {
        const exts = TYPE_EXTENSIONS[type]
        if (!exts) {
          return `Unknown file type "${type}". Supported types: ${Object.keys(TYPE_EXTENSIONS).join(', ')}`
        }
        typeExts = new Set(exts)
      }

      const globFilter = glob ? globToRegex(glob) : undefined
      const searchRoot = path ? join(workingDirectory, path) : workingDirectory

      const wantContent = output_mode === 'content'
      const matches: FileMatch[] = []
      let filesScanned = 0
      let truncated = false

      const matchesFilters = (relPath: string): boolean => {
        const basename = relPath.slice(relPath.lastIndexOf('/') + 1)
        if (typeExts) {
          const ext = basename.slice(basename.lastIndexOf('.') + 1).toLowerCase()
          if (!typeExts.has(ext)) return false
        }
        if (globFilter && !globFilter.regex.test(globFilter.onBasename ? basename : relPath)) {
          return false
        }
        return true
      }

      const scanFile = async (absPath: string, relPath: string): Promise<void> => {
        if (!matchesFilters(relPath)) return
        if (filesScanned >= MAX_FILES_SCANNED) {
          truncated = true
          return
        }
        filesScanned++

        let buffer: Buffer
        try {
          const stat = await fs.stat(absPath)
          if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return
          buffer = await fs.readFile(absPath)
        } catch {
          return // unreadable — skip, same as rg
        }
        if (looksBinary(buffer)) return

        const content = buffer.toString('utf8')
        const lines = content.split('\n')
        const matchedLines: number[] = []

        if (multiline) {
          // Scan the whole content; report the line each match starts on.
          const global = new RegExp(regex.source, `${regex.flags.replace('g', '')}g`)
          let m: RegExpExecArray | null
          while ((m = global.exec(content)) !== null) {
            const lineNo = content.slice(0, m.index).split('\n').length
            if (matchedLines[matchedLines.length - 1] !== lineNo) matchedLines.push(lineNo)
            if (m[0] === '') global.lastIndex++ // zero-width match — don't spin
          }
        } else {
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) matchedLines.push(i + 1)
          }
        }

        if (matchedLines.length > 0) {
          matches.push({
            file: relPath,
            lines: matchedLines,
            allLines: wantContent ? lines : undefined
          })
        }
      }

      const walk = async (dirAbs: string, inheritedRules: IgnoreRule[]): Promise<void> => {
        const dirRel = relative(searchRoot, dirAbs).split(sep).join('/')
        const rules = [
          ...inheritedRules,
          ...(await loadIgnoreRules(dirAbs, dirRel === '' ? '' : dirRel))
        ]

        let entries
        try {
          entries = await fs.readdir(dirAbs, { withFileTypes: true })
        } catch {
          return
        }
        entries.sort((a, b) => a.name.localeCompare(b.name))

        for (const entry of entries) {
          if (truncated) return
          const entryAbs = join(dirAbs, entry.name)
          const entryRel = dirRel === '' ? entry.name : `${dirRel}/${entry.name}`

          if (entry.isDirectory()) {
            if (ALWAYS_SKIP_DIRS.has(entry.name)) continue
            if (isIgnored(entryRel, true, rules)) continue
            await walk(entryAbs, rules)
          } else if (entry.isFile()) {
            if (isIgnored(entryRel, false, rules)) continue
            await scanFile(entryAbs, entryRel)
          }
          // Symlinks are skipped: following them risks cycles and escapes.
        }
      }

      try {
        const rootStat = await fs.stat(searchRoot)
        if (rootStat.isFile()) {
          await scanFile(searchRoot, relative(workingDirectory, searchRoot).split(sep).join('/') || searchRoot)
        } else {
          await walk(searchRoot, [])
        }
      } catch {
        return `Path not found: ${path ?? workingDirectory}`
      }

      // Assemble output in the requested mode.
      const out: string[] = []
      if (output_mode === 'files_with_matches') {
        for (const m of matches) out.push(m.file)
      } else if (output_mode === 'count') {
        for (const m of matches) out.push(`${m.file}:${m.lines.length}`)
      } else {
        const before = context ?? beforeContext ?? 0
        const after = context ?? afterContext ?? 0
        const numbered = showLineNumbers !== false

        for (const m of matches) {
          const lines = m.allLines!
          const matched = new Set(m.lines)
          // Expand each match by the context window, then merge into runs.
          const include = new Set<number>()
          for (const lineNo of m.lines) {
            const from = Math.max(1, lineNo - before)
            const to = Math.min(lines.length, lineNo + after)
            for (let i = from; i <= to; i++) include.add(i)
          }
          const ordered = [...include].sort((a, b) => a - b)
          let prev = 0
          for (const lineNo of ordered) {
            if (prev && lineNo > prev + 1) out.push('--')
            // rg convention: ':' separates match lines, '-' separates context.
            const sepChar = matched.has(lineNo) ? ':' : '-'
            out.push(
              numbered
                ? `${m.file}${sepChar}${lineNo}${sepChar}${lines[lineNo - 1]}`
                : `${m.file}${sepChar}${lines[lineNo - 1]}`
            )
            prev = lineNo
          }
        }
      }

      let limited = out
      if (head_limit && head_limit > 0 && out.length > head_limit) {
        limited = out.slice(0, head_limit)
      } else if (out.length > MAX_OUTPUT_LINES) {
        limited = out.slice(0, MAX_OUTPUT_LINES)
        truncated = true
      }

      let result = limited.join('\n')
      if (truncated) {
        result += `\n[results truncated — narrow the search with path, glob, or type]`
      }
      return result || 'No matches found'
    }
  }
}

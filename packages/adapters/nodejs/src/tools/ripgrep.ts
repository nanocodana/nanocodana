import type { Tool } from '@nanocodana/core/no-bash'
import { spawn, spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { NODE_GREP_TOOL_SCHEMA, type NodeGrepParams } from './grep.js'

/**
 * Ripgrep-backed Grep. NodeAgent uses it automatically whenever a ripgrep
 * binary can be resolved (see resolveRipgrepPath) and falls back to the
 * zero-dependency JS Grep (createNodeGrepTool) otherwise — so a missing
 * binary can never break an agent, only slow its searches.
 */

const INSTALL_HINT =
  'ripgrep (`rg`) was not found. Reinstall @nanocodana/nodejs with optional ' +
  'dependencies enabled, or install ripgrep yourself (e.g. `brew install ripgrep`, ' +
  '`apt install ripgrep`, `winget install BurntSushi.ripgrep.MSVC`).'

/**
 * Finds a usable ripgrep binary, best first:
 *
 *  1. The `@vscode/ripgrep` optionalDependency. Optional installs may fail or
 *     be skipped (`--omit=optional`), and under `--ignore-scripts` the module
 *     resolves but its postinstall never downloaded the binary — hence the
 *     existsSync check, not just a successful require.
 *  2. A system `rg` on PATH.
 *
 * Returns null when neither exists; callers fall back to the JS Grep.
 * Resolution is cheap but not free (a spawnSync probe), so NodeAgent calls
 * this once at construction.
 */
export function resolveRipgrepPath(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const { rgPath } = require('@vscode/ripgrep') as { rgPath: string }
    if (rgPath && existsSync(rgPath)) return rgPath
  } catch {
    // Optional dependency absent — fall through to the system probe.
  }

  try {
    if (spawnSync('rg', ['--version'], { stdio: 'ignore' }).status === 0) return 'rg'
  } catch {
    // No system rg either.
  }

  return null
}

export function createRipgrepTool(workingDirectory: string, rgPath?: string): Tool {
  const rgBin = rgPath ?? resolveRipgrepPath() ?? 'rg'
  return {
    name: 'Grep',
    description: `A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use Task tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`,
    compactDescription: 'Search file contents with ripgrep. Returns file paths by default; content mode shows matching lines.',
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

      // Build ripgrep arguments
      const args: string[] = []

      // Output mode
      if (output_mode === 'files_with_matches') {
        args.push('--files-with-matches')
      } else if (output_mode === 'count') {
        args.push('--count')
      }
      // For 'content' mode, ripgrep defaults to showing content

      // Context lines
      if (context !== undefined) {
        args.push('-C', context.toString())
      } else {
        if (beforeContext !== undefined) {
          args.push('-B', beforeContext.toString())
        }
        if (afterContext !== undefined) {
          args.push('-A', afterContext.toString())
        }
      }

      // Line numbers (default in content mode, but explicit control)
      if (output_mode === 'content' && showLineNumbers !== false) {
        args.push('--line-number')
      }

      // Case sensitivity
      if (caseInsensitive) {
        args.push('--ignore-case')
      }

      // File type
      if (type) {
        args.push('--type', type)
      }

      // Glob pattern
      if (glob) {
        args.push('--glob', glob)
      }

      // Multiline mode
      if (multiline) {
        args.push('--multiline', '--multiline-dotall')
      }

      // Add pattern
      args.push('--', pattern)

      // Add path if specified
      if (path) {
        args.push(join(workingDirectory, path))
      } else {
        args.push(workingDirectory)
      }

      return new Promise((resolve, reject) => {
        const rg = spawn(rgBin, args, {
          cwd: workingDirectory
        })

        let stdout = ''
        let stderr = ''

        rg.stdout.on('data', (data) => {
          stdout += data.toString()
        })

        rg.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        rg.on('close', (code) => {
          // ripgrep returns:
          // 0 - matches found
          // 1 - no matches found
          // 2 - error occurred

          if (code === 2) {
            reject(new Error(`ripgrep error: ${stderr || 'Unknown error'}`))
            return
          }

          // Apply head_limit if specified
          let result = stdout.trim()
          if (head_limit && result) {
            const lines = result.split('\n')
            result = lines.slice(0, head_limit).join('\n')
          }

          resolve(result)
        })

        rg.on('error', (error: NodeJS.ErrnoException) => {
          reject(new Error(error.code === 'ENOENT' ? INSTALL_HINT : `Failed to run ripgrep: ${error.message}`))
        })
      })
    }
  }
}

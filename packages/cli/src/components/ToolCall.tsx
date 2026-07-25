import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { Diff } from './Diff.js'

interface ToolCallProps {
  name: string
  params?: any
  result?: any
  isExecuting?: boolean
}

/** Pick the most meaningful single argument to show beside the tool name. */
function primaryArg(name: string, params: any): string {
  if (!params || typeof params !== 'object') return ''
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'Delete':
    case 'LS':
      return params.path ?? ''
    case 'MultiEdit':
      return params.file_path ?? ''
    case 'Glob':
    case 'Grep':
      return params.pattern ?? ''
    case 'Bash':
      return params.command ?? ''
    case 'WebFetch':
      return params.url ?? ''
    case 'TodoWrite':
      return Array.isArray(params.todos) ? `${params.todos.length} items` : ''
    default:
      // Best-effort: first string-ish value.
      for (const v of Object.values(params)) {
        if (typeof v === 'string') return v
      }
      return ''
  }
}

function truncate(value: string, max = 80): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine
}

function displayName(name: string): string {
  if (name.startsWith('mcp_')) {
    return name.replace(/^mcp_/, '').replace(/_/g, '·')
  }
  return name
}

/** A short, dim summary line for a completed tool result. */
function ResultSummary({ name, params, result }: { name: string; params: any; result: any }) {
  // File edits → render a diff instead of a summary line.
  if (name === 'Edit' && params?.oldText !== undefined) {
    return <Diff oldText={params.oldText} newText={params.newText ?? ''} />
  }
  if (name === 'Write' && typeof params?.content === 'string') {
    return <Diff oldText="" newText={params.content} />
  }
  if (name === 'MultiEdit' && Array.isArray(params?.edits)) {
    return (
      <Box flexDirection="column">
        {params.edits.slice(0, 5).map((edit: any, i: number) => (
          <Diff key={i} oldText={edit.old_string ?? ''} newText={edit.new_string ?? ''} maxLines={20} />
        ))}
      </Box>
    )
  }

  let summary = ''
  if (name === 'Bash' && result && typeof result === 'object') {
    const out = (result.stdout ?? '').toString().trim()
    const err = (result.stderr ?? '').toString().trim()
    if (result.exitCode && result.exitCode !== 0) {
      return (
        <Box paddingLeft={2}>
          <Text color="red">⎿  exit {result.exitCode}: {truncate(err || out, 100)}</Text>
        </Box>
      )
    }
    const lines = out.split('\n').filter(Boolean)
    summary = lines.length === 0 ? '(no output)' : `${lines.length} line${lines.length !== 1 ? 's' : ''}`
  } else if (Array.isArray(result)) {
    summary = `${result.length} result${result.length !== 1 ? 's' : ''}`
  } else if (typeof result === 'string') {
    const lineCount = result.split('\n').length
    summary = name === 'Read' ? `Read ${lineCount} lines` : truncate(result, 100)
  } else if (result !== undefined) {
    summary = truncate(JSON.stringify(result), 100)
  }

  if (!summary) return null
  return (
    <Box paddingLeft={2}>
      <Text dimColor>⎿  {summary}</Text>
    </Box>
  )
}

export function ToolCall({ name, params, result, isExecuting = false }: ToolCallProps) {
  const arg = truncate(primaryArg(name, params), 80)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        {isExecuting ? (
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color="green">⏺</Text>
        )}
        <Box marginLeft={1}>
          <Text bold>{displayName(name)}</Text>
          {arg ? <Text dimColor>({arg})</Text> : null}
        </Box>
      </Box>

      {!isExecuting && result !== undefined && (
        <ResultSummary name={name} params={params} result={result} />
      )}
      {/* Show the diff preview even while executing for Edit/Write/MultiEdit. */}
      {isExecuting && (name === 'Edit' || name === 'Write' || name === 'MultiEdit') && (
        <ResultSummary name={name} params={params} result={undefined} />
      )}
    </Box>
  )
}

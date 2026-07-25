import React from 'react'
import { Box, Text } from 'ink'
import { diffLines } from 'diff'

interface DiffProps {
  oldText: string
  newText: string
  /** Max lines to render before truncating. */
  maxLines?: number
}

/**
 * Renders a line-level diff the way Claude Code does: added lines green with a
 * "+" gutter, removed lines red with "-", a few lines of dim context around
 * changes. Long diffs are truncated with a summary.
 */
export function Diff({ oldText, newText, maxLines = 40 }: DiffProps) {
  const parts = diffLines(oldText, newText)

  type Row = { gutter: string; text: string; color?: string; dim?: boolean }
  const rows: Row[] = []

  for (const part of parts) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    if (part.added) {
      for (const line of lines) rows.push({ gutter: '+', text: line, color: 'green' })
    } else if (part.removed) {
      for (const line of lines) rows.push({ gutter: '-', text: line, color: 'red' })
    } else {
      // Context — keep it light. Collapse long unchanged runs.
      if (lines.length > 6) {
        for (const line of lines.slice(0, 3)) rows.push({ gutter: ' ', text: line, dim: true })
        rows.push({ gutter: ' ', text: `… ${lines.length - 6} unchanged lines …`, dim: true })
        for (const line of lines.slice(-3)) rows.push({ gutter: ' ', text: line, dim: true })
      } else {
        for (const line of lines) rows.push({ gutter: ' ', text: line, dim: true })
      }
    }
  }

  const added = rows.filter((r) => r.gutter === '+').length
  const removed = rows.filter((r) => r.gutter === '-').length
  const shown = rows.slice(0, maxLines)
  const truncated = rows.length - shown.length

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text dimColor>
        {added > 0 ? <Text color="green">+{added} </Text> : null}
        {removed > 0 ? <Text color="red">-{removed} </Text> : null}
      </Text>
      {shown.map((row, i) => (
        <Text key={i} color={row.color} dimColor={row.dim}>
          {row.gutter} {row.text}
        </Text>
      ))}
      {truncated > 0 && <Text dimColor>… {truncated} more lines …</Text>}
    </Box>
  )
}

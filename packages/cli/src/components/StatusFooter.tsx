import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
interface StatusFooterProps {
  model: string
  cwd: string
  inputTokens: number
  outputTokens: number
  /** Cache-read share of inputTokens — shown as a cached %, no dollar figures. */
  cacheReadTokens?: number
  /** Show a warning marker when tool approvals are bypassed. */
  autoApprove?: boolean
}

/** Read the current git branch once (cheap, synchronous, best-effort). */
function readGitBranch(cwd: string): string | undefined {
  try {
    const head = readFileSync(join(cwd, '.git', 'HEAD'), 'utf8').trim()
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/)
    if (m) return m[1]
    // Detached HEAD → short sha.
    if (/^[0-9a-f]{7,40}$/i.test(head)) return head.slice(0, 7)
  } catch {
    /* not a git repo */
  }
  return undefined
}

/**
 * Persistent footer status line, rendered below the composer. Branch is read
 * once at mount; token counts update live as the session progresses.
 */
export function StatusFooter({
  model,
  cwd,
  inputTokens,
  outputTokens,
  cacheReadTokens = 0,
  autoApprove,
}: StatusFooterProps) {
  const [branch, setBranch] = useState<string | undefined>()

  useEffect(() => {
    setBranch(readGitBranch(cwd))
  }, [cwd])

  const total = inputTokens + outputTokens
  // Tokens only — no dollar estimates, so nothing here goes stale when
  // providers change prices. The cached share is the useful cost signal:
  // cache reads bill at ~0.1x the input rate.
  const cachedShare = inputTokens > 0 ? Math.round((cacheReadTokens / inputTokens) * 100) : 0

  const sep = <Text dimColor>  ·  </Text>

  return (
    <Box marginTop={1}>
      <Text dimColor>{model}</Text>
      {sep}
      <Text dimColor>{basename(cwd) || cwd}</Text>
      {branch && (
        <>
          {sep}
          <Text color="magenta">⎇ {branch}</Text>
        </>
      )}
      {total > 0 && (
        <>
          {sep}
          <Text dimColor>{total.toLocaleString()} tok</Text>
          {cachedShare > 0 && (
            <>
              {sep}
              <Text color="green">{cachedShare}% cached</Text>
            </>
          )}
        </>
      )}
      {autoApprove && (
        <>
          {sep}
          <Text color="yellow">⚠ auto-approve</Text>
        </>
      )}
    </Box>
  )
}

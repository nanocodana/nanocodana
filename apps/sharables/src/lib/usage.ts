import type { UIMessage } from 'ai'

export interface UsageNumbers {
  /** Total input tokens, INCLUDING cache reads/writes. */
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

/**
 * Per-response token usage attached as UIMessage metadata by the chat
 * transport (see createAgentChat in SnackPage). Serialized to localStorage
 * with the messages, so a project's cumulative usage survives reloads.
 *
 * Segments are keyed by a unique per-response id: a tool-approval resume
 * streams into the SAME assistant message, and the chat deep-merges metadata
 * — unique keys make the continuation's usage accumulate alongside the
 * pre-approval segment instead of overwriting it.
 *
 * Deliberately tokens-only (no dollar estimates, so nothing goes stale when
 * providers change prices), and a lower bound: a turn aborted mid-stream
 * never emits a 'finish' part, so its billed tokens are not counted.
 */
export interface MessageUsageMetadata {
  usageSegments?: Record<string, UsageNumbers>
}

export interface SessionUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** Sums usage metadata across a chat's messages into one session total. */
export function aggregateSessionUsage(messages: UIMessage[]): SessionUsage {
  const total: SessionUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  for (const message of messages) {
    const segments = (message.metadata as MessageUsageMetadata | undefined)?.usageSegments
    if (!segments) continue
    for (const usage of Object.values(segments)) {
      total.input += usage.input ?? 0
      total.output += usage.output ?? 0
      total.cacheRead += usage.cacheRead ?? 0
      total.cacheWrite += usage.cacheWrite ?? 0
    }
  }
  return total
}

/** Whether there is anything worth showing in the meter. */
export function hasUsage(usage: SessionUsage): boolean {
  return usage.input > 0 || usage.output > 0
}

export function formatTokens(count: number): string {
  // Compare against the displayed precision, not the raw count, so values
  // that ROUND into the next tier switch tiers (999,980 → "1.0M", not
  // "1000.0k").
  const millions = count / 1_000_000
  if (millions >= 0.9995) return `${millions.toFixed(1)}M`
  const thousands = count / 1_000
  if (thousands >= 0.9995) return `${thousands.toFixed(1)}k`
  return String(count)
}

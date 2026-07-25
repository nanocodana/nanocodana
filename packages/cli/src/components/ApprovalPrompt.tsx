import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Diff } from './Diff.js'

export interface ApprovalRequest {
  approvalId: string
  toolName: string
  input: any
}

interface ApprovalPromptProps {
  request: ApprovalRequest
  onDecision: (approved: boolean) => void
}

/**
 * Inline approval UI. Shows what the tool will do (a diff for file edits, the
 * command for Bash, or the raw params) and lets the user choose with arrow
 * keys or y/n. Enter confirms the highlighted choice; Esc denies.
 *
 * Owns its own keyboard input, so the main composer is hidden while this is
 * mounted — there's no ambiguity about where keystrokes go.
 */
export function ApprovalPrompt({ request, onDecision }: ApprovalPromptProps) {
  const [selected, setSelected] = useState<0 | 1>(0) // 0 = allow, 1 = deny

  useInput((value, key) => {
    if (key.leftArrow || key.upArrow) setSelected(0)
    else if (key.rightArrow || key.downArrow) setSelected(1)
    else if (value === 'y' || value === 'Y') onDecision(true)
    else if (value === 'n' || value === 'N') onDecision(false)
    else if (key.escape) onDecision(false)
    else if (key.return) onDecision(selected === 0)
  })

  const { toolName, input } = request

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text bold color="yellow">
        ⚠ Allow {toolName}?
      </Text>

      <Box marginTop={1}>{renderPreview(toolName, input)}</Box>

      <Box marginTop={1}>
        <Box marginRight={2}>
          <Text bold inverse={selected === 0} color={selected === 0 ? 'green' : undefined}>
            {' '}
            ✓ Yes{' '}
          </Text>
        </Box>
        <Box>
          <Text bold inverse={selected === 1} color={selected === 1 ? 'red' : undefined}>
            {' '}
            ✗ No{' '}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>←/→ to choose · y/n shortcut · Enter to confirm · Esc denies</Text>
      </Box>
    </Box>
  )
}

function renderPreview(toolName: string, input: any): React.ReactNode {
  if (!input || typeof input !== 'object') {
    return <Text dimColor>{String(input ?? '')}</Text>
  }

  if (toolName === 'Edit' && input.oldText !== undefined) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{input.path}</Text>
        <Diff oldText={input.oldText} newText={input.newText ?? ''} maxLines={24} />
      </Box>
    )
  }
  if (toolName === 'Write' && typeof input.content === 'string') {
    return (
      <Box flexDirection="column">
        <Text dimColor>{input.path}</Text>
        <Diff oldText="" newText={input.content} maxLines={24} />
      </Box>
    )
  }
  if (toolName === 'MultiEdit' && Array.isArray(input.edits)) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{input.file_path}</Text>
        {input.edits.slice(0, 3).map((edit: any, i: number) => (
          <Diff key={i} oldText={edit.old_string ?? ''} newText={edit.new_string ?? ''} maxLines={16} />
        ))}
      </Box>
    )
  }
  if (toolName === 'Bash' && typeof input.command === 'string') {
    return (
      <Box flexDirection="column">
        {input.host && (
          <Text color="red" bold>
            ⚠ Runs on the host shell — outside the sandbox
          </Text>
        )}
        <Text color="cyan">$ {input.command}</Text>
      </Box>
    )
  }

  return <Text dimColor>{JSON.stringify(input, null, 2)}</Text>
}

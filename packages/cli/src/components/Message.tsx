import React from 'react'
import { Box, Text } from 'ink'
import { Markdown } from './Markdown.js'

interface MessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * A finalized message in the transcript. Assistant text is rendered as
 * markdown (headings, code, lists, …); user and system messages stay plain.
 * Live/streaming text is handled separately in chat.tsx, so this component is
 * only used for committed history.
 */
export function Message({ role, content }: MessageProps) {
  if (role === 'user') {
    return (
      <Box marginTop={1}>
        <Box marginRight={1}>
          <Text color="blue" bold>
            ›
          </Text>
        </Box>
        <Text color="blue">{content}</Text>
      </Box>
    )
  }

  if (role === 'system') {
    return (
      <Box marginTop={1}>
        <Text color="yellow" dimColor>
          {content}
        </Text>
      </Box>
    )
  }

  // assistant
  return (
    <Box marginTop={1} flexDirection="column">
      <Markdown>{content}</Markdown>
    </Box>
  )
}

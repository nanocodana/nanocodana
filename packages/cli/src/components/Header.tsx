import React from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'

interface HeaderProps {
  version?: string
  model?: string
  mcpServers?: number
  cwd?: string
}

/**
 * Compact welcome banner. A clean gradient wordmark reads more "product" than
 * large hand-aligned ASCII art (which also tends to drift across terminals).
 */
export function Header({ version = '0.1.0', model, mcpServers = 0, cwd }: HeaderProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Gradient name="pastel">
          <Text bold>✻ NanoCodana</Text>
        </Gradient>
        <Text dimColor>  AI coding agent</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>v{version}</Text>
        {model && (
          <>
            <Text dimColor>  ·  </Text>
            <Text color="green">{model}</Text>
          </>
        )}
        {mcpServers > 0 && (
          <>
            <Text dimColor>  ·  </Text>
            <Text color="magenta">
              {mcpServers} MCP server{mcpServers !== 1 ? 's' : ''}
            </Text>
          </>
        )}
      </Box>

      {cwd && (
        <Box>
          <Text dimColor>{cwd}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Type a message · /help for commands · Ctrl+C to exit</Text>
      </Box>
    </Box>
  )
}

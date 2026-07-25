import React from 'react'
import { Box, Text } from 'ink'
import { marked } from 'marked'
import { highlight, supportsLanguage } from 'cli-highlight'

/**
 * Renders a markdown string as Ink components.
 *
 * Strategy: use marked's lexer to get a structured token stream, then map
 * block tokens to Ink <Box> and inline tokens to nested <Text>. Fenced code
 * blocks are syntax-highlighted with cli-highlight (highlight.js), whose ANSI
 * output Ink renders natively.
 *
 * Keys are derived from each node's position in the token tree (not a mutable
 * counter), so the component is a pure function of its input and can be
 * re-rendered every streamed token without remounting the subtree.
 *
 * Only the common subset an assistant produces is handled; unknown tokens fall
 * back to their raw text so nothing is ever dropped.
 */

function highlightCode(code: string, lang?: string): string {
  try {
    if (lang && supportsLanguage(lang)) {
      return highlight(code, { language: lang, ignoreIllegals: true })
    }
    return highlight(code, { ignoreIllegals: true })
  } catch {
    return code
  }
}

/** Render inline tokens (strong/em/codespan/link/text...) as nested <Text>. */
function renderInline(tokens: any[] | undefined, fallback: string | undefined, keyBase: string): React.ReactNode[] {
  if (!tokens || tokens.length === 0) {
    return fallback ? [<Text key={`${keyBase}.0`}>{fallback}</Text>] : []
  }

  return tokens.map((token, i) => {
    const key = `${keyBase}.${i}`
    switch (token.type) {
      case 'strong':
        return (
          <Text key={key} bold>
            {renderInline(token.tokens, token.text, key)}
          </Text>
        )
      case 'em':
        return (
          <Text key={key} italic>
            {renderInline(token.tokens, token.text, key)}
          </Text>
        )
      case 'del':
        return (
          <Text key={key} strikethrough>
            {renderInline(token.tokens, token.text, key)}
          </Text>
        )
      case 'codespan':
        return (
          <Text key={key} color="cyan">
            {token.text}
          </Text>
        )
      case 'link':
        return (
          <Text key={key} color="blue" underline>
            {renderInline(token.tokens, token.text, key)}
          </Text>
        )
      case 'br':
        return <Text key={key}>{'\n'}</Text>
      case 'escape':
      case 'text':
      case 'html':
      default:
        if (token.tokens && token.tokens.length > 0) {
          return <Text key={key}>{renderInline(token.tokens, token.text, key)}</Text>
        }
        return <Text key={key}>{token.text ?? token.raw ?? ''}</Text>
    }
  })
}

const HEADING_COLORS = ['magenta', 'magenta', 'cyan', 'cyan', 'blue', 'blue'] as const

/** Render a single block-level token. */
function renderBlock(token: any, key: string): React.ReactNode {
  switch (token.type) {
    case 'space':
      return null

    case 'heading': {
      // No leading "#" marks — style headings as standout text instead.
      const color = HEADING_COLORS[Math.min(token.depth - 1, HEADING_COLORS.length - 1)]
      const isTop = token.depth <= 2
      return (
        <Box key={key} marginTop={1}>
          <Text bold color={color} underline={isTop}>
            {renderInline(token.tokens, token.text, key)}
          </Text>
        </Box>
      )
    }

    case 'paragraph':
      return (
        <Box key={key}>
          <Text>{renderInline(token.tokens, token.text, key)}</Text>
        </Box>
      )

    case 'text':
      return (
        <Box key={key}>
          <Text>{token.tokens ? renderInline(token.tokens, token.text, key) : token.text}</Text>
        </Box>
      )

    case 'code': {
      const highlighted = highlightCode(token.text ?? '', token.lang)
      return (
        <Box
          key={key}
          flexDirection="column"
          marginY={1}
          paddingX={1}
          borderStyle="round"
          borderColor="gray"
        >
          <Text>{highlighted}</Text>
        </Box>
      )
    }

    case 'blockquote':
      return (
        <Box
          key={key}
          paddingLeft={1}
          borderStyle="single"
          borderColor="gray"
          borderTop={false}
          borderRight={false}
          borderBottom={false}
        >
          <Box flexDirection="column">
            {(token.tokens ?? []).map((t: any, i: number) => renderBlock(t, `${key}.q${i}`))}
          </Box>
        </Box>
      )

    case 'list':
      return (
        <Box key={key} flexDirection="column">
          {token.items.map((item: any, index: number) => {
            const marker = token.ordered ? `${(token.start || 1) + index}.` : '•'
            const itemKey = `${key}.li${index}`
            return (
              <Box key={itemKey} flexDirection="row">
                <Box marginRight={1}>
                  <Text color="gray">{marker}</Text>
                </Box>
                <Box flexDirection="column">{renderListItemContent(item, itemKey)}</Box>
              </Box>
            )
          })}
        </Box>
      )

    case 'hr':
      return (
        <Box key={key} marginY={1}>
          <Text color="gray">────────────────────</Text>
        </Box>
      )

    case 'html':
      return null

    default:
      return (
        <Box key={key}>
          <Text>{token.raw ?? token.text ?? ''}</Text>
        </Box>
      )
  }
}

/** List items can contain inline text and/or nested blocks. */
function renderListItemContent(item: any, keyBase: string): React.ReactNode {
  if (!item.tokens || item.tokens.length === 0) {
    return <Text>{item.text}</Text>
  }
  const allInline = item.tokens.every((t: any) => t.type === 'text' || t.type === 'paragraph')
  if (allInline) {
    return (
      <Text>
        {item.tokens.map((t: any, i: number) => renderInline(t.tokens, t.text, `${keyBase}.${i}`))}
      </Text>
    )
  }
  return item.tokens.map((t: any, i: number) => renderBlock(t, `${keyBase}.b${i}`))
}

interface MarkdownProps {
  children: string
}

export function Markdown({ children }: MarkdownProps) {
  let tokens: any[]
  try {
    tokens = marked.lexer(children)
  } catch {
    return <Text>{children}</Text>
  }

  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => renderBlock(token, `b${i}`)).filter(Boolean)}
    </Box>
  )
}

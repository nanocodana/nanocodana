'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import Link from 'next/link'

export default function TestbedPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px 20px',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: '0 auto',
          background: '#ffffff',
          border: '1px solid #d8dee9',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
        }}
      >
        <header
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid #e5e7eb',
            background:
              'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(59,130,246,0.12))',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            color: '#0369a1',
          }}
        >
            Server-Client Testbed
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
            <h1 style={{ margin: '8px 0 6px', fontSize: 28, color: '#0f172a' }}>
              `useChat` client against a server `NanoCodana` route
            </h1>
            <Link href="/client-only" style={{ color: '#2563eb', textDecoration: 'none', marginTop: 10 }}>
              Client-only page
            </Link>
          </div>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
            The client uses `useChat` and `DefaultChatTransport`. The server route
            runs `NanoCodana` with the Node adapter and `gpt-4o-mini`.
          </p>
        </header>

        <section
          data-testid="chat-log"
          style={{
            minHeight: 420,
            maxHeight: 520,
            overflowY: 'auto',
            padding: 28,
            background: '#f8fafc',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                padding: 24,
                borderRadius: 16,
                background: '#ffffff',
                border: '1px dashed #cbd5e1',
                color: '#64748b',
              }}
            >
              Try: “List the top-level files in this repo” or “Read README.md and
              summarize it.”
            </div>
          ) : (
            messages.map(message => (
              <article
                key={message.id}
                data-testid={`message-${message.role}`}
                style={{ marginBottom: 18 }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: message.role === 'user' ? '#2563eb' : '#059669',
                    marginBottom: 6,
                  }}
                >
                  {message.role === 'user' ? 'Client' : 'Agent'}
                </div>

                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <div
                        key={`${message.id}-${index}`}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #dbe4f0',
                          borderRadius: 14,
                          padding: '12px 14px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                          color: '#0f172a',
                        }}
                      >
                        {part.text}
                      </div>
                    )
                  }

                  if (part.type.startsWith('tool-')) {
                    const invocation = (part as any).toolInvocation ?? part

                    return (
                      <div
                        key={`${message.id}-${index}`}
                        data-testid="tool-part"
                        style={{
                          marginTop: 8,
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: '#fff7ed',
                          border: '1px solid #fdba74',
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          {invocation.toolName || part.type}
                        </div>
                        {invocation.input && (
                          <div style={{ color: '#7c2d12', marginBottom: 4 }}>
                            {JSON.stringify(invocation.input)}
                          </div>
                        )}
                        {invocation.state === 'result' && invocation.result && (
                          <div style={{ color: '#9a3412' }}>
                            {typeof invocation.result === 'string'
                              ? invocation.result
                              : JSON.stringify(invocation.result)}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return null
                })}
              </article>
            ))
          )}
        </section>

        <form
          onSubmit={event => {
            event.preventDefault()
            if (!input.trim() || isBusy) return
            sendMessage({ text: input })
            setInput('')
          }}
          style={{
            display: 'flex',
            gap: 12,
            padding: 20,
            borderTop: '1px solid #e5e7eb',
            background: '#ffffff',
          }}
        >
          <input
            data-testid="chat-input"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Ask the server-backed agent something..."
            style={{
              flex: 1,
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              fontSize: 15,
            }}
          />
          <button
            data-testid="chat-submit"
            type="submit"
            disabled={isBusy}
            style={{
              minWidth: 120,
              border: 'none',
              borderRadius: 14,
              background: isBusy ? '#93c5fd' : '#2563eb',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 700,
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {isBusy ? 'Working' : 'Send'}
          </button>
        </form>
      </div>
    </main>
  )
}

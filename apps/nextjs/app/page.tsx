'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'

export default function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  })
  const isLoading = status === 'submitted' || status === 'streaming'

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 800,
      margin: '0 auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <header style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <span style={{ fontSize: 20 }}>⚡</span>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>NanoCodana</h1>
        {isLoading && <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>Working...</span>}
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 100 }}>
            <p style={{ fontSize: 24, marginBottom: 8 }}>What can I help you build?</p>
            <p style={{ fontSize: 14 }}>I can read, write, and edit files in your project.</p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, marginBottom: 4,
              color: m.role === 'user' ? '#2563eb' : '#059669',
              textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              {m.role === 'user' ? 'You' : 'Agent'}
            </div>

            {m.parts.map((part, i) => {
              switch (part.type) {
                case 'text':
                  return (
                    <div key={`${m.id}-${i}`} style={{
                      padding: '10px 14px', borderRadius: 8,
                      background: m.role === 'user' ? '#eff6ff' : '#f9fafb',
                      border: `1px solid ${m.role === 'user' ? '#dbeafe' : '#f3f4f6'}`,
                      whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6,
                    }}>
                      {part.text}
                    </div>
                  )
                default:
                  if (part.type.startsWith('tool-')) {
                    const inv = (part as any).toolInvocation ?? part
                    return (
                      <div key={`${m.id}-${i}`} style={{
                        marginTop: 6, padding: '8px 12px',
                        background: '#fefce8', border: '1px solid #fef08a',
                        borderRadius: 6, fontSize: 13,
                        fontFamily: 'ui-monospace, monospace',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{inv.state === 'result' ? '✓' : '⏳'}</span>
                          <span style={{ fontWeight: 600 }}>{inv.toolName || part.type}</span>
                        </div>
                        {inv.state === 'result' && inv.result && (
                          <div style={{ color: '#6b7280', marginTop: 4, maxHeight: 120, overflow: 'auto' }}>
                            {typeof inv.result === 'string' ? inv.result.slice(0, 500) : JSON.stringify(inv.result).slice(0, 500)}
                          </div>
                        )}
                      </div>
                    )
                  }
                  return null
              }
            })}
          </div>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault()
          if (!input.trim() || isLoading) return
          sendMessage({ text: input })
          setInput('')
        }}
        style={{
          padding: '12px 20px 20px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex', gap: 8,
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask the agent..."
          autoFocus
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 10,
            border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: '12px 24px', borderRadius: 10,
            background: isLoading ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', fontSize: 14, fontWeight: 500,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}

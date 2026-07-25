'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { DirectChatTransport } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { BrowserAgent } from '@nanocodana/browser'

type ClientProvider = 'openai' | 'browser-ai' | 'ollama-cloud'

function DirectBrowserChat({
  transport,
  isReady,
}: {
  transport: DirectChatTransport
  isReady: boolean
}) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({ transport })
  const isBusy = status === 'submitted' || status === 'streaming'

  return (
    <>
      <div
        data-testid="client-chat-log"
        style={{
          minHeight: 420,
          maxHeight: 540,
          overflowY: 'auto',
          padding: 24,
          background: '#f8fafc',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              background: '#ffffff',
              border: '1px dashed #cbd5e1',
              borderRadius: 16,
              padding: 20,
              color: '#64748b',
            }}
          >
            Try: “List the files you can see”, or “Create a new file called notes.txt
            with hello”.
          </div>
        ) : (
          messages.map(message => (
            <article
              key={message.id}
              data-testid={`client-message-${message.role}`}
              style={{ marginBottom: 18 }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: message.role === 'user' ? '#7c3aed' : '#059669',
                  marginBottom: 6,
                }}
              >
                {message.role === 'user' ? 'Client' : 'Browser Agent'}
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
                      data-testid="client-tool-part"
                      style={{
                        marginTop: 8,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: '#faf5ff',
                        border: '1px solid #d8b4fe',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {invocation.toolName || part.type}
                      </div>
                      {invocation.input && (
                        <div style={{ color: '#6b21a8', marginBottom: 4 }}>
                          {JSON.stringify(invocation.input)}
                        </div>
                      )}
                      {invocation.state === 'result' && invocation.result && (
                        <div style={{ color: '#7e22ce' }}>
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
      </div>

      <form
        onSubmit={event => {
          event.preventDefault()
          if (!isReady || !input.trim() || isBusy) return
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
          data-testid="client-chat-input"
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={
            isReady
              ? 'Ask the browser-backed agent something...'
              : 'Enter an API key first...'
          }
          disabled={!isReady}
          style={{
            flex: 1,
            padding: '14px 16px',
            borderRadius: 14,
            border: '1px solid #cbd5e1',
            fontSize: 15,
          }}
        />
        <button
          data-testid="client-chat-submit"
          type="submit"
          disabled={!isReady || isBusy}
          style={{
            minWidth: 120,
            border: 'none',
            borderRadius: 14,
            background: !isReady || isBusy ? '#c4b5fd' : '#7c3aed',
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 700,
            cursor: !isReady || isBusy ? 'not-allowed' : 'pointer',
          }}
        >
          {isBusy ? 'Working' : 'Send'}
        </button>
      </form>
    </>
  )
}

export default function ClientOnlyPage() {
  const [provider, setProvider] = useState<ClientProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [ollamaModel, setOllamaModel] = useState('gpt-oss:20b')
  const [transport, setTransport] = useState<DirectChatTransport | null>(null)
  const [transportVersion, setTransportVersion] = useState(0)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const [files, setFiles] = useState<string[]>(['README.md', 'src/index.ts'])

  useEffect(() => {
    let cancelled = false

    const createTransport = async () => {
      setInitializationError(null)

      if ((provider === 'openai' || provider === 'ollama-cloud') && !apiKey.trim()) {
        setTransport(null)
        return
      }

      try {
        const model =
          provider === 'openai'
            ? createOpenAI({ apiKey: apiKey.trim() })('gpt-4o-mini')
            : provider === 'ollama-cloud'
              ? createOpenAI({
                  apiKey: apiKey.trim(),
                  // Inference from Ollama's OpenAI-compat docs plus cloud API docs:
                  // local OpenAI-compatible endpoint is /v1, and direct cloud API lives on ollama.com.
                  baseURL: 'https://ollama.com/v1',
                })(ollamaModel.trim() || 'gpt-oss:20b')
            : (await import('@browser-ai/core')).browserAI()

        const agent = BrowserAgent({
          model,
          ...(provider === 'browser-ai' ? { toolMiddleware: 'auto' as const } : {}),
          persist: false,
          initialFiles: [
            {
              path: 'README.md',
              content: '# Browser Testbed\n\nClient-only NanoCodana testbed.\n',
            },
            {
              path: 'src/index.ts',
              content: 'console.log("browser testbed")\n',
            },
          ],
          onFilesChange: changes => {
            setFiles(current => {
              const next = new Set(current)

              for (const change of changes) {
                if (change.content === undefined) {
                  next.delete(change.path)
                } else {
                  next.add(change.path)
                }
              }

              return Array.from(next).sort()
            })
          },
        })

        if (cancelled) return

        setTransport(new DirectChatTransport({ agent }))
        setTransportVersion(current => current + 1)
      } catch (error) {
        if (cancelled) return

        setTransport(null)
        setInitializationError(
          error instanceof Error ? error.message : 'Failed to initialize browser model',
        )
      }
    }

    void createTransport()

    return () => {
      cancelled = true
    }
  }, [apiKey, ollamaModel, provider])

  const isReady = transport !== null

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
          maxWidth: 1120,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '280px minmax(0, 1fr)',
          gap: 20,
        }}
      >
        <aside
          style={{
            background: '#ffffff',
            border: '1px solid #d8dee9',
            borderRadius: 20,
            padding: 20,
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
            alignSelf: 'start',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#7c3aed',
            }}
          >
            Client-Only Testbed
          </div>
          <h1 style={{ margin: '8px 0 10px', fontSize: 24, color: '#111827' }}>
            Browser agent with `useChat`
          </h1>
          <p style={{ marginTop: 0, color: '#475569', lineHeight: 1.55 }}>
            This page runs `BrowserAgent` directly in the browser using
            `DirectChatTransport`. You can use either an OpenAI API key from the
            browser or the Browser AI provider when the local browser supports it.
          </p>

          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#334155',
              marginBottom: 8,
            }}
          >
            Provider
          </label>
          <select
            data-testid="client-provider"
            value={provider}
            onChange={event => setProvider(event.target.value as ClientProvider)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              marginBottom: 14,
              background: '#ffffff',
            }}
          >
            <option value="openai">OpenAI via API key</option>
            <option value="ollama-cloud">Ollama Cloud via API key</option>
            <option value="browser-ai">Browser AI (Prompt API)</option>
          </select>

          {provider === 'openai' ? (
            <>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#334155',
                  marginBottom: 8,
                }}
              >
                OpenAI API Key
              </label>
              <input
                data-testid="client-api-key"
                type="password"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
                placeholder="sk-..."
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  marginBottom: 14,
                }}
              />
            </>
          ) : provider === 'ollama-cloud' ? (
            <>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#334155',
                  marginBottom: 8,
                }}
              >
                Ollama API Key
              </label>
              <input
                data-testid="client-api-key"
                type="password"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
                placeholder="ollama_..."
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  marginBottom: 14,
                }}
              />

              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#334155',
                  marginBottom: 8,
                }}
              >
                Ollama Model
              </label>
              <input
                data-testid="client-ollama-model"
                type="text"
                value={ollamaModel}
                onChange={event => setOllamaModel(event.target.value)}
                placeholder="gpt-oss:20b"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  marginBottom: 14,
                }}
              />
            </>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: '#334155',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 14,
                padding: '12px 14px',
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              Uses `@browser-ai/core` with the browser Prompt API. This requires a
              supported browser environment, such as recent Chrome or Edge builds with
              built-in AI enabled.
            </div>
          )}

          <div
            style={{
              fontSize: 13,
              color: initializationError ? '#991b1b' : isReady ? '#166534' : '#92400e',
              background: initializationError ? '#fef2f2' : isReady ? '#ecfdf5' : '#fff7ed',
              border: `1px solid ${
                initializationError ? '#fca5a5' : isReady ? '#86efac' : '#fdba74'
              }`,
              borderRadius: 14,
              padding: '10px 12px',
              marginBottom: 18,
            }}
          >
            {initializationError
              ? initializationError
              : isReady
                ? provider === 'openai'
                  ? 'Browser agent ready with gpt-4o-mini.'
                  : provider === 'ollama-cloud'
                    ? `Browser agent ready with Ollama model ${ollamaModel.trim() || 'gpt-oss:20b'}.`
                  : 'Browser agent ready with Browser AI.'
                : provider === 'openai'
                  ? 'Paste an OpenAI API key to initialize the browser-only run.'
                  : provider === 'ollama-cloud'
                    ? 'Paste an Ollama API key and choose a cloud model to initialize the browser-only run.'
                  : 'Initialize Browser AI in this browser to run without a server API.'}
          </div>

          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#334155',
              marginBottom: 8,
            }}
          >
            In-Browser Files
          </div>
          <ul
            data-testid="client-file-list"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 8,
            }}
          >
            {files.map(file => (
              <li
                key={file}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '8px 10px',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 13,
                  color: '#334155',
                }}
              >
                {file}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 18 }}>
            <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>
              Back to server-client page
            </Link>
          </div>
        </aside>

        <section
          style={{
            background: '#ffffff',
            border: '1px solid #d8dee9',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
          }}
        >
          <header
            style={{
              padding: '22px 24px',
              borderBottom: '1px solid #e5e7eb',
              background:
                'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(236,72,153,0.10))',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#7c3aed',
                  }}
                >
                  Direct Chat Transport
                </div>
                <h2 style={{ margin: '8px 0 0', fontSize: 24, color: '#111827' }}>
                  `useChat` talking directly to `BrowserAgent`
                </h2>
              </div>
              <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>
                Server-client page
              </Link>
            </div>
          </header>

          {transport ? (
            <DirectBrowserChat
              key={transportVersion}
              transport={transport}
              isReady={isReady}
            />
          ) : (
            <>
              <div
                data-testid="client-chat-log"
                style={{
                  minHeight: 420,
                  maxHeight: 540,
                  overflowY: 'auto',
                  padding: 24,
                  background: '#f8fafc',
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px dashed #cbd5e1',
                    borderRadius: 16,
                    padding: 20,
                    color: '#64748b',
                  }}
                >
                  Enter an API key to initialize the browser-only chat transport.
                </div>
              </div>

              <form
                onSubmit={event => event.preventDefault()}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 20,
                  borderTop: '1px solid #e5e7eb',
                  background: '#ffffff',
                }}
              >
                <input
                  data-testid="client-chat-input"
                  value=""
                  readOnly
                  placeholder="Enter an API key first..."
                  disabled
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: '1px solid #cbd5e1',
                    fontSize: 15,
                  }}
                />
                <button
                  data-testid="client-chat-submit"
                  type="submit"
                  disabled
                  style={{
                    minWidth: 120,
                    border: 'none',
                    borderRadius: 14,
                    background: '#c4b5fd',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'not-allowed',
                  }}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

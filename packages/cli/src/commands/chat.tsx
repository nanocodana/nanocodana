import React, { useEffect, useRef, useState } from 'react'
import { Box, Text, Static, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import TextInput from 'ink-text-input'
import { NodeAgent } from '@nanocodana/nodejs'
import type { NanoCodana, Skill } from '@nanocodana/core'
import {
  getMCPServers,
  setModel as persistModel,
  setProviderId as persistProvider,
  setApiKeyFor,
  resolveApiKey,
  getBaseUrl,
  setBaseUrl,
  saveSession,
  loadSession,
  clearSession,
} from '../config/index.js'
import { buildModel } from '../provider-init.js'
import { PROVIDERS, getProvider, validateSetup } from '../providers.js'
import { Header, Message, ToolCall, ApprovalPrompt, StatusFooter, Markdown, ConfigFlow } from '../components/index.js'
import type { ApprovalRequest, ConfigResult } from '../components/index.js'
import { SLASH_COMMANDS, parseSlash } from './slash.js'
import { listProjectFiles, activeMention, matchFiles, resolveMentions } from '../files.js'

interface ChatModeProps {
  provider: string
  model: string
  resume?: boolean
  /** Start with auto-approve (no approval prompts) when true. */
  yolo?: boolean
  /** Skills discovered at startup, exposed to the agent via the Skill tool. */
  skills?: Skill[]
}

// Tools that always require approval. Bash is intentionally NOT here: it
// self-governs via its `host` arg (sandbox runs are free; host runs prompt).
const APPROVAL_TOOLS = ['Write', 'Edit', 'MultiEdit', 'Delete', 'WebFetch']
// Stable references for the per-call `needsApproval` override, so toggling
// auto-approve flips between two cached values (no per-turn tool rebuild from a
// fresh closure). APPROVAL_TOOLS is a module const, also stable.
const NO_APPROVAL = () => false

/** Best-effort plain text from an AI SDK message's content. */
function messageText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p) => p?.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
  }
  return ''
}

interface ToolCallData {
  name: string
  params: any
  result?: any
}

type Entry =
  | { id: number; kind: 'banner' }
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string; toolCalls: ToolCallData[] }
  | { id: number; kind: 'system'; text: string }

// Distributes Omit across the union so each variant keeps its own fields
// (a plain Omit<Entry, 'id'> would collapse to just the shared `kind`).
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never
type EntryInput = DistributiveOmit<Entry, 'id'>

export function ChatMode({
  provider: initialProvider,
  model: initialModel,
  resume = false,
  yolo = false,
  skills = [],
}: ChatModeProps) {
  const { exit } = useApp()
  // The agent is built ONCE (agentRef) and kept for the whole session;
  // provider/model changes are applied as per-call overrides on stream()
  // instead of rebuilding it.
  const [provider, setProvider] = useState(initialProvider)
  const [model, setModel] = useState(initialModel)
  const [autoApprove, setAutoApprove] = useState(yolo)
  const [history, setHistory] = useState<Entry[]>([{ id: 0, kind: 'banner' }])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [liveToolCalls, setLiveToolCalls] = useState<ToolCallData[]>([])
  const [mcpServerCount, setMcpServerCount] = useState(0)
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
  const [usage, setUsage] = useState({ input: 0, output: 0, cacheRead: 0 })
  const [configFlow, setConfigFlow] = useState<{ entry: 'model' | 'provider' } | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  // Bumped to remount <TextInput> when we replace its value programmatically,
  // so ink-text-input re-initializes its cursor to the end of the new text.
  const [inputKey, setInputKey] = useState(0)

  const agentRef = useRef<NanoCodana | null>(null)
  // The current built LanguageModel object, passed as a per-call `model`
  // override. A new object (after /model or /provider) makes core re-prep the
  // model; an unchanged reference is reused from memory.
  const modelRef = useRef<any>(null)
  const messagesRef = useRef<any[]>([])
  const turnToolCallsRef = useRef<ToolCallData[]>([])
  // Approval requests from the current step still awaiting a decision (the one
  // being shown lives in `pendingApproval`; these are the rest of the queue).
  const approvalQueueRef = useRef<ApprovalRequest[]>([])
  const idRef = useRef(1)
  const abortRef = useRef<AbortController | null>(null)
  // Command history (↑/↓) and the cached project file list (@ suggestions).
  const inputHistoryRef = useRef<string[]>([])
  const histIndexRef = useRef(-1)
  const filesRef = useRef<string[]>([])

  // Validate config and build the LanguageModel object for the given
  // provider/model (provider package is dynamic-imported, so this is async).
  // The agent itself is constructed ONCE on first success; later calls just
  // swap modelRef, which stream() passes as a per-call override. Returns false
  // (after a system message) if the provider isn't configured.
  const configureModel = async (providerId: string, modelId: string): Promise<boolean> => {
    const p = getProvider(providerId)
    const apiKey = resolveApiKey(providerId)
    const baseUrl = getBaseUrl()

    const problem = validateSetup(p, { apiKey, baseUrl, model: modelId })
    if (problem) {
      addEntry({ kind: 'system', text: problem })
      return false
    }

    try {
      modelRef.current = await buildModel({ providerId, modelId, apiKey, baseUrl })
    } catch (err: any) {
      addEntry({ kind: 'system', text: `Failed to initialize model: ${err.message}` })
      return false
    }

    if (!agentRef.current) {
      const mcpServers = getMCPServers()
      setMcpServerCount(Object.keys(mcpServers).length)
      agentRef.current = NodeAgent({
        model: modelRef.current,
        workingDirectory: process.cwd(),
        mcpServers,
        skills,
        // The CLI already loads .agents/skills + .claude/skills from both the
        // home and project scope (home < project < --skills) and passes them in
        // `skills`, so disable core's project-scope auto-discovery to avoid a
        // redundant second scan of the same directories.
        skillDirs: [],
        // A sane construction default; the live gate is passed per-call below.
        needsApproval: autoApprove ? NO_APPROVAL : APPROVAL_TOOLS,
        // just-bash gates python3 and js-exec behind flags; without these the
        // commands report "not available" even though the interpreters are
        // already installed. Both run in-memory (CPython and QuickJS compiled to
        // wasm) with no host access and under the same execution limits as the
        // rest of the sandbox — strictly less privileged than `host: true`, which
        // still requires approval.
        //
        // Deliberately NOT enabled: `network`/`fetch`, which would give the
        // sandbox curl and wget. That is a real escalation — untrusted content
        // the agent reads could direct it to exfiltrate — so network access stays
        // with the approval-gated WebFetch tool.
        virtualBash: { python: true, javascript: true },
        // codana is a local developer tool running on the user's own machine, so
        // it opts into host escalation — `git`, `npm`, `docker` and friends are
        // the point. Every host run still goes through the approval prompt.
        // The adapter defaults this off, which is the right default for anything
        // running someone else's prompts.
        hostShell: true,
      })
    }
    return true
  }

  /**
   * Switch provider and/or model. Resolves the new model FIRST and only commits
   * the UI/config state if it succeeds — so a failed switch (missing key, bad
   * model) leaves the previous provider/model intact. No agent rebuild: the new
   * model is applied as a per-call override on the next stream().
   */
  const switchTo = (providerId: string, modelId: string) => {
    void configureModel(providerId, modelId).then((ok) => {
      if (!ok) return // configureModel already explained why via a system message
      if (providerId !== provider) {
        setProvider(providerId)
        persistProvider(providerId)
      }
      if (modelId !== model) {
        setModel(modelId)
        persistModel(modelId)
      }
      addEntry({ kind: 'system', text: `Using ${getProvider(providerId).name} · ${modelId}` })
    })
  }

  useEffect(() => {
    void configureModel(initialProvider, initialModel)
    filesRef.current = listProjectFiles(process.cwd())

    if (resume) {
      const session = loadSession()
      if (session && session.messages.length > 0) {
        messagesRef.current = session.messages
        const restored: Entry[] = []
        for (const m of session.messages) {
          if (m.role === 'user') {
            restored.push({ id: idRef.current++, kind: 'user', text: messageText(m.content) })
          } else if (m.role === 'assistant') {
            const text = messageText(m.content)
            if (text.trim()) {
              restored.push({ id: idRef.current++, kind: 'assistant', text, toolCalls: [] })
            }
          }
        }
        setHistory([
          { id: 0, kind: 'banner' },
          ...restored,
          { id: idRef.current++, kind: 'system', text: `Resumed previous session — ${session.messages.length} messages` },
        ])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProvider, initialModel])

  // Live @file suggestions for the token currently being typed. Computed here
  // (above useInput) so the key handler can see them.
  const composerActive = !isProcessing && !pendingApproval && !configFlow
  const mention = composerActive ? activeMention(input) : null
  const suggestions = mention !== null ? matchFiles(filesRef.current, mention) : []
  const suggesting = suggestions.length > 0

  useInput((value, key) => {
    if (key.ctrl && value === 'c') exit()
    // Esc interrupts the in-flight turn.
    if (key.escape && isProcessing && abortRef.current) {
      abortRef.current.abort()
    }
    if (!composerActive) return

    if (suggesting) {
      // While the @file list is open, ↑/↓ move through it and Tab accepts.
      if (key.upArrow) {
        setSuggestionIndex((i) => Math.max(0, i - 1))
        return
      }
      if (key.downArrow) {
        setSuggestionIndex((i) => Math.min(suggestions.length - 1, i + 1))
        return
      }
      if (key.tab) {
        acceptSuggestion()
        return
      }
    } else {
      // Otherwise ↑/↓ cycle command history. ink-text-input only consumes
      // ←/→ (cursor), so up/down are free for us here.
      if (key.upArrow) navigateHistory(1)
      else if (key.downArrow) navigateHistory(-1)
    }
  })

  /** Set the input and remount TextInput so the cursor jumps to the end. */
  const replaceInput = (next: string) => {
    setInput(next)
    setInputKey((k) => k + 1)
  }

  /** Replace the trailing @partial with the highlighted suggestion. */
  const acceptSuggestion = () => {
    if (!suggesting) return
    const chosen = suggestions[Math.min(suggestionIndex, suggestions.length - 1)]
    replaceInput(input.replace(/(^|\s)@(\S*)$/, (_m, pre) => `${pre}@${chosen} `))
    setSuggestionIndex(0)
  }

  /** Wraps setInput so typing resets the suggestion highlight to the top. */
  const handleInputChange = (next: string) => {
    setInput(next)
    setSuggestionIndex(0)
  }

  /** dir +1 = older entry, -1 = newer; -1 past the newest clears the line. */
  const navigateHistory = (dir: number) => {
    const hist = inputHistoryRef.current
    if (hist.length === 0) return
    if (dir === 1) histIndexRef.current = Math.min(histIndexRef.current + 1, hist.length - 1)
    else histIndexRef.current = Math.max(histIndexRef.current - 1, -1)
    const idx = histIndexRef.current
    replaceInput(idx === -1 ? '' : hist[hist.length - 1 - idx])
  }

  const addEntry = (entry: EntryInput) => {
    const id = idRef.current++
    setHistory((prev) => [...prev, { ...entry, id } as Entry])
  }

  const commitAssistant = (text: string) => {
    const toolCalls = turnToolCallsRef.current
    if (text.trim() || toolCalls.length > 0) {
      addEntry({ kind: 'assistant', text: text.trim(), toolCalls: [...toolCalls] })
    }
    turnToolCallsRef.current = []
  }

  const handleSlash = (raw: string): boolean => {
    const parsed = parseSlash(raw)
    if (!parsed) return false

    switch (parsed.name) {
      case 'help': {
        const lines = SLASH_COMMANDS.map(
          (c) => `  /${c.name}${c.args ? ' ' + c.args : ''} — ${c.description}`,
        ).join('\n')
        addEntry({ kind: 'system', text: `Commands:\n${lines}` })
        return true
      }
      case 'clear':
        messagesRef.current = []
        setUsage({ input: 0, output: 0, cacheRead: 0 })
        clearSession()
        idRef.current = 1
        setHistory([{ id: 0, kind: 'banner' }])
        return true
      case 'model':
        if (parsed.arg) {
          switchTo(provider, parsed.arg) // direct switch: /model <id>
        } else {
          setConfigFlow({ entry: 'model' }) // no arg → interactive flow
        }
        return true
      case 'provider': {
        if (parsed.arg) {
          const id = parsed.arg.toLowerCase()
          const p = PROVIDERS[id]
          if (!p) {
            addEntry({ kind: 'system', text: `Unknown provider. Options: ${Object.keys(PROVIDERS).join(', ')}` })
            return true
          }
          // Keep the current model if the target has no default (e.g. custom).
          switchTo(id, p.defaultModel || model)
        } else {
          setConfigFlow({ entry: 'provider' }) // no arg → interactive flow
        }
        return true
      }
      case 'yolo':
      case 'approve': {
        // Flip the approval gate. No rebuild — runStream passes needsApproval
        // as a per-call override, so the next turn picks up the new value.
        const next = !autoApprove
        setAutoApprove(next)
        addEntry({
          kind: 'system',
          text: next
            ? '⚠ Auto-approve ON — tools run without asking'
            : `Auto-approve OFF — approval required for ${APPROVAL_TOOLS.join(', ')}`,
        })
        return true
      }
      case 'skills': {
        if (skills.length === 0) {
          addEntry({
            kind: 'system',
            text: 'No skills loaded. Add SKILL.md folders under .agents/skills or .claude/skills (in this project or your home dir), or pass --skills <dir>.',
          })
        } else {
          const lines = skills.map((s) => `  • ${s.name} — ${s.description}`).join('\n')
          addEntry({ kind: 'system', text: `Skills (${skills.length}):\n${lines}\nThe agent loads one with the Skill tool when relevant.` })
        }
        return true
      }
      case 'forge': {
        if (!agentRef.current) {
          addEntry({ kind: 'system', text: 'No model is configured. Use /provider or /model first.' })
          return true
        }
        if (isProcessing) return true
        const desc = parsed.arg.trim()
        if (!desc) {
          addEntry({ kind: 'system', text: 'Usage: /forge <description> — e.g. /forge an agent that writes commit messages' })
          return true
        }
        // Drive the build via the `build-agent` skill (shipped built-in). We
        // send a normal message so the existing stream + approval flow applies:
        // file writes and host Bash (running the generated agent) prompt as usual.
        const prompt = `Use the build-agent skill to design, write, and test a new NanoCodana agent: ${desc}`
        addEntry({ kind: 'user', text: `/forge ${desc}` })
        messagesRef.current.push({ role: 'user', content: prompt })
        void runStream()
        return true
      }
      case 'cost': {
        const { input: inTok, output: outTok, cacheRead } = usage
        const cachedNote = cacheRead > 0 ? ` (${cacheRead.toLocaleString()} cached)` : ''
        addEntry({
          kind: 'system',
          text: `Tokens this session — input: ${inTok.toLocaleString()}${cachedNote}, output: ${outTok.toLocaleString()}, total: ${(inTok + outTok).toLocaleString()}`,
        })
        return true
      }
      case 'exit':
      case 'quit':
        exit()
        return true
      default:
        addEntry({ kind: 'system', text: `Unknown command: /${parsed.name} — try /help` })
        return true
    }
  }

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isProcessing) return

    // Enter accepts the highlighted @file suggestion instead of sending, when
    // the list is open. ink-text-input owns Enter and calls this handler, so
    // intercepting here is the reliable way to repurpose it.
    if (suggesting) {
      acceptSuggestion()
      return
    }

    const submitted = value.trim()
    setInput('')

    // Record in command history (↑/↓), skipping consecutive duplicates.
    const hist = inputHistoryRef.current
    if (hist[hist.length - 1] !== submitted) hist.push(submitted)
    histIndexRef.current = -1

    // Slash commands and exit work even without an agent, so the user can
    // /provider or /model their way out of an unconfigured state.
    if (submitted.startsWith('/')) {
      handleSlash(submitted)
      return
    }
    if (['exit', 'quit'].includes(submitted.toLowerCase())) {
      exit()
      return
    }

    // Sending an actual message needs a built agent.
    if (!agentRef.current) {
      addEntry({
        kind: 'system',
        text: 'No model is configured. Use /provider or /model to set one (or check the API key).',
      })
      return
    }

    // Expand @file mentions: show the typed line, send inlined contents.
    const { text: expanded, attached } = resolveMentions(submitted, process.cwd())
    addEntry({ kind: 'user', text: submitted })
    if (attached.length > 0) {
      addEntry({ kind: 'system', text: `📎 Attached ${attached.length} file(s): ${attached.join(', ')}` })
    }
    messagesRef.current.push({ role: 'user', content: expanded })
    await runStream()
  }

  const handleApprovalDecision = async (approved: boolean) => {
    const approval = pendingApproval
    if (!approval || !agentRef.current) return
    // Record this decision. A single model step can request approval for
    // several tool calls at once; every one needs a response before the stream
    // can resume, or the next request fails with MissingToolResultsError.
    messagesRef.current.push({
      role: 'tool',
      content: [{ type: 'tool-approval-response', approvalId: approval.approvalId, approved }],
    })
    addEntry({ kind: 'system', text: `${approved ? '✓ Approved' : '✗ Denied'} ${approval.toolName}` })

    // Show the next queued approval, if any; only resume once all are answered.
    const rest = approvalQueueRef.current
    if (rest.length > 0) {
      const next = rest.shift()!
      setPendingApproval(next)
      return
    }
    setPendingApproval(null)
    await runStream()
  }

  const handleConfigComplete = (result: ConfigResult) => {
    setConfigFlow(null)
    // Store the key first so switchTo's build can resolve it; switchTo only
    // commits the provider/model state if the model actually resolves.
    if (result.apiKey) setApiKeyFor(result.provider, result.apiKey)
    // Persist the base URL (overwrite, so blank clears a stale one) — the global
    // base URL tracks the most recently chosen provider's endpoint.
    setBaseUrl(result.baseUrl ?? '')
    switchTo(result.provider, result.model)
  }

  const runStream = async () => {
    const agentInstance = agentRef.current
    if (!agentInstance) return
    setIsProcessing(true)
    setLiveText('')
    setLiveToolCalls([])
    turnToolCallsRef.current = []
    const controller = new AbortController()
    abortRef.current = controller

    let streamedText = ''
    // A single step can emit multiple tool-approval-requests; collect them all
    // so each gets a response (one missing response → MissingToolResultsError).
    const approvals: ApprovalRequest[] = []

    try {
      const result = await agentInstance.stream({
        messages: messagesRef.current,
        abortSignal: controller.signal,
        // Per-call overrides: the current model object and approval gate. Both
        // are stable references when unchanged, so core reuses the compiled
        // model/tools/agent from memory; a /model switch or /yolo toggle swaps
        // the reference and rebuilds only what changed.
        model: modelRef.current,
        needsApproval: autoApprove ? NO_APPROVAL : APPROVAL_TOOLS,
      } as any)

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          streamedText += chunk.text
          setLiveText(streamedText)
        } else if (chunk.type === 'tool-call') {
          turnToolCallsRef.current.push({ name: chunk.toolName, params: chunk.input ?? {} })
          setLiveToolCalls([...turnToolCallsRef.current])
        } else if (chunk.type === 'tool-result') {
          const pending = turnToolCallsRef.current.find(
            (t) => t.name === chunk.toolName && t.result === undefined,
          )
          if (pending) pending.result = chunk.output
          setLiveToolCalls([...turnToolCallsRef.current])
        } else if (chunk.type === 'tool-approval-request') {
          approvals.push({
            approvalId: chunk.approvalId,
            toolName: chunk.toolCall.toolName,
            input: chunk.toolCall.input,
          })
        } else if (chunk.type === 'error') {
          // Aborts and stream failures can surface as an error part rather
          // than rejecting the iterator. Route it to the catch below.
          throw (chunk as any).error ?? new Error('stream error')
        }
      }

      const response = await result.response
      if (response?.messages) messagesRef.current.push(...response.messages)

      // Persist the conversation so `--continue` can resume it.
      saveSession(messagesRef.current)

      // Accumulate token usage for /cost and the footer. inputTokens is the
      // TOTAL input (cache reads folded in); the cached share is shown as a
      // percentage — tokens only, no dollar estimates.
      try {
        const u = await result.totalUsage
        if (u) {
          setUsage((prev) => ({
            input: prev.input + (u.inputTokens ?? 0),
            output: prev.output + (u.outputTokens ?? 0),
            cacheRead: prev.cacheRead + (u.inputTokenDetails?.cacheReadTokens ?? 0),
          }))
        }
      } catch {
        /* usage not always available */
      }

      if (approvals.length > 0) {
        // The approval-pending tools emitted tool-calls (no result yet) before
        // halting. Drop unfinished calls from the committed entry — each tool
        // re-emits with its result after approval, so keeping them here would
        // duplicate them in the transcript.
        turnToolCallsRef.current = turnToolCallsRef.current.filter((t) => t.result !== undefined)
        commitAssistant(streamedText)
        // Queue the rest; show the first. handleApprovalDecision advances the
        // queue and only resumes the stream once every request is answered.
        approvalQueueRef.current = approvals.slice(1)
        setPendingApproval(approvals[0])
      } else {
        const finalText = streamedText || (await result.text)
        commitAssistant(finalText)
      }
    } catch (error: any) {
      const aborted = error?.name === 'AbortError' || /abort/i.test(error?.message ?? '')
      // Preserve any text/tools produced before the interrupt.
      commitAssistant(streamedText)
      addEntry({
        kind: 'system',
        text: aborted ? '⏹ Interrupted' : `Error: ${error.message}`,
      })
    } finally {
      abortRef.current = null
      setIsProcessing(false)
      setLiveText('')
      setLiveToolCalls([])
    }
  }

  return (
    <Box flexDirection="column">
      <Static items={history}>
        {(entry) => <EntryView key={entry.id} entry={entry} model={model} mcpServers={mcpServerCount} />}
      </Static>

      {isProcessing && (
        <Box flexDirection="column">
          {liveToolCalls.map((tool, i) => (
            <ToolCall
              key={i}
              name={tool.name}
              params={tool.params}
              result={tool.result}
              isExecuting={tool.result === undefined}
            />
          ))}
          {liveText ? (
            <Box marginTop={1} flexDirection="column">
              <Markdown>{liveText}</Markdown>
            </Box>
          ) : (
            liveToolCalls.length === 0 && (
              <Box marginTop={1}>
                <Text color="green">
                  <Spinner type="dots" />
                </Text>
                <Text dimColor> Thinking… (Esc to interrupt)</Text>
              </Box>
            )
          )}
        </Box>
      )}

      {/* Approval takes over the composer so keystrokes are unambiguous. */}
      {pendingApproval && !isProcessing && (
        <ApprovalPrompt request={pendingApproval} onDecision={handleApprovalDecision} />
      )}

      {/* Interactive /model and /provider flow, also owns the composer. */}
      {configFlow && !isProcessing && !pendingApproval && (
        <ConfigFlow
          entry={configFlow.entry}
          currentProvider={provider}
          currentModel={model}
          onComplete={handleConfigComplete}
          onCancel={() => setConfigFlow(null)}
        />
      )}

      {composerActive && (
        <Box marginTop={1}>
          <Box marginRight={1}>
            <Text bold color="blue">
              ›
            </Text>
          </Box>
          <TextInput
            key={inputKey}
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder='Ask anything · /help for commands · "exit" to quit'
          />
        </Box>
      )}

      {composerActive && suggesting && (
        <Box flexDirection="column" marginLeft={2}>
          {suggestions.map((file, i) => {
            const active = i === Math.min(suggestionIndex, suggestions.length - 1)
            return (
              <Text key={i} color={active ? 'cyan' : undefined} dimColor={!active}>
                {active ? '❯ ' : '  '}@{file}
              </Text>
            )
          })}
          <Text dimColor>  ↑/↓ to select · Enter or Tab to insert</Text>
        </Box>
      )}

      <StatusFooter
        model={model}
        cwd={process.cwd()}
        inputTokens={usage.input}
        outputTokens={usage.output}
        cacheReadTokens={usage.cacheRead}
        autoApprove={autoApprove}
      />
    </Box>
  )
}

function EntryView({
  entry,
  model,
  mcpServers,
}: {
  entry: Entry
  model: string
  mcpServers: number
}) {
  switch (entry.kind) {
    case 'banner':
      return <Header version="0.1.0" model={model} mcpServers={mcpServers} cwd={process.cwd()} />
    case 'user':
      return <Message role="user" content={entry.text} />
    case 'system':
      return <Message role="system" content={entry.text} />
    case 'assistant':
      return (
        <Box flexDirection="column">
          {entry.toolCalls.map((tool, i) => (
            <ToolCall key={i} name={tool.name} params={tool.params} result={tool.result} />
          ))}
          {entry.text ? <Message role="assistant" content={entry.text} /> : null}
        </Box>
      )
  }
}

# NanoCodana Architecture

## Overview

NanoCodana is a thin agent framework built around the Vercel AI SDK.

The design goal is simple:

- keep one core execution primitive: `stream()`
- let the AI SDK own the tool loop and stream semantics
- keep environment-specific behavior in adapters
- support both native tool models and models that need middleware adaptation

At the center of the system is `NanoCodana`, a wrapper around AI SDK `ToolLoopAgent`.

## Layers

```text
apps/*
  browser demos, Next.js app, Expo Snack app, CLI demo

packages/cli
  terminal UI built on NanoCodana.stream()

packages/adapters/*
  Node.js and browser environment wiring

packages/core
  NanoCodana wrapper, model preparation, default tools, MCP integration

ai / ToolLoopAgent
  streaming, tool loop, approvals, UI stream compatibility
```

## Core Agent

The core package exports `NanoCodana` from [packages/core/src/agent.ts](./packages/core/src/agent.ts).

`NanoCodana` is responsible for:

- preparing the model for agent use
- building the final tool set
- constructing the system prompt
- lazily connecting MCP servers
- delegating execution to `ToolLoopAgent`

It is intentionally not responsible for:

- custom stream orchestration
- custom approval protocols
- custom fallback execution loops for non-tool models

Those concerns now stay aligned with the AI SDK.

### Public contract

`NanoCodana` implements the AI SDK `Agent` interface and exposes:

- `generate(...)`
- `stream(...)`
- `tools`
- `id`

`stream(...)` is the canonical public API. It returns the AI SDK `StreamTextResult`, which makes NanoCodana directly usable with:

- `toUIMessageStreamResponse()`
- `toUIMessageStream()`
- `DirectChatTransport`
- `useChat`

## Tool Loop

NanoCodana no longer owns a bespoke “execute” lifecycle. The runtime behavior comes from AI SDK `ToolLoopAgent`.

That means:

- the model emits tool calls
- tools execute through AI SDK tool definitions
- tool results are fed back into the next step
- the loop stops when the model finishes, a stop condition is met, or an approval boundary is hit

This keeps NanoCodana close to the upstream AI SDK behavior instead of maintaining a separate event model.

## Model Preparation

Model preparation lives in [packages/core/src/model-preparation.ts](./packages/core/src/model-preparation.ts).

The core accepts:

- `model`
- optional `modelId`
- optional `toolMiddleware`

Behavior:

- if the model already supports tool calling, it passes through unchanged
- if `toolMiddleware` is set, the model is wrapped with `wrapLanguageModel(...)`
- if `toolMiddleware: 'auto'` is used, NanoCodana picks a parser middleware based on the model ID heuristic

This replaces the old `supportsTools: false` flow. The fallback is no longer a custom structured-output loop in NanoCodana itself.

## Tool System

NanoCodana keeps the previous tool-centered design, but the tools are now exposed to AI SDK directly.

### Shared tool shape

Shared tool definitions live in [packages/core/src/types.ts](./packages/core/src/types.ts).

Each tool carries:

- `name`
- `description`
- optional `compactDescription`
- `parameters`
- optional `needsApproval`
- `execute`

### Built-in tools

The core contributes:

- in-memory filesystem tools when initial files or browser-style storage is needed
- `TodoWrite`
- MCP tool registration once connected

The Node adapter adds environment-native tools such as:

- `Read`
- `Write`
- `Edit`
- `MultiEdit`
- `Delete`
- `Glob`
- `Grep`
- `LS`
- `Bash`
- `WebFetch`

The browser adapter adds:

- memory-backed tools for ephemeral sessions
- IndexedDB-backed tools for persistent sessions

## System Prompt

System prompt construction lives in [packages/core/src/system-prompt.ts](./packages/core/src/system-prompt.ts).

The prompt remains a NanoCodana responsibility because it depends on:

- the final available tool set
- compact vs normal descriptions
- the coding-agent behavioral defaults of the project

This keeps tool descriptions and default agent instructions centralized even though execution is delegated to `ToolLoopAgent`.

## MCP Integration

MCP management stays in the core:

- config parsing
- client lifecycle
- lazy connection
- conversion of MCP tools into the final tool set

The MCP manager is only activated if servers are configured. That avoids paying connection cost in simpler all-client or single-provider use cases.

## Approval Flow

NanoCodana intentionally follows AI SDK approval semantics.

Flow:

1. A tool declares `needsApproval`.
2. The current run emits `tool-approval-request`.
3. The run stops at that boundary.
4. The caller submits a `tool-approval-response` in the next tool message.
5. A later `stream()` call resumes the conversation.

This is the same model used by AI SDK UI and `useChat`, so there is no custom blocking approval API in the core.

## Adapters

### Browser adapter

[packages/adapters/browser/src/index.ts](./packages/adapters/browser/src/index.ts)

Responsibilities:

- choose memory or IndexedDB-backed storage
- build browser-safe filesystem/search tools
- seed initial files
- instantiate `NanoCodana` with the prepared tool/model bundle

### Node adapter

[packages/adapters/nodejs/src/index.ts](./packages/adapters/nodejs/src/index.ts)

Responsibilities:

- bind the real filesystem
- add bash, web fetch, and grep — ripgrep when a binary resolves (the `@vscode/ripgrep` optionalDependency, else a system `rg`), an ignore-aware JS search otherwise
- watch file changes when requested
- pass MCP config through to the core

Adapters do not own the agent loop. They only assemble environment-specific capabilities around the shared core.

## Integration Modes

### All-server

The app calls `agent.stream()` directly on the backend and consumes the stream or final text in-process.

Best for:

- workers
- scripts
- backend jobs
- services without a live browser client

### All-client

The model runs directly in the browser or local runtime. NanoCodana can either:

- stream directly to local application code, or
- plug into AI SDK UI with `DirectChatTransport`

Best for:

- browser-local demos
- WebLLM usage
- private in-device workflows

### Server-client

The browser UI uses `useChat`, but the model runs on the server. The server route calls `agent.stream()` and returns `toUIMessageStreamResponse(...)`.

Best for:

- hosted web apps
- apps that need server-side provider keys
- shared production chat UIs

## Apps Folder

The example applications were moved from `examples/` to `apps/` so the repo structure matches the role they play in the workspace.

Current apps:

- [apps/web](./apps/web)
- [apps/nextjs](./apps/nextjs)
- [apps/sharables](./apps/sharables)
- [apps/node](./apps/node)

## Tradeoffs

This architecture intentionally favors alignment with the AI SDK over a thicker NanoCodana-specific abstraction.

Benefits:

- less custom execution code to maintain
- direct compatibility with AI SDK UI transport primitives
- one streaming model across browser, server, and direct-transport usage
- approval flow stays consistent with upstream AI SDK behavior

Costs:

- local consumers must understand AI SDK stream consumption
- non-native tool models depend on middleware quality
- some higher-level convenience behavior is left to apps instead of the core

That tradeoff is deliberate. NanoCodana is now the environment-aware coding wrapper around the AI SDK agent model, not a parallel execution framework.

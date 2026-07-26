# @nanocodana/cli

`codana` — a terminal coding agent built on
[NanoCodana](https://github.com/nanocodana/nanocodana). It reads, writes, edits,
searches, and runs code in your project, asks before touching anything risky, and
works with any model the [Vercel AI SDK](https://sdk.vercel.ai) supports.

```bash
npm install -g @nanocodana/cli
codana chat
```

## Usage

```bash
codana chat                 # start chatting in the current directory
codana chat --continue      # resume the last conversation here
codana chat --yolo          # auto-approve all tools (sandboxes only)
```

Configure providers once — keys are stored on disk, per provider:

```bash
codana config --provider anthropic --api-key sk-ant-...
codana config --provider openai    --api-key sk-...
codana config --provider custom    --base-url https://openrouter.ai/api/v1 --api-key sk-or-...
```

## In a session

| | |
|---|---|
| `/model` · `/provider` | switch model, or pick provider + base URL + key interactively |
| `/skills` | list the Agent Skills it discovered |
| `/cost` | token usage for the session |
| `/yolo` | toggle auto-approval |
| `/clear` · `/help` · `/exit` | |

Type `@` to reference project files — the agent gets the path, not a paste.

## Agent Skills

Skills load from `~/.agents/skills`, `~/.claude/skills`, and the same directories
in your project (project wins; `--skills <dir>` adds more). If you already keep
skills for Claude Code, `codana` picks them up unchanged.

## Approvals

Risky tools prompt before running, and escalating from the sandboxed shell to
your **host** shell always asks. `--yolo` skips all of it — good for throwaway
containers, bad for anything you care about.

## Size

`codana` installs **36 MB across 50 packages**. Almost everything it uses — the
TUI, the AI SDK, the agent, the whole shell — is compiled into a single 6.2 MB
file at publish time, so it does not appear in your tree as dependencies. What
remains are the payloads a bundler cannot inline: wasm, native addons and the
`rg` binary.

Three of those are optional:

```bash
npm install -g @nanocodana/cli --omit=optional   # 36 MB -> 27 MB, 50 -> 8 packages
```

That costs `tar -J`, `tar --zstd`, and native-speed grep (which falls back to a
JS implementation). Everything else — including `sqlite3`, `python3` and
`js-exec`, which `codana` enables by default — keeps working.

Of the 27 MB that remains, 12 MB is CPython for `python3`. Deleting
`node_modules/@nanocodana/cli/vendor/` removes it if you never use `python3`.

For the underlying library's footprint, see
[`@nanocodana/nodejs`](https://www.npmjs.com/package/@nanocodana/nodejs#install-size).

**Docs:** <https://nanocodana.github.io/docs/cli/> · MIT

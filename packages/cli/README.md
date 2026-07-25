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

**Docs:** <https://nanocodana.github.io/docs/cli/> · MIT

# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's
[private vulnerability reporting](https://github.com/nanocodana/nanocodana/security/advisories/new)
(Security → Report a vulnerability). Include what you can: affected package and
version, a reproduction, and the impact you see.

Expect an acknowledgement within a few days. Fixes ship as a patch release, and
we'll credit you unless you'd rather stay anonymous.

## Supported versions

NanoCodana is pre-1.0. Security fixes land on the latest published version of
each `@nanocodana/*` package; older versions are not patched.

## What NanoCodana does — and what that means for you

This is a framework for running an **agent that executes code and modifies
files**. Some of its risk is inherent to that job, so it's worth being explicit:

- **The `Bash` tool is real.** It runs sandboxed by default, but it can escalate
  to your host shell (`host: true`). Escalation always requires approval — do not
  disable that gate for untrusted input.
- **`needsApproval` is your seatbelt.** With no approval policy, an agent with
  `Write`/`Edit`/`Delete` can change any file under its working directory.
  `--yolo` (CLI) and an empty `needsApproval` remove that protection deliberately.
- **`workingDirectory` is the boundary** for the Node adapter's file tools. Point
  it at a workspace, never at your home directory or trusted source.
- **Prompt injection is a live threat.** Content the agent reads — files, web
  pages, MCP tool output — is untrusted data, not instructions. If you build a
  product on this, keep approval gates on the destructive tools.
- **Keys are yours to hold.** `@nanocodana/browser` calls providers directly
  from the tab so keys stay on the user's machine; nothing is proxied through us.
  There is no telemetry.

If you find a way to bypass one of these boundaries — approval gating, the
sandbox, or the working-directory root — that's a vulnerability. Please report it.

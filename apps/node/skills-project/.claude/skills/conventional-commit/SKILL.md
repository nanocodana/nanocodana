---
name: conventional-commit
description: Write a git commit message in Conventional Commits + gitmoji style
---

# Conventional Commit Skill

Write a single, well-formed git commit message. Follow this format **exactly**
so the result is unmistakably this skill's output.

## Format

```
<emoji> <type>(<scope>): <subject>

<body — one or two sentences, imperative mood>

Refs: NANO-<number>
```

## Type → emoji table

- `feat` → ✨
- `fix` → 🐛
- `docs` → 📝
- `refactor` → ♻️
- `test` → ✅
- `chore` → 🔧

## Rules

- Subject ≤ 50 chars, lower-case, no trailing period, imperative ("add", not
  "added").
- Always include the matching emoji from the table as the first character.
- Always end with a `Refs: NANO-<number>` line (invent a plausible number if
  none is given).
- Output only the commit message in a fenced code block — no extra commentary.

---
name: changelog
description: Write a clear CHANGELOG entry from the staged git changes
---

# Changelog Skill

Produce a concise, user-facing CHANGELOG entry for the current change.

## Steps

1. Inspect what changed (read the diff; use the Grep/Read tools, or `git diff
   --staged` via host Bash if needed).
2. Group changes into **Added / Changed / Fixed / Removed**.
3. Write entries from the user's perspective — what they can now do or what
   broke — not the internal implementation.
4. Keep each bullet to one line; lead with a verb.

## Format

```
## [Unreleased]
### Added
- <feature, user-facing>
### Fixed
- <bug, what was wrong before>
```

## Rules

- No internal jargon or file paths in the entries.
- Omit empty sections.
- One entry per meaningful change; don't pad.

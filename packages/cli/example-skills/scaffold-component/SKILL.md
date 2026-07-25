---
name: scaffold-component
description: Scaffold a new React component (tsx + test + index) from a name
---

# Scaffold Component Skill

Create a new React component with a consistent file layout, instead of writing
each file by hand.

This skill ships a helper script alongside it. When this skill is loaded, the
note `(This skill's files are at: <dir>)` tells you the absolute directory the
script lives in — use that path to run it.

## Steps

1. Ask the user (or infer) the component **name** in PascalCase, e.g. `UserCard`,
   and the **target directory** (default: `src/components`).
2. Run the bundled scaffolder with host Bash:

   ```
   node "<skill-dir>/scaffold.mjs" <ComponentName> [targetDir]
   ```

   `<skill-dir>` is the path from the load note above. Example:

   ```
   node "/Users/me/.claude/skills/scaffold-component/scaffold.mjs" UserCard src/components
   ```

3. The script creates three files and prints what it wrote:
   - `<targetDir>/<Name>/<Name>.tsx`     — the component
   - `<targetDir>/<Name>/<Name>.test.tsx` — a starter test
   - `<targetDir>/<Name>/index.ts`        — a re-export barrel
4. Read back the generated `.tsx` and adjust props/markup to the user's request.

## Rules

- Never overwrite an existing component directory — the script exits with an
  error if `<targetDir>/<Name>` already exists; report that to the user instead
  of forcing it.
- Keep the component a function component with typed props.
- After scaffolding, summarize the created files as relative paths.

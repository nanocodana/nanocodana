# Sample project with a project-local skill

This directory is a stand-in for "your project." It contains a skill at:

```
.claude/skills/conventional-commit/SKILL.md
```

The point of the demo (`apps/node/project-skills-demo.js`) is that the agent is
created with **no skills passed in** — just a `workingDirectory` pointing here:

```js
NodeAgent({ model, workingDirectory: '.../skills-project' })
```

Core auto-discovers `.agents/skills` and `.claude/skills` relative to the
working directory, registers a `Skill` tool, and the model loads the skill on
its own when a task matches. Drop a `SKILL.md` folder in here and it's picked
up — zero configuration.

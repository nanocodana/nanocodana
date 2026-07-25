# NanoCodana Node Example

Example scripts using the Node.js adapter (`@nanocodana/nodejs`): a basic chat
loop plus the skills, project-skills, image-generation, and Forge demos.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file from the example:
```bash
cp .env.example .env
```

3. Edit `.env` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=your_actual_api_key
```

## Run

```bash
npm start
```

## Skills demo

`skills-demo.js` shows the agent deciding **on its own** to load a skill. You
describe a task in plain language — you never name the skill — and the agent
matches it against the skill catalog and calls the `Skill` tool to pull in that
skill's instructions before acting.

```bash
npm run skills-demo
```

It loads the bundled example skills (`packages/cli/example-skills`: `changelog`,
`scaffold-component`, `build-agent`) plus any skills under `~/.agents/skills`,
`~/.claude/skills`, and the same dirs in the project. Then try:

```
You: Make a new React component called UserCard in src/components
↳ Skill("scaffold-component")   ← the agent chose to load a skill
↳ Bash(node .../scaffold.mjs UserCard src/components)   (asks approval)
```

The `↳ Skill(name)` line is the moment to watch: the model pulled the skill's
full instructions into context, then followed them to run the skill's bundled
script.

## Project-skills demo (zero config)

`project-skills-demo.js` shows the **headline** skills feature: an agent built
with **no skills passed in** — just a `workingDirectory` — auto-discovers skills
from `.agents/skills` / `.claude/skills` in that directory. Drop a `SKILL.md`
folder in, and it's picked up.

```bash
npm run project-skills-demo
# You: Write a commit message for adding a dark mode toggle to settings
```

## Image-generation demo

`image-demo.js` shows the agent **generating images** and writing them to disk.
Two models, two jobs: a text model (Anthropic or OpenAI, from your `.env`) does
the reasoning, and an **OpenAI image model** makes the pictures. Setting
`imageModel` on the agent exposes a `GenerateImage` tool the agent calls on its
own — you just describe what you want and where to save it.

```bash
npm run image-demo
# You: Generate a minimalist orange monkey mascot logo and save it to logo.png
```

```
↳ GenerateImage → logo.png  (size 1024x1024)
   "a minimalist orange monkey mascot logo, flat vector, clean lines"
✓ Saved logo.png — here's what I made.
```

Requires `OPENAI_API_KEY` in `.env` (the image model is OpenAI's). Files land in
`image-workspace/` (git-ignored). Defaults to the `gpt-image-1` model — set
`NANOCODANA_IMAGE_MODEL_ID=dall-e-3` if your account doesn't have access to it.

## Forge — an agent that builds agents

`forge-demo.js` is the most self-referential demo: a NanoCodana agent whose job
is to **design, write, and test brand-new NanoCodana agents**. You describe the
agent you want; Forge loads the `build-agent` skill for the recipe, scaffolds a
runnable `NodeAgent` script into `forge-workspace/`, runs it to verify, and
iterates until it works.

```bash
npm run forge
# You: Build an agent that summarizes a text file into three bullet points
```

What you'll see:

```
↳ Skill("build-agent")              ← loads the recipe
↳ Write("summarizer.mjs")           ← scaffolds the agent   (asks approval)
↳ Bash node summarizer.mjs ...      ← tests it on real input (asks approval)
✓ Built summarizer — here's how to run it.
```

The generated agent runs via host Bash, which inherits this process's
environment (so the child gets the API key) and resolves `@nanocodana/nodejs`
from this app's `node_modules`. Generated agents land in `forge-workspace/`
(git-ignored). It demonstrates the whole framework at once: skills, file tools,
the approval gate, and host-Bash escalation.

## Features

- Interact with files in your current working directory
- Real-time file change notifications
- Full tool support (Read, Write, Edit, Delete, Glob, Grep)
- Streaming responses
- **MCP Integration**: Connected to CoinGecko API for cryptocurrency data

## Example Usage

### File Operations
```
You: List all TypeScript files in the src directory

You: Read the content of src/index.ts

You: Create a new file called test.txt with "Hello World"

You: Search for the word "import" in all files
```

### CoinGecko MCP Tools
The agent has access to CoinGecko's cryptocurrency tools via MCP:
```
You: What's the current price of Bitcoin?

You: Get the market data for Ethereum

You: Show me the top 10 cryptocurrencies by market cap
```

# NanoCodana Testbed

Small runnable surfaces for exercising NanoCodana without changing the main demos.

## Node Agent Script

Runs the Node adapter directly against a cheap OpenAI model using
`OPENAI_API_KEY` from the repo root `.env`.

```bash
npm run openai:node -w apps/testbed -- "List the files in this directory."
```

Runs the Node adapter directly against Ollama Cloud using `OLLAMA_API_KEY`
from the repo root `.env`.

```bash
npm run ollama:node -w apps/testbed -- "List the files in this directory."
```

## Server-Client Chat

Runs a Next.js app where the client uses `useChat` and the server route uses
`NodeAgent`.

```bash
npm run dev -w apps/testbed
```

Optional environment variables:

- `TESTBED_OPENAI_MODEL`: defaults to `gpt-4o-mini`
- `TESTBED_OLLAMA_MODEL`: defaults to `gpt-oss:20b-cloud`
- `TESTBED_OLLAMA_HOST`: defaults to `https://ollama.com`
- `TESTBED_WORKDIR`: defaults to the shell cwd via `INIT_CWD`

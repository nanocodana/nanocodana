import { ToolFileSystem, formatReadOutput } from './storage/tool-fs.js'
import {
  createBashTool,
  createDeleteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createLsTool,
  createMultiEditTool,
  createReadTool,
  createWriteTool
} from './tools/index.js'
import type { Sandbox, Tool, VirtualShellOptions } from './types.js'

const textEncoder = new TextEncoder()

export type DefaultToolBackend =
  | { fs: ToolFileSystem; virtualBash?: boolean | VirtualShellOptions }
  | { sandbox: Sandbox; virtualBash?: boolean | VirtualShellOptions }

// The shell is dynamic-imported only inside Bash.execute. This file must NOT
// import it statically — otherwise bundlers pull it into the main chunk whether
// or not the user ever calls Bash. `BashInstance` is a structural type rather
// than a type-import for the same reason: some bundlers treat even a type-only
// import as a runtime reference.
type BashInstance = {
  exec: (
    command: string,
    options?: { signal?: AbortSignal }
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
}

async function readSandboxContent(sandbox: Sandbox, path: string): Promise<string> {
  if (sandbox.readFileToBuffer) {
    const buffer = await sandbox.readFileToBuffer({ path })
    if (!buffer) {
      throw new Error(`File not found: ${path}`)
    }

    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    return new TextDecoder().decode(bytes)
  }

  if (!sandbox.readFile) {
    throw new Error('Sandbox must provide readFile or readFileToBuffer')
  }

  const result = await sandbox.readFile({ path })
  if (!result) {
    throw new Error(`File not found: ${path}`)
  }

  if (result instanceof Uint8Array) {
    return new TextDecoder().decode(result)
  }

  if (result instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(result))
  }

  const arrayBuffer = await new Response(result).arrayBuffer()
  return new TextDecoder().decode(new Uint8Array(arrayBuffer))
}

function createFsTools(
  fs: ToolFileSystem,
  virtualBash: boolean | VirtualShellOptions
): Record<string, Tool> {
  const shellOptions: VirtualShellOptions =
    typeof virtualBash === 'object' && virtualBash !== null ? virtualBash : {}

  // Cached Bash instance promise — first call to Bash.execute resolves it
  // (loading the shell chunk), subsequent calls hit the cache. When virtualBash
  // is false this closure is never reached, so a code-splitting bundler never
  // *fetches* the chunk. It is still present in the build: no bundler can drop a
  // reachable dynamic import based on a runtime flag.
  //
  // './shell/bundle.js' is the vendored, Node-free build of just-bash generated
  // by build/bundle-shell.mjs. Importing just-bash directly here would reintroduce
  // its static node:zlib import, which prevents the module from loading at all on
  // workerd and in strict bundlers.
  let bashPromise: Promise<BashInstance> | undefined
  function getBash(): Promise<BashInstance> {
    if (!bashPromise) {
      bashPromise = import('./shell/bundle.js').then(
        (mod) =>
          new mod.Bash({
            // Caller options first, so fs/cwd can never be overridden — the tool
            // is scoped to this filesystem and working directory by contract.
            ...shellOptions,
            fs: fs.rawFs,
            cwd: fs.cwd
          }) as unknown as BashInstance
      )
    }
    return bashPromise
  }

  const tools: Record<string, Tool> = {
    Read: createReadTool(async ({ path, offset, limit }) => {
      return await fs.read(path, offset, limit)
    }),

    Write: createWriteTool(async ({ path, content }) => {
      await fs.write(path, content)
      return `Successfully wrote to ${path}`
    }),

    Edit: createEditTool(async ({ path, oldText, newText, replaceAll }) => {
      await fs.edit(path, oldText, newText, replaceAll)
      return `Successfully replaced text in ${path}`
    }),

    MultiEdit: createMultiEditTool(async ({ file_path, edits }) => {
      await fs.multiEdit(file_path, edits)
      return `Successfully applied ${edits.length} edit(s) to ${file_path}`
    }),

    Delete: createDeleteTool(async ({ path }) => {
      await fs.delete(path)
      return `Successfully deleted ${path}`
    }),

    Glob: createGlobTool(async ({ pattern, path }) => {
      return await fs.glob(pattern, path)
    }),

    Grep: createGrepTool(async ({ pattern, filePattern, caseSensitive }) => {
      const results = await fs.grep(pattern, filePattern, caseSensitive)
      return results.map(r => ({
        file: r.file,
        line: r.line,
        content: r.content,
        match: r.content
      }))
    }),

    LS: createLsTool(async ({ path, ignore }) => {
      return await fs.ls(path || '', ignore)
    })
  }

  if (virtualBash) {
    tools.Bash = createBashTool(
      async (params) => {
        if (params.run_in_background) {
          return {
            stdout: '',
            stderr: 'Background execution is not supported by the default in-memory Bash tool.',
            exitCode: 1
          }
        }

        const bash = await getBash()
        const controller = new AbortController()
        const timer =
          params.timeout && params.timeout > 0
            ? setTimeout(() => controller.abort(), params.timeout)
            : undefined

        try {
          const result = await bash.exec(params.command, { signal: controller.signal })
          return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
          }
        } finally {
          if (timer) clearTimeout(timer)
        }
      },
      {
        description: `Executes bash commands in an in-memory virtual workspace shared with the other file tools.

Usage notes:
- Commands run against the same in-memory files used by Read, Write, Edit, Delete, Grep, Glob, and LS
- This tool has no direct disk access in the default core configuration
- Prefer Read, Grep, Glob, and LS for structured file inspection when possible
- Background execution is not supported by this backend`,
        compactDescription: 'Runs bash in the shared in-memory workspace.',
        needsApproval: false
      }
    )
  }

  return tools
}

function createSandboxTools(sandbox: Sandbox): Record<string, Tool> {
  return {
    Bash: createBashTool(
      async ({ command, timeout, run_in_background }) => {
        if (run_in_background) {
          return {
            stdout: '',
            stderr: 'Background execution is not supported by the sandbox backend.',
            exitCode: 1
          }
        }

        const controller = new AbortController()
        const timer =
          timeout && timeout > 0
            ? setTimeout(() => controller.abort(), timeout)
            : undefined

        try {
          const result = await sandbox.runCommand('bash', ['-lc', command], {
            signal: controller.signal
          })

          return {
            stdout: await result.stdout(),
            stderr: await result.stderr(),
            exitCode: result.exitCode ?? 0
          }
        } finally {
          if (timer) clearTimeout(timer)
        }
      },
      {
        description: 'Executes bash commands inside the provided sandbox backend.',
        compactDescription: 'Runs bash inside the provided sandbox.',
        needsApproval: false
      }
    ),

    Read: createReadTool(async ({ path, offset, limit }) => {
      const content = await readSandboxContent(sandbox, path)
      return formatReadOutput(content, offset, limit)
    }),

    Write: createWriteTool(async ({ path, content }) => {
      await sandbox.writeFiles([
        {
          path,
          content: textEncoder.encode(content)
        }
      ])
      return `Successfully wrote to ${path}`
    })
  }
}

/**
 * Creates default tools for either the shared in-memory filesystem backend
 * or a sandbox backend.
 *
 * `virtualBash` (default true) controls the in-memory Bash tool. Set it to false
 * to drop the tool and stop a code-splitting bundler fetching the shell chunk,
 * or pass a `VirtualShellOptions` object to configure the shell. The sandbox
 * backend always exposes its own Bash tool and ignores this.
 */
export function createDefaultTools(backend: DefaultToolBackend): Record<string, Tool> {
  const virtualBash = backend.virtualBash ?? true
  if ('sandbox' in backend) {
    return createSandboxTools(backend.sandbox)
  }

  return createFsTools(backend.fs, virtualBash)
}

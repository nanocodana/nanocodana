#!/usr/bin/env node
// Bundled helper for the `scaffold-component` skill. The agent runs this via
// host Bash using the skill's `path` (surfaced when the Skill tool is loaded):
//   node "<skill-dir>/scaffold.mjs" <ComponentName> [targetDir]
//
// Self-contained: Node built-ins only, no dependencies.
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const [, , rawName, targetDir = 'src/components'] = process.argv

if (!rawName) {
  console.error('Usage: node scaffold.mjs <ComponentName> [targetDir]')
  process.exit(1)
}

// Normalize to PascalCase so the output is consistent regardless of input.
const name = rawName
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .split(' ')
  .filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join('')

if (!name) {
  console.error(`Invalid component name: "${rawName}"`)
  process.exit(1)
}

const dir = join(targetDir, name)

// Never clobber an existing component directory.
try {
  await access(dir)
  console.error(`Refusing to overwrite: ${dir} already exists.`)
  process.exit(1)
} catch {
  /* doesn't exist — good, proceed */
}

const component = `interface ${name}Props {
  /** TODO: describe the props for ${name}. */
  children?: React.ReactNode
}

export function ${name}({ children }: ${name}Props) {
  return <div className="${name.toLowerCase()}">{children}</div>
}
`

const test = `import { render, screen } from '@testing-library/react'
import { ${name} } from './${name}'

describe('${name}', () => {
  it('renders its children', () => {
    render(<${name}>hello</${name}>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
`

const barrel = `export { ${name} } from './${name}'
`

await mkdir(dir, { recursive: true })
const files = [
  [join(dir, `${name}.tsx`), component],
  [join(dir, `${name}.test.tsx`), test],
  [join(dir, 'index.ts'), barrel],
]
await Promise.all(files.map(([path, content]) => writeFile(path, content, 'utf8')))

console.log(`Scaffolded ${name}:`)
for (const [path] of files) console.log(`  + ${path}`)

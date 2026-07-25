// Offline render smoke test — exercises the new render components without any
// API call. Run: node smoke.test.mjs  (from packages/cli, after build)
import React from 'react'
import { render } from 'ink-testing-library'
import { Markdown } from './dist/components/Markdown.js'
import { Diff } from './dist/components/Diff.js'
import { ToolCall } from './dist/components/ToolCall.js'
import { Header } from './dist/components/Header.js'
import { ApprovalPrompt } from './dist/components/ApprovalPrompt.js'
import { parseSlash, SLASH_COMMANDS } from './dist/commands/slash.js'
import { StatusFooter } from './dist/components/StatusFooter.js'
import { listProjectFiles, activeMention, matchFiles, resolveMentions } from './dist/files.js'
import { ConfigFlow } from './dist/components/ConfigFlow.js'
import { getSelectableProviders, getProvider } from './dist/providers.js'
import { parseSkill, createSkillTool } from '@nanocodana/core'
import { loadSkillsFromDir } from '@nanocodana/nodejs'

const e = React.createElement
let failures = 0
function check(label, output, ...needles) {
  const ok = needles.every((n) => output.includes(n))
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) {
    failures++
    console.log('   output was:\n' + output.split('\n').map((l) => '   | ' + l).join('\n'))
  }
}

// 1. Markdown: heading, bold, inline code, list, fenced code block
{
  const md = [
    '# Title',
    '',
    'Some **bold** and `inline` text.',
    '',
    '- one',
    '- two',
    '',
    '```ts',
    'const x: number = 1',
    '```',
  ].join('\n')
  const { lastFrame } = render(e(Markdown, { children: md }))
  check('Markdown renders heading/list/code', lastFrame(), 'Title', 'one', 'two', 'const')
}

// 2. Diff: added + removed lines
{
  const { lastFrame } = render(
    e(Diff, { oldText: 'line a\nline b\n', newText: 'line a\nline B changed\n' }),
  )
  check('Diff shows +/-', lastFrame(), '+', '-')
}

// 3. ToolCall: Read (completed)
{
  const { lastFrame } = render(
    e(ToolCall, { name: 'Read', params: { path: 'src/index.ts' }, result: 'a\nb\nc' }),
  )
  check('ToolCall Read renders name+arg+summary', lastFrame(), 'Read', 'src/index.ts', 'Read 3 lines')
}

// 4. ToolCall: Edit (renders diff)
{
  const { lastFrame } = render(
    e(ToolCall, {
      name: 'Edit',
      params: { path: 'f.ts', oldText: 'foo', newText: 'bar' },
      result: 'ok',
    }),
  )
  check('ToolCall Edit renders diff', lastFrame(), 'Edit', 'f.ts')
}

// 5. ToolCall: Bash with non-zero exit
{
  const { lastFrame } = render(
    e(ToolCall, {
      name: 'Bash',
      params: { command: 'false' },
      result: { stdout: '', stderr: 'boom', exitCode: 1 },
    }),
  )
  check('ToolCall Bash shows exit code', lastFrame(), 'Bash', 'exit 1')
}

// 6. Header
{
  const { lastFrame } = render(
    e(Header, { version: '0.1.0', model: 'claude-sonnet-4-5', mcpServers: 2, cwd: '/tmp' }),
  )
  check('Header renders model + mcp', lastFrame(), 'NanoCodana', 'claude-sonnet-4-5', 'MCP')
}

// 7. ApprovalPrompt renders tool + Edit diff + Yes/No
{
  const { lastFrame } = render(
    e(ApprovalPrompt, {
      request: { approvalId: 'a1', toolName: 'Edit', input: { path: 'f.ts', oldText: 'foo', newText: 'bar' } },
      onDecision: () => {},
    }),
  )
  check('ApprovalPrompt renders Edit preview', lastFrame(), 'Allow Edit', 'f.ts', 'Yes', 'No')
}

// 8. ApprovalPrompt for Bash shows the command
{
  const { lastFrame } = render(
    e(ApprovalPrompt, {
      request: { approvalId: 'a2', toolName: 'Bash', input: { command: 'rm -rf /tmp/x' } },
      onDecision: () => {},
    }),
  )
  check('ApprovalPrompt renders Bash command', lastFrame(), 'Allow Bash', 'rm -rf /tmp/x')
}

// 9. Slash parsing
{
  const a = parseSlash('/model claude-sonnet-4-5')
  const b = parseSlash('/help')
  const c = parseSlash('not a slash')
  const ok =
    a && a.name === 'model' && a.arg === 'claude-sonnet-4-5' &&
    b && b.name === 'help' && b.arg === '' &&
    c === null &&
    SLASH_COMMANDS.some((x) => x.name === 'cost')
  console.log(`${ok ? '✓' : '✗'} parseSlash handles /model, /help, non-slash`)
  if (!ok) { failures++; console.log('   got:', JSON.stringify({ a, b, c })) }
}

// 10. StatusFooter renders model + tokens (tokens-only, no cost estimate)
{
  const { lastFrame } = render(
    e(StatusFooter, {
      model: 'claude-sonnet-4-5',
      cwd: '/tmp/myproject',
      inputTokens: 1200,
      outputTokens: 800,
    }),
  )
  check('StatusFooter renders model/cwd/tokens', lastFrame(), 'claude-sonnet-4-5', 'myproject', 'tok')
}

// 11. StatusFooter shows the cached share when cache reads are present
{
  const { lastFrame } = render(
    e(StatusFooter, {
      model: 'claude-sonnet-4-5',
      cwd: '/tmp/myproject',
      inputTokens: 10_000,
      outputTokens: 500,
      cacheReadTokens: 9_000,
    }),
  )
  const ok = lastFrame().includes('90% cached') && !lastFrame().includes('$')
  console.log(`${ok ? '✓' : '✗'} StatusFooter cached share, no dollar estimate`)
  if (!ok) { failures++; console.log('   output was:\n' + lastFrame()) }
}

// 12. listProjectFiles finds package.json, skips node_modules
{
  const files = listProjectFiles(process.cwd())
  const ok =
    files.includes('package.json') &&
    files.some((f) => f.startsWith('src/')) &&
    !files.some((f) => f.includes('node_modules'))
  console.log(`${ok ? '✓' : '✗'} listProjectFiles lists src, skips node_modules`)
  if (!ok) { failures++; console.log('   sample:', files.slice(0, 5)) }
}

// 13. activeMention + matchFiles
{
  const partial = activeMention('please read @src/comp')
  const noMention = activeMention('no mention here')
  const matches = matchFiles(['src/files.ts', 'src/pricing.ts', 'README.md'], 'pric')
  const ok = partial === 'src/comp' && noMention === null && matches.length === 1 && matches[0] === 'src/pricing.ts'
  console.log(`${ok ? '✓' : '✗'} activeMention + matchFiles`)
  if (!ok) { failures++; console.log('   got:', JSON.stringify({ partial, noMention, matches })) }
}

// 14b. Approval policy: a name list forces needsApproval, defers otherwise
{
  const { NanoCodana } = await import('@nanocodana/core')
  const agent = new NanoCodana({
    model: { specificationVersion: 'v2', provider: 'x', modelId: 'm' },
    initialFiles: [{ path: 'a.txt', content: 'hi' }],
    needsApproval: ['Bash', 'Write'],
  })
  const tools = agent.tools
  const bashGated = tools.Bash?.needsApproval === true
  const readNotGated = !tools.Read?.needsApproval
  console.log(`${bashGated && readNotGated ? '✓' : '✗'} approval policy gates Bash/Write, not Read`)
  if (!(bashGated && readNotGated)) {
    failures++
    console.log('   got:', { bash: tools.Bash?.needsApproval, read: tools.Read?.needsApproval })
  }
}

// 14c. StatusFooter shows the auto-approve marker
{
  const { lastFrame } = render(
    e(StatusFooter, { model: 'claude-haiku-4-5', cwd: '/tmp', inputTokens: 1, outputTokens: 1, autoApprove: true }),
  )
  check('StatusFooter shows auto-approve marker', lastFrame(), 'auto-approve')
}

// 14. resolveMentions inlines an existing file, ignores a bogus one
{
  const { text, attached } = resolveMentions('check @package.json and @nope/missing.ts', process.cwd())
  const ok = attached.includes('package.json') && !attached.some((a) => a.includes('missing')) && text.includes('Contents of `package.json`')
  console.log(`${ok ? '✓' : '✗'} resolveMentions inlines real file, skips missing`)
  if (!ok) { failures++; console.log('   attached:', attached) }
}

// 15. ConfigFlow (/model entry) shows the model-first menu
{
  const { lastFrame } = render(
    e(ConfigFlow, {
      entry: 'model',
      currentProvider: 'anthropic',
      currentModel: 'claude-sonnet-4-5',
      onComplete: () => {},
      onCancel: () => {},
    }),
  )
  check('ConfigFlow /model shows menu', lastFrame(), 'claude-sonnet-4-5', 'Change model', 'Change provider')
}

// 16. ConfigFlow (/provider entry) shows the provider-first menu
{
  const { lastFrame } = render(
    e(ConfigFlow, {
      entry: 'provider',
      currentProvider: 'anthropic',
      currentModel: 'claude-sonnet-4-5',
      onComplete: () => {},
      onCancel: () => {},
    }),
  )
  check('ConfigFlow /provider shows menu', lastFrame(), 'Anthropic', 'Change provider', 'Change model')
}

// 16b. Provider picker: OpenAI first, custom now selectable, and each native
// provider carries a default base URL used as the flow's placeholder.
{
  const sel = getSelectableProviders()
  const ids = sel.map((p) => p.id)
  const ok =
    ids[0] === 'openai' &&
    ids.includes('anthropic') &&
    ids.includes('custom') &&
    getProvider('openai').defaultBaseUrl?.includes('openai.com') &&
    getProvider('anthropic').defaultBaseUrl?.includes('anthropic.com')
  console.log(`${ok ? '✓' : '✗'} provider picker: OpenAI first, custom selectable, native default base URLs`)
  if (!ok) { failures++; console.log('   got:', JSON.stringify({ ids, oai: getProvider('openai').defaultBaseUrl, ant: getProvider('anthropic').defaultBaseUrl })) }
}

// 17. Skills: parse + tool + directory load
{
  const p = parseSkill('---\nname: csv\ndescription: do csv\n---\n# Body\nhi')
  const tool = createSkillTool([{ name: 'csv', description: 'do csv', instructions: 'STEP ONE' }])
  const loaded = await tool.execute({ name: 'csv' })
  const dirSkills = await loadSkillsFromDir(new URL('./example-skills', import.meta.url).pathname)
  const ok =
    p && p.name === 'csv' && p.instructions.includes('# Body') &&
    tool.description.includes('csv: do csv') &&
    loaded.includes('STEP ONE') &&
    dirSkills.some((s) => s.name === 'changelog')
  console.log(`${ok ? '✓' : '✗'} skills: parseSkill + Skill tool + loadSkillsFromDir`)
  if (!ok) { failures++; console.log('   got:', JSON.stringify({ p, desc: tool.description.slice(0, 40), loaded: loaded.slice(0, 40), dir: dirSkills.map((s) => s.name) })) }
}

// 18. FS auto-discovery: an agent registers the Skill tool from its OWN
// filesystem at .agents/skills / .claude/skills — the same on every platform.
// We seed an in-memory agent via initialFiles (the browser pattern). With no
// config skills, the Skill tool appears only AFTER discovery runs.
{
  const { NanoCodana } = await import('@nanocodana/core')
  const agent = new NanoCodana({
    model: { specificationVersion: 'v2', provider: 'x', modelId: 'm' },
    initialFiles: [
      { path: '.agents/skills/csv/SKILL.md', content: '---\nname: csv\ndescription: parse csv\n---\nParse CSV.' },
      { path: '.claude/skills/sql/SKILL.md', content: '---\nname: sql\ndescription: write sql\n---\nWrite SQL.' },
    ],
  })
  const before = !agent.tools.Skill // sync getter, pre-discovery, no config skills
  await agent.ensureSkills() // getAgent() invokes this before the first stream
  const skillTool = agent.tools.Skill
  const ok =
    before &&
    !!skillTool &&
    skillTool.description.includes('csv') &&
    skillTool.description.includes('sql')
  console.log(`${ok ? '✓' : '✗'} skills auto-discovered from agent FS (.agents/.claude)`)
  if (!ok) { failures++; console.log('   got:', JSON.stringify({ before, desc: skillTool?.description?.slice(0, 80) })) }
}

// 18b. Explicit config skills override a discovered skill of the same name.
{
  const { NanoCodana } = await import('@nanocodana/core')
  const agent = new NanoCodana({
    model: { specificationVersion: 'v2', provider: 'x', modelId: 'm' },
    initialFiles: [
      { path: '.claude/skills/sql/SKILL.md', content: '---\nname: sql\ndescription: DISK version\n---\nfrom disk' },
    ],
    skills: [{ name: 'sql', description: 'CONFIG version', instructions: 'from config' }],
  })
  await agent.ensureSkills()
  const desc = agent.tools.Skill?.description ?? ''
  const ok = desc.includes('CONFIG version') && !desc.includes('DISK version')
  console.log(`${ok ? '✓' : '✗'} config skill overrides discovered skill of same name`)
  if (!ok) { failures++; console.log('   got:', JSON.stringify({ desc: desc.slice(0, 80) })) }
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)

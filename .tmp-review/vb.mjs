const { NanoCodana } = await import('../packages/core/dist/index.js')
const stubModel = { specificationVersion: 'v2', provider: 'x', modelId: 'y', doGenerate: async()=>({}), doStream: async()=>({}) }
const a = new NanoCodana({ model: stubModel, virtualBash: { env: { NANOCODANA_PROBE: 'set-from-options' } }, files: { '/a.txt': 'hi\n' } })
const bash = a.tools?.Bash ?? (a.getTools && a.getTools().Bash)
console.log('has Bash:', !!bash)
const r = await bash.execute({ command: 'echo "[$NANOCODANA_PROBE]"' })
console.log('result:', JSON.stringify(r))

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { getProvider, getSelectableProviders } from '../providers.js'

/**
 * Interactive model/provider configuration flow, opened by /model and
 * /provider. Owns its own keyboard input; the main composer is hidden while
 * it's mounted.
 *
 * Entry points:
 *   /model    → menu: [Change model, Change provider]
 *   /provider → menu: [Change provider, Change model]
 *
 * "Change model"    → ask for a model id (for the current provider).
 * "Change provider" → select provider → enter API key → enter model id.
 */

type Step = 'menu' | 'model' | 'provider-select' | 'key' | 'base-url' | 'provider-model'

export interface ConfigResult {
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
}

interface ConfigFlowProps {
  entry: 'model' | 'provider'
  currentProvider: string
  currentModel: string
  onComplete: (result: ConfigResult) => void
  onCancel: () => void
}

const SELECTABLE = getSelectableProviders()

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
    {children}
  </Box>
)

export function ConfigFlow({ entry, currentProvider, currentModel, onComplete, onCancel }: ConfigFlowProps) {
  const menuOptions =
    entry === 'model'
      ? [
          { key: 'model', label: 'Change model' },
          { key: 'provider', label: 'Change provider' },
        ]
      : [
          { key: 'provider', label: 'Change provider' },
          { key: 'model', label: 'Change model' },
        ]

  const [step, setStep] = useState<Step>('menu')
  const [cursor, setCursor] = useState(0)
  const [selectedProvider, setSelectedProvider] = useState(currentProvider)
  const [keyValue, setKeyValue] = useState('')
  const [baseValue, setBaseValue] = useState('')
  const [modelValue, setModelValue] = useState('')

  useInput((_input, key) => {
    if (key.escape) {
      onCancel()
      return
    }
    if (step === 'menu') {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
      else if (key.downArrow) setCursor((c) => Math.min(menuOptions.length - 1, c + 1))
      else if (key.return) {
        const choice = menuOptions[cursor].key
        if (choice === 'model') setStep('model')
        else {
          setCursor(0)
          setStep('provider-select')
        }
      }
    } else if (step === 'provider-select') {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
      else if (key.downArrow) setCursor((c) => Math.min(SELECTABLE.length - 1, c + 1))
      else if (key.return) {
        setSelectedProvider(SELECTABLE[cursor].id)
        setStep('base-url')
      }
    }
    // Text steps (model / key / provider-model) are driven by TextInput's
    // onSubmit; only Esc is handled here.
  })

  if (step === 'menu') {
    const title =
      entry === 'model'
        ? `Model: ${currentModel}`
        : `Provider: ${getProvider(currentProvider).name} · model: ${currentModel}`
    return (
      <Frame>
        <Text bold color="cyan">{title}</Text>
        <Box marginTop={1} flexDirection="column">
          {menuOptions.map((o, i) => (
            <Text key={o.key} color={i === cursor ? 'cyan' : undefined} dimColor={i !== cursor}>
              {i === cursor ? '❯ ' : '  '}{o.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑/↓ select · Enter confirm · Esc cancel</Text>
        </Box>
      </Frame>
    )
  }

  if (step === 'provider-select') {
    return (
      <Frame>
        <Text bold color="cyan">Select a provider</Text>
        <Box marginTop={1} flexDirection="column">
          {SELECTABLE.map((p, i) => (
            <Text key={p.id} color={i === cursor ? 'cyan' : undefined} dimColor={i !== cursor}>
              {i === cursor ? '❯ ' : '  '}{p.name}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑/↓ select · Enter confirm · Esc cancel</Text>
        </Box>
      </Frame>
    )
  }

  if (step === 'model') {
    const prov = getProvider(currentProvider)
    return (
      <Frame>
        <Text bold color="cyan">Enter a model id for {prov.name}</Text>
        <Box marginTop={1}>
          <Box marginRight={1}>
            <Text color="blue">›</Text>
          </Box>
          <TextInput
            value={modelValue}
            onChange={setModelValue}
            placeholder={currentModel}
            onSubmit={(v) => onComplete({ provider: currentProvider, model: v.trim() || currentModel })}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to confirm · Esc cancel</Text>
        </Box>
      </Frame>
    )
  }

  if (step === 'key') {
    const prov = getProvider(selectedProvider)
    return (
      <Frame>
        <Text bold color="cyan">Enter the API key for {prov.name}</Text>
        <Text dimColor>Leave blank to keep the existing key{prov.envVar ? ` or use $${prov.envVar}` : ''}.</Text>
        <Box marginTop={1}>
          <Box marginRight={1}>
            <Text color="blue">›</Text>
          </Box>
          <TextInput
            value={keyValue}
            onChange={setKeyValue}
            mask="*"
            placeholder="sk-..."
            onSubmit={() => setStep('provider-model')}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue · Esc cancel</Text>
        </Box>
      </Frame>
    )
  }

  if (step === 'base-url') {
    const prov = getProvider(selectedProvider)
    // Native providers show their default endpoint as a hint (blank = use it);
    // the custom provider requires one and shows an example.
    const placeholder = prov.defaultBaseUrl || prov.examples?.[0]?.split(/\s{2,}/).pop() || 'https://your-endpoint/v1'
    return (
      <Frame>
        <Text bold color="cyan">Base URL for {prov.name}</Text>
        <Text dimColor>
          {prov.requiresBaseUrl
            ? 'Required for OpenAI-compatible providers.'
            : 'Leave blank to use the default endpoint.'}
        </Text>
        <Box marginTop={1}>
          <Box marginRight={1}>
            <Text color="blue">›</Text>
          </Box>
          <TextInput
            value={baseValue}
            onChange={setBaseValue}
            placeholder={placeholder}
            onSubmit={() => setStep('key')}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue · Esc cancel</Text>
        </Box>
      </Frame>
    )
  }

  if (step === 'provider-model') {
    const prov = getProvider(selectedProvider)
    return (
      <Frame>
        <Text bold color="cyan">Enter a model id for {prov.name}</Text>
        <Box marginTop={1}>
          <Box marginRight={1}>
            <Text color="blue">›</Text>
          </Box>
          <TextInput
            value={modelValue}
            onChange={setModelValue}
            placeholder={prov.defaultModel || 'model id'}
            onSubmit={(v) =>
              onComplete({
                provider: selectedProvider,
                model: v.trim() || prov.defaultModel,
                apiKey: keyValue.trim() || undefined,
                // Blank → undefined (native uses its SDK default; custom is
                // caught by validateSetup, which requires a base URL).
                baseUrl: baseValue.trim() || undefined,
              })
            }
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to confirm · Esc cancel</Text>
        </Box>
      </Frame>
    )
  }

  return null
}

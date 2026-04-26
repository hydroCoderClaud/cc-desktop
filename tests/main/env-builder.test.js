import { describe, it, expect, vi } from 'vitest'

describe('env-builder runtime model selection', () => {
  it('does not inject runtime model when selectedModelId is blank', async () => {
    const { buildClaudeEnvVars } = await import('../../src/main/utils/env-builder.js')

    const env = buildClaudeEnvVars({
      serviceProvider: 'qwen',
      authToken: 'token',
      authType: 'api_key',
      baseUrl: 'https://example.com',
      selectedModelTier: 'sonnet'
    }, {
      getServiceProviderDefinition: vi.fn(() => ({
        defaultModels: ['qwen-coder'],
        defaultModelMapping: {
          opus: 'qwen-max',
          sonnet: 'qwen-plus',
          haiku: 'qwen-turbo'
        }
      }))
    })

    expect(env.ANTHROPIC_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen-max')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('qwen-plus')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('qwen-turbo')
  })

  it('uses provider mapping env vars even when legacy profile mapping is present', async () => {
    const { buildClaudeEnvVars } = await import('../../src/main/utils/env-builder.js')

    const env = buildClaudeEnvVars({
      serviceProvider: 'other',
      authToken: 'token',
      authType: 'api_key',
      baseUrl: 'https://example.com',
      selectedModelId: 'actual-selected-model',
      modelMapping: {
        sonnet: 'custom-sonnet'
      }
    }, {
      getServiceProviderDefinition: vi.fn(() => ({
        defaultModels: ['provider-default-model'],
        defaultModelMapping: {
          opus: 'provider-opus',
          sonnet: 'provider-sonnet',
          haiku: 'provider-haiku'
        }
      }))
    })

    expect(env.ANTHROPIC_MODEL).toBe('actual-selected-model')
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('provider-opus')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('provider-sonnet')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('provider-haiku')
  })
})

import { describe, it, expect, vi } from 'vitest'

describe('env-builder runtime model mapping', () => {
  it('uses provider default mapping when profile only has a model tier', async () => {
    const { buildClaudeEnvVars } = await import('../../src/main/utils/env-builder.js')

    const env = buildClaudeEnvVars({
      serviceProvider: 'qwen',
      authToken: 'token',
      authType: 'api_key',
      baseUrl: 'https://example.com',
      selectedModelTier: 'sonnet'
    }, {
      getServiceProviderDefinition: vi.fn(() => ({
        defaultModelMapping: {
          opus: 'qwen-max',
          sonnet: 'qwen-plus',
          haiku: 'qwen-turbo'
        }
      }))
    })

    expect(env.ANTHROPIC_MODEL).toBe('qwen-plus')
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen-max')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('qwen-plus')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('qwen-turbo')
  })

  it('keeps explicit profile mapping over provider defaults', async () => {
    const { buildClaudeEnvVars } = await import('../../src/main/utils/env-builder.js')

    const env = buildClaudeEnvVars({
      serviceProvider: 'other',
      authToken: 'token',
      authType: 'api_key',
      baseUrl: 'https://example.com',
      selectedModelTier: 'sonnet',
      modelMapping: {
        sonnet: 'custom-sonnet'
      }
    }, {
      getServiceProviderDefinition: vi.fn(() => ({
        defaultModelMapping: {
          opus: 'provider-opus',
          sonnet: 'provider-sonnet',
          haiku: 'provider-haiku'
        }
      }))
    })

    expect(env.ANTHROPIC_MODEL).toBe('custom-sonnet')
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('provider-opus')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('custom-sonnet')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('provider-haiku')
  })
})

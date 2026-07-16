import { describe, it, expect, vi } from 'vitest'

describe('env-builder selected model handling', () => {
  it('does not inject model variables when selectedModelId is blank', async () => {
    const { buildClaudeEnvVars } = await import('../../src/main/utils/env-builder.js')
    const configManager = {
      getServiceProviderDefinition: vi.fn(() => ({
        defaultModelMapping: {
          opus: 'legacy-opus',
          sonnet: 'legacy-sonnet',
          haiku: 'legacy-haiku'
        }
      }))
    }

    const env = buildClaudeEnvVars({
      serviceProvider: 'qwen',
      authToken: 'token',
      authType: 'auth_token',
      baseUrl: 'https://example.com'
    }, configManager)

    expect(env.ANTHROPIC_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('token')
    expect(configManager.getServiceProviderDefinition).not.toHaveBeenCalled()
  })

  it('uses only the explicit selected model and ignores legacy mappings', async () => {
    const { buildClaudeEnvVars } = await import('../../src/main/utils/env-builder.js')

    const env = buildClaudeEnvVars({
      serviceProvider: 'deepseek',
      authToken: 'token',
      authType: 'auth_token',
      baseUrl: 'https://example.com',
      selectedModelId: 'deepseek-v4-flash[1m]',
      modelMapping: {
        sonnet: 'legacy-profile-model'
      }
    }, {
      getServiceProviderDefinition: vi.fn(() => ({
        defaultModelMapping: {
          opus: 'legacy-provider-opus'
        }
      }))
    })

    expect(env.ANTHROPIC_MODEL).toBe('deepseek-v4-flash[1m]')
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined()
  })

  it('skips ANTHROPIC_MODEL when includeModel is false', async () => {
    const { buildClaudeEnvVars } = await import('../../src/main/utils/env-builder.js')

    const env = buildClaudeEnvVars({
      serviceProvider: 'other',
      authToken: 'token',
      authType: 'api_key',
      baseUrl: 'https://example.com',
      selectedModelId: 'actual-selected-model'
    }, null, {
      includeModel: false
    })

    expect(env.ANTHROPIC_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBe('token')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://example.com')
  })
})

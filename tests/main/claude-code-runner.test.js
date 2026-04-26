import { describe, it, expect, vi } from 'vitest'

const ClaudeCodeRunner = require('../../src/main/runners/claude-code-runner.js')

describe('ClaudeCodeRunner createQuery system prompt mapping', () => {
  it('maps appendSystemPrompt to preset systemPrompt append format for current SDK', async () => {
    const runner = new ClaudeCodeRunner()
    const queryFn = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {}
    }))
    runner._queryFn = queryFn

    await runner.createQuery(null, {
      cwd: '/tmp',
      env: { ANTHROPIC_BASE_URL: 'https://example.com' },
      appendSystemPrompt: 'Present yourself as Hydro Desktop AI.'
    })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryFn.mock.calls[0][0].options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Present yourself as Hydro Desktop AI.'
    })
    expect(queryFn.mock.calls[0][0].options.appendSystemPrompt).toBeUndefined()
  })
})

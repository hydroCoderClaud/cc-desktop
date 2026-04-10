import { describe, expect, it } from 'vitest'

import { collectGenerationAssistantText } from '../../src/renderer/pages/notebook/utils/generation-result.js'

describe('collectGenerationAssistantText', () => {
  it('collects assistant text after the latest user message', () => {
    const result = collectGenerationAssistantText([
      { role: 'user', content: 'old prompt' },
      { role: 'assistant', content: 'old result' },
      { role: 'user', content: 'generate now' },
      { role: 'assistant', content: 'line 1' },
      { role: 'tool', input: { file_path: '/tmp/report.md' } },
      { role: 'assistant', content: 'line 2\nsee C:\\work\\slides\\deck.pptx' }
    ])

    expect(result).toBe('line 1\n\nline 2\nsee C:\\work\\slides\\deck.pptx')
  })

  it('returns empty assistant text when the latest turn has no assistant output', () => {
    const result = collectGenerationAssistantText([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'next turn' },
      { role: 'tool', input: { filePath: '/tmp/data.txt' } }
    ])

    expect(result).toBe('')
  })
})

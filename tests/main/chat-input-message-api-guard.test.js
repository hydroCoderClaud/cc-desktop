import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

const chatInputPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInput.vue')

describe('ChatInput message api guard', () => {
  it('does not shadow the Naive UI message api in handleSend', () => {
    const source = fs.readFileSync(chatInputPath, 'utf-8')

    expect(source).toContain('const message = useMessage()')
    expect(source).toContain('const outgoingMessage = {')
    expect(source).not.toContain('const message = {')
  })
})

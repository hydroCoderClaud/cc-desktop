import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const toolbarPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInputToolbar.vue')

describe('Feishu quick send guard', () => {
  it('does not pre-bind a Feishu session before sendText', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')
    const start = source.indexOf('const sendFeishuQuickMessage = async () => {')
    const end = source.indexOf('const loadCapabilities = async () => {')

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const sendBlock = source.slice(start, end)
    expect(sendBlock).not.toContain('bindSessionToFeishuTarget')
    expect(sendBlock).toContain('sendFeishuNotifyText')
  })
})

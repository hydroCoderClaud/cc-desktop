import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const toolbarPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInputToolbar.vue')

describe('Feishu quick send guard', () => {
  it('does not pre-bind a Feishu session before sendText', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')
    const start = source.indexOf('const sendFeishuQuickMessage = async () => {')
    const end = source.indexOf('const toggleApiDropdown = () => {')

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const sendBlock = source.slice(start, end)
    expect(sendBlock).not.toContain('bindSessionToFeishuTarget')
    expect(sendBlock).toContain('sendFeishuNotifyText')
  })

  it('limits the target dropdown to the existing bound Feishu target', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')
    const start = source.indexOf('const loadFeishuTargets = async () => {')
    const end = source.indexOf('const toggleDingTalkDropdown = () => {')

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const loadBlock = source.slice(start, end)
    expect(loadBlock).toContain('const bindingTargetId = binding?.targetId || binding?.openId || null')
    expect(loadBlock).toContain('const boundTarget = allTargets.find(target => [target.id, target.openId, target.userId].includes(bindingTargetId))')
    expect(loadBlock).toContain('feishuTargets.value = [boundTarget]')
    expect(loadBlock).toContain('selectedFeishuTargetId.value = boundTarget.id')
  })
})

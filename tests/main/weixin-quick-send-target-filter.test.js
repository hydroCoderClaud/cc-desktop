import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const toolbarPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInputToolbar.vue')

describe('Weixin quick send target filter', () => {
  it('does not pre-bind a Weixin session before sendText', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')
    const start = source.indexOf('const sendWeixinQuickMessage = async () => {')
    const end = source.indexOf('const sendFeishuQuickMessage = async () => {')

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const sendBlock = source.slice(start, end)
    expect(sendBlock).not.toContain('bindSessionToWeixinTarget')
    expect(sendBlock).toContain('sendWeixinNotifyText')
  })

  it('limits the target dropdown to the existing bound Weixin target', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')
    const start = source.indexOf('const loadWeixinTargets = async () => {')
    const end = source.indexOf('const loadFeishuTargets = async () => {')

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const loadBlock = source.slice(start, end)
    expect(loadBlock).toContain('const bindingTargetId = binding?.targetId || null')
    expect(loadBlock).toContain('const boundTarget = allTargets.find(target => target.id === bindingTargetId)')
    expect(loadBlock).toContain('weixinTargets.value = [boundTarget]')
    expect(loadBlock).toContain('selectedWeixinTargetId.value = boundTarget.id')
  })
})

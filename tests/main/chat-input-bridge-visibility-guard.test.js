import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const toolbarPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInputToolbar.vue')

describe('chat input bridge visibility guard', () => {
  it('hides DingTalk, Feishu, and Enterprise Weixin buttons when their bridges are disabled', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')

    expect(source).toContain('const dingtalkBridgeEnabled = ref(null)')
    expect(source).toContain('const feishuBridgeEnabled = ref(null)')
    expect(source).toContain('const enterpriseWeixinBridgeEnabled = ref(null)')
    expect(source).toContain('if (dingtalkBridgeEnabled.value !== true) return false')
    expect(source).toContain('if (feishuBridgeEnabled.value !== true) return false')
    expect(source).toContain('if (enterpriseWeixinBridgeEnabled.value !== true) return false')
  })

  it('syncs toolbar visibility from bridge status APIs and live status events', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')

    expect(source).toContain('const syncBridgeAvailability = async () => {')
    expect(source).toContain('api.getDingTalkStatus?.().catch(() => null)')
    expect(source).toContain('api.getFeishuStatus?.().catch(() => null)')
    expect(source).toContain('api.getEnterpriseWeixinStatus?.().catch(() => null)')
    expect(source).toContain('api.onDingTalkStatusChange((status) => {')
    expect(source).toContain('api.onFeishuStatusChange((status) => {')
    expect(source).toContain('api.onEnterpriseWeixinStatusChange((status) => {')
    expect(source).toContain('bindBridgeStatusListeners()')
    expect(source).toContain('syncBridgeAvailability()')
  })

  it('closes open bridge dropdown UI when a bridge becomes disabled', () => {
    const source = fs.readFileSync(toolbarPath, 'utf-8')

    expect(source).toContain('const closeDingTalkBridgeUi = () => {')
    expect(source).toContain('const closeFeishuBridgeUi = () => {')
    expect(source).toContain('const closeEnterpriseWeixinBridgeUi = () => {')
    expect(source).toContain('if (!enabled) {')
    expect(source).toContain('closeDingTalkBridgeUi()')
    expect(source).toContain('closeFeishuBridgeUi()')
    expect(source).toContain('closeEnterpriseWeixinBridgeUi()')
  })
})

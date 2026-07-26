import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const { DingTalkBridge } = requireCjs('../../src/main/managers/dingtalk-bridge.js')
const { FeishuBridge } = requireCjs('../../src/main/managers/feishu-bridge.js')
const { EnterpriseWeixinBridge } = requireCjs('../../src/main/managers/enterprise-weixin-bridge.js')

const persistedConversation = {
  cwd: 'C:/legacy/cwd-snapshot',
  project_path: 'C:/projects/canonical-root'
}

describe('IM inbound attachment cwd resolution', () => {
  it('uses project_path for an unloaded DingTalk session', () => {
    const bridge = Object.create(DingTalkBridge.prototype)
    bridge.agentSessionManager = {
      sessions: new Map(),
      sessionDatabase: {
        getAgentConversation: () => persistedConversation
      }
    }

    expect(bridge._resolveInboundAttachmentCwd('dingtalk-session')).toBe('C:/projects/canonical-root')
  })

  it('uses project_path for an unloaded Feishu session', () => {
    const bridge = Object.create(FeishuBridge.prototype)
    bridge._agentSessionManager = { sessions: new Map() }
    bridge._sessionDatabase = {
      getAgentConversation: () => persistedConversation
    }

    expect(bridge._resolveInboundAttachmentCwd('feishu-session')).toBe('C:/projects/canonical-root')
  })

  it('uses project_path for an unloaded Enterprise Weixin session', () => {
    const bridge = Object.create(EnterpriseWeixinBridge.prototype)
    bridge._agentSessionManager = { sessions: new Map() }
    bridge._sessionDatabase = {
      getAgentConversation: () => persistedConversation
    }

    expect(bridge._resolveInboundAttachmentCwd('wecom-session')).toBe('C:/projects/canonical-root')
  })
})

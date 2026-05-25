import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { AgentSessionManager } = await import('../../src/main/agent-session-manager.js')
const { DingTalkBridge } = await import('../../src/main/managers/dingtalk-bridge.js')

describe('DingTalkBridge', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-dingtalk-bridge-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createHarness() {
    const sent = []
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, data) => sent.push({ channel, data })
      }
    }
    const configManager = {
      getConfig: () => ({
        settings: { agent: { outputBaseDir: tempDir } },
        dingtalk: { maxHistorySessions: 5 }
      }),
      getDefaultProfile: () => ({ id: 'p1', baseUrl: 'https://example.com' }),
      getAPIProfile: () => null
    }
    const manager = new AgentSessionManager(mainWindow, configManager)
    manager.sessionDatabase = {
      insertAgentMessage: vi.fn(),
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      updateAgentConversation: vi.fn(),
      updateDingTalkMetadata: vi.fn(),
      getAgentConversation: vi.fn(() => null),
      getDingTalkSessions: vi.fn(() => []),
      getImSessionsByType: vi.fn(() => [])
    }
    const bridge = new DingTalkBridge(configManager, manager, mainWindow)
    return { bridge, manager, sent }
  }

  it('locks a normal session to DingTalk after first proactive bind', () => {
    const { bridge, manager, sent } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)

    bridge.bindSessionToTarget(session.id, {
      staffId: 'staff-1',
      targetId: 'staff-1',
      displayName: '张三'
    })

    expect(session.source).toBe('dingtalk')
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(session.id, {
      source: 'dingtalk'
    })
    expect(() => manager.bindSessionExternalImSource(session.id, 'feishu')).toThrow(/已绑定dingtalk渠道/)
    expect(sent).toContainEqual({
      channel: 'session:updated',
      data: {
        sessionId: session.id,
        session: expect.objectContaining({
          id: session.id,
          type: 'chat',
          source: 'dingtalk'
        })
      }
    })
  })

  it('uses IM-aware history lookup for DingTalk resume and ensureSession', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() }
    ])

    const resumeResult = await bridge._cmdResume([], {
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(resumeResult).toBeNull()
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', 'conv-1', 5)

    manager.sessionDatabase.getImSessionsByType.mockClear()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-2', title: '历史会话 2', updated_at: Date.now() }
    ])

    const ensureResult = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(ensureResult).toEqual({
      needsChoice: true,
      sessions: [{ session_id: 'hist-2', title: '历史会话 2', updated_at: expect.any(Number) }]
    })
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', 'conv-1', 5)
  })

  it('does not lock a session to DingTalk when the proactive send fails', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)

    vi.spyOn(bridge, '_getAccessToken').mockResolvedValue('token')
    bridge.configManager.getConfig = () => ({
      settings: { agent: { outputBaseDir: tempDir } },
      dingtalk: { maxHistorySessions: 5, robotCode: 'robot-1' }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ errcode: 500, errmsg: 'fail' })
    })))

    await expect(bridge.sendTextToTarget({
      sessionId: session.id,
      staffId: 'staff-1',
      displayName: '张三',
      text: '任务已完成'
    })).rejects.toThrow(/钉钉主动发送失败/)

    expect(session.source).toBe('manual')
    expect(bridge.getSessionBinding(session.id)).toBe(null)
    expect(manager.sessionDatabase.updateAgentConversation).not.toHaveBeenCalledWith(session.id, {
      source: 'dingtalk'
    })
  })

  it('reuses the proactively bound DingTalk session on first reply even after in-memory target mapping is lost', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    const session = manager.sessions.get(created.id)

    vi.spyOn(bridge, '_getAccessToken').mockResolvedValue('token')
    bridge.configManager.getConfig = () => ({
      settings: { agent: { outputBaseDir: tempDir } },
      dingtalk: { maxHistorySessions: 5, robotCode: 'robot-1' }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    })))

    await bridge.sendTextToTarget({
      sessionId: session.id,
      staffId: 'staff-1',
      displayName: '张三',
      text: '任务已完成'
    })

    bridge._targetSessionMap.clear()
    bridge._sessionTargets.clear()
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => ({
      id: 1,
      session_id: sessionId,
      type: 'chat',
      title: '桌面会话',
      cwd: tempDir,
      source: 'dingtalk',
      status: 'idle',
      staff_id: 'staff-1',
      conversation_id: '',
      cwd_auto: 0,
      message_count: 0,
      total_cost_usd: 0,
      created_at: Date.now(),
      api_profile_id: null,
      api_base_url: null
    }))
    manager.sessionDatabase.listAllAgentConversations = vi.fn(() => [
      {
        session_id: session.id,
        type: 'chat',
        source: 'dingtalk',
        title: '桌面会话',
        staff_id: 'staff-1',
        conversation_id: '',
        status: 'idle',
        updated_at: Date.now()
      }
    ])
    vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      manager.sessions.set(sessionId, {
        id: sessionId,
        type: 'chat',
        title: '桌面会话',
        source: 'dingtalk',
        meta: {}
      })
      return manager.sessions.get(sessionId)
    })

    const result = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(result).toBe(session.id)
    expect(bridge._targetSessionMap.get('staff-1')).toBe(session.id)
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBe(session.id)
    expect(manager.sessionDatabase.updateDingTalkMetadata).toHaveBeenCalledWith(session.id, 'staff-1', 'conv-1')
  })

  it('clears stale DingTalk pending choice when the user is proactively rebound to an active session', async () => {
    const { bridge, manager } = createHarness()
    const sendChoiceMenu = vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()
    const handlePendingChoice = vi.spyOn(bridge, '_handlePendingChoice').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    const session = manager.sessions.get(created.id)

    vi.spyOn(bridge, '_getAccessToken').mockResolvedValue('token')
    bridge.configManager.getConfig = () => ({
      settings: { agent: { outputBaseDir: tempDir } },
      dingtalk: { maxHistorySessions: 5, robotCode: 'robot-1' }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    })))

    await bridge.sendTextToTarget({
      sessionId: session.id,
      staffId: 'staff-1',
      displayName: '张三',
      text: '任务已完成'
    })

    bridge._pendingChoices.set('staff-1:conv-1', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      originalMessage: '旧消息',
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-1',
        msgtype: 'text',
        text: { content: '来了' },
        senderStaffId: 'staff-1',
        senderNick: '张三',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-1',
        conversationTitle: '测试群',
        conversationType: '2'
      })
    })

    expect(handlePendingChoice).not.toHaveBeenCalled()
    expect(sendChoiceMenu).not.toHaveBeenCalled()
    expect(bridge._pendingChoices.has('staff-1:conv-1')).toBe(false)
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBe(session.id)
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      '来了',
      'https://example.com/webhook',
      '张三',
      expect.objectContaining({
        robotCode: 'robot-1',
        senderStaffId: 'staff-1',
        conversationId: 'conv-1',
        conversationType: '2'
      })
    )
  })
})

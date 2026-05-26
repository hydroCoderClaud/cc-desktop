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
      closeAgentConversation: vi.fn(),
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
      source: 'dingtalk',
      imChannel: 'dingtalk'
    })
    expect(() => manager.bindSessionExternalImSource(session.id, 'feishu')).toThrow(/已绑定dingtalk渠道/)
    expect(sent).toContainEqual({
      channel: 'session:updated',
      data: {
        sessionId: session.id,
        session: expect.objectContaining({
          id: session.id,
          type: 'chat',
          source: 'dingtalk',
          imChannel: 'dingtalk'
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

  it('rejects sending a DingTalk-bound session to another target before network send', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    bridge.bindSessionToTarget(session.id, {
      staffId: 'staff-1',
      displayName: '张三'
    })

    await expect(bridge.sendTextToTarget({
      sessionId: session.id,
      staffId: 'staff-2',
      displayName: '李四',
      text: '任务已完成'
    })).rejects.toThrow(/当前会话已绑定钉钉联系人「张三」/)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(bridge.getSessionBinding(session.id)).toEqual({
      targetId: 'staff-1',
      staffId: 'staff-1',
      displayName: '张三'
    })
    expect(bridge._targetSessionMap.get('staff-2')).toBeUndefined()
  })

  it('rejects rebinding a persisted DingTalk target after in-memory binding is lost', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'dingtalk', title: '桌面会话' })
    const session = manager.sessions.get(created.id)

    bridge._sessionTargets.clear()
    bridge._targetSessionMap.clear()
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'dingtalk',
            title: '桌面会话',
            staff_id: 'staff-1',
            conversation_id: '',
            status: 'idle'
          }
        : null
    ))

    expect(() => bridge.bindSessionToTarget(session.id, {
      staffId: 'staff-2',
      displayName: '李四'
    })).toThrow(/当前会话已绑定钉钉联系人「staff-1」/)
  })

  it('restores persisted DingTalk target binding after in-memory binding is lost', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'dingtalk', title: '桌面会话' })
    const session = manager.sessions.get(created.id)

    bridge._sessionTargets.clear()
    bridge._targetSessionMap.clear()
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'dingtalk',
            title: '桌面会话',
            staff_id: 'staff-1',
            conversation_id: '',
            status: 'idle'
          }
        : null
    ))

    expect(bridge.getSessionBinding(session.id)).toEqual({
      targetId: 'staff-1',
      staffId: 'staff-1',
      displayName: 'staff-1'
    })
    expect(bridge._targetSessionMap.get('staff-1')).toBe(session.id)
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

  it('handles DingTalk resume menu numeric replies even when a session is already active', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()
    const handlePendingChoice = vi.spyOn(bridge, '_handlePendingChoice').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const active = manager.create({ type: 'chat', source: 'dingtalk', title: '当前会话' })
    const history = manager.create({ type: 'chat', source: 'dingtalk', title: '历史会话' })
    bridge.sessionMap.set('staff-1:conv-1', active.id)

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: history.id, title: '历史会话', updated_at: Date.now() }
    ])

    const result = await bridge._cmdResume([], {
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(bridge._pendingChoices.get('staff-1:conv-1')?.source).toBe('resume-command')

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-resume-choice',
        msgtype: 'text',
        text: { content: '2' },
        senderStaffId: 'staff-1',
        senderNick: '张三',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-1',
        conversationTitle: '测试群',
        conversationType: '2'
      })
    })

    expect(handlePendingChoice).toHaveBeenCalledWith(
      'staff-1:conv-1',
      '2',
      'https://example.com/webhook',
      expect.objectContaining({
        robotCode: 'robot-1',
        senderStaffId: 'staff-1',
        conversationId: 'conv-1',
        conversationType: '2'
      })
    )
    expect(enqueueMessage).not.toHaveBeenCalled()
  })

  it('switches the active DingTalk reply binding to the latest desktop session for the same user', async () => {
    const { bridge, manager } = createHarness()
    const first = manager.create({ type: 'chat', source: 'manual', title: '会话1' })
    const second = manager.create({ type: 'chat', source: 'manual', title: '会话2' })

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
      sessionId: first.id,
      staffId: 'staff-1',
      displayName: '张三',
      text: '第一条'
    })

    bridge.sessionMap.set('staff-1:conv-1', first.id)
    manager.sessions.get(first.id).meta = {
      ...(manager.sessions.get(first.id).meta || {}),
      conversationId: 'conv-1'
    }

    bridge._targetSessionMap.clear()

    await bridge.sendTextToTarget({
      sessionId: second.id,
      staffId: 'staff-1',
      displayName: '张三',
      text: '第二条'
    })

    expect(bridge._targetSessionMap.get('staff-1')).toBe(second.id)
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBeUndefined()

    const reboundSessionId = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(reboundSessionId).toBe(second.id)
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBe(second.id)
  })

  it('includes proactively bound chat sessions in DingTalk resume history after the first inbound reply', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const sendChoiceMenu = vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()

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

    bridge.sessionMap.delete('staff-1:conv-1')
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    manager.sessionDatabase.listAllAgentConversations = vi.fn(() => [
      {
        session_id: session.id,
        type: 'chat',
        source: 'dingtalk',
        title: '桌面会话',
        staff_id: 'staff-1',
        conversation_id: 'conv-1',
        status: 'idle',
        updated_at: Date.now()
      }
    ])

    const result = await bridge._cmdResume([], {
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', 'conv-1', 5)
    expect(manager.sessionDatabase.listAllAgentConversations).toHaveBeenCalled()
    expect(bridge._pendingChoices.get('staff-1:conv-1')?.sessions).toEqual([
      expect.objectContaining({ session_id: session.id })
    ])
    expect(sendChoiceMenu).toHaveBeenCalledWith(
      'https://example.com/webhook',
      [expect.objectContaining({ session_id: session.id })],
      null
    )
  })

  it('clears proactive DingTalk target binding when closing the active mapped session', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    const session = manager.sessions.get(created.id)

    bridge.bindSessionToTarget(session.id, {
      staffId: 'staff-1',
      displayName: '张三'
    })
    bridge.sessionMap.set('staff-1:conv-1', session.id)

    const reply = await bridge._cmdClose([], {
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1'
    })

    expect(reply).toContain('会话已关闭')
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBeUndefined()
    expect(bridge.getSessionBinding(session.id)).toBe(null)
    expect(bridge._targetSessionMap.get('staff-1')).toBeUndefined()
  })

  it('does not mark a proactively bound DingTalk session as current in resume menu without an active chat map', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const sendChoiceMenu = vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    const session = manager.sessions.get(created.id)
    bridge.bindSessionToTarget(session.id, {
      staffId: 'staff-1',
      displayName: '张三'
    })

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: session.id,
        title: '桌面会话',
        staff_id: 'staff-1',
        conversation_id: 'conv-1',
        type: 'chat',
        source: 'dingtalk',
        updated_at: Date.now()
      }
    ])

    const result = await bridge._cmdResume([], {
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(sendChoiceMenu).toHaveBeenCalledWith(
      'https://example.com/webhook',
      [expect.objectContaining({ session_id: session.id })],
      null
    )
  })

  it('replays pending DingTalk image messages to the desktop frontend after choosing a historical session', async () => {
    const { bridge, manager, sent } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'manual', title: '历史会话' })
    const image = { base64: Buffer.from('img').toString('base64'), mediaType: 'image/png' }

    bridge._pendingChoices.set('staff-1:conv-1', {
      sessions: [{ session_id: created.id, title: '历史会话', updated_at: Date.now() }],
      originalMessage: { text: '', images: [image] },
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handlePendingChoice('staff-1:conv-1', '1', 'https://example.com/webhook', {
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2'
    })

    expect(sent).toContainEqual({
      channel: 'dingtalk:messageReceived',
      data: {
        sessionId: created.id,
        senderNick: '张三',
        text: '[图片]',
        images: [image]
      }
    })
    expect(bridge._enqueueMessage).toHaveBeenCalledWith(
      created.id,
      { text: '', images: [image] },
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

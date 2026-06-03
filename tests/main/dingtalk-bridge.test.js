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
      updateImIdentity: vi.fn(),
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

    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })

    expect(session.imChannel).toBe('dingtalk')
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(session.id, {
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

  it('formats DingTalk markdown replies with blank lines between lines', async () => {
    const { bridge } = createHarness()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK'
    })

    await bridge._replyToDingTalk('https://example.com/webhook', '系统状态\n├─ 钉钉桥接: 已连接\n└─ 总会话数: 0 个')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, request] = fetchSpy.mock.calls[0]
    expect(request.method).toBe('POST')
    const body = JSON.parse(request.body)
    expect(body.msgtype).toBe('markdown')
    expect(body.markdown.title).toBeTruthy()
    expect(body.markdown.text).toBe('系统状态\n\n├─ 钉钉桥接: 已连接\n\n└─ 总会话数: 0 个')
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

    await expect(bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'staff-1',
      displayName: '张三',
      text: '任务已完成'
    })).rejects.toThrow(/钉钉主动发送失败/)

    expect(session.source).toBe('manual')
    expect(bridge.getBinding(session.id)).toBe(null)
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

    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })

    await expect(bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'staff-2',
      displayName: '李四',
      text: '任务已完成'
    })).rejects.toThrow(/当前会话已绑定钉钉联系人「张三」/)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(bridge.getBinding(session.id)).toEqual(expect.objectContaining({
      targetId: 'staff-1',
      displayName: '张三'
    }))
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
            source: 'im-inbound',
            im_channel: 'dingtalk',
            title: '桌面会话',
            im_user_id: 'staff-1',
            im_chat_id: '',
            staff_id: 'staff-1',
            conversation_id: '',
            status: 'idle'
          }
        : null
    ))

    expect(() => bridge.bindTarget(session.id, {
      targetId: 'staff-2',
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
            source: 'im-inbound',
            im_channel: 'dingtalk',
            title: '桌面会话',
            im_user_id: 'staff-1',
            im_chat_id: '',
            staff_id: 'staff-1',
            conversation_id: '',
            status: 'idle'
          }
        : null
    ))

    expect(bridge.getBinding(session.id)).toEqual(expect.objectContaining({
      targetId: 'staff-1',
      displayName: 'staff-1'
    }))
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

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'staff-1',
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
      source: 'im-inbound',
      im_channel: 'dingtalk',
      status: 'idle',
      im_user_id: 'staff-1',
      im_chat_id: '',
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
        source: 'im-inbound',
        im_channel: 'dingtalk',
        title: '桌面会话',
        im_user_id: 'staff-1',
        im_chat_id: '',
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
    expect(manager.sessionDatabase.updateImIdentity).toHaveBeenCalledWith(session.id, expect.objectContaining({ userId: 'staff-1', chatId: 'conv-1' }))
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

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'staff-1',
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

    await bridge.sendToTarget({
      sessionId: first.id,
      targetId: 'staff-1',
      displayName: '张三',
      text: '第一条'
    })

    bridge.sessionMap.set('staff-1:conv-1', first.id)
    manager.sessions.get(first.id).meta = {
      ...(manager.sessions.get(first.id).meta || {}),
      conversationId: 'conv-1'
    }

    bridge._targetSessionMap.clear()

    await bridge.sendToTarget({
      sessionId: second.id,
      targetId: 'staff-1',
      displayName: '张三',
      text: '第二条'
    })

    expect(bridge._targetSessionMap.get('staff-1')).toBe(second.id)
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBeUndefined()

    const reboundSessionId = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(reboundSessionId).toBe(second.id)
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBe(second.id)
  })

  it('shows proactively bound chat sessions in DingTalk resume history only after new-field chat metadata exists', async () => {
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

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'staff-1',
      displayName: '张三',
      text: '任务已完成'
    })

    bridge.sessionMap.delete('staff-1:conv-1')
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: session.id,
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'dingtalk',
        title: '桌面会话',
        im_user_id: 'staff-1',
        im_chat_id: 'conv-1',
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
    expect(bridge._pendingChoices.get('staff-1:conv-1')?.sessions).toEqual([
      expect.objectContaining({ session_id: session.id })
    ])
    expect(sendChoiceMenu).toHaveBeenCalledWith(
      'https://example.com/webhook',
      [expect.objectContaining({ session_id: session.id })],
      null
    )
  })

  it('includes proactively bound notebook sessions in DingTalk resume history before chat metadata is filled', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const sendChoiceMenu = vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()

    const created = manager.create({ type: 'chat', source: 'manual', title: 'Notebook 会话' })
    const session = manager.sessions.get(created.id)

    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'manual',
            im_channel: 'dingtalk',
            title: 'Notebook 会话',
            im_user_id: 'staff-1',
            im_chat_id: '',
            staff_id: 'staff-1',
            conversation_id: '',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

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
    expect(bridge._pendingChoices.get('staff-1:conv-1')?.sessions).toEqual([
      expect.objectContaining({ session_id: session.id, im_chat_id: '' })
    ])
    expect(sendChoiceMenu).toHaveBeenCalledWith(
      'https://example.com/webhook',
      [expect.objectContaining({ session_id: session.id, im_chat_id: '' })],
      null
    )
  })

  it('clears proactive DingTalk target binding when closing the active mapped session', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    const session = manager.sessions.get(created.id)

    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
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
    expect(bridge.getBinding(session.id)).toBe(null)
    expect(bridge._targetSessionMap.get('staff-1')).toBeUndefined()
  })

  it('rejects /close with numbered arguments', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    bridge.sessionMap.set('staff-1:conv-1', created.id)

    const reply = await bridge._cmdClose(['1'], {
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1'
    })

    expect(reply).toContain('/close 不支持带编号或参数')
    expect(manager.sessions.has(created.id)).toBe(true)
  })

  it('does not reuse a proactively bound DingTalk session after the desktop closes it', async () => {
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

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'staff-1',
      displayName: '张三',
      text: '任务已完成'
    })

    bridge.sessionMap.set('staff-1:conv-1', session.id)
    session.meta = {
      ...(session.meta || {}),
      conversationId: 'conv-1'
    }

    await manager.close(session.id)

    expect(bridge._targetSessionMap.get('staff-1')).toBeUndefined()
    expect(bridge.sessionMap.get('staff-1:conv-1')).toBeUndefined()
    expect(bridge.getBinding(session.id)).toBe(null)

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const createNewSessionSpy = vi.spyOn(bridge, '_createNewSession').mockResolvedValue('new-session-id')

    const result = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(result).toBe('new-session-id')
    expect(createNewSessionSpy).toHaveBeenCalledWith('staff-1', '张三', 'conv-1', '测试群', 'staff-1:conv-1')
  })

  it('does not mark a proactively bound DingTalk session as current in resume menu without an active chat map', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const sendChoiceMenu = vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    const session = manager.sessions.get(created.id)
    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: session.id,
        title: '桌面会话',
        im_user_id: 'staff-1',
        im_chat_id: 'conv-1',
        staff_id: 'staff-1',
        conversation_id: 'conv-1',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'dingtalk',
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

  it('shows historical dingtalk session state in /status without entering resume flow', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({
      type: 'chat',
      source: 'im-inbound',
      imChannel: 'dingtalk',
      title: '钉钉 · 张三',
      cwdSubDir: 'dingtalk',
      meta: { conversationId: 'conv-1' }
    })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    session.status = 'idle'
    bridge.sessionMap.set('staff-1:conv-1', session.id)

    const text = bridge._cmdStatus({
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1'
    })

    expect(text).toContain('当前会话状态：')
    expect(text).toContain('1. ✅')
    expect(text).toContain('钉钉 · 张三')
    expect(text).not.toContain('回复 0 开始全新会话')
    expect(bridge._pendingChoices.size).toBe(0)
  })

  it('shows proactively bound notebook sessions in DingTalk /status before chat metadata is filled', () => {
    const { bridge, manager } = createHarness()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const created = manager.create({ type: 'chat', source: 'manual', title: 'Notebook 会话' })
    const session = manager.sessions.get(created.id)
    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'manual',
            im_channel: 'dingtalk',
            title: 'Notebook 会话',
            im_user_id: 'staff-1',
            im_chat_id: '',
            staff_id: 'staff-1',
            conversation_id: '',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    const text = bridge._cmdStatus({
      mapKey: 'staff-1:conv-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1'
    })

    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', 'conv-1', 5)
    expect(text).toContain('当前会话状态：')
    expect(text).toContain('Notebook 会话')
  })

})

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
    const rows = new Map()
    let dbRowId = 1
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
      createAgentConversation: vi.fn((payload = {}) => {
        const now = Date.now()
        rows.set(payload.sessionId, {
          id: dbRowId++,
          session_id: payload.sessionId,
          type: payload.type || 'chat',
          title: payload.title || '',
          cwd: payload.cwd || null,
          cwd_auto: payload.cwdAuto ? 1 : 0,
          api_profile_id: payload.apiProfileId || null,
          api_base_url: payload.apiBaseUrl || null,
          model_id: payload.modelId || null,
          source: payload.source || 'manual',
          im_channel: payload.imChannel || null,
          im_chat_type: payload.imChatType || null,
          im_user_id: null,
          im_chat_id: null,
          status: 'idle',
          message_count: 0,
          total_cost_usd: 0,
          created_at: now,
          updated_at: now,
        })
        return { id: rows.get(payload.sessionId).id }
      }),
      updateAgentConversation: vi.fn((sessionId, updates = {}) => {
        const current = rows.get(sessionId)
        if (!current) return
        for (const [key, value] of Object.entries(updates)) {
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
          current[snakeKey] = value
        }
        current.updated_at = Date.now()
      }),
      updateImIdentity: vi.fn((sessionId, { userId, chatId, chatType } = {}) => {
        const current = rows.get(sessionId)
        if (!current) return
        current.im_user_id = userId
        current.im_chat_id = chatId
        current.im_chat_type = chatType || null
        current.updated_at = Date.now()
      }),
      closeAgentConversation: vi.fn((sessionId) => {
        const current = rows.get(sessionId)
        if (!current) return
        current.status = 'closed'
        current.updated_at = Date.now()
      }),
      getAgentConversation: vi.fn((sessionId) => rows.get(sessionId) || null),
      getImSessionsByType: vi.fn((type, userId, conversationId, limit = 5) => {
        return Array.from(rows.values())
          .filter(row => row.im_channel === type)
          .filter(row => row.im_user_id === userId)
          .filter(row => conversationId ? row.im_chat_id === conversationId : true)
          .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))
          .slice(0, limit)
      }),
      listAllAgentConversations: vi.fn(({ limit = 100 } = {}) => {
        return Array.from(rows.values())
          .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))
          .slice(0, limit)
      }),
      setImChannel: vi.fn((sessionId, imChannel) => {
        const current = rows.get(sessionId)
        if (!current) return
        current.im_channel = imChannel || null
        current.updated_at = Date.now()
      }),
      clearImIdentity: vi.fn((sessionId) => {
        const current = rows.get(sessionId)
        if (!current) return
        current.im_user_id = null
        current.im_chat_id = null
        current.im_chat_type = null
        current.updated_at = Date.now()
      }),
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

  it('ACKs DingTalk callback messages by stream messageId before async handling', () => {
    const { bridge } = createHarness()
    const send = vi.fn()
    bridge.client = { send }

    bridge._ackDingTalkCallback({
      headers: { messageId: 'stream-message-1' },
      data: '{}'
    })

    expect(send).toHaveBeenCalledWith('stream-message-1', { status: 'SUCCESS' })
  })

  it('uses IM-aware history lookup for DingTalk resume and ensureSession', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() }
    ])

    const resumeResult = await bridge._cmdResume([], {
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '张三',
      conversationType: '1',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(resumeResult).toBeNull()
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', '', 5)

    manager.sessionDatabase.getImSessionsByType.mockClear()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-2', title: '历史会话 2', updated_at: Date.now() }
    ])

    const ensureResult = await bridge._ensureSession('staff-1', '张三', 'conv-1', '张三', '1')

    expect(ensureResult).toEqual({
      needsChoice: true,
      sessions: [{ session_id: 'hist-2', title: '历史会话 2', updated_at: expect.any(Number) }]
    })
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', '', 5)

    manager.sessionDatabase.getImSessionsByType.mockClear()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-3', title: '群历史会话', updated_at: Date.now() }
    ])

    const groupResult = await bridge._ensureSession('staff-1', '张三', 'conv-group', '测试群', '2')

    expect(groupResult).toEqual({
      needsChoice: true,
      sessions: [{ session_id: 'hist-3', title: '群历史会话', updated_at: expect.any(Number) }]
    })
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', '', 'conv-group', 5)
  })

  it('shows the resume choice for p2p history when there is no current binding on normal inbound text', async () => {
    const { bridge, manager } = createHarness()
    const sendChoiceMenu = vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const session = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '旧单聊历史会话' })
    await manager.close(session.id)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: session.id, title: '旧单聊历史会话', im_user_id: 'staff-1', im_chat_id: '', im_chat_type: 'p2p', updated_at: Date.now() }
    ])

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-p2p-history-choice',
        msgtype: 'text',
        text: { content: 'hi' },
        senderStaffId: 'staff-1',
        senderNick: '张三',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-1',
        conversationTitle: '张三',
        conversationType: '1',
      })
    })

    expect(sendChoiceMenu).toHaveBeenCalledWith(
      'https://example.com/webhook',
      [expect.objectContaining({ session_id: session.id })]
    )
    expect(bridge._pendingChoices.get('staff-1')).toEqual(
      expect.objectContaining({
        originalMessage: 'hi',
        sessions: [expect.objectContaining({ session_id: session.id })],
      })
    )
    expect(bridge.sessionMap.get('staff-1')).toBeUndefined()
    expect(enqueueMessage).not.toHaveBeenCalled()
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
      imChannel: 'dingtalk'
    })
  })

  it('sends proactive DingTalk group text through the groupMessages endpoint and binds the group target', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)

    vi.spyOn(bridge, '_getAccessToken').mockResolvedValue('token')
    bridge.configManager.getConfig = () => ({
      settings: { agent: { outputBaseDir: tempDir } },
      dingtalk: { maxHistorySessions: 5, robotCode: 'robot-1' }
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'chat-1',
      targetType: 'chat',
      displayName: '项目群',
      text: '任务已完成'
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, request] = fetchMock.mock.calls[0]
    expect(endpoint).toBe('https://api.dingtalk.com/v1.0/robot/groupMessages/send')
    const body = JSON.parse(request.body)
    expect(body.openConversationId).toBe('chat-1')
    expect(body.userIds).toBeUndefined()
    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'chat-1',
      displayName: '项目群',
      targetType: 'chat',
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
    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '桌面会话' })
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
    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '桌面会话' })
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

  it('returns renamed known chat aliases for persisted DingTalk group bindings', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '群会话' })
    const session = manager.sessions.get(created.id)

    bridge._sessionTargets.clear()
    bridge._targetSessionMap.clear()
    bridge.renameKnownChat('chat-1', '项目群')
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'im-inbound',
            im_channel: 'dingtalk',
            title: '群会话',
            im_user_id: '',
            im_chat_id: 'chat-1',
            im_chat_type: 'group',
            status: 'idle'
          }
        : null
    ))

    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'chat-1',
      displayName: '项目群',
      targetType: 'chat',
    })
  })

  it('restores runtime DingTalk group binding immediately when a mapped inbound group session is reused', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '群会话' })
    const session = manager.sessions.get(created.id)

    bridge.sessionMap.set('conv-1', session.id)
    bridge._sessionTargets.clear()
    bridge._targetSessionMap.clear()

    const result = await bridge._ensureSession('staff-1', '张三', 'conv-1', '项目群', '2')

    expect(result).toBe(session.id)
    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'conv-1',
      displayName: '项目群',
      targetType: 'chat',
    })
    expect(bridge.sessionMap.get('conv-1')).toBe(session.id)
    expect(bridge._targetSessionMap.get('conv-1')).toBe(session.id)
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
        status: 'idle',
        updated_at: Date.now()
      }
    ])
    vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => manager.sessions.get(sessionId))

    const result = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(result).toBe(session.id)
    expect(bridge._targetSessionMap.get('staff-1')).toBe(session.id)
    expect(bridge.sessionMap.get('staff-1')).toBe(session.id)
    expect(manager.sessionDatabase.updateImIdentity).toHaveBeenCalledWith(session.id, expect.objectContaining({ userId: 'staff-1', chatId: '' }))
  })

  it('clears stale DingTalk p2p pending choice when the user is proactively rebound to an active session', async () => {
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

    bridge._pendingChoices.set('staff-1', {
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
        conversationTitle: '张三',
        conversationType: '1'
      })
    })

    expect(handlePendingChoice).not.toHaveBeenCalled()
    expect(sendChoiceMenu).not.toHaveBeenCalled()
    expect(bridge._pendingChoices.has('staff-1')).toBe(false)
    expect(bridge.sessionMap.get('staff-1')).toBe(session.id)
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      '来了',
      'https://example.com/webhook',
      '张三',
      expect.objectContaining({
        robotCode: 'robot-1',
        senderStaffId: 'staff-1',
        conversationId: 'conv-1',
        conversationType: '1'
      })
    )
  })

  it('keeps a DingTalk group pending choice isolated from the sender p2p proactive binding', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()
    const handlePendingChoice = vi.spyOn(bridge, '_handlePendingChoice').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const p2p = manager.create({ type: 'chat', source: 'manual', title: '单聊绑定会话' })
    bridge.bindTarget(p2p.id, {
      targetId: 'staff-1',
      targetType: 'user',
      displayName: '张三'
    })
    bridge._markRuntimeProactiveTargetBinding('staff-1', p2p.id)

    bridge._pendingChoices.set('conv-group', {
      sessions: [{ session_id: 'group-hist-1', title: '群历史会话' }],
      originalMessage: '大家好',
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-group-choice-with-p2p-binding',
        msgtype: 'text',
        text: { content: '1 @cc-desktop' },
        senderStaffId: 'staff-1',
        senderNick: '张三',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-group',
        conversationType: '2',
        isInAtList: true,
        atUsers: [{ staffId: 'robot-1', dingtalkId: 'robot-1', name: 'cc-desktop' }]
      })
    })

    expect(handlePendingChoice).toHaveBeenCalledWith(
      'conv-group',
      '1 @cc-desktop',
      'https://example.com/webhook',
      expect.objectContaining({
        senderStaffId: 'staff-1',
        conversationId: 'conv-group',
        conversationType: '2',
      })
    )
    expect(bridge.sessionMap.get('staff-1')).toBe(p2p.id)
    expect(bridge.sessionMap.get('conv-group')).toBeUndefined()
    expect(enqueueMessage).not.toHaveBeenCalled()
  })

  it('handles DingTalk resume menu numeric replies even when a session is already active', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_sendChoiceMenu').mockResolvedValue()
    const handlePendingChoice = vi.spyOn(bridge, '_handlePendingChoice').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const active = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '当前会话' })
    const history = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '历史会话' })
    bridge.sessionMap.set('conv-1', active.id)

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: history.id, title: '历史会话', updated_at: Date.now() }
    ])

    const result = await bridge._cmdResume([], {
      mapKey: 'conv-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(bridge._pendingChoices.get('conv-1')?.source).toBe('resume-command')

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
      'conv-1',
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

    bridge.sessionMap.set('staff-1', first.id)
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
    expect(bridge.sessionMap.get('staff-1')).toBe(second.id)

    const reboundSessionId = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(reboundSessionId).toBe(second.id)
    expect(bridge.sessionMap.get('staff-1')).toBe(second.id)
  })

  it('shows proactively bound p2p sessions in DingTalk resume history even before chat metadata is learned', async () => {
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

    bridge.sessionMap.delete('staff-1')
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])

    const result = await bridge._cmdResume([], {
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '张三',
      conversationType: '1',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', '', 5)
    expect(bridge._pendingChoices.get('staff-1')?.sessions).toEqual([
      expect.objectContaining({ session_id: session.id })
    ])
    expect(sendChoiceMenu).toHaveBeenCalledWith(
      'https://example.com/webhook',
      [expect.objectContaining({ session_id: session.id })],
      session.id
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
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    const result = await bridge._cmdResume([], {
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '张三',
      conversationType: '1',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', '', 5)
    expect(bridge._pendingChoices.get('staff-1')?.sessions).toEqual([
      expect.objectContaining({ session_id: session.id, im_chat_id: 'conv-1' })
    ])
    expect(sendChoiceMenu).toHaveBeenCalledWith(
      'https://example.com/webhook',
      [expect.objectContaining({ session_id: session.id, im_chat_id: 'conv-1' })],
      session.id
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
    bridge.sessionMap.set('staff-1', session.id)

    const reply = await bridge._cmdClose([], {
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1'
    })

    expect(reply).toContain('会话已关闭')
    expect(bridge.sessionMap.get('staff-1')).toBeUndefined()
    expect(bridge.getBinding(session.id)).toBe(null)
    expect(bridge._targetSessionMap.get('staff-1')).toBeUndefined()
  })

  it('rejects /close with numbered arguments', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话' })
    bridge.sessionMap.set('staff-1', created.id)

    const reply = await bridge._cmdClose(['1'], {
      mapKey: 'staff-1',
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

    bridge.sessionMap.set('staff-1', session.id)
    session.meta = {
      ...(session.meta || {}),
      conversationId: 'conv-1'
    }

    await manager.close(session.id)

    expect(bridge._targetSessionMap.get('staff-1')).toBeUndefined()
    expect(bridge.sessionMap.get('staff-1')).toBeUndefined()
    expect(bridge.getBinding(session.id)).toBe(null)

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])

    const result = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群')

    expect(typeof result).toBe('string')
    expect(result).not.toBe(session.id)
    expect(bridge.sessionMap.get('staff-1')).toBe(result)
  })

  it('does not silently reuse another active DingTalk session for the same user after /close', async () => {
    const { bridge, manager } = createHarness()
    const current = manager.create({ type: 'chat', source: 'manual', title: '当前会话' })
    const other = manager.create({ type: 'chat', source: 'manual', title: '另一个激活会话' })

    bridge.bindTarget(current.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })
    bridge.bindTarget(other.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })
    bridge.sessionMap.set('staff-1', current.id)
    manager.sessions.get(current.id).meta = {
      ...(manager.sessions.get(current.id).meta || {}),
      conversationId: 'conv-1'
    }

    const reply = await bridge._cmdClose([], {
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationType: '1'
    })

    expect(reply).toContain('会话已关闭')
    expect(bridge._proactiveRebindSuppressedKeys.has('staff-1')).toBe(true)

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: other.id,
        title: '另一个激活会话',
        im_user_id: 'staff-1',
        im_chat_id: 'conv-1',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'dingtalk',
        updated_at: Date.now()
      }
    ])

    const result = await bridge._ensureSession('staff-1', '张三', 'conv-1', '测试群', '1')

    expect(result).toEqual({
      needsChoice: true,
      sessions: [expect.objectContaining({ session_id: other.id })]
    })
    expect(bridge.sessionMap.get('staff-1')).toBeUndefined()
  })

  it('clears DingTalk proactive rebind suppression after binding the same user again', () => {
    const { bridge, manager } = createHarness()
    const first = manager.create({ type: 'chat', source: 'manual', title: '旧会话' })
    const second = manager.create({ type: 'chat', source: 'manual', title: '新会话' })

    bridge.bindTarget(first.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })
    manager.sessions.get(first.id).meta = {
      ...(manager.sessions.get(first.id).meta || {}),
      conversationId: 'conv-1'
    }

    bridge._suppressProactiveRebind(first.id)
    expect(bridge._proactiveRebindSuppressedKeys.has('staff-1')).toBe(true)

    bridge.bindTarget(second.id, {
      targetId: 'staff-1',
      displayName: '张三'
    })

    expect(bridge._proactiveRebindSuppressedKeys.has('staff-1')).toBe(false)
    expect(bridge._targetSessionMap.get('staff-1')).toBe(second.id)
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
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'dingtalk',
        updated_at: Date.now()
      }
    ])

    const result = await bridge._cmdResume([], {
      mapKey: 'staff-1',
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
      session.id
    )
  })

  it('activates a historical DingTalk session with hello when resuming directly by number', async () => {
    const { bridge, manager, sent } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const history = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '历史会话' })
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: history.id,
        title: '历史会话',
        im_user_id: 'staff-1',
        im_chat_id: 'conv-1',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'dingtalk',
        updated_at: Date.now(),
      }
    ])

    const result = await bridge._cmdResume(['1'], {
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      '会话恢复中，请等待信息返回后，即可开始聊天'
    )
    expect(sent).toContainEqual({
      channel: 'dingtalk:messageReceived',
      data: {
        sessionId: history.id,
        senderNick: '张三',
        text: 'hello'
      }
    })
    expect(enqueueMessage).toHaveBeenCalledWith(
      history.id,
      'hello',
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

  it('marks a direct-resumed manual session as DingTalk-bound so the toolbar can read a single binding', async () => {
    const { bridge, manager } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const history = manager.create({ type: 'chat', source: 'manual', title: '历史会话' })
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: history.id,
        title: '历史会话',
        type: 'chat',
        source: 'manual',
        updated_at: Date.now(),
      }
    ])

    const result = await bridge._cmdResume(['1'], {
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '1',
      robotCode: 'robot-1'
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(manager.sessions.get(history.id)?.imChannel).toBe('dingtalk')
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(history.id, {
      imChannel: 'dingtalk'
    })
    expect(bridge.getBinding(history.id)).toEqual({
      targetId: 'staff-1',
      displayName: '张三',
      targetType: 'user',
    })
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      '会话恢复中，请等待信息返回后，即可开始聊天'
    )
    expect(enqueueMessage).toHaveBeenCalledWith(
      history.id,
      'hello',
      'https://example.com/webhook',
      '张三',
      expect.objectContaining({
        robotCode: 'robot-1',
        senderStaffId: 'staff-1',
        conversationId: 'conv-1',
        conversationType: '1'
      })
    )
  })

  it('creates a group-bound DingTalk session when /new is issued inside a group chat', async () => {
    const { bridge, manager } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    const createSession = vi.spyOn(bridge._sessionMapper, 'createSession')

    const result = await bridge._cmdNew([], {
      mapKey: 'conv-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      robotCode: 'robot-1',
      conversationType: '2',
    }, 'https://example.com/webhook')

    expect(result).toBeNull()
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'staff-1',
        chatId: 'conv-1',
        chatType: 'chat',
        nickname: '张三',
        chatName: '测试群',
      }),
      { cwd: undefined }
    )

    const sessionId = bridge.sessionMap.get('conv-1')
    expect(typeof sessionId).toBe('string')
    expect(bridge.getBinding(sessionId)).toEqual({
      targetId: 'conv-1',
      displayName: '测试群',
      targetType: 'chat',
    })
    expect(manager.sessionDatabase.updateImIdentity).toHaveBeenCalledWith(
      sessionId,
      { userId: '', chatId: 'conv-1', chatType: 'group' }
    )
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      '会话创建中，请等待信息返回后，即可开始聊天'
    )
    expect(enqueueMessage).toHaveBeenCalledWith(
      sessionId,
      'hello',
      'https://example.com/webhook',
      '张三',
      expect.objectContaining({
        robotCode: 'robot-1',
        senderStaffId: 'staff-1',
        conversationId: 'conv-1',
        conversationType: '2',
      })
    )
  })

  it('reuses a proactively bound DingTalk group session even when inbound conversationType is missing', async () => {
    const { bridge, manager } = createHarness()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'manual', title: '群绑定会话' })
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
      targetId: 'conv-1',
      targetType: 'chat',
      displayName: '测试群',
      text: '任务已完成'
    })

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-group-missing-type',
        msgtype: 'text',
        text: { content: '大家好' },
        senderStaffId: 'staff-1',
        senderNick: '张三',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-1',
        conversationTitle: '测试群'
      })
    })

    expect(bridge.sessionMap.get('conv-1')).toBe(session.id)
    expect(bridge.sessionMap.get('staff-1')).toBeUndefined()
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      '大家好',
      'https://example.com/webhook',
      '张三',
      expect.objectContaining({
        senderStaffId: 'staff-1',
        conversationId: 'conv-1',
        conversationType: '2'
      })
    )
  })

  it('shows a proactively bound DingTalk group session in /status even when command context omits conversationType', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '群绑定会话' })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    session.meta = {
      ...(session.meta || {}),
      conversationId: 'conv-1',
      dingtalkTargetType: 'chat',
      dingtalkTargetStaffId: 'conv-1'
    }

    bridge.bindTarget(session.id, {
      targetId: 'conv-1',
      targetType: 'chat',
      displayName: '测试群'
    })

    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'manual',
            im_channel: 'dingtalk',
            title: '群绑定会话',
            im_user_id: '',
            im_chat_id: 'conv-1',
            im_chat_type: 'group',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    const text = bridge._cmdStatus({
      mapKey: 'conv-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1'
    })

    expect(text).toContain('当前会话状态：')
    expect(text).toContain('群绑定会话')
    expect(text).toContain('1. ✅')
  })

  it('still shows DingTalk group history in /status after desktop close when command context omits conversationType', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '群绑定会话' })
    const session = manager.sessions.get(created.id)
    session.meta = {
      ...(session.meta || {}),
      conversationId: 'conv-1',
      dingtalkTargetType: 'chat',
      dingtalkTargetStaffId: 'conv-1'
    }

    bridge.bindTarget(session.id, {
      targetId: 'conv-1',
      targetType: 'chat',
      displayName: '测试群'
    })

    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'im-inbound',
            im_channel: 'dingtalk',
            title: '群绑定会话',
            im_user_id: '',
            im_chat_id: 'conv-1',
            im_chat_type: 'group',
            status: manager.sessions.has(session.id) ? 'idle' : 'closed',
            updated_at: Date.now()
          }
        : null
    ))

    await manager.close(session.id)

    const text = bridge._cmdStatus({
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1',
      conversationType: ''
    })

    expect(text).toContain('当前会话状态：')
    expect(text).toContain('群绑定会话')
  })

  it('replays pending DingTalk image messages to the desktop frontend after choosing a historical session', async () => {
    const { bridge, manager, sent } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'manual', title: '历史会话' })
    const image = { base64: Buffer.from('img').toString('base64'), mediaType: 'image/png' }

    bridge._pendingChoices.set('staff-1', {
      sessions: [{ session_id: created.id, title: '历史会话', updated_at: Date.now() }],
      originalMessage: { text: '', images: [image] },
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handlePendingChoice('staff-1', '1', 'https://example.com/webhook', {
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

  it('shows waiting text when replaying a pending DingTalk message into an already-activated historical session', async () => {
    const { bridge, manager } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'manual', title: '历史会话' })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    session.status = 'streaming'

    bridge._pendingChoices.set('staff-1', {
      sessions: [{ session_id: created.id, title: '历史会话', updated_at: Date.now() }],
      originalMessage: '继续处理',
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handlePendingChoice('staff-1', '1', 'https://example.com/webhook', {
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2'
    })

    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      '✅ 已切换到会话：历史会话\n\n当前正在回复，请等待完成'
    )
    expect(enqueueMessage).toHaveBeenCalledWith(
      created.id,
      '继续处理',
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

  it('marks a menu-selected manual session as DingTalk-bound so the toolbar no longer falls back to all targets', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'manual', title: '历史会话' })

    bridge._pendingChoices.set('conv-1', {
      sessions: [{ session_id: created.id, title: '历史会话', updated_at: Date.now() }],
      originalMessage: '继续处理',
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handlePendingChoice('conv-1', '1', 'https://example.com/webhook', {
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '测试群',
      conversationType: '2'
    })

    expect(manager.sessions.get(created.id)?.imChannel).toBe('dingtalk')
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(created.id, {
      imChannel: 'dingtalk'
    })
    expect(bridge.getBinding(created.id)).toEqual({
      targetId: 'conv-1',
      displayName: '测试群',
      targetType: 'chat',
    })
    expect(bridge.sessionMap.get('conv-1')).toBe(created.id)
  })

  it('forwards desktop intervention only for the current mapped DingTalk session', async () => {
    const { bridge, manager } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    vi.spyOn(bridge, '_sendBase64Images').mockResolvedValue()
    vi.spyOn(bridge, '_sendCollectedImages').mockResolvedValue()

    const current = manager.create({ type: 'chat', source: 'manual', title: '当前会话' })
    bridge.sessionMap.set('staff-1', current.id)
    bridge._sessionWebhooks.set(current.id, {
      webhook: 'https://example.com/webhook',
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1',
      conversationType: '1',
    })

    bridge.onUserMessage(current.id, '桌面介入消息', null)
    bridge.onAgentMessage(current.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '来自桌面的回复' }],
    })
    await bridge.onAgentResult(current.id)

    expect(replyToDingTalk).toHaveBeenCalledTimes(1)
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      '💻 桌面端介入：\n> 桌面介入消息\n\n来自桌面的回复'
    )
  })

  it('does not forward desktop intervention for an older DingTalk session after rebinding the same chat', async () => {
    const { bridge, manager } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    vi.spyOn(bridge, '_sendBase64Images').mockResolvedValue()
    vi.spyOn(bridge, '_sendCollectedImages').mockResolvedValue()

    const first = manager.create({ type: 'chat', source: 'manual', title: '旧会话' })
    const second = manager.create({ type: 'chat', source: 'manual', title: '新会话' })
    bridge._sessionWebhooks.set(first.id, {
      webhook: 'https://example.com/old',
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1',
      conversationType: '1',
    })
    bridge._sessionWebhooks.set(second.id, {
      webhook: 'https://example.com/new',
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1',
      conversationType: '1',
    })
    bridge.sessionMap.set('staff-1', second.id)

    bridge.onUserMessage(first.id, '旧会话不应回发', null)
    bridge.onAgentMessage(first.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '旧会话回复' }],
    })
    await bridge.onAgentResult(first.id)

    expect(replyToDingTalk).not.toHaveBeenCalled()

    bridge.onUserMessage(second.id, '新会话应回发', null)
    bridge.onAgentMessage(second.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '新会话回复' }],
    })
    await bridge.onAgentResult(second.id)

    expect(replyToDingTalk).toHaveBeenCalledTimes(1)
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/new',
      '💻 桌面端介入：\n> 新会话应回发\n\n新会话回复'
    )
  })

  it('reuses the same DingTalk group session for different senders in the same chat', async () => {
    const { bridge, manager } = createHarness()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '群会话' })
    bridge.sessionMap.set('conv-1', created.id)
    manager.sessions.get(created.id).meta = {
      ...(manager.sessions.get(created.id).meta || {}),
      conversationId: 'conv-1'
    }

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-group-2',
        msgtype: 'text',
        text: { content: '大家好' },
        senderStaffId: 'staff-2',
        senderNick: '李四',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-1',
        conversationTitle: '测试群',
        conversationType: '2'
      })
    })

    expect(enqueueMessage).toHaveBeenCalledWith(
      created.id,
      '大家好',
      'https://example.com/webhook',
      '李四',
      expect.objectContaining({
        senderStaffId: 'staff-2',
        conversationId: 'conv-1',
        conversationType: '2'
      })
    )
    expect(bridge.sessionMap.get('conv-1')).toBe(created.id)
    expect(bridge.sessionMap.get('staff-2:conv-1')).toBeUndefined()
  })

  it('restores persisted DingTalk group bindings into the group map key on start', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '群会话' })
    const session = manager.sessions.get(created.id)

    manager.sessionDatabase.getKnownChats = vi.fn(() => [
      { chatId: 'conv-1', chatName: '测试群' }
    ])
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'im-inbound',
            im_channel: 'dingtalk',
            title: '群会话',
            im_user_id: '',
            im_chat_id: 'conv-1',
            im_chat_type: 'group',
            status: 'idle'
          }
        : null
    ))
    vi.spyOn(bridge, '_connect').mockResolvedValue()

    bridge.configManager.getConfig = () => ({
      settings: { agent: { outputBaseDir: tempDir } },
      dingtalk: { enabled: true, appKey: 'app-key', appSecret: 'secret', maxHistorySessions: 5 }
    })

    const started = await bridge.start()

    expect(started).toBe(true)
    expect(bridge.sessionMap.get('conv-1')).toBe(session.id)
    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'conv-1',
      displayName: '测试群',
      targetType: 'chat',
    })
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
    bridge.sessionMap.set('staff-1', session.id)
    manager.sessionDatabase.updateImIdentity(session.id, {
      userId: 'staff-1',
      chatId: 'conv-1',
      chatType: 'p2p'
    })

    const text = bridge._cmdStatus({
      mapKey: 'staff-1',
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
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    const text = bridge._cmdStatus({
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1'
    })

    expect(manager.sessionDatabase.getImSessionsByType).toHaveBeenCalledWith('dingtalk', 'staff-1', '', 5)
    expect(text).toContain('当前会话状态：')
    expect(text).toContain('Notebook 会话')
  })

  it('keeps a DingTalk p2p session discoverable in /status after desktop close when it was created from choice menu 0', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    const createSession = vi.spyOn(bridge._sessionMapper, 'createSession')

    const history = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '历史会话' })
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: history.id,
        title: '历史会话',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'dingtalk',
        im_user_id: 'staff-1',
        im_chat_id: 'conv-1',
        im_chat_type: 'p2p',
        status: 'idle',
        updated_at: Date.now()
      }
    ])

    bridge._pendingChoices.set('staff-1', {
      sessions: [{ session_id: history.id, title: '历史会话', updated_at: Date.now() }],
      originalMessage: '你好',
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handlePendingChoice('staff-1', '0', 'https://example.com/webhook', {
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-1',
      conversationTitle: '张三',
      conversationType: '1'
    })

    const createdSessionId = bridge.sessionMap.get('staff-1')
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'staff-1',
      chatId: 'conv-1',
      chatType: 'p2p',
      nickname: '张三',
      chatName: '张三',
    }))
    expect(createdSessionId).toBeTruthy()
    expect(createdSessionId).not.toBe(history.id)

    const createdRow = manager.sessionDatabase.getAgentConversation(createdSessionId)
    expect(createdRow).toEqual(expect.objectContaining({
      im_channel: 'dingtalk',
      im_user_id: 'staff-1',
      im_chat_id: '',
      im_chat_type: 'p2p',
      title: '钉钉 · 张三'
    }))
    expect(createdRow.title).not.toContain('钉钉 · 张三 · 张三')

    await manager.close(createdSessionId)

    manager.sessionDatabase.getImSessionsByType.mockImplementation((type, userId, conversationId) => {
      const rows = [history.id, createdSessionId]
        .map(sessionId => manager.sessionDatabase.getAgentConversation(sessionId))
        .filter(Boolean)
        .filter(row => row.im_channel === type)
        .filter(row => row.im_user_id === userId)
        .filter(row => conversationId ? row.im_chat_id === conversationId : true)
        .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))
      return rows
    })

    const text = bridge._cmdStatus({
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1',
      conversationType: '1'
    })

    expect(text).toContain('当前会话状态：')
    expect(text).toContain('钉钉 · 张三')
  })

  it('keeps a DingTalk group session discoverable in /status after desktop close when it was created from choice menu 0', async () => {
    const { bridge, manager } = createHarness()
    vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    const createSession = vi.spyOn(bridge._sessionMapper, 'createSession')

    const history = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '群历史会话' })
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: history.id,
        title: '群历史会话',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'dingtalk',
        im_user_id: '',
        im_chat_id: 'conv-group',
        im_chat_type: 'group',
        status: 'idle',
        updated_at: Date.now()
      }
    ])

    bridge._pendingChoices.set('conv-group', {
      sessions: [{ session_id: history.id, title: '群历史会话', updated_at: Date.now() }],
      originalMessage: '大家好',
      timer: setTimeout(() => {}, 1000)
    })

    await bridge._handlePendingChoice('conv-group', '0', 'https://example.com/webhook', {
      robotCode: 'robot-1',
      senderStaffId: 'staff-1',
      senderNick: '张三',
      conversationId: 'conv-group',
      conversationTitle: '项目群',
      conversationType: '2'
    })

    const createdSessionId = bridge.sessionMap.get('conv-group')
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'staff-1',
      chatId: 'conv-group',
      chatType: 'chat',
      nickname: '张三',
      chatName: '项目群',
    }))
    expect(createdSessionId).toBeTruthy()
    expect(createdSessionId).not.toBe(history.id)

    const createdRow = manager.sessionDatabase.getAgentConversation(createdSessionId)
    expect(createdRow).toEqual(expect.objectContaining({
      im_channel: 'dingtalk',
      im_user_id: '',
      im_chat_id: 'conv-group',
      im_chat_type: 'group'
    }))

    await manager.close(createdSessionId)

    manager.sessionDatabase.getImSessionsByType.mockImplementation((type, userId, conversationId) => {
      const rows = [history.id, createdSessionId]
        .map(sessionId => manager.sessionDatabase.getAgentConversation(sessionId))
        .filter(Boolean)
        .filter(row => row.im_channel === type)
        .filter(row => row.im_user_id === userId)
        .filter(row => row.im_chat_id === conversationId)
        .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))
      return rows
    })

    const text = bridge._cmdStatus({
      mapKey: 'conv-group',
      senderStaffId: 'staff-1',
      conversationId: 'conv-group',
      conversationType: '2'
    })

    expect(text).toContain('当前会话状态：')
    expect(text).toContain('钉钉 · 项目群')
    expect(text).not.toContain('钉钉 · 项目群 · 张三')
  })

  it('shows a proactively bound DingTalk p2p session in /status even when the DB chat id is still empty', () => {
    const { bridge, manager } = createHarness()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const created = manager.create({ type: 'chat', source: 'manual', title: '单聊绑定会话' })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    session.meta = {
      ...(session.meta || {}),
      conversationId: 'conv-1',
      dingtalkTargetType: 'user',
      dingtalkTargetStaffId: 'staff-1'
    }

    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      targetType: 'user',
      displayName: '张三'
    })

    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'manual',
            im_channel: 'dingtalk',
            title: '单聊绑定会话',
            im_user_id: 'staff-1',
            im_chat_id: '',
            im_chat_type: 'p2p',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    const text = bridge._cmdStatus({
      mapKey: 'staff-1',
      senderStaffId: 'staff-1',
      conversationId: 'conv-1',
      conversationType: '1'
    })

    expect(text).toContain('当前会话状态：')
    expect(text).toContain('单聊绑定会话')
    expect(text).toContain('1. ✅')
  })

  it('treats inbound DingTalk p2p commands as single chat when conversationType is missing', async () => {
    const { bridge, manager } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const created = manager.create({ type: 'chat', source: 'manual', title: '单聊绑定会话' })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    session.meta = {
      ...(session.meta || {}),
      conversationId: 'conv-1',
      dingtalkTargetType: 'user',
      dingtalkTargetStaffId: 'staff-1'
    }

    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      targetType: 'user',
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
            title: '单聊绑定会话',
            im_user_id: 'staff-1',
            im_chat_id: '',
            im_chat_type: 'p2p',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-status-p2p-missing-type',
        msgtype: 'text',
        text: { content: '/status' },
        senderStaffId: 'staff-1',
        senderNick: '张三',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-1',
        conversationTitle: '张三'
      })
    })

    expect(replyToDingTalk).toHaveBeenCalledTimes(1)
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.stringContaining('单聊绑定会话')
    )
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.not.stringContaining('没有历史会话记录')
    )
  })

  it('restores DingTalk p2p binding display name from sender nickname instead of staff id', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', title: '钉钉 · 张三' })
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
            title: '钉钉 · 张三',
            im_user_id: 'staff-1',
            im_chat_id: 'conv-1',
            im_chat_type: 'p2p',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    expect(bridge.getBinding(session.id)).toEqual(expect.objectContaining({
      targetId: 'staff-1',
      targetType: 'user',
      displayName: '张三'
    }))
  })

  it('keeps raw DingTalk conversationType 2 as group chat even when the sender has a p2p binding', async () => {
    const { bridge, manager } = createHarness()
    const replyToDingTalk = vi.spyOn(bridge, '_replyToDingTalk').mockResolvedValue()
    const created = manager.create({ type: 'chat', source: 'manual', title: '单聊绑定会话' })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    session.meta = {
      ...(session.meta || {}),
      conversationId: 'conv-1',
      dingtalkTargetType: 'user',
      dingtalkTargetStaffId: 'staff-1'
    }

    bridge.bindTarget(session.id, {
      targetId: 'staff-1',
      targetType: 'user',
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
            title: '单聊绑定会话',
            im_user_id: 'staff-1',
            im_chat_id: '',
            im_chat_type: 'p2p',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    await bridge._handleDingTalkMessage({
      data: JSON.stringify({
        msgId: 'msg-status-p2p-raw-group',
        msgtype: 'text',
        text: { content: '/status' },
        senderStaffId: 'staff-1',
        senderNick: '张三',
        sessionWebhook: 'https://example.com/webhook',
        robotCode: 'robot-1',
        conversationId: 'conv-1',
        conversationType: '2',
        isInAtList: true,
        atUsers: [{ staffId: 'robot-1', dingtalkId: 'robot-1', name: 'HydroDesktop' }]
      })
    })

    expect(replyToDingTalk).toHaveBeenCalledTimes(1)
    expect(replyToDingTalk).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.stringContaining('没有历史会话记录')
    )
    expect(bridge.sessionMap.get('staff-1')).toBe(session.id)
    expect(bridge.sessionMap.get('conv-1')).toBeUndefined()
  })

  it('does not consume or clear a DingTalk group target when looking up a p2p binding by sender', () => {
    const { bridge, manager } = createHarness()
    const groupSession = manager.create({ type: 'chat', source: 'manual', title: '群绑定会话' })

    bridge.bindTarget(groupSession.id, {
      targetId: 'staff-1',
      targetType: 'chat',
      displayName: '项目群'
    })

    const found = bridge._findBoundSessionIdByStaffId('staff-1', {
      mapKey: 'staff-1',
      allowDatabaseFallback: false
    })

    expect(found).toBeNull()
    expect(bridge._targetSessionMap.get('staff-1')).toBe(groupSession.id)
    expect(bridge.sessionMap.get('staff-1')).toBe(groupSession.id)
    expect(bridge._sessionTargets.get(groupSession.id)).toEqual(expect.objectContaining({
      targetType: 'chat',
      staffId: 'staff-1'
    }))
  })

})

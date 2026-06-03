import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'

const { AgentSessionManager } = await import('../../src/main/agent-session-manager.js')
const { FeishuBridge } = await import('../../src/main/managers/feishu-bridge.js')
const { FeishuEventClient } = await import('../../src/main/managers/feishu-event-client.js')
const { FeishuMessageAPI } = await import('../../src/main/managers/feishu-message-api.js')
const { ImSessionMapper } = await import('../../src/main/managers/im-session-mapper.js')

describe('FeishuBridge', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-feishu-bridge-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function createManager() {
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
        feishu: {
          enabled: true,
          appId: 'app-id',
          appSecret: 'app-secret',
          defaultCwd: '',
          maxHistorySessions: 5
        }
      }),
      getDefaultProfile: () => ({ id: 'p1', baseUrl: 'https://example.com' }),
      getAPIProfile: () => null
    }
    const manager = new AgentSessionManager(mainWindow, configManager)
    manager.sessionDatabase = {
      insertAgentMessage: vi.fn(),
      updateAgentConversation: vi.fn(),
      updateAgentConversationTitle: vi.fn(),
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      setImChannel: vi.fn(),
      clearImIdentity: vi.fn(),
      getAgentConversation: vi.fn((sessionId) => ({
        id: 1,
        session_id: sessionId,
        type: 'chat',
        title: '飞书历史会话',
        cwd: tempDir,
        source: 'im-inbound',
        im_channel: 'feishu',
        status: 'idle',
        cwd_auto: 0,
        message_count: 0,
        total_cost_usd: 0,
        created_at: Date.now(),
        api_profile_id: null,
        api_base_url: null
      })),
      getImSessionsByType: vi.fn(() => []),
      updateImIdentity: vi.fn()
    }
    return { mainWindow, configManager, manager, sent }
  }

  it.skip('routes interactive card actions into the command handler', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const commandSpy = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { intent: 'resume', index: 2 },
      userId: 'ou_xxx',
      chatId: 'oc_xxx'
    })

    expect(commandSpy).toHaveBeenCalledWith('/resume 2', expect.objectContaining({
      senderId: 'ou_xxx',
      senderName: null,
      chatId: 'oc_xxx',
      chatName: null,
      chatType: 'p2p'
    }), {
      cardValue: { intent: 'resume', index: 2 }
    })
  })

  it('broadcasts disabled status when Feishu bridge is stopped', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    bridge._eventClient._connected = true
    bridge._eventClient._runtimeState = 'connected'

    await bridge.stop()

    expect(sent).toContainEqual({
      channel: 'feishu:statusChange',
      data: {
        connected: false,
        activeSessions: 0,
        runtimeState: 'disabled',
      }
    })
  })

  it('binds a proactive Feishu target and reuses the same session on the first reply', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendSpy = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    const sendResult = await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '任务已完成'
    })

    expect(sendSpy).toHaveBeenCalledWith('open_id', 'ou_target', '任务已完成')
    expect(sendResult).toMatchObject({ success: true, targetId: 'ou_target', messageId: 'om_send_1' })
    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'ou_target',
      displayName: '张三'
    })

    const sessionId = await bridge._ensureSession(
      {
        userId: 'ou_target',
        chatId: 'oc_reply',
        chatType: 'p2p',
        nickname: '张三',
        chatName: '张三'
      },
      { text: '收到', images: [] },
      'ou_target',
      'oc_reply',
      'p2p'
    )

    expect(sessionId).toBe(session.id)
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBe(session.id)
    expect(manager.sessionDatabase.updateImIdentity).toHaveBeenCalledWith(session.id, expect.objectContaining({ userId: 'ou_target', chatId: 'oc_reply' }))
  })

  it('reuses the proactively bound session on first p2p reply even after in-memory Feishu target mapping is lost', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_target',
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
      im_channel: 'feishu',
      status: 'idle',
      staff_id: 'ou_target',
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
        im_channel: 'feishu',
        title: '桌面会话',
        staff_id: 'ou_target',
        conversation_id: '',
        status: 'idle',
        updated_at: Date.now()
      }
    ])

    const reboundSessionId = await bridge._ensureSession(
      {
        userId: 'ou_target',
        chatId: 'oc_reply',
        chatType: 'p2p',
        nickname: '张三',
        chatName: '张三'
      },
      { text: '收到', images: [] },
      'ou_target',
      'oc_reply',
      'p2p'
    )

    expect(reboundSessionId).toBe(session.id)
    expect(bridge._targetSessionMap.get('ou_target')).toBe(session.id)
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBe(session.id)
  })

  it('switches the active Feishu reply binding to the latest desktop session for the same user', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const first = manager.create({ type: 'chat', source: 'manual', title: '会话1', cwd: tempDir })
    const second = manager.create({ type: 'chat', source: 'manual', title: '会话2', cwd: tempDir })

    await bridge.sendToTarget({
      sessionId: first.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '第一条'
    })

    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', first.id)
    bridge._sessionIdentities.set(first.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })

    await bridge.sendToTarget({
      sessionId: second.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '第二条'
    })

    expect(bridge._targetSessionMap.get('ou_target')).toBe(second.id)
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBeUndefined()

    const reboundSessionId = await bridge._ensureSession(
      {
        userId: 'ou_target',
        chatId: 'oc_reply',
        chatType: 'p2p',
        nickname: '张三',
        chatName: '张三'
      },
      { text: '收到第二条', images: [] },
      'ou_target',
      'oc_reply',
      'p2p'
    )

    expect(reboundSessionId).toBe(second.id)
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBe(second.id)
  })

  it('switches active Feishu replies when the old inbound session only has a chat map', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const inbound = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'feishu', title: '旧入站会话', cwd: tempDir })
    const desktop = manager.create({ type: 'chat', source: 'manual', title: '新桌面会话', cwd: tempDir })

    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', inbound.id)
    bridge._sessionIdentities.set(inbound.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    expect(bridge._targetSessionMap.get('ou_target')).toBeUndefined()

    await bridge.sendToTarget({
      sessionId: desktop.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '从新桌面会话发送'
    })

    expect(bridge._targetSessionMap.get('ou_target')).toBe(desktop.id)
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBeUndefined()
    expect(bridge._sessionIdentities.get(inbound.id)).toBeUndefined()

    const reboundSessionId = await bridge._ensureSession(
      {
        userId: 'ou_target',
        chatId: 'oc_reply',
        chatType: 'p2p',
        nickname: '张三',
        chatName: '张三'
      },
      { text: '回复新桌面会话', images: [] },
      'ou_target',
      'oc_reply',
      'p2p'
    )

    expect(reboundSessionId).toBe(desktop.id)
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBe(desktop.id)
  })

  it('only clears the old p2p map key when rebinding the same Feishu user to a newer desktop session', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const first = manager.create({ type: 'chat', source: 'manual', title: '会话1', cwd: tempDir })
    const second = manager.create({ type: 'chat', source: 'manual', title: '会话2', cwd: tempDir })

    await bridge.sendToTarget({
      sessionId: first.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '第一条'
    })

    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', first.id)
    bridge._sessionMapper.sessionMap.set('ou_target:oc_group', first.id)
    bridge._sessionIdentities.set(first.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })

    await bridge.sendToTarget({
      sessionId: second.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '第二条'
    })

    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBeUndefined()
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_group')).toBe(first.id)
  })

  it('clears Feishu inbound routing state after unbinding a proactively bound session', () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    bridge._sessionTargets.set(session.id, {
      openId: 'ou_target',
      displayName: '张三'
    })
    bridge._targetSessionMap.set('ou_target', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', session.id)
    bridge._sessionMapper.sessionMap.set('ou_target:oc_group', session.id)

    expect(bridge.unbindTarget(session.id)).toEqual({ success: true })

    expect(bridge._targetSessionMap.get('ou_target')).toBeUndefined()
    expect(bridge._sessionTargets.get(session.id)).toBeUndefined()
    expect(bridge._sessionIdentities.get(session.id)).toBeUndefined()
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBeUndefined()
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_group')).toBeUndefined()
    expect(manager.sessionDatabase.setImChannel).toHaveBeenCalledWith(session.id, null)
    expect(manager.sessionDatabase.clearImIdentity).toHaveBeenCalledWith(session.id)
  })

  it('does not auto-rebind the same Feishu user after manual unbind', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '任务已完成'
    })
    bridge.unbindTarget(session.id)

    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => ({
      id: 1,
      session_id: sessionId,
      type: 'chat',
      title: sessionId === session.id ? '旧会话' : '新会话',
      cwd: tempDir,
      source: 'im-inbound',
      im_channel: sessionId === session.id ? null : 'feishu',
      status: 'idle',
      staff_id: sessionId === session.id ? null : 'ou_target',
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
        source: 'manual',
        im_channel: null,
        title: '旧会话',
        staff_id: null,
        conversation_id: null,
        status: 'idle',
        updated_at: Date.now()
      }
    ])

    const reboundSessionId = await bridge._ensureSession(
      {
        userId: 'ou_target',
        chatId: 'ou_target',
        chatType: 'p2p',
        nickname: '张三',
        chatName: '张三'
      },
      { text: '解绑后再次入站', images: [] },
      'ou_target',
      'ou_target',
      'p2p'
    )

    expect(reboundSessionId).not.toBe(session.id)
    expect(bridge._targetSessionMap.get('ou_target')).toBeUndefined()
  })

  it('does not lock a session to Feishu when the proactive send fails', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockRejectedValue(new Error('network down'))

    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    await expect(bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '任务已完成'
    })).rejects.toThrow('network down')

    expect(session.source).toBe('manual')
    expect(bridge.getBinding(session.id)).toBe(null)
    expect(bridge._targetSessionMap.get('ou_target')).toBeUndefined()
    expect(manager.sessionDatabase.updateAgentConversation).not.toHaveBeenCalledWith(session.id, {
      source: 'feishu'
    })
    expect(manager.sessionDatabase.updateImIdentity).not.toHaveBeenCalledWith(session.id, expect.objectContaining({ userId: 'ou_target', chatId: '' }))
  })

  it('persists the proactive Feishu target identity when binding a normal session', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    bridge.bindTarget(session.id, {
      targetId: 'ou_target',
      displayName: '张三'
    })

    expect(manager.sessionDatabase.updateImIdentity).toHaveBeenCalledWith(session.id, expect.objectContaining({ userId: 'ou_target', chatId: '' }))
  })

  it('locks a normal session to Feishu after first proactive send', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '任务已完成'
    })

    expect(session.imChannel).toBe('feishu')
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(session.id, {
      imChannel: 'feishu'
    })
    expect(() => manager.bindSessionExternalImSource(session.id, 'weixin')).toThrow(/已绑定feishu渠道/)
  })

  it('rejects sending a Feishu-bound session to another target before network send', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendSpy = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    bridge.bindTarget(session.id, {
      targetId: 'ou_target_1',
      displayName: '张三'
    })

    await expect(bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_target_2',
      displayName: '李四',
      text: '任务已完成'
    })).rejects.toThrow(/当前会话已绑定飞书联系人「张三」/)

    expect(sendSpy).not.toHaveBeenCalled()
    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'ou_target_1',
      displayName: '张三'
    })
    expect(bridge._targetSessionMap.get('ou_target_2')).toBeUndefined()
  })

  it('rejects rebinding a persisted Feishu target after in-memory binding is lost', () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    const created = manager.create({ type: 'chat', source: 'feishu', title: '桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    bridge._sessionTargets.clear()
    bridge._targetSessionMap.clear()
    bridge._sessionIdentities.clear()
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'feishu',
            title: '桌面会话',
            staff_id: 'ou_target_1',
            conversation_id: '',
            status: 'idle'
          }
        : null
    ))

    expect(() => bridge.bindTarget(session.id, {
      targetId: 'ou_target_2',
      displayName: '李四'
    })).toThrow(/当前会话已绑定飞书联系人「ou_target_1」/)
  })

  it('restores a persisted Feishu target binding for toolbar filtering after memory is lost', () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    const created = manager.create({ type: 'chat', source: 'feishu', title: '桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    bridge._sessionTargets.clear()
    bridge._targetSessionMap.clear()
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'im-inbound',
            im_channel: 'feishu',
            title: '桌面会话',
            staff_id: 'ou_target',
            conversation_id: '',
            status: 'idle'
          }
        : null
    ))

    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'ou_target',
      displayName: 'ou_target'
    })
    expect(bridge._targetSessionMap.get('ou_target')).toBe(session.id)
    expect(bridge._sessionIdentities.get(session.id)).toEqual({
      senderId: 'ou_target',
      senderName: 'ou_target',
      chatId: null,
      chatType: 'p2p',
      chatName: 'ou_target'
    })
  })

  it('keeps the persisted Feishu target available after /close clears in-memory binding', () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    const created = manager.create({ type: 'chat', source: 'feishu', title: '桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    bridge.bindTarget(session.id, {
      targetId: 'ou_target',
      displayName: '张三'
    })
    bridge._clearSessionIdentity(session.id)
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'im-inbound',
            im_channel: 'feishu',
            title: '桌面会话',
            staff_id: 'ou_target',
            conversation_id: 'oc_reply',
            status: 'closed'
          }
        : null
    ))

    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'ou_target',
      displayName: 'ou_target'
    })
    expect(bridge._targetSessionMap.get('ou_target')).toBe(session.id)
    expect(bridge._sessionIdentities.get(session.id)).toEqual({
      senderId: 'ou_target',
      senderName: 'ou_target',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: 'ou_target'
    })
  })

  it('restores Feishu target binding after the session database is injected later', () => {
    const { configManager, manager, mainWindow } = createManager()
    const db = manager.sessionDatabase
    manager.sessionDatabase = null
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase = db

    const created = manager.create({ type: 'chat', source: 'feishu', title: '桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'im-inbound',
            im_channel: 'feishu',
            title: '桌面会话',
            staff_id: 'ou_target',
            conversation_id: '',
            status: 'idle'
          }
        : null
    ))

    expect(bridge.getBinding(session.id)).toEqual({
      targetId: 'ou_target',
      displayName: 'ou_target'
    })
  })

  it('keeps Feishu target names empty instead of falling back to openId', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'listUsers').mockResolvedValue([
      { openId: 'ou_target', userId: 'user-1', displayName: '', name: '' }
    ])

    const targets = await bridge.listSendableTargets()

    expect(targets).toEqual([
      expect.objectContaining({
        id: 'ou_target',
        openId: 'ou_target',
        displayName: '',
        name: ''
      })
    ])
  })

  it('hydrates Feishu proactive target names from user detail when list results only contain openId', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'listUsers').mockResolvedValue([
      { openId: 'ou_target', userId: 'user-1', displayName: 'ou_target', name: 'ou_target' }
    ])
    vi.spyOn(bridge._api, 'getUserInfo').mockResolvedValue({
      name: '张越胜'
    })

    const targets = await bridge.listSendableTargets()

    expect(bridge._api.getUserInfo).toHaveBeenCalledWith('ou_target')
    expect(targets).toEqual([
      expect.objectContaining({
        id: 'ou_target',
        openId: 'ou_target',
        displayName: '张越胜',
        name: '张越胜'
      })
    ])
  })

  it.skip('preserves group-chat context for card actions instead of forcing p2p', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '群会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    bridge._sessionMapper.sessionMap.set('ou_group:oc_group', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_group',
      chatId: 'oc_old',
      chatType: 'p2p'
    })

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { command: 'status' },
      userId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'chat_id',
      'oc_group',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '当前会话状态'
          })
        }),
        elements: expect.arrayContaining([
          expect.objectContaining({
            tag: 'markdown',
            content: expect.stringContaining('✅')
          }),
          expect.objectContaining({
            tag: 'action',
            actions: expect.arrayContaining([
              expect.objectContaining({
                value: expect.objectContaining({
                  intent: 'new',
                  chatId: 'oc_group',
                  chatType: 'chat',
                  senderId: 'ou_group',
                })
              })
            ])
          })
        ])
      })
    )
  })

  it.skip('supports explicit command payloads from card actions', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const commandSpy = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { command: 'status' },
      userId: 'ou_xxx',
      chatId: 'oc_xxx'
    })

    expect(commandSpy).toHaveBeenCalledWith('/status', expect.any(Object), {
      cardValue: { command: 'status' }
    })
  })

  it.skip('passes card context when clicking status from an existing status card', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const commandSpy = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: {
        intent: 'status',
        senderId: 'ou_xxx',
        senderName: '张三',
        chatId: 'oc_xxx',
        chatType: 'p2p',
        chatName: '张三'
      },
      userId: 'ou_fallback',
      chatId: 'oc_fallback',
      chatType: 'p2p'
    })

    expect(commandSpy).toHaveBeenCalledWith(
      '/status',
      expect.objectContaining({
        senderId: 'ou_xxx',
        senderName: '张三',
        chatId: 'oc_xxx',
        chatType: 'p2p',
        chatName: '张三'
      }),
      {
        cardValue: {
          intent: 'status',
          senderId: 'ou_xxx',
          senderName: '张三',
          chatId: 'oc_xxx',
          chatType: 'p2p',
          chatName: '张三'
        }
      }
    )
  })

  it.skip('passes card metadata into the command handler for history-choice actions', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const commandSpy = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { intent: 'resume', index: 1, source: 'history-choice' },
      userId: 'ou_xxx',
      chatId: 'oc_xxx'
    })

    expect(commandSpy).toHaveBeenCalledWith(
      '/resume 1',
      expect.objectContaining({
        senderId: 'ou_xxx',
        chatId: 'oc_xxx'
      }),
      {
        cardValue: { intent: 'resume', index: 1, source: 'history-choice' }
      }
    )
  })

  it.skip('routes help card actions into the command handler', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const commandSpy = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { command: 'resume' },
      userId: 'ou_xxx',
      chatId: 'oc_xxx'
    })

    expect(commandSpy).toHaveBeenCalledWith('/resume', expect.any(Object), {
      cardValue: { command: 'resume' }
    })
  })

  it('downloads inbound Feishu images and forwards the message to Agent when there is no history', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const downloadedImage = {
      base64: Buffer.from('image').toString('base64'),
      mediaType: 'image/png'
    }
    vi.spyOn(bridge._api, 'downloadImage').mockResolvedValue(downloadedImage)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '请分析这张图',
      images: [{ imageKey: 'img_1', messageId: 'om_1' }]
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(bridge._api.downloadImage).toHaveBeenCalledWith('img_1', 'om_1')
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      {
        text: '请分析这张图',
        images: [downloadedImage]
      },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(sent.map(item => item.channel)).toEqual([
      'feishu:sessionCreated',
      'feishu:messageReceived'
    ])
  })

  it('skips hydrate and display-name resolution for duplicate Feishu message ids', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const hydrateSpy = vi.spyOn(bridge, '_hydrateInboundEvent').mockResolvedValue({
      msgId: 'om_dup_1',
      senderId: 'ou_dup',
      senderName: null,
      chatId: 'oc_dup',
      chatType: 'p2p',
      chatName: null,
      text: '你好',
      images: [],
      unsupported: false,
      msgType: 'text',
      mentions: []
    })
    const resolveNamesSpy = vi.spyOn(bridge, '_resolveFeishuDisplayNames').mockResolvedValue({
      senderName: '张三',
      chatName: '张三'
    })
    vi.spyOn(bridge, '_ensureSession').mockResolvedValue('s-dup')
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    const duplicateEvent = {
      msgId: 'om_dup_1',
      senderId: 'ou_dup',
      chatId: 'oc_dup',
      chatType: 'p2p',
      text: '你好',
      images: []
    }

    await bridge._handleFeishuMessage(duplicateEvent)
    await bridge._handleFeishuMessage(duplicateEvent)

    expect(hydrateSpy).toHaveBeenCalledTimes(1)
    expect(resolveNamesSpy).toHaveBeenCalledTimes(1)
    expect(bridge._ensureSession).toHaveBeenCalledTimes(1)
    expect(bridge._enqueueMessage).toHaveBeenCalledTimes(1)
  })

  it('uses readable sender and chat names for default Feishu session titles', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    bridge._api.setCredentials('app-id', 'app-secret')
    vi.spyOn(bridge._api, 'getUserInfo').mockResolvedValue({ name: '张三' })
    vi.spyOn(bridge._api, 'getChatInfo').mockResolvedValue({ name: '张三' })
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])

    await bridge._handleFeishuMessage({
      msgId: 'om_named_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '你好',
      images: []
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(session.title).toBe('飞书 · 张三')
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '你好', images: undefined },
      '张三',
      'oc_xxx',
      'p2p'
    )
  })

  it('ignores placeholder Feishu ids when resolving display names', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    bridge._api.setCredentials('app-id', 'app-secret')
    const getUserInfo = vi.spyOn(bridge._api, 'getUserInfo').mockResolvedValue({ name: '张三' })
    const getChatInfo = vi.spyOn(bridge._api, 'getChatInfo').mockResolvedValue({ name: '项目群' })

    const resolved = await bridge._resolveFeishuDisplayNames({
      senderId: 'ou_xxx',
      senderName: 'ou_xxx',
      chatId: 'oc_xxx',
      chatName: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(getUserInfo).toHaveBeenCalledWith('ou_xxx')
    expect(getChatInfo).toHaveBeenCalledWith('oc_xxx')
    expect(resolved).toEqual({
      senderName: '张三',
      chatName: '项目群'
    })
  })

  it('forwards inbound Feishu post text and images instead of treating them as empty', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const downloadedImage = {
      base64: Buffer.from('post-image').toString('base64'),
      mediaType: 'image/png'
    }
    vi.spyOn(bridge._api, 'downloadImage').mockResolvedValue(downloadedImage)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_post_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      msgType: 'post',
      text: '请分析这张图',
      images: [{ imageKey: 'img_post_1', messageId: 'om_post_1' }]
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(bridge._api.downloadImage).toHaveBeenCalledWith('img_post_1', 'om_post_1')
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      {
        text: '请分析这张图',
        images: [downloadedImage]
      },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(sent.map(item => item.channel)).toEqual([
      'feishu:sessionCreated',
      'feishu:messageReceived'
    ])
  })

  it('replies with an explicit notice for unsupported Feishu message types', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_file_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      msgType: 'file',
      text: '',
      images: [],
      unsupported: true
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.stringContaining('暂不支持该类型的飞书消息')
    )
    expect(enqueueMessage).not.toHaveBeenCalled()
  })

  it('propagates Feishu startup failures so the caller can treat start as failed', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._eventClient, 'connect').mockRejectedValue(new Error('ws failed'))

    await expect(bridge.start()).rejects.toThrow('ws failed')
  })

  it('clears pending Feishu replay state on stop', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: { text: '待发送', images: undefined },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })
    bridge._processedMsgIds.set('om_1', Date.now())
    bridge._msgIdCleanupTimer = setInterval(() => {}, 1000)

    await bridge.stop()

    expect(bridge._pendingMessages.size).toBe(0)
    expect(bridge._processedMsgIds.size).toBe(0)
    expect(bridge._msgIdCleanupTimer).toBe(null)
  })

  it('treats non-numeric text as history-choice input while a pending choice exists', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const handleChoiceReply = vi.spyOn(bridge, '_handleChoiceReply').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {}
    })

    await bridge._handleFeishuMessage({
      msgId: 'om_pending_text_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '不是数字'
    })

    expect(handleChoiceReply).toHaveBeenCalledWith(
      'ou_xxx:oc_xxx',
      '不是数字',
      expect.objectContaining({
        userId: 'ou_xxx',
        chatId: 'oc_xxx',
        chatType: 'p2p',
        nickname: 'ou_xxx',
        chatName: 'ou_xxx'
      }),
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(enqueueMessage).not.toHaveBeenCalled()

    clearTimeout(bridge._sessionMapper._pendingChoices.get('ou_xxx:oc_xxx').timer)
  })

  it.skip('prompts for historical session selection when mapped Feishu session was closed on desktop', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const createSession = vi.spyOn(bridge._sessionMapper, 'createSession')
    vi.spyOn(bridge._sessionMapper, 'initPendingChoice').mockImplementation(async (_mapKey, _sessions, onSendChoiceMenu) => {
      await onSendChoiceMenu('检测到 1 个历史会话，请回复数字选择：\n0 — 创建新会话\n1 — 历史会话 1')
      return { sessionId: null }
    })
    const closedSessionId = 'closed-feishu-session'

    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', closedSessionId)
    bridge._sessionIdentities.set(closedSessionId, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => {
      if (sessionId === closedSessionId) {
        return {
          id: 1,
          session_id: sessionId,
          type: 'feishu',
          title: '已关闭会话',
          cwd: tempDir,
          source: 'feishu',
          status: 'closed'
        }
      }
      return {
        id: 2,
        session_id: 'hist-1',
        type: 'feishu',
        title: '历史会话 1',
        cwd: tempDir,
        source: 'feishu',
        status: 'idle'
      }
    })
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', type: 'feishu' }
    ])

    await bridge._handleFeishuMessage({
      msgId: 'om_closed_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '继续之前的话题'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.stringContaining('检测到 1 个历史会话')
    )
    expect(createSession).not.toHaveBeenCalled()
    expect(bridge._pendingMessages.get('ou_xxx:oc_xxx')?.message).toEqual({
      text: '继续之前的话题',
      images: undefined
    })
  })

  it('reopens mapped Feishu session from agent conversation record instead of creating a new one', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const createSession = vi.spyOn(bridge._sessionMapper, 'createSession')
    const reopen = vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      manager.sessions.set(sessionId, {
        id: sessionId,
        type: 'feishu',
        title: '恢复中的会话',
        cwd: tempDir,
        source: 'feishu'
      })
      return { id: sessionId, type: 'feishu', title: '恢复中的会话' }
    })

    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', 'live-db-session')
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => ({
      id: 1,
      session_id: sessionId,
      type: 'feishu',
      title: '恢复中的会话',
      cwd: tempDir,
      source: 'feishu',
      status: 'idle'
    }))

    const sessionId = await bridge._ensureSession(
      { userId: 'ou_xxx', chatId: 'oc_xxx', chatType: 'p2p' },
      { text: '继续', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )

    expect(sessionId).toBe('live-db-session')
    expect(reopen).toHaveBeenCalledWith('live-db-session')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('sends desktop intervention images back to Feishu on agent result', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const uploadImage = vi.spyOn(bridge._api, 'uploadImage').mockResolvedValue('img_uploaded')
    const sendImageMessage = vi.spyOn(bridge._api, 'sendImageMessage').mockResolvedValue('om_img')
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    const session = manager.create({ type: 'feishu', source: 'feishu', title: '飞书会话', cwd: tempDir })
    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', session.id)
    bridge._sessionTargets.set(session.id, {
      targetId: 'ou_xxx',
      displayName: '张三'
    })
    bridge._targetSessionMap.set('ou_xxx', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    bridge._onDesktopIntervention(session.id, '请看这张标注图', [
      {
        base64: Buffer.from('pngdata').toString('base64'),
        mediaType: 'image/png'
      }
    ])

    await bridge._onAgentResult(session.id)

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.stringContaining('桌面介入> 请看这张标注图')
    )
    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(sendImageMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', 'img_uploaded')
  })

  it('treats a bound chat session like a Feishu desktop intervention target', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const desktopIntervention = vi.spyOn(bridge, '_onDesktopIntervention').mockImplementation(() => {})

    const created = manager.create({ type: 'chat', source: 'manual', title: '普通桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge.bindTarget(session.id, {
      targetId: 'ou_target',
      displayName: '张三'
    })

    bridge._agentListeners.userMessage({
      sessionId: session.id,
      sessionType: 'chat',
      content: '桌面继续',
      images: undefined,
      source: 'manual'
    })

    expect(desktopIntervention).toHaveBeenCalledWith(session.id, '桌面继续', undefined)
  })

  it('does not forward desktop intervention for a proactively bound Feishu session without current chat mapping', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    const created = manager.create({ type: 'chat', source: 'manual', title: '普通桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge.bindTarget(session.id, {
      targetId: 'ou_target',
      displayName: '张三'
    })

    bridge._onDesktopIntervention(session.id, '桌面继续', undefined)
    await bridge._onAgentResult(session.id)

    expect(sendTextMessage).not.toHaveBeenCalled()
  })

  it('does not forward Feishu desktop intervention for a reopened history session without current chat mapping', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    const current = manager.create({ type: 'chat', source: 'manual', title: '当前桌面会话', cwd: tempDir })
    const history = manager.create({ type: 'chat', source: 'manual', title: '历史桌面会话', cwd: tempDir })
    await bridge.sendToTarget({
      sessionId: current.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '当前绑定'
    })
    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', current.id)
    bridge._sessionIdentities.set(current.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    bridge._sessionIdentities.set(history.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    bridge._sessionTargets.set(history.id, {
      targetId: 'ou_target',
      displayName: '张三'
    })

    bridge._onDesktopIntervention(history.id, '历史会话不应回发', undefined)
    await bridge._onAgentResult(history.id)

    expect(sendTextMessage).toHaveBeenCalledTimes(1)
  })

  it('blocks desktop intervention from an older Feishu session after rebinding the same user', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    const first = manager.create({ type: 'chat', source: 'manual', title: '会话1', cwd: tempDir })
    const second = manager.create({ type: 'chat', source: 'manual', title: '会话2', cwd: tempDir })

    await bridge.sendToTarget({
      sessionId: first.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '第一条'
    })

    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', first.id)
    bridge._sessionIdentities.set(first.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })

    await bridge.sendToTarget({
      sessionId: second.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '第二条'
    })

    bridge._sessionIdentities.set(second.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', second.id)

    bridge._onDesktopIntervention(first.id, '旧会话不应回发', undefined)
    await bridge._onAgentResult(first.id)

    expect(sendTextMessage).toHaveBeenCalledTimes(2)

    bridge._onDesktopIntervention(second.id, '新会话应回发', undefined)
    await bridge._onAgentResult(second.id)

    expect(sendTextMessage).toHaveBeenCalledTimes(3)
    expect(sendTextMessage).toHaveBeenLastCalledWith(
      'open_id',
      'ou_target',
      expect.stringContaining('桌面介入> 新会话应回发')
    )
  })

  it('renames the active Feishu session', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const rename = vi.spyOn(manager, 'rename').mockImplementation(() => true)

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '旧标题', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCommand('/rename 新标题', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(rename).toHaveBeenCalledWith(session.id, '新标题')
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '会话已重命名为：新标题')
  })

  it('treats group-chat mention commands as commands instead of forwarding them into the conversation', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const handleCommand = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_group_rename_1',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      text: '@_user_1 /rename 群聊测试',
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }],
      images: []
    })

    expect(handleCommand).toHaveBeenCalledWith('/rename 群聊测试', {
      senderId: 'ou_group',
      senderName: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      chatName: 'oc_group',
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })
    expect(enqueueMessage).not.toHaveBeenCalled()
  })

  it('hydrates missing group-chat mention metadata from message detail before command parsing', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const handleCommand = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._api, 'getMessage').mockResolvedValue({
      msg_type: 'text',
      body: {
        content: JSON.stringify({
          text: '@_user_1 /rename 群聊测试'
        })
      },
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', id_type: 'app_id' }]
    })

    await bridge._handleFeishuMessage({
      msgId: 'om_group_rename_missing_mentions',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      msgType: 'text',
      text: '@_user_1 /rename 群聊测试',
      mentions: [],
      images: []
    })

    expect(bridge._api.getMessage).toHaveBeenCalledWith('om_group_rename_missing_mentions')
    expect(handleCommand).toHaveBeenCalledWith('/rename 群聊测试', {
      senderId: 'ou_group',
      senderName: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      chatName: 'oc_group',
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })
    expect(enqueueMessage).not.toHaveBeenCalled()
  })

  it('forwards cleaned group-chat text to the desktop frontend without the mention prefix', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_group_text_1',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      text: '你好啊@_user_1',
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }],
      images: []
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '你好啊', images: undefined },
      'ou_group',
      'oc_group',
      'chat'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === session.id &&
      item.data.text === '你好啊'
    )).toBe(true)
  })

  it('strips only the robot mention.key token from group-chat text', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_group_text_user_placeholder',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      text: '@_user_7 你好 @_user_9',
      mentions: [
        { key: '@_user_7', name: 'Hydro Desktop', id: { open_id: 'ou_robot_open' }, idType: null },
        { key: '@_user_9', name: '张三', id: 'ou_user_zhangsan', idType: 'open_id' }
      ],
      images: []
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '你好 @张三', images: undefined },
      'ou_group',
      'oc_group',
      'chat'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === session.id &&
      item.data.text === '你好 @张三'
    )).toBe(true)
  })

  it('replaces non-robot placeholder mentions with display names in group-chat text', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_group_text_user_display_name',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      text: '@_user_2 你好 @_user_7',
      mentions: [
        { key: '@_user_2', name: '张越胜', id: 'ou_user_2', idType: 'open_id' },
        { key: '@_user_7', name: 'Hydro Desktop', id: { open_id: 'ou_robot_open' }, idType: null }
      ],
      images: []
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '@张越胜 你好', images: undefined },
      'ou_group',
      'oc_group',
      'chat'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === session.id &&
      item.data.text === '@张越胜 你好'
    )).toBe(true)
  })

  it('treats runtime Feishu group mentions with object ids as robot mentions', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_runtime_group_text_1',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'group',
      msgType: 'text',
      text: '没事 @_user_1',
      mentions: [{
        key: '@_user_1',
        name: 'Hydro Desktop',
        id: { open_id: 'ou_robot_open', union_id: 'on_robot_union', user_id: null },
        idType: null
      }],
      images: []
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '没事', images: undefined },
      'ou_group',
      'oc_group',
      'group'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === session.id &&
      item.data.text === '没事'
    )).toBe(true)
  })

  it('learns robot mention ids after a name-based fallback match and reuses the stable id later', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])

    expect(bridge._isRobotMention({
      key: '@_user_1',
      name: 'Hydro Desktop',
      id: { open_id: 'ou_robot_open', union_id: 'on_robot_union', user_id: null },
      idType: null
    })).toBe(true)

    expect(bridge._isRobotMention({
      key: '@_user_1',
      name: '别名变化了',
      id: { open_id: 'ou_robot_open', union_id: 'on_robot_union', user_id: null },
      idType: null
    })).toBe(true)

    expect(bridge._isRobotMention({
      key: '@_user_9',
      name: '张三',
      id: { open_id: 'ou_user_9', union_id: 'on_user_9', user_id: null },
      idType: null
    })).toBe(false)
  })

  it('hydrates missing group-chat mention metadata from message detail before forwarding text', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._api, 'getMessage').mockResolvedValue({
      msg_type: 'text',
      body: {
        content: JSON.stringify({
          text: '你好啊@_user_1'
        })
      },
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', id_type: 'app_id' }]
    })

    await bridge._handleFeishuMessage({
      msgId: 'om_group_text_missing_mentions',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      msgType: 'text',
      text: '你好啊@_user_1',
      mentions: [],
      images: []
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(bridge._api.getMessage).toHaveBeenCalledWith('om_group_text_missing_mentions')
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '你好啊', images: undefined },
      'ou_group',
      'oc_group',
      'chat'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === session.id &&
      item.data.text === '你好啊'
    )).toBe(true)
  })

  it('does not strip non-robot mentions from group-chat text', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleFeishuMessage({
      msgId: 'om_group_text_2',
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      text: '@张三 请继续分析',
      mentions: [{ key: '@张三', name: '张三', id: 'ou_user', idType: 'open_id' }],
      images: []
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '@张三 请继续分析', images: undefined },
      'ou_group',
      'oc_group',
      'chat'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === session.id &&
      item.data.text === '@张三 请继续分析'
    )).toBe(true)
  })

  it.skip('sends a help card for /help', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')

    await bridge._handleCommand('/help', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '飞书命令帮助'
          })
        })
      })
    )
  })

  it.skip('closes the active Feishu session', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    const close = vi.spyOn(manager, 'close').mockResolvedValue()

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '待关闭会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCommand('/close', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(close).toHaveBeenCalledWith(session.id)
    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '会话已关闭'
          })
        })
      })
    )
    expect(sent.find(item => item.channel === 'feishu:sessionClosed')?.data).toEqual({ sessionId: session.id })
  })

  it.skip('does not close a proactively bound Feishu session when there is no current command connection', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const close = vi.spyOn(manager, 'close').mockResolvedValue()
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面主动会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    bridge.bindTarget(session.id, {
      targetId: 'ou_target',
      displayName: '张三'
    })
    bridge._sessionMapper.sessionMap.delete('ou_target:oc_reply')
    bridge._sessionIdentities.delete(session.id)

    await bridge._handleCommand('/close', {
      senderId: 'ou_target',
      chatId: 'oc_reply',
      chatType: 'p2p'
    })

    expect(close).not.toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_target', '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话')
  })

  it('rejects /close with numbered arguments for Feishu', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const close = vi.spyOn(manager, 'close').mockResolvedValue()
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '待关闭会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCommand('/close 1', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(close).not.toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '/close 不支持带编号或参数，请直接使用 /close')
  })

  it.skip('prompts for history after closing the current Feishu session instead of auto-using another proactive binding', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    const findBoundSession = vi.spyOn(bridge, '_findBoundSessionIdBySenderId')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'old-bound-session', title: '旧主动绑定会话', updated_at: Date.now() - 60 * 1000 }
    ])
    vi.spyOn(bridge._sessionMapper, 'initPendingChoice').mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    const current = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'feishu', title: '当前会话', cwd: tempDir })
    const oldBound = manager.create({ type: 'chat', source: 'manual', imChannel: 'feishu', title: '旧主动绑定会话', cwd: tempDir })
    manager.sessions.get(current.id).queryGenerator = {}
    manager.sessions.get(oldBound.id).queryGenerator = {}
    vi.spyOn(manager, 'close').mockImplementation(async (sessionId) => {
      manager.sessions.delete(sessionId)
    })

    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', current.id)
    bridge._sessionIdentities.set(current.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    bridge._targetSessionMap.set('ou_target', oldBound.id)
    bridge._sessionTargets.set(oldBound.id, {
      targetId: 'ou_target',
      displayName: '张三'
    })

    await bridge._handleCommand('/close', {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    findBoundSession.mockClear()

    await bridge._handleFeishuMessage({
      msgId: 'om_after_close_1',
      senderId: 'ou_target',
      chatId: 'oc_reply',
      chatType: 'p2p',
      text: '关闭后继续'
    })

    expect(findBoundSession).not.toHaveBeenCalledWith('ou_target')
    expect(bridge._sessionMapper.initPendingChoice).toHaveBeenCalledWith(
      'ou_target:oc_reply',
      [expect.objectContaining({ session_id: 'old-bound-session' })],
      expect.any(Function),
      expect.any(Object)
    )
    expect(bridge._pendingMessages.get('ou_target:oc_reply')?.message).toEqual({
      text: '关闭后继续',
      images: undefined
    })
    expect(bridge._sessionMapper.sessionMap.get('ou_target:oc_reply')).toBeUndefined()
    expect(enqueueMessage).not.toHaveBeenCalledWith(
      oldBound.id,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })

  it.skip('closes the active group-chat Feishu session from card actions', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    const close = vi.spyOn(manager, 'close').mockResolvedValue()

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '群待关闭会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    bridge._sessionMapper.sessionMap.set('ou_group:oc_group', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_group',
      chatId: 'oc_old',
      chatType: 'p2p'
    })

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { command: 'close' },
      userId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    })

    expect(close).toHaveBeenCalledWith(session.id)
    expect(sendTextMessage).toHaveBeenCalledWith(
      'chat_id',
      'oc_group',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '会话已关闭'
          })
        })
      })
    )
    expect(sent.find(item => item.channel === 'feishu:sessionClosed')?.data).toEqual({ sessionId: session.id })
  })

  it('creates a new Feishu session with /new', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleCommand('/new', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(session.type).toBe('chat')
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '会话创建中，请等待信息返回后，即可开始聊天')
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: 'hello', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(sent.find(item => item.channel === 'feishu:sessionCreated')?.data.sessionId).toBe(session.id)
  })

  it('uses readable sender and chat names when creating a new Feishu session with /new', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    bridge._api.setCredentials('app-id', 'app-secret')
    vi.spyOn(bridge._api, 'getUserInfo').mockResolvedValue({ name: '张三' })
    vi.spyOn(bridge._api, 'getChatInfo').mockResolvedValue({ name: '项目群' })

    await bridge._handleCommand('/new', {
      senderId: 'ou_xxx',
      chatId: 'oc_group',
      chatType: 'chat',
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(session.title).toBe('飞书 · 张三')
    expect(sendTextMessage).toHaveBeenCalledWith('chat_id', 'oc_group', '会话创建中，请等待信息返回后，即可开始聊天')
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: 'hello', images: undefined },
      '张三',
      'oc_group',
      'chat'
    )
    expect(sent.find(item => item.channel === 'feishu:sessionCreated')?.data.sessionId).toBe(session.id)
  })

  it('creates a new Feishu session under a requested relative directory with /new [目录]', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleCommand('/new 项目A', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session.cwd).toBe(path.join(tempDir, 'feishu', '项目A'))
    expect(fs.existsSync(session.cwd)).toBe(true)
  })

  it('ignores trailing mention tokens in /new command arguments', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleCommand('/new 项目A @机器人', {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session.cwd).toBe(path.join(tempDir, 'feishu', '项目A'))
    expect(fs.existsSync(session.cwd)).toBe(true)
  })

  it.skip('strips trailing mention suffixes from /new directory arguments in group chats', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    await bridge._handleCommand('/new 项目A@机器人', {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session.cwd).toBe(path.join(tempDir, 'feishu', '项目A'))
    expect(fs.existsSync(session.cwd)).toBe(true)
  })

  it('restores a historical Feishu session with /resume and auto-activates when needed', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    const notifySessionCreated = vi.spyOn(bridge._notifier, 'notifySessionCreated').mockImplementation(() => {})
    vi.spyOn(bridge._notifier, 'notifyMessageReceived').mockImplementation(() => {})
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1' }
    ])
    const reopen = vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      manager.sessions.set(sessionId, {
        id: sessionId,
        type: 'feishu',
        title: '历史会话 1',
        cwd: tempDir,
        source: 'feishu'
      })
      return { id: sessionId, type: 'feishu', title: '历史会话 1' }
    })

    await bridge._handleCommand('/resume 1', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(reopen).toHaveBeenCalledWith('hist-1')
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '会话恢复中，请等待信息返回后，即可开始聊天')
    expect(enqueueMessage).toHaveBeenCalledWith(
      'hist-1',
      { text: 'hello', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(notifySessionCreated).toHaveBeenCalledWith({ sessionId: 'hist-1', nickname: 'ou_xxx' })
  })

  it('reuses resolved Feishu names for slash commands without re-querying display names', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const commandSpy = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()
    const resolveNamesSpy = vi.spyOn(bridge, '_resolveFeishuDisplayNames')
      .mockResolvedValue({ senderName: '张三', chatName: '项目群' })

    await bridge._handleFeishuMessage({
      msgId: 'om_cmd_1',
      senderId: 'ou_xxx',
      senderName: '',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      chatName: '',
      text: '/resume 1',
      images: [],
      unsupported: false,
      msgType: 'text',
      mentions: [],
    })

    expect(commandSpy).toHaveBeenCalledWith('/resume 1', {
      senderId: 'ou_xxx',
      senderName: '张三',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      chatName: '项目群',
    }, {
      mentions: [],
    })
    expect(resolveNamesSpy).toHaveBeenCalledTimes(1)
  })

  it('ignores mention tokens embedded in /resume command arguments', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._notifier, 'notifySessionCreated').mockImplementation(() => {})
    vi.spyOn(bridge._notifier, 'notifyMessageReceived').mockImplementation(() => {})
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1' }
    ])
    const reopen = vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      manager.sessions.set(sessionId, {
        id: sessionId,
        type: 'feishu',
        title: '历史会话 1',
        cwd: tempDir,
        source: 'feishu'
      })
      return { id: sessionId, type: 'feishu', title: '历史会话 1' }
    })

    await bridge._handleCommand('/resume @机器人 1', {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })

    expect(reopen).toHaveBeenCalledWith('hist-1')
    expect(sendTextMessage).toHaveBeenCalledWith('chat_id', 'oc_group', '会话恢复中，请等待信息返回后，即可开始聊天')
    expect(enqueueMessage).toHaveBeenCalledWith(
      'hist-1',
      { text: 'hello', images: undefined },
      'ou_group',
      'oc_group',
      'chat'
    )
  })

  it.skip('strips trailing mention suffixes from /resume selection arguments in group chats', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._notifier, 'notifySessionCreated').mockImplementation(() => {})
    vi.spyOn(bridge._notifier, 'notifyMessageReceived').mockImplementation(() => {})
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1' }
    ])
    const reopen = vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      manager.sessions.set(sessionId, {
        id: sessionId,
        type: 'feishu',
        title: '历史会话 1',
        cwd: tempDir,
        source: 'feishu'
      })
      return { id: sessionId, type: 'feishu', title: '历史会话 1' }
    })

    await bridge._handleCommand('/resume 1@机器人', {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })

    expect(reopen).toHaveBeenCalledWith('hist-1')
    expect(sendTextMessage).toHaveBeenCalledWith('chat_id', 'oc_group', '会话恢复中，请等待信息返回后，即可开始聊天')
    expect(enqueueMessage).toHaveBeenCalledWith(
      'hist-1',
      { text: 'hello', images: undefined },
      'ou_group',
      'oc_group',
      'chat'
    )
  })

  it('switches to an already-activated historical Feishu session without auto-hello', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1' }
    ])

    manager.sessions.set('hist-1', {
      id: 'hist-1',
      type: 'feishu',
      title: '历史会话 1',
      cwd: tempDir,
      source: 'feishu',
      queryGenerator: {}
    })
    vi.spyOn(manager, 'reopen').mockReturnValue({ id: 'hist-1' })

    await bridge._handleCommand('/resume 1', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '✅ 已切换到会话：历史会话 1\n\n现在可以继续对话了')
    expect(enqueueMessage).not.toHaveBeenCalled()
  })

  it.skip('reports current Feishu historical session state with /status', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    bridge._eventClient._connected = true
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '状态会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}
    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCommand('/status', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '当前会话状态'
          })
        }),
        elements: expect.arrayContaining([
          expect.objectContaining({
            tag: 'markdown',
            content: expect.stringContaining('✅')
          })
        ])
      })
    )
  })

  it.skip('includes the current proactively bound Feishu session in /status before inbound chat mapping exists', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    bridge._eventClient._connected = true
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([])

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面主动会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    session.queryGenerator = {}

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_target',
      displayName: '张三',
      text: '任务已完成'
    })

    await bridge._handleCommand('/status', {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_target',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '当前会话状态'
          })
        }),
        elements: expect.arrayContaining([
          expect.objectContaining({
            tag: 'markdown',
            content: expect.stringContaining('✅')
          })
        ])
      })
    )
  })

  it.skip('strips trailing mention suffixes from /status in group chats', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    bridge._eventClient._connected = true
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')

    await bridge._handleCommand('/status@机器人', {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'chat_id',
      'oc_group',
      expect.stringContaining('没有历史会话记录')
    )
  })

  it.skip('ignores embedded mention tokens when renaming a group-chat session', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const rename = vi.spyOn(manager, 'rename').mockImplementation(() => true)

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '旧标题', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionMapper.sessionMap.set('ou_group:oc_group', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    })

    await bridge._handleCommand('/rename 群聊测试 @机器人', {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })

    expect(rename).toHaveBeenCalledWith(session.id, '群聊测试')
    expect(sendTextMessage).toHaveBeenCalledWith('chat_id', 'oc_group', '会话已重命名为：群聊测试')
  })

  it.skip('strips trailing mention suffixes from rename titles in group chats', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const rename = vi.spyOn(manager, 'rename').mockImplementation(() => true)

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '旧标题', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionMapper.sessionMap.set('ou_group:oc_group', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    })

    await bridge._handleCommand('/rename 群聊测试@机器人', {
      senderId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat'
    }, {
      mentions: [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    })

    expect(rename).toHaveBeenCalledWith(session.id, '群聊测试')
    expect(sendTextMessage).toHaveBeenCalledWith('chat_id', 'oc_group', '会话已重命名为：群聊测试')
  })

  it('sends an explicit Feishu error reply when agent processing fails', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '状态会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })
    const { donePromise } = bridge._replyCollector.startCollect(session.id, { sendFn: vi.fn() })
    const doneRejection = donePromise.catch(err => err)

    await bridge._onAgentError(session.id, new Error('agent failed'))

    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '处理消息时出错: agent failed')
    await expect(doneRejection).resolves.toBeInstanceOf(Error)
  })

  it('streams Feishu agent text chunks through the active collector sendChunk', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const sendMessage = vi.spyOn(manager, 'sendMessage').mockImplementation(async (sessionId) => {
      bridge._onAgentMessage(sessionId, {
        type: 'assistant',
        content: [{ type: 'text', text: '第一段' }]
      })
      bridge._onAgentResult(sessionId)
    })

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '流式会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._processOneMessage(session.id, { text: '继续', images: undefined }, 'ou_xxx', 'oc_xxx', 'p2p')

    expect(sendMessage).toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '第一段')
  })

  it('does not duplicate a streamed Feishu reply when agentResult arrives immediately after the chunk', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    let releaseSend = () => {}
    let sendStartedResolve
    const sendStarted = new Promise(resolve => { sendStartedResolve = resolve })
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockImplementation(async () => {
      sendStartedResolve()
      await new Promise(resolve => { releaseSend = resolve })
      return 'om_text'
    })
    const sendMessage = vi.spyOn(manager, 'sendMessage').mockImplementation(async (sessionId) => {
      bridge._onAgentMessage(sessionId, {
        type: 'assistant',
        content: [{ type: 'text', text: '今天是 2026年5月23日。' }]
      })
      await sendStarted
      const onResultPromise = bridge._onAgentResult(sessionId)
      releaseSend()
      await onResultPromise
    })

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '恢复会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._processOneMessage(session.id, { text: '继续', images: undefined }, 'ou_xxx', 'oc_xxx', 'p2p')

    expect(sendMessage).toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '今天是 2026年5月23日。')
  })

  it('sends Agent-generated image paths to Feishu after agent result', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const uploadImage = vi.spyOn(bridge._api, 'uploadImage').mockResolvedValue('img_generated')
    const sendImageMessage = vi.spyOn(bridge._api, 'sendImageMessage').mockResolvedValue('om_img')

    const generatedImagePath = path.join(tempDir, 'generated.png')
    fs.writeFileSync(generatedImagePath, Buffer.from('pngdata'))

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '图片会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    bridge._replyCollector.startCollect(session.id, { sendFn: vi.fn() })
    bridge._onAgentMessage(session.id, {
      type: 'assistant',
      content: [],
      tool_use: {
        output_image: generatedImagePath
      }
    })

    await bridge._onAgentResult(session.id)

    expect(uploadImage).toHaveBeenCalledWith(generatedImagePath)
    expect(sendImageMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', 'img_generated')
  })

  it('sends Feishu images from standard tool_result file resources after agent result', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const uploadImage = vi.spyOn(bridge._api, 'uploadImage').mockResolvedValue('img_generated')
    const sendImageMessage = vi.spyOn(bridge._api, 'sendImageMessage').mockResolvedValue('om_img')
    manager.runner = { normalizeMessage: raw => raw }

    const generatedImagePath = path.join(tempDir, 'cover.png')
    fs.writeFileSync(generatedImagePath, Buffer.from('pngdata'))

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '图片会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    bridge._replyCollector.startCollect(session.id, { sendFn: vi.fn() })
    await manager._processMessage(session, {
      type: 'assistant_message',
      content: [{
        type: 'tool_use',
        id: 'tool-use-1',
        name: 'generate_image',
        input: { prompt: 'draw' }
      }],
      sdkSessionId: 'sdk-tool'
    })
    await manager._processMessage(session, {
      type: 'user_message',
      parentToolUseId: 'tool-use-1',
      content: [{
        type: 'tool_result',
        tool_use_id: 'tool-use-1',
        content: [{
          type: 'resource_link',
          uri: generatedImagePath.startsWith('/') ? `file://${generatedImagePath.replace(/\\/g, '/')}` : `file:///${generatedImagePath.replace(/\\/g, '/')}`,
          name: 'cover.png',
          mimeType: 'image/png'
        }],
        structured_content: {
          type: 'image_result',
          files: [{
            uri: generatedImagePath.startsWith('/') ? `file://${generatedImagePath.replace(/\\/g, '/')}` : `file:///${generatedImagePath.replace(/\\/g, '/')}`,
            name: 'cover.png',
            mimeType: 'image/png'
          }]
        }
      }],
      toolUseResult: {
        content: [{
          type: 'resource_link',
          uri: generatedImagePath.startsWith('/') ? `file://${generatedImagePath.replace(/\\/g, '/')}` : `file:///${generatedImagePath.replace(/\\/g, '/')}`,
          name: 'cover.png',
          mimeType: 'image/png'
        }],
        structuredContent: {
          type: 'image_result',
          files: [{
            uri: generatedImagePath.startsWith('/') ? `file://${generatedImagePath.replace(/\\/g, '/')}` : `file:///${generatedImagePath.replace(/\\/g, '/')}`,
            name: 'cover.png',
            mimeType: 'image/png'
          }]
        }
      }
    })

    await bridge._onAgentResult(session.id)

    expect(uploadImage).toHaveBeenCalledWith(generatedImagePath)
    expect(sendImageMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', 'img_generated')
  })

  it('does not send duplicate Feishu images when tool_use and normalized tool_result reference the same file', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const uploadImage = vi.spyOn(bridge._api, 'uploadImage').mockResolvedValue('img_generated')
    const sendImageMessage = vi.spyOn(bridge._api, 'sendImageMessage').mockResolvedValue('om_img')
    manager.runner = { normalizeMessage: raw => raw }

    const generatedImagePath = path.join(tempDir, 'dedupe-cover.png')
    fs.writeFileSync(generatedImagePath, Buffer.from('pngdata'))

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '图片会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    bridge._replyCollector.startCollect(session.id, { sendFn: vi.fn() })
    bridge._onAgentMessage(session.id, {
      type: 'assistant',
      content: [],
      tool_use: {
        output_image: generatedImagePath
      }
    })

    await manager._processMessage(session, {
      type: 'assistant_message',
      content: [{
        type: 'tool_use',
        id: 'tool-use-dedupe-1',
        name: 'generate_image',
        input: { prompt: 'draw' }
      }],
      sdkSessionId: 'sdk-tool'
    })
    await manager._processMessage(session, {
      type: 'user_message',
      parentToolUseId: 'tool-use-dedupe-1',
      content: [{
        type: 'tool_result',
        tool_use_id: 'tool-use-dedupe-1',
        content: [{
          type: 'resource_link',
          uri: generatedImagePath.startsWith('/') ? `file://${generatedImagePath.replace(/\\/g, '/')}` : `file:///${generatedImagePath.replace(/\\/g, '/')}`,
          name: 'dedupe-cover.png',
          mimeType: 'image/png'
        }]
      }],
      toolUseResult: {
        content: [{
          type: 'resource_link',
          uri: generatedImagePath.startsWith('/') ? `file://${generatedImagePath.replace(/\\/g, '/')}` : `file:///${generatedImagePath.replace(/\\/g, '/')}`,
          name: 'dedupe-cover.png',
          mimeType: 'image/png'
        }]
      }
    })

    await bridge._onAgentResult(session.id)

    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(uploadImage).toHaveBeenCalledWith(generatedImagePath)
    expect(sendImageMessage).toHaveBeenCalledTimes(1)
    expect(sendImageMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', 'img_generated')
  })

  it('removes temporary Feishu image files and directories after forwarding desktop images', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'uploadImage').mockResolvedValue('img_uploaded')
    vi.spyOn(bridge._api, 'sendImageMessage').mockResolvedValue('om_img')

    const tempImage = await bridge._writeTempBase64Image({
      base64: Buffer.from('pngdata').toString('base64'),
      mediaType: 'image/png'
    })

    const writeSpy = vi.spyOn(bridge, '_writeTempBase64Image').mockResolvedValue(tempImage)

    await bridge._sendBase64Images('open_id', 'ou_xxx', [
      {
        base64: Buffer.from('pngdata').toString('base64'),
        mediaType: 'image/png'
      }
    ])

    expect(writeSpy).toHaveBeenCalled()
    expect(fs.existsSync(tempImage.filePath)).toBe(false)
    expect(fs.existsSync(tempImage.dirPath)).toBe(false)
  })

  it.skip('loads Feishu history for /resume even when sessionDatabase is injected after bridge construction', async () => {
    const tempMainWindow = {
      isDestroyed: () => false,
      webContents: { send: () => {} }
    }
    const configManager = {
      getConfig: () => ({
        settings: { agent: { outputBaseDir: tempDir } },
        feishu: {
          enabled: true,
          appId: 'app-id',
          appSecret: 'app-secret',
          defaultCwd: '',
          maxHistorySessions: 5
        }
      }),
      getDefaultProfile: () => ({ id: 'p1', baseUrl: 'https://example.com' }),
      getAPIProfile: () => null
    }
    const manager = new AgentSessionManager(tempMainWindow, configManager)
    const bridge = new FeishuBridge(configManager, manager, tempMainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    vi.spyOn(bridge._sessionMapper, 'initPendingChoice').mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    manager.setSessionDatabase({
      insertAgentMessage: vi.fn(),
      updateAgentConversation: vi.fn(),
      updateAgentConversationTitle: vi.fn(),
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      getAgentConversation: vi.fn(() => null),
      getImSessionsByType: vi.fn(() => [
        { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() - 60 * 1000, type: 'feishu' }
      ]),
      updateImIdentity: vi.fn(),
      closeAllActiveAgentConversations: vi.fn()
    })

    await bridge._handleCommand('/resume', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '历史会话'
          })
        })
      })
    )
  })

  it('does not fall back to legacy title matching for old Feishu history records without stored identity columns', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const listAllAgentConversations = vi.fn(() => [
      {
        session_id: 'hist-legacy-1',
        type: 'chat',
        im_channel: 'feishu',
        title: '飞书 · oc_xxx · ou_xxx',
        updated_at: Date.now() - 60 * 1000,
        staff_id: null,
        conversation_id: null
      }
    ])
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([])
    manager.sessionDatabase.listAllAgentConversations = listAllAgentConversations
    vi.spyOn(bridge._sessionMapper, 'initPendingChoice').mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    await bridge._handleCommand('/resume', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(listAllAgentConversations).not.toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '没有历史会话记录\n\n发送任意消息可开始新会话')
  })

  it.skip('shows a historical session choice menu with /resume and no index', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() - 60 * 1000 },
      { session_id: 'hist-2', title: '历史会话 2', updated_at: Date.now() - 2 * 60 * 1000 }
    ])
    vi.spyOn(bridge._sessionMapper, 'initPendingChoice').mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    await bridge._handleCommand('/resume', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '历史会话'
          })
        })
      })
    )
  })

  it.skip('includes the current proactively rebound Feishu session in /resume even when DB history lookup is empty', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([])
    vi.spyOn(bridge._sessionMapper, 'initPendingChoice').mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    const created = manager.create({ type: 'chat', source: 'feishu', title: '桌面发起会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionMapper.sessionMap.set('ou_target:oc_reply', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'feishu',
            title: '桌面发起会话',
            cwd: tempDir,
            staff_id: 'ou_target',
            conversation_id: 'oc_reply',
            status: 'idle',
            updated_at: Date.now()
          }
        : null
    ))

    await bridge._handleCommand('/resume', {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三'
    })

    expect(sendTextMessage).not.toHaveBeenCalledWith(
      'open_id',
      'ou_target',
      expect.stringContaining('没有历史会话记录')
    )
    expect(bridge._sessionMapper.initPendingChoice).toHaveBeenCalledWith(
      'ou_target:oc_reply',
      [expect.objectContaining({ session_id: session.id, title: '桌面发起会话' })],
      expect.any(Function),
      expect.any(Object)
    )
    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_target',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '历史会话'
          })
        })
      })
    )
  })

  it.skip('includes a proactively bound Feishu session in /resume before the current chat map is established', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([])
    vi.spyOn(bridge._sessionMapper, 'initPendingChoice').mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面主动绑定会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    bridge._targetSessionMap.set('ou_target', session.id)
    bridge._sessionTargets.set(session.id, {
      targetId: 'ou_target',
      displayName: '张三',
    })
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => (
      sessionId === session.id
        ? {
            session_id: session.id,
            type: 'chat',
            source: 'manual',
            title: '桌面主动绑定会话',
            cwd: tempDir,
            im_channel: 'feishu',
            im_user_id: 'ou_target',
            im_chat_id: '',
            staff_id: 'ou_target',
            conversation_id: '',
            status: 'idle',
            updated_at: Date.now(),
          }
        : null
    ))

    await bridge._handleCommand('/resume', {
      senderId: 'ou_target',
      senderName: '张三',
      chatId: 'oc_reply',
      chatType: 'p2p',
      chatName: '张三',
    })

    expect(sendTextMessage).not.toHaveBeenCalledWith(
      'open_id',
      'ou_target',
      expect.stringContaining('没有历史会话记录')
    )
    expect(bridge._sessionMapper.initPendingChoice).toHaveBeenCalledWith(
      'ou_target:oc_reply',
      [expect.objectContaining({ session_id: session.id, title: '桌面主动绑定会话' })],
      expect.any(Function),
      expect.any(Object)
    )
    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_target',
      expect.objectContaining({
        header: expect.objectContaining({
          title: expect.objectContaining({
            content: '历史会话'
          })
        })
      })
    )
  })

  it.skip('falls back to text when sending the help card fails', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockRejectedValue(new Error('card failed'))
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    await bridge._handleCommand('/help', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.stringContaining('/resume [编号] - 恢复历史会话')
    )
  })

  it('re-sends the choice menu when replying with an invalid history selection', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [
        {
          session_id: 'hist-1',
          title: '历史会话 1',
          cwd: tempDir,
          updated_at: Date.now() - 5 * 60 * 1000
        }
      ],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {
        menuBuilder: (sessions) => bridge._buildHistoryChoiceMenuText(sessions, null)
      }
    })

    await bridge._handleChoiceReply(
      'ou_xxx:oc_xxx',
      'abc',
      { userId: 'ou_xxx', chatId: 'oc_xxx', chatType: 'p2p' },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      expect.stringContaining('您有以下历史会话，请回复数字选择：')
    )

    clearTimeout(bridge._sessionMapper._pendingChoices.get('ou_xxx:oc_xxx').timer)
  })

  it('replays the pending user message to the desktop frontend after choosing a historical session', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._sessionMapper, 'resolveActiveSessionId').mockResolvedValue(null)
    vi.spyOn(bridge._sessionMapper, 'handleChoice').mockResolvedValue({
      sessionId: 'hist-1',
      action: 'resume',
      selectedSession: { session_id: 'hist-1', title: '历史会话 1' },
      wasActivated: false
    })

    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: {
        text: '继续分析这张图',
        images: [{ base64: Buffer.from('img').toString('base64'), mediaType: 'image/png' }]
      },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleChoiceReply(
      'ou_xxx:oc_xxx',
      '1',
      { userId: 'ou_xxx', chatId: 'oc_xxx', chatType: 'p2p' },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )

    expect(enqueueMessage).toHaveBeenCalledWith(
      'hist-1',
      {
        text: '继续分析这张图',
        images: [{ base64: Buffer.from('img').toString('base64'), mediaType: 'image/png' }]
      },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === 'hist-1' &&
      item.data.text === '继续分析这张图' &&
      Array.isArray(item.data.images) &&
      item.data.images.length === 1
    )).toBe(true)
  })

  it('reports already-connected when /resume targets the current activated session', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1' }
    ])

    manager.sessions.set('hist-1', {
      id: 'hist-1',
      type: 'feishu',
      title: '历史会话 1',
      cwd: tempDir,
      source: 'feishu',
      queryGenerator: {}
    })
    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', 'hist-1')
    bridge._sessionIdentities.set('hist-1', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCommand('/resume 1', {
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith(
      'open_id',
      'ou_xxx',
      '✅ 当前已连接该会话：历史会话 1'
    )
  })

  it.skip('replays the pending user message when a history-choice card resumes a session', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1' }
    ])
    vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      manager.sessions.set(sessionId, {
        id: sessionId,
        type: 'feishu',
        title: '历史会话 1',
        cwd: tempDir,
        source: 'feishu'
      })
      return { id: sessionId, type: 'feishu', title: '历史会话 1' }
    })

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {
        menuBuilder: (sessions) => bridge._buildHistoryChoiceMenuText(sessions, null)
      }
    })
    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: {
        text: '继续分析这张图',
        images: [{ base64: Buffer.from('img').toString('base64'), mediaType: 'image/png' }]
      },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { intent: 'resume', index: 1, source: 'history-choice' },
      userId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '会话恢复中，请等待信息返回后，即可开始聊天')
    expect(enqueueMessage).toHaveBeenCalledWith(
      'hist-1',
      {
        text: '继续分析这张图',
        images: [{ base64: Buffer.from('img').toString('base64'), mediaType: 'image/png' }]
      },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === 'hist-1' &&
      item.data.text === '继续分析这张图'
    )).toBe(true)
    expect(bridge._pendingMessages.has('ou_xxx:oc_xxx')).toBe(false)
    expect(bridge._sessionMapper._pendingChoices.has('ou_xxx:oc_xxx')).toBe(false)
  })

  it.skip('replays the pending user message when a history-choice card creates a new session', async () => {
    const { configManager, manager, mainWindow, sent } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {
        menuBuilder: (sessions) => bridge._buildHistoryChoiceMenuText(sessions, null)
      }
    })
    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: {
        text: '这是新的问题',
        images: undefined
      },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { intent: 'new', source: 'history-choice' },
      userId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_xxx', '会话创建中，请等待信息返回后，即可开始聊天')
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '这是新的问题', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    expect(sent.some(item =>
      item.channel === 'feishu:messageReceived' &&
      item.data.sessionId === session.id &&
      item.data.text === '这是新的问题'
    )).toBe(true)
    expect(bridge._pendingMessages.has('ou_xxx:oc_xxx')).toBe(false)
    expect(bridge._sessionMapper._pendingChoices.has('ou_xxx:oc_xxx')).toBe(false)
  })

  it.skip('keeps the newly created Feishu session mapped after choosing new from history-choice', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {
        menuBuilder: (sessions) => bridge._buildHistoryChoiceMenuText(sessions, null)
      }
    })
    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: { text: '这是新的问题', images: undefined },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { intent: 'new', source: 'history-choice' },
      userId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(bridge._sessionMapper.sessionMap.get('ou_xxx:oc_xxx')).toBe(session.id)

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', type: 'feishu' }
    ])

    await bridge._handleFeishuMessage({
      msgId: 'om_followup_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '继续说'
    })

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(enqueueMessage).toHaveBeenLastCalledWith(
      session.id,
      { text: '继续说', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    clearTimeout(bridge._sessionMapper._pendingChoices.get('ou_xxx:oc_xxx')?.timer)
  })

  it('keeps the newly created Feishu session mapped after replying 0 to the text history-choice menu', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {
        menuBuilder: (sessions) => bridge._buildHistoryChoiceMenuText(sessions, null)
      }
    })
    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: { text: '这是新的问题', images: undefined },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleFeishuMessage({
      msgId: 'om_choice_text_0',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '0'
    })

    const session = Array.from(manager.sessions.values())[0]
    expect(session).toBeTruthy()
    expect(bridge._sessionMapper.sessionMap.get('ou_xxx:oc_xxx')).toBe(session.id)

    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', type: 'feishu' }
    ])

    await bridge._handleFeishuMessage({
      msgId: 'om_followup_after_text_0',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '继续说'
    })

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(enqueueMessage).toHaveBeenLastCalledWith(
      session.id,
      { text: '继续说', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    clearTimeout(bridge._sessionMapper._pendingChoices.get('ou_xxx:oc_xxx')?.timer)
  })

  it.skip('keeps the resumed Feishu session mapped after choosing history and continues follow-up messages directly', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_card')
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1' }
    ])

    vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      manager.sessions.set(sessionId, {
        id: sessionId,
        type: 'feishu',
        title: '历史会话 1',
        cwd: tempDir,
        source: 'feishu'
      })
      return { id: sessionId, type: 'feishu', title: '历史会话 1' }
    })

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {
        menuBuilder: (sessions) => bridge._buildHistoryChoiceMenuText(sessions, null)
      }
    })
    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: { text: '恢复它', images: undefined },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: { intent: 'resume', index: 1, source: 'history-choice' },
      userId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(bridge._sessionMapper.sessionMap.get('ou_xxx:oc_xxx')).toBe('hist-1')
    expect(bridge._sessionMapper._pendingChoices.has('ou_xxx:oc_xxx')).toBe(false)

    await bridge._handleFeishuMessage({
      msgId: 'om_followup_resume_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '继续聊'
    })

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(enqueueMessage).toHaveBeenLastCalledWith(
      'hist-1',
      { text: '继续聊', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
    clearTimeout(bridge._sessionMapper._pendingChoices.get('ou_xxx:oc_xxx')?.timer)
  })

  it('ignores a stale pending choice when the Feishu mapKey already has an active session', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const handleChoiceReply = vi.spyOn(bridge, '_handleChoiceReply').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(manager, 'reopen').mockReturnValue({ id: 'hist-1', type: 'feishu', title: '历史会话 1' })

    bridge._sessionMapper.sessionMap.set('ou_xxx:oc_xxx', 'hist-1')
    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {}
    })

    await bridge._handleFeishuMessage({
      msgId: 'om_stale_pending_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '继续发言'
    })

    expect(handleChoiceReply).not.toHaveBeenCalled()
    expect(bridge._sessionMapper._pendingChoices.has('ou_xxx:oc_xxx')).toBe(false)
    expect(enqueueMessage).toHaveBeenCalledWith(
      'hist-1',
      { text: '继续发言', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
  })

  it('ignores a stale pending choice when the Feishu user is proactively bound to a session', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const handleChoiceReply = vi.spyOn(bridge, '_handleChoiceReply').mockResolvedValue()
    const enqueueMessage = vi.spyOn(bridge, '_enqueueMessage').mockImplementation(() => {})
    vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_send_1')

    const created = manager.create({ type: 'chat', source: 'manual', title: '桌面会话', cwd: tempDir })
    const session = manager.sessions.get(created.id)

    await bridge.sendToTarget({
      sessionId: session.id,
      targetId: 'ou_xxx',
      displayName: '张三',
      text: '任务已完成'
    })

    bridge._sessionMapper._pendingChoices.set('ou_xxx:oc_xxx', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {}
    })
    bridge._pendingMessages.set('ou_xxx:oc_xxx', {
      message: { text: '旧的待处理消息', images: undefined },
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleFeishuMessage({
      msgId: 'om_stale_pending_bound_1',
      senderId: 'ou_xxx',
      chatId: 'oc_xxx',
      chatType: 'p2p',
      text: '这是新的回复'
    })

    expect(handleChoiceReply).not.toHaveBeenCalled()
    expect(bridge._sessionMapper._pendingChoices.has('ou_xxx:oc_xxx')).toBe(false)
    expect(bridge._pendingMessages.has('ou_xxx:oc_xxx')).toBe(false)
    expect(bridge._sessionMapper.sessionMap.get('ou_xxx:oc_xxx')).toBe(session.id)
    expect(enqueueMessage).toHaveBeenCalledWith(
      session.id,
      { text: '这是新的回复', images: undefined },
      'ou_xxx',
      'oc_xxx',
      'p2p'
    )
  })

  it.skip('reuses the original pending-choice mapKey when a history-choice card callback arrives with a different user id', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    bridge._sessionMapper._pendingChoices.set('ou_original:oc_shared', {
      sessions: [{ session_id: 'hist-1', title: '历史会话 1' }],
      resolve: vi.fn(),
      timer: setTimeout(() => {}, 1000),
      options: {}
    })

    const result = bridge._resolveHistoryChoiceContext({
      userId: 'ou_callback',
      chatId: 'oc_shared',
      chatType: 'p2p',
      actionValue: { intent: 'resume', index: 1, source: 'history-choice' }
    })

    expect(result).toEqual({
      senderId: 'ou_original',
      chatId: 'oc_shared',
      chatType: 'p2p',
      senderName: 'ou_callback',
      chatName: null
    })
    clearTimeout(bridge._sessionMapper._pendingChoices.get('ou_original:oc_shared')?.timer)
  })

  it.skip('uses history-choice card value context when callback payload is missing user and chat ids', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const commandSpy = vi.spyOn(bridge, '_handleCommand').mockResolvedValue()

    await bridge._handleCardAction({
      actionType: 'button',
      actionValue: {
        intent: 'new',
        source: 'history-choice',
        senderId: 'ou_card',
        senderName: '张三',
        chatId: 'oc_card',
        chatType: 'chat',
        chatName: '项目群'
      }
    })

    expect(commandSpy).toHaveBeenCalledWith('/new', expect.objectContaining({
      senderId: 'ou_card',
      senderName: '张三',
      chatId: 'oc_card',
      chatType: 'chat',
      chatName: '项目群'
    }), expect.objectContaining({
      cardValue: expect.objectContaining({
        senderId: 'ou_card',
        chatId: 'oc_card'
      })
    }))
  })

  it('does not rebind another same-chat session before rename when there is no current connection', async () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sendTextMessage = vi.spyOn(bridge._api, 'sendTextMessage').mockResolvedValue('om_text')
    const rename = vi.spyOn(manager, 'rename').mockImplementation(() => {})

    const created = manager.create({ type: 'feishu', source: 'feishu', title: '旧标题', cwd: tempDir })
    const session = manager.sessions.get(created.id)
    bridge._sessionMapper.sessionMap.set('ou_old:oc_xxx', session.id)
    bridge._sessionIdentities.set(session.id, {
      senderId: 'ou_old',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    await bridge._handleCommand('/rename 飞书4', {
      senderId: 'ou_new',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(rename).not.toHaveBeenCalled()
    expect(bridge._sessionMapper.sessionMap.get('ou_new:oc_xxx')).toBeUndefined()
    expect(sendTextMessage).toHaveBeenCalledWith('open_id', 'ou_new', '当前没有活跃会话，无法重命名')
  })

  it('builds a DingTalk-style Feishu history choice menu with markers and metadata', () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    manager.sessions.set('hist-2', {
      id: 'hist-2',
      type: 'feishu',
      title: '历史会话 2',
      cwd: tempDir,
      source: 'feishu',
      queryGenerator: {}
    })

    const menu = bridge._buildHistoryChoiceMenuText([
      {
        session_id: 'hist-1',
        title: '当前会话',
        cwd: tempDir,
        updated_at: Date.now() - 3 * 60 * 1000
      },
      {
        session_id: 'hist-2',
        title: '已激活会话',
        cwd: tempDir,
        updated_at: Date.now() - 2 * 60 * 60 * 1000
      }
    ], 'hist-1')

    expect(menu).toContain('1. ✅ ')
    expect(menu).toContain('2. 🔵 ')
    expect(menu).toContain('默认配置')
    expect(menu).toContain('回复 0 开始全新会话')
  })

  it.skip('builds Feishu history cards with up to ten session actions', () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)
    const sessions = Array.from({ length: 10 }, (_, index) => ({
      session_id: `hist-${index + 1}`,
      id: `hist-${index + 1}`,
      title: `历史会话 ${index + 1}`,
      cwd: tempDir,
      updated_at: Date.now() - index * 60 * 1000
    }))
    const historyCard = bridge._buildHistoryChoiceCard(sessions, 'hist-1')
    const historyActionRows = historyCard.elements.filter(element => element.tag === 'action')

    expect(historyActionRows[0].actions).toHaveLength(5)
    expect(historyActionRows[1].actions).toHaveLength(5)
  })

  it('normalizes Feishu command text by removing standalone mention tokens from arguments', () => {
    const { configManager, manager, mainWindow } = createManager()
    const bridge = new FeishuBridge(configManager, manager, mainWindow)

    const chatContext = { chatType: 'chat' }
    const robotMentions = [{ key: '@_user_1', name: '机器人', id: 'app-id', idType: 'app_id' }]
    expect(bridge._normalizeCommandText('/new 项目A @机器人', chatContext, { mentions: robotMentions })).toBe('/new 项目A')
    expect(bridge._normalizeCommandText('/new 项目A@机器人', chatContext, { mentions: robotMentions })).toBe('/new 项目A')
    expect(bridge._normalizeCommandText('/resume @机器人 1', chatContext, { mentions: robotMentions })).toBe('/resume 1')
    expect(bridge._normalizeCommandText('/resume 1@机器人', chatContext, { mentions: robotMentions })).toBe('/resume 1')
    expect(bridge._normalizeCommandText('/rename 群聊测试 @机器人', chatContext, { mentions: robotMentions })).toBe('/rename 群聊测试')
    expect(bridge._normalizeCommandText('/rename 群聊测试@机器人', chatContext, { mentions: robotMentions })).toBe('/rename 群聊测试')
    expect(bridge._normalizeCommandText('/status @机器人', chatContext, { mentions: robotMentions })).toBe('/status')
    expect(bridge._normalizeCommandText('/status@机器人', chatContext, { mentions: robotMentions })).toBe('/status')
    expect(bridge._normalizeCommandText('/close @机器人', chatContext, { mentions: robotMentions })).toBe('/close')
    expect(bridge._normalizeCommandText('/help @机器人', chatContext, { mentions: robotMentions })).toBe('/help')
    expect(bridge._normalizeCommandText('/rename 群聊测试@张三', chatContext, {
      mentions: [{ key: '@张三', name: '张三', id: 'ou_user', idType: 'open_id' }]
    })).toBe('/rename 群聊测试@张三')
  })
})

describe('ImSessionMapper', () => {
  it('queries history sessions with IM type isolation when database supports it', async () => {
    const getImSessionsByType = vi.fn(() => [{ session_id: 'f-1', type: 'feishu' }])
    const mapper = new ImSessionMapper({
      agentSessionManager: { sessions: new Map() },
      sessionDatabase: { getImSessionsByType },
      imType: 'feishu',
      maxHistorySessions: 7,
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: () => '飞书会话'
    })

    const result = await mapper._queryHistorySessions({
      userId: 'ou_xxx',
      chatId: 'oc_xxx'
    })

    expect(getImSessionsByType).toHaveBeenCalledWith('feishu', 'ou_xxx', 'oc_xxx', 7)
    expect(result).toEqual([{ session_id: 'f-1', type: 'feishu' }])
  })

  it('treats agent conversation records as the source of truth for active external IM sessions', async () => {
    const mapper = new ImSessionMapper({
      agentSessionManager: { sessions: new Map() },
      sessionDatabase: {
        getAgentConversation: vi.fn(() => ({ session_id: 'f-1', status: 'idle' }))
      },
      imType: 'feishu',
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: () => '飞书会话'
    })

    mapper.sessionMap.set('ou_xxx:oc_xxx', 'f-1')
    const sessionId = await mapper.resolveActiveSessionId('ou_xxx:oc_xxx')

    expect(sessionId).toBe('f-1')
  })

  it('does not fall back to conversation_id-only legacy Feishu history rows', async () => {
    const getImSessionsByType = vi.fn(() => [])
    const listAllAgentConversations = vi.fn(() => [
      {
        session_id: 'f-legacy-1',
        type: 'chat',
        im_channel: 'feishu',
        title: '飞书 · oc_xxx · ',
        conversation_id: 'oc_xxx',
        staff_id: '',
        updated_at: Date.now()
      }
    ])
    const mapper = new ImSessionMapper({
      agentSessionManager: { sessions: new Map() },
      sessionDatabase: { getImSessionsByType, listAllAgentConversations },
      imType: 'feishu',
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: () => '飞书会话'
    })

    const result = await mapper._queryHistorySessions({
      userId: 'ou_xxx',
      chatId: 'oc_xxx'
    })

    expect(listAllAgentConversations).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('does not include proactively sent p2p Feishu sessions in history before new chatId metadata exists', async () => {
    const getImSessionsByType = vi.fn(() => [])
    const listAllAgentConversations = vi.fn(() => [
      {
        session_id: 'f-proactive-1',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'feishu',
        title: 'C (test2) deepseek计量',
        conversation_id: '',
        staff_id: 'ou_target',
        updated_at: Date.now()
      }
    ])
    const mapper = new ImSessionMapper({
      agentSessionManager: { sessions: new Map() },
      sessionDatabase: { getImSessionsByType, listAllAgentConversations },
      imType: 'feishu',
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: () => '飞书会话'
    })

    const result = await mapper._queryHistorySessions({
      userId: 'ou_target',
      chatId: 'oc_reply',
      chatType: 'p2p'
    })

    expect(listAllAgentConversations).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('returns only exact new-field Feishu history even when proactive p2p rows also exist', async () => {
    const now = Date.now()
    const getImSessionsByType = vi.fn(() => [
      {
        session_id: 'f-old-1',
        type: 'chat',
        im_channel: 'feishu',
        title: '旧会话',
        conversation_id: 'oc_reply',
        staff_id: 'ou_target',
        updated_at: now - 60 * 60 * 1000
      }
    ])
    const listAllAgentConversations = vi.fn(() => [
      {
        session_id: 'f-proactive-1',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'feishu',
        title: '桌面主动会话',
        conversation_id: '',
        staff_id: 'ou_target',
        updated_at: now
      },
      {
        session_id: 'f-old-1',
        type: 'chat',
        im_channel: 'feishu',
        title: '旧会话',
        conversation_id: 'oc_reply',
        staff_id: 'ou_target',
        updated_at: now - 60 * 60 * 1000
      }
    ])
    const mapper = new ImSessionMapper({
      agentSessionManager: { sessions: new Map() },
      sessionDatabase: { getImSessionsByType, listAllAgentConversations },
      imType: 'feishu',
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: () => '飞书会话'
    })

    const result = await mapper._queryHistorySessions({
      userId: 'ou_target',
      chatId: 'oc_reply',
      chatType: 'p2p'
    })

    expect(listAllAgentConversations).not.toHaveBeenCalled()
    expect(result.map(row => row.session_id)).toEqual(['f-old-1'])
  })

  it('ignores conversation-only legacy Feishu rows for p2p history when exact new-field rows are absent', async () => {
    const getImSessionsByType = vi.fn(() => [])
    const listAllAgentConversations = vi.fn(() => [
      {
        session_id: 'f-legacy-1',
        type: 'chat',
        im_channel: 'feishu',
        title: '飞书 · oc_xxx · ',
        conversation_id: 'oc_xxx',
        staff_id: '',
        updated_at: Date.now()
      }
    ])
    const mapper = new ImSessionMapper({
      agentSessionManager: { sessions: new Map() },
      sessionDatabase: { getImSessionsByType, listAllAgentConversations },
      imType: 'feishu',
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: () => '飞书会话'
    })

    const result = await mapper._queryHistorySessions({
      userId: 'ou_real_user',
      chatId: 'oc_xxx',
      chatType: 'p2p'
    })

    expect(listAllAgentConversations).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('drops stale Feishu map bindings when the database lookup throws', async () => {
    const mapper = new ImSessionMapper({
      agentSessionManager: { sessions: new Map() },
      sessionDatabase: {
        getAgentConversation: vi.fn(() => {
          throw new Error('db failed')
        })
      },
      imType: 'feishu',
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: () => '飞书会话'
    })

    mapper.sessionMap.set('ou_xxx:oc_xxx', 'f-1')
    const sessionId = await mapper.resolveActiveSessionId('ou_xxx:oc_xxx')

    expect(sessionId).toBe(null)
    expect(mapper.sessionMap.has('ou_xxx:oc_xxx')).toBe(false)
  })
})

describe('FeishuEventClient', () => {
  it('extracts image_key from JSON content for image messages', () => {
    const client = new FeishuEventClient()
    const images = client._extractImages({
      message_type: 'image',
      content: JSON.stringify({
        image_key: 'img_v3_0211u_456f155b-671f-4139-9c25-6e5748842e8g'
      })
    }, 'om_x100')

    expect(images).toEqual([{
      imageKey: 'img_v3_0211u_456f155b-671f-4139-9c25-6e5748842e8g',
      messageId: 'om_x100'
    }])
  })

  it('extracts text and image keys from direct-array post content', () => {
    const client = new FeishuEventClient()
    const messageHandler = vi.fn()
    client.on('message', messageHandler)

    client._handleImMessage({
      event_type: 'im.message.receive_v1',
      message: {
        message_id: 'om_post_direct',
        message_type: 'post',
        chat_id: 'oc_xxx',
        chat_type: 'p2p',
        content: JSON.stringify({
          content: [
            [
              { tag: 'text', text: '请分析这张图' },
              { tag: 'img', image_key: 'img_post_direct' }
            ]
          ]
        })
      },
      sender: {
        sender_id: {
          open_id: 'ou_xxx'
        }
      }
    })

    expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'om_post_direct',
      msgType: 'post',
      text: '请分析这张图',
      images: [{
        imageKey: 'img_post_direct',
        messageId: 'om_post_direct'
      }]
    }))
  })

  it.skip('extracts group-card context from card action events', () => {
    const client = new FeishuEventClient()
    const cardActionHandler = vi.fn()
    client.on('cardAction', cardActionHandler)

    client._handleCardAction({
      event: {
        action: {
          tag: 'button',
          value: { command: 'status' }
        },
        operator: {
          operator_id: {
            open_id: 'ou_group'
          }
        },
        context: {
          open_chat_id: 'oc_group',
          open_message_id: 'om_card_1'
        }
      }
    })

    expect(cardActionHandler).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'button',
      actionValue: { command: 'status' },
      userId: 'ou_group',
      chatId: 'oc_group',
      chatType: 'chat',
      messageId: 'om_card_1'
    }))
  })

  it.skip('falls back to alternate card-action identity fields when operator.open_id is absent', () => {
    const client = new FeishuEventClient()
    const cardActionHandler = vi.fn()
    client.on('cardAction', cardActionHandler)

    client._handleCardAction({
      event: {
        action: {
          tag: 'button',
          value: { intent: 'new', source: 'history-choice' }
        },
        operator_id: {
          user_id: 'ou_fallback'
        },
        context: {
          chat_id: 'oc_fallback',
          chat_type: 'p2p'
        }
      }
    })

    expect(cardActionHandler).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'button',
      actionValue: { intent: 'new', source: 'history-choice' },
      userId: 'ou_fallback',
      chatId: 'oc_fallback',
      chatType: 'p2p'
    }))
  })

  it('marks unsupported Feishu message types explicitly', () => {
    const client = new FeishuEventClient()
    const messageHandler = vi.fn()
    client.on('message', messageHandler)

    client._handleImMessage({
      event_type: 'im.message.receive_v1',
      message: {
        message_id: 'om_file_unsupported',
        message_type: 'file',
        chat_id: 'oc_xxx',
        chat_type: 'p2p',
        content: '{}'
      },
      sender: {
        sender_id: {
          open_id: 'ou_xxx'
        }
      }
    })

    expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'om_file_unsupported',
      msgType: 'file',
      unsupported: true
    }))
  })

  it('preserves robot mention metadata and leaves text untouched before bridge-level normalization', () => {
    const client = new FeishuEventClient()
    const messageHandler = vi.fn()
    client.on('message', messageHandler)

    client._handleImMessage({
      event_type: 'im.message.receive_v1',
      message: {
        message_id: 'om_group_cmd',
        message_type: 'text',
        chat_id: 'oc_group',
        chat_type: 'chat',
        content: JSON.stringify({
          text: '@_user_1 /rename 群聊测试',
          mentions: [
            { key: '@_user_1', name: '机器人', id: 'app-id', id_type: 'app_id' }
          ]
        })
      },
      sender: {
        sender_id: {
          open_id: 'ou_group'
        }
      }
    })

    expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'om_group_cmd',
      text: '@_user_1 /rename 群聊测试',
      mentions: [
        expect.objectContaining({ key: '@_user_1', id: 'app-id', idType: 'app_id' })
      ],
      chatType: 'chat'
    }))
  })

  it('extracts top-level mention metadata from text messages', () => {
    const client = new FeishuEventClient()
    const messageHandler = vi.fn()
    client.on('message', messageHandler)

    client._handleImMessage({
      event_type: 'im.message.receive_v1',
      message: {
        message_id: 'om_group_cmd_top_level',
        message_type: 'text',
        chat_id: 'oc_group',
        chat_type: 'chat',
        content: JSON.stringify({
          text: '@_user_1 你好'
        }),
        mentions: [
          { key: '@_user_1', name: '机器人', id: 'app-id', id_type: 'app_id' }
        ]
      },
      sender: {
        sender_id: {
          open_id: 'ou_group'
        }
      }
    })

    expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'om_group_cmd_top_level',
      text: '@_user_1 你好',
      mentions: [
        expect.objectContaining({ key: '@_user_1', id: 'app-id', idType: 'app_id' })
      ],
      chatType: 'chat'
    }))
  })

  it('extracts post mentions from group messages', () => {
    const client = new FeishuEventClient()
    const messageHandler = vi.fn()
    client.on('message', messageHandler)

    client._handleImMessage({
      event_type: 'im.message.receive_v1',
      message: {
        message_id: 'om_group_text',
        message_type: 'post',
        chat_id: 'oc_group',
        chat_type: 'chat',
        content: JSON.stringify({
          content: {
            zh_cn: {
              content: [[
                { tag: 'at', user_id: 'app-id', user_name: '机器人' },
                { tag: 'text', text: '请继续分析' }
              ]]
            }
          }
        })
      },
      sender: {
        sender_id: {
          open_id: 'ou_group'
        }
      }
    })

    expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'om_group_text',
      text: '请继续分析',
      mentions: [
        expect.objectContaining({ id: 'app-id', name: '机器人' })
      ],
      chatType: 'chat'
    }))
  })

  it('transitions to disconnected state when Feishu connection is lost', () => {
    const client = new FeishuEventClient()
    client._connected = true
    client._runtimeState = 'connected'

    client._markDisconnected()

    expect(client._connected).toBe(false)
    expect(client._runtimeState).toBe('disconnected')
  })
})

describe('FeishuMessageAPI', () => {
  it('returns image_key from the SDK top-level upload response', async () => {
    const api = new FeishuMessageAPI()
    api.setCredentials('app-id', 'app-secret')
    const createSpy = vi.spyOn(api._client.im.v1.image, 'create').mockResolvedValue({
      image_key: 'img_top_level'
    })

    const imageKey = await api.uploadImage(Buffer.from('pngdata'))

    expect(imageKey).toBe('img_top_level')
    expect(createSpy).toHaveBeenCalledWith({
      data: {
        image_type: 'message',
        image: expect.any(Buffer)
      }
    })
  })

  it('keeps the nested upload response fallback for alternate clients', async () => {
    const api = new FeishuMessageAPI()
    api.setCredentials('app-id', 'app-secret')
    vi.spyOn(api._client.im.v1.image, 'create').mockResolvedValue({
      data: { image_key: 'img_nested' }
    })

    await expect(api.uploadImage(Buffer.from('pngdata'))).resolves.toBe('img_nested')
  })

  it('downloads message images from the SDK stream wrapper', async () => {
    const api = new FeishuMessageAPI()
    api.setCredentials('app-id', 'app-secret')
    const getSpy = vi.spyOn(api._client.im.v1.messageResource, 'get').mockResolvedValue({
      headers: { 'content-type': 'image/png; charset=utf-8' },
      getReadableStream: () => Readable.from([Buffer.from('image-bytes')])
    })

    const image = await api.downloadImage('img_1', 'om_1')

    expect(getSpy).toHaveBeenCalledWith({
      path: { message_id: 'om_1', file_key: 'img_1' },
      params: { type: 'image' }
    })
    expect(image).toEqual({
      base64: Buffer.from('image-bytes').toString('base64'),
      mediaType: 'image/png'
    })
  })

  it('loads user display names through the basicBatch endpoint', async () => {
    const api = new FeishuMessageAPI()
    api.setCredentials('app-id', 'app-secret')
    const basicBatchSpy = vi.spyOn(api._client.contact.v3.user, 'basicBatch').mockResolvedValue({
      data: {
        users: [{
          user_id: 'ou_xxx',
          name: '张三',
          en_name: 'San Zhang'
        }]
      }
    })

    const user = await api.getUserInfo('ou_xxx')

    expect(basicBatchSpy).toHaveBeenCalledWith({
      params: { user_id_type: 'open_id' },
      data: { user_ids: ['ou_xxx'] }
    })
    expect(user).toEqual(expect.objectContaining({
      name: '张三',
      en_name: 'San Zhang'
    }))
  })

  it.skip('recursively lists all organization members across child departments', async () => {
    const api = new FeishuMessageAPI()
    api.setCredentials('app-id', 'app-secret')

    const userListSpy = vi.spyOn(api._client.contact.v3.user, 'findByDepartment').mockImplementation(async ({ params }) => {
      const deptUsers = {
        '0': { items: [] },
        'od_sales': { items: [
          { open_id: 'ou_dup', name: '张三' },
          { open_id: 'ou_sales', display_name: '销售' }
        ]},
        'od_sales_a': { items: [
          { open_id: 'ou_sales_a', real_name: '研发A' }
        ]},
        'od_eng': { items: [
          { open_id: 'ou_dup', name: '张三' },
          { open_id: 'ou_eng', nickname: '工程师' }
        ]}
      }
      return { data: deptUsers[params.department_id] || { items: [] } }
    })

    const deptChildrenSpy = vi.spyOn(api._client.contact.v3.department, 'children').mockImplementation(async ({ path }) => {
      const children = {
        '0': { items: [{ open_department_id: 'od_sales' }, { open_department_id: 'od_eng' }] },
        'od_sales': { items: [{ open_department_id: 'od_sales_a' }] },
        'od_eng': { items: [] },
        'od_sales_a': { items: [] }
      }
      return { data: children[path.department_id] || { items: [] } }
    })

    const users = await api.listUsers({ limit: 10 })

    expect(userListSpy).toHaveBeenCalledWith({
      params: expect.objectContaining({
        department_id: '0',
        department_id_type: 'open_department_id',
        user_id_type: 'open_id'
      })
    })
    expect(deptChildrenSpy).toHaveBeenCalled()
    expect(users.map((user) => user.openId)).toEqual([
      'ou_dup',
      'ou_sales',
      'ou_eng',
      'ou_sales_a'
    ])
    expect(users).toEqual([
      expect.objectContaining({ targetId: 'ou_dup', displayName: '张三' }),
      expect.objectContaining({ targetId: 'ou_sales', displayName: '销售' }),
      expect.objectContaining({ targetId: 'ou_eng', displayName: '工程师' }),
      expect.objectContaining({ targetId: 'ou_sales_a', displayName: '研发A' })
    ])
  })
})

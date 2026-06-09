import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { AgentSessionManager } = await import('../../src/main/agent-session-manager.js')
const { WeixinBridge } = await import('../../src/main/managers/weixin-bridge.js')

describe('WeixinBridge', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-weixin-bridge-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createHarness() {
    const sent = []
    const events = new EventEmitter()
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, data) => sent.push({ channel, data })
      }
    }
    const configManager = {
      getConfig: () => ({ settings: { agent: { outputBaseDir: tempDir } } }),
      getDefaultProfile: () => ({ id: 'p1', baseUrl: 'https://example.com' }),
      getAPIProfile: () => null
    }
    const manager = new AgentSessionManager(mainWindow, configManager)
    manager.sessionDatabase = {
      insertAgentMessage: vi.fn(),
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      updateAgentConversation: vi.fn(),
      updateImIdentity: vi.fn(),
      updateAgentMessageToolOutput: vi.fn(),
      getAgentConversation: vi.fn(() => null)
    }
    const service = {
      sendText: vi.fn(async payload => ({ success: true, target: { id: payload.targetId } })),
      sendImages: vi.fn(async payload => ({ success: true, target: { id: payload.targetId } })),
      getTargetById: vi.fn(targetId => targetId === 'acc-1:user-a'
        ? {
            id: 'acc-1:user-a',
            accountId: 'acc-1',
            userId: 'user-a',
            displayName: '雷斯林',
            hasContextToken: true
          }
        : null),
      on: (eventName, listener) => {
        events.on(eventName, listener)
        return () => events.off(eventName, listener)
      }
    }
    const bridge = new WeixinBridge(configManager, manager, service, mainWindow)
    return { bridge, manager, events, sent, service }
  }

  function inboundMessage(overrides = {}) {
    return {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      from: 'user-a',
      text: '收到请回复',
      contextToken: 'ctx-1',
      createTimeMs: 123,
      target: { displayName: '雷斯林' },
      ...overrides
    }
  }

  function stubSendMessage(manager) {
    return vi.spyOn(manager, 'sendMessage').mockImplementation(async (sessionId, userMessage, options = {}) => {
      const meta = options.meta || {}
      const session = manager.sessions.get(sessionId)
      const text = typeof userMessage === 'string' ? userMessage : (userMessage?.text || '[图片]')
      const message = {
        id: `msg-ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        origin: meta.origin || 'desktop',
        imChannel: meta.imChannel || null,
        senderNick: meta.senderNick,
        meta
      }
      if (userMessage?.images?.length) message.images = userMessage.images
      session.messages.push(message)
      manager.emit('userMessage', {
        sessionId,
        sessionType: session.type,
        imChannel: session.imChannel,
        content: text,
        images: userMessage?.images || null,
        origin: meta.origin || 'desktop'
      })
    })
  }

  it('creates a Weixin session and submits inbound text to Agent', async () => {
    const { bridge, manager, events, sent } = createHarness()
    const sendMessage = stubSendMessage(manager)

    bridge.start()
    events.emit('message', inboundMessage())
    await bridge.inboundMessageQueues.get('acc-1:user-a')

    expect(sendMessage).toHaveBeenCalledWith(
      expect.any(String),
      '收到请回复',
      {
        meta: expect.objectContaining({
          origin: 'im-inbound',
          imChannel: 'weixin',
          senderNick: '雷斯林',
          accountId: 'acc-1',
          targetId: 'acc-1:user-a',
          from: 'user-a',
          contextToken: 'ctx-1',
          createTimeMs: 123
        })
      }
    )
    expect(manager.sessions.size).toBe(1)

    const session = Array.from(manager.sessions.values())[0]
    expect(session.type).toBe('chat')
    expect(session.imChannel).toBe('weixin')
    expect(session.title).toBe('微信 · 雷斯林')
    expect(session.messages).toHaveLength(1)
    expect(session.messages[0]).toMatchObject({
      role: 'user',
      content: '收到请回复',
      origin: 'im-inbound',
      imChannel: 'weixin',
      senderNick: '雷斯林'
    })

    expect(sent.map(item => item.channel)).toEqual([
      'weixin:sessionCreated',
      'weixin:messageReceived'
    ])
  })

  it('reuses the same session for the same target', async () => {
    const { bridge, manager } = createHarness()
    stubSendMessage(manager)

    await bridge._handleMessage(inboundMessage({ text: '第一条' }))
    await bridge._handleMessage(inboundMessage({ text: '第二条' }))

    const sessions = Array.from(manager.sessions.values())
    expect(sessions).toHaveLength(1)
    expect(sessions[0].messages.map(msg => msg.content)).toEqual(['第一条', '第二条'])
  })

  it('queues inbound messages for the same Weixin target', async () => {
    const { bridge, manager } = createHarness()
    const calls = []
    vi.spyOn(manager, 'sendMessage').mockImplementation(async (sessionId, userMessage) => {
      calls.push(userMessage)
      manager.sessions.get(sessionId).status = 'streaming'
    })

    bridge.start()
    const first = bridge._enqueueInboundMessage(inboundMessage({ text: '第一条' }))
    const second = bridge._enqueueInboundMessage(inboundMessage({ text: '第二条' }))

    await vi.waitFor(() => {
      expect(calls).toEqual(['第一条'])
    })

    const session = Array.from(manager.sessions.values())[0]
    manager.emit('agentResult', session.id)

    await vi.waitFor(() => {
      expect(calls).toEqual(['第一条', '第二条'])
    })
    manager.emit('agentResult', session.id)

    await Promise.all([first, second])
    expect(calls).toEqual(['第一条', '第二条'])
  })

  it('submits inbound Weixin images to Agent and frontend', async () => {
    const { bridge, manager, sent } = createHarness()
    const sendMessage = stubSendMessage(manager)
    const images = [{ base64: Buffer.from('image').toString('base64'), mediaType: 'image/png' }]

    await bridge._handleMessage(inboundMessage({ text: '', images }))

    expect(sendMessage).toHaveBeenCalledWith(
      expect.any(String),
      { text: '', images },
      expect.objectContaining({
        meta: expect.objectContaining({ origin: 'im-inbound', imChannel: 'weixin' })
      })
    )
    const session = Array.from(manager.sessions.values())[0]
    expect(session.messages[0]).toMatchObject({
      content: '[图片]',
      images
    })
    expect(sent.find(item => item.channel === 'weixin:messageReceived').data).toMatchObject({
      text: '[图片]',
      images
    })
  })

  it('routes replies to the session that sent the Weixin notification', async () => {
    const { bridge, manager, events } = createHarness()
    stubSendMessage(manager)
    const session = manager.create({ type: 'chat', source: 'manual', title: '原会话' })

    bridge.start()
    events.emit('sent', {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      sessionId: session.id,
      target: { displayName: '雷斯林' }
    })
    events.emit('message', inboundMessage({ text: '我收到了' }))
    await bridge.inboundMessageQueues.get('acc-1:user-a')

    expect(manager.sessions.size).toBe(1)
    const originalSession = manager.sessions.get(session.id)
    expect(originalSession.messages).toHaveLength(1)
    expect(originalSession.messages[0]).toMatchObject({
      role: 'user',
      content: '我收到了',
      origin: 'im-inbound',
      imChannel: 'weixin',
      senderNick: '雷斯林'
    })
  })

  it('rebinds a target to the latest session and clears the old session binding', () => {
    const { bridge, manager } = createHarness()
    const firstSession = manager.create({ type: 'chat', source: 'manual', title: '会话 A' })
    const secondSession = manager.create({ type: 'chat', source: 'manual', title: '会话 B' })

    bridge.bindTarget(firstSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
    bridge.bindTarget(secondSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })

    expect(bridge.getBinding(firstSession.id)).toBe(null)
    expect(bridge.getBinding(secondSession.id)).toEqual({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
    expect(bridge.sessionMap.get('acc-1:user-a')).toBe(secondSession.id)
  })

  it('locks a normal session to Weixin after first proactive bind', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)

    bridge.bindTarget(session.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })

    expect(session.imChannel).toBe('weixin')
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(session.id, {
            imChannel: 'weixin'
    })
    expect(() => manager.bindSessionExternalImSource(session.id, 'feishu')).toThrow(/已绑定weixin渠道/)
  })

  it('locks a normal session to Weixin only after proactive send succeeds', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)

    bridge.weixinNotifyService.sendText.mockRejectedValueOnce(new Error('send failed'))
    await expect(bridge.sendToTarget({
      sessionId: session.id,
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林',
      text: '任务已完成'
    })).rejects.toThrow(/send failed/)

    expect(session.imChannel).toBeNull()
    expect(bridge.getBinding(session.id)).toBe(null)
    expect(manager.sessionDatabase.updateAgentConversation).not.toHaveBeenCalledWith(session.id, {
            imChannel: 'weixin'
    })

    await bridge.sendToTarget({
      sessionId: session.id,
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林',
      text: '任务已完成'
    })

    expect(session.imChannel).toBe('weixin')
    expect(bridge.getBinding(session.id)).toEqual({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
  })

  it('emits session updated after first proactive Weixin bind', () => {
    const { bridge, manager, sent } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    bridge.bindTarget(created.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })

    expect(sent).toContainEqual({
      channel: 'session:updated',
      data: {
        sessionId: created.id,
        session: expect.objectContaining({
          id: created.id,
          type: 'chat',
          imChannel: 'weixin'
        })
      }
    })
  })

  it('persists canonical weixin single chat identity without accountId in im_chat_id', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    bridge.bindTarget(created.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })

    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(created.id, {
      imChannel: 'weixin'
    })
    expect(manager.sessionDatabase.updateImIdentity).toHaveBeenCalledWith(created.id, {
      userId: 'acc-1:user-a',
      chatId: '',
      chatType: 'p2p'
    })
  })

  it('restores weixin binding from persisted targetId via weixin target registry', () => {
    const { bridge, manager, service } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    manager.sessions.delete(created.id)
    manager.sessionDatabase.getAgentConversation.mockReturnValue({
      session_id: created.id,
      status: 'streaming',
      im_channel: 'weixin',
      im_user_id: 'acc-1:user-a',
      im_chat_id: ''
    })

    expect(bridge.getBinding(created.id)).toEqual({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
    expect(service.getTargetById).toHaveBeenCalledWith('acc-1:user-a')
  })

  it('prompts for history after the current weixin session was closed on desktop', async () => {
    const { bridge, manager } = createHarness()
    stubSendMessage(manager)

    const current = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'weixin', title: '当前会话' })
    const historyRow = {
      session_id: 'hist-weixin-1',
      title: '历史微信会话',
      type: 'chat',
      source: 'im-inbound',
      im_channel: 'weixin',
      im_user_id: 'acc-1:user-a',
      im_chat_id: '',
      updated_at: Date.now() - 60 * 1000,
      status: 'idle'
    }

    bridge.sessionMap.set('acc-1:user-a', current.id)
    manager.sessionDatabase.getAgentConversation.mockImplementation((sessionId) => {
      if (sessionId === current.id) {
        return {
          session_id: current.id,
          type: 'chat',
          title: '当前会话',
          im_channel: 'weixin',
          status: 'closed'
        }
      }
      return null
    })
    manager.sessionDatabase.getImSessionsByType = vi.fn(() => [historyRow])
    const replySpy = vi.spyOn(bridge, '_replyToWeixin').mockResolvedValue()
    const createSession = vi.spyOn(bridge._sessionMapper, 'createSession')

    manager.sessions.delete(current.id)
    await bridge._handleMessage(inboundMessage({ text: '关闭后继续' }))

    expect(replySpy).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'acc-1:user-a' }),
      expect.stringContaining('历史微信会话')
    )
    expect(createSession).not.toHaveBeenCalled()
    expect(bridge.pendingInboundMessages.get('acc-1:user-a')?.message).toEqual(
      expect.objectContaining({ text: '关闭后继续' })
    )
  })

  it('resumes selected weixin history session after numeric reply', async () => {
    const { bridge, manager } = createHarness()
    const sendMessage = stubSendMessage(manager)

    const historySessionId = 'hist-weixin-2'
    bridge._sessionMapper._pendingChoices.set('acc-1:user-a', {
      sessions: [{ session_id: historySessionId, title: '历史微信会话 2', updated_at: Date.now() - 60 * 1000 }],
      resolve: () => {},
      timer: setTimeout(() => {}, 60 * 1000),
      options: {}
    })
    bridge.pendingInboundMessages.set('acc-1:user-a', {
      message: inboundMessage({ text: '继续之前内容' }),
      identity: {
        userId: 'acc-1:user-a',
        targetId: 'acc-1:user-a',
        chatType: 'p2p',
        nickname: '雷斯林',
      }
    })

    const reopened = manager.create({ type: 'chat', source: 'manual', title: '历史微信会话 2' })
    manager.sessions.delete(reopened.id)
    vi.spyOn(manager, 'reopen').mockImplementation((sessionId) => {
      if (sessionId !== historySessionId) return null
      const session = {
        ...reopened,
        id: historySessionId,
        title: '历史微信会话 2',
        messages: [],
        status: 'idle',
        imChannel: 'weixin'
      }
      manager.sessions.set(historySessionId, session)
      return session
    })

    const replySpy = vi.spyOn(bridge, '_replyToWeixin').mockResolvedValue()
    const notifySpy = vi.spyOn(bridge, '_notifyFrontend')

    await bridge._handleMessage(inboundMessage({ text: '1' }))

    expect(manager.reopen).toHaveBeenCalledWith(historySessionId)
    expect(bridge.sessionMap.get('acc-1:user-a')).toBe(historySessionId)
    expect(replySpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: '1' }),
      expect.stringContaining('会话恢复中，请等待信息返回后，即可开始聊天')
    )
    expect(notifySpy).toHaveBeenCalledWith(
      'weixin:sessionCreated',
      expect.objectContaining({ sessionId: historySessionId })
    )
    expect(sendMessage).toHaveBeenCalledWith(
      historySessionId,
      '继续之前内容',
      expect.objectContaining({
        meta: expect.objectContaining({
          origin: 'im-inbound',
          imChannel: 'weixin',
          targetId: 'acc-1:user-a'
        })
      })
    )

    clearTimeout(bridge._sessionMapper._pendingChoices.get('acc-1:user-a')?.timer)
  })

  it('creates a new weixin session from pending choice and replays hello activation', async () => {
    const { bridge, manager } = createHarness()
    const sendMessage = stubSendMessage(manager)
    const replySpy = vi.spyOn(bridge, '_replyToWeixin').mockResolvedValue()
    const notifySpy = vi.spyOn(bridge, '_notifyFrontend')

    bridge._sessionMapper._pendingChoices.set('acc-1:user-a', {
      sessions: [{ session_id: 'hist-weixin-3', title: '历史微信会话 3', updated_at: Date.now() - 60 * 1000 }],
      resolve: () => {},
      timer: setTimeout(() => {}, 60 * 1000),
      options: {}
    })
    bridge.pendingInboundMessages.set('acc-1:user-a', {
      message: inboundMessage({ text: '重新开始' }),
      identity: {
        userId: 'acc-1:user-a',
        targetId: 'acc-1:user-a',
        chatType: 'p2p',
        nickname: '雷斯林',
      }
    })

    await bridge._handleMessage(inboundMessage({ text: '0' }))

    const created = Array.from(manager.sessions.values()).find(session => session.title === '微信 · 雷斯林')
    expect(created).toBeTruthy()
    expect(bridge.sessionMap.get('acc-1:user-a')).toBe(created.id)
    expect(replySpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: '0' }),
      expect.stringContaining('会话创建中，请等待信息返回后，即可开始聊天')
    )
    expect(notifySpy).toHaveBeenCalledWith(
      'weixin:sessionCreated',
      expect.objectContaining({ sessionId: created.id })
    )
    expect(sendMessage).toHaveBeenCalledWith(
      created.id,
      '重新开始',
      expect.objectContaining({
        meta: expect.objectContaining({
          origin: 'im-inbound',
          imChannel: 'weixin',
          targetId: 'acc-1:user-a'
        })
      })
    )

    clearTimeout(bridge._sessionMapper._pendingChoices.get('acc-1:user-a')?.timer)
  })

  it('does not remove the newer route when unbinding an old session', () => {
    const { bridge, manager } = createHarness()
    const firstSession = manager.create({ type: 'chat', source: 'manual', title: '会话 A' })
    const secondSession = manager.create({ type: 'chat', source: 'manual', title: '会话 B' })

    bridge.bindTarget(firstSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
    bridge.bindTarget(secondSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })

    bridge.unbindTarget(firstSession.id)

    expect(bridge.sessionMap.get('acc-1:user-a')).toBe(secondSession.id)
    expect(bridge.getBinding(secondSession.id)).toEqual({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
  })

  it('does not forward assistant confirmation before Weixin user replies', async () => {
    const { bridge, manager, events } = createHarness()
    const session = manager.create({ type: 'chat', source: 'manual', title: '原会话' })

    bridge.start()
    events.emit('sent', {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      sessionId: session.id,
      target: { displayName: '雷斯林' }
    })
    manager.emit('agentMessage', session.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '已发送微信通知。' }]
    })
    manager.emit('agentResult', session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendText).not.toHaveBeenCalled()
  })

  it('syncs desktop intervention in a Weixin session back to Weixin', async () => {
    const { bridge, manager, events } = createHarness()
    const session = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'weixin', title: '微信 · 雷斯林' })

    bridge.start()
    events.emit('sent', {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      sessionId: session.id,
      target: { displayName: '雷斯林' }
    })
    manager.emit('userMessage', {
      sessionId: session.id,
      sessionType: 'weixin',
      content: '桌面补充一句',
      images: null,
      source: null
    })
    manager.emit('agentMessage', session.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '这是桌面端触发后的回复。' }]
    })
    manager.emit('agentResult', session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendText).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: [
        '桌面端介入：',
        '> 桌面补充一句',
        '',
        '这是桌面端触发后的回复。'
      ].join('\n'),
      sessionId: session.id
    })
  })

  it('syncs desktop intervention images back to Weixin', async () => {
    const { bridge, manager, events } = createHarness()
    const session = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'weixin', title: '微信 · 雷斯林' })
    const images = [{ base64: Buffer.from('image').toString('base64'), mediaType: 'image/png' }]

    bridge.start()
    events.emit('sent', {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      sessionId: session.id,
      target: { displayName: '雷斯林' }
    })
    manager.emit('userMessage', {
      sessionId: session.id,
      sessionType: 'weixin',
      content: '桌面发图',
      images,
      source: null
    })
    manager.emit('agentResult', session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendImages).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: [
        '桌面端介入：',
        '> 桌面发图'
      ].join('\n'),
      images,
      imagePaths: [],
      sessionId: session.id
    })
  })

  it('forwards assistant replies back to Weixin immediately after inbound message activates the target', async () => {
    const { bridge, manager, events } = createHarness()
    stubSendMessage(manager)
    const session = manager.create({ type: 'chat', source: 'manual', title: '原会话' })

    bridge.start()
    events.emit('sent', {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      sessionId: session.id,
      target: { displayName: '雷斯林' }
    })
    await bridge._handleMessage(inboundMessage({ text: '我收到了' }))
    manager.emit('agentMessage', session.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '收到，我稍后联系你。' }]
    })
    await bridge.replySendQueues.get(session.id)

    expect(bridge.weixinNotifyService.sendText).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '收到，我稍后联系你。',
      sessionId: session.id
    })
    bridge.weixinNotifyService.sendText.mockClear()
    manager.emit('agentResult', session.id)
    await Promise.resolve()
    expect(bridge.weixinNotifyService.sendText).not.toHaveBeenCalled()
  })

  it('forwards assistant image paths back to Weixin after inbound message activates the target', async () => {
    const { bridge, manager } = createHarness()
    stubSendMessage(manager)

    bridge.start()
    await bridge._handleMessage(inboundMessage({ text: '帮我画图' }))
    const session = Array.from(manager.sessions.values())[0]
    const imagePath = path.join(session.cwd, 'result.png')
    manager.emit('agentMessage', session.id, {
      type: 'assistant',
      content: [
        { type: 'text', text: '图片生成好了。' },
        { type: 'tool_use', input: { path: imagePath } }
      ]
    })
    manager.emit('agentResult', session.id)
    await bridge.replySendQueues.get(session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendImages).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '图片生成好了。',
      imagePaths: [imagePath],
      sessionId: session.id
    })
  })

  it('forwards assistant image paths outside the session directory', async () => {
    const { bridge, manager } = createHarness()
    stubSendMessage(manager)

    bridge.start()
    await bridge._handleMessage(inboundMessage({ text: '帮我画图' }))
    const session = Array.from(manager.sessions.values())[0]
    const imagePath = 'C:/workspace/out/result.png'
    manager.emit('agentMessage', session.id, {
      type: 'assistant',
      content: [
        { type: 'text', text: '图片生成好了。' },
        { type: 'tool_use', input: { path: imagePath } }
      ]
    })
    manager.emit('agentResult', session.id)
    await bridge.replySendQueues.get(session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendImages).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '图片生成好了。',
      imagePaths: [imagePath],
      sessionId: session.id
    })
  })

  it('forwards assistant images from standard tool_result file resources after agent result', async () => {
    const { bridge, manager } = createHarness()
    stubSendMessage(manager)
    manager.runner = { normalizeMessage: raw => raw }

    bridge.start()
    await bridge._handleMessage(inboundMessage({ text: '帮我画图' }))
    const session = Array.from(manager.sessions.values())[0]
    const imagePath = path.join(session.cwd, 'tool-result-cover.png')
    fs.writeFileSync(imagePath, Buffer.from('pngdata'))

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
          uri: imagePath.startsWith('/') ? `file://${imagePath.replace(/\\/g, '/')}` : `file:///${imagePath.replace(/\\/g, '/')}`,
          name: 'tool-result-cover.png',
          mimeType: 'image/png'
        }],
        structured_content: {
          type: 'image_result',
          files: [{
            uri: imagePath.startsWith('/') ? `file://${imagePath.replace(/\\/g, '/')}` : `file:///${imagePath.replace(/\\/g, '/')}`,
            name: 'tool-result-cover.png',
            mimeType: 'image/png'
          }]
        }
      }],
      toolUseResult: {
        content: [{
          type: 'resource_link',
          uri: imagePath.startsWith('/') ? `file://${imagePath.replace(/\\/g, '/')}` : `file:///${imagePath.replace(/\\/g, '/')}`,
          name: 'tool-result-cover.png',
          mimeType: 'image/png'
        }],
        structuredContent: {
          type: 'image_result',
          files: [{
            uri: imagePath.startsWith('/') ? `file://${imagePath.replace(/\\/g, '/')}` : `file:///${imagePath.replace(/\\/g, '/')}`,
            name: 'tool-result-cover.png',
            mimeType: 'image/png'
          }]
        }
      }
    })

    manager.emit('agentResult', session.id)
    await bridge.replySendQueues.get(session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendImages).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '',
      imagePaths: [imagePath],
      sessionId: session.id
    })
  })

  it('forwards assistant image paths that only appear in text blocks', async () => {
    const { bridge, manager } = createHarness()
    stubSendMessage(manager)

    bridge.start()
    await bridge._handleMessage(inboundMessage({ text: '读取它' }))
    const session = Array.from(manager.sessions.values())[0]
    const imagePath = path.join(session.cwd, 'read-result.png')

    manager.emit('agentMessage', session.id, {
      type: 'assistant',
      content: [{
        type: 'text',
        text: `已读取： ${imagePath}`
      }]
    })
    manager.emit('agentResult', session.id)
    await bridge.replySendQueues.get(session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendImages).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: `已读取： ${imagePath}`,
      imagePaths: [imagePath],
      sessionId: session.id
    })
  })

  it('shows status as a history-style menu for the current weixin target', async () => {
    const { bridge, manager } = createHarness()
    const current = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'weixin', title: '当前微信会话' })
    current.queryGenerator = {}
    bridge.sessionMap.set('acc-1:user-a', current.id)
    manager.sessionDatabase.getImSessionsByType = vi.fn(() => [
      {
        session_id: current.id,
        title: '当前微信会话',
        cwd: current.cwd,
        api_profile_id: null,
        updated_at: Date.now(),
        im_channel: 'weixin',
        im_user_id: 'acc-1:user-a',
        im_chat_id: '',
        status: 'idle'
      }
    ])
    const replySpy = vi.spyOn(bridge, '_replyToWeixin').mockResolvedValue()

    await bridge._handleWeixinCommand('/status', inboundMessage({ text: '/status' }))

    expect(replySpy).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'acc-1:user-a' }),
      expect.stringContaining('当前会话状态：')
    )
    expect(replySpy).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'acc-1:user-a' }),
      expect.stringContaining('✅ ')
    )
  })

  it('shows resume history choice menu for the current weixin target', async () => {
    const { bridge, manager } = createHarness()
    const current = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'weixin', title: '当前微信会话' })
    bridge.sessionMap.set('acc-1:user-a', current.id)
    manager.sessionDatabase.getImSessionsByType = vi.fn(() => [
      {
        session_id: current.id,
        title: '当前微信会话',
        cwd: current.cwd,
        api_profile_id: null,
        updated_at: Date.now(),
        im_channel: 'weixin',
        im_user_id: 'acc-1:user-a',
        im_chat_id: '',
        status: 'idle'
      },
      {
        session_id: 'hist-weixin-resume',
        title: '更早的微信会话',
        cwd: current.cwd,
        api_profile_id: null,
        updated_at: Date.now() - 60 * 1000,
        im_channel: 'weixin',
        im_user_id: 'acc-1:user-a',
        im_chat_id: '',
        status: 'idle'
      }
    ])
    const replySpy = vi.spyOn(bridge, '_replyToWeixin').mockResolvedValue()

    await bridge._handleWeixinCommand('/resume', inboundMessage({ text: '/resume' }))

    expect(replySpy).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'acc-1:user-a' }),
      expect.stringContaining('您有以下历史会话，请回复数字选择：')
    )
    expect(bridge._sessionMapper._pendingChoices.get('acc-1:user-a')).toBeTruthy()
    clearTimeout(bridge._sessionMapper._pendingChoices.get('acc-1:user-a')?.timer)
  })

  it('activates a new weixin session after /new command', async () => {
    const { bridge, manager } = createHarness()
    const sendMessage = stubSendMessage(manager)
    const replySpy = vi.spyOn(bridge, '_replyToWeixin').mockResolvedValue()
    const notifySpy = vi.spyOn(bridge, '_notifyFrontend')

    await bridge._handleWeixinCommand('/new', inboundMessage({ text: '/new' }))

    const created = Array.from(manager.sessions.values()).find(session => session.title === '微信 · 雷斯林')
    expect(created).toBeTruthy()
    expect(bridge.sessionMap.get('acc-1:user-a')).toBe(created.id)
    expect(replySpy).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'acc-1:user-a' }),
      expect.stringContaining('会话创建中，请等待信息返回后，即可开始聊天')
    )
    expect(notifySpy).toHaveBeenCalledWith(
      'weixin:sessionCreated',
      expect.objectContaining({ sessionId: created.id })
    )
    expect(sendMessage).toHaveBeenCalledWith(
      created.id,
      'hello',
      expect.objectContaining({
        meta: expect.objectContaining({
          origin: 'im-inbound',
          imChannel: 'weixin',
          targetId: 'acc-1:user-a'
        })
      })
    )
  })

  it('formats weixin help text with blank-line-separated commands', () => {
    const { bridge } = createHarness()

    expect(bridge._cmdHelp()).toBe(
      [
        '微信 Agent 桥接命令:',
        '/help    - 显示帮助',
        '/status  - 查看历史会话状态',
        '/close   - 关闭当前会话',
        '/new     - 新建会话',
        '/resume [编号] - 恢复历史会话',
        '/rename <名称> - 重命名当前会话',
      ].join('\n\n')
    )
  })

  it('ignores context-only updates', async () => {
    const { bridge, manager } = createHarness()

    await bridge._handleMessage(inboundMessage({ text: '' }))

    expect(manager.sessions.size).toBe(0)
  })
})

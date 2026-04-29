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
      getAgentConversation: vi.fn(() => null)
    }
    const service = {
      sendText: vi.fn(async payload => ({ success: true, target: { id: payload.targetId } })),
      sendImages: vi.fn(async payload => ({ success: true, target: { id: payload.targetId } })),
      on: (eventName, listener) => {
        events.on(eventName, listener)
        return () => events.off(eventName, listener)
      }
    }
    const bridge = new WeixinBridge(configManager, manager, service, mainWindow)
    return { bridge, manager, events, sent }
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
        source: meta.source,
        senderNick: meta.senderNick,
        meta
      }
      if (userMessage?.images?.length) message.images = userMessage.images
      session.messages.push(message)
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
          source: 'weixin',
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
    expect(session.type).toBe('weixin')
    expect(session.source).toBe('weixin')
    expect(session.title).toBe('微信 · 雷斯林')
    expect(session.messages).toHaveLength(1)
    expect(session.messages[0]).toMatchObject({
      role: 'user',
      content: '收到请回复',
      source: 'weixin',
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
        meta: expect.objectContaining({ source: 'weixin' })
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
      source: 'weixin',
      senderNick: '雷斯林'
    })
  })

  it('rebinds a target to the latest session and clears the old session binding', () => {
    const { bridge, manager } = createHarness()
    const firstSession = manager.create({ type: 'chat', source: 'manual', title: '会话 A' })
    const secondSession = manager.create({ type: 'chat', source: 'manual', title: '会话 B' })

    bridge.bindSessionToTarget(firstSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
    bridge.bindSessionToTarget(secondSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })

    expect(bridge.getSessionBinding(firstSession.id)).toBe(null)
    expect(bridge.getSessionBinding(secondSession.id)).toEqual({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
    expect(bridge.sessionMap.get('acc-1:user-a')).toBe(secondSession.id)
  })

  it('does not remove the newer route when unbinding an old session', () => {
    const { bridge, manager } = createHarness()
    const firstSession = manager.create({ type: 'chat', source: 'manual', title: '会话 A' })
    const secondSession = manager.create({ type: 'chat', source: 'manual', title: '会话 B' })

    bridge.bindSessionToTarget(firstSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })
    bridge.bindSessionToTarget(secondSession.id, {
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      displayName: '雷斯林'
    })

    bridge.unbindSessionTarget(firstSession.id)

    expect(bridge.sessionMap.get('acc-1:user-a')).toBe(secondSession.id)
    expect(bridge.getSessionBinding(secondSession.id)).toEqual({
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
    const session = manager.create({ type: 'weixin', source: 'weixin', title: '微信 · 雷斯林' })

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
    const session = manager.create({ type: 'weixin', source: 'weixin', title: '微信 · 雷斯林' })
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

    expect(bridge.weixinNotifyService.sendText).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '图片生成好了。',
      sessionId: session.id
    })
    expect(bridge.weixinNotifyService.sendImages).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '',
      imagePaths: [imagePath],
      sessionId: session.id
    })
  })

  it('does not forward assistant image paths outside the session directory', async () => {
    const { bridge, manager } = createHarness()
    stubSendMessage(manager)

    bridge.start()
    await bridge._handleMessage(inboundMessage({ text: '帮我画图' }))
    const session = Array.from(manager.sessions.values())[0]
    manager.emit('agentMessage', session.id, {
      type: 'assistant',
      content: [
        { type: 'text', text: '图片生成好了。' },
        { type: 'tool_use', input: { path: 'C:/workspace/out/result.png' } }
      ]
    })
    manager.emit('agentResult', session.id)
    await bridge.replySendQueues.get(session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendText).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '图片生成好了。',
      sessionId: session.id
    })
    expect(bridge.weixinNotifyService.sendImages).not.toHaveBeenCalled()
  })

  it('ignores context-only updates', async () => {
    const { bridge, manager } = createHarness()

    await bridge._handleMessage(inboundMessage({ text: '' }))

    expect(manager.sessions.size).toBe(0)
  })
})

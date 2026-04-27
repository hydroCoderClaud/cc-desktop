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
    return vi.spyOn(manager, 'sendMessage').mockImplementation(async (sessionId, text, options = {}) => {
      const meta = options.meta || {}
      manager.appendExternalUserMessage(sessionId, {
        content: text,
        source: meta.source,
        senderNick: meta.senderNick,
        meta
      })
    })
  }

  it('creates a Weixin session and submits inbound text to Agent', async () => {
    const { bridge, manager, events, sent } = createHarness()
    const sendMessage = stubSendMessage(manager)

    bridge.start()
    events.emit('message', inboundMessage())
    await Promise.resolve()

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
    await Promise.resolve()

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

  it('forwards assistant replies back to Weixin after inbound message activates the target', async () => {
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
    manager.emit('agentResult', session.id)
    await Promise.resolve()

    expect(bridge.weixinNotifyService.sendText).toHaveBeenCalledWith({
      accountId: 'acc-1',
      targetId: 'acc-1:user-a',
      text: '收到，我稍后联系你。',
      sessionId: session.id
    })
  })

  it('ignores context-only updates', async () => {
    const { bridge, manager } = createHarness()

    await bridge._handleMessage(inboundMessage({ text: '' }))

    expect(manager.sessions.size).toBe(0)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { AgentSessionManager } = await import('../../src/main/agent-session-manager.js')
const { EnterpriseWeixinBridge } = await import('../../src/main/managers/enterprise-weixin-bridge.js')

describe('EnterpriseWeixinBridge', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-enterprise-weixin-bridge-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createHarness() {
    const sent = []
    const replies = []
    const conversationRows = new Map()
    const wsClient = {
      on: vi.fn(),
      off: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      downloadFile: vi.fn(async () => ({ buffer: Buffer.from('image-bytes'), filename: 'remote.png' })),
      uploadMedia: vi.fn(async (_buffer, _options) => ({ media_id: `media-${Math.random().toString(36).slice(2, 8)}` })),
      replyMedia: vi.fn(async () => ({ ok: true })),
      sendMediaMessage: vi.fn(async () => ({ ok: true })),
      reply: vi.fn(async (_frame, body) => {
        replies.push(body)
        return { ok: true }
      }),
      replyWelcome: vi.fn(async (_frame, body) => {
        replies.push(body)
        return { ok: true }
      }),
      replyStreamNonBlocking: vi.fn(async () => ({ ok: true })),
      sendMessage: vi.fn(async (_chatId, body) => {
        sent.push(body)
        return { ok: true }
      }),
    }

    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, data) => sent.push({ channel, data }),
      },
    }
    const configManager = {
      getConfig: () => ({
        settings: { agent: { outputBaseDir: tempDir } },
        enterpriseWeixin: {
          enabled: true,
          botId: 'bot-id',
          secret: 'bot-secret',
          maxHistorySessions: 5,
        },
      }),
      getDefaultProfile: () => ({ id: 'p1', name: '默认配置', baseUrl: 'https://example.com' }),
      getAPIProfile: () => null,
    }
    const manager = new AgentSessionManager(mainWindow, configManager)
    manager.sessionDatabase = {
      insertAgentMessage: vi.fn(),
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      updateAgentConversation: vi.fn((sessionId, updates = {}) => {
        const current = conversationRows.get(sessionId) || { session_id: sessionId }
        const next = {
          ...current,
          ...Object.fromEntries(
            Object.entries(updates).map(([key, value]) => [
              key.replace(/([A-Z])/g, '_$1').toLowerCase(),
              value,
            ])
          ),
        }
        conversationRows.set(sessionId, next)
      }),
      updateAgentConversationTitle: vi.fn(),
      updateAgentMessageToolOutput: vi.fn(),
      setImChannel: vi.fn((sessionId, imChannel) => {
        const current = conversationRows.get(sessionId) || { session_id: sessionId }
        conversationRows.set(sessionId, {
          ...current,
          im_channel: imChannel || null,
        })
      }),
      clearImIdentity: vi.fn((sessionId) => {
        const current = conversationRows.get(sessionId) || { session_id: sessionId }
        conversationRows.set(sessionId, {
          ...current,
          staff_id: null,
          conversation_id: null,
          im_user_id: null,
          im_chat_id: null,
        })
      }),
      updateDingTalkMetadata: vi.fn((sessionId, staffId, conversationId) => {
        const current = conversationRows.get(sessionId) || { session_id: sessionId }
        conversationRows.set(sessionId, {
          ...current,
          staff_id: staffId,
          conversation_id: conversationId,
          im_user_id: staffId,
          im_chat_id: conversationId,
        })
      }),
      closeAgentConversation: vi.fn(),
      getAgentConversation: vi.fn((sessionId) => conversationRows.get(sessionId) || null),
      getImSessionsByType: vi.fn(() => []),
      listAllAgentConversations: vi.fn(() => []),
    }

    const originalCreate = manager.create.bind(manager)
    manager.create = (...args) => {
      const session = originalCreate(...args)
      conversationRows.set(session.id, {
        session_id: session.id,
        title: session.title,
        im_channel: session.imChannel || null,
        status: session.status || 'idle',
      })
      return session
    }

    const originalClose = manager.close.bind(manager)
    manager.close = async (sessionId, ...rest) => {
      const result = await originalClose(sessionId, ...rest)
      const current = conversationRows.get(sessionId) || { session_id: sessionId }
      conversationRows.set(sessionId, {
        ...current,
        status: 'closed',
      })
      return result
    }

    const originalReopen = manager.reopen.bind(manager)
    manager.reopen = (sessionId, ...rest) => {
      const result = originalReopen(sessionId, ...rest)
      const current = conversationRows.get(sessionId) || { session_id: sessionId }
      conversationRows.set(sessionId, {
        ...current,
        status: result?.status || 'idle',
        im_channel: result?.imChannel ?? current.im_channel ?? null,
      })
      return result
    }

    const bridge = new EnterpriseWeixinBridge(configManager, manager, mainWindow)
    bridge._wsClient = wsClient
    bridge._connected = true
    return { bridge, manager, sent, replies, wsClient }
  }

  function inboundFrame(overrides = {}) {
    return {
      headers: { req_id: `req-${Math.random().toString(36).slice(2, 8)}` },
      body: {
        msgid: `msg-${Math.random().toString(36).slice(2, 8)}`,
        msgtype: 'text',
        chattype: 'single',
        from: { userid: 'user-a', name: '雷斯林' },
        text: { content: '收到请回复' },
        ...overrides,
      },
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
        meta,
      }
      if (userMessage?.images?.length) message.images = userMessage.images
      session.messages.push(message)
      manager.emit('userMessage', {
        sessionId,
        sessionType: session.type,
        imChannel: session.imChannel,
        content: text,
        images: userMessage?.images || null,
        source: meta.source || null,
      })
      manager.emit('agentResult', sessionId)
    })
  }

  it('creates an Enterprise Weixin session and submits inbound text to Agent', async () => {
    const { bridge, manager, sent } = createHarness()
    const sendMessage = stubSendMessage(manager)

    await bridge._handleMessage(inboundFrame())

    expect(sendMessage).toHaveBeenCalledWith(
      expect.any(String),
      '收到请回复',
      {
        meta: expect.objectContaining({
          source: 'im-inbound',
          senderNick: '雷斯林',
          enterpriseWeixinChatId: 'user-a',
        }),
      }
    )
    expect(manager.sessions.size).toBe(1)

    const session = Array.from(manager.sessions.values())[0]
    expect(session.type).toBe('chat')
    expect(session.imChannel).toBe('enterprise-weixin')
    expect(session.title).toBe('企业微信 · 雷斯林')
    expect(sent.map(item => item.channel)).toContain('enterprise-weixin:messageReceived')
    expect(sent.map(item => item.channel)).toContain('enterprise-weixin:sessionCreated')
    expect(sent.findIndex(item => item.channel === 'enterprise-weixin:messageReceived')).toBeLessThan(
      sent.findIndex(item => item.channel === 'enterprise-weixin:sessionCreated')
    )
  })

  it('falls back to userid when enterprise weixin payload lacks sender name', async () => {
    const { bridge, manager } = createHarness()
    const sendMessage = stubSendMessage(manager)
    await bridge._handleMessage(inboundFrame({
      from: { userid: 'ZhangYueSheng' },
      text: { content: '你好' },
    }))

    expect(sendMessage).toHaveBeenCalledWith(
      expect.any(String),
      '你好',
      {
        meta: expect.objectContaining({
          senderNick: 'ZhangYueSheng',
        }),
      }
    )
  })

  it('does not reconnect when bridge is already connected', async () => {
    const { bridge } = createHarness()
    const connectSpy = vi.spyOn(bridge, '_connect').mockResolvedValue(true)

    bridge._connected = true
    bridge._wsClient = { disconnect: vi.fn() }

    const result = await bridge.start()

    expect(result).toBe(true)
    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('shows help text for /help', async () => {
    const { bridge, replies } = createHarness()

    await bridge._handleMessage(inboundFrame({
      text: { content: '/help' },
    }))

    expect(replies.at(-1)).toMatchObject({
      msgtype: 'markdown',
      markdown: {
        content: expect.stringContaining('/help'),
      },
    })
    expect(replies.at(-1).markdown.content).toContain('/close   - 关闭当前会话')
  })

  it('reports enterprise weixin historical session state with /status', async () => {
    const { bridge, manager, replies } = createHarness()
    const session = manager.create({ type: 'chat', source: 'manual', title: '企业微信测试会话' })
    session.imChannel = 'enterprise-weixin'
    bridge._sessionMapper.sessionMap.set('user-a:user-a', session.id)
    bridge._sessionIdentities.set(session.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })

    await bridge._handleMessage(inboundFrame({
      text: { content: '/status' },
    }))

    const statusText = replies.at(-1).markdown.content
    expect(statusText).toContain('当前会话状态：')
    expect(statusText).toContain('企业微信测试会话')
    expect(statusText).toContain('✅')
    expect(statusText).not.toContain('回复 0 开始全新会话')
  })

  it('limits enterprise weixin /status history view to the current chat', async () => {
    const { bridge, manager, replies } = createHarness()
    const current = manager.create({ type: 'chat', source: 'manual', title: '当前聊天会话' })
    const other = manager.create({ type: 'chat', source: 'manual', title: '其他聊天会话' })
    manager.sessions.get(current.id).imChannel = 'enterprise-weixin'
    manager.sessions.get(other.id).imChannel = 'enterprise-weixin'
    manager.sessions.get(current.id).queryGenerator = {}
    manager.sessions.get(other.id).queryGenerator = {}

    bridge._sessionMapper.sessionMap.set('user-a:user-a', current.id)
    bridge._sessionIdentities.set(current.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._sessionIdentities.set(other.id, {
      userId: 'user-b',
      senderId: 'user-b',
      senderName: 'HydroCoder',
      chatId: 'user-b',
      chatType: 'single',
      chatName: 'HydroCoder',
    })

    await bridge._handleMessage(inboundFrame({
      text: { content: '/status' },
    }))

    const statusText = replies.at(-1).markdown.content
    expect(statusText).toContain('当前会话状态：')
    expect(statusText).toContain('当前聊天会话')
    expect(statusText).not.toContain('其他聊天会话')
    expect(statusText).not.toContain('回复 0 开始全新会话')
  })

  it('closes the current session for /close', async () => {
    const { bridge, manager, replies, sent } = createHarness()
    const session = manager.create({ type: 'chat', source: 'manual', title: '待关闭会话' })
    session.imChannel = 'enterprise-weixin'
    bridge._sessionMapper.sessionMap.set('user-a:user-a', session.id)
    bridge._sessionIdentities.set(session.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })

    await bridge._handleMessage(inboundFrame({
      text: { content: '/close' },
    }))

    expect(replies.at(-1).markdown.content).toContain('会话已关闭')
    expect(manager.sessions.has(session.id)).toBe(false)
    expect(sent.map(item => item.channel)).toContain('enterprise-weixin:sessionClosed')
  })

  it('rejects /close with numbered arguments for enterprise weixin', async () => {
    const { bridge, manager, replies } = createHarness()
    const session = manager.create({ type: 'chat', source: 'manual', title: '待关闭会话' })
    session.imChannel = 'enterprise-weixin'
    bridge._sessionMapper.sessionMap.set('user-a:user-a', session.id)
    bridge._sessionIdentities.set(session.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })

    await bridge._handleMessage(inboundFrame({
      text: { content: '/close 1' },
    }))

    expect(replies.at(-1).markdown.content).toContain('/close 不支持带编号或参数')
    expect(manager.sessions.has(session.id)).toBe(true)
  })

  it('renames the current session for /rename', async () => {
    const { bridge, manager, replies } = createHarness()
    const session = manager.create({ type: 'chat', source: 'manual', title: '原始标题' })
    session.imChannel = 'enterprise-weixin'
    bridge._sessionMapper.sessionMap.set('user-a:user-a', session.id)
    bridge._sessionIdentities.set(session.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })

    await bridge._handleMessage(inboundFrame({
      text: { content: '/rename 新名称' },
    }))

    expect(replies.at(-1).markdown.content).toContain('会话已重命名为：新名称')
    expect(manager.sessions.get(session.id)?.title).toBe('新名称')
  })

  it('sends history choice menu when matched history sessions exist', async () => {
    const { bridge, manager, replies } = createHarness()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() - 1000 },
      { session_id: 'hist-2', title: '历史会话 2', updated_at: Date.now() - 2000 },
    ])

    await bridge._handleMessage(inboundFrame())

    expect(replies.at(-1).markdown.content).toContain('历史会话')
    expect(replies.at(-1).markdown.content).toContain('回复 0')
  })

  it('resumes selected history session after numeric reply', async () => {
    const { bridge, manager, replies } = createHarness()
    const reopened = manager.create({ type: 'chat', source: 'manual', title: '历史会话 1' })
    reopened.imChannel = 'enterprise-weixin'
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: reopened.id, title: '历史会话 1', updated_at: Date.now() - 1000 },
    ])
    stubSendMessage(manager)

    await bridge._handleMessage(inboundFrame({ text: { content: '第一条消息' } }))
    await bridge._handleMessage(inboundFrame({ text: { content: '1' } }))

    expect(replies.at(-1).markdown.content).toContain('会话恢复中，请等待信息返回后，即可开始聊天')
    expect(bridge._sessionMapper.sessionMap.get('user-a:user-a')).toBe(reopened.id)
  })

  it('notifies frontend to open the resumed session after numeric history choice', async () => {
    const { bridge, manager, sent } = createHarness()
    const reopened = manager.create({ type: 'chat', source: 'manual', title: '历史会话 1' })
    reopened.imChannel = 'enterprise-weixin'
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: reopened.id, title: '历史会话 1', updated_at: Date.now() - 1000 },
    ])
    stubSendMessage(manager)

    await bridge._handleMessage(inboundFrame({ text: { content: '第一条消息' } }))
    await bridge._handleMessage(inboundFrame({ text: { content: '1' } }))

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'enterprise-weixin:sessionCreated',
          data: expect.objectContaining({
            sessionId: reopened.id,
          }),
        }),
      ])
    )
  })

  it('resumes selected history session directly with /resume 1', async () => {
    const { bridge, manager, replies, sent } = createHarness()
    const reopened = manager.create({ type: 'chat', source: 'manual', title: '历史会话 1' })
    reopened.imChannel = 'enterprise-weixin'
    const enqueueSpy = vi.spyOn(bridge, '_enqueueInboundMessage').mockResolvedValue()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: reopened.id, title: '历史会话 1', updated_at: Date.now() - 1000 },
    ])

    await bridge._handleMessage(inboundFrame({
      text: { content: '/resume 1' },
    }))

    expect(replies.at(-1).markdown.content).toContain('会话恢复中，请等待信息返回后，即可开始聊天')
    expect(bridge._sessionMapper.sessionMap.get('user-a:user-a')).toBe(reopened.id)
    expect(sent.map(item => item.channel)).toContain('enterprise-weixin:sessionCreated')
    expect(enqueueSpy).toHaveBeenCalled()
  })

  it('auto-activates a resumed enterprise weixin session with hello when no pending inbound message exists', async () => {
    const { bridge, manager, sent } = createHarness()
    const reopened = manager.create({ type: 'chat', source: 'manual', title: '历史会话 1' })
    reopened.imChannel = 'enterprise-weixin'
    const enqueueSpy = vi.spyOn(bridge, '_enqueueInboundMessage').mockResolvedValue()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: reopened.id, title: '历史会话 1', updated_at: Date.now() - 1000 },
    ])

    await bridge._handleMessage(inboundFrame({
      text: { content: '/resume 1' },
    }))

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'enterprise-weixin:messageReceived',
          data: expect.objectContaining({
            sessionId: reopened.id,
            text: 'hello',
          }),
        }),
      ])
    )
    expect(enqueueSpy).toHaveBeenCalledWith(
      reopened.id,
      expect.any(Object),
      expect.objectContaining({
        text: 'hello',
        chatId: 'user-a',
        chatType: 'single',
      }),
      expect.objectContaining({
        userId: 'user-a',
        chatId: 'user-a',
      })
    )
  })

  it('marks the current live history session with a green check in resume menu', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '企业1' })
    const current = manager.sessions.get(created.id)
    current.imChannel = 'enterprise-weixin'

    const menuText = bridge._buildHistoryChoiceMenu([
      {
        session_id: current.id,
        updated_at: Date.now(),
        title: '企业1',
        cwd: 'C:/workspace/conv-ad4fbcf8',
        api_profile_id: null,
      },
      {
        session_id: 'session-other',
        updated_at: Date.now(),
        title: '企业2',
        cwd: 'C:/workspace/conv-440d3db0',
        api_profile_id: null,
      },
    ], current.id)

    expect(menuText).toContain('1. ✅ ')
    expect(menuText).toContain('2. ⭕ ')
  })

  it('marks a non-current activated session with a blue dot in resume menu', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '企业微信当前会话' })
    const session = manager.sessions.get(created.id)
    session.imChannel = 'enterprise-weixin'
    session.queryGenerator = {}

    const menuText = bridge._buildHistoryChoiceMenu([
      {
        session_id: session.id,
        updated_at: Date.now(),
        title: '企业微信当前会话',
        cwd: 'C:/workspace/conv-ad4fbcf8',
        api_profile_id: null,
      },
    ], null)

    expect(menuText).not.toContain('1. ✅ ')
    expect(menuText).toContain('1. 🔵 ')
  })

  it('does not treat a proactively bound session as current for resume menu markers', async () => {
    const { bridge, manager, replies } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '企业微信绑定会话' })
    const session = manager.sessions.get(created.id)
    session.imChannel = 'enterprise-weixin'
    session.queryGenerator = {}
    bridge._sessionTargets.set(session.id, {
      userId: 'user-a',
      displayName: '雷斯林',
    })
    bridge._targetSessionMap.set('user-a', session.id)
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      {
        session_id: session.id,
        title: '企业微信绑定会话',
        updated_at: Date.now() - 1000,
        cwd: 'C:/workspace/conv-ad4fbcf8',
        api_profile_id: null,
      },
    ])
    const mapKey = bridge._sessionMapper.buildKey({
      userId: 'user-a',
      channelId: 'user-a',
      chatId: 'user-a',
      chatType: 'single',
      nickname: '雷斯林',
      channelName: '',
    })
    const currentSessionId = await bridge._sessionMapper.resolveActiveSessionId(mapKey)
    const menuText = bridge._buildHistoryChoiceMenu(manager.sessionDatabase.getImSessionsByType(), currentSessionId)

    expect(menuText).not.toContain('1. ✅ ')
    expect(menuText).toContain('1. 🔵 ')
  })

  it('creates a new session after choosing 0 from history menu', async () => {
    const { bridge, manager, replies } = createHarness()
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() - 1000 },
    ])
    const enqueueSpy = vi.spyOn(bridge, '_enqueueInboundMessage').mockResolvedValue()

    await bridge._handleMessage(inboundFrame({ text: { content: '我要新开' } }))
    const beforeCount = manager.sessions.size
    await bridge._handleMessage(inboundFrame({ text: { content: '0' } }))

    expect(manager.sessions.size).toBe(beforeCount + 1)
    expect(replies.at(-1).markdown.content).toContain('会话创建中，请等待信息返回后，即可开始聊天')
    expect(enqueueSpy).toHaveBeenCalled()
  })

  it('creates a new enterprise weixin session with /new and auto-activates it', async () => {
    const { bridge, manager, replies } = createHarness()
    const enqueueSpy = vi.spyOn(bridge, '_enqueueInboundMessage').mockResolvedValue()

    await bridge._handleMessage(inboundFrame({
      text: { content: '/new' },
    }))

    expect(manager.sessions.size).toBe(1)
    expect(replies.at(-1).markdown.content).toContain('会话创建中，请等待信息返回后，即可开始聊天')
    expect(enqueueSpy).toHaveBeenCalled()
  })

  it('binds and sends proactive text to a target', async () => {
    const { bridge, manager, wsClient } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    const result = await bridge.sendTextToTarget({
      sessionId: created.id,
      userId: 'user-b',
      displayName: 'HydroCoder',
      text: '任务已完成',
    })

    expect(result).toEqual({ success: true, targetId: 'user-b' })
    expect(wsClient.sendMessage).toHaveBeenCalledWith('user-b', {
      msgtype: 'markdown',
      markdown: { content: '任务已完成' },
    })
    expect(bridge.getSessionBinding(created.id)).toEqual({
      targetId: 'user-b',
      userId: 'user-b',
      displayName: 'HydroCoder',
    })
    expect(manager.sessionDatabase.updateDingTalkMetadata).toHaveBeenLastCalledWith(created.id, 'user-b', '')
  })

  it('reuses the bound session after proactive send without asking history choice again', async () => {
    const { bridge, manager, replies } = createHarness()
    const sendMessage = stubSendMessage(manager)
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    manager.sessionDatabase.getImSessionsByType.mockReturnValue([
      { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() - 1000 },
    ])

    await bridge.sendTextToTarget({
      sessionId: created.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '桌面先发一条',
    })

    await bridge._handleMessage(inboundFrame({
      text: { content: '企业微信回复' },
    }))

    expect(replies.some(item => item?.markdown?.content?.includes('历史会话'))).toBe(false)
    expect(sendMessage).toHaveBeenCalledWith(
      created.id,
      '企业微信回复',
      expect.objectContaining({
        meta: expect.objectContaining({
          source: 'im-inbound',
          enterpriseWeixinChatId: 'user-a',
        }),
      })
    )
    expect(manager.sessionDatabase.updateDingTalkMetadata).toHaveBeenLastCalledWith(created.id, 'user-a', 'user-a')
  })

  it('clears stale history choice state after proactive bind so the next inbound reply is not treated as a numeric selection', async () => {
    const { bridge, manager, replies } = createHarness()
    const sendMessage = stubSendMessage(manager)
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'hist-1', title: '历史会话 1', updated_at: Date.now() - 1000 },
    ])

    await bridge._handleMessage(inboundFrame({
      text: { content: '第一次入站，先触发历史菜单' },
    }))

    const mapKey = 'user-a:user-a'
    expect(bridge._sessionMapper._pendingChoices.has(mapKey)).toBe(true)
    expect(bridge._pendingInboundMessages.has(mapKey)).toBe(true)

    await bridge.sendTextToTarget({
      sessionId: created.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '桌面端主动绑定后发出',
    })

    expect(bridge._sessionMapper._pendingChoices.has(mapKey)).toBe(false)
    expect(bridge._pendingInboundMessages.has(mapKey)).toBe(false)
    expect(bridge._sessionMapper.sessionMap.get(mapKey)).toBe(created.id)

    await bridge._handleMessage(inboundFrame({
      text: { content: '这条应该进当前绑定会话，而不是被当作编号' },
    }))

    expect(sendMessage).toHaveBeenLastCalledWith(
      created.id,
      '这条应该进当前绑定会话，而不是被当作编号',
      expect.objectContaining({
        meta: expect.objectContaining({
          source: 'im-inbound',
          enterpriseWeixinChatId: 'user-a',
        }),
      })
    )
    expect(replies.some(item => item?.markdown?.content?.includes('编号错误'))).toBe(false)
  })

  it('prompts for history after closing the current enterprise weixin session instead of auto-using another proactive binding', async () => {
    const { bridge, manager, replies } = createHarness()
    const sendMessage = stubSendMessage(manager)
    const initPendingChoice = vi.spyOn(bridge._sessionMapper, 'initPendingChoice')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'old-bound-session', title: '旧主动绑定会话', updated_at: Date.now() - 60 * 1000 },
    ])
    initPendingChoice.mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    const current = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'enterprise-weixin', title: '当前会话' })
    const oldBound = manager.create({ type: 'chat', source: 'manual', imChannel: 'enterprise-weixin', title: '旧主动绑定会话' })
    manager.sessions.get(current.id).queryGenerator = {}
    manager.sessions.get(oldBound.id).queryGenerator = {}
    vi.spyOn(manager, 'close').mockImplementation(async (sessionId) => {
      manager.sessions.delete(sessionId)
    })

    bridge._sessionMapper.sessionMap.set('user-a:user-a', current.id)
    bridge._sessionIdentities.set(current.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._targetSessionMap.set('user-a', oldBound.id)
    bridge._sessionTargets.set(oldBound.id, {
      userId: 'user-a',
      displayName: '雷斯林',
    })

    await bridge._handleMessage(inboundFrame({
      text: { content: '/close' },
    }))

    await bridge._handleMessage(inboundFrame({
      text: { content: '关闭后再来一条' },
    }))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(initPendingChoice).toHaveBeenCalled()
    expect(replies.some(item => JSON.stringify(item).includes('旧主动绑定会话'))).toBe(true)
  })

  it('prompts for history after desktop closes the current enterprise weixin session instead of auto-using another proactive binding', async () => {
    const { bridge, manager, replies } = createHarness()
    const sendMessage = stubSendMessage(manager)
    const initPendingChoice = vi.spyOn(bridge._sessionMapper, 'initPendingChoice')
    vi.spyOn(bridge._sessionMapper, '_queryHistorySessions').mockResolvedValue([
      { session_id: 'old-bound-session', title: '旧主动绑定会话', updated_at: Date.now() - 60 * 1000 },
    ])
    initPendingChoice.mockImplementation(async (_mapKey, history, onSendChoiceMenu, options) => {
      await onSendChoiceMenu(options.menuBuilder(history))
      return { sessionId: null }
    })

    const current = manager.create({ type: 'chat', source: 'im-inbound', imChannel: 'enterprise-weixin', title: '当前会话' })
    const oldBound = manager.create({ type: 'chat', source: 'manual', imChannel: 'enterprise-weixin', title: '旧主动绑定会话' })
    manager.sessions.get(current.id).queryGenerator = {}
    manager.sessions.get(oldBound.id).queryGenerator = {}

    bridge._sessionMapper.sessionMap.set('user-a:user-a', current.id)
    bridge._sessionIdentities.set(current.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._targetSessionMap.set('user-a', oldBound.id)
    bridge._sessionTargets.set(oldBound.id, {
      userId: 'user-a',
      displayName: '雷斯林',
    })

    await manager.close(current.id)

    await bridge._handleMessage(inboundFrame({
      text: { content: '关闭后再来一条' },
    }))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(initPendingChoice).toHaveBeenCalled()
    expect(replies.some(item => JSON.stringify(item).includes('旧主动绑定会话'))).toBe(true)
  })

  it('only forwards desktop intervention from the latest bound session for the same user', async () => {
    const { bridge, manager, wsClient } = createHarness()
    const first = manager.create({ type: 'chat', source: 'manual', title: '会话1' })
    const second = manager.create({ type: 'chat', source: 'manual', title: '会话2' })

    await bridge.sendTextToTarget({
      sessionId: first.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '第一条',
    })

    const firstLive = manager.sessions.get(first.id)
    firstLive.imChannel = 'enterprise-weixin'
    bridge._sessionIdentities.set(first.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })

    await bridge.sendTextToTarget({
      sessionId: second.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '第二条',
    })

    const secondLive = manager.sessions.get(second.id)
    secondLive.imChannel = 'enterprise-weixin'
    bridge._sessionIdentities.set(second.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._sessionMapper.sessionMap.set('user-a:user-a', second.id)

    bridge._onDesktopIntervention(first.id, '旧会话不应回发', null)
    await bridge._onAgentResult(first.id)

    expect(wsClient.sendMessage).toHaveBeenCalledTimes(2)

    bridge._onDesktopIntervention(second.id, '新会话应回发', null)
    bridge._onAgentMessage(second.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '来自新会话的回复' }],
    })
    await bridge._onAgentResult(second.id)

    expect(wsClient.sendMessage).toHaveBeenCalledTimes(3)
    expect(wsClient.sendMessage).toHaveBeenLastCalledWith('user-a', {
      msgtype: 'markdown',
      markdown: {
        content: '桌面介入> 新会话应回发\n\n来自新会话的回复',
      },
    })
  })

  it('clears old enterprise weixin chat mapping when rebinding the same user to a newer desktop session', async () => {
    const { bridge, manager } = createHarness()
    const first = manager.create({ type: 'chat', source: 'manual', title: '会话1' })
    const second = manager.create({ type: 'chat', source: 'manual', title: '会话2' })

    await bridge.sendTextToTarget({
      sessionId: first.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '第一条',
    })

    bridge._sessionMapper.sessionMap.set('user-a:user-a', first.id)
    bridge._sessionIdentities.set(first.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })

    await bridge.sendTextToTarget({
      sessionId: second.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '第二条',
    })

    expect(bridge._targetSessionMap.get('user-a')).toBe(second.id)
    expect(bridge._sessionMapper.sessionMap.get('user-a:user-a')).toBe(second.id)
  })

  it('clears enterprise weixin inbound routing state after unbinding a bound session', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)

    bridge._sessionTargets.set(session.id, {
      userId: 'user-a',
      displayName: '雷斯林',
    })
    bridge._targetSessionMap.set('user-a', session.id)
    bridge._sessionIdentities.set(session.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._sessionMapper.sessionMap.set('user-a:user-a', session.id)
    bridge._sessionMapper.sessionMap.set('user-a:group-1', session.id)

    expect(bridge.unbindSessionTarget(session.id)).toEqual({ success: true })

    expect(bridge._targetSessionMap.get('user-a')).toBeUndefined()
    expect(bridge._sessionTargets.get(session.id)).toBeUndefined()
    expect(bridge._sessionIdentities.get(session.id)).toBeUndefined()
    expect(bridge._sessionMapper.sessionMap.get('user-a:user-a')).toBeUndefined()
    expect(bridge._sessionMapper.sessionMap.get('user-a:group-1')).toBeUndefined()
    expect(manager.sessionDatabase.setImChannel).toHaveBeenCalledWith(session.id, null)
    expect(manager.sessionDatabase.clearImIdentity).toHaveBeenCalledWith(session.id)
  })

  it('does not auto-rebind the same enterprise weixin user after manual unbind', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)

    bridge.bindSessionToTarget(session.id, {
      userId: 'user-a',
      displayName: '雷斯林',
    })
    bridge.unbindSessionTarget(session.id)

    manager.sessionDatabase.listAllAgentConversations.mockReturnValue([
      {
        session_id: session.id,
        type: 'chat',
        source: 'manual',
        im_channel: null,
        title: '旧会话',
        staff_id: null,
        conversation_id: null,
        status: 'idle',
        updated_at: Date.now(),
      }
    ])

    expect(bridge._findBoundSessionIdByUserId('user-a')).toBe(null)
    expect(bridge._targetSessionMap.get('user-a')).toBeUndefined()
  })

  it('does not restore an enterprise weixin bound session from legacy-only fields', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    manager.sessionDatabase.getAgentConversation.mockReturnValue({
      session_id: created.id,
      type: 'chat',
      source: 'manual',
      im_channel: 'enterprise-weixin',
      staff_id: 'user-a',
      conversation_id: 'user-a',
      im_user_id: null,
      im_chat_id: null,
      status: 'idle',
    })

    expect(bridge.getSessionBinding(created.id)).toBe(null)
  })

  it('restores a proactive enterprise weixin binding without fabricating single chat id', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    manager.sessionDatabase.getAgentConversation.mockReturnValue({
      session_id: created.id,
      type: 'chat',
      source: 'manual',
      im_channel: 'enterprise-weixin',
      staff_id: 'user-a',
      conversation_id: '',
      im_user_id: 'user-a',
      im_chat_id: '',
      status: 'idle',
    })

    bridge._restoreSessionBindings()

    expect(bridge._sessionIdentities.get(created.id)).toEqual(
      expect.objectContaining({
        userId: 'user-a',
        chatId: '',
        chatType: 'single',
      })
    )
  })

  it('does not forward desktop messages after the bound session is closed and reopened', async () => {
    const { bridge, manager, wsClient } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    await bridge.sendTextToTarget({
      sessionId: created.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '先建立绑定',
    })

    await manager.close(created.id)
    manager.reopen(created.id)

    manager.emit('userMessage', {
      sessionId: created.id,
      imChannel: 'enterprise-weixin',
      content: '关闭重开后也不应回发',
      images: null,
      source: 'manual',
    })

    expect(wsClient.sendMessage).toHaveBeenCalledTimes(1)
    expect(bridge.getSessionBinding(created.id)).toEqual(
      expect.objectContaining({
        targetId: 'user-a',
        userId: 'user-a',
      })
    )
    expect(manager.sessionDatabase.setImChannel).not.toHaveBeenCalledWith(created.id, null)
    expect(manager.sessionDatabase.clearImIdentity).not.toHaveBeenCalledWith(created.id)
  })

  it('does not forward enterprise weixin desktop intervention for a reopened history session without current chat mapping', async () => {
    const { bridge, manager, wsClient } = createHarness()
    const current = manager.create({ type: 'chat', source: 'manual', title: '当前会话' })
    const history = manager.create({ type: 'chat', source: 'manual', title: '历史会话' })

    await bridge.sendTextToTarget({
      sessionId: current.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '当前绑定',
    })

    manager.sessions.get(current.id).imChannel = 'enterprise-weixin'
    manager.sessions.get(history.id).imChannel = 'enterprise-weixin'
    bridge._sessionMapper.sessionMap.set('user-a:user-a', current.id)
    bridge._sessionIdentities.set(current.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._sessionIdentities.set(history.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._sessionTargets.set(history.id, {
      userId: 'user-a',
      displayName: '雷斯林',
    })

    bridge._onDesktopIntervention(history.id, '历史会话不应回发', null)
    bridge._onAgentMessage(history.id, {
      type: 'assistant',
      content: [{ type: 'text', text: '历史会话回复' }],
    })
    await bridge._onAgentResult(history.id)

    expect(wsClient.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('does not clear an active reply collector on transient non-live userMessage events', () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })
    const session = manager.sessions.get(created.id)
    session.imChannel = 'enterprise-weixin'

    bridge._sessionTargets.set(session.id, {
      userId: 'user-a',
      displayName: '雷斯林',
    })
    bridge._sessionIdentities.set(session.id, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })

    bridge._replyCollector.startCollect(session.id, {
      webhook: inboundFrame(),
      sendFn: async () => {},
    })

    manager.sessions.delete(session.id)
    manager.emit('userMessage', {
      sessionId: session.id,
      imChannel: 'enterprise-weixin',
      content: '桌面消息',
      images: null,
      source: 'manual',
    })

    expect(bridge._replyCollector.hasCollector(session.id)).toBe(true)
    expect(bridge._sessionTargets.get(session.id)).toEqual(
      expect.objectContaining({ userId: 'user-a' })
    )
  })

  it('keeps persisted binding metadata when the session is closed', async () => {
    const { bridge, manager } = createHarness()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    await bridge.sendTextToTarget({
      sessionId: created.id,
      userId: 'user-a',
      displayName: '雷斯林',
      text: '先建立绑定',
    })

    await manager.close(created.id)

    expect(manager.sessionDatabase.setImChannel).not.toHaveBeenCalledWith(created.id, null)
    expect(manager.sessionDatabase.clearImIdentity).not.toHaveBeenCalledWith(created.id)
  })

  it('downloads inbound image messages and submits base64 images to Agent', async () => {
    const { bridge, manager, wsClient } = createHarness()
    const sendMessage = stubSendMessage(manager)

    await bridge._handleMessage(inboundFrame({
      msgtype: 'image',
      image: {
        url: 'https://example.com/assets/remote.png',
        aeskey: 'aes-key',
      },
      text: undefined,
    }))

    expect(wsClient.downloadFile).toHaveBeenCalledWith('https://example.com/assets/remote.png', 'aes-key')
    expect(sendMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: '',
        images: [
          expect.objectContaining({
            base64: Buffer.from('image-bytes').toString('base64'),
            mediaType: 'image/png',
          }),
        ],
      }),
      expect.objectContaining({
        meta: expect.objectContaining({
          source: 'im-inbound',
        }),
      })
    )

    const session = Array.from(manager.sessions.values())[0]
    expect(session.messages.find(msg => msg.role === 'user' && msg.source === 'enterprise-weixin')).toEqual(
      expect.objectContaining({
        content: '[图片]',
        images: [
          expect.objectContaining({
            base64: Buffer.from('image-bytes').toString('base64'),
            mediaType: 'image/png',
          }),
        ],
      })
    )
  })

  it('replies with collected agent result images back to enterprise weixin', async () => {
    const { bridge, wsClient } = createHarness()
    const imagePath = path.join(tempDir, 'agent-output.png')
    fs.writeFileSync(imagePath, Buffer.from('agent-image'))

    bridge._replyCollector.startCollect('session-1', {
      webhook: inboundFrame(),
      sendFn: async () => {},
    })
    bridge._replyCollector.addImagePath('session-1', imagePath)

    await bridge._onAgentResult('session-1')

    expect(wsClient.uploadMedia).toHaveBeenCalled()
    expect(wsClient.replyMedia).toHaveBeenCalledWith(expect.any(Object), 'image', expect.stringMatching(/^media-/))
  })

  it('streams assistant text reply back to enterprise weixin', async () => {
    const { bridge, wsClient } = createHarness()
    const frame = inboundFrame()

    bridge._replyCollector.startCollect('session-1', {
      webhook: frame,
      sendFn: async () => {},
    })

    bridge._onAgentMessage('session-1', {
      type: 'assistant',
      content: [
        { type: 'text', text: '第一段' },
        { type: 'text', text: '第二段' },
      ],
    })

    await bridge._onAgentResult('session-1')

    expect(wsClient.replyStreamNonBlocking).toHaveBeenCalled()
    expect(wsClient.replyStreamNonBlocking).toHaveBeenNthCalledWith(
      1,
      frame,
      expect.stringMatching(/^wecom_stream/),
      '第一段',
      false
    )
    expect(wsClient.replyStreamNonBlocking).toHaveBeenNthCalledWith(
      2,
      frame,
      expect.stringMatching(/^wecom_stream/),
      '第二段',
      false
    )
    expect(wsClient.replyStreamNonBlocking).toHaveBeenNthCalledWith(
      3,
      frame,
      expect.stringMatching(/^wecom_stream/),
      '第一段第二段',
      true
    )
  })

  it('sends remaining text on final stream finish when collector has unsent tail', async () => {
    const { bridge, wsClient } = createHarness()
    const frame = inboundFrame()

    bridge._replyCollector.startCollect('session-2', {
      webhook: frame,
      sendFn: async () => {},
    })

    const collector = bridge._replyCollector.getCollector('session-2')
    collector.chunks = ['完整结果']
    collector.sentText = '完整'

    bridge._activeSendChunks.set('session-2', async (chunk, finish) => {
      return wsClient.replyStreamNonBlocking(frame, 'wecom_stream_test', chunk, finish)
    })

    await bridge._onAgentResult('session-2')

    expect(wsClient.replyStreamNonBlocking).toHaveBeenCalledWith(
      frame,
      'wecom_stream_test',
      '结果',
      true
    )
  })

  it('forwards desktop intervention images and collected agent images to enterprise weixin', async () => {
    const { bridge, wsClient } = createHarness()
    const sessionId = 'session-desktop'
    const generatedImagePath = path.join(tempDir, 'generated.png')
    fs.writeFileSync(generatedImagePath, Buffer.from('generated-image'))

    bridge._sessionTargets.set(sessionId, {
      userId: 'user-a',
      displayName: '雷斯林',
    })
    bridge._targetSessionMap.set('user-a', sessionId)
    bridge._sessionIdentities.set(sessionId, {
      userId: 'user-a',
      senderId: 'user-a',
      senderName: '雷斯林',
      chatId: 'user-a',
      chatType: 'single',
      chatName: '雷斯林',
    })
    bridge._sessionMapper.sessionMap.set('user-a:user-a', sessionId)

    bridge._onDesktopIntervention(sessionId, '', [
      {
        base64: Buffer.from('desktop-image').toString('base64'),
        mediaType: 'image/png',
      },
    ])

    bridge._onAgentMessage(sessionId, {
      content: [
        { type: 'tool_use', input: { imagePath: generatedImagePath } },
      ],
    })

    await bridge._onAgentResult(sessionId)

    expect(wsClient.uploadMedia).toHaveBeenCalledTimes(2)
    expect(wsClient.sendMediaMessage).toHaveBeenCalledTimes(2)
    expect(wsClient.uploadMedia).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      expect.objectContaining({
        type: 'image',
        filename: 'desktop-image.png',
      })
    )
  })
})

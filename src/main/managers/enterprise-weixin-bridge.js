/**
 * 企业微信 Bridge
 *
 * 通过 @wecom/aibot-node-sdk 长连接模式接收企业微信智能机器人消息，
 * 连接到 Agent 会话系统，支持流式回复和主动推送。
 *
 * 与钉钉/飞书的关键区别：
 * - 收发同一条 WebSocket（无需 webhook URL 或独立的 REST 发消息 API）
 * - 原生支持流式回复（replyStream），与 Agent 流式输出天然匹配
 * - 消息类型更丰富（text/image/mixed/voice/file/video）
 */

const path = require('path')
const { WSClient, WsCmd, MessageType } = require('@wecom/aibot-node-sdk')
const { ImFrontendNotifier } = require('./im-frontend-notifier')
const { ImReplyCollector } = require('./im-reply-collector')
const { ImSessionMapper } = require('./im-session-mapper')
const { formatRelativeTime } = require('./im-utils')

const MAX_TEXT_LENGTH = 6000
const MSG_ID_TTL = 10 * 60 * 1000

class EnterpriseWeixinBridge {
  constructor(configManager, agentSessionManager, mainWindow) {
    this._configManager = configManager
    this._agentSessionManager = agentSessionManager
    this._mainWindow = mainWindow
    this._imType = 'enterprise-weixin'

    this._wsClient = null
    this._connected = false

    this._notifier = new ImFrontendNotifier(mainWindow, this._imType)
    this._replyCollector = new ImReplyCollector({ maxTextLength: MAX_TEXT_LENGTH })

    const maxHistorySessions = this._getConfig().maxHistorySessions || 5

    this._sessionMapper = new ImSessionMapper({
      agentSessionManager,
      sessionDatabase: agentSessionManager.sessionDatabase,
      imType: this._imType,
      maxHistorySessions,
      buildIdentityKey: (id) => `${id.userId}:${id.channelId}`,
      buildSessionTitle: (id) => `企业微信 · ${id.nickname || id.userId}`,
    })

    // 消息去重
    this._processedMsgIds = new Map()
    this._msgIdCleanupTimer = null

    // agent 事件监听器引用
    this._agentListeners = null
  }

  // ─── 配置 ───

  _getConfig() {
    const config = this._configManager.getConfig()
    return config?.enterpriseWeixin || {}
  }

  // ─── 生命周期 ───

  async start() {
    const config = this._getConfig()
    if (!config.enabled) {
      console.log('[EnterpriseWeixin] Bridge is disabled, skipping start')
      return false
    }

    const { botId, secret } = config
    if (!botId || !secret) {
      console.error('[EnterpriseWeixin] Bot ID or secret not configured')
      return false
    }

    try {
      await this._connect(botId, secret)
      this._bindAgentEvents()
      this._startMsgIdCleanup()
      console.log('[EnterpriseWeixin] Bridge started successfully')
      return true
    } catch (err) {
      console.error('[EnterpriseWeixin] Failed to start:', err.message)
      this._notifier.notifyError({ error: err.message })
      return false
    }
  }

  async stop() {
    this._stopMsgIdCleanup()
    this._unbindAgentEvents()
    this._replyCollector.clearAll()
    this._sessionMapper.clearAll()
    this._processedMsgIds.clear()

    if (this._wsClient) {
      try { this._wsClient.disconnect() } catch { /* ignore */ }
      this._wsClient = null
    }
    this._connected = false
    this._notifier.notifyStatusChange({ connected: false })
    console.log('[EnterpriseWeixin] Bridge stopped')
  }

  async restart() {
    await this.stop()
    return this.start()
  }

  getStatus() {
    return { connected: this._connected, activeSessions: 0 }
  }

  // ─── 连接 ───

  async _connect(botId, secret) {
    this._wsClient = new WSClient({ botId, secret })

    // 收到消息回调
    this._wsClient.on('message', (msg) => {
      this._handleMessage(msg).catch(err => {
        console.error('[EnterpriseWeixin] Message handling error:', err.message)
      })
    })

    // 事件回调（进入会话、卡片事件等）
    this._wsClient.on('event', (event) => {
      console.log('[EnterpriseWeixin] Event received:', event?.eventtype || event?.type)
    })

    // 错误回调
    this._wsClient.on('error', (err) => {
      console.error('[EnterpriseWeixin] WS error:', err?.message || err)
      this._notifier.notifyError({ error: err?.message || String(err) })
    })

    // 连接状态回调
    this._wsClient.on('connected', () => {
      this._connected = true
      this._notifier.notifyStatusChange({ connected: true })
      console.log('[EnterpriseWeixin] WS connected')
    })

    this._wsClient.on('disconnected', () => {
      this._connected = false
      this._notifier.notifyStatusChange({ connected: false })
      console.log('[EnterpriseWeixin] WS disconnected')
    })

    await this._wsClient.connect()
  }

  // ─── 消息处理 ───

  async _handleMessage(msg) {
    const msgId = msg?.msgid || msg?.msgId
    if (!msgId) return

    // 去重
    if (this._processedMsgIds.has(msgId)) return
    this._processedMsgIds.set(msgId, Date.now())

    const msgType = msg?.msgtype || msg?.msgType || 'text'
    const chatId = msg?.chatid || msg?.chatId || ''
    const chatType = msg?.chattype || msg?.chatType || 'p2p'
    const fromUser = msg?.from?.userid || msg?.from?.userId || ''
    const fromName = msg?.from?.name || msg?.from?.displayName || fromUser

    // 提取文本
    let text = ''
    if (msgType === MessageType.Text || msgType === 'text') {
      text = msg?.text?.content || ''
    } else if (msgType === MessageType.Mixed || msgType === 'mixed') {
      // 图文混排：提取所有文本项
      const items = msg?.mixed?.msg_item || msg?.mixed?.item || []
      text = items.filter(item => item?.msgtype === 'text').map(item => item?.text?.content || '').join('')
    }

    const identity = {
      userId: fromUser,
      channelId: chatId,
      chatType,
      nickname: fromName,
      channelName: '',
    }

    console.log(`[EnterpriseWeixin] Message ${msgId}: type=${msgType}, from=${fromUser}, chat=${chatId}, text=${text.substring(0, 50)}`)

    // 确保会话
    const result = await this._sessionMapper.ensureSession(identity, { cwd: this._getConfig().defaultCwd || '' })

    if (result.needsChoice) {
      // 有历史会话 → 文本菜单选择
      const sessions = result.sessions.slice(0, 5)
      const menu = sessions.map((s, i) => {
        const timeStr = formatRelativeTime(s.updated_at)
        return `${i + 1}. [${timeStr}] ${s.title || '(无标题)'}`
      }).join('\n')
      await this._wsClient.sendMessage(chatId, 'markdown', {
        content: `检测到以下历史会话，请回复数字选择或输入 /new 新建会话：\n\n${menu}\n\n0. 新建会话`
      })
      this._notifier.notifyMessageReceived({ sessionId: null, chatType, imagesCount: 0 })
      return
    }

    const sessionId = result.sessionId || result
    if (!sessionId) return

    this._notifier.notifyMessageReceived({ sessionId, chatType, imagesCount: 0 })

    // 启动回复收集
    this._replyCollector.startCollect(sessionId, {
      webhook: msgId, // 用 msgId 作为 key，回复时用于 replyStream
      sendFn: null,   // 由 _onAgentMessage 内部的流式回调设置
    })

    // 把 webhook/msgId 存进去用于流式回复
    const collector = this._replyCollector._collectors?.get(sessionId)
    if (collector) collector._webhookMsgId = msgId

    // 入队 Agent 消息
    this._enqueueMessage(sessionId, () =>
      this._processOneMessage(sessionId, { text, images: [], identity, msgId }))
  }

  // ─── Agent 事件绑定 ───

  _bindAgentEvents() {
    const events = this._agentSessionManager

    this._agentListeners = {
      userMessage: (sessionId, message) => {
        const boundSessionId = this._isSessionBound(sessionId)
        if (!boundSessionId) return
        // 桌面端介入
        this._replyCollector.recordDesktopIntervention(sessionId, {
          content: message?.content || '',
          images: message?.images || [],
        }, null)
      },

      agentMessage: (sessionId, message) => {
        this._sendStreamChunk(sessionId, message)
        // 提取图片路径
        const { extractImagePaths } = require('./im-utils')
        for (const imagePath of extractImagePaths(message)) {
          this._replyCollector.addImagePath(sessionId, imagePath)
        }
      },

      agentResult: async (sessionId, result) => {
        await this._onAgentResult(sessionId, result)
      },

      agentError: (sessionId, error) => {
        const collector = this._replyCollector._collectors?.get(sessionId)
        if (collector) this._replyCollector._collectors.delete(sessionId)
      },
    }

    if (events) {
      if (typeof events.on === 'function') {
        events.on('userMessage', this._agentListeners.userMessage)
        events.on('agentMessage', this._agentListeners.agentMessage)
        events.on('agentResult', this._agentListeners.agentResult)
        events.on('agentError', this._agentListeners.agentError)
      }
    }
  }

  _unbindAgentEvents() {
    const events = this._agentSessionManager
    if (events && typeof events.off === 'function' && this._agentListeners) {
      events.off('userMessage', this._agentListeners.userMessage)
      events.off('agentMessage', this._agentListeners.agentMessage)
      events.off('agentResult', this._agentListeners.agentResult)
      events.off('agentError', this._agentListeners.agentError)
    }
    this._agentListeners = null
  }

  // ─── 流式回复 ───

  async _sendStreamChunk(sessionId, message) {
    const collector = this._replyCollector._collectors?.get(sessionId)
    if (!collector?._webhookMsgId) return

    const msgId = collector._webhookMsgId
    const text = message?.content
      ? (Array.isArray(message.content)
        ? message.content.filter(b => b.type === 'text').map(b => b.text).join('')
        : String(message.content))
      : ''

    if (!text) return

    if (!collector._stream) {
      // 启动流式回复
      try {
        collector._stream = await this._wsClient.replyStream(msgId)
      } catch (err) {
        console.error('[EnterpriseWeixin] Failed to start stream reply:', err.message)
      }
    }

    if (collector._stream) {
      try {
        await collector._stream.write(text)
      } catch (err) {
        console.error('[EnterpriseWeixin] Stream write error:', err.message)
      }
    }
  }

  async _onAgentResult(sessionId) {
    const collector = this._replyCollector._collectors?.get(sessionId)

    // 完成流式回复
    if (collector?._stream) {
      try {
        await collector._stream.finish()
      } catch (err) {
        console.error('[EnterpriseWeixin] Stream finish error:', err.message)
      }
      collector._stream = null
    }

    // 处理回复收集器
    const result = await this._replyCollector.onAgentResult(sessionId)

    // 发送图片
    if (result?.imagePaths?.length > 0) {
      for (const imagePath of result.imagePaths) {
        try {
          const fs = require('fs')
          const buffer = fs.readFileSync(imagePath)
          const mediaId = await this._wsClient.uploadMedia(buffer)
          if (collector?._webhookMsgId) {
            await this._wsClient.sendMediaMessage(collector._webhookMsgId, 'image', mediaId)
          }
        } catch (err) {
          console.error('[EnterpriseWeixin] Image send failed:', err.message)
        }
      }
    }
  }

  // ─── 会话管理 ───

  _isSessionBound(sessionId) {
    // 检查会话是否属于企业微信
    const session = this._agentSessionManager.sessions.get(sessionId)
    if (!session) return false
    return session.type === this._imType || session.source === this._imType
  }

  // ─── 消息队列 ───

  _processQueues = new Map()

  _enqueueMessage(sessionId, taskFn) {
    const prev = this._processQueues.get(sessionId) || Promise.resolve()
    const next = prev.then(taskFn).catch(err => {
      console.error(`[EnterpriseWeixin] Process error for session ${sessionId}:`, err.message)
    })
    this._processQueues.set(sessionId, next)
    return next
  }

  async _processOneMessage(sessionId, { text, identity, msgId }) {
    if (!text.trim()) return

    // 发送到 Agent
    await this._agentSessionManager.appendExternalUserMessage(sessionId, {
      content: text,
      source: this._imType,
      senderNick: identity.nickname,
      meta: { msgId, identity },
    })

    await this._agentSessionManager.sendMessage(sessionId, text, { meta: { source: this._imType } })
  }

  // ─── 主动发送 ───

  async sendTextToTarget({ sessionId, userId, displayName, text } = {}) {
    const content = typeof text === 'string' ? text.trim() : ''
    if (!content) throw new Error('发送内容不能为空')
    if (!userId) throw new Error('userId 不能为空')
    if (!this._wsClient || !this._connected) throw new Error('企业微信未连接')

    if (sessionId) {
      this._agentSessionManager.assertSessionImBindingAllowed(sessionId, this._imType)
    }

    await this._wsClient.sendMessage(userId, 'markdown', { content })

    if (sessionId) {
      this._sessionMapper.bindSession(sessionId, { userId, displayName })
      this._agentSessionManager.bindSessionExternalImSource(sessionId, this._imType)
    }

    return { success: true, targetId: userId }
  }

  // ─── 清理 ───

  _startMsgIdCleanup() {
    this._msgIdCleanupTimer = setInterval(() => {
      const cutoff = Date.now() - MSG_ID_TTL
      for (const [id, ts] of this._processedMsgIds.entries()) {
        if (ts < cutoff) this._processedMsgIds.delete(id)
      }
    }, 60 * 1000)
  }

  _stopMsgIdCleanup() {
    if (this._msgIdCleanupTimer) {
      clearInterval(this._msgIdCleanupTimer)
      this._msgIdCleanupTimer = null
    }
  }
}

module.exports = { EnterpriseWeixinBridge }

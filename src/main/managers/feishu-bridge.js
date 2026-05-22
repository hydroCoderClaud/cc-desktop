/**
 * 飞书桥接
 *
 * 将飞书事件订阅（接收）和消息 API（发送）连接到 Agent 会话系统。
 * 使用共享的 ImSessionMapper、ImReplyCollector、ImFrontendNotifier helper。
 *
 * 与钉钉桥接的核心区别：
 * - 发送方向：飞书天然支持主动推送（REST API 直接发单聊/群聊）
 * - 接收方向：使用 WebSocket 事件订阅（长连接模式，无需公网端口）
 * - 消息卡片：飞书支持交互式卡片（card.action.trigger → Agent 命令）
 */

const { ImSessionMapper } = require('./im-session-mapper')
const { ImReplyCollector } = require('./im-reply-collector')
const { ImFrontendNotifier } = require('./im-frontend-notifier')
const { FeishuEventClient } = require('./feishu-event-client')
const { FeishuMessageAPI } = require('./feishu-message-api')

class FeishuBridge {
  /**
   * @param {object} configManager
   * @param {object} agentSessionManager
   * @param {import('electron').BrowserWindow|null} mainWindow
   */
  constructor(configManager, agentSessionManager, mainWindow) {
    this._config = configManager
    this._agentSessionManager = agentSessionManager
    this._mainWindow = mainWindow
    this._sessionDatabase = agentSessionManager.sessionDatabase

    // 飞书 API 和事件客户端
    this._api = new FeishuMessageAPI()
    this._eventClient = new FeishuEventClient()

    // 共享 helper
    this._notifier = new ImFrontendNotifier(mainWindow, 'feishu')
    this._replyCollector = new ImReplyCollector({ maxTextLength: 6000 })
    this._sessionMapper = new ImSessionMapper({
      agentSessionManager,
      sessionDatabase: this._sessionDatabase,
      imType: 'feishu',
      maxHistorySessions: 5,
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: (identity) => {
        const chatName = identity.chatName || identity.chatId?.substring(0, 8) || ''
        const nickname = identity.nickname || identity.userId?.substring(0, 8) || ''
        return `飞书 · ${chatName} · ${nickname}`
      },
    })

    // 串行消息队列（每个 sessionId 一个 Promise 链）
    /** @type {Map<string, Promise>} */
    this._processQueues = new Map()

    // 去重
    /** @type {Map<string, number>} */
    this._processedMsgIds = new Map()

    /** @type {Map<string, { message: object, senderId: string, chatId: string, chatType: string }>} */
    this._pendingMessages = new Map()

    // 事件监听器引用（用于解绑）
    this._agentListeners = null
    this._eventListeners = null

    // 绑定 Agent 事件
    this._bindAgentEvents()
  }

  // ─── 生命周期 ───

  get config() {
    try {
      return this._config.getConfig()?.feishu || {}
    } catch {
      return {}
    }
  }

  async start() {
    const cfg = this.config
    if (!cfg.enabled || !cfg.appId || !cfg.appSecret) {
      console.log('[FeishuBridge] Not enabled or missing credentials')
      return
    }

    this._sessionMapper = new ImSessionMapper({
      agentSessionManager: this._agentSessionManager,
      sessionDatabase: this._sessionDatabase,
      imType: 'feishu',
      maxHistorySessions: cfg.maxHistorySessions || 5,
      defaultCwd: cfg.defaultCwd || null,
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: (identity) => {
        const chatName = identity.chatName || identity.chatId?.substring(0, 8) || ''
        const nickname = identity.nickname || identity.userId?.substring(0, 8) || ''
        return `飞书 · ${chatName} · ${nickname}`
      },
    })

    this._api.setCredentials(cfg.appId, cfg.appSecret)
    this._bindEventClientEvents()

    await this._eventClient.connect(cfg.appId, cfg.appSecret)
    // 状态变化由 event client 的 statusChange 事件驱动
  }

  async stop() {
    this._eventClient.stop()
    this._unbindEventClientEvents()
    this._replyCollector.clearAll()
    this._sessionMapper.clearAll()
    this._processQueues.clear()
    this._processedMsgIds.clear()
  }

  async restart() {
    await this.stop()
    await this.start()
  }

  destroy() {
    this.stop()
    if (this._agentListeners) {
      const mgr = this._agentSessionManager
      for (const [event, fn] of Object.entries(this._agentListeners)) {
        mgr.off(event, fn)
      }
      this._agentListeners = null
    }
  }

  getStatus() {
    return {
      connected: this._eventClient.connected,
      activeSessions: this._sessionMapper.sessionMap.size,
    }
  }

  /** 更新主窗口引用（窗口重建后调用） */
  setMainWindow(win) {
    this._mainWindow = win
    this._notifier.setMainWindow(win)
  }

  // ─── 事件客户端事件 ───

  _bindEventClientEvents() {
    this._unbindEventClientEvents()

    const onMessage = (event) => this._handleFeishuMessage(event)
    const onCardAction = (event) => this._handleCardAction(event)
    const onStatus = (data) => this._notifier.notifyStatusChange(data)
    const onError = (data) => this._notifier.notifyError(data)

    this._eventClient.on('message', onMessage)
    this._eventClient.on('cardAction', onCardAction)
    this._eventClient.on('statusChange', onStatus)
    this._eventClient.on('error', onError)

    this._eventListeners = { onMessage, onCardAction, onStatus, onError }
  }

  _unbindEventClientEvents() {
    if (!this._eventListeners) return
    const ec = this._eventClient
    ec.off('message', this._eventListeners.onMessage)
    ec.off('cardAction', this._eventListeners.onCardAction)
    ec.off('statusChange', this._eventListeners.onStatus)
    ec.off('error', this._eventListeners.onError)
    this._eventListeners = null
  }

  // ─── Agent 事件（从 AgentSessionManager） ───

  _bindAgentEvents() {
    const mgr = this._agentSessionManager
    this._agentListeners = {
      userMessage: ({ sessionId, sessionType, content, images, source }) => {
        if (source !== 'feishu' && sessionType === 'feishu') {
          this._onDesktopIntervention(sessionId, content, images)
        }
      },
      agentMessage: (sessionId, message) => { this._onAgentMessage(sessionId, message) },
      agentResult: (sessionId) => { this._onAgentResult(sessionId) },
      agentError: (sessionId, error) => { this._onAgentError(sessionId, error) },
    }
    for (const [event, fn] of Object.entries(this._agentListeners)) {
      mgr.on(event, fn)
    }
  }

  // ─── 消息处理 ───

  _handleFeishuMessage(event) {
    const { msgId, senderId, chatId, chatType, text, images } = event

    // 去重
    if (this._processedMsgIds.has(msgId)) return
    this._processedMsgIds.set(msgId, Date.now())
    this._cleanupOldMsgIds()

    // 命令拦截（/ 开头）
    if (text && text.startsWith('/')) {
      this._handleCommand(text, { senderId, chatId, chatType }).catch(() => {})
      return
    }

    // 检查是否有待处理的历史会话选择
    const mapKey = this._sessionMapper.buildKey({ userId: senderId, chatId })
    if (text && /^\d+$/.test(text.trim())) {
      const pendingChoice = this._sessionMapper._pendingChoices?.get(mapKey)
      if (pendingChoice) {
        this._handleChoiceReply(mapKey, text, { userId: senderId, chatId, chatType }, senderId, chatId, chatType)
        return
      }
    }

    // 构建消息（images 为空时不用传，避免 null 破坏析构默认值）
    const msgImages = images?.length ? images : undefined
    const message = { text, images: msgImages }

    // 确保会话
    this._ensureSession({
      userId: senderId,
      chatId,
      chatType,
    }, message, senderId, chatId, chatType).then((sessionId) => {
      if (!sessionId) return

      // 通知前端
      this._notifier.notifyMessageReceived({
        sessionId,
        text,
        senderNick: senderId,
        images: msgImages,
      })

      // 入队处理
      this._enqueueMessage(sessionId, message, senderId, chatId, chatType)
    })
  }

  /** @private */
  async _handleChoiceReply(mapKey, inputText, identity, senderId, chatId, chatType) {
    const result = await this._sessionMapper.handleChoice(mapKey, inputText, identity)
    const receiveId = chatType === 'p2p' ? senderId : chatId
    const receiveIdType = chatType === 'p2p' ? 'open_id' : 'chat_id'

    if (result.sessionId) {
      await this._api.sendTextMessage(receiveIdType, receiveId, `已恢复会话`)
      // 通知前端
      this._notifier.notifySessionCreated({
        sessionId: result.sessionId,
        nickname: senderId,
      })
      // 重放待处理消息
      const pending = this._pendingMessages.get(mapKey)
      if (pending) {
        this._pendingMessages.delete(mapKey)
        this._enqueueMessage(result.sessionId, pending.message, pending.senderId, pending.chatId, pending.chatType)
      }
    } else {
      await this._api.sendTextMessage(receiveIdType, receiveId, `无效选择，请重新回复数字`)
    }
  }

  async _handleCardAction(event) {
    const { actionType, actionValue, userId, chatId } = event
    // 将卡片按钮点击转为文本消息，复用 Agent 处理链路
    const syntheticText = `[卡片操作] ${actionType}: ${JSON.stringify(actionValue)}`
    // TODO: 实现卡片交互路由
    console.log('[FeishuBridge] Card action:', actionType, actionValue)
  }

  async _handleCommand(text, context) {
    const parts = text.trim().split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)

    const mapKey = this._sessionMapper.buildKey({ userId: context.senderId, chatId: context.chatId })
    const sessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)

    // 简化命令处理
    const { sendTextMessage } = this._api
    const receiveId = context.chatType === 'p2p' ? context.senderId : context.chatId
    const receiveIdType = context.chatType === 'p2p' ? 'open_id' : 'chat_id'

    switch (cmd) {
      case '/help':
        await sendTextMessage(receiveIdType, receiveId, this._getHelpText())
        break
      case '/status':
        const status = this.getStatus()
        await sendTextMessage(receiveIdType, receiveId,
          `连接状态: ${status.connected ? '已连接' : '未连接'}\n活跃会话: ${status.activeSessions} 个`)
        break
      case '/close':
        if (sessionId) {
          await this._agentSessionManager.close(sessionId)
          this._sessionMapper.clearSessionState(mapKey)
          this._notifier.notifySessionClosed({ sessionId })
        }
        await sendTextMessage(receiveIdType, receiveId, '会话已关闭')
        break
      case '/new':
        const newSessionId = await this._sessionMapper.createSession({
          userId: context.senderId,
          chatId: context.chatId,
          chatType: context.chatType,
          nickname: context.senderId,
        })
        if (newSessionId) {
          this._sessionMapper.sessionMap.set(mapKey, newSessionId)
          this._notifier.notifySessionCreated({ sessionId: newSessionId, nickname: context.senderId })
        }
        await sendTextMessage(receiveIdType, receiveId, '已创建新会话')
        break
      default:
        await sendTextMessage(receiveIdType, receiveId, `未知命令: ${cmd}\n输入 /help 查看可用命令`)
    }
  }

  // ─── 会话管理 ───

  async _ensureSession(identity, message, senderId, chatId, chatType) {
    const mapKey = this._sessionMapper.buildKey(identity)

    const result = await this._sessionMapper.ensureSession(identity)
    if (result.needsChoice) {
      // 存下原始消息，等用户选择后重放
      this._pendingMessages.set(mapKey, { message, senderId, chatId, chatType })

      // 有多个历史会话 → 发送选择菜单
      await this._sessionMapper.initPendingChoice(
        mapKey,
        result.sessions,
        async (menuText) => {
          await this._api.sendTextMessage(
            chatType === 'p2p' ? 'open_id' : 'chat_id',
            chatType === 'p2p' ? senderId : chatId,
            menuText
          )
        }
      )
      return null // 等待用户选择
    }

    if (result.sessionId) {
      // 通知前端
      this._notifier.notifySessionCreated({
        sessionId: result.sessionId,
        nickname: identity.nickname || identity.userId?.substring(0, 8),
      })
    }
    return result.sessionId
  }

  // ─── 消息队列 ───

  _enqueueMessage(sessionId, message, senderId, chatId) {
    const chatType = 'p2p' // 默认单聊，后续可从上下文获取
    const prev = this._processQueues.get(sessionId) || Promise.resolve()

    const task = prev
      .catch(() => {})
      .then(() => this._processOneMessage(sessionId, message, senderId, chatId, chatType))

    this._processQueues.set(sessionId, task)

    task.finally(() => {
      if (this._processQueues.get(sessionId) === task) {
        this._processQueues.delete(sessionId)
      }
    })
  }

  async _processOneMessage(sessionId, message, senderId, chatId, chatType) {
    const receiveId = chatType === 'p2p' ? senderId : chatId
    const receiveIdType = chatType === 'p2p' ? 'open_id' : 'chat_id'

    // 设置回复收集器
    const { donePromise, sendChunk } = this._replyCollector.startCollect(sessionId, {
      sendFn: async (text) => {
        try {
          await this._api.sendTextMessage(receiveIdType, receiveId, text)
        } catch (err) {
          console.error('[FeishuBridge] sendTextMessage error:', err)
        }
      },
    })

    try {
      // 发送消息到 Agent
      await this._agentSessionManager.sendMessage(sessionId, message, {
        meta: {
          source: 'feishu',
          senderNick: senderId,
          feishuChatId: chatId,
        },
      })

      // 等待 Agent 回复完成
      await donePromise
    } catch (err) {
      console.error('[FeishuBridge] Process message error:', err)
      try {
        await this._api.sendTextMessage(receiveIdType, receiveId,
          `处理消息时出错: ${err.message}`)
      } catch {}
    }
  }

  // ─── 桌面端介入 ───

  _onDesktopIntervention(sessionId, content, images) {
    const mapKey = this._resolveMapKeyForSession(sessionId)
    if (!mapKey) return

    // 找到对应的飞书 conversation
    const receiveId = 'open_id' // TODO: 从会话元数据中获取
    const receiveIdType = 'open_id'

    this._replyCollector.recordDesktopIntervention(
      sessionId,
      { content, images },
      async (sid, { userContent, fullText }) => {
        if (!fullText) return
        const block = `> ${userContent}\n\n${fullText}`
        await this._api.sendTextMessage(receiveIdType, receiveId, block)
      }
    )
  }

  _resolveMapKeyForSession(sessionId) {
    for (const [key, sid] of this._sessionMapper.sessionMap) {
      if (sid === sessionId) return key
    }
    return null
  }

  // ─── Agent 事件处理 ───

  _onAgentMessage(sessionId, message) {
    this._replyCollector.onAgentMessage(sessionId, message, async (text) => {
      // 实时流式推文本（sendChunk 回调已在 startCollect 中设置）
    })
  }

  async _onAgentResult(sessionId) {
    await this._replyCollector.onAgentResult(sessionId, async (sid, data) => {
      // 桌面端介入 → 向飞书推送 Q&A 块
      const mapKey = this._resolveMapKeyForSession(sid)
      if (!mapKey) return
      const block = `> ${data.userContent}\n\n${data.fullText}`
      await this._api.sendTextMessage('open_id', 'open_id', block) // TODO: 使用正确的 receiveId
    })
  }

  async _onAgentError(sessionId, error) {
    await this._replyCollector.onAgentError(sessionId, error)
    // 错误通知已在 collector 内部处理
  }

  // ─── 辅助 ───

  _getHelpText() {
    return [
      '飞书 Agent 桥接命令:',
      '/help    - 显示帮助',
      '/status  - 查看连接状态',
      '/close   - 关闭当前会话',
      '/new     - 创建新会话',
      '/resume  - 恢复历史会话',
      '/rename <名称> - 重命名当前会话',
    ].join('\n')
  }

  _cleanupOldMsgIds() {
    const now = Date.now()
    const ttl = 10 * 60 * 1000 // 10 分钟
    for (const [msgId, ts] of this._processedMsgIds) {
      if (now - ts > ttl) this._processedMsgIds.delete(msgId)
    }
  }
}

module.exports = { FeishuBridge }

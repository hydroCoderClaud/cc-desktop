/**
 * 飞书桥接
 *
 * 将飞书事件订阅（接收）和消息 API（发送）连接到 Agent 会话系统。
 * 使用共享的 ImSessionMapper、ImReplyCollector、ImFrontendNotifier helper。
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { ImSessionMapper } = require('./im-session-mapper')
const { ImReplyCollector } = require('./im-reply-collector')
const { ImFrontendNotifier } = require('./im-frontend-notifier')
const { FeishuEventClient } = require('./feishu-event-client')
const { FeishuMessageAPI } = require('./feishu-message-api')

// 图片相关常量（与钉钉保持一致）
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp)$/i
const IMAGE_MAX_SIZE = 20 * 1024 * 1024 // 20MB
const FEISHU_MSG_ID_TTL = 10 * 60 * 1000
const FEISHU_MSG_ID_CLEANUP_INTERVAL = 60 * 1000
const FEISHU_CARD_SESSION_LIMIT = 10
const FEISHU_UNSUPPORTED_MESSAGE_TEXT = '暂不支持该类型的飞书消息，请发送文本、图片或图文消息'

class FeishuBridge {
  constructor(configManager, agentSessionManager, mainWindow) {
    this._config = configManager
    this._agentSessionManager = agentSessionManager
    this._mainWindow = mainWindow
    this._sessionDatabase = agentSessionManager.sessionDatabase

    this._api = new FeishuMessageAPI()
    this._eventClient = new FeishuEventClient()

    this._notifier = new ImFrontendNotifier(mainWindow, 'feishu')
    this._replyCollector = new ImReplyCollector({ maxTextLength: 6000 })
    this._sessionMapper = new ImSessionMapper({
      agentSessionManager,
      sessionDatabase: this._sessionDatabase,
      imType: 'feishu',
      maxHistorySessions: 5,
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: (identity) => {
        const nickname = identity.nickname || identity.userId?.substring(0, 8) || ''
        return `飞书 · ${nickname}`
      },
    })

    /** @type {Map<string, Promise>} 串行消息队列 */
    this._processQueues = new Map()
    /** @type {Map<string, number>} 去重 */
    this._processedMsgIds = new Map()
    /** @type {Map<string, { message: object, senderId: string, chatId: string, chatType: string }>} */
    this._pendingMessages = new Map()
    /** @type {Map<string, { senderId: string, chatId: string, chatType: string }>} 每个 session 的飞书身份（用于桌面端介入路由和图片发送） */
    this._sessionIdentities = new Map()
    /** @type {Map<string, { openId: string, displayName: string }>} 主动推送绑定的飞书目标 */
    this._sessionTargets = new Map()
    /** @type {Map<string, string>} open_id → sessionId */
    this._targetSessionMap = new Map()
    this._activeSendChunks = new Map()
    this._knownRobotMentionIds = new Set()

    this._agentListeners = null
    this._eventListeners = null
    this._msgIdCleanupTimer = null

    this._bindAgentEvents()
  }

  // ─── 生命周期 ───

  _syncSessionDatabase() {
    const db = this._agentSessionManager?.sessionDatabase || null
    this._sessionDatabase = db
    if (this._sessionMapper) {
      this._sessionMapper._sessionDatabase = db
    }
  }

  get config() {
    try { return this._config.getConfig()?.feishu || {} } catch { return {} }
  }

  async start() {
    this._syncSessionDatabase()
    const cfg = this.config
    if (!cfg.enabled || !cfg.appId || !cfg.appSecret) {
      console.log('[FeishuBridge] Not enabled or missing credentials')
      return false
    }

    this._sessionMapper = this._createSessionMapper(cfg)
    this._api.setCredentials(cfg.appId, cfg.appSecret)
    this._bindEventClientEvents()
    this._startMsgIdCleanupTimer()
    try {
      await this._eventClient.connect(cfg.appId, cfg.appSecret)
      return true
    } catch (err) {
      this._stopMsgIdCleanupTimer()
      this._unbindEventClientEvents()
      throw err
    }
  }

  async stop() {
    this._eventClient.stop()
    this._unbindEventClientEvents()
    this._stopMsgIdCleanupTimer()
    this._replyCollector.clearAll()
    this._sessionMapper.clearAll()
    this._processQueues.clear()
    this._processedMsgIds.clear()
    this._pendingMessages.clear()
    this._sessionIdentities.clear()
    this._sessionTargets.clear()
    this._targetSessionMap.clear()
    this._activeSendChunks.clear()
    this._knownRobotMentionIds.clear()
  }

  async restart() { await this.stop(); return this.start() }

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

  // ─── Agent 事件 ───

  _bindAgentEvents() {
    const mgr = this._agentSessionManager
    this._agentListeners = {
      userMessage: ({ sessionId, sessionType, content, images, source }) => {
        const hasBinding = this._sessionTargets.has(sessionId)
        if (source !== 'feishu' && (sessionType === 'feishu' || hasBinding)) {
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

  _createSessionMapper(cfg = this.config) {
    return new ImSessionMapper({
      agentSessionManager: this._agentSessionManager,
      sessionDatabase: this._sessionDatabase,
      imType: 'feishu',
      maxHistorySessions: cfg.maxHistorySessions || 5,
      defaultCwd: cfg.defaultCwd || null,
      buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
      buildSessionTitle: (identity) => {
        const nickname = identity.nickname || identity.userId?.substring(0, 8) || ''
        return `飞书 · ${nickname}`
      },
    })
  }

  _startMsgIdCleanupTimer() {
    this._stopMsgIdCleanupTimer()
    this._msgIdCleanupTimer = setInterval(() => {
      this._cleanupOldMsgIds()
    }, FEISHU_MSG_ID_CLEANUP_INTERVAL)
  }

  _stopMsgIdCleanupTimer() {
    if (this._msgIdCleanupTimer) {
      clearInterval(this._msgIdCleanupTimer)
      this._msgIdCleanupTimer = null
    }
  }

  // ─── 消息处理 ───

  async _handleFeishuMessage(event) {
    const initialMsgId = event?.msgId || event?.raw?.message?.message_id || ''
    if (initialMsgId) {
      if (this._processedMsgIds.has(initialMsgId)) return
      this._processedMsgIds.set(initialMsgId, Date.now())
    }

    const hydratedEvent = await this._hydrateInboundEvent(event)
    const { msgId, senderId, senderName, chatId, chatType, chatName, text, images, unsupported, msgType, mentions } = hydratedEvent
    if (!initialMsgId && msgId) {
      if (this._processedMsgIds.has(msgId)) return
      this._processedMsgIds.set(msgId, Date.now())
    }

    const resolvedNames = await this._resolveFeishuDisplayNames({
      senderId,
      senderName,
      chatId,
      chatType,
      chatName,
    })

    if (unsupported) {
      await this._sendUnsupportedMessageNotice(senderId, chatId, chatType, msgType)
      return
    }

    const normalizedText = this._normalizeInboundText(text, { chatType, mentions })
    console.log('[FeishuBridge] inbound text normalization:', JSON.stringify({
      msgId,
      chatType,
      msgType,
      hasText: !!text,
      mentionCount: Array.isArray(mentions) ? mentions.length : 0,
      hasNormalizedText: !!normalizedText,
    }))
    if (normalizedText && normalizedText.startsWith('/')) {
      this._handleCommand(normalizedText, { senderId, chatId, chatType }, { mentions }).catch(() => {})
      return
    }

    // 历史会话选择
    const mapKey = this._sessionMapper.buildKey({ userId: senderId, chatId })
    const pendingChoice = this._sessionMapper._pendingChoices?.get(mapKey)
    if (pendingChoice) {
      const activeSessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
      if (activeSessionId) {
        this._sessionMapper.clearPendingChoice(mapKey)
        this._pendingMessages.delete(mapKey)
      } else if (chatType === 'p2p') {
        const proactivelyBoundSessionId = await this._findBoundSessionIdBySenderId(senderId)
        if (proactivelyBoundSessionId) {
          this._sessionMapper.sessionMap.set(mapKey, proactivelyBoundSessionId)
          this._sessionMapper.clearPendingChoice(mapKey)
          this._pendingMessages.delete(mapKey)
        } else if (typeof normalizedText === 'string' && normalizedText.trim()) {
          await this._handleChoiceReply(
            mapKey,
            normalizedText,
            {
              userId: senderId,
              chatId,
              chatType,
              nickname: resolvedNames.senderName || senderId,
              chatName: resolvedNames.chatName || chatId,
            },
            senderId,
            chatId,
            chatType
          )
          return
        }
      } else if (typeof normalizedText === 'string' && normalizedText.trim()) {
        await this._handleChoiceReply(
          mapKey,
          normalizedText,
          {
            userId: senderId,
            chatId,
            chatType,
            nickname: resolvedNames.senderName || senderId,
            chatName: resolvedNames.chatName || chatId,
          },
          senderId,
          chatId,
          chatType
        )
        return
      }
    }

    // 下载图片（从 imageKey 获取 base64）
    let downloadedImages = undefined
    if (images && images.length > 0) {
      downloadedImages = []
      for (const img of images) {
        try {
          if (img.imageKey) {
            const downloaded = await this._api.downloadImage(img.imageKey, img.messageId || msgId)
            downloadedImages.push(downloaded)
          } else if (img.base64) {
            downloadedImages.push(img)
          }
        } catch (err) {
          console.error('[FeishuBridge] Image download failed:', err.message)
        }
      }
      downloadedImages = downloadedImages.length > 0 ? downloadedImages : undefined
    }

    const message = { text: normalizedText, images: downloadedImages }

    const sessionId = await this._ensureSession({
      userId: senderId,
      chatId,
      chatType,
      nickname: resolvedNames.senderName || senderId,
      chatName: resolvedNames.chatName || chatId,
    }, message, senderId, chatId, chatType)

    if (!sessionId) return

    // 存储飞书身份（用于桌面端介入和图片发送）
    this._sessionIdentities.set(sessionId, {
      senderId,
      senderName: resolvedNames.senderName || senderId,
      chatId,
      chatType,
      chatName: resolvedNames.chatName || chatId || null,
    })

    console.log('[FeishuBridge] notify frontend messageReceived:', JSON.stringify({
      sessionId,
      chatType,
      imagesCount: Array.isArray(downloadedImages) ? downloadedImages.length : 0,
    }))
    this._notifier.notifyMessageReceived({
      sessionId, text: normalizedText,
      senderNick: resolvedNames.senderName || senderId,
      images: downloadedImages,
    })

    this._enqueueMessage(sessionId, message, resolvedNames.senderName || senderId, chatId, chatType)
  }

  async _resolveFeishuDisplayNames({ senderId, senderName, chatId, chatType, chatName }) {
    let resolvedSenderName = this._normalizeFeishuDisplayName(senderName, senderId)
    let resolvedChatName = this._normalizeFeishuDisplayName(chatName, chatId)
    const hasFeishuCredentials = !!(this._api?._appId && this._api?._appSecret)

    if (!resolvedSenderName && senderId && hasFeishuCredentials && typeof this._api?.getUserInfo === 'function') {
      try {
        const user = await this._api.getUserInfo(senderId)
        resolvedSenderName = this._pickFeishuDisplayName(user)
      } catch (err) {
        console.warn('[FeishuBridge] Failed to resolve Feishu sender name:', JSON.stringify({
          senderId,
          error: err.message,
        }))
      }
    } else if (!resolvedSenderName && senderId) {
    }

    if (!resolvedChatName && chatId && hasFeishuCredentials && typeof this._api?.getChatInfo === 'function') {
      try {
        const chat = await this._api.getChatInfo(chatId)
        resolvedChatName = this._pickFeishuDisplayName(chat)
      } catch (err) {
        console.warn('[FeishuBridge] Failed to resolve Feishu chat name:', JSON.stringify({
          chatId,
          error: err.message,
        }))
      }
    } else if (!resolvedChatName && chatId) {
    }

    if (chatType === 'p2p') {
      if (!resolvedChatName) resolvedChatName = resolvedSenderName || senderId || ''
      if (!resolvedSenderName) resolvedSenderName = resolvedChatName || senderId || ''
    }

    return {
      senderName: resolvedSenderName || senderId || '',
      chatName: resolvedChatName || chatId || '',
    }
  }

  _normalizeFeishuDisplayName(value, fallbackId = null) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return ''
    if (fallbackId && text === fallbackId) return ''
    if (/^(ou|oc|chat|msg)_[A-Za-z0-9_-]+$/.test(text)) return ''
    return text
  }

  _pickFeishuDisplayName(value) {
    if (!value || typeof value !== 'object') return ''
    return value.name
      || value.display_name
      || value.displayName
      || value.nickname
      || value.user_name
      || value.real_name
      || value.title
      || value.chat_name
      || value.chatName
      || ''
  }

  async _hydrateInboundEvent(event) {
    const mentions = Array.isArray(event?.mentions) ? event.mentions : []
    const text = typeof event?.text === 'string' ? event.text : ''
    const msgType = event?.msgType || ''
    const chatType = event?.chatType || ''
    const msgId = event?.msgId || ''

    if (!['chat', 'group'].includes(chatType) || mentions.length > 0 || !msgId || !text.includes('@')) {
      return event
    }
    if (!['text', 'post'].includes(msgType)) {
      return event
    }

    try {
      const message = await this._api.getMessage(msgId)
      if (!message) return event

      const normalizedMessage = {
        content: message.content,
        mentions: message.mentions,
        message_type: message.msg_type || msgType,
        msg_type: message.msg_type || msgType,
      }
      const hydratedMentions = this._eventClient._extractMentions(normalizedMessage)
      if (!Array.isArray(hydratedMentions) || hydratedMentions.length === 0) {
        return event
      }

      const hydratedText = this._eventClient._extractText(normalizedMessage) || text
      console.log('[FeishuBridge] hydrated inbound event:', JSON.stringify({
        msgId,
        hydratedMentionCount: hydratedMentions.length,
        hydratedTextLength: hydratedText.length,
      }))
      return {
        ...event,
        text: hydratedText,
        mentions: hydratedMentions,
      }
    } catch (err) {
      console.warn('[FeishuBridge] Inbound message hydration failed:', err.message)
      return event
    }
  }

  async _handleChoiceReply(mapKey, inputText, identity, senderId, chatId, chatType) {
    const currentSessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
    const result = await this._sessionMapper.handleChoice(mapKey, inputText, identity)
    const receiveId = chatType === 'p2p' ? senderId : chatId
    const receiveIdType = chatType === 'p2p' ? 'open_id' : 'chat_id'
    const displayName = identity?.nickname || senderId

    if (result.invalidChoice) {
      await this._api.sendTextMessage(receiveIdType, receiveId, result.menuText || '无效选择，请重新回复数字')
      return
    }

    if (result.sessionId) {
      this._sessionIdentities.set(result.sessionId, {
        senderId,
        senderName: displayName,
        chatId,
        chatType,
        chatName: identity?.chatName || null,
      })
      this._notifier.notifySessionCreated({ sessionId: result.sessionId, nickname: displayName })
      const pending = this._pendingMessages.get(mapKey)
      if (result.action === 'resume') {
        if (currentSessionId && currentSessionId === result.sessionId && result.wasActivated && !pending) {
          await this._api.sendTextMessage(
            receiveIdType,
            receiveId,
            this._buildAlreadyConnectedText(result.selectedSession?.title || result.sessionId)
          )
        } else if (result.wasActivated) {
          await this._api.sendTextMessage(
            receiveIdType,
            receiveId,
            this._buildSessionSwitchedText(result.selectedSession?.title || result.sessionId)
          )
        } else {
          await this._api.sendTextMessage(receiveIdType, receiveId, this._buildSessionActivatingText())
        }
      } else {
        await this._api.sendTextMessage(receiveIdType, receiveId, this._buildSessionCreatingText())
      }
      if (pending) {
        this._pendingMessages.delete(mapKey)
        this._notifyPendingMessageReceived(result.sessionId, displayName, pending.message)
        this._enqueueMessage(result.sessionId, pending.message, pending.senderId, pending.chatId, pending.chatType)
      } else if (!result.wasActivated) {
        this._notifier.notifyMessageReceived({
          sessionId: result.sessionId,
          senderNick: displayName,
          text: 'hello',
        })
        this._enqueueMessage(result.sessionId, { text: 'hello', images: undefined }, displayName, chatId, chatType)
      }
    } else {
      await this._api.sendTextMessage(receiveIdType, receiveId, '无效选择，请重新回复数字')
    }
  }

  async _handleCardAction(event) {
    const { actionType, actionValue, userId, chatId, chatType } = event
    console.log('[FeishuBridge] Card action:', actionType)
    const commandText = this._resolveCardCommand(actionType, actionValue)
    if (!commandText) return
    const resolvedContext = this._resolveHistoryChoiceContext({ userId, chatId, chatType, actionValue })
    if (actionValue?.source === 'history-choice' && resolvedContext.senderId && resolvedContext.chatId) {
      const mapKey = this._sessionMapper.buildKey({ userId: resolvedContext.senderId, chatId: resolvedContext.chatId })
      this._sessionMapper.clearPendingChoice(mapKey)
    }
    await this._handleCommand(commandText, {
      senderId: resolvedContext.senderId,
      senderName: resolvedContext.senderName,
      chatId: resolvedContext.chatId,
      chatType: resolvedContext.chatType,
      chatName: resolvedContext.chatName,
    }, {
      cardValue: actionValue,
    })
  }

  async _handleCommand(text, context, options = {}) {
    this._syncSessionDatabase()
    const resolvedNames = await this._resolveFeishuDisplayNames(context)
    context = {
      ...context,
      senderName: context.senderName || resolvedNames.senderName,
      chatName: context.chatName || resolvedNames.chatName,
    }
    const normalizedText = this._normalizeCommandText(text, context, options)
    const parts = normalizedText.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)

    const mapKey = this._sessionMapper.buildKey({ userId: context.senderId, chatId: context.chatId })
    const preservePendingSelection = ['history-choice', 'session-entry'].includes(options?.cardValue?.source) &&
      (cmd === '/resume' || cmd === '/new')
    if (!preservePendingSelection) {
      this._sessionMapper.clearPendingChoice(mapKey)
      this._pendingMessages.delete(mapKey)
    }

    let sessionId = await this._resolveCommandSessionId(mapKey, context)
    const rememberedIdentity = this._sessionIdentities.get(sessionId)
    const identity = rememberedIdentity
      ? {
          ...rememberedIdentity,
          chatId: context.chatId || rememberedIdentity.chatId,
          chatType: context.chatType || rememberedIdentity.chatType,
          senderId: context.senderId || rememberedIdentity.senderId,
          senderName: context.senderName || rememberedIdentity.senderName,
          chatName: context.chatName || rememberedIdentity.chatName,
        }
      : context
    if (sessionId) {
      this._sessionIdentities.set(sessionId, identity)
    }
    const receiveId = identity.chatType === 'p2p' ? identity.senderId : identity.chatId
    const receiveIdType = identity.chatType === 'p2p' ? 'open_id' : 'chat_id'

    switch (cmd) {
      case '/help':
        await this._sendHelpMenu(receiveIdType, receiveId)
        break
      case '/status': {
        await this._sendStatusMenu(receiveIdType, receiveId, {
          mapKey,
          chatId: context.chatId,
        })
        break
      }
      case '/sessions':
        await this._sendSessionsMenu(receiveIdType, receiveId, {
          sessionId,
          chatId: context.chatId,
        })
        break
      case '/close': {
        const targetSessionId = await this._resolveCloseTargetSessionId(args, { chatId: context.chatId, mapKey })
        if (!targetSessionId) {
          await this._api.sendTextMessage(receiveIdType, receiveId, args.length > 0
            ? `编号错误：请输入 1-${this._getActiveSessionsByChat(context.chatId).length} 之间的数字\n\n使用 /sessions 查看会话列表`
            : '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话')
          break
        }
        const targetSession = this._agentSessionManager.sessions.get(targetSessionId)
        if (targetSession?.status === 'streaming') {
          await this._api.sendTextMessage(receiveIdType, receiveId, 'AI 正在响应中，请等待完成后再关闭')
          break
        }
        await this._agentSessionManager.close(targetSessionId)
        this._clearSessionIdentity(targetSessionId)
        this._notifier.notifySessionClosed({ sessionId: targetSessionId })
        sessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
        const closeText = args.length > 0
          ? `会话 ${args[0]} 已关闭：${targetSession?.title || targetSessionId.substring(0, 8)}`
          : '会话已关闭'
        await this._sendCloseResult(receiveIdType, receiveId, {
          sessionId,
          highlightSessionId: sessionId || null,
          chatId: context.chatId,
          closeText,
        })
        break
      }
      case '/new': {
        const currentSession = sessionId ? this._agentSessionManager.sessions.get(sessionId) : null
        if (currentSession?.status === 'streaming') {
          await this._api.sendTextMessage(receiveIdType, receiveId, 'AI 正在响应中，请等待完成后再操作')
          break
        }
        let cwd
        try {
          cwd = this._resolveNewSessionCwd(args)
        } catch (err) {
          await this._api.sendTextMessage(receiveIdType, receiveId, err.message)
          break
        }
        if (sessionId) {
          this._clearSessionIdentity(sessionId)
        }
        const newId = await this._sessionMapper.createSession({
          userId: context.senderId, chatId: context.chatId,
          chatType: context.chatType, nickname: context.senderName || context.senderId, chatName: context.chatName,
        }, { cwd })
        if (newId) {
          this._sessionMapper.sessionMap.set(mapKey, newId)
          this._sessionIdentities.set(newId, {
            senderId: context.senderId,
            senderName: context.senderName || context.senderId,
            chatId: context.chatId,
            chatType: context.chatType,
            chatName: context.chatName || null,
          })
          this._notifier.notifySessionCreated({ sessionId: newId, nickname: context.senderName || context.senderId })
        }
        if (!newId) {
          await this._api.sendTextMessage(receiveIdType, receiveId, '创建新会话失败')
          break
        }
        if (preservePendingSelection) {
          this._sessionMapper.clearPendingChoice(mapKey)
        }
        await this._api.sendTextMessage(receiveIdType, receiveId, this._buildSessionCreatingText())
        const pending = preservePendingSelection ? this._pendingMessages.get(mapKey) : null
        if (pending) {
          this._pendingMessages.delete(mapKey)
          this._notifyPendingMessageReceived(newId, context.senderName || context.senderId, pending.message)
          this._enqueueMessage(newId, pending.message, pending.senderId, pending.chatId, pending.chatType)
        } else {
          this._notifier.notifyMessageReceived({
            sessionId: newId,
            senderNick: context.senderName || context.senderId,
            text: 'hello',
          })
          this._enqueueMessage(newId, { text: 'hello', images: undefined }, context.senderName || context.senderId, context.chatId, context.chatType)
        }
        break
      }
      case '/resume': {
        const currentSession = sessionId ? this._agentSessionManager.sessions.get(sessionId) : null
        if (currentSession?.status === 'streaming') {
          await this._api.sendTextMessage(receiveIdType, receiveId, 'AI 正在响应中，请等待完成后再操作')
          break
        }
        const history = await this._sessionMapper._queryHistorySessions({
          userId: context.senderId,
          chatId: context.chatId,
          chatType: context.chatType,
        })
        if (!history || history.length === 0) {
          await this._api.sendTextMessage(receiveIdType, receiveId, '没有历史会话记录\n\n发送任意消息可开始新会话')
          break
        }
        const selectedIndex = Number.parseInt(args[0], 10)
        if (!Number.isNaN(selectedIndex)) {
          if (selectedIndex < 1 || selectedIndex > history.length) {
            await this._api.sendTextMessage(receiveIdType, receiveId, `编号错误：请输入 1-${history.length} 之间的数字`)
            break
          }
          const pending = preservePendingSelection ? this._pendingMessages.get(mapKey) : null
          const selected = history[selectedIndex - 1]
          const restoredSessionId = selected?.session_id || selected?.sessionId || selected?.id || null
          let resolvedSessionId = restoredSessionId
          let isActivated = false
          if (sessionId && restoredSessionId === sessionId) {
            const liveCurrentSession = this._agentSessionManager.sessions.get(sessionId)
            if (liveCurrentSession?.queryGenerator && !pending) {
              await this._api.sendTextMessage(
                receiveIdType,
                receiveId,
                this._buildAlreadyConnectedText(selected?.title || liveCurrentSession?.title || sessionId)
              )
              break
            }
          }
          if (resolvedSessionId) {
            try {
              const existingSession = this._agentSessionManager.sessions.get(resolvedSessionId)
              isActivated = !!existingSession?.queryGenerator
              await this._agentSessionManager.reopen(resolvedSessionId)
              this._sessionMapper.sessionMap.set(mapKey, resolvedSessionId)
            } catch (err) {
              console.error('[FeishuBridge] Resume session failed:', err)
              resolvedSessionId = null
            }
          }
          if (resolvedSessionId) {
            if (preservePendingSelection) {
              this._sessionMapper.clearPendingChoice(mapKey)
            }
            this._sessionIdentities.set(resolvedSessionId, {
              senderId: context.senderId,
              senderName: context.senderName || context.senderId,
              chatId: context.chatId,
              chatType: context.chatType,
              chatName: context.chatName || null,
            })
            this._notifier.notifySessionCreated({ sessionId: resolvedSessionId, nickname: context.senderName || context.senderId })
            if (isActivated) {
              await this._api.sendTextMessage(receiveIdType, receiveId, this._buildSessionSwitchedText(selected?.title || resolvedSessionId))
            } else {
              await this._api.sendTextMessage(receiveIdType, receiveId, this._buildSessionActivatingText())
            }
            if (pending) {
              this._pendingMessages.delete(mapKey)
              this._notifyPendingMessageReceived(resolvedSessionId, context.senderName || context.senderId, pending.message)
              this._enqueueMessage(resolvedSessionId, pending.message, pending.senderId, pending.chatId, pending.chatType)
            } else if (!isActivated) {
              this._notifier.notifyMessageReceived({
                sessionId: resolvedSessionId,
                senderNick: context.senderName || context.senderId,
                text: 'hello',
              })
              this._enqueueMessage(resolvedSessionId, { text: 'hello', images: undefined }, context.senderName || context.senderId, context.chatId, context.chatType)
            }
          } else {
            await this._api.sendTextMessage(receiveIdType, receiveId, '无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话')
          }
          break
        }
        await this._sessionMapper.initPendingChoice(mapKey, history, async (menuText) => {
          await this._sendHistoryChoiceMenu(receiveIdType, receiveId, history, sessionId, menuText, context)
        }, {
          menuBuilder: (sessions) => this._buildHistoryChoiceMenuText(sessions, sessionId)
        })
        break
      }
      case '/rename': {
        if (!sessionId) {
          await this._api.sendTextMessage(receiveIdType, receiveId, '当前没有活跃会话，无法重命名')
          break
        }
        const newTitle = args.join(' ').trim()
        if (!newTitle) {
          await this._api.sendTextMessage(receiveIdType, receiveId, '请提供新名称，例如：/rename 我的项目')
          break
        }
        this._agentSessionManager.rename(sessionId, newTitle)
        await this._api.sendTextMessage(receiveIdType, receiveId, `会话已重命名为：${newTitle}`)
        break
      }
      default:
        await this._api.sendTextMessage(receiveIdType, receiveId, `未知命令: ${cmd}\n输入 /help 查看可用命令`)
    }
  }

  _normalizeCommandText(text, context = {}, options = {}) {
    if (typeof text !== 'string') return ''
    const normalizedSourceText = this._normalizeInboundText(text, {
      chatType: context?.chatType,
      mentions: options?.mentions
    })
    const commandText = this._stripRobotMentionArtifactsForCommandText(normalizedSourceText, options?.mentions)
    const parts = commandText.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return ''
    const [cmd, ...args] = parts
    return [cmd, ...args].join(' ').trim()
  }

  _normalizeInboundText(text, { chatType, mentions } = {}) {
    if (typeof text !== 'string') return ''
    const trimmed = text.trim()
    if (!trimmed) return trimmed
    const robotMentions = this._buildRobotMentionTokens(mentions)
    const userMentions = this._buildNonRobotMentionReplacements(mentions)
    if (robotMentions.length === 0) return trimmed

    let normalized = trimmed
    for (const mention of robotMentions) {
      if (!mention) continue
      normalized = normalized.split(mention).join('')
    }

    for (const { key, display } of userMentions) {
      if (!key || !display) continue
      normalized = normalized.split(key).join(display)
    }

    return normalized.replace(/\s+/g, ' ').trim()
  }

  _buildRobotMentionTokens(mentions) {
    const result = new Set()
    if (!Array.isArray(mentions)) return []
    for (const mention of mentions) {
      if (!this._isRobotMention(mention)) continue
      const key = typeof mention?.key === 'string' ? mention.key.trim() : ''
      if (key) result.add(key.startsWith('@') ? key : `@${key}`)
    }
    return Array.from(result)
  }

  _buildNonRobotMentionReplacements(mentions) {
    const result = []
    if (!Array.isArray(mentions)) return result
    for (const mention of mentions) {
      if (!mention || typeof mention !== 'object') continue
      if (this._isRobotMention(mention)) continue
      const key = typeof mention?.key === 'string' ? mention.key.trim() : ''
      const name = typeof mention?.name === 'string' ? mention.name.trim() : ''
      if (!key || !name || !key.startsWith('@_user_')) continue
      result.push({
        key,
        display: name.startsWith('@') ? name : `@${name}`
      })
    }
    return result
  }

  _stripRobotMentionArtifactsForCommandText(text, mentions) {
    if (typeof text !== 'string') return ''
    let normalized = text
    const robotMentionNames = this._buildRobotMentionNames(mentions)
    for (const token of robotMentionNames) {
      if (!token) continue
      normalized = normalized.replace(new RegExp(`\\s*${this._escapeRegex(token)}\\s*`, 'g'), ' ')
    }
    return normalized.replace(/\s+/g, ' ').trim()
  }

  _buildRobotMentionNames(mentions) {
    const result = new Set()
    if (!Array.isArray(mentions)) return []
    for (const mention of mentions) {
      if (!this._isRobotMention(mention)) continue
      const key = typeof mention?.key === 'string' ? mention.key.trim() : ''
      const name = typeof mention?.name === 'string' ? mention.name.trim() : ''
      if (key && !key.startsWith('@_user_')) {
        result.add(key.startsWith('@') ? key : `@${key}`)
      }
      if (name) {
        result.add(name.startsWith('@') ? name : `@${name}`)
      }
    }
    return Array.from(result)
  }

  _escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  _isRobotMention(mention) {
    if (!mention || typeof mention !== 'object') return false
    const ids = this._extractMentionIds(mention)
    const id = ids[0] || ''
    const idType = typeof mention.idType === 'string' ? mention.idType.trim().toLowerCase() : ''
    const name = typeof mention.name === 'string' ? mention.name.trim() : ''
    if (idType === 'app_id') return true
    if (!!this.config?.appId && id === this.config.appId) return true
    if (ids.some(candidate => this._knownRobotMentionIds.has(candidate))) return true
    if (!/hydro\s*desktop/i.test(name)) return false
    for (const candidate of ids) {
      this._knownRobotMentionIds.add(candidate)
    }
    return true
  }

  _extractMentionIds(mention) {
    if (!mention || typeof mention !== 'object') return []
    const candidates = []
    const directId = typeof mention.id === 'string' ? mention.id.trim() : ''
    if (directId) candidates.push(directId)
    if (mention.id && typeof mention.id === 'object') {
      for (const value of [mention.id.open_id, mention.id.user_id, mention.id.union_id]) {
        const normalized = typeof value === 'string' ? value.trim() : ''
        if (normalized) candidates.push(normalized)
      }
    }
    return Array.from(new Set(candidates))
  }

  // ─── 会话管理 ───

  async _ensureSession(identity, message, senderId, chatId, chatType) {
    this._syncSessionDatabase()
    const mapKey = this._sessionMapper.buildKey(identity)
    let sessionId = this._sessionMapper.sessionMap.get(mapKey)
    if (sessionId) {
      const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
      if (!row || row.status === 'closed') {
        this._clearSessionIdentity(sessionId)
        sessionId = null
      } else {
        const reopened = this._agentSessionManager.reopen(sessionId)
        if (reopened) {
          return sessionId
        }
        this._clearSessionIdentity(sessionId)
        sessionId = null
      }
    }

    if (!sessionId && chatType === 'p2p') {
      const proactiveSessionId = await this._findBoundSessionIdBySenderId(senderId)
      if (proactiveSessionId) {
        this._sessionMapper.sessionMap.set(mapKey, proactiveSessionId)
        this._sessionIdentities.set(proactiveSessionId, {
          senderId,
          senderName: identity.nickname || senderId,
          chatId,
          chatType,
          chatName: identity.chatName || null,
        })
        if (this._sessionDatabase?.updateDingTalkMetadata) {
          try {
            this._sessionDatabase.updateDingTalkMetadata(proactiveSessionId, senderId || '', chatId || '')
          } catch (err) {
            console.warn('[FeishuBridge] Failed to persist proactive Feishu binding:', err.message)
          }
        }
        return proactiveSessionId
      }
    }

    const historySessions = await this._sessionMapper._queryHistorySessions(identity)
    if (historySessions && historySessions.length > 0) {
      this._pendingMessages.set(mapKey, { message, senderId, chatId, chatType })
      await this._sessionMapper.initPendingChoice(mapKey, historySessions, async (menuText) => {
        await this._sendHistoryChoiceMenu(
          chatType === 'p2p' ? 'open_id' : 'chat_id',
          chatType === 'p2p' ? senderId : chatId,
          historySessions,
          sessionId,
          menuText,
          {
            senderId,
            senderName: identity.nickname || senderId,
            chatId,
            chatType,
            chatName: identity.chatName || null,
          }
        )
      }, {
        menuBuilder: (sessions) => this._buildHistoryChoiceMenuText(sessions, sessionId)
      })
      return null
    }

    sessionId = await this._sessionMapper.createSession(identity)
    if (sessionId) {
      this._sessionMapper.sessionMap.set(mapKey, sessionId)
      this._notifier.notifySessionCreated({
        sessionId,
        nickname: identity.nickname || identity.userId?.substring(0, 8),
      })
    }
    return sessionId
  }

  // ─── 消息队列 ───

  _enqueueMessage(sessionId, message, senderId, chatId, chatType) {
    const prev = this._processQueues.get(sessionId) || Promise.resolve()
    const task = prev.catch(() => {}).then(() => this._processOneMessage(sessionId, message, senderId, chatId, chatType))
    this._processQueues.set(sessionId, task)
    task.finally(() => {
      if (this._processQueues.get(sessionId) === task) this._processQueues.delete(sessionId)
    })
  }

  async _processOneMessage(sessionId, message, senderId, chatId, chatType) {
    const identity = this._sessionIdentities.get(sessionId) || { senderId, chatId, chatType }
    const receiveId = identity.chatType === 'p2p' ? identity.senderId : identity.chatId
    const receiveIdType = identity.chatType === 'p2p' ? 'open_id' : 'chat_id'

    const { donePromise, sendChunk } = this._replyCollector.startCollect(sessionId, {
      sendFn: async (text) => {
        try { await this._api.sendTextMessage(receiveIdType, receiveId, text) } catch (err) {
          console.error('[FeishuBridge] sendTextMessage error:', err)
        }
      },
    })
    this._activeSendChunks.set(sessionId, sendChunk)

    try {
      await this._agentSessionManager.sendMessage(sessionId, message, {
        meta: { source: 'feishu', senderNick: identity.senderName || senderId, feishuChatId: chatId },
      })
      await donePromise
    } catch (err) {
      this._replyCollector.clear(sessionId)
      console.error('[FeishuBridge] Process message error:', err)
      try {
        await this._api.sendTextMessage(receiveIdType, receiveId, `处理消息时出错: ${err.message}`)
      } catch {}
    } finally {
      this._activeSendChunks.delete(sessionId)
    }
  }

  // ─── 桌面端介入 ───

  _onDesktopIntervention(sessionId, content, images) {
    const identity = this._sessionIdentities.get(sessionId)
    if (!identity) return

    const receiveId = identity.chatType === 'p2p' ? identity.senderId : identity.chatId
    const receiveIdType = identity.chatType === 'p2p' ? 'open_id' : 'chat_id'

    this._replyCollector.recordDesktopIntervention(
      sessionId, { content, images },
      async (sid, { userContent, fullText }) => {
        if (!fullText) return
        const block = `桌面介入> ${userContent}\n\n${fullText}`
        await this._api.sendTextMessage(receiveIdType, receiveId, block)
      }
    )
  }

  async listSendableTargets({ limit = Number.MAX_SAFE_INTEGER } = {}) {
    const users = await this._api.listUsers?.({ limit }) || []
    return Promise.all(users.map(async (user) => {
      let displayName = this._normalizeFeishuDisplayName(
        user.displayName || user.name || user.nickname || user.realName || '',
        user.openId
      ) || this._normalizeFeishuDisplayName(this._pickFeishuDisplayName(user), user.openId)

      if (!displayName && user.openId && typeof this._api?.getUserInfo === 'function') {
        try {
          const detail = await this._api.getUserInfo(user.openId)
          displayName = this._pickFeishuDisplayName(detail)
        } catch (err) {
          console.warn('[FeishuBridge] Failed to hydrate proactive target name:', JSON.stringify({
            openId: user.openId,
            error: err.message,
          }))
        }
      }

      return {
        id: user.openId,
        openId: user.openId,
        userId: user.userId,
        displayName: displayName || '',
        name: displayName || '',
        email: user.email || null,
        jobTitle: user.jobTitle || '',
        avatarUrl: user.avatarUrl || null,
        hasContextToken: true,
      }
    }))
  }

  bindSessionToTarget(sessionId, { openId, targetId, displayName } = {}) {
    this._syncSessionDatabase()
    const resolvedOpenId = typeof (openId || targetId) === 'string'
      ? (openId || targetId).trim()
      : ''
    if (!sessionId || !resolvedOpenId) {
      throw new Error('sessionId 和 openId 不能为空')
    }
    const session = this._agentSessionManager.sessions.get(sessionId)
      || this._sessionDatabase?.getAgentConversation?.(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} 不存在或已关闭`)
    }
    this._agentSessionManager.bindSessionExternalImSource(sessionId, 'feishu')

    const previousTarget = this._sessionTargets.get(sessionId)
    if (previousTarget?.openId && previousTarget.openId !== resolvedOpenId) {
      this._targetSessionMap.delete(previousTarget.openId)
    }

    const previousSessionId = this._targetSessionMap.get(resolvedOpenId)
    if (previousSessionId && previousSessionId !== sessionId) {
      this._clearP2PSessionMapBinding(previousSessionId, resolvedOpenId)
      const previousSessionTarget = this._sessionTargets.get(previousSessionId)
      if (previousSessionTarget?.openId) {
        this._targetSessionMap.delete(previousSessionTarget.openId)
      }
      this._sessionTargets.delete(previousSessionId)
      if (this._sessionIdentities.get(previousSessionId)?.chatType === 'p2p') {
        this._sessionIdentities.delete(previousSessionId)
      }
    }

    const target = {
      openId: resolvedOpenId,
      displayName: displayName || previousTarget?.displayName || resolvedOpenId,
    }
    this._sessionTargets.set(sessionId, target)
    this._targetSessionMap.set(resolvedOpenId, sessionId)
    this._sessionIdentities.set(sessionId, {
      senderId: resolvedOpenId,
      senderName: target.displayName || resolvedOpenId,
      chatId: null,
      chatType: 'p2p',
      chatName: target.displayName || resolvedOpenId,
    })
    if (this._sessionDatabase?.updateDingTalkMetadata) {
      try {
        this._sessionDatabase.updateDingTalkMetadata(sessionId, resolvedOpenId, '')
      } catch (err) {
        console.warn('[FeishuBridge] Failed to persist bound Feishu target identity:', err.message)
      }
    }
    return { success: true, target }
  }

  _clearP2PSessionMapBinding(sessionId, senderId) {
    if (!sessionId || !senderId) return
    const identity = this._sessionIdentities.get(sessionId)
    if (!identity || identity.chatType !== 'p2p' || !identity.chatId) return
    const mapKey = this._sessionMapper.buildKey({ userId: senderId, chatId: identity.chatId })
    if (this._sessionMapper.sessionMap.get(mapKey) === sessionId) {
      this._sessionMapper.sessionMap.delete(mapKey)
    }
  }

  unbindSessionTarget(sessionId) {
    if (!sessionId) return { success: false, error: 'sessionId 不能为空' }
    const target = this._sessionTargets.get(sessionId) || null
    if (target?.openId) {
      this._targetSessionMap.delete(target.openId)
    }
    this._sessionTargets.delete(sessionId)
    const identity = this._sessionIdentities.get(sessionId)
    if (identity?.chatType === 'p2p' && !identity.chatId) {
      this._sessionIdentities.delete(sessionId)
    }
    return { success: true }
  }

  getSessionBinding(sessionId) {
    const target = this._sessionTargets.get(sessionId) || null
    if (!target) return null
    return {
      targetId: target.openId,
      openId: target.openId,
      displayName: target.displayName,
    }
  }

  async sendTextToTarget({ sessionId, openId, targetId, displayName, text } = {}) {
    this._syncSessionDatabase()
    const content = typeof text === 'string' ? text.trim() : ''
    if (!content) {
      throw new Error('发送内容不能为空')
    }
    const candidateOpenId = openId || targetId || this._sessionTargets.get(sessionId)?.openId || ''
    const resolvedOpenId = typeof candidateOpenId === 'string' ? candidateOpenId.trim() : ''
    if (!resolvedOpenId) {
      throw new Error('openId 不能为空')
    }
    if (sessionId) {
      this._agentSessionManager.assertSessionImBindingAllowed(sessionId, 'feishu')
    }
    const messageId = await this._api.sendTextMessage('open_id', resolvedOpenId, content)
    if (sessionId) {
      this.bindSessionToTarget(sessionId, { openId: resolvedOpenId, displayName })
    }
    return { success: true, messageId, targetId: resolvedOpenId }
  }

  _resolveMapKeyForSession(sessionId) {
    for (const [key, sid] of this._sessionMapper.sessionMap) {
      if (sid === sessionId) return key
    }
    return null
  }

  async _resolveCommandSessionId(mapKey, context) {
    let sessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
    if (sessionId) {
      return sessionId
    }

    const reboundSessionId = await this._findBoundSessionIdByChat(context.chatId, mapKey)
    if (!reboundSessionId) {
      return null
    }

    this._sessionMapper.sessionMap.set(mapKey, reboundSessionId)
    this._sessionIdentities.set(reboundSessionId, {
      senderId: context.senderId,
      senderName: context.senderName || context.senderId,
      chatId: context.chatId,
      chatType: context.chatType || 'p2p',
      chatName: context.chatName || null,
    })
    return reboundSessionId
  }

  async _findBoundSessionIdByChat(chatId, excludeMapKey = null) {
    if (!chatId) return null

    for (const [key, sid] of this._sessionMapper.sessionMap.entries()) {
      if (key === excludeMapKey || sid == null) continue
      if (!key.endsWith(`:${chatId}`)) continue
      const activeSessionId = await this._sessionMapper.resolveActiveSessionId(key)
      if (activeSessionId) {
        return activeSessionId
      }
    }

    for (const [sessionId, identity] of this._sessionIdentities.entries()) {
      if (!identity || identity.chatId !== chatId) continue
      const liveSession = this._agentSessionManager.sessions.get(sessionId)
      if (liveSession) {
        return sessionId
      }
      const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
      if (row && row.status !== 'closed') {
        return sessionId
      }
    }

    return null
  }

  async _findBoundSessionIdBySenderId(senderId) {
    if (!senderId) return null
    const sessionId = this._targetSessionMap.get(senderId)
    if (sessionId) {
      const liveSession = this._agentSessionManager.sessions.get(sessionId)
      if (liveSession) return sessionId
      const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
      if (row && row.status !== 'closed') return sessionId
      this._targetSessionMap.delete(senderId)
      this._sessionTargets.delete(sessionId)
    }

    if (typeof this._sessionDatabase?.listAllAgentConversations !== 'function') {
      return null
    }

    try {
      const rows = this._sessionDatabase.listAllAgentConversations({
        limit: Math.max(this.config?.maxHistorySessions || 5, 20)
      })
      const matched = Array.isArray(rows)
        ? rows
          .filter(row => row?.status !== 'closed')
          .filter(row => row?.type === 'feishu' || row?.source === 'feishu')
          .filter(row => row?.staff_id === senderId)
          .filter(row => !row?.conversation_id)
          .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))[0]
        : null
      if (!matched) return null
      const fallbackSessionId = matched.session_id || matched.sessionId || matched.id || null
      if (!fallbackSessionId) return null
      this._targetSessionMap.set(senderId, fallbackSessionId)
      return fallbackSessionId
    } catch {
      return null
    }
  }

  _resolveHistoryChoiceContext({ userId, chatId, chatType, actionValue }) {
    const fallback = {
      senderId: userId,
      senderName: actionValue?.senderName || actionValue?.nickname || null,
      chatId,
      chatType: chatType || 'p2p',
      chatName: actionValue?.chatName || null,
    }
    if (actionValue?.senderId || actionValue?.chatId) {
      return {
        senderId: actionValue.senderId || userId || null,
        senderName: actionValue.senderName || actionValue.nickname || null,
        chatId: actionValue.chatId || chatId || null,
        chatType: actionValue.chatType || chatType || 'p2p',
        chatName: actionValue.chatName || null,
      }
    }

    if (actionValue?.source !== 'history-choice') {
      return fallback
    }

    if (!chatId) {
      return fallback
    }

    const exactKey = userId ? this._sessionMapper.buildKey({ userId, chatId }) : null
    if (exactKey && this._sessionMapper._pendingChoices?.has(exactKey)) {
      return fallback
    }

    const matchedKey = this._findPendingMapKeyByChat(chatId)
    if (!matchedKey) {
      return fallback
    }

    const separatorIndex = matchedKey.indexOf(':')
    if (separatorIndex === -1) {
      return fallback
    }

    return {
      senderId: matchedKey.substring(0, separatorIndex),
      senderName: actionValue?.senderName || actionValue?.nickname || userId || null,
      chatId: matchedKey.substring(separatorIndex + 1),
      chatType: chatType || 'p2p',
      chatName: actionValue?.chatName || null,
    }
  }

  _findPendingMapKeyByChat(chatId) {
    if (!chatId || !this._sessionMapper?._pendingChoices) return null
    for (const key of this._sessionMapper._pendingChoices.keys()) {
      if (key.endsWith(`:${chatId}`)) return key
    }
    return null
  }

  // ─── Agent 事件处理 ───

  _onAgentMessage(sessionId, message) {
    // 流式文本 → replyCollector 实时推
    this._replyCollector.onAgentMessage(sessionId, message, this._activeSendChunks.get(sessionId))

    // 从 tool_use 块中提取图片路径（Agent 操作了图片文件）
    if (message && typeof message === 'object') {
      const paths = this._extractImagePaths(message)
      for (const imagePath of paths) {
        this._replyCollector.addImagePath(sessionId, imagePath)
      }
    }
  }

  async _onAgentResult(sessionId) {
    // 1. 处理回复收集（是否有桌面端介入待发送）
    const collectorResult = await this._replyCollector.onAgentResult(sessionId, async (sid, data) => {
      const identity = this._sessionIdentities.get(sid)
      if (!identity) return
      const receiveId = identity.chatType === 'p2p' ? identity.senderId : identity.chatId
      const receiveIdType = identity.chatType === 'p2p' ? 'open_id' : 'chat_id'
      const block = `桌面介入> ${data.userContent}\n\n${data.fullText}`
      await this._api.sendTextMessage(receiveIdType, receiveId, block)
      if (Array.isArray(data.userImages) && data.userImages.length > 0) {
        await this._sendBase64Images(receiveIdType, receiveId, data.userImages)
      }
    })

    // 2. 发送 Agent 收集到的图片
    const imagePaths = Array.isArray(collectorResult?.imagePaths) ? collectorResult.imagePaths : []
    if (imagePaths.length > 0) {
      const identity = this._sessionIdentities.get(sessionId)
      if (identity) {
        const receiveId = identity.chatType === 'p2p' ? identity.senderId : identity.chatId
        const receiveIdType = identity.chatType === 'p2p' ? 'open_id' : 'chat_id'
        for (const imagePath of imagePaths) {
          try {
            const stat = await fs.promises.stat(imagePath).catch(() => null)
            if (!stat || stat.size === 0 || stat.size > IMAGE_MAX_SIZE) continue
            const imageKey = await this._api.uploadImage(imagePath)
            await this._api.sendImageMessage(receiveIdType, receiveId, imageKey)
          } catch (err) {
            console.error('[FeishuBridge] Image send failed:', imagePath, err.message)
          }
        }
      }
    }

    // 3. 发送桌面端介入的 base64 图片
  }

  async _onAgentError(sessionId, error) {
    const identity = this._sessionIdentities.get(sessionId)
    await this._replyCollector.onAgentError(sessionId, error, async (_sid, errMsg) => {
      if (!identity) return
      const receiveId = identity.chatType === 'p2p' ? identity.senderId : identity.chatId
      const receiveIdType = identity.chatType === 'p2p' ? 'open_id' : 'chat_id'
      await this._api.sendTextMessage(receiveIdType, receiveId, `处理消息时出错: ${errMsg}`)
    })
  }

  // ─── 图片路径提取 ───

  /**
   * 从 Agent 消息的 tool_use 块中递归提取磁盘图片路径
   * 与钉钉 _extractImagePaths 相同逻辑
   */
  _extractImagePaths(obj, depth = 0) {
    if (depth > 10) return []
    if (!obj || typeof obj !== 'object') return []

    const paths = []
    for (const value of Object.values(obj)) {
      if (typeof value === 'string') {
        if (IMAGE_EXTENSIONS.test(value) && (value.startsWith('/') || /^[A-Z]:[/\\]/.test(value))) {
          paths.push(this._normalizePath(value))
        }
      } else if (typeof value === 'object' && value !== null) {
        paths.push(...this._extractImagePaths(value, depth + 1))
      }
    }
    return paths
  }

  _normalizePath(rawPath) {
    // MSYS /c/... → C:/...
    const m = rawPath.match(/^\/([a-zA-Z])\/(.*)$/)
    if (m) return `${m[1].toUpperCase()}:/${m[2]}`
    return rawPath
  }

  // ─── 辅助 ───

  _getHelpText() {
    return [
      '飞书 Agent 桥接命令:',
      '/help    - 显示帮助',
      '/status  - 查看连接状态',
      '/sessions - 查看当前聊天下的活跃会话',
      '/close [编号] - 关闭当前会话或指定会话',
      '/new [目录] - 创建新会话（可选：目录名或绝对路径）',
      '/resume [编号] - 恢复历史会话',
      '/rename <名称> - 重命名当前会话',
    ].join('\n')
  }

  _getActiveSessionsByChat(chatId) {
    const sessions = [...this._agentSessionManager.sessions.values()]
    return sessions.filter((session) => {
      const belongsToFeishu = session.type === 'feishu' || session.source === 'feishu'
      if (!belongsToFeishu || !session.queryGenerator) return false
      const identity = this._sessionIdentities.get(session.id)
      if (identity?.chatId === chatId) return true
      const row = this._sessionDatabase?.getAgentConversation?.(session.id)
      return row?.conversation_id === chatId
    })
  }

  _buildAlreadyConnectedText(title) {
    return `✅ 当前已连接该会话：${title || '当前会话'}`
  }

  _buildSessionSwitchedText(title) {
    return `✅ 已切换到会话：${title || '当前会话'}\n\n现在可以继续对话了`
  }

  _buildSessionActivatingText() {
    return '会话恢复中，请等待信息返回后，即可开始聊天'
  }

  _buildSessionCreatingText() {
    return '会话创建中，请等待信息返回后，即可开始聊天'
  }

  _buildActiveSessionsText({ sessionId, chatId }) {
    const activeSessions = this._getActiveSessionsByChat(chatId)
    if (activeSessions.length === 0) return '暂无活跃会话'

    const lines = ['活跃会话：', '']
    activeSessions.forEach((session, index) => {
      const marker = session.id === sessionId ? '✅ ' : ''
      const dir = session.cwd ? this._basename(session.cwd) : '-'
      const profileName = session.apiProfileId
        ? (this._config?.getAPIProfile?.(session.apiProfileId)?.name || '未知配置')
        : '默认配置'
      lines.push(`${index + 1}. ${marker}${session.title || session.id.substring(0, 8)} (${dir}) ${profileName}`)
    })
    lines.push('', '使用 /close 关闭当前会话')
    return lines.join('\n')
  }

  _buildStatusText({ mapKey, chatId }) {
    const activeSessions = this._getActiveSessionsByChat(chatId)
    const streaming = activeSessions.filter(session => session.status === 'streaming').length
    const idle = activeSessions.filter(session => session.status === 'idle').length
    const lines = ['系统状态', `├─ 飞书桥接: ${this._eventClient.connected ? '已连接' : '未连接'}`]

    if (mapKey) {
      const currentSessionId = this._sessionMapper.sessionMap.get(mapKey)
      if (currentSessionId) {
        const session = this._agentSessionManager.sessions.get(currentSessionId)
        if (session?.queryGenerator) {
          const profileName = session.apiProfileId
            ? (this._config?.getAPIProfile?.(session.apiProfileId)?.name || '未知配置')
            : '默认配置'
          lines.push(`├─ 当前会话: ${session.title} (${profileName})`)
        }
      }
    }

    lines.push(`├─ 执行中: ${streaming} 个 / 空闲: ${idle} 个`)
    lines.push(`└─ 总会话数: ${activeSessions.length} 个`)
    return lines.join('\n')
  }

  async _sendSessionsMenu(receiveIdType, receiveId, { sessionId, chatId, context = null }) {
    const activeSessions = this._getActiveSessionsByChat(chatId)
    const text = this._buildActiveSessionsText({ sessionId, chatId })
    if (activeSessions.length === 0) {
      await this._api.sendTextMessage(receiveIdType, receiveId, text)
      return
    }

    const card = this._buildSessionsCard(activeSessions, sessionId, { context })
    try {
      await this._api.sendCardMessage(receiveIdType, receiveId, card)
    } catch (err) {
      console.error('[FeishuBridge] Send sessions card failed:', err.message)
      await this._api.sendTextMessage(receiveIdType, receiveId, text)
    }
  }

  async _sendHelpMenu(receiveIdType, receiveId, context = null) {
    const text = this._getHelpText()
    try {
      await this._api.sendCardMessage(receiveIdType, receiveId, this._buildHelpCard(context))
    } catch (err) {
      console.error('[FeishuBridge] Send help card failed:', err.message)
      await this._api.sendTextMessage(receiveIdType, receiveId, text)
    }
  }

  async _sendStatusMenu(receiveIdType, receiveId, { mapKey, chatId, context = null }) {
    const statusText = this._buildStatusText({ mapKey, chatId })
    try {
      await this._api.sendCardMessage(receiveIdType, receiveId, this._buildStatusCard(statusText, context))
    } catch (err) {
      console.error('[FeishuBridge] Send status card failed:', err.message)
      await this._api.sendTextMessage(receiveIdType, receiveId, statusText)
    }
  }

  async _sendCloseResult(receiveIdType, receiveId, { sessionId, highlightSessionId = null, chatId, closeText, context = null }) {
    const activeSessions = this._getActiveSessionsByChat(chatId)
    const fallbackText = `${closeText}\n\n${this._buildActiveSessionsText({ sessionId, chatId })}`

    try {
      if (activeSessions.length > 0) {
        await this._api.sendCardMessage(
          receiveIdType,
          receiveId,
          this._buildSessionsCard(activeSessions, highlightSessionId, {
            title: '会话已关闭',
            summary: closeText,
            context
          })
        )
        return
      }

      await this._api.sendCardMessage(
        receiveIdType,
        receiveId,
          this._buildResultCard({
            title: '会话已关闭',
            summary: `${closeText}\n\n暂无活跃会话`,
            context,
            actions: [
            this._buildCommandButton('新建会话', { intent: 'new' }, 'primary'),
            this._buildCommandButton('查看状态', { intent: 'status' }),
            this._buildCommandButton('查看帮助', { intent: 'help' })
          ]
        })
      )
    } catch (err) {
      console.error('[FeishuBridge] Send close result card failed:', err.message)
      await this._api.sendTextMessage(receiveIdType, receiveId, fallbackText)
    }
  }

  async _sendHistoryChoiceMenu(receiveIdType, receiveId, sessions, currentSessionId, fallbackText, context = null) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      await this._api.sendTextMessage(receiveIdType, receiveId, fallbackText || '没有历史会话记录')
      return
    }

    const card = this._buildHistoryChoiceCard(sessions, currentSessionId, context)
    try {
      await this._api.sendCardMessage(receiveIdType, receiveId, card)
    } catch (err) {
      console.error('[FeishuBridge] Send history choice card failed:', err.message)
      await this._api.sendTextMessage(receiveIdType, receiveId, fallbackText || this._buildHistoryChoiceMenuText(sessions, currentSessionId))
    }
  }

  _notifyPendingMessageReceived(sessionId, senderNick, message) {
    const text = typeof message === 'string'
      ? message
      : (message?.text || (Array.isArray(message?.images) && message.images.length > 0 ? '[图片]' : ''))
    const payload = {
      sessionId,
      senderNick,
      text,
    }
    if (message && typeof message === 'object' && Array.isArray(message.images) && message.images.length > 0) {
      payload.images = message.images
    }
    this._notifier.notifyMessageReceived(payload)
  }

  _buildHistoryChoiceMenuText(sessions, currentSessionId = null) {
    const displaySessions = sessions.slice(0, 10)
    const lines = ['您有以下历史会话，请回复数字选择：', '']

    displaySessions.forEach((row, index) => {
      const timeStr = this._formatRelativeTime(row.updated_at)
      const dir = row.cwd ? this._basename(row.cwd) : '-'
      const profileName = row.api_profile_id
        ? (this._config?.getAPIProfile?.(row.api_profile_id)?.name || '未知配置')
        : '默认配置'
      const liveSession = this._agentSessionManager.sessions.get(row.session_id)
      const marker = currentSessionId && row.session_id === currentSessionId
        ? '✅ '
        : (liveSession?.queryGenerator ? '🔵 ' : '⭕ ')
      lines.push(`${index + 1}. ${marker}[${timeStr}] ${row.title || '(无标题)'} (${dir}) ${profileName}`)
    })

    if (sessions.length > displaySessions.length) {
      lines.push('', `（仅显示最近 ${displaySessions.length} 条，共 ${sessions.length} 条）`)
    }

    lines.push('', '回复 0 开始全新会话')
    return lines.join('\n')
  }

  _buildHistoryChoiceCard(sessions, currentSessionId = null, context = null) {
    const displaySessions = sessions.slice(0, FEISHU_CARD_SESSION_LIMIT)
    const actionContext = context ? {
      senderId: context.senderId || context.userId || null,
      senderName: context.senderName || context.nickname || null,
      chatId: context.chatId || null,
      chatType: context.chatType || 'p2p',
      chatName: context.chatName || null,
    } : null
    const elements = [
      {
        tag: 'markdown',
        content: displaySessions.map((row, index) => {
          const timeStr = this._formatRelativeTime(row.updated_at)
          const dir = row.cwd ? this._basename(row.cwd) : '-'
          const profileName = row.api_profile_id
            ? (this._config?.getAPIProfile?.(row.api_profile_id)?.name || '未知配置')
            : '默认配置'
          const liveSession = this._agentSessionManager.sessions.get(row.session_id)
          const marker = currentSessionId && row.session_id === currentSessionId
            ? '✅'
            : (liveSession?.queryGenerator ? '🔵' : '⭕')
          return `${index + 1}. ${marker} [${timeStr}] ${row.title || '(无标题)'} (${dir}) ${profileName}`
        }).join('\n')
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            type: 'primary',
            text: {
              tag: 'plain_text',
              content: '新建会话'
            },
            value: {
              intent: 'new',
              source: 'history-choice',
              ...(actionContext || {})
            }
          },
          {
            tag: 'button',
            type: 'default',
            text: {
              tag: 'plain_text',
              content: '查看活跃会话'
            },
            value: {
              intent: 'sessions'
            }
          }
        ]
      }
    ]

    const resumeActions = displaySessions.map((row, index) => ({
      tag: 'button',
      type: currentSessionId && row.session_id === currentSessionId ? 'primary' : 'default',
      text: {
        tag: 'plain_text',
        content: `恢复 ${index + 1}`
      },
      value: {
        intent: 'resume',
        index: index + 1,
        title: row.title || '',
        source: 'history-choice',
        ...(actionContext || {})
      }
    }))
    elements.splice(1, 0, ...this._chunkCardActions(resumeActions))

    if (sessions.length > displaySessions.length) {
      elements.splice(1, 0, {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: `仅显示最近 ${displaySessions.length} 条，共 ${sessions.length} 条`
          }
        ]
      })
    }

    return {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: '历史会话'
        }
      },
      elements
    }
  }

  _buildSessionsCard(activeSessions, currentSessionId = null, options = {}) {
    const displaySessions = activeSessions.slice(0, FEISHU_CARD_SESSION_LIMIT)
    const context = options.context || null
    const elements = []

    if (options.summary) {
      elements.push({
        tag: 'markdown',
        content: options.summary
      })
    }

    elements.push(
      {
        tag: 'markdown',
        content: displaySessions.map((session, index) => {
          const dir = session.cwd ? this._basename(session.cwd) : '-'
          const profileName = session.apiProfileId
            ? (this._config?.getAPIProfile?.(session.apiProfileId)?.name || '未知配置')
            : '默认配置'
          const marker = session.id === currentSessionId ? '✅' : '🔵'
          return `${index + 1}. ${marker} ${session.title || session.id.substring(0, 8)} (${dir}) ${profileName}`
        }).join('\n')
      },
      {
        tag: 'action',
        actions: [
          this._buildCommandButton('新建会话', { intent: 'new', ...(context || {}) }, 'primary'),
          this._buildCommandButton('查看状态', { intent: 'status' }),
          this._buildCommandButton('查看帮助', { intent: 'help' })
        ]
      }
    )

    const closeActions = displaySessions.map((session, index) => this._buildCommandButton(
      `关闭 ${index + 1}`,
      {
        intent: 'close',
        index: index + 1,
        title: session.title || ''
      },
      session.id === currentSessionId ? 'primary' : 'default'
    ))
    elements.splice(options.summary ? 2 : 1, 0, ...this._chunkCardActions(closeActions))

    if (activeSessions.length > displaySessions.length) {
      elements.splice(options.summary ? 2 : 1, 0, {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: `仅显示最近 ${displaySessions.length} 条，共 ${activeSessions.length} 条`
          }
        ]
      })
    }

    return {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: options.title || '活跃会话'
        }
      },
      elements
    }
  }

  _buildHelpCard(context = null) {
    return this._buildResultCard({
      title: '飞书命令帮助',
      summary: this._getHelpText(),
      context,
      actions: [
        this._buildCommandButton('新建会话', { intent: 'new', ...(context || {}) }, 'primary'),
        this._buildCommandButton('活跃会话', { intent: 'sessions' }),
        this._buildCommandButton('查看状态', { intent: 'status' }),
        this._buildCommandButton('恢复历史会话', { command: 'resume' })
      ]
    })
  }

  _buildStatusCard(statusText, context = null) {
    return this._buildResultCard({
      title: '系统状态',
      summary: statusText,
      context,
      actions: [
        this._buildCommandButton('活跃会话', { intent: 'sessions' }, 'primary'),
        this._buildCommandButton('新建会话', { intent: 'new', ...(context || {}) }),
        this._buildCommandButton('查看帮助', { intent: 'help' })
      ]
    })
  }

  _buildResultCard({ title, summary, actions = [], context = null }) {
    const actionsWithContext = actions.map(action => this._attachCardContext(action, context))
    return {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: title
        }
      },
      elements: [
        {
          tag: 'markdown',
          content: summary
        },
        {
          tag: 'action',
          actions: actionsWithContext
        }
      ]
    }
  }

  _attachCardContext(action, context = null) {
    if (!context || !action || typeof action !== 'object') return action
    const value = action.value && typeof action.value === 'object'
      ? { ...action.value, ...this._buildCardContextValue(context) }
      : action.value
    return {
      ...action,
      value,
    }
  }

  _buildCardContextValue(context = null) {
    if (!context || typeof context !== 'object') return {}
    const senderName = this._normalizeFeishuDisplayName(context.senderName || context.nickname || null, context.senderId || context.userId || null)
    const chatName = this._normalizeFeishuDisplayName(context.chatName || null, context.chatId || null)
    return {
      senderId: context.senderId || context.userId || null,
      senderName: senderName || null,
      chatId: context.chatId || null,
      chatType: context.chatType || 'p2p',
      chatName: chatName || null,
    }
  }

  _buildCommandButton(label, value, type = 'default') {
    return {
      tag: 'button',
      type,
      text: {
        tag: 'plain_text',
        content: label
      },
      value
    }
  }

  _chunkCardActions(actions, chunkSize = 5) {
    const chunks = []
    for (let index = 0; index < actions.length; index += chunkSize) {
      chunks.push({
        tag: 'action',
        actions: actions.slice(index, index + chunkSize)
      })
    }
    return chunks
  }

  _formatRelativeTime(timestamp) {
    const value = Number(timestamp)
    if (!Number.isFinite(value) || value <= 0) return '未知时间'

    const diff = Date.now() - value
    const min = 60 * 1000
    const hour = 60 * min
    const day = 24 * hour
    if (diff < hour) return `${Math.max(1, Math.floor(diff / min))}分钟前`
    if (diff < day) return `${Math.floor(diff / hour)}小时前`
    if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
    if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}周前`
    return `${Math.floor(diff / (30 * day))}个月前`
  }

  async _resolveCloseTargetSessionId(args, { chatId, mapKey }) {
    if (!args.length) return this._sessionMapper.resolveActiveSessionId(mapKey)
    const index = Number.parseInt(args[0], 10)
    const activeSessions = this._getActiveSessionsByChat(chatId)
    if (Number.isNaN(index) || index < 1 || index > activeSessions.length) return null
    return activeSessions[index - 1]?.id || null
  }

  _clearSessionIdentity(sessionId) {
    for (const [key, sid] of this._sessionMapper.sessionMap.entries()) {
      if (sid === sessionId) {
        this._sessionMapper.clearSessionState(key)
      }
    }
    const target = this._sessionTargets.get(sessionId)
    if (target?.openId) {
      this._targetSessionMap.delete(target.openId)
    }
    this._sessionTargets.delete(sessionId)
    this._sessionIdentities.delete(sessionId)
  }

  async _sendBase64Images(receiveIdType, receiveId, images) {
    for (const image of images) {
      try {
        if (!image?.base64) continue
        const { filePath, dirPath } = await this._writeTempBase64Image(image)
        if (!filePath) continue
        try {
          const imageKey = await this._api.uploadImage(filePath)
          await this._api.sendImageMessage(receiveIdType, receiveId, imageKey)
        } finally {
          await fs.promises.unlink(filePath).catch(() => {})
          if (dirPath) {
            await fs.promises.rmdir(dirPath).catch(() => {})
          }
        }
      } catch (err) {
        console.error('[FeishuBridge] Base64 image send failed:', err.message)
      }
    }
  }

  async _writeTempBase64Image(image) {
    const ext = this._mediaTypeToExt(image.mediaType)
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'feishu-'))
    const filePath = path.join(dir, `input-${Date.now()}.${ext}`)
    await fs.promises.writeFile(filePath, Buffer.from(image.base64, 'base64'))
    return { filePath, dirPath: dir }
  }

  _mediaTypeToExt(mediaType) {
    switch (mediaType) {
      case 'image/png': return 'png'
      case 'image/gif': return 'gif'
      case 'image/webp': return 'webp'
      case 'image/bmp': return 'bmp'
      default: return 'jpg'
    }
  }

  _basename(rawPath) {
    return path.basename(rawPath)
  }

  _resolveCardCommand(actionType, actionValue) {
    const value = actionValue && typeof actionValue === 'object' ? actionValue : {}
    const rawCommand = typeof value.command === 'string'
      ? value.command.trim()
      : typeof value.cmd === 'string'
        ? value.cmd.trim()
        : ''
    if (rawCommand) {
      return rawCommand.startsWith('/') ? rawCommand : `/${rawCommand}`
    }

    switch (actionType) {
      case 'button':
      case 'select_static':
      case 'overflow': {
        const intent = typeof value.intent === 'string' ? value.intent.trim().toLowerCase() : ''
        const index = value.index ?? value.sessionIndex ?? value.choice
        const title = typeof value.title === 'string' ? value.title.trim() : ''
        if (intent === 'resume' && index != null) return `/resume ${index}`
        if (intent === 'close' && index != null) return `/close ${index}`
        if (intent === 'rename' && title) return `/rename ${title}`
        if (intent === 'new') return '/new'
        if (intent === 'sessions') return '/sessions'
        if (intent === 'status') return '/status'
        if (intent === 'help') return '/help'
        break
      }
      default:
        break
    }
    return null
  }

  _cleanupOldMsgIds() {
    const now = Date.now()
    for (const [msgId, ts] of this._processedMsgIds) {
      if (now - ts > FEISHU_MSG_ID_TTL) this._processedMsgIds.delete(msgId)
    }
  }

  async _sendUnsupportedMessageNotice(senderId, chatId, chatType, msgType) {
    const receiveId = chatType === 'p2p' ? senderId : chatId
    const receiveIdType = chatType === 'p2p' ? 'open_id' : 'chat_id'
    const suffix = msgType ? `\n\n当前消息类型：${msgType}` : ''
    await this._api.sendTextMessage(receiveIdType, receiveId, `${FEISHU_UNSUPPORTED_MESSAGE_TEXT}${suffix}`)
  }

  _resolveNewSessionCwd(args) {
    const dirArg = args.join(' ').trim()
    if (!dirArg) return undefined

    let cwd
    if (path.isAbsolute(dirArg) || /^[A-Za-z]:[/\\]/.test(dirArg)) {
      cwd = dirArg
    } else {
      cwd = path.join(this._agentSessionManager._getOutputBaseDir(), 'feishu', dirArg)
    }
    try {
      fs.mkdirSync(cwd, { recursive: true })
    } catch (err) {
      throw new Error(`无法创建目录: ${err.message}`)
    }
    return cwd
  }
}

module.exports = { FeishuBridge }

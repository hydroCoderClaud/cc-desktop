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
const { extractImagePaths, normalizePath, formatRelativeTime, IMAGE_EXTENSIONS, IMAGE_MAX_SIZE } = require('./im-utils')
const {
  isMappedCurrentSession,
  clearExactSessionMapping,
  clearSessionMappingsForSession,
} = require('./im-session-selectors')
const {
  buildHistoryChoiceMenuText,
} = require('./im-command-presenter')
const {
  resolveRenameCommand,
  dispatchImCommand,
} = require('./im-command-executor')
const { runResumePostAction } = require('./im-resume-post-action')
const { activateNewSession, resolveResumeSelection } = require('./im-session-command-flow')
const {
  buildImCommandHelpText,
  buildAlreadyConnectedText,
  buildSessionSwitchedText,
  buildSessionActivatingText,
  buildSessionCreatingText,
  buildNoHistoryText,
  buildRenameMissingSessionText,
  buildRenamePromptText,
  buildRenameSuccessText,
  buildUnknownCommandText,
  resolveCommandCwd,
  mergeCurrentSessionIntoHistory,
} = require('./im-command-policy')
const {
  resolveStrictCurrentSessionId,
  ensureHistoryChoiceOrCurrent,
} = require('./im-session-decision')

// 图片相关常量（与钉钉保持一致）
const FEISHU_MSG_ID_TTL = 10 * 60 * 1000
const FEISHU_MSG_ID_CLEANUP_INTERVAL = 60 * 1000
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
    /** @type {Set<string>} mapKey values that should choose history before proactive p2p rebinding */
    this._proactiveRebindSuppressedKeys = new Set()
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
    this._notifier.notifyStatusChange(this.getStatus())
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
    this._proactiveRebindSuppressedKeys.clear()
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
      runtimeState: this._eventClient.runtimeState,
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
    const onStatus = (data) => this._notifier.notifyStatusChange(data)
    const onError = (data) => this._notifier.notifyError(data)
    this._eventClient.on('message', onMessage)
    this._eventClient.on('statusChange', onStatus)
    this._eventClient.on('error', onError)
    this._eventListeners = { onMessage, onStatus, onError }
  }

  _unbindEventClientEvents() {
    if (!this._eventListeners) return
    const ec = this._eventClient
    ec.off('message', this._eventListeners.onMessage)
    ec.off('statusChange', this._eventListeners.onStatus)
    ec.off('error', this._eventListeners.onError)
    this._eventListeners = null
  }

  // ─── Agent 事件 ───

  _bindAgentEvents() {
    const mgr = this._agentSessionManager
    this._agentListeners = {
      userMessage: ({ sessionId, imChannel, content, images, source }) => {
        const hasBinding = this._sessionTargets.has(sessionId)
        if (source !== 'im-inbound' && (imChannel === 'feishu' || hasBinding)) {
          this._onDesktopIntervention(sessionId, content, images)
        }
      },
      agentMessage: (sessionId, message) => { this._onAgentMessage(sessionId, message) },
      agentResult: (sessionId) => { this._onAgentResult(sessionId) },
      agentError: (sessionId, error) => { this._onAgentError(sessionId, error) },
      agentInterrupted: (sessionId, details) => {
        if (details?.reason === 'host-cleanup') {
          this._clearSessionIdentity(sessionId)
        }
      },
      agentDeleted: (sessionId) => {
        this._clearSessionIdentity(sessionId)
      },
      agentClosed: (sessionId) => {
        this._clearSessionIdentity(sessionId)
      },
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
      this._handleCommand(normalizedText, {
        senderId,
        senderName: resolvedNames.senderName || senderId,
        chatId,
        chatType,
        chatName: resolvedNames.chatName || chatId,
      }, { mentions }).catch(() => {})
      return
    }

    // 历史会话选择
    const mapKey = this._sessionMapper.buildKey({ userId: senderId, chatId, chatType })
    const pendingChoice = this._sessionMapper._pendingChoices?.get(mapKey)
    if (pendingChoice) {
      const activeSessionId = await resolveStrictCurrentSessionId(this._sessionMapper, mapKey)
      if (activeSessionId) {
        this._sessionMapper.clearPendingChoice(mapKey)
        this._pendingMessages.delete(mapKey)
        this._proactiveRebindSuppressedKeys.delete(mapKey)
      } else if (chatType === 'p2p') {
        const proactivelyBoundSessionId = this._proactiveRebindSuppressedKeys.has(mapKey)
          ? null
          : await this._findBoundSessionIdBySenderId(senderId)
        if (proactivelyBoundSessionId) {
          this._sessionMapper.sessionMap.set(mapKey, proactivelyBoundSessionId)
          this._sessionIdentities.set(proactivelyBoundSessionId, {
            senderId,
            senderName: resolvedNames.senderName || senderId,
            chatId,
            chatType,
            chatName: resolvedNames.chatName || chatId || null,
          })
          this._sessionMapper.clearPendingChoice(mapKey)
          this._pendingMessages.delete(mapKey)
          this._proactiveRebindSuppressedKeys.delete(mapKey)
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
      this._proactiveRebindSuppressedKeys.delete(mapKey)
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
            buildAlreadyConnectedText(result.selectedSession?.title || result.sessionId)
          )
        } else if (result.wasActivated) {
          await this._api.sendTextMessage(
            receiveIdType,
            receiveId,
            buildSessionSwitchedText(result.selectedSession?.title || result.sessionId)
          )
        } else {
          await this._api.sendTextMessage(receiveIdType, receiveId, buildSessionActivatingText())
        }
      } else {
        await this._api.sendTextMessage(receiveIdType, receiveId, buildSessionCreatingText())
      }
      await runResumePostAction({
        pendingMessage: pending,
        clearPendingMessage: () => this._pendingMessages.delete(mapKey),
        wasActivated: result.wasActivated,
        notifyMessageReceived: () => {
          this._notifier.notifyMessageReceived({
            sessionId: result.sessionId,
            senderNick: displayName,
            text: 'hello',
          })
        },
        replayPendingMessage: async (pendingSelection) => {
          this._notifyPendingMessageReceived(result.sessionId, displayName, pendingSelection.message)
          this._enqueueMessage(result.sessionId, pendingSelection.message, pendingSelection.senderId, pendingSelection.chatId, pendingSelection.chatType)
        },
        enqueueHello: async () => {
          this._enqueueMessage(result.sessionId, { text: 'hello', images: undefined }, displayName, chatId, chatType)
        },
      })
    } else {
      await this._api.sendTextMessage(receiveIdType, receiveId, '无效选择，请重新回复数字')
    }
  }

  async _handleCommand(text, context, cardMeta = {}) {
    this._syncSessionDatabase()
    const needsResolvedSenderName = !context?.senderName && !!context?.senderId
    const needsResolvedChatName = !context?.chatName && !!context?.chatId
    const resolvedNames = (needsResolvedSenderName || needsResolvedChatName)
      ? await this._resolveFeishuDisplayNames(context)
      : {
          senderName: context?.senderName || context?.senderId || '',
          chatName: context?.chatName || context?.chatId || '',
        }
    context = {
      ...context,
      senderName: context.senderName || resolvedNames.senderName,
      chatName: context.chatName || resolvedNames.chatName,
    }
    const normalizedText = this._normalizeCommandText(text, context, cardMeta || {})

    const mapKey = this._sessionMapper.buildKey({ userId: context.senderId, chatId: context.chatId, chatType: context.chatType })

    let sessionId = await resolveStrictCurrentSessionId(this._sessionMapper, mapKey)
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

    await dispatchImCommand({
      text: normalizedText,
      beforeExecute: () => {
        this._sessionMapper.clearPendingChoice(mapKey)
        this._pendingMessages.delete(mapKey)
      },
      handlers: {
        help: async () => {
          await this._sendHelpMenu(receiveIdType, receiveId)
        },
        status: async () => {
          await this._sendStatusMenu(receiveIdType, receiveId, {
            mapKey,
            chatId: context.chatId,
            context,
          })
        },
        close: async ({ args }) => {
          if (Array.isArray(args) && args.length > 0) {
            await this._api.sendTextMessage(receiveIdType, receiveId, '/close 不支持带编号或参数，请直接使用 /close')
            return
          }
          if (!sessionId) {
            await this._api.sendTextMessage(receiveIdType, receiveId, '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话')
            return
          }
          const currentSession = this._agentSessionManager.sessions.get(sessionId) || null
          if (currentSession?.status === 'streaming') {
            await this._api.sendTextMessage(receiveIdType, receiveId, 'AI 正在响应中，请等待完成后再关闭')
            return
          }
          await this._agentSessionManager.close(sessionId)
          this._clearSessionIdentity(sessionId)
          if ((context.chatType || '').toLowerCase() === 'p2p') {
            this._proactiveRebindSuppressedKeys.add(mapKey)
          }
          this._notifier.notifySessionClosed({ sessionId })
          sessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
          await this._sendCloseResult(receiveIdType, receiveId, {
            closeText: '会话已关闭',
            context,
          })
        },
        new: async ({ args, command }) => {
          const currentSession = sessionId ? this._agentSessionManager.sessions.get(sessionId) : null
          if (currentSession?.status === 'streaming') {
            await this._api.sendTextMessage(receiveIdType, receiveId, 'AI 正在响应中，请等待完成后再操作')
            return
          }
          let cwd
          try {
            cwd = this._resolveNewSessionCwd(args)
          } catch (err) {
            await this._api.sendTextMessage(receiveIdType, receiveId, err.message)
            return
          }
          if (sessionId) {
            this._clearSessionIdentity(sessionId)
          }
          const newId = await this._sessionMapper.createSession({
            userId: context.senderId, chatId: context.chatId,
            chatType: context.chatType, nickname: context.senderName || context.senderId, chatName: context.chatName,
          }, { cwd })
          if (newId) {
            this._proactiveRebindSuppressedKeys.delete(mapKey)
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
            return
          }
          this._sessionMapper.clearPendingChoice(mapKey)
          await this._api.sendTextMessage(receiveIdType, receiveId, buildSessionCreatingText())
          await activateNewSession({
            sessionId: newId,
            clearPendingMessage: () => this._pendingMessages.delete(mapKey),
            notifyMessageReceived: () => {
              this._notifier.notifyMessageReceived({
                sessionId: newId,
                senderNick: context.senderName || context.senderId,
                text: 'hello',
              })
            },
            replayPendingMessage: async (pendingSelection) => {
              this._notifyPendingMessageReceived(newId, context.senderName || context.senderId, pendingSelection.message)
              this._enqueueMessage(newId, pendingSelection.message, pendingSelection.senderId, pendingSelection.chatId, pendingSelection.chatType)
            },
            enqueueHello: async () => {
              this._enqueueMessage(newId, { text: 'hello', images: undefined }, context.senderName || context.senderId, context.chatId, context.chatType)
            },
          })
        },
        resume: async ({ args, command }) => {
          let resumeSessionId = sessionId
          if (!resumeSessionId && context.chatType === 'p2p' && context.senderId) {
            resumeSessionId = await this._findBoundSessionIdBySenderId(context.senderId, {
              allowDatabaseFallback: false,
            })
          }
          const currentSession = resumeSessionId ? this._agentSessionManager.sessions.get(resumeSessionId) : null
          if (currentSession?.status === 'streaming') {
            await this._api.sendTextMessage(receiveIdType, receiveId, 'AI 正在响应中，请等待完成后再操作')
            return
          }
          let history = await this._sessionMapper._queryHistorySessions({
            userId: context.senderId,
            chatId: context.chatId,
            chatType: context.chatType,
          })
          history = this._mergeCurrentSessionIntoHistory(history, resumeSessionId, context)
          if (!history || history.length === 0) {
            await this._api.sendTextMessage(receiveIdType, receiveId, buildNoHistoryText())
            return
          }
          const selectedIndex = Number.parseInt(args[0], 10)
          if (!Number.isNaN(selectedIndex)) {
            const selection = resolveResumeSelection({
              history,
              selectedIndex,
              currentSessionId: resumeSessionId,
              currentSession,
            })
            if (selection.action === 'invalid_index') {
              await this._api.sendTextMessage(receiveIdType, receiveId, `编号错误：请输入 1-${selection.max} 之间的数字`)
              return
            }
            const pending = null
            if (selection.action === 'already_connected') {
              await this._api.sendTextMessage(
                receiveIdType,
                receiveId,
                buildAlreadyConnectedText(selection.selected?.title || currentSession?.title || selection.sessionId)
              )
              return
            }
            let resolvedSessionId = selection.sessionId
            let isActivated = false
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
              this._proactiveRebindSuppressedKeys.delete(mapKey)
              this._sessionMapper.clearPendingChoice(mapKey)
              this._sessionIdentities.set(resolvedSessionId, {
                senderId: context.senderId,
                senderName: context.senderName || context.senderId,
                chatId: context.chatId,
                chatType: context.chatType,
                chatName: context.chatName || null,
              })
              this._notifier.notifySessionCreated({ sessionId: resolvedSessionId, nickname: context.senderName || context.senderId })
              if (isActivated) {
                await this._api.sendTextMessage(receiveIdType, receiveId, buildSessionSwitchedText(selection.selected?.title || resolvedSessionId))
              } else {
                await this._api.sendTextMessage(receiveIdType, receiveId, buildSessionActivatingText())
              }
              await runResumePostAction({
                pendingMessage: pending,
                clearPendingMessage: () => this._pendingMessages.delete(mapKey),
                wasActivated: isActivated,
                notifyMessageReceived: () => {
                  this._notifier.notifyMessageReceived({
                    sessionId: resolvedSessionId,
                    senderNick: context.senderName || context.senderId,
                    text: 'hello',
                  })
                },
                replayPendingMessage: async (pendingSelection) => {
                  this._notifyPendingMessageReceived(resolvedSessionId, context.senderName || context.senderId, pendingSelection.message)
                  this._enqueueMessage(resolvedSessionId, pendingSelection.message, pendingSelection.senderId, pendingSelection.chatId, pendingSelection.chatType)
                },
                enqueueHello: async () => {
                  this._enqueueMessage(resolvedSessionId, { text: 'hello', images: undefined }, context.senderName || context.senderId, context.chatId, context.chatType)
                },
              })
            } else {
              await this._api.sendTextMessage(receiveIdType, receiveId, '无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话')
            }
            return
          }
          await this._sessionMapper.initPendingChoice(mapKey, history, async (menuText) => {
            await this._sendHistoryChoiceMenu(receiveIdType, receiveId, history, resumeSessionId, menuText, context)
          }, {
            menuBuilder: (sessions) => this._buildHistoryChoiceMenuText(sessions, resumeSessionId)
          })
        },
        rename: async ({ args }) => {
          const renameDecision = resolveRenameCommand({
            args,
            currentSessionId: sessionId,
          })
          if (renameDecision.action === 'missing_current') {
            await this._api.sendTextMessage(receiveIdType, receiveId, buildRenameMissingSessionText())
            return
          }
          if (renameDecision.action === 'missing_title') {
            await this._api.sendTextMessage(receiveIdType, receiveId, buildRenamePromptText())
            return
          }
          this._agentSessionManager.rename(renameDecision.sessionId, renameDecision.newTitle)
          await this._api.sendTextMessage(receiveIdType, receiveId, buildRenameSuccessText(renameDecision.newTitle))
        },
      },
      onUnknown: async ({ rawCommand }) => {
        await this._api.sendTextMessage(receiveIdType, receiveId, buildUnknownCommandText(rawCommand))
      },
    })
  }

  _mergeCurrentSessionIntoHistory(history, sessionId, context = {}) {
    const rows = Array.isArray(history) ? history : []
    if (!sessionId) return rows

    const hasCurrent = rows.some(row => {
      const rowSessionId = row?.session_id || row?.sessionId || row?.id || null
      return rowSessionId === sessionId
    })
    if (hasCurrent) return rows

    const liveSession = this._agentSessionManager.sessions.get(sessionId)
    const dbRow = this._sessionDatabase?.getAgentConversation?.(sessionId)
    if (!liveSession && (!dbRow || dbRow.status === 'closed')) return rows

    const currentRow = {
      ...(dbRow || {}),
      session_id: dbRow?.session_id || liveSession?.id || sessionId,
      title: dbRow?.title || liveSession?.title || sessionId,
      cwd: dbRow?.cwd || liveSession?.cwd || null,
      api_profile_id: dbRow?.api_profile_id || liveSession?.apiProfileId || null,
      updated_at: dbRow?.updated_at || (liveSession?.updatedAt ? new Date(liveSession.updatedAt).getTime() : Date.now()),
      type: 'chat',
      source: 'im-inbound',
      im_channel: 'feishu',
      staff_id: dbRow?.staff_id || context.senderId || '',
      conversation_id: dbRow?.conversation_id || context.chatId || '',
      status: dbRow?.status || liveSession?.status || 'idle',
    }

    return mergeCurrentSessionIntoHistory({
      history: rows,
      currentSessionId: sessionId,
      currentRow,
    })
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
    let sessionId = await resolveStrictCurrentSessionId(this._sessionMapper, mapKey)
    if (sessionId) {
      const reopened = this._agentSessionManager.reopen(sessionId)
      if (reopened) {
        return sessionId
      }
      this._clearSessionIdentity(sessionId)
      sessionId = null
    }

    const decision = await ensureHistoryChoiceOrCurrent({
      sessionMapper: this._sessionMapper,
      mapKey,
      identity,
      resolveBoundSessionId: async () => {
        if (chatType !== 'p2p' || this._proactiveRebindSuppressedKeys.has(mapKey)) {
          return null
        }
        const proactiveSessionId = await this._findBoundSessionIdBySenderId(senderId)
        if (!proactiveSessionId) return null
        this._sessionIdentities.set(proactiveSessionId, {
          senderId,
          senderName: identity.nickname || senderId,
          chatId,
          chatType,
          chatName: identity.chatName || null,
        })
        if (this._sessionDatabase?.updateImIdentity) {
          try {
            this._sessionDatabase.updateImIdentity(proactiveSessionId, { userId: senderId || '', chatId: chatId || '', chatType: 'p2p' })
          } catch (err) {
            console.warn('[FeishuBridge] Failed to persist proactive Feishu binding:', err.message)
          }
        }
        return proactiveSessionId
      },
    })

    if (decision.action === 'show_choice') {
      this._pendingMessages.set(mapKey, { message, senderId, chatId, chatType })
      await this._sessionMapper.initPendingChoice(mapKey, decision.sessions, async (menuText) => {
        await this._sendHistoryChoiceMenu(
          chatType === 'p2p' ? 'open_id' : 'chat_id',
          chatType === 'p2p' ? senderId : chatId,
          decision.sessions,
          null,
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
        menuBuilder: (sessions) => this._buildHistoryChoiceMenuText(sessions, null)
      })
      return null
    }

    sessionId = decision.sessionId || null
    if (decision.action === 'create_new' && sessionId) {
      this._proactiveRebindSuppressedKeys.delete(mapKey)
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
        meta: { source: 'im-inbound', senderNick: identity.senderName || senderId, feishuChatId: chatId },
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

    const mapKey = this._sessionMapper.buildKey({
      userId: identity.senderId,
      chatId: identity.chatId,
    })
    if (!isMappedCurrentSession({
      sessionMap: this._sessionMapper.sessionMap,
      sessionId,
      mapKey,
    })) {
      console.log(`[FeishuBridge] Desktop intervention blocked for session ${sessionId}: not current connected session`)
      return
    }

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
    const chats = await this._api.listChats?.({ limit: Math.min(limit, 100) }).catch(() => []) || []

    const userResults = await Promise.all(users.map(async (user) => {
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
        targetType: 'user',
      }
    }))

    // 附加群列表（targetType='chat'）
    const chatTargets = chats.map(chat => ({
      id: chat.chatId,
      openId: chat.chatId,
      displayName: chat.displayName || chat.name || chat.chatId || '',
      name: chat.name || '',
      targetType: 'chat',
      hasContextToken: true,
    }))

    return [...userResults, ...chatTargets]
  }

  bindTarget(sessionId, { targetId, targetType, displayName } = {}) {
    this._syncSessionDatabase()
    const resolvedOpenId = typeof targetId === 'string' ? targetId.trim() : ''
    if (!sessionId || !resolvedOpenId) {
      throw new Error('sessionId 和 targetId 不能为空')
    }
    const session = this._agentSessionManager.sessions.get(sessionId)
      || this._sessionDatabase?.getAgentConversation?.(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} 不存在或已关闭`)
    }
    this._agentSessionManager.assertSessionImBindingAllowed(sessionId, 'feishu')
    this._assertSessionTargetAllowed(sessionId, resolvedOpenId, displayName)
    this._agentSessionManager.bindSessionExternalImSource(sessionId, 'feishu')

    const previousTarget = this._sessionTargets.get(sessionId)
    if (previousTarget?.openId && previousTarget.openId !== resolvedOpenId) {
      this._targetSessionMap.delete(previousTarget.openId)
    }

    this._clearP2PSessionMapBindingsForSender(resolvedOpenId, sessionId)

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

    // 写入 sessionMap（群聊 key=chatId，p2p key=userId:chatId）
    const bindMapKey = this._sessionMapper.buildKey({
      userId: resolvedOpenId,
      chatId: targetType === 'chat' ? resolvedOpenId : resolvedOpenId,
      chatType: targetType === 'chat' ? 'group' : 'p2p',
    })
    this._sessionMapper.sessionMap.set(bindMapKey, sessionId)

    this._sessionIdentities.set(sessionId, {
      senderId: resolvedOpenId,
      senderName: target.displayName || resolvedOpenId,
      chatId: targetType === 'chat' ? resolvedOpenId : null,
      chatType: targetType === 'chat' ? 'group' : 'p2p',
      chatName: target.displayName || resolvedOpenId,
    })
    if (this._sessionDatabase?.updateImIdentity) {
      try {
        this._sessionDatabase.updateImIdentity(sessionId, { userId: resolvedOpenId, chatId: targetType === 'chat' ? resolvedOpenId : '', chatType: targetType === 'chat' ? 'group' : 'p2p' })
      } catch (err) {
        console.warn('[FeishuBridge] Failed to persist bound Feishu target identity:', err.message)
      }
    }
    return { success: true, target }
  }

  _assertSessionTargetAllowed(sessionId, resolvedOpenId, displayName) {
    if (!sessionId || !resolvedOpenId) return

    const existingTarget = this._sessionTargets.get(sessionId)
    const identity = this._sessionIdentities.get(sessionId)
    const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
    const identityOpenId = identity?.chatType === 'p2p' && typeof identity?.senderId === 'string'
      ? identity.senderId.trim()
      : ''
    const rowOpenId = typeof row?.staff_id === 'string' ? row.staff_id.trim() : ''
    const existingOpenId = existingTarget?.openId || identityOpenId || rowOpenId

    if (existingOpenId && existingOpenId !== resolvedOpenId) {
      const currentLabel = existingTarget?.displayName || identity?.senderName || existingOpenId
      const nextLabel = displayName || resolvedOpenId
      throw new Error(`当前会话已绑定飞书联系人「${currentLabel}」，不能再发送给「${nextLabel}」。请新建会话后再联系其他成员。`)
    }
  }

  _clearP2PSessionMapBinding(sessionId, senderId) {
    if (!sessionId || !senderId) return
    const identity = this._sessionIdentities.get(sessionId)
    if (!identity || identity.chatType !== 'p2p' || !identity.chatId) return
    clearExactSessionMapping({
      sessionMap: this._sessionMapper.sessionMap,
      mapKey: this._sessionMapper.buildKey({ userId: senderId, chatId: identity.chatId }),
      sessionId,
      deleteEntry: (mapKeyToDelete) => this._sessionMapper.clearSessionState(mapKeyToDelete),
    })
  }

  _clearP2PSessionMapBindingsForSender(senderId, keepSessionId = null) {
    if (!senderId) return
    for (const [sessionId, identity] of this._sessionIdentities.entries()) {
      if (sessionId === keepSessionId) continue
      if (!identity || identity.chatType !== 'p2p' || identity.senderId !== senderId) continue
      this._clearP2PSessionMapBinding(sessionId, senderId)
      this._sessionIdentities.delete(sessionId)
    }
  }

  unbindTarget(sessionId) {
    if (!sessionId) return { success: false, error: 'sessionId 不能为空' }
    const target = this._sessionTargets.get(sessionId) || null
    const identity = this._sessionIdentities.get(sessionId) || null
    const senderId = typeof (target?.openId || identity?.senderId) === 'string'
      ? (target?.openId || identity?.senderId).trim()
      : ''
    if (senderId) {
      this._proactiveRebindSuppressedKeys.add(`${senderId}:${senderId}`)
      if (identity?.chatId) {
        this._proactiveRebindSuppressedKeys.add(`${senderId}:${identity.chatId}`)
      }
    }
    if (target?.openId) {
      this._targetSessionMap.delete(target.openId)
    }
    clearSessionMappingsForSession({
      sessionMap: this._sessionMapper.sessionMap,
      sessionId,
      deleteEntry: (mapKey) => this._sessionMapper.clearSessionState(mapKey),
    })
    this._sessionTargets.delete(sessionId)
    this._activeSendChunks.delete(sessionId)
    this._replyCollector.clear(sessionId)
    this._sessionIdentities.delete(sessionId)
    this._agentSessionManager?.unbindSessionExternalImSource?.(sessionId)
    const bindingAfter = this.getBinding(sessionId)
    console.log('[FeishuBridge] unbindTarget result:', {
      sessionId,
      hasSessionTarget: this._sessionTargets.has(sessionId),
      hasSessionIdentity: this._sessionIdentities.has(sessionId),
      bindingAfter,
    })
    return { success: true }
  }

  getBinding(sessionId) {
    this._syncSessionDatabase()
    const target = this._sessionTargets.get(sessionId) || null
    if (!target) {
      const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
      const openId = typeof row?.staff_id === 'string' ? row.staff_id.trim() : ''
      if (!openId || row?.im_channel !== 'feishu') return null
      const restoredTarget = this._restoreP2PTargetBinding(sessionId, openId, {
        chatId: typeof row?.conversation_id === 'string' ? row.conversation_id.trim() : ''
      })
      return {
        targetId: restoredTarget.openId,
        displayName: restoredTarget.displayName,
      }
    }
    return {
      targetId: target.openId,
      displayName: target.displayName,
    }
  }

  async sendToTarget({ sessionId, targetId, targetType, displayName, text, openId } = {}) {
    this._syncSessionDatabase()
    const content = typeof text === 'string' ? text.trim() : ''
    if (!content) {
      throw new Error('发送内容不能为空')
    }
    const resolvedId = targetId || openId || this._sessionTargets.get(sessionId)?.openId || ''
    const resolvedOpenId = typeof resolvedId === 'string' ? resolvedId.trim() : ''
    if (!resolvedOpenId) {
      throw new Error('targetId 不能为空')
    }
    if (sessionId) {
      this._agentSessionManager.assertSessionImBindingAllowed(sessionId, 'feishu')
      this._assertSessionTargetAllowed(sessionId, resolvedOpenId, displayName)
    }
    const receiveIdType = targetType === 'chat' ? 'chat_id' : 'open_id'
    const bindChatType = targetType === 'chat' ? 'group' : 'p2p'
    const messageId = await this._api.sendTextMessage(receiveIdType, resolvedOpenId, content)
    if (sessionId) {
      this.bindTarget(sessionId, { targetId: resolvedOpenId, targetType: bindChatType, displayName })
      this._clearProactiveRebindSuppressionForSender(resolvedOpenId)
    }
    return { success: true, messageId, targetId: resolvedOpenId }
  }

  _resolveMapKeyForSession(sessionId) {
    for (const [key, sid] of this._sessionMapper.sessionMap) {
      if (sid === sessionId) return key
    }
    return null
  }

  _clearProactiveRebindSuppressionForSender(senderId) {
    if (!senderId) return
    for (const key of this._proactiveRebindSuppressedKeys) {
      if (key.startsWith(`${senderId}:`)) {
        this._proactiveRebindSuppressedKeys.delete(key)
      }
    }
  }

  async _findBoundSessionIdBySenderId(senderId, { allowDatabaseFallback = true } = {}) {
    const normalizedSenderId = typeof senderId === 'string' ? senderId.trim() : ''
    if (!normalizedSenderId) return null
    if (this._proactiveRebindSuppressedKeys.has(`${normalizedSenderId}:${normalizedSenderId}`)) {
      return null
    }
    const sessionId = this._targetSessionMap.get(normalizedSenderId)
    if (sessionId) {
      const liveSession = this._agentSessionManager.sessions.get(sessionId)
      const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
      if (liveSession || (row && row.status !== 'closed')) {
        this._restoreP2PTargetBinding(sessionId, normalizedSenderId, {
          chatId: typeof row?.conversation_id === 'string' ? row.conversation_id.trim() : ''
        })
        return sessionId
      }
      this._targetSessionMap.delete(normalizedSenderId)
      this._sessionTargets.delete(sessionId)
    }

    if (!allowDatabaseFallback || typeof this._sessionDatabase?.listAllAgentConversations !== 'function') {
      return null
    }

    try {
      const rows = this._sessionDatabase.listAllAgentConversations({
        limit: Math.max(this.config?.maxHistorySessions || 5, 20)
      })
      const matched = Array.isArray(rows)
        ? rows
          .filter(row => row?.status !== 'closed')
          .filter(row => row?.im_channel === 'feishu')
          .filter(row => row?.staff_id === normalizedSenderId)
          .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))[0]
        : null
      if (!matched) return null
      const fallbackSessionId = matched.session_id || matched.sessionId || matched.id || null
      if (!fallbackSessionId) return null
      this._restoreP2PTargetBinding(fallbackSessionId, normalizedSenderId, {
        chatId: typeof matched?.conversation_id === 'string' ? matched.conversation_id.trim() : ''
      })
      return fallbackSessionId
    } catch {
      return null
    }
  }

  _restoreP2PTargetBinding(sessionId, openId, { chatId = '', displayName = '' } = {}) {
    const resolvedOpenId = typeof openId === 'string' ? openId.trim() : ''
    if (!sessionId || !resolvedOpenId) return null
    const currentTarget = this._sessionTargets.get(sessionId)
    const currentIdentity = this._sessionIdentities.get(sessionId)
    const resolvedDisplayName = displayName || currentTarget?.displayName || currentIdentity?.senderName || resolvedOpenId
    const target = {
      openId: resolvedOpenId,
      displayName: resolvedDisplayName
    }
    this._sessionTargets.set(sessionId, target)
    this._targetSessionMap.set(resolvedOpenId, sessionId)
    this._sessionIdentities.set(sessionId, {
      senderId: resolvedOpenId,
      senderName: resolvedDisplayName,
      chatId: chatId || null,
      chatType: 'p2p',
      chatName: resolvedDisplayName,
    })
    return target
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
    return extractImagePaths(obj, depth)
  }

  _normalizePath(rawPath) {
    return normalizePath(rawPath)
  }

  // ─── 辅助 ───

  _getHelpText() {
    return buildImCommandHelpText({
      title: '飞书 Agent 桥接命令:',
      includeDirectoryArg: true,
      includeHistoryHint: true,
    })
  }

  async _sendHelpMenu(receiveIdType, receiveId, context = null) {
    const text = this._getHelpText()
    await this._api.sendTextMessage(receiveIdType, receiveId, text)
  }

  async _sendStatusMenu(receiveIdType, receiveId, { mapKey, chatId, context = null }) {
    let currentSessionId = mapKey ? this._sessionMapper.sessionMap.get(mapKey) : null
    if (!currentSessionId && context?.chatType === 'p2p' && context?.senderId) {
      currentSessionId = await this._findBoundSessionIdBySenderId(context.senderId)
    }
    const history = context?.senderId && chatId
      ? this._mergeCurrentSessionIntoHistory(
          await this._sessionMapper._queryHistorySessions({
            userId: context.senderId,
            chatId,
            chatType: context.chatType || 'p2p',
          }),
          currentSessionId,
          {
            senderId: context.senderId,
            senderName: context.senderName || null,
            chatId,
            chatType: context.chatType || 'p2p',
            chatName: context.chatName || null,
          }
        )
      : []
    const statusText = Array.isArray(history) && history.length > 0
      ? this._buildHistoryChoiceMenuText(history, currentSessionId, {
          title: '当前会话状态：',
          includeActionHint: false,
          includeNewSessionHint: false,
        })
      : buildNoHistoryText()
    await this._api.sendTextMessage(receiveIdType, receiveId, statusText)
  }

  async _sendCloseResult(receiveIdType, receiveId, { closeText, context = null }) {
    await this._api.sendTextMessage(receiveIdType, receiveId, closeText)
  }

  async _sendHistoryChoiceMenu(receiveIdType, receiveId, sessions, currentSessionId, fallbackText, context = null) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      await this._api.sendTextMessage(receiveIdType, receiveId, fallbackText || '没有历史会话记录')
      return
    }

    await this._api.sendTextMessage(receiveIdType, receiveId, fallbackText || this._buildHistoryChoiceMenuText(sessions, currentSessionId))
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

  _buildHistoryChoiceMenuText(sessions, currentSessionId = null, options = {}) {
    return buildHistoryChoiceMenuText({
      sessions,
      currentSessionId,
      maxSessions: 10,
      getDirName: (rawPath) => this._basename(rawPath),
      getProfileName: (profileId) => profileId
        ? (this._config?.getAPIProfile?.(profileId)?.name || '未知配置')
        : '默认配置',
      isSessionActivated: (sessionId) => !!this._agentSessionManager.sessions.get(sessionId)?.queryGenerator,
      title: options.title || '您有以下历史会话，请回复数字选择：',
      includeActionHint: options.includeActionHint !== false,
      includeNewSessionHint: options.includeNewSessionHint !== false,
    })
  }









  _formatRelativeTime(timestamp) {
    return formatRelativeTime(timestamp)
  }

  _clearSessionIdentity(sessionId) {
    clearSessionMappingsForSession({
      sessionMap: this._sessionMapper.sessionMap,
      sessionId,
      deleteEntry: (mapKey) => this._sessionMapper.clearSessionState(mapKey),
    })
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
    return resolveCommandCwd({
      args,
      outputBaseDir: this._agentSessionManager._getOutputBaseDir(),
      imSubdir: 'feishu',
    })
  }
}

module.exports = { FeishuBridge }

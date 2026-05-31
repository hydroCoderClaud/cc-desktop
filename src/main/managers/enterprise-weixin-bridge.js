/**
 * 企业微信 Bridge
 *
 * 第一批目标：
 * - 文本消息接入
 * - 历史会话选择闭环
 * - /help /status /sessions /new
 * - 基础流式回复
 * - 桌面端介入文本回传
 *
 * 第二批（后续）：
 * - 入站图片下载解密
 * - 主动发送 target 列表 / toolbar
 * - 图片双向回传
 */

const path = require('path')
const os = require('os')
const fs = require('fs')
const { generateReqId, MessageType } = require('@wecom/aibot-node-sdk')
const { ImFrontendNotifier } = require('./im-frontend-notifier')
const { ImReplyCollector } = require('./im-reply-collector')
const { ImSessionMapper } = require('./im-session-mapper')
const {
  listChatSessions,
  createActivatedSessionMatcher,
  isMappedCurrentSession,
  deleteSessionMappingsByPrefix,
  clearSessionMappingsForSession,
} = require('./im-session-selectors')
const {
  buildHistoryChoiceMenuText,
  buildActiveSessionsText,
} = require('./im-command-presenter')
const {
  buildSharedSessionsText,
  resolveCloseCommand,
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
const { extractImagePaths } = require('./im-utils')

const MAX_TEXT_LENGTH = 6000
const MSG_ID_TTL = 10 * 60 * 1000
const DEFAULT_HISTORY_LIMIT = 5
const HISTORY_CHOICE_TIMEOUT = 10 * 60 * 1000
const ENTERPRISE_WEIXIN_UNSUPPORTED_MESSAGE_TEXT = '暂不支持该类型的企业微信消息，请发送文本或图片消息'
const ENTERPRISE_WEIXIN_IMAGE_DIR = 'enterprise-weixin'

class EnterpriseWeixinBridge {
  constructor(configManager, agentSessionManager, mainWindow) {
    this._configManager = configManager
    this._agentSessionManager = agentSessionManager
    this._mainWindow = mainWindow
    this._imType = 'enterprise-weixin'
    this._configKey = 'enterpriseWeixin'

    this._wsClient = null
    this._connected = false
    this._sessionDatabase = agentSessionManager.sessionDatabase
    this._startPromise = null

    this._notifier = new ImFrontendNotifier(mainWindow, this._imType)
    this._replyCollector = new ImReplyCollector({ maxTextLength: MAX_TEXT_LENGTH })
    this._sessionMapper = this._createSessionMapper(this._getConfig())

    this._processedMsgIds = new Map()
    this._msgIdCleanupTimer = null
    this._agentListeners = null
    this._wsListeners = null

    this._processQueues = new Map()
    this._sessionIdentities = new Map()
    this._sessionTargets = new Map()
    this._targetSessionMap = new Map()
    this._pendingInboundMessages = new Map()
    this._activeSendChunks = new Map()
    this._desktopPendingImagePaths = new Map()
    this._proactiveRebindSuppressedKeys = new Set()

    this._bindAgentEvents()
  }

  _syncSessionDatabase() {
    const db = this._agentSessionManager?.sessionDatabase || null
    this._sessionDatabase = db
    if (this._sessionMapper) {
      this._sessionMapper._sessionDatabase = db
    }
  }

  _getConfig() {
    const config = this._configManager.getConfig()
    return config?.enterpriseWeixin || {}
  }

  _createSessionMapper(cfg = this._getConfig()) {
    return new ImSessionMapper({
      agentSessionManager: this._agentSessionManager,
      sessionDatabase: this._agentSessionManager.sessionDatabase,
      imType: this._imType,
      maxHistorySessions: cfg.maxHistorySessions || DEFAULT_HISTORY_LIMIT,
      defaultCwd: cfg.defaultCwd || null,
      buildIdentityKey: (identity) => {
        const userId = identity.userId || ''
        const channelId = identity.channelId || identity.chatId || identity.userId || ''
        return `${userId}:${channelId}`
      },
      buildSessionTitle: (identity) => `企业微信 · ${identity.nickname || identity.userId || '未命名'}`,
    })
  }

  getStatus() {
    return {
      connected: !!this._connected,
      activeSessions: this._sessionMapper?.sessionMap?.size || 0,
    }
  }

  setMainWindow(win) {
    this._mainWindow = win
    this._notifier.setMainWindow(win)
  }

  async start() {
    this._syncSessionDatabase()
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

    if (this._connected && this._wsClient) {
      return true
    }

    if (this._startPromise) {
      return this._startPromise
    }

    this._startPromise = (async () => {
      if (this._wsClient && !this._connected) {
        await this.stop()
      }

      this._sessionMapper = this._createSessionMapper(config)
      this._restoreSessionBindings()

      try {
        await this._connect(botId, secret)
        this._startMsgIdCleanup()
        console.log('[EnterpriseWeixin] Bridge started successfully')
        return true
      } catch (err) {
        try {
          this._unbindWsEvents()
          if (this._wsClient) {
            try { this._wsClient.disconnect() } catch {}
            this._wsClient = null
          }
          this._connected = false
          this._stopMsgIdCleanup()
          this._notifier.notifyStatusChange({ connected: false })
        } catch {}
        console.error('[EnterpriseWeixin] Failed to start:', err.message)
        this._notifier.notifyError({ error: err.message })
        return false
      } finally {
        this._startPromise = null
      }
    })()

    return this._startPromise
  }

  async stop() {
    this._stopMsgIdCleanup()
    this._unbindWsEvents()
    this._replyCollector.clearAll()
    this._sessionMapper.clearAll()
    this._processQueues.clear()
    this._processedMsgIds.clear()
    this._pendingInboundMessages.clear()
    this._activeSendChunks.clear()
    this._desktopPendingImagePaths.clear()
    this._proactiveRebindSuppressedKeys.clear()

    if (this._wsClient) {
      try { this._wsClient.disconnect() } catch {}
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

  async _connect(botId, secret) {
    const { WSClient } = require('@wecom/aibot-node-sdk')
    this._wsClient = new WSClient({ botId, secret })
    this._bindWsEvents()
    await new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        try { this._wsClient?.off('authenticated', onAuthenticated) } catch {}
        try { this._wsClient?.off('error', onError) } catch {}
      }
      const onAuthenticated = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve(true)
      }
      const onError = (err) => {
        if (settled) return
        settled = true
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }

      this._wsClient.on('authenticated', onAuthenticated)
      this._wsClient.on('error', onError)
      try {
        this._wsClient.connect()
      } catch (err) {
        onError(err)
      }
    })
  }

  _bindWsEvents() {
    this._unbindWsEvents()
    if (!this._wsClient) return

    const onMessage = (frame) => {
      this._handleMessage(frame).catch(err => {
        console.error('[EnterpriseWeixin] Message handling error:', err.message)
      })
    }
    const onEvent = (frame) => {
      this._handleEvent(frame).catch(err => {
        console.error('[EnterpriseWeixin] Event handling error:', err.message)
      })
    }
    const onConnected = () => {
      this._connected = true
      this._notifier.notifyStatusChange({ connected: true })
      console.log('[EnterpriseWeixin] WS connected')
    }
    const onDisconnected = (reason) => {
      this._connected = false
      this._notifier.notifyStatusChange({ connected: false })
      console.log('[EnterpriseWeixin] WS disconnected:', reason || '')
    }
    const onError = (err) => {
      console.error('[EnterpriseWeixin] WS error:', err?.message || err)
      this._notifier.notifyError({ error: err?.message || String(err) })
    }

    this._wsClient.on('message', onMessage)
    this._wsClient.on('event', onEvent)
    this._wsClient.on('connected', onConnected)
    this._wsClient.on('authenticated', onConnected)
    this._wsClient.on('disconnected', onDisconnected)
    this._wsClient.on('error', onError)

    this._wsListeners = { onMessage, onEvent, onConnected, onDisconnected, onError }
  }

  _unbindWsEvents() {
    if (!this._wsClient || !this._wsListeners) return
    this._wsClient.off('message', this._wsListeners.onMessage)
    this._wsClient.off('event', this._wsListeners.onEvent)
    this._wsClient.off('connected', this._wsListeners.onConnected)
    this._wsClient.off('authenticated', this._wsListeners.onConnected)
    this._wsClient.off('disconnected', this._wsListeners.onDisconnected)
    this._wsClient.off('error', this._wsListeners.onError)
    this._wsListeners = null
  }

  _bindAgentEvents() {
    const mgr = this._agentSessionManager
    this._agentListeners = {
      userMessage: ({ sessionId, imChannel, content, images, source }) => {
        if (!this._isLiveSession(sessionId)) {
          this._clearSessionIdentity(sessionId)
          return
        }
        const hasBinding = this._sessionTargets.has(sessionId)
        if (source !== 'im-inbound' && (imChannel === this._imType || hasBinding)) {
          this._onDesktopIntervention(sessionId, content, images)
        }
      },
      agentMessage: (sessionId, message) => {
        this._onAgentMessage(sessionId, message)
      },
      agentResult: (sessionId) => {
        return this._onAgentResult(sessionId)
      },
      agentError: (sessionId) => {
        this._activeSendChunks.delete(sessionId)
        this._desktopPendingImagePaths.delete(sessionId)
        this._replyCollector.clear(sessionId)
      },
      agentInterrupted: (sessionId, details) => {
        const reason = typeof details?.reason === 'string' ? details.reason : ''
        if (reason === 'user-cancel' || reason === 'host-cleanup') {
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

  async _handleMessage(frame) {
    this._syncSessionDatabase()
    const normalizedMessage = await this._normalizeInboundMessage(frame)
    const message = await this._hydrateInboundImages(normalizedMessage)
    if (!message?.msgId) return

    if (this._processedMsgIds.has(message.msgId)) return
    this._processedMsgIds.set(message.msgId, Date.now())

    const identity = this._buildIdentity(message)
    const mapKey = this._sessionMapper.buildKey(identity)

    if (message.unsupported) {
      await this._sendTextReply(frame, ENTERPRISE_WEIXIN_UNSUPPORTED_MESSAGE_TEXT)
      return
    }

    const pendingChoice = this._sessionMapper._pendingChoices.get(mapKey)
    if (pendingChoice) {
      const normalizedPendingText = (message.text || '').trim()
      if (normalizedPendingText) {
        await this._handlePendingChoice(frame, message, identity, mapKey)
        return
      }
    }

    const normalizedText = (message.text || '').trim()
    if (normalizedText.startsWith('/')) {
      await this._handleCommand(normalizedText, {
        frame,
        identity,
        chatId: message.chatId,
        chatType: message.chatType,
      })
      return
    }

    let currentSessionId = await resolveStrictCurrentSessionId(this._sessionMapper, mapKey)
    const currentSession = currentSessionId ? this._agentSessionManager.sessions.get(currentSessionId) : null
    if (currentSession?.status === 'streaming') {
      await this._sendTextReply(frame, 'AI 正在响应中，请等待完成后再发送下一条消息')
      return
    }

    let ensured = currentSessionId
      ? { action: 'use_current', sessionId: currentSessionId, mapKey }
      : await ensureHistoryChoiceOrCurrent({
        sessionMapper: this._sessionMapper,
        mapKey,
        identity,
        resolveBoundSessionId: async () => {
          if (identity.chatType !== 'single' || this._proactiveRebindSuppressedKeys.has(mapKey)) return null
          const boundSessionId = this._findBoundSessionIdByUserId(identity.userId)
          if (!boundSessionId) return null
          this._proactiveRebindSuppressedKeys.delete(mapKey)
          this._sessionIdentities.set(boundSessionId, {
            userId: identity.userId,
            senderId: identity.userId,
            senderName: identity.nickname || identity.userId,
            chatId: message.chatId,
            chatType: message.chatType,
            chatName: identity.channelName || identity.nickname || identity.userId,
          })
          return boundSessionId
        },
      })
    if (ensured?.action === 'show_choice') {
      this._pendingInboundMessages.set(mapKey, { frame, message, identity })
      this._sessionMapper.initPendingChoice(
        mapKey,
        ensured.sessions,
        (menuText) => this._sendTextReply(frame, menuText),
        {
          timeoutMs: HISTORY_CHOICE_TIMEOUT,
          menuBuilder: (historySessions) => this._buildHistoryChoiceMenu(historySessions),
        }
      ).catch((err) => {
        console.error('[EnterpriseWeixin] initPendingChoice failed:', err?.message || err)
      })
      return
    }

    const sessionId = ensured?.sessionId || null
    if (!sessionId) return

    this._sessionIdentities.set(sessionId, {
      userId: identity.userId,
      senderId: identity.userId,
      senderName: identity.nickname || identity.userId,
      chatId: message.chatId,
      chatType: message.chatType,
      chatName: identity.channelName || identity.nickname || identity.userId,
    })
    this._notifier.notifyMessageReceived({
      sessionId,
      senderNick: identity.nickname || identity.userId,
      text: message.text || (message.images?.length ? '[图片]' : ''),
      images: message.images,
      imagesCount: Array.isArray(message.images) ? message.images.length : 0,
    })
    await this._enqueueInboundMessage(sessionId, frame, message, identity)
  }

  async _handleEvent(frame) {
    const event = frame?.body?.event
    const eventType = event?.eventtype
    if (!eventType) return

    if (eventType === 'enter_chat') {
      await this._handleEnterChat(frame)
      return
    }

    if (eventType === 'disconnected_event') {
      this._connected = false
      this._notifier.notifyStatusChange({ connected: false })
      console.warn('[EnterpriseWeixin] Received disconnected_event from server')
      return
    }

    console.log('[EnterpriseWeixin] Event received:', eventType)
  }

  async _handleEnterChat(frame) {
    const helpText = this._buildHelpText()
    try {
      await this._wsClient.replyWelcome(frame, {
        msgtype: 'text',
        text: {
          content: `您好，我已连接到水利桌面智能体。\n\n${helpText}`,
        },
      })
    } catch (err) {
      console.error('[EnterpriseWeixin] Failed to send welcome message:', err.message)
    }
  }

  async _normalizeInboundMessage(frame) {
    const body = frame?.body || {}
    const msgType = body?.msgtype || 'text'
    const senderName = await this._resolveInboundSenderName(body)
    const base = {
      frame,
      raw: body,
      msgId: body?.msgid || '',
      msgType,
      chatId: body?.chatid || body?.from?.userid || '',
      chatType: body?.chattype || 'single',
      userId: body?.from?.userid || '',
      senderName,
      text: '',
      images: [],
      unsupported: false,
    }

    if (msgType === MessageType.Text || msgType === 'text') {
      return {
        ...base,
        text: body?.text?.content || '',
      }
    }

    if (msgType === MessageType.Mixed || msgType === 'mixed') {
      const items = Array.isArray(body?.mixed?.msg_item) ? body.mixed.msg_item : []
      return {
        ...base,
        text: items
          .filter(item => item?.msgtype === 'text')
          .map(item => item?.text?.content || '')
          .join(''),
        imageItems: items
          .filter(item => item?.msgtype === 'image' && item?.image?.url)
          .map(item => item.image),
      }
    }

    if (msgType === MessageType.Image || msgType === 'image') {
      return {
        ...base,
        imageItems: body?.image?.url ? [body.image] : [],
      }
    }

    return {
      ...base,
      unsupported: true,
    }
  }

  _buildIdentity(message) {
    const isGroup = String(message.chatType || '').toLowerCase() === 'group'
    return {
      userId: message.userId,
      channelId: isGroup ? (message.chatId || message.userId) : message.userId,
      chatId: message.chatId,
      chatType: message.chatType,
      nickname: message.senderName || message.userId,
      channelName: isGroup ? (message.chatId || '') : '',
    }
  }

  async _resolveInboundSenderName(body) {
    const directName = [
      body?.from?.name,
      body?.from?.displayName,
      body?.from?.nickname,
      body?.from?.nick,
      body?.from?.alias,
    ]
      .find(value => typeof value === 'string' && value.trim())
    if (directName) return directName.trim()

    const userId = typeof body?.from?.userid === 'string' ? body.from.userid.trim() : ''
    return userId
  }

  async _handlePendingChoice(frame, message, identity, mapKey) {
    const text = String(message.text || '').trim()
    if (!text) return

    if (text === '/new') {
      await this._handleCommand('/new', { frame, identity, chatId: message.chatId, chatType: message.chatType }, {
        preservePendingSelection: true,
      })
      return
    }

    const result = await this._sessionMapper.handleChoice(mapKey, text, identity)
    if (result?.invalidChoice) {
      await this._sendTextReply(frame, `编号错误：请输入 0-${this._sessionMapper._pendingChoices.get(mapKey)?.sessions?.length || 0} 之间的数字\n\n${result.menuText}`)
      return
    }

    const sessionId = result?.sessionId || null
    if (!sessionId) {
      await this._sendTextReply(frame, '没有可用会话，请重新发送消息')
      return
    }

    this._sessionIdentities.set(sessionId, {
      userId: identity.userId,
      senderId: identity.userId,
      senderName: identity.nickname || identity.userId,
      chatId: identity.chatId,
      chatType: identity.chatType,
      chatName: identity.channelName || identity.nickname || identity.userId,
    })
    this._notifier.notifySessionCreated({
      sessionId,
      nickname: identity.nickname || identity.userId,
    })

    if (result.action === 'resume') {
      this._proactiveRebindSuppressedKeys.delete(mapKey)
      await this._sendTextReply(frame, result.wasActivated ? buildAlreadyConnectedText(result.selectedSession?.title || result.sessionId) : buildSessionActivatingText())
    } else if (result.action === 'new') {
      this._proactiveRebindSuppressedKeys.delete(mapKey)
      await this._sendTextReply(frame, buildSessionCreatingText())
    }

    const pending = this._pendingInboundMessages.get(mapKey)
    await runResumePostAction({
      pendingMessage: pending,
      clearPendingMessage: () => this._pendingInboundMessages.delete(mapKey),
      wasActivated: result.wasActivated,
      notifyMessageReceived: () => {
        this._notifier.notifyMessageReceived({
          sessionId,
          senderNick: identity.nickname || identity.userId,
          text: 'hello',
        })
      },
      replayPendingMessage: async (pendingSelection) => {
        this._notifier.notifyMessageReceived({
          sessionId,
          senderNick: identity.nickname || identity.userId,
          text: pendingSelection.message.text || (pendingSelection.message.images?.length ? '[图片]' : ''),
          images: pendingSelection.message.images,
          imagesCount: Array.isArray(pendingSelection.message.images) ? pendingSelection.message.images.length : 0,
        })
        await this._enqueueInboundMessage(sessionId, pendingSelection.frame, pendingSelection.message, identity)
      },
      enqueueHello: async () => {
        await this._enqueueInboundMessage(sessionId, frame, {
          msgId: `choice-resume-${Date.now()}`,
          chatId: identity.chatId,
          chatType: identity.chatType,
          text: 'hello',
          images: [],
        }, identity)
      },
    })
  }

  async _handleCommand(text, context, options = {}) {
    this._syncSessionDatabase()
    const normalizedText = String(text || '').trim()
    const identity = context.identity
    const chatId = context.chatId || identity.chatId
    const mapKey = this._sessionMapper.buildKey(identity)

    let sessionId = await this._resolveCommandSessionId(mapKey, identity)
    const currentSession = sessionId ? this._agentSessionManager.sessions.get(sessionId) : null

    await dispatchImCommand({
      text: normalizedText,
      beforeExecute: () => {
        if (!options.preservePendingSelection) {
          this._sessionMapper.clearPendingChoice(mapKey)
          this._pendingInboundMessages.delete(mapKey)
        }
      },
      handlers: {
        help: async () => {
          await this._sendTextReply(context.frame, this._buildHelpText())
        },
        status: async () => {
          const identityState = this._sessionIdentities.get(sessionId) || identity
          const history = this._mergeCurrentSessionIntoHistory(
            await this._sessionMapper._queryHistorySessions({
              userId: identityState.userId || identityState.senderId || '',
              chatId,
              chatType: identityState.chatType || 'single',
            }),
            sessionId,
            identityState
          )
          const statusText = Array.isArray(history) && history.length > 0
            ? this._buildHistoryChoiceMenu(history, sessionId, {
                title: '当前会话状态：',
                includeActionHint: false,
                includeNewSessionHint: false,
              })
            : buildNoHistoryText()
          await this._sendTextReply(context.frame, statusText)
        },
        sessions: async () => {
          await this._sendTextReply(context.frame, this._buildSessionsMenuText(chatId, sessionId))
        },
        close: async ({ args }) => {
          const closeDecision = resolveCloseCommand({
            args,
            activeSessions: this._getActiveSessionsByChat(chatId),
            currentSessionId: sessionId,
            getSessionById: (targetSessionId) => this._agentSessionManager.sessions.get(targetSessionId) || null,
          })
          if (closeDecision.action === 'invalid_index') {
            await this._sendTextReply(
              context.frame,
              `编号错误：请输入 1-${closeDecision.max} 之间的数字\n\n使用 /sessions 查看会话列表`
            )
            return
          }
          if (closeDecision.action === 'missing_current') {
            await this._sendTextReply(context.frame, '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话')
            return
          }
          if (closeDecision.action === 'streaming') {
            await this._sendTextReply(context.frame, 'AI 正在响应中，请等待完成后再关闭')
            return
          }

          await this._agentSessionManager.close(closeDecision.targetSessionId)
          this._clearSessionIdentity(closeDecision.targetSessionId)
          if ((context.chatType || '').toLowerCase() === 'single') {
            this._proactiveRebindSuppressedKeys.add(mapKey)
          }
          this._notifier.notifySessionClosed({ sessionId: closeDecision.targetSessionId })

          await this._sendTextReply(context.frame, closeDecision.closeText)
        },
        new: async ({ args }) => {
          if (currentSession?.status === 'streaming') {
            await this._sendTextReply(context.frame, 'AI 正在响应中，请等待完成后再操作')
            return
          }
          let cwd
          try {
            cwd = resolveCommandCwd({
              args,
              outputBaseDir: this._agentSessionManager._getOutputBaseDir(),
              imSubdir: this._imType,
            })
          } catch (err) {
            await this._sendTextReply(context.frame, err.message)
            return
          }
          if (sessionId) {
            this._clearSessionIdentity(sessionId)
          }
          this._proactiveRebindSuppressedKeys.delete(mapKey)
          const newId = await this._sessionMapper.createSession(identity, { cwd })
          if (!newId) {
            await this._sendTextReply(context.frame, '创建新会话失败')
            return
          }
          this._sessionMapper.sessionMap.set(mapKey, newId)
          this._sessionIdentities.set(newId, {
            userId: identity.userId,
            senderId: identity.userId,
            senderName: identity.nickname || identity.userId,
            chatId: identity.chatId,
            chatType: identity.chatType,
            chatName: identity.channelName || identity.nickname || identity.userId,
          })
          this._notifier.notifySessionCreated({ sessionId: newId, nickname: identity.nickname || identity.userId })
          await this._sendTextReply(context.frame, buildSessionCreatingText())
          await activateNewSession({
            sessionId: newId,
            notifyMessageReceived: () => {
              this._notifier.notifyMessageReceived({
                sessionId: newId,
                senderNick: identity.nickname || identity.userId,
                text: 'hello',
              })
            },
            enqueueHello: async () => {
              await this._enqueueInboundMessage(newId, context.frame, {
                msgId: `cmd-new-${Date.now()}`,
                chatId,
                chatType: identity.chatType,
                text: 'hello',
                images: [],
              }, identity)
            },
          })
        },
        resume: async ({ args }) => {
          if (currentSession?.status === 'streaming') {
            await this._sendTextReply(context.frame, 'AI 正在响应中，请等待完成后再操作')
            return
          }

          const currentSessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)

          let history = await this._sessionMapper._queryHistorySessions(identity)
          history = this._mergeCurrentSessionIntoHistory(history, currentSessionId, identity)
          if (!history || history.length === 0) {
            await this._sendTextReply(context.frame, buildNoHistoryText())
            return
          }

          if (args.length > 0) {
            const selection = resolveResumeSelection({
              history,
              selectedIndex: args[0],
              currentSessionId,
              currentSession,
            })
            if (selection.action === 'invalid_index') {
              await this._sendTextReply(context.frame, `编号错误：请输入 1-${selection.max} 之间的数字`)
              return
            }
            if (selection.action === 'already_connected') {
              await this._sendTextReply(context.frame, buildAlreadyConnectedText(selection.selected?.title || selection.sessionId))
              return
            }

            this._sessionMapper.clearPendingChoice(mapKey)
            const result = await this._sessionMapper.handleDirectChoice(mapKey, history, String(selection.index), identity, {
              timeoutMs: HISTORY_CHOICE_TIMEOUT,
              menuBuilder: (sessions) => this._buildHistoryChoiceMenu(sessions, currentSessionId),
            })
            if (!result?.sessionId) {
              await this._sendTextReply(context.frame, '无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话')
              return
            }

            this._sessionIdentities.set(result.sessionId, {
              userId: identity.userId,
              senderId: identity.userId,
              senderName: identity.nickname || identity.userId,
              chatId: identity.chatId,
              chatType: identity.chatType,
              chatName: identity.channelName || identity.nickname || identity.userId,
            })
            this._proactiveRebindSuppressedKeys.delete(mapKey)
            this._notifier.notifySessionCreated({ sessionId: result.sessionId, nickname: identity.nickname || identity.userId })
            await this._sendTextReply(
              context.frame,
              result.wasActivated
                ? buildSessionSwitchedText(result.selectedSession?.title || result.sessionId)
                : buildSessionActivatingText()
            )
            await activateNewSession({
              sessionId: result.sessionId,
              wasActivated: result.wasActivated,
              notifyMessageReceived: () => {
                this._notifier.notifyMessageReceived({
                  sessionId: result.sessionId,
                  senderNick: identity.nickname || identity.userId,
                  text: 'hello',
                })
              },
              enqueueHello: async () => {
                await this._enqueueInboundMessage(result.sessionId, context.frame, {
                  msgId: `cmd-resume-${Date.now()}`,
                  chatId,
                  chatType: identity.chatType,
                  text: 'hello',
                  images: [],
                }, identity)
              },
            })
            return
          }

          await this._sessionMapper.initPendingChoice(
            mapKey,
            history,
            (menuText) => this._sendTextReply(context.frame, menuText),
            {
              timeoutMs: HISTORY_CHOICE_TIMEOUT,
              menuBuilder: (sessions) => this._buildHistoryChoiceMenu(sessions, currentSessionId),
            }
          )
        },
        rename: async ({ args }) => {
          const renameDecision = resolveRenameCommand({
            args,
            currentSessionId: sessionId,
          })
          if (renameDecision.action === 'missing_current') {
            await this._sendTextReply(context.frame, buildRenameMissingSessionText())
            return
          }
          if (renameDecision.action === 'missing_title') {
            await this._sendTextReply(context.frame, buildRenamePromptText())
            return
          }
          this._agentSessionManager.rename(renameDecision.sessionId, renameDecision.newTitle)
          await this._sendTextReply(context.frame, buildRenameSuccessText(renameDecision.newTitle))
        },
      },
      onUnknown: async ({ rawCommand }) => {
        await this._sendTextReply(context.frame, buildUnknownCommandText(rawCommand))
      },
    })
  }

  async _resolveCommandSessionId(mapKey, identity) {
    return resolveStrictCurrentSessionId(this._sessionMapper, mapKey)
  }

  _findBoundSessionIdByUserId(userId) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''
    if (!normalizedUserId) return null

    const isSessionAvailable = (sessionId) => {
      if (!sessionId) return false
      const liveSession = this._agentSessionManager.sessions.get(sessionId)
      if (liveSession) return true
      const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
      return Boolean(row && row.status !== 'closed')
    }

    const directSessionId = this._targetSessionMap.get(normalizedUserId)
    if (isSessionAvailable(directSessionId)) {
      return directSessionId
    }
    if (directSessionId) {
      this._targetSessionMap.delete(normalizedUserId)
      this._sessionTargets.delete(directSessionId)
    }

    for (const [sessionId, target] of this._sessionTargets.entries()) {
      if (target?.userId !== normalizedUserId) continue
      if (!isSessionAvailable(sessionId)) {
        this._sessionTargets.delete(sessionId)
        continue
      }
      this._targetSessionMap.set(normalizedUserId, sessionId)
      return sessionId
    }

    for (const [sessionId, session] of this._agentSessionManager.sessions.entries()) {
      const targetUserId = typeof session?.meta?.staffId === 'string'
        ? session.meta.staffId.trim()
        : ''
      if (targetUserId !== normalizedUserId) continue
      this._sessionTargets.set(sessionId, {
        userId: normalizedUserId,
        displayName: this._sessionTargets.get(sessionId)?.displayName || normalizedUserId,
      })
      this._targetSessionMap.set(normalizedUserId, sessionId)
      return sessionId
    }

    const rows = this._sessionDatabase?.listAllAgentConversations?.({
      limit: Math.max(this._getConfig().maxHistorySessions || DEFAULT_HISTORY_LIMIT, 20),
    })
    const matched = Array.isArray(rows)
      ? rows
        .filter(row => row?.status !== 'closed')
        .filter(row => row?.im_channel === this._imType)
        .filter(row => row?.staff_id === normalizedUserId)
        .filter(row => !row?.conversation_id || row?.conversation_id === normalizedUserId)
        .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))[0]
      : null
    if (matched) {
      const fallbackSessionId = matched.session_id || matched.sessionId || matched.id || null
      if (fallbackSessionId) {
        this._targetSessionMap.set(normalizedUserId, fallbackSessionId)
        this._sessionTargets.set(fallbackSessionId, {
          userId: normalizedUserId,
          displayName: this._sessionTargets.get(fallbackSessionId)?.displayName || normalizedUserId,
        })
        return fallbackSessionId
      }
    }

    return null
  }

  _getActiveSessionsByChat(chatId) {
    const chatKey = String(chatId || '').trim()
    for (const session of this._agentSessionManager.sessions.values()) {
      if (session?.imChannel !== this._imType) continue
      this._restoreSessionIdentityFromDatabase(session.id)
    }
    const includeSession = createActivatedSessionMatcher({
      imType: this._imType,
      getImChannel: (session) => session?.imChannel,
      getChatId: (session) => this._sessionIdentities.get(session?.id)?.chatId || '',
      isActivated: (session) => !!session?.queryGenerator,
    })
    return listChatSessions({
      sessions: this._agentSessionManager.sessions.values(),
      chatId: chatKey,
      includeSession,
    })
  }

  _restoreSessionIdentityFromDatabase(sessionId) {
    if (!sessionId || this._sessionIdentities.has(sessionId)) return this._sessionIdentities.get(sessionId) || null

    const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
    const userId = typeof row?.staff_id === 'string' ? row.staff_id.trim() : ''
    if (!userId || row?.im_channel !== this._imType) return null

    const chatId = typeof row?.conversation_id === 'string' && row.conversation_id.trim()
      ? row.conversation_id.trim()
      : userId
    const displayName = this._sessionTargets.get(sessionId)?.displayName || userId
    const identity = {
      userId,
      senderId: userId,
      senderName: displayName,
      chatId,
      chatType: chatId !== userId ? 'group' : 'single',
      chatName: displayName,
    }
    this._sessionIdentities.set(sessionId, identity)
    return identity
  }

  _buildHelpText() {
    return buildImCommandHelpText({
      title: '企业微信可用命令：',
      includeDirectoryArg: true,
      includeHistoryHint: true,
    })
  }

  _buildSessionsMenuText(chatId, currentSessionId) {
    const activeSessions = this._getActiveSessionsByChat(chatId)
    return buildSharedSessionsText({
      activeSessions,
      currentSessionId,
      getDirName: (cwd) => this._getDirName(cwd),
      getProfileName: (profileId) => this._getProfileName(profileId),
    })
  }

  _buildHistoryChoiceMenu(sessions, currentSessionId = null, options = {}) {
    return buildHistoryChoiceMenuText({
      sessions,
      currentSessionId,
      maxSessions: this._getConfig().maxHistorySessions || DEFAULT_HISTORY_LIMIT,
      getDirName: (cwd) => this._getDirName(cwd),
      getProfileName: (profileId) => this._getProfileName(profileId),
      isSessionActivated: (sessionId) => !!this._agentSessionManager.sessions.get(sessionId)?.queryGenerator,
      title: options.title || '您有以下历史会话，请回复数字选择：',
      includeActionHint: options.includeActionHint !== false,
      includeNewSessionHint: options.includeNewSessionHint !== false,
    })
  }

  _getDirName(cwd) {
    if (!cwd) return '-'
    try {
      return path.basename(cwd) || cwd
    } catch {
      return cwd
    }
  }

  _getProfileName(profileId) {
    if (!profileId) return '默认配置'
    try {
      return this._configManager.getAPIProfile?.(profileId)?.name || profileId
    } catch {
      return profileId
    }
  }

  _mergeCurrentSessionIntoHistory(history, currentSessionId, identity = {}) {
    const rows = Array.isArray(history) ? history : []
    if (!currentSessionId) return rows

    const liveSession = this._agentSessionManager.sessions.get(currentSessionId)
    const dbRow = this._sessionDatabase?.getAgentConversation?.(currentSessionId)
    if (!liveSession && (!dbRow || dbRow.status === 'closed')) return rows

    const currentRow = {
      ...(dbRow || {}),
      session_id: dbRow?.session_id || liveSession?.id || currentSessionId,
      title: dbRow?.title || liveSession?.title || currentSessionId,
      cwd: dbRow?.cwd || liveSession?.cwd || null,
      api_profile_id: dbRow?.api_profile_id || liveSession?.apiProfileId || null,
      updated_at: dbRow?.updated_at || (liveSession?.updatedAt ? new Date(liveSession.updatedAt).getTime() : Date.now()),
      type: 'chat',
      source: 'im-inbound',
      im_channel: this._imType,
      staff_id: dbRow?.staff_id || identity.userId || '',
      conversation_id: dbRow?.conversation_id || identity.chatId || '',
      status: dbRow?.status || liveSession?.status || 'idle',
    }

    return mergeCurrentSessionIntoHistory({
      history: rows,
      currentSessionId,
      currentRow,
    })
  }

  async _sendTextReply(frame, content) {
    if (!this._wsClient || !frame?.headers?.req_id) return
    await this._wsClient.reply(frame, {
      msgtype: 'markdown',
      markdown: { content: String(content || '') },
    })
  }

  async _hydrateInboundImages(message) {
    const imageItems = Array.isArray(message?.imageItems) ? message.imageItems : []
    if (!this._wsClient || imageItems.length === 0) {
      return {
        ...message,
        images: Array.isArray(message?.images) ? message.images : [],
        imageItems: [],
        unsupported: !!message?.unsupported,
      }
    }

    const images = Array.isArray(message?.images) ? [...message.images] : []
    for (const image of imageItems) {
      const downloadedImage = await this._downloadInboundImage(image)
      if (downloadedImage) {
        images.push(downloadedImage)
      }
    }

    return {
      ...message,
      images,
      imageItems: [],
      unsupported: images.length === 0 && !String(message?.text || '').trim(),
    }
  }

  async _downloadInboundImage(image) {
    const url = typeof image?.url === 'string' ? image.url.trim() : ''
    if (!url || typeof this._wsClient?.downloadFile !== 'function') return null

    try {
      const { buffer, filename, contentType } = await this._wsClient.downloadFile(url, image?.aeskey)
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null

      return {
        base64: buffer.toString('base64'),
        mediaType: this._detectInboundImageMediaType(buffer, filename, contentType),
      }
    } catch (err) {
      console.error('[EnterpriseWeixin] Failed to download inbound image:', err.message)
      return null
    }
  }

  _detectInboundImageMediaType(buffer, filename, contentType) {
    const normalizedContentType = typeof contentType === 'string'
      ? contentType.split(';')[0].trim().toLowerCase()
      : ''
    if (normalizedContentType.startsWith('image/')) {
      return normalizedContentType
    }

    if (buffer?.length >= 12) {
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif'
      if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
      if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp'
    }

    const ext = path.extname(typeof filename === 'string' ? filename : '').toLowerCase()
    switch (ext) {
      case '.png': return 'image/png'
      case '.jpg':
      case '.jpeg': return 'image/jpeg'
      case '.gif': return 'image/gif'
      case '.webp': return 'image/webp'
      case '.bmp': return 'image/bmp'
      default: return 'image/png'
    }
  }

  _ensureTempAssetDir() {
    const rootDir = path.join(os.tmpdir(), 'hydro-desktop-im-assets', ENTERPRISE_WEIXIN_IMAGE_DIR)
    fs.mkdirSync(rootDir, { recursive: true })
    return rootDir
  }

  _resolveDownloadedFilename(filename, url) {
    const rawName = typeof filename === 'string' ? filename.trim() : ''
    if (rawName) return path.basename(rawName)

    try {
      const parsed = new URL(url)
      const fromPath = path.basename(parsed.pathname || '')
      if (fromPath) return fromPath
    } catch {}

    return 'image.bin'
  }

  async _uploadImageFile(imagePath) {
    if (!this._wsClient || typeof this._wsClient.uploadMedia !== 'function') return null
    if (typeof imagePath !== 'string' || !imagePath.trim()) return null

    try {
      const buffer = await fs.promises.readFile(imagePath)
      if (!buffer?.length) return null
      const result = await this._wsClient.uploadMedia(buffer, {
        type: 'image',
        filename: path.basename(imagePath) || 'image.png',
      })
      return result?.media_id || null
    } catch (err) {
      console.error('[EnterpriseWeixin] Failed to upload image:', imagePath, err.message)
      return null
    }
  }

  async _replyImages(frame, imagePaths = []) {
    if (!this._wsClient || typeof this._wsClient.replyMedia !== 'function') return
    for (const imagePath of imagePaths) {
      const mediaId = await this._uploadImageFile(imagePath)
      if (!mediaId) continue
      try {
        await this._wsClient.replyMedia(frame, 'image', mediaId)
      } catch (err) {
        console.error('[EnterpriseWeixin] Failed to reply image media:', imagePath, err.message)
      }
    }
  }

  async _sendImagesToChat(chatId, imagePaths = []) {
    if (!this._wsClient || typeof this._wsClient.sendMediaMessage !== 'function') return
    for (const imagePath of imagePaths) {
      const mediaId = await this._uploadImageFile(imagePath)
      if (!mediaId) continue
      try {
        await this._wsClient.sendMediaMessage(chatId, 'image', mediaId)
      } catch (err) {
        console.error('[EnterpriseWeixin] Failed to send proactive image media:', imagePath, err.message)
      }
    }
  }

  _enqueueInboundMessage(sessionId, frame, message, identity) {
    const prev = this._processQueues.get(sessionId) || Promise.resolve()
    const next = prev.then(() => this._processOneMessage(sessionId, frame, message, identity)).catch(err => {
      console.error(`[EnterpriseWeixin] Process error for session ${sessionId}:`, err.message)
    })
    this._processQueues.set(sessionId, next)
    return next
  }

  async _processOneMessage(sessionId, frame, message, identity) {
    const text = typeof message.text === 'string' ? message.text : ''
    const images = Array.isArray(message.images) ? message.images : []
    if (!text.trim() && images.length === 0) return

    const senderNick = identity.nickname || identity.userId
    const session = this._agentSessionManager.sessions.get(sessionId)
    if (session) {
      this._notifier.notifySessionCreated({
        sessionId,
        userId: identity.userId,
        nickname: senderNick,
        chatId: message.chatId,
        title: session.title,
      })
    }
    const userMessage = images.length > 0 && !text.trim()
      ? { text: '', images }
      : (images.length > 0 ? { text, images } : text)

    const { donePromise } = this._replyCollector.startCollect(sessionId, {
      webhook: frame,
      sendFn: async (_sid, chunk) => {
        if (!chunk) return
        await this._sendStreamChunk(sessionId, frame, chunk)
      },
    })

    await this._agentSessionManager.appendExternalUserMessage(sessionId, {
      content: text || '[图片]',
      source: this._imType,
      senderNick,
      images,
      meta: {
        msgId: message.msgId,
        identity,
        enterpriseWeixinChatId: message.chatId,
      },
    })

    try {
      await this._agentSessionManager.sendMessage(sessionId, userMessage, {
        meta: {
          source: 'im-inbound',
          senderNick,
          enterpriseWeixinChatId: message.chatId,
        },
      })
      await donePromise
    } catch (err) {
      this._replyCollector.clear(sessionId)
      console.error('[EnterpriseWeixin] Process message error:', err)
      try {
        await this._sendTextReply(frame, `处理消息时出错: ${err.message}`)
      } catch {}
    }
  }

  async _sendStreamChunk(sessionId, frame, message) {
    if (!this._wsClient || !frame?.headers?.req_id) return
    const text = this._extractTextContent(message)
    if (!text) return

    let sendChunk = this._activeSendChunks.get(sessionId)
    if (!sendChunk) {
      const streamId = generateReqId('wecom_stream')
      sendChunk = async (chunk, finish = false) => {
        return this._wsClient.replyStreamNonBlocking(frame, streamId, chunk, finish)
      }
      this._activeSendChunks.set(sessionId, sendChunk)
    }

    try {
      await sendChunk(text, false)
    } catch (err) {
      console.error('[EnterpriseWeixin] Stream write error:', err.message)
    }
  }

  _extractTextContent(message) {
    if (!message?.content) return ''
    if (typeof message.content === 'string') return message.content
    if (Array.isArray(message.content)) {
      return message.content
        .filter(block => block?.type === 'text')
        .map(block => block?.text || '')
        .join('')
    }
    return ''
  }

  _onAgentMessage(sessionId, message) {
    const desktopPending = this._desktopPendingImagePaths.get(sessionId)
    if (desktopPending) {
      for (const imagePath of extractImagePaths(message)) {
        desktopPending.add(imagePath)
      }
    }

    this._replyCollector.onAgentMessage(sessionId, message, (chunk) => {
      const collector = this._replyCollector._collectors?.get(sessionId)
      if (!collector?.webhook) return
      return this._sendStreamChunk(sessionId, collector.webhook, {
        content: [{ type: 'text', text: chunk }],
      })
    })

    for (const imagePath of extractImagePaths(message)) {
      this._replyCollector.addImagePath(sessionId, imagePath)
    }
  }

  async _onAgentResult(sessionId) {
    const collector = this._replyCollector._collectors?.get(sessionId)
    const frame = collector?.webhook || null
    const identity = this._sessionIdentities.get(sessionId) || null
    const sendChunk = this._activeSendChunks.get(sessionId)
    if (sendChunk) {
      try {
        const finalText = Array.isArray(collector?.chunks) ? collector.chunks.join('') : ''
        const sentText = collector?.sentText || ''
        const remaining = finalText.startsWith(sentText) ? finalText.slice(sentText.length) : ''
        await sendChunk(remaining, true)
      } catch (err) {
        console.error('[EnterpriseWeixin] Stream finish error:', err.message)
      }
      this._activeSendChunks.delete(sessionId)
    }

    const result = await this._replyCollector.onAgentResult(sessionId, async (_sid, data) => {
      if (!identity || !this._wsClient || !this._connected) return

      const chatId = identity.chatType === 'group' ? identity.chatId : identity.senderId
      if (!chatId) return

      const pendingImagePaths = [...(this._desktopPendingImagePaths.get(sessionId) || [])]
      this._desktopPendingImagePaths.delete(sessionId)

      if (data?.fullText) {
        const block = `桌面介入> ${data.userContent}\n\n${data.fullText}`
        await this._wsClient.sendMessage(chatId, {
          msgtype: 'markdown',
          markdown: { content: block },
        })
      }

      if (Array.isArray(data?.userImages) && data.userImages.length > 0) {
        await this._sendBase64ImagesToChat(chatId, data.userImages)
      }

      if (pendingImagePaths.length > 0) {
        await this._sendImagesToChat(chatId, pendingImagePaths)
      }
    })
    if (!frame || !this._wsClient) return result

    if (result?.imagePaths?.length > 0) {
      await this._replyImages(frame, result.imagePaths)
    }

    return result
  }

  _onDesktopIntervention(sessionId, content, images) {
    const identity = this._sessionIdentities.get(sessionId)
    if (!identity) return

    const mapKey = this._sessionMapper.buildKey(identity)
    if (!isMappedCurrentSession({
      sessionMap: this._sessionMapper.sessionMap,
      sessionId,
      mapKey,
    })) {
      console.log(`[EnterpriseWeixin] Desktop intervention blocked for session ${sessionId}: not current connected session`)
      return
    }

    const chatId = identity.chatType === 'group' ? identity.chatId : identity.senderId
    if (!chatId || !this._wsClient || !this._connected) return

    this._desktopPendingImagePaths.set(sessionId, new Set())

    this._replyCollector.recordDesktopIntervention(sessionId, { content, images }, async () => {})
  }

  async _sendBase64ImagesToChat(chatId, images = []) {
    if (!chatId || !Array.isArray(images) || images.length === 0) return
    if (!this._wsClient || typeof this._wsClient.uploadMedia !== 'function') return

    for (const image of images) {
      const rawBase64 = typeof image?.base64 === 'string'
        ? image.base64
        : (typeof image?.data === 'string' ? image.data : (typeof image === 'string' ? image : ''))
      const mediaType = typeof image?.mediaType === 'string' && image.mediaType.trim()
        ? image.mediaType.trim()
        : this._extractImageMediaType(rawBase64)
      const buffer = this._base64ImageToBuffer(rawBase64)
      if (!buffer) continue
      try {
        const uploaded = await this._wsClient.uploadMedia(buffer, {
          type: 'image',
          filename: `desktop-image.${this._mediaTypeToExt(mediaType)}`,
        })
        const mediaId = uploaded?.media_id
        if (!mediaId) continue
        await this._wsClient.sendMediaMessage(chatId, 'image', mediaId)
      } catch (err) {
        console.error('[EnterpriseWeixin] Failed to send desktop base64 image:', err.message)
      }
    }
  }

  _base64ImageToBuffer(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null
    const match = rawValue.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/)
    const payload = match ? match[1] : rawValue
    try {
      return Buffer.from(payload, 'base64')
    } catch {
      return null
    }
  }

  _extractImageMediaType(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return 'image/png'
    const match = rawValue.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
    return match?.[1] || 'image/png'
  }

  _mediaTypeToExt(mediaType) {
    switch (mediaType) {
      case 'image/jpeg': return 'jpg'
      case 'image/gif': return 'gif'
      case 'image/webp': return 'webp'
      case 'image/bmp': return 'bmp'
      default: return 'png'
    }
  }

  async sendTextToTarget({ sessionId, userId, targetId, displayName, text } = {}) {
    this._syncSessionDatabase()
    const content = typeof text === 'string' ? text.trim() : ''
    if (!content) throw new Error('发送内容不能为空')

    const resolvedUserId = typeof (userId || targetId) === 'string' ? (userId || targetId).trim() : ''
    if (!resolvedUserId) throw new Error('userId 不能为空')
    if (!this._wsClient || !this._connected) throw new Error('企业微信未连接')

    if (sessionId) {
      this._agentSessionManager.assertSessionImBindingAllowed(sessionId, this._imType)
      this._assertSessionTargetAllowed(sessionId, resolvedUserId, displayName)
    }

    await this._wsClient.sendMessage(resolvedUserId, {
      msgtype: 'markdown',
      markdown: { content },
    })

    if (sessionId) {
      this.bindSessionToTarget(sessionId, { userId: resolvedUserId, displayName })
    }

    return { success: true, targetId: resolvedUserId }
  }

  bindSessionToTarget(sessionId, { userId, targetId, displayName } = {}) {
    this._syncSessionDatabase()
    const resolvedUserId = typeof (userId || targetId) === 'string' ? (userId || targetId).trim() : ''
    if (!sessionId || !resolvedUserId) {
      throw new Error('sessionId 和 userId 不能为空')
    }

    const session = this._agentSessionManager.sessions.get(sessionId)
      || this._sessionDatabase?.getAgentConversation?.(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} 不存在或已关闭`)
    }

    this._agentSessionManager.assertSessionImBindingAllowed(sessionId, this._imType)
    this._assertSessionTargetAllowed(sessionId, resolvedUserId, displayName)
    this._agentSessionManager.bindSessionExternalImSource(sessionId, this._imType)

    const previousTarget = this._sessionTargets.get(sessionId)
    if (previousTarget?.userId && previousTarget.userId !== resolvedUserId) {
      this._targetSessionMap.delete(previousTarget.userId)
    }

    this._clearSingleSessionMapBindingsForUser(resolvedUserId, sessionId)

    const previousSessionId = this._targetSessionMap.get(resolvedUserId)
    if (previousSessionId && previousSessionId !== sessionId) {
      this._sessionTargets.delete(previousSessionId)
      this._targetSessionMap.delete(resolvedUserId)
    }

    const target = {
      userId: resolvedUserId,
      displayName: displayName || previousTarget?.displayName || resolvedUserId,
    }
    this._sessionTargets.set(sessionId, target)
    this._targetSessionMap.set(resolvedUserId, sessionId)
    this._sessionIdentities.set(sessionId, {
      userId: resolvedUserId,
      senderId: resolvedUserId,
      senderName: target.displayName || resolvedUserId,
      chatId: resolvedUserId,
      chatType: 'single',
      chatName: target.displayName || resolvedUserId,
    })

    if (this._sessionDatabase?.updateDingTalkMetadata) {
      try {
        this._sessionDatabase.updateDingTalkMetadata(sessionId, resolvedUserId, resolvedUserId)
      } catch (err) {
        console.warn('[EnterpriseWeixin] Failed to persist bound target identity:', err.message)
      }
    }

    this._clearProactiveRebindSuppressionForUser(resolvedUserId)

    return { success: true, target }
  }

  _assertSessionTargetAllowed(sessionId, resolvedUserId, displayName) {
    if (!sessionId || !resolvedUserId) return

    const existingTarget = this._sessionTargets.get(sessionId)
    const identity = this._sessionIdentities.get(sessionId)
    const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
    const rowUserId = typeof row?.staff_id === 'string' ? row.staff_id.trim() : ''
    const existingUserId = existingTarget?.userId || identity?.senderId || rowUserId

    if (existingUserId && existingUserId !== resolvedUserId) {
      const currentLabel = existingTarget?.displayName || identity?.senderName || existingUserId
      const nextLabel = displayName || resolvedUserId
      throw new Error(`当前会话已绑定企业微信联系人「${currentLabel}」，不能再发送给「${nextLabel}」。请新建会话后再联系其他成员。`)
    }
  }

  _clearSingleSessionMapBindingsForUser(userId, keepSessionId = null) {
    deleteSessionMappingsByPrefix({
      sessionMap: this._sessionMapper.sessionMap,
      prefix: `${typeof userId === 'string' ? userId.trim() : ''}:`,
      keepSessionId,
      deleteEntry: (mapKey) => this._sessionMapper.clearSessionState(mapKey),
    })
  }

  getSessionBinding(sessionId) {
    this._syncSessionDatabase()
    const target = this._sessionTargets.get(sessionId) || null
    if (!target) {
      const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
      const userId = typeof row?.staff_id === 'string' ? row.staff_id.trim() : ''
      if (!userId || row?.im_channel !== this._imType) return null
      return {
        targetId: userId,
        userId,
        displayName: userId,
      }
    }
    return {
      targetId: target.userId,
      userId: target.userId,
      displayName: target.displayName,
    }
  }

  unbindSessionTarget(sessionId) {
    if (!sessionId) return { success: false, error: 'sessionId 不能为空' }
    const target = this._sessionTargets.get(sessionId) || null
    if (target?.userId) {
      this._targetSessionMap.delete(target.userId)
    }
    this._sessionTargets.delete(sessionId)
    return { success: true }
  }

  _restoreSessionBindings() {
    this._syncSessionDatabase()
    if (!this._sessionDatabase?.getAgentConversation) return

    for (const [sessionId, session] of this._agentSessionManager.sessions.entries()) {
      const row = this._sessionDatabase.getAgentConversation(sessionId)
      const userId = typeof row?.staff_id === 'string' ? row.staff_id.trim() : ''
      if (!userId || row?.im_channel !== this._imType) continue

      this._sessionTargets.set(sessionId, {
        userId,
        displayName: userId,
      })
      this._targetSessionMap.set(userId, sessionId)
      if (!this._sessionIdentities.has(sessionId)) {
        this._sessionIdentities.set(sessionId, {
          userId,
          senderId: userId,
          senderName: userId,
          chatId: typeof row?.conversation_id === 'string' && row.conversation_id.trim() ? row.conversation_id.trim() : userId,
          chatType: row?.conversation_id && row.conversation_id !== userId ? 'group' : 'single',
          chatName: userId,
        })
      }
      if (session && !session.imChannel) {
        session.imChannel = this._imType
      }
    }
  }

  _clearSessionIdentity(sessionId) {
    this._activeSendChunks.delete(sessionId)
    this._desktopPendingImagePaths.delete(sessionId)
    this._replyCollector.clear(sessionId)
    clearSessionMappingsForSession({
      sessionMap: this._sessionMapper.sessionMap,
      sessionId,
      deleteEntry: (mapKey) => this._sessionMapper.clearSessionState(mapKey),
    })
    const target = this._sessionTargets.get(sessionId)
    if (target?.userId) {
      this._targetSessionMap.delete(target.userId)
    }
    this._sessionTargets.delete(sessionId)
    const identity = this._sessionIdentities.get(sessionId)
    if (!identity) return
    if (identity.chatType === 'single' && !this._sessionTargets.has(sessionId)) {
      this._sessionIdentities.delete(sessionId)
    }
  }

  _clearProactiveRebindSuppressionForUser(userId) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''
    if (!normalizedUserId) return
    for (const key of this._proactiveRebindSuppressedKeys) {
      if (key.startsWith(`${normalizedUserId}:`)) {
        this._proactiveRebindSuppressedKeys.delete(key)
      }
    }
  }

  _isLiveSession(sessionId) {
    if (!sessionId) return false
    if (this._agentSessionManager.sessions.has(sessionId)) return true
    const row = this._sessionDatabase?.getAgentConversation?.(sessionId)
    return Boolean(row && row.status !== 'closed')
  }

  _startMsgIdCleanup() {
    this._stopMsgIdCleanup()
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

/**
 * Weixin Bridge
 * Receives inbound Weixin notify messages and displays them in desktop Agent sessions.
 */

const path = require('path')
const { extractImagePaths, normalizePath, IMAGE_EXTENSIONS, IMAGE_PATH_MAX_DEPTH } = require('./im-utils')
const {
  buildAlreadyConnectedText,
  buildImCommandHelpText,
  buildNoHistoryText,
  buildRenameMissingSessionText,
  buildRenamePromptText,
  buildRenameSuccessText,
  buildSessionActivatingText,
  buildSessionCreatingText,
  buildSessionReplyingText,
  buildSessionSwitchedText,
  buildUnknownCommandText,
  mergeCurrentSessionIntoHistory,
  buildCurrentImHistoryRow,
  resolveCommandCwd,
} = require('./im-command-policy')
const { buildHistoryChoiceMenuText } = require('./im-command-presenter')
const { ImSessionMapper } = require('./im-session-mapper')
const { ensureHistoryChoiceOrCurrent, resolveStrictCurrentSessionId } = require('./im-session-decision')
const { runResumePostAction } = require('./im-resume-post-action')
const { logWeixinQueueTiming } = require('./weixin-timing-debug')
const {
  dispatchImCommand,
  resolveCloseCommand,
  resolveRenameCommand,
} = require('./im-command-executor')
const { getImDefaultWorkspaceRoot, getImWorkspaceSubdir } = require('./im-working-directory')

class WeixinBridge {
  constructor(configManager, agentSessionManager, weixinNotifyService, mainWindow) {
    this.configManager = configManager
    this.agentSessionManager = agentSessionManager
    this.weixinNotifyService = weixinNotifyService
    this.mainWindow = mainWindow
    this._configKey = 'weixin'
    this._runtimeState = 'disabled'
    this.sessionMap = new Map()
    this.knownTargets = new Map()
    this.sessionTargets = new Map()
    this.pendingReplies = new Map()
    this.replySendQueues = new Map()
    this.desktopPendingBlocks = new Map()
    this.inboundMessageQueues = new Map()
    this.inboundCompletionWaiters = new Map()
    this.pendingInboundMessages = new Map()
    this._unbindMessage = null
    this._unbindSent = null
    this._agentListeners = null
    this._sessionMapper = new ImSessionMapper({
      agentSessionManager,
      sessionDatabase: agentSessionManager?.sessionDatabase,
      imType: 'weixin',
      defaultCwd: getImDefaultWorkspaceRoot(
        this.configManager?.getConfig?.() || {},
        'weixin',
        'weixin'
      ),
      buildIdentityKey: (identity) => identity?.targetId || identity?.userId || '',
      buildSessionTitle: (identity) => `微信 · ${identity?.nickname || identity?.targetId || identity?.userId || '未知用户'}`,
    })
    this.sessionMap = this._sessionMapper.sessionMap
  }

  getStatus() {
    return {
      connected: this._runtimeState === 'connected',
      activeSessions: this.sessionMap.size,
      runtimeState: this._runtimeState,
    }
  }

  _getConfig() {
    try {
      return this.configManager?.getConfig?.()?.weixin || {}
    } catch {
      return {}
    }
  }

  _notifyStatusChange() {
    this._notifyFrontend('weixin:statusChange', this.getStatus())
  }

  refreshSessionMapperConfig() {
    if (this._sessionMapper && typeof this._sessionMapper.setDefaultWorkspaceRoot === 'function') {
      this._sessionMapper.setDefaultWorkspaceRoot(
        getImDefaultWorkspaceRoot(this.configManager?.getConfig?.() || {}, 'weixin', 'weixin')
      )
    }
  }

  start() {
    if (!this.weixinNotifyService) {
      this._runtimeState = 'disabled'
      this._notifyStatusChange()
      return false
    }

    const config = this._getConfig()
    if (config.enabled === false) {
      this.stop({ preserveDisabledState: true })
      return false
    }

    if (typeof this.weixinNotifyService.applyRuntimeConfig === 'function') {
      this.weixinNotifyService.applyRuntimeConfig()
    }

    this._runtimeState = 'connecting'
    this._notifyStatusChange()

    if (typeof this.weixinNotifyService.start === 'function' && !this.weixinNotifyService.isRunning?.()) {
      this.weixinNotifyService.start()
    }
    if (this._unbindMessage) {
      this._runtimeState = 'connected'
      this._notifyStatusChange()
      return true
    }

    this._unbindMessage = this.weixinNotifyService.on('message', (message) => {
      this._enqueueInboundMessage(message)
    })
    this._unbindSent = this.weixinNotifyService.on('sent', (message) => {
      this._rememberSentSession(message)
    })
    this._bindAgentEvents()
    this._runtimeState = 'connected'
    this._notifyStatusChange()
    return true
  }

  stop(options = {}) {
    const preserveDisabledState = options?.preserveDisabledState !== false
    if (this._unbindMessage) {
      this._unbindMessage()
      this._unbindMessage = null
    }
    if (this._unbindSent) {
      this._unbindSent()
      this._unbindSent = null
    }
    this._unbindAgentEvents()
    this.pendingReplies.clear()
    this.replySendQueues.clear()
    this.desktopPendingBlocks.clear()
    this.inboundMessageQueues.clear()
    this.pendingInboundMessages.clear()
    this._sessionMapper.clearAll()
    this._resolveInboundCompletionWaiters()
    if (typeof this.weixinNotifyService?.stop === 'function' && this.weixinNotifyService.isRunning?.()) {
      this.weixinNotifyService.stop()
    }
    const configEnabled = this._getConfig().enabled !== false
    this._runtimeState = configEnabled || !preserveDisabledState ? 'disconnected' : 'disabled'
    this._notifyStatusChange()
  }

  restart() {
    this.stop({ preserveDisabledState: false })
    return this.start()
  }

  _enqueueInboundMessage(message) {
    const mapKey = this._getMapKey(message)
    const previous = this.inboundMessageQueues.get(mapKey) || Promise.resolve()
    const queuedAt = Date.now()
    const debugLabel = String(message?.text || '').trim() || (Array.isArray(message?.images) && message.images.length > 0 ? '[images]' : '[empty]')
    logWeixinQueueTiming('queued inbound', {
      mapKey,
      targetId: message?.targetId || null,
      text: debugLabel,
      hadPrevious: this.inboundMessageQueues.has(mapKey),
    })
    const next = previous
      .catch(() => {})
      .then(() => this._handleMessageAndWait(message, { queuedAt, mapKey, debugLabel }))
      .catch(err => {
        console.error('[WeixinBridge] Message handling error:', err)
      })
      .finally(() => {
        if (this.inboundMessageQueues.get(mapKey) === next) {
          this.inboundMessageQueues.delete(mapKey)
        }
      })
    this.inboundMessageQueues.set(mapKey, next)
    return next
  }

  async _handleMessageAndWait(message, debugMeta = null) {
    const handleStartedAt = Date.now()
    logWeixinQueueTiming('start handling inbound', {
      mapKey: debugMeta?.mapKey || this._getMapKey(message),
      targetId: message?.targetId || null,
      text: debugMeta?.debugLabel || String(message?.text || '').trim() || null,
      queueWaitMs: typeof debugMeta?.queuedAt === 'number' ? handleStartedAt - debugMeta.queuedAt : null,
    })
    const sessionId = await this._handleMessage(message)
    if (!sessionId) return null
    const waitStartedAt = Date.now()
    await this._waitForAgentCompletion(sessionId, {
      ...debugMeta,
      handleStartedAt,
      waitStartedAt,
      message,
    })
    logWeixinQueueTiming('inbound fully handled', {
      mapKey: debugMeta?.mapKey || this._getMapKey(message),
      sessionId,
      targetId: message?.targetId || null,
      text: debugMeta?.debugLabel || String(message?.text || '').trim() || null,
      totalSinceQueuedMs: typeof debugMeta?.queuedAt === 'number' ? Date.now() - debugMeta.queuedAt : null,
      waitAfterHandleMs: Date.now() - waitStartedAt,
    })
    return null
  }

  _waitForAgentCompletion(sessionId, debugMeta = null) {
    if (!sessionId) return Promise.resolve()
    const session = this.agentSessionManager?.sessions?.get(sessionId)
    if (!session || session.status !== 'streaming') {
      logWeixinQueueTiming('no streaming wait', {
        sessionId,
        status: session?.status || null,
        mapKey: debugMeta?.mapKey || null,
        targetId: debugMeta?.message?.targetId || null,
        text: debugMeta?.debugLabel || null,
      })
      return Promise.resolve()
    }

    logWeixinQueueTiming('waiting for agent completion', {
      sessionId,
      status: session.status,
      mapKey: debugMeta?.mapKey || null,
      targetId: debugMeta?.message?.targetId || null,
      text: debugMeta?.debugLabel || null,
    })

    return new Promise(resolve => {
      const waiters = this.inboundCompletionWaiters.get(sessionId) || []
      waiters.push(() => {
        logWeixinQueueTiming('streaming wait released', {
          sessionId,
          mapKey: debugMeta?.mapKey || null,
          targetId: debugMeta?.message?.targetId || null,
          text: debugMeta?.debugLabel || null,
          waitedMs: typeof debugMeta?.waitStartedAt === 'number' ? Date.now() - debugMeta.waitStartedAt : null,
          totalSinceQueuedMs: typeof debugMeta?.queuedAt === 'number' ? Date.now() - debugMeta.queuedAt : null,
        })
        resolve()
      })
      this.inboundCompletionWaiters.set(sessionId, waiters)
    })
  }

  _resolveInboundCompletionWaiters(sessionId = null) {
    if (sessionId) {
      const waiters = this.inboundCompletionWaiters.get(sessionId) || []
      this.inboundCompletionWaiters.delete(sessionId)
      waiters.forEach(resolve => resolve())
      return
    }

    for (const waiters of this.inboundCompletionWaiters.values()) {
      waiters.forEach(resolve => resolve())
    }
    this.inboundCompletionWaiters.clear()
  }

  async _handleMessage(message) {
    const text = String(message?.text || '').trim()
    const images = Array.isArray(message?.images) ? message.images : []
    if (!text && images.length === 0) return null

    const identity = this._buildIdentity(message)
    const mapKey = this._sessionMapper.buildKey(identity)
    const pendingChoice = this._sessionMapper._pendingChoices.get(mapKey)
    if (pendingChoice && text) {
      return this._handlePendingChoice(message, identity, mapKey)
    }

    // 命令拦截
    if (text.startsWith('/')) {
      return this._handleWeixinCommand(text, message)
    }

    const session = await this._ensureSession(message, identity, mapKey)
    if (!session) return null
    const senderNick = this._getTargetDisplayName(message)
    this._rememberSessionTarget(session.id, message)
    const userMessage = images.length > 0 ? { text, images } : text
    await this.agentSessionManager.sendMessage(session.id, userMessage, {
      meta: {
        origin: 'im-inbound',
        imChannel: 'weixin',
        senderNick,
        accountId: message.accountId,
        targetId: message.targetId,
        from: message.from,
        contextToken: message.contextToken || null,
        createTimeMs: message.createTimeMs || null
      }
    })

    const storedMessage = [...(this.agentSessionManager.sessions.get(session.id)?.messages || [])]
      .reverse()
      .find(item => item.role === 'user' && item.origin === 'im-inbound' && item.imChannel === 'weixin' && item.content === (text || '[图片]'))

    this._notifyFrontend('weixin:messageReceived', {
      sessionId: session.id,
      accountId: message.accountId,
      targetId: message.targetId,
      from: message.from,
      text: text || '[图片]',
      images,
      senderNick,
      timestamp: storedMessage?.timestamp || Date.now(),
      messageId: storedMessage?.id || null
    })

    return session.id
  }

  _bindAgentEvents() {
    if (this._agentListeners || !this.agentSessionManager?.on) return

    this._agentListeners = {
      userMessage: ({ sessionId, imChannel, content, images, origin }) => {
        const hasBinding = this.sessionTargets.has(sessionId)
        if (origin !== 'im-inbound' && (imChannel === 'weixin' || hasBinding)) {
          try { this._recordDesktopIntervention(sessionId, content, images) } catch (err) {
            console.error('[WeixinBridge] Record desktop intervention failed:', err)
          }
        }
      },
      agentMessage: (sessionId, message) => {
        try { this._collectAgentReply(sessionId, message) } catch (err) {
          console.error('[WeixinBridge] Collect agent reply failed:', err)
        }
      },
      agentResult: (sessionId) => {
        this._flushAgentReply(sessionId).catch(err => {
          console.error('[WeixinBridge] Flush agent reply failed:', err)
        }).finally(() => {
          this._resolveInboundCompletionWaiters(sessionId)
        })
      },
      agentError: (sessionId) => {
        this.pendingReplies.delete(sessionId)
        this._resolveInboundCompletionWaiters(sessionId)
      }
    }

    for (const [eventName, listener] of Object.entries(this._agentListeners)) {
      this.agentSessionManager.on(eventName, listener)
    }
  }

  _unbindAgentEvents() {
    if (!this._agentListeners || !this.agentSessionManager?.off) return

    for (const [eventName, listener] of Object.entries(this._agentListeners)) {
      this.agentSessionManager.off(eventName, listener)
    }
    this._agentListeners = null
  }

  _collectAgentReply(sessionId, message) {
    const desktopPending = this.desktopPendingBlocks.get(sessionId)
    if (desktopPending) {
      this._collectTextChunks(desktopPending, message)
      this._collectImagePaths(desktopPending, message)
      return
    }

    const target = this.sessionTargets.get(sessionId)
    if (!target) return

    const text = this._extractTextFromMessage(message)
    const hasImages = this._messageHasImagePaths(message)
    if (text && !hasImages) {
      this._queueAgentTextReply(sessionId, target, text)
    }

    const pending = this.pendingReplies.get(sessionId) || { imagePaths: new Set(), textChunks: [] }
    this._collectImagePaths(pending, message)
    if (text && pending.imagePaths?.size > 0) {
      pending.textChunks = pending.textChunks || []
      pending.textChunks.push(text)
    }
    if ((pending.imagePaths?.size > 0) || (pending.textChunks?.length > 0)) {
      this.pendingReplies.set(sessionId, pending)
    }
  }

  _extractTextFromMessage(message) {
    const blocks = Array.isArray(message?.content) ? message.content : []
    const textParts = blocks
      .filter(block => block?.type === 'text' && block.text)
      .map(block => block.text)

    return textParts.join('\n\n').trim()
  }

  _queueAgentTextReply(sessionId, target, text) {
    const previous = this.replySendQueues.get(sessionId) || Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(() => this.weixinNotifyService.sendText({
        accountId: target.accountId,
        targetId: target.targetId,
        text,
        sessionId
      }))
      .catch(err => {
        console.error('[WeixinBridge] Immediate agent reply failed:', err.message)
      })
      .finally(() => {
        if (this.replySendQueues.get(sessionId) === next) {
          this.replySendQueues.delete(sessionId)
        }
      })

    this.replySendQueues.set(sessionId, next)
    return next
  }

  _collectTextChunks(pending, message) {
    const blocks = Array.isArray(message?.content) ? message.content : []
    const textParts = blocks
      .filter(block => block?.type === 'text' && block.text)
      .map(block => block.text)

    if (!textParts.length) return
    pending.textChunks.push(textParts.join('\n\n'))
  }

  _collectImagePaths(pending, message) {
    if (!pending.imagePaths) pending.imagePaths = new Set()
    for (const filePath of extractImagePaths(message)) {
      pending.imagePaths.add(filePath)
    }

    const blocks = Array.isArray(message?.content) ? message.content : []
    for (const block of blocks) {
      if (block?.type !== 'text' || !block.text) continue
      this._extractImagePathsFromText(block.text).forEach(filePath => pending.imagePaths.add(filePath))
    }
  }

  async _flushAgentReply(sessionId) {
    if (this.desktopPendingBlocks.has(sessionId)) {
      return this._flushDesktopIntervention(sessionId)
    }

    const target = this.sessionTargets.get(sessionId)
    const pending = this.pendingReplies.get(sessionId)
    this.pendingReplies.delete(sessionId)

    const imagePaths = [...(pending?.imagePaths || [])]
    const text = Array.isArray(pending?.textChunks) ? pending.textChunks.join('\n\n').trim() : ''
    if (!target || (imagePaths.length === 0 && !text)) return null

    const pendingTextSend = this.replySendQueues.get(sessionId)
    if (pendingTextSend) {
      await pendingTextSend.catch(() => {})
    }

    if (imagePaths.length > 0 && this.weixinNotifyService.sendImages) {
      return this.weixinNotifyService.sendImages({
        accountId: target.accountId,
        targetId: target.targetId,
        text,
        imagePaths,
        sessionId
      })
    }

    if (text) {
      return this.weixinNotifyService.sendText({
        accountId: target.accountId,
        targetId: target.targetId,
        text,
        sessionId
      })
    }
  }

  _recordDesktopIntervention(sessionId, userInput, inputImages = null) {
    const target = this._getKnownTarget(sessionId)
    if (!target) return

    this.desktopPendingBlocks.set(sessionId, {
      userInput: String(userInput || ''),
      inputImages: Array.isArray(inputImages) ? inputImages : [],
      textChunks: [],
      imagePaths: new Set()
    })
  }

  async _flushDesktopIntervention(sessionId) {
    const pending = this.desktopPendingBlocks.get(sessionId)
    this.desktopPendingBlocks.delete(sessionId)

    const target = this._getKnownTarget(sessionId)
    if (!target || !pending) return null

    const responseText = pending.textChunks.join('\n\n').trim()
    if (!pending.userInput && !responseText) return null

    const lines = ['桌面端介入：']
    if (pending.userInput) {
      lines.push(pending.userInput.split('\n').map(line => `> ${line}`).join('\n'))
    }
    if (responseText) {
      lines.push('')
      lines.push(responseText)
    }

    const text = lines.join('\n')
    const imagePaths = [...(pending.imagePaths || [])]
    if ((pending.inputImages.length > 0 || imagePaths.length > 0) && this.weixinNotifyService.sendImages) {
      return this.weixinNotifyService.sendImages({
        accountId: target.accountId,
        targetId: target.targetId,
        text,
        images: pending.inputImages,
        imagePaths,
        sessionId
      })
    }

    return this.weixinNotifyService.sendText({
      accountId: target.accountId,
      targetId: target.targetId,
      text,
      sessionId
    })
  }

  _extractImagePaths(obj, depth = 0) {
    if (depth > IMAGE_PATH_MAX_DEPTH) return []
    const paths = []
    if (typeof obj === 'string') {
      if (IMAGE_EXTENSIONS.test(obj) && (obj.startsWith('/') || /^[A-Z]:[/\\]/.test(obj))) {
        paths.push(this._normalizePath(obj))
      }
    } else if (obj && typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        paths.push(...this._extractImagePaths(value, depth + 1))
      }
    }
    return paths
  }

  _normalizePath(filePath) {
    return normalizePath(filePath)
  }

  _messageHasImagePaths(message) {
    if (extractImagePaths(message).length > 0) return true
    const blocks = Array.isArray(message?.content) ? message.content : []
    return blocks.some(block => block?.type === 'text' && this._extractImagePathsFromText(block.text).length > 0)
  }

  _extractImagePathsFromText(text) {
    if (typeof text !== 'string' || !text.trim()) return []

    const matches = text.match(/[A-Za-z]:[\\/][^\s"'<>|]+?\.(?:png|jpg|jpeg|gif|webp|bmp)/gi) || []
    const unique = new Set()
    for (const rawPath of matches) {
      const normalized = this._normalizePath(rawPath.trim())
      unique.add(normalized)
    }
    return [...unique]
  }

  async _ensureSession(message, identity, mapKey) {
    this._sessionMapper._sessionDatabase = this.agentSessionManager?.sessionDatabase
    let currentSessionId = await resolveStrictCurrentSessionId(this._sessionMapper, mapKey)
    if (currentSessionId) {
      const reopened = this.agentSessionManager.reopen(currentSessionId)
      if (reopened) return reopened
      this._sessionMapper.clearSessionState(mapKey)
      currentSessionId = null
    }

    const ensured = currentSessionId
      ? { action: 'use_current', sessionId: currentSessionId, mapKey }
      : await ensureHistoryChoiceOrCurrent({
        sessionMapper: this._sessionMapper,
        mapKey,
        identity,
        resolveBoundSessionId: async () => this._findBoundSessionIdByTargetId(identity.targetId, mapKey),
      })

    if (ensured?.action === 'show_choice') {
      this.pendingInboundMessages.set(mapKey, { message, identity })
      this._sessionMapper.initPendingChoice(mapKey, ensured.sessions, async (menuText) => {
        await this._replyToWeixin(message, menuText)
      }, {
        menuBuilder: (sessions) => this._buildHistoryChoiceMenuText(sessions),
      }).catch(err => {
        console.error('[WeixinBridge] initPendingChoice failed:', err?.message || err)
      })
      return null
    }

    const sessionId = ensured?.sessionId || null
    if (!sessionId) return null

    const session = this._resolveSession(sessionId)
    if (!session) return null

    if (ensured.action === 'create_new') {
      this._notifyFrontend('weixin:sessionCreated', {
        sessionId: session.id,
        accountId: message.accountId,
        targetId: message.targetId,
        from: message.from,
        senderNick: identity.nickname,
        title: session.title
      })
    }

    return session
  }

  _rememberSentSession(message) {
    const sessionId = message?.sessionId
    if (!sessionId) return

    try {
      this.bindTarget(sessionId, {
        accountId: message.accountId || message.target?.accountId,
        targetId: message.targetId,
        displayName: this._getTargetDisplayName(message)
      })
    } catch (err) {
      console.warn('[WeixinBridge] Failed to bind session after successful send:', err.message)
    }
  }

  _rememberSessionTarget(sessionId, message) {
    if (!sessionId || !message?.targetId) return
    const target = this._rememberKnownTarget(sessionId, message)
    if (target) {
      this.sessionTargets.set(sessionId, target)
    }
  }

  _rememberKnownTarget(sessionId, message) {
    if (!sessionId || !message?.targetId) return null
    const target = {
      accountId: message.accountId || message.target?.accountId || null,
      targetId: message.targetId,
      displayName: this._getTargetDisplayName(message)
    }
    this.knownTargets.set(sessionId, target)
    return target
  }

  _getKnownTarget(sessionId) {
    return this.knownTargets.get(sessionId) || this.sessionTargets.get(sessionId) || null
  }

  _resolveSession(sessionId) {
    const inMemory = this.agentSessionManager.sessions.get(sessionId)
    if (inMemory) return inMemory

    const db = this.agentSessionManager.sessionDatabase
    const row = db && db.getAgentConversation(sessionId)
    if (!row || row.status === 'closed') return null

    const reopened = this.agentSessionManager.reopen(sessionId)
    return reopened || null
  }

  _getMapKey(message) {
    return message?.targetId || `${message?.accountId || 'unknown'}:${message?.from || 'unknown'}`
  }

  _buildIdentity(message) {
    const targetId = String(message?.targetId || '').trim()
    return {
      userId: targetId,
      targetId,
      chatType: 'p2p',
      nickname: this._getTargetDisplayName(message),
      accountId: message?.accountId || '',
      from: message?.from || '',
    }
  }

  _findBoundSessionIdByTargetId(targetId, mapKey = '') {
    const normalizedTargetId = String(targetId || '').trim()
    if (!normalizedTargetId) return null
    for (const [sessionId, target] of this.sessionTargets.entries()) {
      if (target?.targetId !== normalizedTargetId) continue
      const live = this._resolveSession(sessionId)
      if (!live) continue
      if (mapKey && this.sessionMap.get(mapKey) === sessionId) return sessionId
      return sessionId
    }
    return null
  }

  _getTargetDisplayName(message) {
    return message?.target?.displayName || message?.from || message?.targetId || '未知用户'
  }

  _buildHistoryChoiceMenuText(sessions, currentSessionId = null) {
    return buildHistoryChoiceMenuText({
      sessions,
      currentSessionId,
      getDirName: (cwd) => (cwd ? path.basename(cwd) : '-'),
      isSessionActivated: (sessionId) => {
        const session = this.agentSessionManager?.sessions?.get?.(sessionId)
        return !!session?.queryGenerator
      },
    })
  }

  async _handlePendingChoice(message, identity, mapKey) {
    const inputText = String(message?.text || '').trim()
    if (!inputText) return null

    if (inputText === '/new') {
      await this._handleWeixinCommand('/new', message, {
        preservePendingSelection: true,
      })
      return null
    }

    const currentSessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
    const result = await this._sessionMapper.handleChoice(mapKey, inputText, identity)
    if (result?.invalidChoice) {
      await this._replyToWeixin(message, `编号错误：请输入 0-${this._sessionMapper._pendingChoices.get(mapKey)?.sessions?.length || 0} 之间的数字\n\n${result.menuText}`)
      return null
    }

    const sessionId = result?.sessionId || null
    if (!sessionId) {
      await this._replyToWeixin(message, '无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话')
      return null
    }

    const session = this._resolveSession(sessionId)
    if (!session) {
      await this._replyToWeixin(message, '无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话')
      return null
    }

    this._notifyFrontend('weixin:sessionCreated', {
      sessionId,
      accountId: message.accountId,
      targetId: message.targetId,
      from: message.from,
      senderNick: identity.nickname,
      title: session.title
    })

    const pending = this.pendingInboundMessages.get(mapKey)
    const shouldWaitForReply = Boolean(pending) || session?.status === 'streaming'

    if (result.action === 'resume') {
      if (currentSessionId && currentSessionId === sessionId && result.wasActivated && !shouldWaitForReply) {
        await this._replyToWeixin(message, buildAlreadyConnectedText(result.selectedSession?.title || session.title || sessionId))
      } else if (result.wasActivated) {
        await this._replyToWeixin(
          message,
          shouldWaitForReply
            ? buildSessionReplyingText(result.selectedSession?.title || session.title || sessionId)
            : buildSessionSwitchedText(result.selectedSession?.title || session.title || sessionId)
        )
      } else {
        await this._replyToWeixin(message, buildSessionActivatingText())
      }
    } else {
      await this._replyToWeixin(message, buildSessionCreatingText())
    }

    await runResumePostAction({
      pendingMessage: pending,
      clearPendingMessage: () => this.pendingInboundMessages.delete(mapKey),
      wasActivated: result.wasActivated,
      notifyMessageReceived: () => {
        this._notifyFrontend('weixin:messageReceived', {
          sessionId,
          accountId: message.accountId,
          targetId: message.targetId,
          from: message.from,
          text: 'hello',
          images: [],
          senderNick: identity.nickname,
          timestamp: Date.now(),
          messageId: null
        })
      },
      replayPendingMessage: async (pendingSelection) => {
        const pendingText = String(pendingSelection?.message?.text || '').trim()
        const pendingImages = Array.isArray(pendingSelection?.message?.images) ? pendingSelection.message.images : []
        this._notifyFrontend('weixin:messageReceived', {
          sessionId,
          accountId: pendingSelection?.message?.accountId || message.accountId,
          targetId: pendingSelection?.message?.targetId || message.targetId,
          from: pendingSelection?.message?.from || message.from,
          text: pendingText || (pendingImages.length > 0 ? '[图片]' : ''),
          images: pendingImages,
          senderNick: pendingSelection?.identity?.nickname || identity.nickname,
          timestamp: Date.now(),
          messageId: null
        })
        this._rememberSessionTarget(sessionId, pendingSelection.message || message)
        await this.agentSessionManager.sendMessage(
          sessionId,
          pendingImages.length > 0 ? { text: pendingText, images: pendingImages } : pendingText,
          {
            meta: {
              origin: 'im-inbound',
              imChannel: 'weixin',
              senderNick: pendingSelection?.identity?.nickname || identity.nickname,
              accountId: pendingSelection?.message?.accountId || message.accountId,
              targetId: pendingSelection?.message?.targetId || message.targetId,
              from: pendingSelection?.message?.from || message.from,
              contextToken: pendingSelection?.message?.contextToken || message.contextToken || null,
              createTimeMs: pendingSelection?.message?.createTimeMs || message.createTimeMs || null
            }
          }
        )
      },
      enqueueHello: async () => {
        this._rememberSessionTarget(sessionId, message)
        await this.agentSessionManager.sendMessage(sessionId, 'hello', {
          meta: {
            origin: 'im-inbound',
            imChannel: 'weixin',
            senderNick: identity.nickname,
            accountId: message.accountId,
            targetId: message.targetId,
            from: message.from,
            contextToken: message.contextToken || null,
            createTimeMs: message.createTimeMs || null
          }
        })
      },
    })
    return sessionId
  }

  /**
   * 将普通 chat 会话绑定到微信目标，建立双向通道
   */
  bindTarget(sessionId, { accountId, targetId, displayName } = {}) {
    if (!sessionId || !accountId || !targetId) {
      throw new Error('sessionId, accountId 和 targetId 不能为空')
    }
    const session = this._resolveSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} 不存在或已关闭`)
    }
    this.agentSessionManager.bindSessionExternalImSource(sessionId, 'weixin')
    for (const [mapKey, mappedSessionId] of this.sessionMap.entries()) {
      if (mappedSessionId === sessionId && mapKey !== targetId) {
        this.sessionMap.delete(mapKey)
      }
    }
    const previousSessionId = this.sessionMap.get(targetId)
    if (previousSessionId && previousSessionId !== sessionId) {
      this.knownTargets.delete(previousSessionId)
      this.sessionTargets.delete(previousSessionId)
      this.pendingReplies.delete(previousSessionId)
      this.replySendQueues.delete(previousSessionId)
      this.desktopPendingBlocks.delete(previousSessionId)
      for (const [mapKey, mappedSessionId] of this.sessionMap.entries()) {
        if (mappedSessionId === previousSessionId && mapKey === targetId) {
          this.sessionMap.delete(mapKey)
        }
      }
    }

    const target = { accountId, targetId, displayName: displayName || targetId }
    this.sessionMap.set(targetId, sessionId)
    this.knownTargets.set(sessionId, target)
    this.sessionTargets.set(sessionId, target)
    this.pendingReplies.delete(sessionId)
    this.desktopPendingBlocks.delete(sessionId)

    const db = this.agentSessionManager.sessionDatabase
    if (db?.updateImIdentity) {
      db.updateImIdentity(sessionId, { userId: targetId, chatId: '', chatType: 'p2p' })
    }

    console.log(`[WeixinBridge] Bound session ${sessionId} to target ${targetId} (${displayName || targetId})`)
    return { success: true, target }
  }

  async sendToTarget({ sessionId, accountId, targetId, displayName, text } = {}) {
    const content = typeof text === 'string' ? text.trim() : ''
    if (!content) {
      throw new Error('发送内容不能为空')
    }
    if (!accountId || !targetId) {
      throw new Error('accountId 和 targetId 不能为空')
    }
    if (sessionId) {
      this.agentSessionManager.assertSessionImBindingAllowed(sessionId, 'weixin')
    }

    const result = await this.weixinNotifyService.sendText({
      accountId,
      targetId,
      text: content,
      sessionId
    })

    if (sessionId) {
      this.bindTarget(sessionId, {
        accountId: result?.target?.accountId || accountId,
        targetId: result?.target?.id || targetId,
        displayName: displayName || result?.target?.displayName
      })
    }

    return result
  }

  /**
   * 解除会话与微信目标的绑定
   */
  unbindTarget(sessionId) {
    if (!sessionId) return { success: false, error: 'sessionId 不能为空' }
    const target = this.knownTargets.get(sessionId) || this.sessionTargets.get(sessionId)
    if (target?.targetId && this.sessionMap.get(target.targetId) === sessionId) {
      this.sessionMap.delete(target.targetId)
    }
    for (const [mapKey, mappedSessionId] of this.sessionMap.entries()) {
      if (mappedSessionId === sessionId) {
        this.sessionMap.delete(mapKey)
      }
    }
    this.knownTargets.delete(sessionId)
    this.sessionTargets.delete(sessionId)
    this.pendingReplies.delete(sessionId)
    this.replySendQueues.delete(sessionId)
    this.desktopPendingBlocks.delete(sessionId)
    this.agentSessionManager?.unbindSessionExternalImSource?.(sessionId)
    console.log(`[WeixinBridge] Unbound session ${sessionId}`)
    return { success: true }
  }

  /**
   * 获取会话的微信绑定信息
   */
  getBinding(sessionId) {
    if (!sessionId) return null
    let target = this.knownTargets.get(sessionId) || this.sessionTargets.get(sessionId) || null
    if (!target) {
      const db = this.agentSessionManager.sessionDatabase
      const row = db?.getAgentConversation?.(sessionId)
      const targetId = typeof row?.im_user_id === 'string' ? row.im_user_id.trim() : ''
      const restored = this.weixinNotifyService?.getTargetById?.(targetId) || null
      if (targetId && restored && row?.im_channel === 'weixin' && row?.status !== 'closed') {
        target = {
          accountId: restored.accountId,
          targetId: restored.id,
          displayName: restored.displayName || restored.userId || restored.id
        }
        this.knownTargets.set(sessionId, target)
        this.sessionTargets.set(sessionId, target)
      }
    }
    if (!target) return null
    return {
      accountId: target.accountId,
      targetId: target.targetId,
      displayName: target.displayName
    }
  }

  async _handleWeixinCommand(text, message, options = {}) {
    const commandStartedAt = Date.now()
    const identity = this._buildIdentity(message)
    const mapKey = this._sessionMapper.buildKey(identity)
    logWeixinQueueTiming('command resolve current start', {
      command: String(text || '').trim(),
      mapKey,
      targetId: message?.targetId || null,
    })
    let currentSessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
    logWeixinQueueTiming('command resolve current done', {
      command: String(text || '').trim(),
      mapKey,
      targetId: message?.targetId || null,
      currentSessionId,
      elapsedMs: Date.now() - commandStartedAt,
    })
    const receiveTarget = {
      accountId: message.accountId,
      targetId: message.targetId,
      text,
    }

    await dispatchImCommand({
      text,
      beforeExecute: () => {
        if (!options.preservePendingSelection) {
          this._sessionMapper.clearPendingChoice(mapKey)
          this.pendingInboundMessages.delete(mapKey)
        }
      },
      handlers: {
        help: async () => {
          await this._replyToWeixin(receiveTarget, this._cmdHelp())
        },
        status: async () => {
          await this._replyToWeixin(receiveTarget, this._cmdStatus(identity, currentSessionId))
        },
        close: async ({ args }) => {
          const activeSessions = [...this.agentSessionManager.sessions.values()].filter(session => session?.imChannel === 'weixin')
          const closeDecision = resolveCloseCommand({
            args,
            activeSessions,
            currentSessionId,
            getSessionById: (sessionId) => this.agentSessionManager.sessions.get(sessionId) || null,
          })
          if (closeDecision.action === 'invalid_index') {
            await this._replyToWeixin(receiveTarget, `编号错误：请输入 1-${closeDecision.max} 之间的数字`)
            return
          }
          if (closeDecision.action === 'missing_current') {
            await this._replyToWeixin(receiveTarget, '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话')
            return
          }
          if (closeDecision.action === 'streaming') {
            await this._replyToWeixin(receiveTarget, 'AI 正在响应中，请等待完成后再关闭')
            return
          }
          await this.agentSessionManager.close(closeDecision.targetSessionId)
          this._sessionMapper.clearSessionState(mapKey)
          currentSessionId = await this._sessionMapper.resolveActiveSessionId(mapKey)
          await this._replyToWeixin(receiveTarget, closeDecision.closeText || '会话已关闭')
        },
        new: async ({ args }) => {
          const currentSession = currentSessionId ? this.agentSessionManager.sessions.get(currentSessionId) : null
          if (currentSession?.status === 'streaming') {
            await this._replyToWeixin(receiveTarget, 'AI 正在响应中，请等待完成后再操作')
            return
          }
          let cwd
          try {
            const config = this.configManager?.getConfig?.() || {}
            const outputBaseDir = config?.settings?.agent?.outputBaseDir
            cwd = resolveCommandCwd({
              args,
              config,
              outputBaseDir,
              imSubdir: getImWorkspaceSubdir('weixin'),
              configKey: 'weixin',
            })
          } catch (err) {
            await this._replyToWeixin(receiveTarget, err.message)
            return
          }
          const newId = await this._sessionMapper.createSession(identity, { cwd })
          if (!newId) {
            await this._replyToWeixin(receiveTarget, '创建新会话失败')
            return
          }
          this._sessionMapper.sessionMap.set(mapKey, newId)
          this._notifyFrontend('weixin:sessionCreated', {
            sessionId: newId,
            accountId: message.accountId,
            targetId: message.targetId,
            from: message.from,
            senderNick: identity.nickname,
            title: this.agentSessionManager.sessions.get(newId)?.title || `微信 · ${identity.nickname}`,
          })
          await this._replyToWeixin(receiveTarget, buildSessionCreatingText())
          await runResumePostAction({
            pendingMessage: null,
            clearPendingMessage: () => this.pendingInboundMessages.delete(mapKey),
            wasActivated: false,
            notifyMessageReceived: () => {
              this._notifyFrontend('weixin:messageReceived', {
                sessionId: newId,
                accountId: message.accountId,
                targetId: message.targetId,
                from: message.from,
                text: 'hello',
                images: [],
                senderNick: identity.nickname,
                timestamp: Date.now(),
                messageId: null
              })
            },
            replayPendingMessage: async () => {},
            enqueueHello: async () => {
              this._rememberSessionTarget(newId, message)
              await this.agentSessionManager.sendMessage(newId, 'hello', {
                meta: {
                  origin: 'im-inbound',
                  imChannel: 'weixin',
                  senderNick: identity.nickname,
                  accountId: message.accountId,
                  targetId: message.targetId,
                  from: message.from,
                  contextToken: message.contextToken || null,
                  createTimeMs: message.createTimeMs || null
                }
              })
            },
          })
        },
        resume: async ({ args }) => {
          let history = await this._sessionMapper._queryHistorySessions(identity)
          history = this._mergeCurrentSessionIntoHistory(history, currentSessionId, identity)
          if (!history || history.length === 0) {
            await this._replyToWeixin(receiveTarget, buildNoHistoryText())
            return
          }
          const selectedIndex = Number.parseInt(args[0], 10)
          if (Number.isNaN(selectedIndex)) {
            this.pendingInboundMessages.delete(mapKey)
            this._sessionMapper.initPendingChoice(mapKey, history, async (menuText) => {
              await this._replyToWeixin(receiveTarget, menuText)
            }, {
              menuBuilder: (sessions) => this._buildHistoryChoiceMenuText(sessions, currentSessionId),
            }).catch(err => {
              console.error('[WeixinBridge] initPendingChoice failed:', err?.message || err)
            })
            return
          }

          const currentSession = currentSessionId ? this.agentSessionManager.sessions.get(currentSessionId) : null
          if (currentSession?.status === 'streaming') {
            await this._replyToWeixin(receiveTarget, 'AI 正在响应中，请等待完成后再操作')
            return
          }

          const result = await this._sessionMapper.handleDirectChoice(mapKey, history, String(selectedIndex), identity)
          if (result?.invalidChoice) {
            await this._replyToWeixin(receiveTarget, result.menuText || '编号错误')
            return
          }
          if (!result?.sessionId) {
            await this._replyToWeixin(receiveTarget, '无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话')
            return
          }
          const resumedSession = this.agentSessionManager.sessions.get(result.sessionId) || null
          const shouldWaitForReply = resumedSession?.status === 'streaming'
          this._notifyFrontend('weixin:sessionCreated', {
            sessionId: result.sessionId,
            accountId: message.accountId,
            targetId: message.targetId,
            from: message.from,
            senderNick: identity.nickname,
            title: resumedSession?.title || result.selectedSession?.title || result.sessionId,
          })
          if (result.action === 'resume') {
            if (currentSessionId && currentSessionId === result.sessionId && result.wasActivated && !shouldWaitForReply) {
              await this._replyToWeixin(receiveTarget, buildAlreadyConnectedText(result.selectedSession?.title || result.sessionId))
            } else if (result.wasActivated) {
              await this._replyToWeixin(
                receiveTarget,
                shouldWaitForReply
                  ? buildSessionReplyingText(result.selectedSession?.title || result.sessionId)
                  : buildSessionSwitchedText(result.selectedSession?.title || result.sessionId)
              )
            } else {
              await this._replyToWeixin(receiveTarget, buildSessionActivatingText())
            }
          } else {
            await this._replyToWeixin(receiveTarget, buildSessionCreatingText())
          }
          await runResumePostAction({
            pendingMessage: null,
            clearPendingMessage: () => this.pendingInboundMessages.delete(mapKey),
            wasActivated: result.wasActivated,
            notifyMessageReceived: () => {
              this._notifyFrontend('weixin:messageReceived', {
                sessionId: result.sessionId,
                accountId: message.accountId,
                targetId: message.targetId,
                from: message.from,
                text: 'hello',
                images: [],
                senderNick: identity.nickname,
                timestamp: Date.now(),
                messageId: null
              })
            },
            replayPendingMessage: async () => {},
            enqueueHello: async () => {},
          })
        },
        rename: async ({ args }) => {
          const renameDecision = resolveRenameCommand({
            args,
            currentSessionId,
          })
          if (renameDecision.action === 'missing_current') {
            await this._replyToWeixin(receiveTarget, buildRenameMissingSessionText())
            return
          }
          if (renameDecision.action === 'missing_title') {
            await this._replyToWeixin(receiveTarget, buildRenamePromptText())
            return
          }
          this.agentSessionManager.rename(renameDecision.sessionId, renameDecision.newTitle)
          await this._replyToWeixin(receiveTarget, buildRenameSuccessText(renameDecision.newTitle))
        },
      },
      onUnknown: async ({ rawCommand }) => {
        await this._replyToWeixin(receiveTarget, buildUnknownCommandText(rawCommand))
      },
    })
    logWeixinQueueTiming('command dispatch done', {
      command: String(text || '').trim(),
      mapKey,
      targetId: message?.targetId || null,
      totalElapsedMs: Date.now() - commandStartedAt,
    })
  }

  _cmdHelp() {
    const helpText = buildImCommandHelpText({
      title: '微信 Agent 桥接命令:',
      includeDirectoryArg: false,
      includeHistoryHint: false,
    })
    return helpText
      .split('\n')
      .map(line => line.trimEnd())
      .filter(Boolean)
      .join('\n\n')
  }

  _cmdStatus(identity, currentSessionId = null) {
    const history = this._mergeCurrentSessionIntoHistory(
      this.agentSessionManager?.sessionDatabase?.getImSessionsByType?.('weixin', identity.userId || '', '', 10) || [],
      currentSessionId,
      identity
    )
    if (!Array.isArray(history) || history.length === 0) {
      return buildNoHistoryText()
    }
    return buildHistoryChoiceMenuText({
      sessions: history,
      currentSessionId,
      maxSessions: 10,
      getDirName: (cwd) => (cwd ? path.basename(cwd) : '-'),
      isSessionActivated: (sessionId) => !!this.agentSessionManager?.sessions?.get?.(sessionId)?.queryGenerator,
      title: '当前会话状态：',
      includeActionHint: false,
      includeNewSessionHint: false,
    })
  }

  _mergeCurrentSessionIntoHistory(history, sessionId, identity = {}) {
    const rows = Array.isArray(history) ? history : []
    if (!sessionId) return rows

    const hasCurrent = rows.some(row => {
      const rowSessionId = row?.session_id || row?.sessionId || row?.id || null
      return rowSessionId === sessionId
    })
    if (hasCurrent) return rows

    const liveSession = this.agentSessionManager.sessions.get(sessionId)
    const dbRow = this.agentSessionManager?.sessionDatabase?.getAgentConversation?.(sessionId)
    const currentRow = buildCurrentImHistoryRow({
      sessionId,
      liveSession,
      dbRow,
      imChannel: 'weixin',
      imUserId: dbRow?.im_user_id || identity.userId || '',
      imChatId: '',
      imChatType: 'p2p',
      type: 'chat',
      source: 'im-inbound',
    })

    return mergeCurrentSessionIntoHistory({
      history: rows,
      currentSessionId: sessionId,
      currentRow,
    })
  }

  async _replyToWeixin(message, text) {
    if (!this.weixinNotifyService?.sendText) return
    const replyStartedAt = Date.now()
    logWeixinQueueTiming('reply send start', {
      targetId: message?.targetId || null,
      sessionId: this.sessionMap.get(message.targetId) || null,
      textPreview: String(text || '').slice(0, 80),
    })
    try {
      await this.weixinNotifyService.sendText({
        accountId: message.accountId,
        targetId: message.targetId,
        text,
        sessionId: this.sessionMap.get(message.targetId) || null,
      })
      logWeixinQueueTiming('reply send done', {
        targetId: message?.targetId || null,
        sessionId: this.sessionMap.get(message.targetId) || null,
        elapsedMs: Date.now() - replyStartedAt,
        textPreview: String(text || '').slice(0, 80),
      })
    } catch (err) {
      logWeixinQueueTiming('reply send failed', {
        targetId: message?.targetId || null,
        sessionId: this.sessionMap.get(message.targetId) || null,
        elapsedMs: Date.now() - replyStartedAt,
        error: err?.message || String(err),
      })
      console.error('[WeixinBridge] Command reply failed:', err.message)
    }
  }

  _notifyFrontend(channel, data) {
    const targetWindow = this.mainWindow || this.agentSessionManager?.mainWindow
    if (!targetWindow || targetWindow.isDestroyed?.()) return
    targetWindow.webContents?.send(channel, data)
  }
}

module.exports = { WeixinBridge }

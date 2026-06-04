/**
 * Weixin Bridge
 * Receives inbound Weixin notify messages and displays them in desktop Agent sessions.
 */

const path = require('path')
const { extractImagePaths, normalizePath, IMAGE_EXTENSIONS, IMAGE_PATH_MAX_DEPTH } = require('./im-utils')
const { buildImCommandHelpText, buildNoHistoryText } = require('./im-command-policy')
const { buildHistoryChoiceMenuText } = require('./im-command-presenter')

class WeixinBridge {
  constructor(configManager, agentSessionManager, weixinNotifyService, mainWindow) {
    this.configManager = configManager
    this.agentSessionManager = agentSessionManager
    this.weixinNotifyService = weixinNotifyService
    this.mainWindow = mainWindow
    this.sessionMap = new Map()
    this.knownTargets = new Map()
    this.sessionTargets = new Map()
    this.pendingReplies = new Map()
    this.replySendQueues = new Map()
    this.desktopPendingBlocks = new Map()
    this.inboundMessageQueues = new Map()
    this.inboundCompletionWaiters = new Map()
    this._unbindMessage = null
    this._unbindSent = null
    this._agentListeners = null
  }

  start() {
    if (!this.weixinNotifyService || this._unbindMessage) return false
    this._unbindMessage = this.weixinNotifyService.on('message', (message) => {
      this._enqueueInboundMessage(message)
    })
    this._unbindSent = this.weixinNotifyService.on('sent', (message) => {
      this._rememberSentSession(message)
    })
    this._bindAgentEvents()
    return true
  }

  stop() {
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
    this.sessionMap.clear()
    this._resolveInboundCompletionWaiters()
  }

  _enqueueInboundMessage(message) {
    const mapKey = this._getMapKey(message)
    const previous = this.inboundMessageQueues.get(mapKey) || Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(() => this._handleMessageAndWait(message))
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

  async _handleMessageAndWait(message) {
    const sessionId = await this._handleMessage(message)
    if (!sessionId) return null
    return this._waitForAgentCompletion(sessionId)
  }

  _waitForAgentCompletion(sessionId) {
    if (!sessionId) return Promise.resolve()
    const session = this.agentSessionManager?.sessions?.get(sessionId)
    if (!session || session.status !== 'streaming') return Promise.resolve()

    return new Promise(resolve => {
      const waiters = this.inboundCompletionWaiters.get(sessionId) || []
      waiters.push(resolve)
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

    // 命令拦截
    if (text.startsWith('/')) {
      return this._handleWeixinCommand(text, message)
    }

    const session = this._ensureSession(message)
    const senderNick = this._getTargetDisplayName(message)
    this._rememberSessionTarget(session.id, message)
    const userMessage = images.length > 0 ? { text, images } : text
    await this.agentSessionManager.sendMessage(session.id, userMessage, {
      meta: {
        source: 'im-inbound',
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
      .find(item => item.role === 'user' && item.source === 'im-inbound' && item.content === (text || '[图片]'))

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
      userMessage: ({ sessionId, imChannel, content, images, source }) => {
        const hasBinding = this.sessionTargets.has(sessionId)
        if (source !== 'im-inbound' && (imChannel === 'weixin' || hasBinding)) {
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

  _ensureSession(message) {
    const mapKey = this._getMapKey(message)
    const existingSessionId = this.sessionMap.get(mapKey)
    if (existingSessionId) {
      const existingSession = this._resolveSession(existingSessionId)
      if (existingSession) return existingSession
      this.sessionMap.delete(mapKey)
    }

    const senderNick = this._getTargetDisplayName(message)
    const session = this.agentSessionManager.create({
      type: 'chat',
      source: 'im-inbound',
      imChannel: 'weixin',
      title: `微信 · ${senderNick}`,
      cwdSubDir: 'weixin',
      meta: {
        accountId: message.accountId,
        targetId: message.targetId,
        from: message.from
      }
    })

    this.sessionMap.set(mapKey, session.id)
    this._notifyFrontend('weixin:sessionCreated', {
      sessionId: session.id,
      accountId: message.accountId,
      targetId: message.targetId,
      from: message.from,
      senderNick,
      title: session.title
    })

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

  _getTargetDisplayName(message) {
    return message?.target?.displayName || message?.from || message?.targetId || '未知用户'
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
      db.updateImIdentity(sessionId, { userId: targetId, chatId: accountId, chatType: 'p2p' })
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
      const accountId = typeof row?.im_chat_id === 'string' ? row.im_chat_id.trim() : ''
      if (targetId && accountId && row?.im_channel === 'weixin' && row?.status !== 'closed') {
        target = { accountId, targetId, displayName: targetId }
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

  async _handleWeixinCommand(text, message) {
    const cmd = text.replace(/^\/+/, '').split(/\s+/)[0].toLowerCase()

    if (cmd === 'help') {
      return this._replyToWeixin(message, this._cmdHelp())
    }
    if (cmd === 'status') {
      return this._replyToWeixin(message, this._cmdStatus(message))
    }

    return this._replyToWeixin(message, `未知命令: ${cmd}\n发送 /help 查看可用命令`)
  }

  _cmdHelp() {
    return buildImCommandHelpText({
      title: '微信 Agent 桥接命令:',
      includeDirectoryArg: false,
      includeHistoryHint: false,
    })
  }

  _cmdStatus(message) {
    const sessionId = this.sessionMap.get(message.targetId)
    if (!sessionId) return buildNoHistoryText()

    const session = this.agentSessionManager.sessions.get(sessionId)
    if (!session) return buildNoHistoryText()

    const dir = session.cwd ? path.basename(session.cwd) : '-'
    const status = session.status === 'streaming' ? '🟢 执行中' : '⭕ 空闲'
    return `当前会话状态：\n\n1. ${status} ${session.title || '未命名'} (${dir})`
  }

  async _replyToWeixin(message, text) {
    if (!this.weixinNotifyService?.sendText) return
    try {
      await this.weixinNotifyService.sendText({
        accountId: message.accountId,
        targetId: message.targetId,
        text,
        sessionId: this.sessionMap.get(message.targetId) || null,
      })
    } catch (err) {
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

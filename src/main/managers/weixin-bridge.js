/**
 * Weixin Bridge
 * Receives inbound Weixin notify messages and displays them in desktop Agent sessions.
 */

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|bmp)$/i
const IMAGE_PATH_MAX_DEPTH = 10

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
    this.desktopPendingBlocks = new Map()
    this._unbindMessage = null
    this._unbindSent = null
    this._agentListeners = null
  }

  start() {
    if (!this.weixinNotifyService || this._unbindMessage) return false
    this._unbindMessage = this.weixinNotifyService.on('message', (message) => {
      this._handleMessage(message).catch(err => {
        console.error('[WeixinBridge] Message handling error:', err)
      })
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
    this.desktopPendingBlocks.clear()
  }

  async _handleMessage(message) {
    const text = String(message?.text || '').trim()
    const images = Array.isArray(message?.images) ? message.images : []
    if (!text && images.length === 0) return null

    const session = this._ensureSession(message)
    const senderNick = this._getTargetDisplayName(message)
    this._rememberSessionTarget(session.id, message)
    const userMessage = images.length > 0 ? { text, images } : text
    await this.agentSessionManager.sendMessage(session.id, userMessage, {
      meta: {
        source: 'weixin',
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
      .find(item => item.role === 'user' && item.source === 'weixin' && item.content === (text || '[图片]'))

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
      userMessage: ({ sessionId, sessionType, content, images, source }) => {
        if (source !== 'weixin' && sessionType === 'weixin') {
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
        })
      },
      agentError: (sessionId) => {
        this.pendingReplies.delete(sessionId)
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

    const pending = this.pendingReplies.get(sessionId) || { textChunks: [] }
    this._collectTextChunks(pending, message)
    this._collectImagePaths(pending, message)
    if (pending.textChunks.length > 0) {
      this.pendingReplies.set(sessionId, pending)
    } else if (pending.imagePaths?.size > 0) {
      this.pendingReplies.set(sessionId, pending)
    }
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
    const blocks = Array.isArray(message?.content) ? message.content : []
    if (!pending.imagePaths) pending.imagePaths = new Set()
    for (const block of blocks) {
      if (block?.type === 'tool_use' && block.input) {
        this._extractImagePaths(block.input).forEach(filePath => pending.imagePaths.add(filePath))
      }
    }
  }

  async _flushAgentReply(sessionId) {
    if (this.desktopPendingBlocks.has(sessionId)) {
      return this._flushDesktopIntervention(sessionId)
    }

    const target = this.sessionTargets.get(sessionId)
    const pending = this.pendingReplies.get(sessionId)
    this.pendingReplies.delete(sessionId)

    const text = pending?.textChunks?.join('\n\n').trim() || ''
    const imagePaths = [...(pending?.imagePaths || [])]
    if (!target || (!text && imagePaths.length === 0)) return null

    if (imagePaths.length > 0 && this.weixinNotifyService.sendImages) {
      return this.weixinNotifyService.sendImages({
        accountId: target.accountId,
        targetId: target.targetId,
        text,
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
    const msysMatch = filePath.match(/^\/([a-zA-Z])\/(.*)$/)
    if (msysMatch) {
      return `${msysMatch[1].toUpperCase()}:/${msysMatch[2]}`
    }
    return filePath
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
      type: 'weixin',
      source: 'weixin',
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

    const session = this._resolveSession(sessionId)
    if (!session) return

    const mapKey = this._getMapKey(message)
    this.sessionMap.set(mapKey, session.id)
    this._rememberKnownTarget(session.id, message)
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

  _notifyFrontend(channel, data) {
    const targetWindow = this.mainWindow || this.agentSessionManager?.mainWindow
    if (!targetWindow || targetWindow.isDestroyed?.()) return
    targetWindow.webContents?.send(channel, data)
  }
}

module.exports = { WeixinBridge }

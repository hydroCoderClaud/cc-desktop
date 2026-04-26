/**
 * DingTalk Bridge
 * 钉钉机器人桥接模块：通过 Stream 模式接收钉钉消息，转发给 Agent 会话，回复结果到钉钉
 */

const { DWClient } = require('dingtalk-stream-sdk-nodejs')
const fs = require('fs')
const path = require('path')

const imageMixin = require('./dingtalk-image')
const commandsMixin = require('./dingtalk-commands')

// 钉钉桥接翻译字典
const DINGTALK_I18N = {
  'zh-CN': {
    sessionActivating: '会话恢复中，请等待信息返回后，即可开始聊天',
    sessionCreating: '会话创建中，请等待信息返回后，即可开始聊天',
    alreadyConnected: '您选择的是当前会话，无需重新连接，请继续聊天',
    sessionSwitched: '✅ 已切换到会话：{title}\n\n现在可以继续对话了',
    replyTitle: 'CC Agent 回复'
  },
  'en-US': {
    sessionActivating: 'Session activating, please wait for the response to start chatting',
    sessionCreating: 'Session creating, please wait for the response to start chatting',
    alreadyConnected: 'You selected the current session, no need to reconnect, please continue chatting',
    sessionSwitched: '✅ Switched to session: {title}\n\nYou can continue chatting now',
    replyTitle: 'CC Agent Reply'
  }
}

class DingTalkBridge {
  /**
   * @param {Object} configManager - ConfigManager 实例
   * @param {Object} agentSessionManager - AgentSessionManager 实例
   * @param {BrowserWindow} mainWindow - 主窗口（用于通知前端）
   */
  constructor(configManager, agentSessionManager, mainWindow) {
    this.configManager = configManager
    this.agentSessionManager = agentSessionManager
    this.mainWindow = mainWindow

    this.client = null
    this.connected = false

    // 钉钉用户+会话 → Agent 会话映射：{ "staffId:conversationId": sessionId }
    this.sessionMap = new Map()

    // 响应收集器：{ sessionId: { chunks, resolve, webhook } }
    this.responseCollectors = new Map()

    // 消息去重：记录最近处理过的 msgId，防止 SDK 重投导致重复处理
    this._processedMsgIds = new Map() // msgId → timestamp
    this._MSG_ID_TTL = 10 * 60 * 1000 // 10 分钟后清理
    this._msgIdCleanupTimer = setInterval(() => {
      const cutoff = Date.now() - this._MSG_ID_TTL
      for (const [id, ts] of this._processedMsgIds) {
        if (ts < cutoff) this._processedMsgIds.delete(id)
      }
    }, 60 * 1000) // 每分钟扫一次

    // 每个会话的消息处理队列（Promise chain），确保串行处理
    this._sessionProcessQueues = new Map()

    // 待选择状态：用户发消息时有历史会话，等待用户选择继续或新建
    // key: "staffId:conversationId"，value: { sessions, originalMessage, robotCode, senderStaffId, timer }
    this._pendingChoices = new Map()
    this._CHOICE_TTL = 10 * 60 * 1000 // 10 分钟无响应则超时清除

    // 钉钉 access token 缓存
    this._accessToken = null
    this._accessTokenExpiresAt = 0

    // CC 桌面介入同步：每个钉钉会话最近一次的 webhook 信息（用于回传）
    // key: sessionId, value: { webhook, robotCode, senderStaffId }
    this._sessionWebhooks = new Map()

    // CC 桌面介入时待发送的 Q&A 块
    // key: sessionId, value: { userInput, inputImages[], textChunks[], imagePaths }
    this._desktopPendingBlocks = new Map()

    // 连接健康监控：SDK 重连失败时由外层兜底
    this._reconnectWatchdog = null

    // 监听 AgentSessionManager 内部事件（替代 messageListener 注入模式）
    this._bindAgentEvents()
  }

  /**
   * 绑定 AgentSessionManager 内部事件
   * 替代原来通过 agentSessionManager.messageListener = this 注入的模式
   */
  _bindAgentEvents() {
    const mgr = this.agentSessionManager

    // 保存 listener 引用，destroy 时精确移除
    this._listeners = {
      userMessage: ({ sessionId, sessionType, content, images, source }) => {
        // 非钉钉来源 + 钉钉类型会话 → CC 桌面介入，同步给钉钉
        if (source !== 'dingtalk' && sessionType === 'dingtalk') {
          try { this.onUserMessage(sessionId, content, images) } catch (e) {
            console.error('[DingTalk] onUserMessage threw:', e)
          }
        }
      },
      agentMessage: (sessionId, message) => {
        try { this.onAgentMessage(sessionId, message) } catch (e) {
          console.error('[DingTalk] onAgentMessage threw:', e)
        }
      },
      agentResult: (sessionId) => {
        try { this.onAgentResult(sessionId) } catch (e) {
          console.error('[DingTalk] onAgentResult threw:', e)
        }
      },
      agentError: (sessionId, error) => {
        try { this.onAgentError(sessionId, error) } catch (e) {
          console.error('[DingTalk] onAgentError threw:', e)
        }
      }
    }

    for (const [event, fn] of Object.entries(this._listeners)) {
      mgr.on(event, fn)
    }
  }

  /**
   * 启动钉钉桥接（根据配置决定是否启动）
   */
  async start() {
    const config = this.configManager.getConfig()
    const { enabled, appKey, appSecret } = config.dingtalk || {}

    if (!enabled || !appKey || !appSecret) {
      console.log('[DingTalk] Bridge disabled or not configured')
      return false
    }

    try {
      await this._connect(appKey, appSecret)
      return true
    } catch (err) {
      console.error('[DingTalk] Failed to start:', err.message)
      this._notifyFrontend('dingtalk:error', { error: err.message })
      return false
    }
  }

  /**
   * 停止钉钉桥接
   */
  async stop() {
    if (this._reconnectWatchdog) {
      clearTimeout(this._reconnectWatchdog)
      this._reconnectWatchdog = null
    }
    if (this.client) {
      try {
        this.client.disconnect()
      } catch (e) {
        // ignore
      }
      this.client = null
    }
    this.connected = false
    for (const collector of this.responseCollectors.values()) clearTimeout(collector.timer)
    this.responseCollectors.clear()
    if (this._msgIdCleanupTimer) {
      clearInterval(this._msgIdCleanupTimer)
      this._msgIdCleanupTimer = null
    }
    this._processedMsgIds.clear()
    this._sessionProcessQueues.clear()
    for (const choice of this._pendingChoices.values()) clearTimeout(choice.timer)
    this._pendingChoices.clear()
    this._sessionWebhooks.clear()
    this._desktopPendingBlocks.clear()
    console.log('[DingTalk] Bridge stopped')
    this._notifyFrontend('dingtalk:statusChange', { connected: false })
  }

  /**
   * 重启（配置变更后调用）
   */
  async restart() {
    await this.stop()
    return this.start()
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      connected: this.connected,
      activeSessions: this.sessionMap.size
    }
  }

  /**
   * 销毁实例，解绑事件监听器
   * 用于 DingTalkBridge 需要销毁重建时（如重新配置）
   */
  destroy() {
    // 先停止连接和清理资源
    this.stop()
    // 解绑 AgentSessionManager 事件监听器（精确移除自身绑定的 listener）
    if (this.agentSessionManager && this._listeners) {
      for (const [event, fn] of Object.entries(this._listeners)) {
        this.agentSessionManager.off(event, fn)
      }
      this._listeners = null
    }
    console.log('[DingTalk] Bridge destroyed, event listeners unbound')
  }

  // ==================== 内部方法 ====================

  /**
   * 获取翻译文本
   */
  _t(key) {
    const config = this.configManager.getConfig()
    const locale = config?.settings?.locale || 'zh-CN'
    return DINGTALK_I18N[locale]?.[key] || DINGTALK_I18N['zh-CN'][key]
  }

  /**
   * 建立 WebSocket 连接
   */
  async _connect(appKey, appSecret) {
    this.client = new DWClient({
      clientId: appKey,
      clientSecret: appSecret,
      keepAlive: true  // 启用客户端心跳（ping/pong），检测死连接
    })
    this.client.heartbeat_interval = 30 * 1000 // 30 秒心跳（SDK 默认 8 秒过于频繁）

    // 注册机器人消息回调
    // 重要：回调必须立即返回，否则 SDK 收不到 ACK 会重投消息
    this.client.registerCallbackListener(
      '/v1.0/im/bot/messages/get',
      (res) => {
        this._handleDingTalkMessage(res).catch(err => {
          console.error('[DingTalk] Message handling error:', err)
        })
        // 立即返回，不等待处理完成
      }
    )

    // 连接
    await this.client.connect()
    this.connected = true
    console.log('[DingTalk] Bridge connected')
    this._notifyFrontend('dingtalk:statusChange', { connected: true })

    // 监听 SDK 内部 socket 事件，同步连接状态 + 兜底重连
    this._hookSocketEvents()
  }

  /**
   * 监听 SDK 内部 socket 事件
   * - 同步 connected 状态到前端（问题 3）
   * - SDK 重连失败时启动外层兜底重连（问题 2）
   *
   * 注意：SDK 重连时会创建新 socket 实例，旧 socket 的 open 事件不会触发。
   * 因此只监听 close，重连成功的检测交给 watchdog 轮询 client.registered。
   */
  _hookSocketEvents() {
    const socket = this.client?.socket
    if (!socket) return

    socket.once('close', () => {
      if (this.connected) {
        this.connected = false
        console.log('[DingTalk] Socket closed, waiting for SDK reconnect...')
        this._notifyFrontend('dingtalk:statusChange', { connected: false })
      }
      // 启动兜底：定期检查 SDK 是否已自动重连成功
      this._startReconnectWatchdog()
    })
  }

  /**
   * 启动重连兜底定时器
   * SDK 内置重连只尝试一次（1 秒后），且失败时 Promise rejection 无人捕获，静默放弃。
   * 外层兜底策略：
   *   - 10 秒后首次检查：SDK 是否已自动重连成功（检查 client.registered）
   *   - 成功 → 同步状态 + 重新 hook 新 socket
   *   - 失败 → 执行完整 restart，再失败则持续重试（间隔递增，最长 5 分钟）
   */
  _startReconnectWatchdog() {
    this._clearReconnectWatchdog()
    this._reconnectWatchdog = setTimeout(() => {
      this._reconnectWatchdog = null

      // SDK 可能已自动重连成功（创建了新 socket）
      if (this.client?.registered) {
        this.connected = true
        console.log('[DingTalk] SDK auto-reconnected successfully')
        this._notifyFrontend('dingtalk:statusChange', { connected: true })
        this._hookSocketEvents() // hook 新 socket
        return
      }

      console.log('[DingTalk] SDK reconnect appears to have failed, performing full restart...')
      this._watchdogRestart(30 * 1000) // 首次失败后 30 秒重试
    }, 10 * 1000)
  }

  /**
   * watchdog 重连：restart 失败后按递增间隔持续重试，最长 5 分钟
   */
  _watchdogRestart(nextDelay) {
    this.restart().then(ok => {
      if (ok) return // restart 成功，_connect 内部会重新 hookSocketEvents
      // restart 返回 false（start 内部 catch 了异常）
      const cappedDelay = Math.min(nextDelay, 5 * 60 * 1000)
      console.log(`[DingTalk] Watchdog restart failed, retrying in ${cappedDelay / 1000}s...`)
      this._reconnectWatchdog = setTimeout(() => {
        this._reconnectWatchdog = null
        if (this.connected) return
        this._watchdogRestart(cappedDelay * 2) // 指数退避
      }, cappedDelay)
    }).catch(err => {
      // restart 本身不应该抛异常（内部有 try/catch），但防御性处理
      console.error('[DingTalk] Watchdog restart unexpected error:', err.message)
      this._reconnectWatchdog = setTimeout(() => {
        this._reconnectWatchdog = null
        if (this.connected) return
        this._watchdogRestart(60 * 1000)
      }, 60 * 1000)
    })
  }

  /**
   * 清除重连兜底定时器
   */
  _clearReconnectWatchdog() {
    if (this._reconnectWatchdog) {
      clearTimeout(this._reconnectWatchdog)
      this._reconnectWatchdog = null
    }
  }

  /**
   * 处理钉钉消息
   */
  async _handleDingTalkMessage(res) {
    let data
    try {
      data = JSON.parse(res.data)
    } catch (e) {
      console.error('[DingTalk] Failed to parse message data:', e.message, res.data)
      return
    }
    const { msgId, msgtype, text, content, senderStaffId, senderNick, sessionWebhook, robotCode, conversationId, conversationTitle, conversationType } = data

    console.log('[DingTalk] _handleDingTalkMessage: msgId:', msgId, 'msgtype:', msgtype, 'text:', text?.content?.substring(0, 50))

    // 消息去重：SDK 未及时收到 ACK 时会重投同一条消息
    if (msgId && this._processedMsgIds.has(msgId)) {
      console.log(`[DingTalk] Duplicate message ${msgId}, skipping`)
      return
    }
    if (msgId) {
      this._processedMsgIds.set(msgId, Date.now())
    }

    // 命令拦截：文本消息以 / 开头时作为命令处理，不进入 Agent 对话
    if (msgtype !== 'picture' && msgtype !== 'richText') {
      const rawText = (text?.content || '').trim()
      if (rawText.startsWith('/')) {
        console.log('[DingTalk] _handleDingTalkMessage: detected command:', rawText)
        const mapKey = `${senderStaffId}:${conversationId || 'default'}`
        await this._handleCommand(rawText, sessionWebhook, {
          robotCode, senderStaffId, senderNick, conversationId, conversationTitle, conversationType, mapKey
        })
        return
      }
    }

    // 如果有待选择状态，优先处理（用户正在选择历史会话）
    const mapKey = `${senderStaffId}:${conversationId || 'default'}`
    if (this._pendingChoices.has(mapKey)) {
      const choiceText = text?.content?.trim()
      await this._handlePendingChoice(mapKey, choiceText, sessionWebhook, { robotCode, senderStaffId, senderNick, conversationId, conversationTitle, conversationType })
      return
    }

    // 根据消息类型构建 Agent 消息
    let agentMessage = null  // string 或 { text, images }
    let displayText = ''     // 用于前端显示和日志

    if (msgtype === 'picture') {
      // 图片消息
      const downloadCode = content?.downloadCode
      if (!downloadCode) return

      console.log(`[DingTalk] Picture from ${senderNick}(${senderStaffId})`)

      try {
        const imageData = await this._downloadImage(downloadCode, robotCode)
        agentMessage = {
          text: '',
          images: [imageData]
        }
        displayText = '[图片]'
      } catch (err) {
        console.error(`[DingTalk] Image download failed:`, err.message)
        return
      }
    } else if (msgtype === 'richText') {
      // 富文本消息（可能包含图片+文字混合）
      const richTextContent = content?.richText || []
      const textParts = []
      const images = []

      for (const section of richTextContent) {
        if (section.text) {
          textParts.push(section.text)
        }
        if (section.downloadCode) {
          try {
            const imageData = await this._downloadImage(section.downloadCode, robotCode)
            images.push(imageData)
          } catch (err) {
            console.error(`[DingTalk] RichText image download failed:`, err.message)
          }
        }
      }

      const combinedText = textParts.join('\n').trim()
      if (!combinedText && images.length === 0) return

      if (images.length > 0) {
        agentMessage = { text: combinedText, images }
        displayText = combinedText || `[图片x${images.length}]`
      } else {
        agentMessage = combinedText
        displayText = combinedText
      }

      console.log(`[DingTalk] RichText from ${senderNick}: text=${combinedText.substring(0, 30)}, images=${images.length}`)
    } else {
      // 文本消息（默认）
      const userText = text?.content?.trim()
      if (!userText) return

      agentMessage = userText
      displayText = userText
      console.log(`[DingTalk] Message from ${senderNick}(${senderStaffId}): ${userText.substring(0, 50)}`)
    }

    // 查找或创建 Agent 会话
    const result = await this._ensureSession(senderStaffId, senderNick, conversationId, conversationTitle)

    // 有历史会话需要用户选择：发送菜单并等待
    if (result && result.needsChoice) {
      this._setPendingChoice(mapKey, { sessions: result.sessions, originalMessage: agentMessage, robotCode, senderStaffId })
      await this._sendChoiceMenu(sessionWebhook, result.sessions)
      return
    }

    const sessionId = result

    // 通知前端：收到钉钉消息（立即通知，不等待处理）
    const notification = { sessionId, senderNick, text: displayText }
    // 图片消息：附带 base64 数据供前端气泡显示
    if (agentMessage && typeof agentMessage === 'object' && agentMessage.images) {
      notification.images = agentMessage.images.map(img => ({
        base64: img.base64,
        mediaType: img.mediaType
      }))
    }
    this._notifyFrontend('dingtalk:messageReceived', notification)

    // 使用 promise chain 确保同一会话的消息串行处理（消除竞态条件）
    this._enqueueMessage(sessionId, agentMessage, sessionWebhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType })
  }

  /**
   * 处理单条消息（在 promise chain 中串行执行，无竞态）
   */
  async _processOneMessage(sessionId, userMessage, sessionWebhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType } = {}) {
    console.log(`[DingTalk] _processOneMessage: sessionId=${sessionId}`)

    // 更新会话的最近 webhook（用于 CC 桌面介入时回传给钉钉）
    if (sessionWebhook) {
      this._sessionWebhooks.set(sessionId, { webhook: sessionWebhook, robotCode, senderStaffId, conversationId, conversationType })
    }

    // 设置响应处理器（每段文本即时发送到钉钉）
    const donePromise = this._setupResponseHandler(sessionId, sessionWebhook, { robotCode, senderStaffId, conversationId, conversationType })

    // 发送到 Agent（userMessage 可以是 string 或 { text, images }）
    // 附带钉钉元数据，用于持久化来源信息
    const meta = { source: 'dingtalk', senderNick, conversationId }
    try {
      await this.agentSessionManager.sendMessage(sessionId, userMessage, { meta })
    } catch (err) {
      console.error(`[DingTalk] sendMessage failed:`, err.message)
      // 会话正在 streaming（CC 桌面介入中）：友好提示，不报错
      if (err.message && err.message.includes('already streaming')) {
        await this._replyToDingTalk(sessionWebhook, '⏳ 正在处理中，请稍候再试')
      } else {
        await this._replyToDingTalk(sessionWebhook, `❌ 错误: ${err.message}`)
      }
      const failedCollector = this.responseCollectors.get(sessionId)
      if (failedCollector) clearTimeout(failedCollector.timer)
      this.responseCollectors.delete(sessionId)
      return
    }

    // 等待 Agent 处理完成（result 事件触发）
    try {
      await donePromise
    } catch (err) {
      console.error(`[DingTalk] Response handling failed:`, err.message)
    }
  }

  /**
   * 确保钉钉用户+会话有对应的 Agent 会话
   * - 内存命中 → 直接返回 sessionId
   * - DB 有历史记录 → 返回 { needsChoice: true, sessions } 让用户选择
   * - 无历史 → 新建并返回 sessionId
   */
  async _ensureSession(staffId, nickname, conversationId, conversationTitle) {
    const mapKey = `${staffId}:${conversationId || 'default'}`
    let sessionId = this.sessionMap.get(mapKey)

    // 内存中有映射 → 先检查 DB 状态，再决定是否恢复
    if (sessionId) {
      const db = this.agentSessionManager.sessionDatabase
      const row = db && db.getAgentConversation(sessionId)

      if (!row) {
        // 会话已被物理删除 → 清除所有相关状态，走历史查询/新建流程
        console.log(`[DingTalk] Session ${sessionId} not found in DB, clearing mapping`)
        this._clearSessionState(sessionId, mapKey)
      } else if (row.status === 'closed') {
        // CC 桌面主动关闭 → 清除所有相关状态，让用户重新选择
        console.log(`[DingTalk] Session ${sessionId} was closed by desktop, will ask user to choose`)
        this._clearSessionState(sessionId, mapKey)
      } else {
        // 会话状态正常（idle/streaming）→ 恢复
        const session = this.agentSessionManager.reopen(sessionId)
        if (session) {
          // 更新会话的 conversationId（确保会话属于当前钉钉对话）
          if (!session.meta) session.meta = {}
          session.meta.conversationId = conversationId
          return sessionId
        }
        this._clearSessionState(sessionId, mapKey)
      }
      // 三种情况均继续向下走：查询历史 → 触发选择菜单 或 新建
    }

    // 从 DB 查历史会话
    const db = this.agentSessionManager.sessionDatabase
    if (db && conversationId) {
      const limit = this.configManager.getConfig()?.dingtalk?.maxHistorySessions || 5
      const sessions = db.getDingTalkSessions(staffId, conversationId, limit)
      if (sessions.length > 0) {
        // 有历史会话，交由用户选择（而非自动恢复）
        return { needsChoice: true, sessions }
      }
    }

    // 无历史会话 → 新建
    return this._createNewSession(staffId, nickname, conversationId, conversationTitle, mapKey)
  }

  /**
   * 新建 Agent 会话（供 _ensureSession 和 _handlePendingChoice 共用）
   */
  async _createNewSession(staffId, nickname, conversationId, conversationTitle, mapKey, { cwd } = {}) {
    const title = conversationTitle
      ? `钉钉 · ${conversationTitle} · ${nickname || staffId}`
      : `钉钉 · ${nickname || staffId}`

    const session = this.agentSessionManager.create({
      type: 'dingtalk',
      source: 'dingtalk',
      title,
      cwd: cwd || undefined,
      cwdSubDir: cwd ? undefined : 'dingtalk',
      meta: { conversationId }
    })

    const sessionId = session.id
    this.sessionMap.set(mapKey, sessionId)

    const db = this.agentSessionManager.sessionDatabase
    if (db && conversationId) {
      db.updateDingTalkMetadata(sessionId, staffId, conversationId)
    }

    console.log(`[DingTalk] Created session ${sessionId} for ${nickname}(${staffId}) in conversation ${conversationTitle || conversationId}`)

    this._notifyFrontend('dingtalk:sessionCreated', {
      sessionId, staffId, nickname, conversationId, conversationTitle, title: session.title
    })

    return sessionId
  }

  /**
   * 设置待选择状态（带超时自动清理）
   */
  _setPendingChoice(mapKey, data) {
    const existing = this._pendingChoices.get(mapKey)
    if (existing) clearTimeout(existing.timer)

    const timer = setTimeout(() => {
      this._pendingChoices.delete(mapKey)
      console.log(`[DingTalk] Pending choice expired for ${mapKey}`)
    }, this._CHOICE_TTL)

    this._pendingChoices.set(mapKey, { ...data, timer })
  }

  /**
   * 清除待选择状态
   */
  _clearPendingChoice(mapKey) {
    const pending = this._pendingChoices.get(mapKey)
    if (pending) clearTimeout(pending.timer)
    this._pendingChoices.delete(mapKey)
  }

  /**
   * 清理会话关联的所有内部状态（映射、队列、webhook、待发块）
   * @param {string} sessionId
   * @param {string} [mapKey] - 可选，提供时同时清理 sessionMap
   */
  _clearSessionState(sessionId, mapKey) {
    this._sessionProcessQueues.delete(sessionId)
    if (mapKey) this.sessionMap.delete(mapKey)
    this._sessionWebhooks.delete(sessionId)
    this._desktopPendingBlocks.delete(sessionId)
  }

  /**
   * 将消息加入会话的串行处理队列（promise chain），确保同一会话无竞态
   */
  _enqueueMessage(sessionId, message, webhook, senderNick, opts) {
    const prevTask = this._sessionProcessQueues.get(sessionId) || Promise.resolve()
    const currentTask = prevTask
      .catch(() => {})
      .then(() => this._processOneMessage(sessionId, message, webhook, senderNick, opts))
      .catch(err => console.error('[DingTalk] Queue processing error:', err))
    this._sessionProcessQueues.set(sessionId, currentTask)
  }

  /**
   * 获取当前活跃的 sessionId。
   * 若 sessionMap 中有映射但 session 已被 CC 桌面关闭，自动清理过期映射并返回 null。
   */
  _resolveActiveSessionId(mapKey) {
    const sessionId = this.sessionMap.get(mapKey)
    if (!sessionId) return null

    const session = this.agentSessionManager.sessions.get(sessionId)
    if (session) return sessionId  // 内存中存在，真正活跃

    // 内存中不存在 → 检查 DB 状态
    const db = this.agentSessionManager.sessionDatabase
    const row = db && db.getAgentConversation(sessionId)
    if (!row || row.status === 'closed') {
      // CC 桌面已关闭或物理删除，清理过期映射
      this._clearSessionState(sessionId, mapKey)
      return null
    }

    return sessionId  // DB 中存在且未关闭（可能待 reopen）
  }

  /**
   * 向钉钉用户发送历史会话选择菜单
   */
  async _sendChoiceMenu(webhook, sessions, currentSessionId = null) {
    const MAX_SESSIONS = 10
    const displaySessions = sessions.slice(0, MAX_SESSIONS)
    const lines = ['您有以下历史会话，请回复数字选择：\n']
    displaySessions.forEach((row, i) => {
      const timeStr = this._formatRelativeTime(row.updated_at)
      const dir = row.cwd ? path.basename(row.cwd) : '-'
      const profileName = row.api_profile_id
        ? (this.configManager?.getAPIProfile(row.api_profile_id)?.name || '未知配置')
        : '默认配置'

      // 判断会话状态并添加标记
      let marker = ''
      const session = this.agentSessionManager.sessions.get(row.session_id)
      if (currentSessionId && row.session_id === currentSessionId) {
        // 当前连接的会话
        marker = '✅ '
      } else if (session && session.queryGenerator) {
        // 激活但未连接的会话
        marker = '🔵 '
      } else {
        // 未激活的会话
        marker = '⭕ '
      }

      lines.push(`${i + 1}. ${marker}[${timeStr}] ${row.title} (${dir}) ${profileName}`)
    })
    if (sessions.length > MAX_SESSIONS) {
      lines.push(`\n（仅显示最近 ${MAX_SESSIONS} 条，共 ${sessions.length} 条）`)
    }
    // 0 单独放在列表外，避免钉钉 Markdown 将 "0." 续接为有序列表编号
    lines.push('\n回复 0 开始全新会话')
    await this._replyToDingTalk(webhook, lines.join('\n'))
  }

  /**
   * 处理用户的历史会话选择（0 = 新建，1~N = 恢复对应会话）
   *
   * 注意：如果用户输入非有效数字，会丢弃该输入，不会替换 originalMessage
   * 这样可以避免用户误输入被当作消息发送给 Agent
   */
  async _handlePendingChoice(mapKey, choiceText, webhook, { robotCode, senderStaffId, senderNick, conversationId, conversationTitle, conversationType }) {
    const pending = this._pendingChoices.get(mapKey)
    if (!pending) {
      // 极少数情况：TTL 刚好过期或并发调用已清除
      console.warn(`[DingTalk] Pending choice for ${mapKey} not found, ignoring`)
      return
    }
    const { sessions, originalMessage } = pending

    const choice = parseInt(choiceText)
    const isValid = !isNaN(choice) && choice >= 0 && choice <= sessions.length

    if (!isValid) {
      // 非有效数字选项：丢弃该输入，重新发送选择菜单
      // 不替换 originalMessage，避免误输入被发送给 Agent
      console.log(`[DingTalk] Invalid choice "${choiceText}", re-sending menu`)
      // 获取当前会话 ID 用于标记
      const currentSessionId = this._resolveActiveSessionId(mapKey)
      await this._sendChoiceMenu(webhook, sessions, currentSessionId)
      return
    }

    this._clearPendingChoice(mapKey)

    // 获取当前活跃会话（如果有）
    const currentSessionId = this._resolveActiveSessionId(mapKey)

    let sessionId
    let needActivation = false  // 是否需要发送 hello 激活
    let alreadySentPrompt = false  // 是否已发送提示（避免重复）
    let isNewSession = false  // 是否是新建会话

    if (choice === 0) {
      // 新建会话（不关闭当前会话）
      sessionId = await this._createNewSession(senderStaffId, senderNick, conversationId, conversationTitle, mapKey)
      needActivation = true  // 新建会话需要激活
      isNewSession = true  // 标记为新建会话
    } else {
      // 恢复指定历史会话
      const selectedRow = sessions[choice - 1]

      // 如果选择的就是当前连接会话，只需提示
      if (currentSessionId === selectedRow.session_id) {
        const session = this.agentSessionManager.sessions.get(currentSessionId)
        if (session?.queryGenerator) {
          // 已经连接，直接提示
          await this._replyToDingTalk(webhook, this._t('alreadyConnected'))
          return
        }
      }

      // 切换到目标会话（不关闭当前会话）
      // 原则：只更新连接映射，不关闭其他会话，避免误关闭桌面端激活的会话

      // 先检查目标会话是否已在内存中（可能已激活）
      const existingSession = this.agentSessionManager.sessions.get(selectedRow.session_id)
      const isActivated = existingSession && existingSession.queryGenerator != null

      const session = this.agentSessionManager.reopen(selectedRow.session_id)
      if (session) {
        // 更新会话的 conversationId（确保会话属于当前钉钉对话）
        if (!session.meta) session.meta = {}
        session.meta.conversationId = conversationId

        sessionId = selectedRow.session_id
        this.sessionMap.set(mapKey, sessionId)
        console.log(`[DingTalk] Resumed session ${sessionId} for ${senderNick}(${senderStaffId})`)
        this._notifyFrontend('dingtalk:sessionCreated', {
          sessionId, staffId: senderStaffId, nickname: senderNick,
          conversationId, conversationTitle, title: selectedRow.title
        })

        // 发送切换提示
        // 条件：从其他会话切换过来，或从无会话状态切换（currentSessionId 为 null）
        if (!currentSessionId || currentSessionId !== selectedRow.session_id) {
          if (isActivated) {
            // 目标会话已激活 → 可以直接聊天
            await this._replyToDingTalk(webhook, '✅ 已切换到目标对话，可以继续聊天了')
            alreadySentPrompt = true
          } else {
            // 目标会话未激活 → 需要等待激活
            await this._replyToDingTalk(webhook, this._t('sessionActivating'))
            alreadySentPrompt = true
          }
        }

        needActivation = !isActivated  // 未激活的会话需要激活
      } else {
        // 无法恢复，降级新建
        console.warn(`[DingTalk] Cannot restore session ${selectedRow.session_id}, creating new`)
        sessionId = await this._createNewSession(senderStaffId, senderNick, conversationId, conversationTitle, mapKey)
        needActivation = true  // 新建会话需要激活
      }
    }

    // 将触发菜单的原始消息投入队列处理
    if (originalMessage) {
      console.log(`[DingTalk] _handlePendingChoice: will process message for sessionId=${sessionId}`)

      // 如果需要激活会话且尚未发送提示，先发送提示
      if (needActivation && !alreadySentPrompt) {
        const promptKey = isNewSession ? 'sessionCreating' : 'sessionActivating'
        await this._replyToDingTalk(webhook, this._t(promptKey))
      }

      // 补发 dingtalk:messageReceived，让 CC 桌面前端渲染出用户消息气泡
      // （正常流程在 _handleDingTalkMessage 里发此通知，但 needsChoice 路径提前 return 了）
      const displayText = typeof originalMessage === 'string'
        ? originalMessage
        : (originalMessage.text || '[图片]')
      const notification = { sessionId, senderNick, text: displayText }
      if (originalMessage && typeof originalMessage === 'object' && originalMessage.images) {
        notification.images = originalMessage.images.map(img => ({
          base64: img.base64,
          mediaType: img.mediaType
        }))
      }
      this._notifyFrontend('dingtalk:messageReceived', notification)

      this._enqueueMessage(sessionId, originalMessage, webhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType })
    } else if (needActivation) {
      // 没有原始消息，但需要激活会话：先发送提示，再自动发送 "hello" 激活
      console.log(`[DingTalk] _handlePendingChoice: auto-activating session ${sessionId} with "hello"`)

      // 先发送提示消息（如果尚未发送）
      if (!alreadySentPrompt) {
        const promptKey = isNewSession ? 'sessionCreating' : 'sessionActivating'
        await this._replyToDingTalk(webhook, this._t(promptKey))
      }

      // 补发 dingtalk:messageReceived，让桌面端显示用户消息
      this._notifyFrontend('dingtalk:messageReceived', {
        sessionId,
        senderNick,
        text: 'hello'
      })

      this._enqueueMessage(sessionId, 'hello', webhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType })
    }
  }

  /**
   * 格式化时间戳为相对时间描述
   */
  _formatRelativeTime(timestamp) {
    const diff = Date.now() - Number(timestamp)
    const min = 60 * 1000
    const hour = 60 * min
    const day = 24 * hour
    if (diff < hour) return `${Math.floor(diff / min)}分钟前`
    if (diff < day) return `${Math.floor(diff / hour)}小时前`
    if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
    if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}周前`
    return `${Math.floor(diff / (30 * day))}个月前`
  }

  /**
   * 设置响应处理器：每段文本即时发送到钉钉，result 时标记完成
   * @returns {Promise<void>} result 事件触发时 resolve
   */
  _setupResponseHandler(sessionId, sessionWebhook, { robotCode, senderStaffId, conversationId, conversationType } = {}) {
    return new Promise((resolve, reject) => {
      const collector = {
        webhook: sessionWebhook,
        robotCode,
        senderStaffId,
        conversationId,
        conversationType,
        hasSent: false, // 是否已发送过至少一条消息
        imagePaths: new Set(), // 收集 tool_use 块中的图片文件路径
        resolve,
        reject,
        // 30 分钟超时（长任务如代码生成、文件分析可能耗时较长）
        timer: setTimeout(() => {
          this.responseCollectors.delete(sessionId)
          reject(new Error('Response timeout'))
        }, 30 * 60 * 1000)
      }
      this.responseCollectors.set(sessionId, collector)
    })
  }

  /**
   * 接收 AgentSessionManager 的消息事件（由外部调用注入）
   *
   * 钉钉发起的消息：每段文本即时发送到钉钉（实时流式效果）
   * CC 桌面介入的消息：累积文本块，等待 onAgentResult 时组装 Q&A 块发送
   */
  onAgentMessage(sessionId, message) {
    const collector = this.responseCollectors.get(sessionId)
    if (!collector) {
      // 非钉钉发起的消息 — 检查是否是 CC 桌面介入（有待转发块）
      const pending = this._desktopPendingBlocks.get(sessionId)
      if (!pending) return

      // 累积文本块，result 时一起打包发送
      const blocks = message?.content || []
      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          pending.textChunks.push(block.text)
        } else if (block.type === 'tool_use' && block.input) {
          // 同样收集 tool_use 中的图片路径
          this._extractImagePaths(block.input).forEach(p => pending.imagePaths.add(p))
        }
      }
      return
    }

    // 钉钉发起的消息：提取文本块立即发送，同时扫描 tool_use 图片路径
    const blocks = message?.content || []
    const textParts = []
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text)
      } else if (block.type === 'tool_use' && block.input) {
        this._extractImagePaths(block.input).forEach(p => collector.imagePaths.add(p))
      }
    }

    if (textParts.length > 0) {
      const text = textParts.join('\n\n')
      collector.hasSent = true
      // 异步发送，不阻塞消息处理流程
      this._replyToDingTalk(collector.webhook, text).catch(err => {
        console.error(`[DingTalk] Immediate reply failed:`, err.message)
      })
    }
  }

  /**
   * 接收 CC 桌面端用户消息（非钉钉来源的钉钉会话）
   * 记录用户输入，等待 onAgentResult 时一起发送完整 Q&A 块到钉钉
   *
   * 限制：只有当前连接的会话才能介入，避免多会话信息混乱
   */
  onUserMessage(sessionId, userInput, inputImages = null) {
    if (!this._sessionWebhooks.has(sessionId)) return

    // 检查是否是当前连接的会话（在 sessionMap 中）
    const isCurrentSession = [...this.sessionMap.values()].includes(sessionId)
    if (!isCurrentSession) {
      console.log(`[DingTalk] Desktop intervention blocked for session ${sessionId}: not current connected session`)
      return
    }

    console.log(`[DingTalk] Desktop intervention for session ${sessionId}: "${(userInput || '').substring(0, 50)}"${inputImages?.length ? ` + ${inputImages.length} image(s)` : ''}`)
    this._desktopPendingBlocks.set(sessionId, {
      userInput: userInput || '',
      inputImages: inputImages || [],
      textChunks: [],
      imagePaths: new Set()
    })
  }

  /**
   * 接收 Agent 一轮对话完成事件
   *
   * 钉钉发起的消息：清理 collector，resolve donePromise
   * CC 桌面介入的消息：组装完整 Q&A 块，通过存储的 webhook 发送到钉钉
   */
  onAgentResult(sessionId) {
    const collector = this.responseCollectors.get(sessionId)
    if (!collector) {
      // CC 桌面介入：发送完整 Q&A 块
      const pending = this._desktopPendingBlocks.get(sessionId)
      if (!pending) return

      this._desktopPendingBlocks.delete(sessionId)

      const webhookInfo = this._sessionWebhooks.get(sessionId)
      if (!webhookInfo) return

      const responseText = pending.textChunks.join('\n\n')

      // 有用户输入或有响应文本时才发送（避免发空消息）
      if (pending.userInput || responseText) {
        const lines = ['💻 桌面端介入：']
        if (pending.userInput) {
          // 多行输入每行加引用前缀
          const quotedInput = pending.userInput.split('\n').map(l => `> ${l}`).join('\n')
          lines.push(quotedInput)
        }
        if (responseText) {
          lines.push('')
          lines.push(responseText)
        }
        this._replyToDingTalk(webhookInfo.webhook, lines.join('\n')).catch(err => {
          console.error('[DingTalk] Desktop intervention reply failed:', err.message)
        })
      }

      // 异步发送用户输入的图片（桌面端粘贴的截图等 base64 图片）
      if (pending.inputImages && pending.inputImages.length > 0) {
        this._sendBase64Images(pending.inputImages, webhookInfo).catch(err => {
          console.error('[DingTalk] Desktop intervention input image forward failed:', err.message)
        })
      }

      // 异步发送 Agent 读取的磁盘图片（与钉钉发起路径保持一致）
      if (pending.imagePaths.size > 0) {
        this._sendCollectedImages(pending.imagePaths, webhookInfo).catch(err => {
          console.error('[DingTalk] Desktop intervention image forward failed:', err.message)
        })
      }

      return
    }

    clearTimeout(collector.timer)
    this.responseCollectors.delete(sessionId)

    // 如果整轮都没发过消息（极端情况），兜底发一条
    if (!collector.hasSent) {
      this._replyToDingTalk(collector.webhook, '（处理完成，无文本输出）').catch(() => {})
    }

    // 提取图片发送所需信息后再 resolve（避免 resolve 后引用 collector）
    const { imagePaths, robotCode, senderStaffId, conversationId, conversationType, webhook } = collector
    collector.resolve()

    // 异步发送收集到的图片（不阻塞 resolve）
    if (imagePaths.size > 0) {
      this._sendCollectedImages(imagePaths, { robotCode, senderStaffId, conversationId, conversationType, webhook }).catch(err => {
        console.error('[DingTalk] Image forward failed:', err.message)
      })
    }
  }

  /**
   * 接收 Agent 错误事件
   */
  onAgentError(sessionId, error) {
    const collector = this.responseCollectors.get(sessionId)
    if (!collector) {
      // 清理 CC 桌面介入的待发块
      this._desktopPendingBlocks.delete(sessionId)
      return
    }

    clearTimeout(collector.timer)
    this.responseCollectors.delete(sessionId)

    this._replyToDingTalk(collector.webhook, `❌ ${error}`).catch(() => {})
    collector.resolve()
  }

  /**
   * 回复钉钉消息
   */
  async _replyToDingTalk(sessionWebhook, text) {
    console.log('[DingTalk] _replyToDingTalk called, text length:', text?.length, 'preview:', text?.substring(0, 100))
    if (!sessionWebhook) {
      console.warn('[DingTalk] No sessionWebhook, cannot reply')
      return
    }

    // 截断过长消息（钉钉限制）
    const maxLen = 6000
    if (text && text.length > maxLen) {
      text = text.substring(0, maxLen) + '\n\n...（消息过长，已截断）'
    }

    try {
      const response = await globalThis.fetch(sessionWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            title: this._t('replyTitle'),
            text
          }
        })
      })

      if (!response.ok) {
        console.error(`[DingTalk] Reply failed: ${response.status} ${response.statusText}`)
      } else {
        console.log('[DingTalk] _replyToDingTalk: reply sent successfully')
      }
    } catch (err) {
      console.error('[DingTalk] Reply error:', err.message)
    }
  }



  /**
   * 获取钉钉 access token（带缓存）
   */
  async _getAccessToken() {
    if (this._accessToken && Date.now() < this._accessTokenExpiresAt) {
      return this._accessToken
    }

    const config = this.configManager.getConfig()
    const { appKey, appSecret } = config.dingtalk || {}

    const response = await globalThis.fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey, appSecret })
    })

    if (!response.ok) {
      throw new Error(`Get access token failed: ${response.status}`)
    }

    const result = await response.json()
    this._accessToken = result.accessToken
    // 提前 5 分钟过期，避免边界问题
    this._accessTokenExpiresAt = Date.now() + (result.expireIn - 300) * 1000
    return this._accessToken
  }

  /**
   * 安全发送消息到前端
   */
  _notifyFrontend(channel, data) {
    try {
      if (this.mainWindow &&
          !this.mainWindow.isDestroyed() &&
          this.mainWindow.webContents &&
          !this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data)
      }
    } catch (e) {
      // ignore
    }
  }
}

// 混入图片管道方法和命令系统方法
Object.assign(DingTalkBridge.prototype, imageMixin, commandsMixin)

module.exports = { DingTalkBridge }

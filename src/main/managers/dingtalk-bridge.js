/**
 * DingTalk Bridge
 * 钉钉机器人桥接模块：通过 Stream 模式接收钉钉消息，转发给 Agent 会话，回复结果到钉钉
 */

const { DWClient } = require('dingtalk-stream-sdk-nodejs')
const fs = require('fs')
const path = require('path')

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|bmp)$/i
const IMAGE_MAX_SIZE = 20 * 1024 * 1024 // 20MB
const IMAGE_PATH_MAX_DEPTH = 10 // 递归提取最大深度

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
    this._processedMsgIds = new Set()
    this._MSG_ID_TTL = 10 * 60 * 1000 // 10 分钟后清理

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

  // ==================== 内部方法 ====================

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
    const data = JSON.parse(res.data)
    const { msgId, msgtype, text, content, senderStaffId, senderNick, sessionWebhook, robotCode, conversationId, conversationTitle, conversationType } = data

    // 消息去重：SDK 未及时收到 ACK 时会重投同一条消息
    if (msgId && this._processedMsgIds.has(msgId)) {
      console.log(`[DingTalk] Duplicate message ${msgId}, skipping`)
      return
    }
    if (msgId) {
      this._processedMsgIds.add(msgId)
      setTimeout(() => this._processedMsgIds.delete(msgId), this._MSG_ID_TTL)
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
    const prevTask = this._sessionProcessQueues.get(sessionId) || Promise.resolve()
    const currentTask = prevTask
      .catch(() => {}) // 前一条出错不阻塞后续
      .then(() => this._processOneMessage(sessionId, agentMessage, sessionWebhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType }))
      .catch(err => console.error(`[DingTalk] Queue processing error:`, err))
    this._sessionProcessQueues.set(sessionId, currentTask)
  }

  /**
   * 处理单条消息（在 promise chain 中串行执行，无竞态）
   */
  async _processOneMessage(sessionId, userMessage, sessionWebhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType } = {}) {
    // 更新会话的最近 webhook（用于 CC 桌面介入时回传给钉钉）
    if (sessionWebhook) {
      this._sessionWebhooks.set(sessionId, { webhook: sessionWebhook, robotCode, senderStaffId, conversationId, conversationType })
    }

    // 设置响应处理器（每段文本即时发送到钉钉）
    const donePromise = this._setupResponseHandler(sessionId, sessionWebhook, { robotCode, senderStaffId, conversationId, conversationType })

    // 发送到 Agent（userMessage 可以是 string 或 { text, images }）
    // 附带钉钉元数据，用于持久化来源信息
    const meta = { source: 'dingtalk', senderNick }
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
        this._sessionProcessQueues.delete(sessionId)
        this.sessionMap.delete(mapKey)
        this._sessionWebhooks.delete(sessionId)
        this._desktopPendingBlocks.delete(sessionId)
      } else if (row.status === 'closed') {
        // CC 桌面主动关闭 → 清除所有相关状态，让用户重新选择
        console.log(`[DingTalk] Session ${sessionId} was closed by desktop, will ask user to choose`)
        this._sessionProcessQueues.delete(sessionId)
        this.sessionMap.delete(mapKey)
        this._sessionWebhooks.delete(sessionId)
        this._desktopPendingBlocks.delete(sessionId)
      } else {
        // 会话状态正常（idle/streaming）→ 恢复
        const session = this.agentSessionManager.reopen(sessionId)
        if (session) return sessionId
        this._sessionProcessQueues.delete(sessionId)
        this.sessionMap.delete(mapKey)
        this._sessionWebhooks.delete(sessionId)
        this._desktopPendingBlocks.delete(sessionId)
      }
      // 三种情况均继续向下走：查询历史 → 触发选择菜单 或 新建
    }

    // 从 DB 查历史会话
    const db = this.agentSessionManager.sessionDatabase
    if (db && conversationId) {
      const sessions = db.getDingTalkSessions(staffId, conversationId)
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
  async _createNewSession(staffId, nickname, conversationId, conversationTitle, mapKey) {
    const title = conversationTitle
      ? `钉钉 · ${conversationTitle} · ${nickname || staffId}`
      : `钉钉 · ${nickname || staffId}`

    const session = this.agentSessionManager.create({
      type: 'dingtalk',
      title,
      cwd: this._getDefaultCwd()
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
   * 向钉钉用户发送历史会话选择菜单
   */
  async _sendChoiceMenu(webhook, sessions) {
    const MAX_SESSIONS = 10
    const displaySessions = sessions.slice(0, MAX_SESSIONS)
    const lines = ['您有以下历史会话，请回复数字选择：\n']
    displaySessions.forEach((row, i) => {
      const timeStr = this._formatRelativeTime(row.updated_at)
      lines.push(`${i + 1}. [${timeStr}] ${row.title}`)
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
      // 非有效数字选项：用最新消息替换旧的 originalMessage（保留最后一条）
      if (choiceText) {
        pending.originalMessage = choiceText
      }
      await this._sendChoiceMenu(webhook, sessions)
      return
    }

    this._clearPendingChoice(mapKey)

    let sessionId

    if (choice === 0) {
      // 新建会话
      sessionId = await this._createNewSession(senderStaffId, senderNick, conversationId, conversationTitle, mapKey)
    } else {
      // 恢复指定历史会话（reopen 会从 DB 恢复到内存，get 只查内存）
      const selectedRow = sessions[choice - 1]
      const session = this.agentSessionManager.reopen(selectedRow.session_id)
      if (session) {
        sessionId = selectedRow.session_id
        this.sessionMap.set(mapKey, sessionId)
        console.log(`[DingTalk] Resumed session ${sessionId} for ${senderNick}(${senderStaffId})`)
        this._notifyFrontend('dingtalk:sessionCreated', {
          sessionId, staffId: senderStaffId, nickname: senderNick,
          conversationId, conversationTitle, title: selectedRow.title
        })
      } else {
        // 无法恢复，降级新建
        console.warn(`[DingTalk] Cannot restore session ${selectedRow.session_id}, creating new`)
        sessionId = await this._createNewSession(senderStaffId, senderNick, conversationId, conversationTitle, mapKey)
      }
    }

    // 将触发菜单的原始消息投入队列处理
    if (originalMessage) {
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

      const prevTask = this._sessionProcessQueues.get(sessionId) || Promise.resolve()
      const currentTask = prevTask
        .catch(() => {})
        .then(() => this._processOneMessage(sessionId, originalMessage, webhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType }))
        .catch(err => console.error(`[DingTalk] Queue processing error:`, err))
      this._sessionProcessQueues.set(sessionId, currentTask)
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
        // 5 分钟超时
        timer: setTimeout(() => {
          this.responseCollectors.delete(sessionId)
          reject(new Error('Response timeout'))
        }, 5 * 60 * 1000)
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
      if (!pending) return false

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
      return true
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

    return true
  }

  /**
   * 接收 CC 桌面端用户消息（非钉钉来源的钉钉会话）
   * 记录用户输入，等待 onAgentResult 时一起发送完整 Q&A 块到钉钉
   */
  onUserMessage(sessionId, userInput, inputImages = null) {
    if (!this._sessionWebhooks.has(sessionId)) return

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
      if (!pending) return false

      this._desktopPendingBlocks.delete(sessionId)

      const webhookInfo = this._sessionWebhooks.get(sessionId)
      if (!webhookInfo) return false

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

      return true
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

    return true
  }

  /**
   * 接收 Agent 错误事件
   */
  onAgentError(sessionId, error) {
    const collector = this.responseCollectors.get(sessionId)
    if (!collector) {
      // 清理 CC 桌面介入的待发块
      this._desktopPendingBlocks.delete(sessionId)
      return false
    }

    clearTimeout(collector.timer)
    this.responseCollectors.delete(sessionId)

    this._replyToDingTalk(collector.webhook, `❌ ${error}`).catch(() => {})
    collector.resolve()
    return true
  }

  /**
   * 递归提取 tool_use input 中的图片文件绝对路径
   */
  _extractImagePaths(obj, depth = 0) {
    if (depth > IMAGE_PATH_MAX_DEPTH) return []
    const paths = []
    if (typeof obj === 'string') {
      if (IMAGE_EXTENSIONS.test(obj) && (obj.startsWith('/') || /^[A-Z]:[/\\]/.test(obj))) {
        paths.push(this._normalizePath(obj))
      }
    } else if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj)) {
        paths.push(...this._extractImagePaths(val, depth + 1))
      }
    }
    return paths
  }

  /**
   * 归一化路径：将 MSYS 风格 /c/... 转为 Windows 风格 C:/...
   */
  _normalizePath(p) {
    // MSYS: /c/workspace/... → C:/workspace/...
    const msysMatch = p.match(/^\/([a-zA-Z])\/(.*)$/)
    if (msysMatch) {
      return `${msysMatch[1].toUpperCase()}:/${msysMatch[2]}`
    }
    return p
  }

  /**
   * 遍历收集到的图片路径，逐个上传并通过接口方式发送到钉钉
   */
  async _sendCollectedImages(imagePaths, { robotCode, senderStaffId, conversationId, conversationType }) {
    const token = await this._getAccessToken()
    for (const filePath of imagePaths) {
      try {
        const stats = await fs.promises.stat(filePath).catch(() => null)
        if (!stats || stats.size > IMAGE_MAX_SIZE || stats.size === 0) continue

        const mediaId = await this._uploadImage(filePath, token)
        await this._sendImageViaApi(mediaId, { robotCode, senderStaffId, conversationId, conversationType, token })
        console.log(`[DingTalk] Image forwarded: ${filePath}`)
      } catch (err) {
        console.error(`[DingTalk] Failed to forward image ${filePath}:`, err.message)
      }
    }
  }

  /**
   * 发送 base64 图片列表到钉钉（桌面端介入时用户输入的截图等）
   */
  async _sendBase64Images(images, { robotCode, senderStaffId, conversationId, conversationType }) {
    const token = await this._getAccessToken()
    for (const img of images) {
      try {
        const mediaId = await this._uploadImageBase64(img.base64, img.mediaType, token)
        await this._sendImageViaApi(mediaId, { robotCode, senderStaffId, conversationId, conversationType, token })
        console.log('[DingTalk] Input image forwarded to DingTalk')
      } catch (err) {
        console.error('[DingTalk] Failed to forward input image:', err.message)
      }
    }
  }

  /**
   * 上传 Buffer 到钉钉 media API，返回 media_id（公共逻辑）
   */
  async _uploadBuffer(buffer, fileName, mediaType, token) {
    const formData = new FormData()
    formData.append('media', new Blob([buffer], { type: mediaType || 'application/octet-stream' }), fileName)

    const response = await globalThis.fetch(
      `https://oapi.dingtalk.com/media/upload?access_token=${token}&type=image`,
      { method: 'POST', body: formData }
    )

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
    const result = await response.json()
    if (result.errcode) throw new Error(`Upload error: ${result.errcode} ${result.errmsg}`)
    return result.media_id
  }

  /**
   * 上传本地图片到钉钉 media API，返回 media_id
   */
  async _uploadImage(filePath, token) {
    const fileBuffer = await fs.promises.readFile(filePath)
    return this._uploadBuffer(fileBuffer, path.basename(filePath), null, token)
  }

  /**
   * 上传 base64 图片到钉钉 media API，返回 media_id
   */
  async _uploadImageBase64(base64, mediaType, token) {
    const buffer = Buffer.from(base64, 'base64')
    const ext = (mediaType || 'image/png').split('/')[1] || 'png'
    return this._uploadBuffer(buffer, `image.${ext}`, mediaType || 'image/png', token)
  }

  /**
   * 发送图片消息路由：群聊走 groupMessages/send，单聊走 oToMessages/batchSend
   */
  async _sendImageViaApi(mediaId, { robotCode, senderStaffId, conversationId, conversationType, token }) {
    if (conversationType === '2' && conversationId) {
      return this._sendImageToGroup(mediaId, { robotCode, openConversationId: conversationId, token })
    }
    // 单聊（conversationType === '1' 或未知）
    const body = {
      robotCode,
      userIds: [senderStaffId],
      msgKey: 'sampleImageMsg',
      msgParam: JSON.stringify({ photoURL: mediaId })
    }
    const response = await globalThis.fetch(
      'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token
        },
        body: JSON.stringify(body)
      }
    )

    const result = await response.json()
    if (!response.ok) {
      throw new Error(`Image API failed: ${response.status} ${JSON.stringify(result)}`)
    }
  }

  /**
   * 发送图片消息到群聊
   */
  async _sendImageToGroup(mediaId, { robotCode, openConversationId, token }) {
    const body = {
      robotCode,
      openConversationId,
      msgKey: 'sampleImageMsg',
      msgParam: JSON.stringify({ photoURL: mediaId })
    }
    const response = await globalThis.fetch(
      'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token
        },
        body: JSON.stringify(body)
      }
    )

    const result = await response.json()
    if (!response.ok) {
      throw new Error(`Group image API failed: ${response.status} ${JSON.stringify(result)}`)
    }
  }

  /**
   * 回复钉钉消息
   */
  async _replyToDingTalk(sessionWebhook, text) {
    if (!sessionWebhook) {
      console.warn('[DingTalk] No sessionWebhook, cannot reply')
      return
    }

    // 截断过长消息（钉钉限制）
    const maxLen = 6000
    if (text.length > maxLen) {
      text = text.substring(0, maxLen) + '\n\n...（消息过长，已截断）'
    }

    try {
      const response = await globalThis.fetch(sessionWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            title: 'CC助手回复',
            text
          }
        })
      })

      if (!response.ok) {
        console.error(`[DingTalk] Reply failed: ${response.status} ${response.statusText}`)
      }
    } catch (err) {
      console.error('[DingTalk] Reply error:', err.message)
    }
  }

  /**
   * 获取默认工作目录
   */
  _getDefaultCwd() {
    const config = this.configManager.getConfig()
    // 优先使用用户配置的钉钉工作目录
    if (config.dingtalk?.defaultCwd) {
      if (fs.existsSync(config.dingtalk.defaultCwd)) {
        return config.dingtalk.defaultCwd
      }
    }
    return process.env.HOME || process.env.USERPROFILE || process.cwd()
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
   * 通过钉钉 API 下载图片，返回 { base64, mediaType }
   */
  async _downloadImage(downloadCode, robotCode) {
    const token = await this._getAccessToken()

    // 调用钉钉 API 获取图片下载地址
    const response = await globalThis.fetch('https://api.dingtalk.com/v1.0/robot/messageFiles/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token
      },
      body: JSON.stringify({ downloadCode, robotCode })
    })

    if (!response.ok) {
      throw new Error(`Download API failed: ${response.status}`)
    }

    const result = await response.json()
    const imageUrl = result.downloadUrl

    if (!imageUrl) {
      throw new Error('No downloadUrl in response')
    }

    // 下载实际图片
    const imgResponse = await globalThis.fetch(imageUrl)
    if (!imgResponse.ok) {
      throw new Error(`Image fetch failed: ${imgResponse.status}`)
    }

    const buffer = Buffer.from(await imgResponse.arrayBuffer())
    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg'
    // 标准化 mediaType
    const mediaType = contentType.split(';')[0].trim()

    console.log(`[DingTalk] Image downloaded: ${buffer.length} bytes, type=${mediaType}`)

    return {
      base64: buffer.toString('base64'),
      mediaType
    }
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

module.exports = { DingTalkBridge }

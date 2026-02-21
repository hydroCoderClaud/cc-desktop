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
    if (this.client) {
      try {
        this.client.disconnect()
      } catch (e) {
        // ignore
      }
      this.client = null
    }
    this.connected = false
    this.responseCollectors.clear()
    this._processedMsgIds.clear()
    this._sessionProcessQueues.clear()
    for (const choice of this._pendingChoices.values()) clearTimeout(choice.timer)
    this._pendingChoices.clear()
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
      clientSecret: appSecret
    })

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
  }

  /**
   * 处理钉钉消息
   */
  async _handleDingTalkMessage(res) {
    const data = JSON.parse(res.data)
    const { msgId, msgtype, text, content, senderStaffId, senderNick, sessionWebhook, robotCode, conversationId, conversationTitle } = data

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
      await this._handlePendingChoice(mapKey, choiceText, sessionWebhook, { robotCode, senderStaffId, senderNick, conversationId, conversationTitle })
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
      .then(() => this._processOneMessage(sessionId, agentMessage, sessionWebhook, senderNick, { robotCode, senderStaffId }))
      .catch(err => console.error(`[DingTalk] Queue processing error:`, err))
    this._sessionProcessQueues.set(sessionId, currentTask)
  }

  /**
   * 处理单条消息（在 promise chain 中串行执行，无竞态）
   */
  async _processOneMessage(sessionId, userMessage, sessionWebhook, senderNick, { robotCode, senderStaffId } = {}) {
    // 设置响应处理器（每段文本即时发送到钉钉）
    const donePromise = this._setupResponseHandler(sessionId, sessionWebhook, { robotCode, senderStaffId })

    // 发送到 Agent（userMessage 可以是 string 或 { text, images }）
    // 附带钉钉元数据，用于持久化来源信息
    const meta = { source: 'dingtalk', senderNick }
    try {
      await this.agentSessionManager.sendMessage(sessionId, userMessage, { meta })
    } catch (err) {
      console.error(`[DingTalk] sendMessage failed:`, err.message)
      await this._replyToDingTalk(sessionWebhook, `❌ 错误: ${err.message}`)
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

      if (row && row.status === 'closed') {
        // CC 桌面已关闭该会话 → 清除内存映射，让用户重新选择
        console.log(`[DingTalk] Session ${sessionId} was closed by desktop, will ask user to choose`)
        this._sessionProcessQueues.delete(sessionId)
        this.sessionMap.delete(mapKey)
        // 继续向下走：查询历史 → 触发选择菜单
      } else {
        const session = this.agentSessionManager.reopen(sessionId)
        if (session) return sessionId
        this._sessionProcessQueues.delete(sessionId)
        this.sessionMap.delete(mapKey)
      }
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
    const lines = ['您有以下历史会话，请回复数字选择：\n']
    sessions.forEach((row, i) => {
      const timeStr = this._formatRelativeTime(row.updated_at)
      lines.push(`${i + 1}. [${timeStr}] ${row.title}`)
    })
    lines.push('\n0. 开始新会话')
    await this._replyToDingTalk(webhook, lines.join('\n'))
  }

  /**
   * 处理用户的历史会话选择（0 = 新建，1~N = 恢复对应会话）
   */
  async _handlePendingChoice(mapKey, choiceText, webhook, { robotCode, senderStaffId, senderNick, conversationId, conversationTitle }) {
    const pending = this._pendingChoices.get(mapKey)
    const { sessions, originalMessage } = pending

    const choice = parseInt(choiceText)
    const isValid = !isNaN(choice) && choice >= 0 && choice <= sessions.length

    if (!isValid) {
      // 无效输入，重新发送菜单
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
      const prevTask = this._sessionProcessQueues.get(sessionId) || Promise.resolve()
      const currentTask = prevTask
        .catch(() => {})
        .then(() => this._processOneMessage(sessionId, originalMessage, webhook, senderNick, { robotCode, senderStaffId }))
        .catch(err => console.error(`[DingTalk] Queue processing error:`, err))
      this._sessionProcessQueues.set(sessionId, currentTask)
    }
  }

  /**
   * 格式化时间戳为相对时间描述
   */
  _formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp
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
  _setupResponseHandler(sessionId, sessionWebhook, { robotCode, senderStaffId } = {}) {
    return new Promise((resolve, reject) => {
      const collector = {
        webhook: sessionWebhook,
        robotCode,
        senderStaffId,
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
   * 每段文本即时发送到钉钉，不缓冲
   */
  onAgentMessage(sessionId, message) {
    const collector = this.responseCollectors.get(sessionId)
    if (!collector) return false // 非钉钉会话，不处理

    // 提取文本块，有内容则立即发送
    const blocks = message?.content || []
    const textParts = []
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text)
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

    // 扫描 tool_use 块中的图片路径
    for (const block of blocks) {
      if (block.type === 'tool_use' && block.input) {
        this._extractImagePaths(block.input).forEach(p => collector.imagePaths.add(p))
      }
    }

    return true
  }

  /**
   * 接收 Agent 一轮对话完成事件
   */
  onAgentResult(sessionId) {
    const collector = this.responseCollectors.get(sessionId)
    if (!collector) return false

    clearTimeout(collector.timer)
    this.responseCollectors.delete(sessionId)

    // 如果整轮都没发过消息（极端情况），兜底发一条
    if (!collector.hasSent) {
      this._replyToDingTalk(collector.webhook, '（处理完成，无文本输出）').catch(() => {})
    }

    // 提取图片发送所需信息后再 resolve（避免 resolve 后引用 collector）
    const { imagePaths, robotCode, senderStaffId, webhook } = collector
    collector.resolve()

    // 异步发送收集到的图片（不阻塞 resolve）
    if (imagePaths.size > 0) {
      this._sendCollectedImages(imagePaths, { robotCode, senderStaffId, webhook }).catch(err => {
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
    if (!collector) return false

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
  async _sendCollectedImages(imagePaths, { robotCode, senderStaffId }) {
    const token = await this._getAccessToken()
    for (const filePath of imagePaths) {
      try {
        const stats = await fs.promises.stat(filePath).catch(() => null)
        if (!stats || stats.size > IMAGE_MAX_SIZE || stats.size === 0) continue

        const mediaId = await this._uploadImage(filePath, token)
        await this._sendImageViaApi(mediaId, { robotCode, senderStaffId, token })
        console.log(`[DingTalk] Image forwarded: ${filePath}`)
      } catch (err) {
        console.error(`[DingTalk] Failed to forward image ${filePath}:`, err.message)
      }
    }
  }

  /**
   * 上传本地图片到钉钉 media API，返回 media_id
   * （media_id 可直接作为 sampleImageMsg 的 photoURL 参数）
   */
  async _uploadImage(filePath, token) {
    const fileName = path.basename(filePath)
    const fileBuffer = await fs.promises.readFile(filePath)

    const formData = new FormData()
    formData.append('media', new Blob([fileBuffer]), fileName)

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
   * 通过接口方式（oToMessages/batchSend）发送图片消息
   */
  async _sendImageViaApi(mediaId, { robotCode, senderStaffId, token }) {
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

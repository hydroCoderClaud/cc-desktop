/**
 * DingTalk Bridge
 * 钉钉机器人桥接模块：通过 Stream 模式接收钉钉消息，转发给 Agent 会话，回复结果到钉钉
 */

const { DWClient } = require('dingtalk-stream-sdk-nodejs')

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

    // 钉钉用户 → Agent 会话映射：{ staffId: sessionId }
    this.sessionMap = new Map()

    // 响应收集器：{ sessionId: { chunks, resolve, webhook } }
    this.responseCollectors = new Map()
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
    this.client.registerCallbackListener(
      '/v1.0/im/bot/messages/get',
      async (res) => {
        try {
          await this._handleDingTalkMessage(res)
        } catch (err) {
          console.error('[DingTalk] Message handling error:', err)
        }
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
    const { text, senderStaffId, senderNick, sessionWebhook } = data

    const userText = text?.content?.trim()
    if (!userText) return

    console.log(`[DingTalk] Message from ${senderNick}(${senderStaffId}): ${userText.substring(0, 50)}`)

    // 查找或创建 Agent 会话
    const sessionId = await this._ensureSession(senderStaffId, senderNick)

    // 通知前端：收到钉钉消息
    this._notifyFrontend('dingtalk:messageReceived', {
      sessionId,
      senderNick,
      text: userText
    })

    // 如果当前会话正在处理，等待上一条完成
    if (this.responseCollectors.has(sessionId)) {
      console.log(`[DingTalk] Session ${sessionId} busy, queuing message`)
      await this._waitForSession(sessionId)
    }

    // 设置响应收集器
    const responsePromise = this._collectResponse(sessionId, sessionWebhook)

    // 发送到 Agent
    try {
      await this.agentSessionManager.sendMessage(sessionId, userText)
    } catch (err) {
      console.error(`[DingTalk] sendMessage failed:`, err.message)
      await this._replyToDingTalk(sessionWebhook, `❌ 错误: ${err.message}`)
      this.responseCollectors.delete(sessionId)
      return
    }

    // 等待响应完成
    try {
      const fullResponse = await responsePromise
      if (fullResponse) {
        await this._replyToDingTalk(sessionWebhook, fullResponse)
      }
    } catch (err) {
      console.error(`[DingTalk] Response collection failed:`, err.message)
      await this._replyToDingTalk(sessionWebhook, `❌ 响应超时或失败`)
    }
  }

  /**
   * 等待会话空闲（上一条消息处理完成）
   */
  _waitForSession(sessionId, timeout = 5 * 60 * 1000) {
    return new Promise((resolve) => {
      const start = Date.now()
      const check = () => {
        if (!this.responseCollectors.has(sessionId) || Date.now() - start > timeout) {
          resolve()
        } else {
          setTimeout(check, 500)
        }
      }
      check()
    })
  }

  /**
   * 确保钉钉用户有对应的 Agent 会话
   */
  async _ensureSession(staffId, nickname) {
    let sessionId = this.sessionMap.get(staffId)

    // 检查会话是否还存在
    if (sessionId) {
      const session = this.agentSessionManager.get(sessionId)
      if (session) return sessionId
      // 会话不存在了，需要重建
      this.sessionMap.delete(staffId)
    }

    // 创建新会话
    const session = this.agentSessionManager.create({
      type: 'dingtalk',
      title: `钉钉 · ${nickname || staffId}`,
      cwd: this._getDefaultCwd()
    })

    sessionId = session.id
    this.sessionMap.set(staffId, sessionId)

    console.log(`[DingTalk] Created session ${sessionId} for ${nickname}(${staffId})`)

    // 通知前端新会话
    this._notifyFrontend('dingtalk:sessionCreated', {
      sessionId,
      staffId,
      nickname
    })

    return sessionId
  }

  /**
   * 收集 Agent 流式响应，拼接为完整文本
   * @returns {Promise<string>} 完整回复文本
   */
  _collectResponse(sessionId, sessionWebhook) {
    return new Promise((resolve, reject) => {
      const collector = {
        chunks: [],
        webhook: sessionWebhook,
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
   * 用于拦截流式输出，拼接完整响应
   */
  onAgentMessage(sessionId, message) {
    const collector = this.responseCollectors.get(sessionId)
    if (!collector) return false // 非钉钉会话，不处理

    // 收集 assistant 文本块
    const blocks = message?.content || []
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        collector.chunks.push(block.text)
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

    const fullText = collector.chunks.join('\n\n')
    collector.resolve(fullText || '（无内容）')
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

    // 如果已收集到部分内容，返回已有内容 + 错误提示
    if (collector.chunks.length > 0) {
      collector.resolve(collector.chunks.join('\n\n') + `\n\n⚠️ ${error}`)
    } else {
      collector.resolve(`❌ ${error}`)
    }
    return true
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
      const fetch = globalThis.fetch || require('node:http')
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
      const fs = require('fs')
      if (fs.existsSync(config.dingtalk.defaultCwd)) {
        return config.dingtalk.defaultCwd
      }
    }
    return process.env.HOME || process.env.USERPROFILE || process.cwd()
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

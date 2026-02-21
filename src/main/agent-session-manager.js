/**
 * Agent 会话管理器
 * 管理 Agent 模式下的 AI 对话会话
 *
 * 使用 @anthropic-ai/claude-agent-sdk 的 query() 函数
 * SDK 是 ESM 模块，通过动态 import() 加载
 *
 * 设计原则：
 * - 参照 ActiveSessionManager 的模式（_safeSend、Map 管理、生命周期）
 * - 支持多个并发 Agent 对话
 * - 流式输出通过 IPC 推送到渲染进程
 * - 多轮对话通过 SDK 的 resume 机制实现
 */

const { v4: uuidv4 } = require('uuid')
const path = require('path')
const os = require('os')
const fs = require('fs')
const fsp = require('fs').promises
const { MessageQueue } = require('./utils/message-queue')
const { safeSend } = require('./utils/safe-send')
const { spawn: cpSpawn } = require('child_process')
const { killProcessTree } = require('./utils/process-tree-kill')
const { AgentStatus, AgentType } = require('./utils/agent-constants')
const AgentFileManager = require('./managers/agent-file-manager')
const AgentQueryManager = require('./managers/agent-query-manager')

/**
 * 单个 Agent 会话
 */
class AgentSession {
  constructor(options) {
    this.id = options.id || uuidv4()
    this.type = options.type || AgentType.CHAT
    this.status = AgentStatus.IDLE
    this.sdkSessionId = null        // SDK 返回的 session_id，用于 resume
    this.title = options.title || ''
    this.cwd = options.cwd || null  // 工作目录
    this.cwdAuto = !options.cwd     // 是否自动分配
    this.createdAt = new Date()
    this.messageQueue = null        // MessageQueue 实例（streaming input 模式）
    this.queryGenerator = null      // Query 生成器（常驻 CLI 进程）
    this.outputLoopPromise = null   // _runOutputLoop 的 Promise
    this.initResult = null          // SDKControlInitializeResponse 缓存
    this.cliPid = null              // SDK 启动的 CLI 子进程 PID（用于 Windows 进程树 kill）
    this.messageCount = 0
    this.totalCostUsd = 0
    this.messages = []              // 消息历史存储（内存）
    this.dbConversationId = null    // 数据库中的 conversation id
    this.apiProfileId = options.apiProfileId || null   // 创建时的 API Profile ID
    this.apiBaseUrl = options.apiBaseUrl || null        // 创建时的 API baseUrl 快照
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      sdkSessionId: this.sdkSessionId,
      title: this.title,
      cwd: this.cwd,
      cwdAuto: this.cwdAuto,
      createdAt: this.createdAt.toISOString(),
      messageCount: this.messageCount,
      totalCostUsd: this.totalCostUsd,
      isStreamingActive: !!this.queryGenerator,
      apiProfileId: this.apiProfileId,
      apiBaseUrl: this.apiBaseUrl
    }
  }
}

class AgentSessionManager {
  constructor(mainWindow, configManager) {
    this.mainWindow = mainWindow
    this.configManager = configManager

    // Agent 会话映射: sessionId -> AgentSession
    this.sessions = new Map()

    // SDK query 函数（延迟加载，ESM）
    this._queryFn = null
    this._sdkLoading = null

    // 数据库引用（通过 setSessionDatabase 注入）
    this.sessionDatabase = null

    // 文件操作管理器（依赖注入）
    this.fileManager = new AgentFileManager(this)

    // Query 控制管理器（依赖注入）
    this.queryManager = new AgentQueryManager(this)

    // 外部消息监听器（可选，钉钉桥接等使用）
    this.messageListener = null
  }

  /**
   * 注入对端 Manager 引用（用于跨模式会话占用检查）
   */
  setPeerManager(activeSessionManager) {
    this.peerManager = activeSessionManager
  }

  /**
   * 检查指定 CLI 会话 UUID 是否正在本 Manager 中活跃
   * @param {string} cliSessionUuid - Claude Code CLI 的会话 UUID
   * @returns {boolean}
   */
  isCliSessionActive(cliSessionUuid) {
    if (!cliSessionUuid) return false
    for (const session of this.sessions.values()) {
      // 只有正在流式输出或空闲（有活跃 CLI 进程）才算占用
      const isActive = session.sdkSessionId === cliSessionUuid &&
        (session.status === AgentStatus.STREAMING || (session.status === AgentStatus.IDLE && session.queryGenerator))
      if (isActive) return true
    }
    return false
  }

  /**
   * 注入数据库实例
   */
  setSessionDatabase(db) {
    this.sessionDatabase = db

    // 启动时将之前未正常关闭的会话标记为 closed
    if (db) {
      try {
        db.closeAllActiveAgentConversations()
        console.log('[AgentSession] Marked all active conversations as closed on startup')
      } catch (err) {
        console.error('[AgentSession] Failed to close active conversations:', err)
      }
    }
  }

  /**
   * 延迟加载 SDK（ESM 模块需要动态 import）
   */
  async _loadSDK() {
    if (this._queryFn) return this._queryFn

    if (this._sdkLoading) return this._sdkLoading

    this._sdkLoading = (async () => {
      try {
        const sdk = await import('@anthropic-ai/claude-agent-sdk')
        this._queryFn = sdk.query
        console.log('[AgentSession] SDK loaded successfully')
        return this._queryFn
      } catch (error) {
        this._sdkLoading = null  // 重置，允许下次重试
        console.error('[AgentSession] Failed to load SDK:', error)
        throw error
      }
    })()

    return this._sdkLoading
  }

  /**
   * 安全地发送消息到渲染进程（委托给共享工具函数）
   */
  _safeSend(channel, data) {
    return safeSend(this.mainWindow, channel, data)
  }

  /**
   * 获取输出基础目录
   */
  _getOutputBaseDir() {
    const config = this.configManager.getConfig()
    const customDir = config?.settings?.agent?.outputBaseDir
    if (customDir && fs.existsSync(customDir)) {
      return customDir
    }
    return path.join(os.homedir(), 'cc-desktop-agent-output')
  }

  /**
   * 为会话自动分配工作目录
   */
  _assignCwd(session) {
    const baseDir = this._getOutputBaseDir()
    const sessionDir = path.join(baseDir, `conv-${session.id.substring(0, 8)}`)
    try {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true })
      }
    } catch (err) {
      console.error('[AgentSession] Failed to create output dir:', err)
    }
    return sessionDir
  }

  /**
   * 构建 SDK 环境变量
   */
  _buildEnvVars() {
    const { buildProcessEnv, buildStandardExtraVars } = require('./utils/env-builder')
    const profile = this.configManager.getDefaultProfile()

    // 使用标准 extraVars（TERM、SHELL、AUTOCOMPACT）
    const extraVars = buildStandardExtraVars(this.configManager)

    return buildProcessEnv(profile, extraVars)
  }

  /**
   * 创建新会话
   */
  create(options = {}) {
    // 获取当前默认 API Profile 信息
    const profile = this.configManager.getDefaultProfile()

    const session = new AgentSession({
      type: options.type,
      title: options.title,
      cwd: options.cwd,
      apiProfileId: profile?.id || null,
      apiBaseUrl: profile?.baseUrl || null
    })

    // 自动分配工作目录
    if (!session.cwd) {
      session.cwd = this._assignCwd(session)
    }

    this.sessions.set(session.id, session)

    // 写入数据库
    if (this.sessionDatabase) {
      try {
        const dbRecord = this.sessionDatabase.createAgentConversation({
          sessionId: session.id,
          type: session.type,
          title: session.title,
          cwd: session.cwd,
          cwdAuto: session.cwdAuto,
          apiProfileId: profile?.id || null,
          apiBaseUrl: profile?.baseUrl || null
        })
        session.dbConversationId = dbRecord.id
      } catch (err) {
        console.error('[AgentSession] Failed to create DB record:', err)
      }
    }

    console.log(`[AgentSession] Created session ${session.id}, type: ${session.type}, cwd: ${session.cwd}`)
    return session.toJSON()
  }

  /**
   * 从数据库恢复会话到内存（关闭后重新打开、重启后恢复）
   * @returns {Object|null} 恢复后的会话 JSON，或 null
   */
  reopen(sessionId) {
    let session = this.sessions.get(sessionId)

    if (!session) {
      // 不在内存中，从 DB 恢复
      if (!this.sessionDatabase) return null

      const row = this.sessionDatabase.getAgentConversation(sessionId)
      if (!row) return null

      session = new AgentSession({
        id: row.session_id,
        type: row.type,
        title: row.title || '',
        cwd: row.cwd
      })

      // 恢复关键状态
      session.sdkSessionId = row.sdk_session_id || null
      session.cwdAuto = !!row.cwd_auto
      session.dbConversationId = row.id
      session.messageCount = row.message_count || 0
      session.totalCostUsd = row.total_cost_usd || 0
      session.createdAt = row.created_at ? new Date(row.created_at) : new Date()
      session.apiProfileId = row.api_profile_id || null
      session.apiBaseUrl = row.api_base_url || null

      // 放回内存 Map
      this.sessions.set(session.id, session)

      // 更新 DB 状态为 idle（重新激活）
      try {
        this.sessionDatabase.updateAgentConversation(sessionId, { status: AgentStatus.IDLE })
      } catch (err) {
        console.error('[AgentSession] Failed to update status on reopen:', err)
      }

      console.log(`[AgentSession] Reopened session ${sessionId} from DB (sdkSessionId: ${session.sdkSessionId || 'none'})`)
    }

    // 检测 API Profile 是否变化（无论是从内存还是 DB 恢复，都要检测）
    const currentProfile = this.configManager.getDefaultProfile()
    const result = session.toJSON()

    // 优先用 baseUrl 比较（精确）；旧会话无 baseUrl 时退化为 profileId 比较
    if (session.apiBaseUrl) {
      if (currentProfile?.baseUrl !== session.apiBaseUrl) {
        result.apiChanged = true
        result.originalApiBaseUrl = session.apiBaseUrl
        result.currentApiBaseUrl = currentProfile?.baseUrl || ''
      }
    } else if (session.apiProfileId) {
      if (currentProfile?.id !== session.apiProfileId) {
        result.apiChanged = true
        result.originalApiBaseUrl = `Profile: ${session.apiProfileId}`
        result.currentApiBaseUrl = currentProfile?.baseUrl || `Profile: ${currentProfile?.id || 'unknown'}`
      }
    }

    return result
  }

  /**
   * 发送消息到 Agent 会话（Streaming Input 模式）
   *
   * 第一条消息：创建 MessageQueue + 持久 query + 后台输出循环
   * 后续消息：直接 push 到现有 MessageQueue
   */
  async sendMessage(sessionId, userMessage, { modelTier, maxTurns, meta } = {}) {
    let session = this.sessions.get(sessionId)

    // 内存中不存在，尝试自动恢复（兜底）
    if (!session) {
      this.reopen(sessionId)
      session = this.sessions.get(sessionId)
    }
    if (!session) {
      throw new Error(`Agent session ${sessionId} not found`)
    }

    if (session.status === AgentStatus.STREAMING) {
      throw new Error(`Agent session ${sessionId} is already streaming`)
    }

    // 处理多模态消息（兼容旧格式）
    let messageContent
    let displayContent  // 用于存储到数据库的可读内容
    let imageData = null  // 图片数据（用于保存到数据库）

    if (typeof userMessage === 'string') {
      // 兼容旧格式：纯文本
      messageContent = userMessage
      displayContent = userMessage
    } else if (userMessage && typeof userMessage === 'object') {
      // 新格式：{ text, images: [{base64, mediaType}] }
      const { text = '', images = [] } = userMessage

      if (images.length > 0) {
        // 多模态消息：文本 + 图片
        messageContent = []

        // 添加文本（如果有）
        if (text) {
          messageContent.push({ type: 'text', text })
        }

        // 添加图片
        for (const img of images) {
          messageContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.base64
            }
          })
        }

        // 存储到数据库的显示内容
        displayContent = text || '[图片]'
        if (images.length > 1) {
          displayContent += ` (${images.length}张图片)`
        } else if (images.length === 1 && !text) {
          displayContent = '[图片]'
        }

        // 保存图片数据到数据库
        imageData = images
      } else {
        // 只有文本
        messageContent = text
        displayContent = text
      }
    } else {
      throw new Error('Invalid message format')
    }

    // 存储用户消息到历史（包含图片数据）
    const userMsgToStore = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: displayContent,  // 存储简化的可读内容
      timestamp: Date.now()
    }

    // 如果有图片，添加到消息对象
    if (imageData && imageData.length > 0) {
      userMsgToStore.images = imageData
    }

    // 附加元数据（如钉钉来源信息）
    if (meta) {
      if (meta.source) userMsgToStore.source = meta.source
      if (meta.senderNick) userMsgToStore.senderNick = meta.senderNick
    }

    this._storeMessage(session, userMsgToStore)

    // 设置状态
    session.status = AgentStatus.STREAMING
    session.messageCount++

    // 通知前端状态变化
    this._safeSend('agent:statusChange', {
      sessionId: session.id,
      status: AgentStatus.STREAMING
    })

    // 构建 SDKUserMessage
    const sdkUserMessage = {
      type: 'user',
      message: { role: 'user', content: messageContent },
      parent_tool_use_id: null,
      session_id: session.sdkSessionId || session.id
    }

    // 已有持久 query → 直接 push 消息
    if (session.queryGenerator && session.messageQueue && !session.messageQueue.isDone) {
      // push 前确保模型正确（防止 watch 中的 setModel 静默失败）
      if (modelTier) {
        try {
          await session.queryGenerator.setModel(modelTier)
        } catch (e) {
          console.warn(`[AgentSession] setModel before push failed: ${e.message}`)
        }
      }
      console.log(`[AgentSession] Pushing message to existing queue for session ${sessionId}`)
      session.messageQueue.push(sdkUserMessage)
      return
    }

    // 首次消息（或 CLI 进程已退出）→ 创建新的持久 query
    console.log(`[AgentSession] Creating new streaming query for session ${sessionId}`)

    try {
      const queryFn = await this._loadSDK()
      const env = this._buildEnvVars()

      // 创建 MessageQueue
      const messageQueue = new MessageQueue()
      session.messageQueue = messageQueue

      // 构建 query 选项
      const options = {
        cwd: session.cwd,
        permissionMode: 'acceptEdits',
        settingSources: ['user'],
        includePartialMessages: true,
        env,
        // 包装 spawn 以捕获 CLI 子进程 PID（Windows 进程树 kill 需要）
        spawnClaudeCodeProcess: (spawnOpts) => {
          // 修正 CLI 路径：SDK 在 asar 里，计算的路径需要重定向到 unpacked
          // 支持 Windows 和 Unix 风格的路径分隔符
          let cliPath = spawnOpts.args[0]  // 第一个参数通常是 cli.js 的路径
          if (cliPath && /[\/\\]app\.asar[\/\\]/.test(cliPath) && !cliPath.includes('app.asar.unpacked')) {
            // 使用正则替换，兼容 Windows 反斜杠和 Unix 正斜杠
            cliPath = cliPath.replace(/[\/\\]app\.asar[\/\\]/g, (match) => {
              return match.replace('app.asar', 'app.asar.unpacked')
            })
            spawnOpts.args[0] = cliPath
            console.log(`[AgentSession] Fixed CLI path: ${cliPath}`)
          }

          // 直接使用我们构建的环境变量，忽略 SDK 的（确保 PATH 包含 node）
          const finalEnv = env

          const proc = cpSpawn(spawnOpts.command, spawnOpts.args, {
            cwd: spawnOpts.cwd,
            env: finalEnv,  // 使用我们的环境变量
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false  // 显式禁用 shell（使用直接 exec）
          })
          session.cliPid = proc.pid || null
          console.log(`[AgentSession] CLI spawned: command=${spawnOpts.command}, args[0]=${spawnOpts.args[0]?.substring(0, 80)}`)


          // 捕获 stderr 用于调试
          let stderrData = ''
          if (proc.stderr) {
            proc.stderr.on('data', (data) => {
              const text = data.toString()
              stderrData += text
              console.error(`[AgentSession] CLI stderr: ${text}`)  // 立即输出到控制台
            })
          }

          // 进程退出时输出完整错误信息
          proc.on('exit', (code, signal) => {
            console.log(`[AgentSession] CLI exited: code=${code}, signal=${signal}`)
            if (code !== 0) {
              console.error(`[AgentSession] CLI stderr (full):`, stderrData)
              if (stderrData) {
                this._safeSend('agent:cliError', {
                  sessionId: session.id,
                  exitCode: code,
                  signal,
                  stderr: stderrData
                })
              }
            }
          })

          return proc
        }
      }

      // 前端明确指定模型时覆盖，否则 SDK 从 env.ANTHROPIC_MODEL 自动读取
      if (modelTier) {
        options.model = modelTier
      }

      if (maxTurns) {
        options.maxTurns = maxTurns
      }

      // resume：恢复历史对话上下文（应用重启、会话重新打开等场景必需）
      if (session.sdkSessionId) {
        // 跨模式占用检查：该 CLI 会话是否正在 Terminal 模式中使用
        if (this.peerManager?.isCliSessionActive(session.sdkSessionId)) {
          throw new Error('SESSION_IN_USE_BY_TERMINAL')
        }
        options.resume = session.sdkSessionId
      }

      // 创建持久 query（AsyncIterable 模式）
      const generator = queryFn({ prompt: messageQueue, options })
      session.queryGenerator = generator

      // push 第一条消息
      messageQueue.push(sdkUserMessage)

      // 启动后台输出循环
      session.outputLoopPromise = this._runOutputLoop(session)

    } catch (error) {
      console.error(`[AgentSession] Failed to create streaming query for session ${sessionId}:`, error)
      session.status = AgentStatus.ERROR
      session.queryGenerator = null
      session.messageQueue = null

      this._safeSend('agent:error', {
        sessionId: session.id,
        error: error.message || 'Failed to start session'
      })
      this._safeSend('agent:statusChange', {
        sessionId: session.id,
        status: session.status
      })
    }
  }

  /**
   * 后台输出循环 — 持续遍历 SDK 输出消息
   * 生成器正常结束 = CLI 进程退出
   */
  async _runOutputLoop(session) {
    try {
      for await (const msg of session.queryGenerator) {
        await this._processMessage(session, msg)
      }

      // 生成器正常结束（CLI 进程退出）
      console.log(`[AgentSession] Output loop ended normally for session ${session.id}`)
      session.status = AgentStatus.IDLE

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`[AgentSession] Output loop aborted for session ${session.id}`)
        session.status = AgentStatus.IDLE
      } else {
        console.error(`[AgentSession] Output loop error for session ${session.id}:`, error)
        session.status = AgentStatus.ERROR

        this._safeSend('agent:error', {
          sessionId: session.id,
          error: error.message || 'Session error'
        })

        // 通知外部监听器（钉钉桥接等）
        if (this.messageListener?.onAgentError) {
          try { this.messageListener.onAgentError(session.id, error.message) } catch (e) { console.error('[AgentSession] messageListener.onAgentError threw:', e) }
        }
      }
    } finally {
      // 清理引用
      session.queryGenerator = null
      session.messageQueue = null
      session.outputLoopPromise = null
      session.cliPid = null

      this._safeSend('agent:statusChange', {
        sessionId: session.id,
        status: session.status,
        cliExited: true  // 标记 CLI 进程已退出，前端需要重置 hasActiveSession
      })
    }
  }

  /**
   * 存储消息到会话历史（内存 + DB）
   */
  _storeMessage(session, msg) {
    session.messages.push(msg)

    // 写入数据库
    if (this.sessionDatabase && session.dbConversationId) {
      try {
        let contentToSave = msg.content

        // 如果消息包含图片或元数据（钉钉来源），将 content 合并为对象保存
        const hasMeta = msg.source || msg.senderNick
        if ((msg.images && msg.images.length > 0) || hasMeta) {
          contentToSave = {
            text: msg.content || '',
            ...(msg.images?.length > 0 && { images: msg.images }),
            ...(msg.source && { source: msg.source }),
            ...(msg.senderNick && { senderNick: msg.senderNick })
          }
        }

        // 序列化 content（如果是对象/数组，转为 JSON 字符串）
        if (contentToSave && typeof contentToSave === 'object') {
          contentToSave = JSON.stringify(contentToSave)
        }

        this.sessionDatabase.insertAgentMessage(session.dbConversationId, {
          msgId: msg.id,
          role: msg.role,
          content: contentToSave || null,
          toolName: msg.toolName || null,
          toolInput: msg.input || null,
          toolOutput: msg.output || null,
          timestamp: msg.timestamp
        })
      } catch (err) {
        console.error('[AgentSession] Failed to insert message to DB:', err)
      }
    }
  }

  /**
   * 处理单条 SDK 消息
   */
  async _processMessage(session, msg) {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          // 首次 init：保存 session_id 用于后续 resume
          session.sdkSessionId = msg.session_id
          this._safeSend('agent:init', {
            sessionId: session.id,
            sdkSessionId: msg.session_id,
            tools: msg.tools,
            model: msg.model,
            slashCommands: msg.slash_commands || []
          })

          // 更新 DB 中的 sdk_session_id
          if (this.sessionDatabase) {
            try {
              this.sessionDatabase.updateAgentConversation(session.id, {
                sdkSessionId: msg.session_id
              })
            } catch (err) {
              console.error('[AgentSession] Failed to update sdk_session_id:', err)
            }
          }
        } else if (msg.subtype === 'compact_boundary') {
          // 上下文压缩完成
          console.log(`[AgentSession] Compact completed for session ${session.id}, pre_tokens=${msg.compact_metadata?.pre_tokens}, trigger=${msg.compact_metadata?.trigger}`)
          this._safeSend('agent:compacted', {
            sessionId: session.id,
            preTokens: msg.compact_metadata?.pre_tokens || 0,
            trigger: msg.compact_metadata?.trigger || 'manual'
          })
        } else if (msg.subtype === 'status') {
          this._safeSend('agent:systemStatus', {
            sessionId: session.id,
            status: msg.status
          })
        }
        break

      case 'assistant': {
        // 完整的 assistant 消息（包含 tool_use）
        const assistantData = {
          type: 'assistant',
          content: msg.message?.content || [],
          uuid: msg.uuid,
          sessionId: msg.session_id
        }
        this._safeSend('agent:message', {
          sessionId: session.id,
          message: assistantData
        })

        // 通知外部监听器（钉钉桥接等）
        if (this.messageListener?.onAgentMessage) {
          try { this.messageListener.onAgentMessage(session.id, assistantData) } catch (e) { console.error('[AgentSession] messageListener.onAgentMessage threw:', e) }
        }

        // 转发 API 级别 usage（input_tokens ≈ 上下文大小）
        if (msg.message?.usage) {
          this._safeSend('agent:usage', {
            sessionId: session.id,
            usage: msg.message.usage
          })
        }

        // 存储助手消息和工具调用到历史
        const blocks = msg.message?.content || []
        for (const block of blocks) {
          if (block.type === 'text') {
            this._storeMessage(session, {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'assistant',
              content: block.text,
              timestamp: Date.now()
            })
          } else if (block.type === 'tool_use') {
            this._storeMessage(session, {
              id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'tool',
              toolName: block.name,
              input: block.input,
              output: null,
              timestamp: Date.now()
            })
          }
        }
        break
      }

      case 'stream_event':
        // 流式 token 事件（不存储，完整消息通过 assistant 类型存储）
        this._safeSend('agent:stream', {
          sessionId: session.id,
          event: msg.event
        })
        break

      case 'result':
        // 一轮对话完成（streaming input 模式下 CLI 仍在运行）
        session.totalCostUsd += msg.total_cost_usd || 0

        // 设置为 IDLE（等待下一条消息），但不关闭 generator
        session.status = AgentStatus.IDLE

        this._safeSend('agent:result', {
          sessionId: session.id,
          result: {
            subtype: msg.subtype,
            isError: msg.is_error,
            result: msg.result,
            totalCostUsd: msg.total_cost_usd,
            numTurns: msg.num_turns,
            durationMs: msg.duration_ms,
            usage: msg.usage,
            modelUsage: msg.modelUsage
          }
        })

        // 通知前端状态回到 IDLE
        this._safeSend('agent:statusChange', {
          sessionId: session.id,
          status: AgentStatus.IDLE
        })

        // 通知外部监听器（钉钉桥接等）：一轮对话完成
        if (this.messageListener?.onAgentResult) {
          try { this.messageListener.onAgentResult(session.id) } catch (e) { console.error('[AgentSession] messageListener.onAgentResult threw:', e) }
        }

        // 更新 DB 中的统计信息
        if (this.sessionDatabase) {
          try {
            this.sessionDatabase.updateAgentConversation(session.id, {
              totalCostUsd: session.totalCostUsd,
              messageCount: session.messageCount
            })
          } catch (err) {
            console.error('[AgentSession] Failed to update result stats:', err)
          }
        }
        break

      case 'tool_progress':
        this._safeSend('agent:toolProgress', {
          sessionId: session.id,
          toolUseId: msg.tool_use_id,
          toolName: msg.tool_name,
          elapsedSeconds: msg.elapsed_time_seconds
        })
        break

      default:
        // 其他消息类型原样转发
        this._safeSend('agent:otherMessage', {
          sessionId: session.id,
          message: msg
        })
    }
  }

  /**
   * 取消当前生成（使用 interrupt，不杀 CLI 进程）
   */
  async cancel(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Streaming input 模式：使用 interrupt() 中断当前生成
    if (session.queryGenerator) {
      try {
        await session.queryGenerator.interrupt()
        console.log(`[AgentSession] Interrupted session ${sessionId}`)
      } catch (e) {
        console.warn(`[AgentSession] interrupt() failed for ${sessionId}, falling back to close:`, e.message)
        // fallback: close() 杀掉 CLI 进程
        killProcessTree(session.cliPid)
        try { session.queryGenerator.close() } catch {}
        session.queryGenerator = null
        session.cliPid = null
        if (session.messageQueue) {
          session.messageQueue.end()
          session.messageQueue = null
        }
      }
    }

    session.status = AgentStatus.IDLE

    this._safeSend('agent:statusChange', {
      sessionId: session.id,
      status: AgentStatus.IDLE
    })
  }

  /**
   * 关闭会话（终止持久 CLI 进程 + DB 标记 closed + 内存移除）
   */
  async close(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // 结束 MessageQueue（让 SDK 的 for-await 正常退出）
    if (session.messageQueue) {
      session.messageQueue.end()
      session.messageQueue = null
    }

    // 关闭 generator（杀 CLI 进程）
    if (session.queryGenerator) {
      killProcessTree(session.cliPid)
      try { session.queryGenerator.close() } catch {}
      session.queryGenerator = null
      session.cliPid = null
    }

    // 等待输出循环结束，避免后续引用已清理的资源
    if (session.outputLoopPromise) {
      try {
        await Promise.race([
          session.outputLoopPromise,
          new Promise(resolve => setTimeout(resolve, 3000))  // 最多等 3 秒
        ])
      } catch {}
      session.outputLoopPromise = null
    }

    // DB 软关闭
    if (this.sessionDatabase) {
      try {
        this.sessionDatabase.closeAgentConversation(sessionId)
      } catch (err) {
        console.error('[AgentSession] Failed to close in DB:', err)
      }
    }

    // 从内存 Map 移除
    this.sessions.delete(sessionId)
    console.log(`[AgentSession] Closed session ${sessionId}`)
  }

  /**
   * 关闭所有会话（异步，逐个等待）
   */
  async closeAll() {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.close(sessionId)
    }
  }

  /**
   * 同步关闭所有会话（用于 closed / will-quit 等无法 await 的事件）
   * 直接杀 CLI 进程 + DB 软关闭 + 清内存，不等待 outputLoopPromise
   */
  closeAllSync() {
    const count = this.sessions.size
    if (count === 0) return
    for (const [sessionId, session] of this.sessions) {
      // 异常关闭 MessageQueue（清空缓冲区 + 结束）
      if (session.messageQueue) {
        session.messageQueue.abort()
        session.messageQueue = null
      }
      // 同步 close generator（杀 CLI 进程）
      killProcessTree(session.cliPid)
      if (session.queryGenerator) {
        try {
          session.queryGenerator.close()
        } catch (e) {
          console.warn(`[AgentSession] close() failed for ${sessionId}:`, e.message)
        }
        session.queryGenerator = null
      }
      session.cliPid = null
      // DB 软关闭（better-sqlite3 是同步的）
      if (this.sessionDatabase) {
        try { this.sessionDatabase.closeAgentConversation(sessionId) } catch {}
      }
      // 清理内存引用
      session.outputLoopPromise = null
    }
    this.sessions.clear()
    console.log(`[AgentSession] ${count} session(s) closed synchronously`)
  }

  /**
   * 通知前端所有 Agent 会话已关闭
   * macOS: 窗口重建后调用，让前端刷新 Agent 会话列表并重置状态
   */
  notifyAllSessionsClosed() {
    this._safeSend('agent:allSessionsClosed', {})
  }

  /**
   * 获取会话
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId)
    return session ? session.toJSON() : null
  }

  /**
   * 获取所有会话列表（合并内存活跃 + DB 历史，去重）
   */
  list() {
    // 1. 内存中的活跃会话
    const activeIds = new Set()
    const result = []

    for (const session of this.sessions.values()) {
      result.push(session.toJSON())
      activeIds.add(session.id)
    }

    // 2. 从 DB 加载历史会话（非 closed 的也在内存中，这里主要取 closed 的历史）
    if (this.sessionDatabase) {
      try {
        const dbConversations = this.sessionDatabase.listAllAgentConversations({ limit: 100 })
        for (const row of dbConversations) {
          if (activeIds.has(row.session_id)) continue  // 去重
          result.push({
            id: row.session_id,
            type: row.type,
            status: row.status,
            sdkSessionId: row.sdk_session_id,
            title: row.title || '',
            cwd: row.cwd,
            cwdAuto: !!row.cwd_auto,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            messageCount: row.message_count || 0,
            totalCostUsd: row.total_cost_usd || 0,
            apiProfileId: row.api_profile_id || null,
            apiBaseUrl: row.api_base_url || null
          })
        }
      } catch (err) {
        console.error('[AgentSession] Failed to load DB conversations:', err)
      }
    }

    // 按 createdAt 降序排序
    result.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })

    return result
  }

  /**
   * 重命名会话（同步内存 + DB + 通知前端）
   */
  rename(sessionId, newTitle) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      // 尝试只更新 DB（历史会话可能不在内存中）
      if (this.sessionDatabase) {
        this.sessionDatabase.updateAgentConversationTitle(sessionId, newTitle)
      }
      this._safeSend('agent:renamed', { sessionId, title: newTitle })
      return { id: sessionId, title: newTitle }
    }

    // 更新内存
    session.title = newTitle

    // 更新 DB
    if (this.sessionDatabase) {
      try {
        this.sessionDatabase.updateAgentConversationTitle(sessionId, newTitle)
      } catch (err) {
        console.error('[AgentSession] Failed to update title in DB:', err)
      }
    }

    // 通知前端
    this._safeSend('agent:renamed', { sessionId, title: newTitle })

    console.log(`[AgentSession] Renamed session ${sessionId} to: ${newTitle}`)
    return session.toJSON()
  }

  /**
   * 获取会话消息历史（DB 优先，确保历史完整；内存兜底）
   *
   * 注意：_storeMessage 同步写入内存和 DB，DB 始终完整。
   * 若采用"内存优先"，当 sendMessage 在 loadMessages() 之前被调用时（如钉钉恢复场景），
   * session.messages 仅含当前新消息，导致历史无法渲染。
   */
  getMessages(sessionId) {
    const session = this.sessions.get(sessionId)

    // 1. DB 优先查询（DB 始终包含完整历史 + 当前消息）
    if (this.sessionDatabase) {
      try {
        const conv = this.sessionDatabase.getAgentConversation(sessionId)
        if (!conv) return session ? session.messages : []

        const dbMessages = this.sessionDatabase.getAgentMessagesByConversationId(conv.id)
        if (dbMessages.length === 0) return session ? session.messages : []

        // 转换 snake_case → camelCase
        const messages = dbMessages.map(row => {
          // 反序列化 content（如果是 JSON 字符串，解析为对象/数组）
          let content = row.content || undefined
          let images = undefined
          let source = undefined
          let senderNick = undefined

          if (content && typeof content === 'string') {
            // 检测是否为 JSON 字符串（以 { 或 [ 开头）
            const trimmed = content.trim()
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                const parsed = JSON.parse(content)
                // 如果是扩展消息格式 { text, images?, source?, senderNick? }
                if (parsed && typeof parsed === 'object' && ('images' in parsed || 'source' in parsed)) {
                  content = parsed.text || ''
                  images = parsed.images
                  source = parsed.source
                  senderNick = parsed.senderNick
                } else {
                  content = parsed
                }
              } catch {
                // 解析失败，保持原字符串
              }
            }
          }

          const message = {
            id: row.msg_id,
            role: row.role,
            content,
            toolName: row.tool_name || undefined,
            input: row.tool_input ? JSON.parse(row.tool_input) : undefined,
            output: row.tool_output ? JSON.parse(row.tool_output) : undefined,
            timestamp: row.timestamp
          }

          // 如果有图片，添加到消息对象
          if (images && images.length > 0) {
            message.images = images
          }
          // 恢复钉钉来源元数据
          if (source) message.source = source
          if (senderNick) message.senderNick = senderNick

          return message
        })

        // 如果 session 在内存，把 DB 消息回填到内存（后续新消息会追加）
        if (session) {
          session.messages = messages
        }

        return messages
      } catch (err) {
        console.error('[AgentSession] Failed to load messages from DB:', err)
      }
    }

    // 2. 兜底：DB 不可用或出错时，返回内存中的消息
    return session ? session.messages : []
  }

  /**
   * 物理删除对话（终止 CLI + 内存 + DB）
   */
  async deleteConversation(sessionId) {
    // 从内存移除（如果存在）
    const session = this.sessions.get(sessionId)
    if (session) {
      // 终止持久 CLI 进程
      if (session.messageQueue) {
        session.messageQueue.end()
      }
      killProcessTree(session.cliPid)
      if (session.queryGenerator) {
        try { session.queryGenerator.close() } catch {}
      }
      session.cliPid = null

      // 等待输出循环结束，避免 finally 块发送 stale 事件
      if (session.outputLoopPromise) {
        try {
          await Promise.race([
            session.outputLoopPromise,
            new Promise(resolve => setTimeout(resolve, 3000))
          ])
        } catch {}
      }

      this.sessions.delete(sessionId)
    }

    // 从 DB 删除
    if (this.sessionDatabase) {
      try {
        this.sessionDatabase.deleteAgentConversation(sessionId)
      } catch (err) {
        console.error('[AgentSession] Failed to delete from DB:', err)
      }
    }

    console.log(`[AgentSession] Deleted session ${sessionId}`)
    return { success: true }
  }

  /**
   * 压缩会话上下文
   * Streaming input 模式：直接 push /compact 消息到现有 queue
   * 无持久会话时：通过 sendMessage 发送（会创建新 query）
   */
  async compactConversation(sessionId) {
    let session = this.sessions.get(sessionId)

    if (!session) {
      this.reopen(sessionId)
      session = this.sessions.get(sessionId)
    }
    if (!session) {
      throw new Error(`Agent session ${sessionId} not found`)
    }
    if (session.status === AgentStatus.STREAMING) {
      throw new Error('Session is currently streaming')
    }

    // 有持久 query → 直接 push /compact 命令
    if (session.queryGenerator && session.messageQueue && !session.messageQueue.isDone) {
      session.status = AgentStatus.STREAMING
      this._safeSend('agent:statusChange', {
        sessionId: session.id,
        status: AgentStatus.STREAMING
      })

      console.log(`[AgentSession] Pushing /compact to messageQueue for session ${sessionId}`)
      session.messageQueue.push({
        type: 'user',
        message: { role: 'user', content: '/compact' },
        parent_tool_use_id: null,
        session_id: session.sdkSessionId || session.id
      })
      return
    }

    // 无持久 query（CLI 已退出）→ 通过 sendMessage 发送
    if (!session.sdkSessionId) {
      throw new Error('No active SDK session to compact')
    }
    await this.sendMessage(sessionId, '/compact', { maxTurns: 1 })
  }

  /**
   * 获取输出目录路径
   */
  getOutputDir(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return session.cwd
  }

  /**
   * 列出输出文件
   */
  listOutputFiles(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session || !session.cwd) return []

    try {
      if (!fs.existsSync(session.cwd)) return []
      const entries = fs.readdirSync(session.cwd, { withFileTypes: true })
      return entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(session.cwd, entry.name)
      }))
    } catch (err) {
      console.error('[AgentSession] Failed to list output files:', err)
      return []
    }
  }

  // ============= 文件操作委托（委托给 fileManager） =============

  /**
   * 解析文件完整路径（供外部打开使用）
   */
  resolveFilePath(sessionId, relativePath) {
    return this.fileManager.resolveFilePath(sessionId, relativePath)
  }

  /**
   * 列出目录内容
   */
  async listDir(sessionId, relativePath = '', showHidden = false) {
    return this.fileManager.listDir(sessionId, relativePath, showHidden)
  }

  /**
   * 读取文件内容用于预览
   */
  async readFile(sessionId, relativePath) {
    return this.fileManager.readFile(sessionId, relativePath)
  }

  /**
   * 保存文件内容
   */
  async saveFile(sessionId, relativePath, content) {
    return this.fileManager.saveFile(sessionId, relativePath, content)
  }

  /**
   * 创建文件或文件夹
   */
  async createFile(sessionId, parentPath, name, isDirectory) {
    return this.fileManager.createFile(sessionId, parentPath, name, isDirectory)
  }

  /**
   * 重命名文件或文件夹
   */
  async renameFile(sessionId, oldPath, newName) {
    return this.fileManager.renameFile(sessionId, oldPath, newName)
  }

  /**
   * 删除文件或文件夹
   */
  async deleteFile(sessionId, relativePath) {
    return this.fileManager.deleteFile(sessionId, relativePath)
  }

  // ============= Query 控制委托（委托给 queryManager） =============

  async setModel(sessionId, model) {
    return this.queryManager.setModel(sessionId, model)
  }

  async getSupportedModels(sessionId) {
    return this.queryManager.getSupportedModels(sessionId)
  }

  async getSupportedCommands(sessionId) {
    return this.queryManager.getSupportedCommands(sessionId)
  }

  async getAccountInfo(sessionId) {
    return this.queryManager.getAccountInfo(sessionId)
  }

  async getMcpServerStatus(sessionId) {
    return this.queryManager.getMcpServerStatus(sessionId)
  }

  async getInitResult(sessionId) {
    return this.queryManager.getInitResult(sessionId)
  }
}

module.exports = {
  AgentSessionManager,
  AgentSession,
  AgentStatus,
  AgentType
}

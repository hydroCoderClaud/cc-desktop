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

/**
 * Agent 会话状态
 */
const AgentStatus = {
  IDLE: 'idle',           // 空闲，等待用户输入
  STREAMING: 'streaming', // 正在流式输出
  ERROR: 'error'          // 出错
}

/**
 * Agent 类型
 */
const AgentType = {
  CHAT: 'chat',               // 通用对话
  SPECIALIZED: 'specialized', // 专用 Agent
  LIGHTAPP: 'lightapp'        // 轻应用 Agent
}

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
    this.abortController = null     // 用于取消生成
    this.queryInstance = null       // 当前 Query 实例引用
    this.messageCount = 0
    this.totalCostUsd = 0
    this.messages = []              // 消息历史存储（内存）
    this.dbConversationId = null    // 数据库中的 conversation id
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
      totalCostUsd: this.totalCostUsd
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
        console.error('[AgentSession] Failed to load SDK:', error)
        throw error
      }
    })()

    return this._sdkLoading
  }

  /**
   * 安全地发送消息到渲染进程
   */
  _safeSend(channel, data) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed() &&
          this.mainWindow.webContents && !this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data)
        return true
      }
      console.warn(`[AgentSession] Cannot send to ${channel}: window destroyed`)
      return false
    } catch (error) {
      console.error(`[AgentSession] Failed to send to ${channel}:`, error)
      return false
    }
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
    const { buildClaudeEnvVars } = require('./utils/env-builder')

    // 获取默认 API Profile
    let profile = this.configManager.getDefaultProfile()

    // 构建基础环境
    const baseEnv = { ...process.env }
    delete baseEnv.ANTHROPIC_API_KEY
    delete baseEnv.ANTHROPIC_AUTH_TOKEN

    // 构建 Claude 环境变量
    const claudeEnvVars = buildClaudeEnvVars(profile)

    // 合并
    const env = { ...baseEnv, ...claudeEnvVars }

    // 清理空值
    for (const key of Object.keys(env)) {
      if (env[key] === '') {
        delete env[key]
      }
    }

    return env
  }

  /**
   * 创建新会话
   */
  create(options = {}) {
    const session = new AgentSession({
      type: options.type,
      title: options.title,
      cwd: options.cwd
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
          cwdAuto: session.cwdAuto
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
   * 发送消息到 Agent 会话
   */
  /**
   * 从数据库恢复会话到内存（关闭后重新打开、重启后恢复）
   * @returns {Object|null} 恢复后的会话 JSON，或 null
   */
  reopen(sessionId) {
    // 已在内存中，直接返回
    const existing = this.sessions.get(sessionId)
    if (existing) return existing.toJSON()

    if (!this.sessionDatabase) return null

    const row = this.sessionDatabase.getAgentConversation(sessionId)
    if (!row) return null

    const session = new AgentSession({
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

    // 放回内存 Map
    this.sessions.set(session.id, session)

    // 更新 DB 状态为 idle（重新激活）
    try {
      this.sessionDatabase.updateAgentConversation(sessionId, { status: AgentStatus.IDLE })
    } catch (err) {
      console.error('[AgentSession] Failed to update status on reopen:', err)
    }

    console.log(`[AgentSession] Reopened session ${sessionId} from DB (sdkSessionId: ${session.sdkSessionId || 'none'})`)
    return session.toJSON()
  }

  async sendMessage(sessionId, userMessage) {
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

    // 加载 SDK
    const queryFn = await this._loadSDK()

    // 存储用户消息到历史
    this._storeMessage(session, {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    })

    // 设置状态
    session.status = AgentStatus.STREAMING
    session.abortController = new AbortController()
    session.messageCount++

    // 通知前端状态变化
    this._safeSend('agent:statusChange', {
      sessionId: session.id,
      status: AgentStatus.STREAMING
    })

    try {
      // 构建 query 选项
      const options = {
        cwd: session.cwd,
        permissionMode: 'acceptEdits',
        settingSources: ['user'],
        includePartialMessages: true,
        abortController: session.abortController,
        env: this._buildEnvVars()
      }

      // 多轮对话：resume 上一次的 sessionId
      if (session.sdkSessionId) {
        options.resume = session.sdkSessionId
      }

      // 调用 SDK query
      const generator = queryFn({ prompt: userMessage, options })
      session.queryInstance = generator

      // 遍历流式输出
      for await (const msg of generator) {
        // 检查是否已取消
        if (session.abortController?.signal.aborted) {
          break
        }

        await this._processMessage(session, msg)
      }

      // 正常完成
      session.status = AgentStatus.IDLE
      session.queryInstance = null

    } catch (error) {
      if (error.name === 'AbortError' || session.abortController?.signal.aborted) {
        // 用户取消
        console.log(`[AgentSession] Session ${sessionId} cancelled by user`)
        session.status = AgentStatus.IDLE
      } else {
        // 真正的错误
        console.error(`[AgentSession] Query error for session ${sessionId}:`, error)
        session.status = AgentStatus.ERROR

        this._safeSend('agent:error', {
          sessionId: session.id,
          error: error.message || 'Unknown error'
        })
      }
      session.queryInstance = null
    }

    // 通知前端最终状态
    this._safeSend('agent:statusChange', {
      sessionId: session.id,
      status: session.status
    })
  }

  /**
   * 存储消息到会话历史（内存 + DB）
   */
  _storeMessage(session, msg) {
    session.messages.push(msg)

    // 写入数据库
    if (this.sessionDatabase && session.dbConversationId) {
      try {
        this.sessionDatabase.insertAgentMessage(session.dbConversationId, {
          msgId: msg.id,
          role: msg.role,
          content: msg.content || null,
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
            model: msg.model
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
        // 查询完成
        session.totalCostUsd += msg.total_cost_usd || 0
        this._safeSend('agent:result', {
          sessionId: session.id,
          result: {
            subtype: msg.subtype,
            isError: msg.is_error,
            result: msg.result,
            totalCostUsd: msg.total_cost_usd,
            numTurns: msg.num_turns,
            durationMs: msg.duration_ms,
            usage: msg.usage
          }
        })

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
   * 取消当前生成
   */
  cancel(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.abortController) {
      session.abortController.abort()
      session.abortController = null
    }

    if (session.queryInstance) {
      try {
        session.queryInstance.close()
      } catch (e) {
        // ignore
      }
      session.queryInstance = null
    }

    session.status = AgentStatus.IDLE
    console.log(`[AgentSession] Cancelled session ${sessionId}`)
  }

  /**
   * 关闭会话（软关闭：DB 标记 closed，内存移除）
   */
  close(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // 取消正在进行的查询
    this.cancel(sessionId)

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
   * 关闭所有会话
   */
  closeAll() {
    for (const sessionId of [...this.sessions.keys()]) {
      this.close(sessionId)
    }
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
            totalCostUsd: row.total_cost_usd || 0
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
   * 获取会话消息历史（内存优先，不存在则查 DB）
   */
  getMessages(sessionId) {
    // 1. 内存中的活跃会话
    const session = this.sessions.get(sessionId)
    if (session) {
      return session.messages
    }

    // 2. 从 DB 查询历史消息
    if (this.sessionDatabase) {
      try {
        const conv = this.sessionDatabase.getAgentConversation(sessionId)
        if (!conv) return []

        const dbMessages = this.sessionDatabase.getAgentMessagesByConversationId(conv.id)
        // 转换 snake_case → camelCase
        return dbMessages.map(row => ({
          id: row.msg_id,
          role: row.role,
          content: row.content || undefined,
          toolName: row.tool_name || undefined,
          input: row.tool_input ? JSON.parse(row.tool_input) : undefined,
          output: row.tool_output ? JSON.parse(row.tool_output) : undefined,
          timestamp: row.timestamp
        }))
      } catch (err) {
        console.error('[AgentSession] Failed to load messages from DB:', err)
      }
    }

    return []
  }

  /**
   * 物理删除对话（内存 + DB）
   */
  deleteConversation(sessionId) {
    // 从内存移除（如果存在）
    const session = this.sessions.get(sessionId)
    if (session) {
      this.cancel(sessionId)
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
}

module.exports = {
  AgentSessionManager,
  AgentSession,
  AgentStatus,
  AgentType
}

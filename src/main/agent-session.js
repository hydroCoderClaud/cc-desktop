/**
 * Agent Session
 * 单个 Agent 会话的数据模型
 */

const { v4: uuidv4 } = require('uuid')
const { AgentType } = require('./utils/agent-constants')
const { AgentStatus } = require('./utils/agent-constants')

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
    this.updatedAt = new Date()
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
    this.source = options.source || 'manual'
    this.taskId = options.taskId || null
    this.meta = options.meta || {}  // 元数据（如钉钉的 conversationId）
    this.pendingInteractions = new Map()  // 待处理的宿主交互请求
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
      updatedAt: this.updatedAt.toISOString(),
      messageCount: this.messageCount,
      totalCostUsd: this.totalCostUsd,
      isStreamingActive: !!this.queryGenerator,
      apiProfileId: this.apiProfileId,
      apiBaseUrl: this.apiBaseUrl,
      source: this.source,
      taskId: this.taskId
    }
  }
}

module.exports = { AgentSession }

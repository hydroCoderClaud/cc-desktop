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
    this.ownerClientId = typeof options.ownerClientId === 'string' && options.ownerClientId.trim()
      ? options.ownerClientId.trim()
      : 'host-ui'
    this.clientType = typeof options.clientType === 'string' && options.clientType.trim()
      ? options.clientType.trim()
      : 'host'
    this.clientMeta = options.clientMeta && typeof options.clientMeta === 'object' && !Array.isArray(options.clientMeta)
      ? { ...options.clientMeta }
      : null
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
    this.modelId = typeof options.modelId === 'string' && options.modelId.trim() ? options.modelId.trim() : null
    this.source = options.source || 'manual'
    this.imChannel = options.imChannel || null        // IM 平台：dingtalk/weixin/feishu/enterprise-weixin
    this.taskId = options.taskId || null
    this.meta = options.meta || {}  // 元数据（如钉钉的 conversationId）
    this.pendingInteractions = new Map()  // 待处理的宿主交互请求
    this.lastBootstrappedRuntime = null
    this.pendingRuntimeChange = 'unknown'
    this.lastQueryOptionsSnapshot = null
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      ownerClientId: this.ownerClientId,
      clientType: this.clientType,
      clientMeta: this.clientMeta,
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
      modelId: this.modelId,
      source: this.source,
      imChannel: this.imChannel,
      taskId: this.taskId,
      lastQueryOptionsSnapshot: this.lastQueryOptionsSnapshot
    }
  }
}

module.exports = { AgentSession }

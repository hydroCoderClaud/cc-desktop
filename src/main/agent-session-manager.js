/**
 * Agent 会话管理器
 * 管理 Agent 模式下的 AI 对话会话
 *
 * 通过 ClaudeCodeRunner 与 SDK 交互，不直接依赖 SDK。
 *
 * 设计原则：
 * - 参照 ActiveSessionManager 的模式（_safeSend、Map 管理、生命周期）
 * - 支持多个并发 Agent 对话
 * - 流式输出通过 IPC 推送到渲染进程
 * - 多轮对话通过 SDK 的 resume 机制实现
 */

const { EventEmitter } = require('events')
const path = require('path')
const os = require('os')
const fs = require('fs')
const fsp = require('fs').promises
const { v4: uuidv4 } = require('uuid')
const { MessageQueue } = require('./utils/message-queue')
const { safeSend } = require('./utils/safe-send')
const { killProcessTree } = require('./utils/process-tree-kill')
const { AgentStatus, AgentType } = require('./utils/agent-constants')
const { AgentSession } = require('./agent-session')
const AgentFileManager = require('./managers/agent-file-manager')
const AgentQueryManager = require('./managers/agent-query-manager')
const { buildDesktopCapabilityQueryOptions } = require('./managers/desktop-capability-query-options')
const ClaudeCodeRunner = require('./runners/claude-code-runner')
const { tMain } = require('./utils/app-i18n')

const HYDRO_IDENTITY_SYSTEM_PROMPT = [
  'Present yourself to end users as Hydro Desktop AI, an AI personal desktop assistant developed by Zhishui Workshop.',
  'When the user greets you, asks who you are, asks what assistant this is, or asks for a self-introduction, identify yourself as Hydro Desktop AI.',
  'For Chinese greetings or identity questions such as “你好”, “hi”, “你是谁”, “你是做什么的”, unless the user is explicitly asking for another language, start your reply with exactly “你好，我是 Hydro Desktop，是智水工坊研发的AI个人桌面助手，可以接入各种主流大模型帮你做数据分析、工程计算与模拟、报告撰写以及相关编程支持。有什么可以帮你的吗？”',
  'In those Chinese greeting or identity replies, keep the introduction aligned with that wording and do not switch back to describing yourself as Claude, Claude Code, or a generic water-related assistant.',
  'For English greetings or identity questions, start your reply with “Hi, I’m Hydro Desktop AI.”',
  'In those English greeting or identity replies, explicitly describe yourself as an AI personal desktop assistant developed by Zhishui Workshop, say that you can connect to mainstream large models, and naturally mention capabilities such as data analysis, engineering calculation and simulation, report drafting, and related coding help. Keep it concise unless the user asks for more detail.',
  'Do not introduce yourself as Claude or Claude Code unless the user is explicitly asking about the underlying runtime, model, SDK, or provider.',
  'If the user asks about the underlying model or provider, distinguish the app identity from the actual configured model or service.'
].join(' ')

function resolveConversationSource(type, source) {
  if (type === 'dingtalk') return 'dingtalk'
  if (type === 'weixin') return 'weixin'
  if (source) return source
  return 'manual'
}

function normalizeModelValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModelIdOrNull(value) {
  const normalized = normalizeModelValue(value)
  return normalized || null
}

function resolveRequestedModel(_profile, _configManager, requestedModel) {
  const normalizedRequestedModel = normalizeModelValue(requestedModel)
  if (!normalizedRequestedModel) {
    return { queryModel: null, ignored: false, requestedModel: '' }
  }

  return {
    queryModel: normalizedRequestedModel,
    ignored: false,
    requestedModel: normalizedRequestedModel
  }
}

function mergeSystemPrompts(...prompts) {
  const normalized = prompts
    .map(prompt => typeof prompt === 'string' ? prompt.trim() : '')
    .filter(Boolean)

  return normalized.length > 0 ? normalized.join(' ') : undefined
}

class AgentSessionManager extends EventEmitter {
  constructor(mainWindow, configManager) {
    super()
    this.mainWindow = mainWindow
    this.configManager = configManager

    // Agent 会话映射: sessionId -> AgentSession
    this.sessions = new Map()

    // Runner：封装 SDK 输入输出
    this.runner = new ClaudeCodeRunner()

    // 数据库引用（通过 setSessionDatabase 注入）
    this.sessionDatabase = null

    // 文件操作管理器（依赖注入）
    this.fileManager = new AgentFileManager(this)

    // Query 控制管理器（依赖注入）
    this.queryManager = new AgentQueryManager(this)
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
   * 安全地发送消息到渲染进程（委托给共享工具函数）
   */
  _safeSend(channel, data) {
    return safeSend(this.mainWindow, channel, data)
  }

  _getPersistedSessionModelId(sessionId) {
    if (!this.sessionDatabase?.getAgentConversation || !sessionId) {
      return null
    }

    try {
      const row = this.sessionDatabase.getAgentConversation(sessionId)
      return normalizeModelIdOrNull(row?.model_id)
    } catch (err) {
      console.warn('[AgentSession] Failed to load persisted model snapshot:', {
        sessionId,
        error: err.message
      })
      return null
    }
  }

  _resolveSessionModelId(session) {
    if (!session) return null
    const current = normalizeModelIdOrNull(session.modelId)
    if (current) return current

    const persisted = this._getPersistedSessionModelId(session.id)
    if (persisted) {
      session.modelId = persisted
    }
    return persisted
  }

  _serializeSession(session) {
    const modelId = this._resolveSessionModelId(session)
    return {
      ...session.toJSON(),
      modelId
    }
  }

  /**
   * 为宿主侧交互生成一条 tool 消息并等待前端回执
   */
  _buildPermissionActions(suggestions = []) {
    const actions = [{
      key: 'allow_once',
      label: '本次允许',
      description: '仅允许这一次，不保存规则',
      updatedPermissions: [],
      decisionClassification: 'user_temporary'
    }]

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return actions
    }

    const order = ['session', 'projectSettings', 'userSettings', 'localSettings', 'cliArg']
    const labels = {
      session: ['本会话始终允许', '本次会话内不再询问'],
      projectSettings: ['项目内始终允许', '写入项目设置'],
      userSettings: ['全局始终允许', '写入用户设置'],
      localSettings: ['本地设置允许', '写入本地设置'],
      cliArg: ['按当前启动参数允许', '依赖 CLI 参数']
    }

    const grouped = new Map()
    for (const suggestion of suggestions) {
      const destination = suggestion?.destination || 'session'
      if (!grouped.has(destination)) grouped.set(destination, [])
      grouped.get(destination).push(suggestion)
    }

    for (const destination of order) {
      const group = grouped.get(destination)
      if (!group || group.length === 0) continue
      const [label, description] = labels[destination] || [`允许（${destination}）`, '应用 SDK 建议权限']
      actions.push({
        key: `allow_${destination}`,
        label,
        description,
        updatedPermissions: group,
        decisionClassification: 'user_permanent'
      })
    }

    return actions
  }

  async _requestInteraction(session, kind, payload = {}) {
    if (!session) {
      return {
        behavior: 'deny',
        message: 'Session not found'
      }
    }

    const interactionId = uuidv4()
    const messageId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const toolName = payload.toolName || (kind === 'ask_user_question' ? 'AskUserQuestion' : 'PermissionRequest')
    const toolInput = {
      interactionId,
      kind,
      ...payload
    }

    const toolMessage = {
      id: messageId,
      role: 'tool',
      toolName,
      input: toolInput,
      output: null,
      timestamp: Date.now()
    }

    this._storeMessage(session, toolMessage)
    this._safeSend('agent:interactionRequest', {
      sessionId: session.id,
      interaction: {
        interactionId,
        kind,
        messageId,
        ...payload
      }
    })

    return await new Promise((resolve, reject) => {
      session.pendingInteractions.set(interactionId, {
        kind,
        payload,
        messageId,
        resolve,
        reject,
        createdAt: Date.now()
      })
    })
  }

  _updateInteractionMessage(session, interactionId, output) {
    if (!session) return
    const message = session.messages.find(msg => msg.role === 'tool' && msg.input?.interactionId === interactionId)
    if (message) {
      message.output = output
    }
  }

  resolveInteraction(sessionId, interactionId, response = {}) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    const pending = session.pendingInteractions.get(interactionId)
    if (!pending) throw new Error('Interaction not found')

    const annotations = response.annotations && typeof response.annotations === 'object'
      ? response.annotations
      : undefined
    const output = {
      status: 'answered',
      answers: Array.isArray(response.answers) ? response.answers : [],
      ...(annotations ? { annotations } : {})
    }

    this._updateInteractionMessage(session, interactionId, output)

    if (this.sessionDatabase && session.dbConversationId) {
      try {
        this.sessionDatabase.updateAgentMessageToolOutput(pending.messageId, output)
      } catch (err) {
        console.error('[AgentSession] Failed to persist interaction output:', err)
      }
    }

    session.pendingInteractions.delete(interactionId)

    const questionList = Array.isArray(response.questions)
      ? response.questions
      : (Array.isArray(pending.payload?.questions) ? pending.payload.questions : [])
    const answerMap = Object.fromEntries(
      output.answers.map((item, index) => {
        const questionText = item?.question || questionList[index]?.question || `question_${index + 1}`
        const rawAnswer = item?.answer
        const value = Array.isArray(rawAnswer)
          ? rawAnswer.join(', ')
          : (rawAnswer == null ? '' : String(rawAnswer))
        return [questionText, value]
      })
    )

    const permissionResult = pending.kind === 'ask_user_question'
      ? {
          behavior: response.behavior || 'allow',
          updatedInput: {
            questions: questionList,
            answers: answerMap,
            answersStructured: output.answers,
            ...(annotations ? { annotations } : {})
          },
          updatedPermissions: Array.isArray(response.updatedPermissions) ? response.updatedPermissions : undefined,
          decisionClassification: response.decisionClassification || 'user_temporary'
        }
      : {
          behavior: response.behavior || 'allow',
          updatedInput: response.updatedInput || {},
          updatedPermissions: Array.isArray(response.updatedPermissions) ? response.updatedPermissions : undefined,
          decisionClassification: response.decisionClassification || (Array.isArray(response.updatedPermissions) && response.updatedPermissions.length > 0 ? 'user_permanent' : 'user_temporary')
        }

    pending.resolve(permissionResult)

    this._safeSend('agent:interactionResolved', {
      sessionId,
      interactionId,
      output
    })

    return { success: true }
  }

  cancelInteraction(sessionId, interactionId, reason = 'User cancelled the question') {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    const pending = session.pendingInteractions.get(interactionId)
    if (!pending) throw new Error('Interaction not found')

    const output = {
      status: 'cancelled',
      reason
    }

    this._updateInteractionMessage(session, interactionId, output)

    if (this.sessionDatabase && session.dbConversationId) {
      try {
        this.sessionDatabase.updateAgentMessageToolOutput(pending.messageId, output)
      } catch (err) {
        console.error('[AgentSession] Failed to persist cancelled interaction:', err)
      }
    }

    session.pendingInteractions.delete(interactionId)
    pending.resolve({
      behavior: 'deny',
      message: reason
    })

    this._safeSend('agent:interactionResolved', {
      sessionId,
      interactionId,
      output
    })

    return { success: true }
  }

  _cleanupPendingInteractions(session, reason = 'Session closed') {
    if (!session?.pendingInteractions?.size) return

    for (const [interactionId, pending] of session.pendingInteractions.entries()) {
      const output = {
        status: 'cancelled',
        reason
      }
      this._updateInteractionMessage(session, interactionId, output)
      pending.resolve({
        behavior: 'deny',
        message: reason
      })
      this._safeSend('agent:interactionResolved', {
        sessionId: session.id,
        interactionId,
        output
      })
    }

    session.pendingInteractions.clear()
  }

  /**
   * 获取输出基础目录
   */
  _getOutputBaseDir() {
    const config = this.configManager.getConfig()
    const customDir = config?.settings?.agent?.outputBaseDir
    if (customDir) {
      try {
        fs.mkdirSync(customDir, { recursive: true })
        return customDir
      } catch (err) {
        console.error('[AgentSession] Failed to create custom outputBaseDir, falling back:', err)
      }
    }
    return path.join(os.homedir(), 'cc-desktop-agent-output')
  }

  /**
   * 为会话自动分配工作目录
   * @param {object} session
   * @param {string} [subDir='desktop'] 子目录命名空间，桌面端用 'desktop'，钉钉用 'dingtalk'
   */
  _assignCwd(session, subDir = 'desktop') {
    const baseDir = path.join(this._getOutputBaseDir(), subDir)
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
   * 创建新会话
   */
  create(options = {}) {
    // 获取 API Profile：优先使用调用方指定的，否则取默认
    let profile
    if (options.apiProfileId) {
      profile = this.configManager.getAPIProfile(options.apiProfileId) || this.configManager.getDefaultProfile()
    } else {
      profile = this.configManager.getDefaultProfile()
    }

    const initialModelId = normalizeModelIdOrNull(options.modelId || profile?.selectedModelId)
    const session = new AgentSession({
      type: options.type,
      title: options.title,
      cwd: options.cwd,
      apiProfileId: profile?.id || null,
      apiBaseUrl: profile?.baseUrl || null,
      source: resolveConversationSource(options.type, options.source),
      taskId: options.taskId || null,
      meta: options.meta || {}
    })
    session.modelId = initialModelId

    // 自动分配工作目录
    if (!session.cwd) {
      session.cwd = this._assignCwd(session, options.cwdSubDir)
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
          apiBaseUrl: profile?.baseUrl || null,
          modelId: session.modelId,
          source: session.source,
          taskId: session.taskId
        })
        session.dbConversationId = dbRecord.id
      } catch (err) {
        console.error('[AgentSession] Failed to create DB record:', err)
      }
    }

    console.log(`[AgentSession] Created session ${session.id}, type: ${session.type}, cwd: ${session.cwd}`)
    return this._serializeSession(session)
  }

  appendExternalUserMessage(sessionId, { content, source, senderNick, meta } = {}) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const text = String(content || '').trim()
    if (!text) {
      throw new Error('External message content is empty')
    }

    const message = {
      id: `msg-ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    if (source) message.source = source
    if (senderNick) message.senderNick = senderNick
    if (meta && typeof meta === 'object') message.meta = meta

    this._storeMessage(session, message)
    session.messageCount++
    session.updatedAt = new Date()

    if (this.sessionDatabase) {
      try {
        this.sessionDatabase.updateAgentConversation(sessionId, {
          messageCount: session.messageCount
        })
      } catch (err) {
        console.error('[AgentSession] Failed to update external message metadata:', err)
      }
    }

    return message
  }

  _classifyProbeFailure(error) {
    const message = error?.message || String(error)

    if (/SDK 连接超时/.test(message)) {
      return { errorKind: 'TIMEOUT', canFallbackToHttp: false, message: `Claude Code 启动超时：${message}` }
    }

    if (/Failed to load SDK|ERR_MODULE_NOT_FOUND|Cannot find module/i.test(message)) {
      return { errorKind: 'SDK_UNAVAILABLE', canFallbackToHttp: true, message: `SDK 不可用：${message}` }
    }

    if (/spawn .* ENOENT|Failed to spawn Claude Code process|ENOENT/i.test(message)) {
      return { errorKind: 'CLI_UNAVAILABLE', canFallbackToHttp: true, message: `Claude Code CLI 不可用：${message}` }
    }

    return { errorKind: 'SDK_ERROR', canFallbackToHttp: false, message: `Claude Code 探测失败：${message}` }
  }

  async _cleanupProbeSession(session, tempDir) {
    if (session?.messageQueue) {
      try {
        session.messageQueue.end()
      } catch {}
      session.messageQueue = null
    }

    if (session?.queryGenerator) {
      try {
        killProcessTree(session.cliPid)
      } catch {}
      try {
        await session.queryGenerator.close()
      } catch {}
      session.queryGenerator = null
    }

    session.cliPid = null
    session._lastCliExitCode = null
    session._lastCliStderr = null

    if (tempDir) {
      try {
        await fsp.rm(tempDir, { recursive: true, force: true })
      } catch (err) {
        console.warn('[AgentSession] Failed to cleanup probe temp dir:', tempDir, err.message)
      }
    }
  }

  async probeConnection(apiConfig, { prompt = 'hi', maxTurns = 1, timeoutMs } = {}) {
    console.log('[AgentSession] ========== Starting probe connection test ==========' )
    const startTime = Date.now()
    const globalTimeout = this.configManager.getTimeout ? this.configManager.getTimeout() : {}
    const testTimeoutMs = timeoutMs || globalTimeout.test || 30000
    const testTimeoutSec = testTimeoutMs / 1000

    let tempDir = null
    const session = new AgentSession({
      type: AgentType.CHAT,
      title: tMain(this.configManager, 'app.probeSessionTitle'),
      cwd: null,
      apiProfileId: apiConfig?.id || null,
      apiBaseUrl: apiConfig?.baseUrl || null,
      meta: { probe: true }
    })

    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-desktop-api-test-'))
      session.cwd = tempDir
      session.cwdAuto = false

      const env = this.runner.buildEnv(apiConfig, this.configManager)
      const messageQueue = new MessageQueue()
      session.messageQueue = messageQueue

      const generator = await this.runner.createQuery(messageQueue, {
        cwd: tempDir,
        env,
        maxTurns
      }, session)
      session.queryGenerator = generator

      const sdkUserMessage = {
        type: 'user',
        message: { role: 'user', content: prompt },
        parent_tool_use_id: null,
        session_id: session.id
      }

      const probePromise = (async () => {
        let responseText = ''
        let sawInit = false

        messageQueue.push(sdkUserMessage)

        for await (const rawMsg of generator) {
          const msg = this.runner.normalizeMessage(rawMsg)

          if (msg.type === 'init') {
            sawInit = true
            session.sdkSessionId = msg.sdkSessionId
            continue
          }

          if (msg.type === 'assistant_message') {
            for (const block of msg.content || []) {
              if (block.type === 'text' && block.text) {
                responseText += block.text
              }
            }

            if (responseText.trim()) {
              return {
                success: true,
                message: `Claude Code 已连通，收到模型回复：${responseText}`,
                durationMs: Date.now() - startTime,
                errorKind: null,
                canFallbackToHttp: false
              }
            }
            continue
          }

          if (msg.type === 'result') {
            const durationMs = Date.now() - startTime
            if (msg.isError) {
              return {
                success: false,
                message: `模型请求被拒绝：${msg.result || 'Unknown error'}`,
                durationMs,
                errorKind: 'API_ERROR',
                canFallbackToHttp: false
              }
            }

            return {
              success: true,
              message: responseText ? `Claude Code 已连通，收到模型回复：${responseText}` : `Claude Code 已连通，请求完成：${msg.result || ''}`,
              durationMs,
              errorKind: null,
              canFallbackToHttp: false
            }
          }
        }

        const durationMs = Date.now() - startTime
        if (session._lastCliExitCode != null && session._lastCliExitCode !== 0) {
          return {
            success: false,
            message: session._lastCliStderr
              ? `Claude Code CLI 异常退出：${session._lastCliStderr}`
              : `Claude Code CLI 异常退出，退出码 ${session._lastCliExitCode}`,
            durationMs,
            errorKind: 'CLI_EXIT',
            canFallbackToHttp: false
          }
        }

        if (responseText) {
          return {
            success: true,
            message: responseText,
            durationMs,
            errorKind: null,
            canFallbackToHttp: false
          }
        }

        if (sawInit) {
          return {
            success: false,
            message: 'Claude Code 已启动，但未收到模型响应',
            durationMs,
            errorKind: 'NO_RESPONSE',
            canFallbackToHttp: false
          }
        }

        return {
          success: false,
          message: 'Claude Code 探测未拿到初始化结果或最终输出',
          durationMs,
          errorKind: 'NO_RESULT',
          canFallbackToHttp: false
        }
      })()

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`SDK 连接超时（${testTimeoutSec}秒无响应）`)), testTimeoutMs)
      })

      const result = await Promise.race([probePromise, timeoutPromise])
      console.log('[AgentSession] Probe result:', result.success ? 'SUCCESS' : 'FAILED')
      console.log('[AgentSession] ========== Probe connection test ended ==========' + '\n')
      return result
    } catch (error) {
      const durationMs = Date.now() - startTime
      const classified = this._classifyProbeFailure(error)
      console.error('[AgentSession] Probe failed:', classified.message)
      console.log('[AgentSession] ========== Probe connection test ended ==========' + '\n')
      return {
        success: false,
        message: classified.message,
        durationMs,
        errorKind: classified.errorKind,
        canFallbackToHttp: classified.canFallbackToHttp
      }
    } finally {
      await this._cleanupProbeSession(session, tempDir)
    }
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
        cwd: row.cwd,
        source: resolveConversationSource(row.type, row.source),
        taskId: row.task_id || null
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

    return session.toJSON()
  }

  /**
   * 发送消息到 Agent 会话（Streaming Input 模式）
   *
   * 第一条消息：创建 MessageQueue + 持久 query + 后台输出循环
   * 后续消息：直接 push 到现有 MessageQueue
   */
  async sendMessage(sessionId, userMessage, { model, modelTier, maxTurns, meta } = {}) {
    let session = this.sessions.get(sessionId)
    const requestedModel = model || modelTier

    // 内存中不存在，尝试自动恢复（兜底）
    if (!session) {
      this.reopen(sessionId)
      session = this.sessions.get(sessionId)
    }
    if (!session) {
      throw new Error(`Agent session ${sessionId} not found`)
    }

    console.log('[AgentSession] sendMessage entry:', {
      sessionId,
      requestedModel: requestedModel || null,
      status: session.status,
      hasQueryGenerator: !!session.queryGenerator,
      hasMessageQueue: !!session.messageQueue,
      messageQueueDone: session.messageQueue?.isDone ?? null,
      apiProfileId: session.apiProfileId || null,
      sdkSessionId: session.sdkSessionId || null
    })

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

        // 自动保存图片到会话目录
        if (imageData.length > 0 && session.cwd) {
          this._saveImagesToDir(session.cwd, imageData)
        }
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

    // 发出用户消息事件（DingTalkBridge 等旁路监听者自行决定是否处理）
    this.emit('userMessage', {
      sessionId: session.id,
      sessionType: session.type,
      content: displayContent,
      images: imageData || null,
      source: meta?.source || null
    })

    // 设置状态
    session.status = AgentStatus.STREAMING
    session.messageCount++
    session.updatedAt = new Date()

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
      console.log('[AgentSession] sendMessage path: existing queue', {
        sessionId,
        requestedModel: requestedModel || null,
        apiProfileId: session.apiProfileId || null,
        sdkSessionId: session.sdkSessionId || null
      })
      // push 前确保模型正确（防止 watch 中的 setModel 静默失败）
      if (requestedModel) {
        try {
          const profile = session.apiProfileId
            ? this.configManager.getAPIProfile(session.apiProfileId) || this.configManager.getDefaultProfile()
            : this.configManager.getDefaultProfile()
          const resolvedRequest = resolveRequestedModel(profile, this.configManager, requestedModel)
          if (resolvedRequest.queryModel) {
            await session.queryGenerator.setModel(resolvedRequest.queryModel)
            console.log('[AgentSession] setModel before push succeeded:', {
              sessionId,
              requestedModel: resolvedRequest.requestedModel,
              queryModel: resolvedRequest.queryModel,
              apiProfileId: profile?.id || null
            })
          }
        } catch (e) {
          console.warn('[AgentSession] setModel before push failed:', {
            sessionId,
            requestedModel: requestedModel || null,
            error: e.message
          })
        }
      }
      console.log('[AgentSession] Pushing message to existing queue:', {
        sessionId,
        requestedModel: requestedModel || null,
        sdkSessionId: session.sdkSessionId || null
      })
      session.messageQueue.push(sdkUserMessage)
      return
    }

    // 首次消息（或 CLI 进程已退出）→ 创建新的持久 query
    console.log('[AgentSession] sendMessage path: create query', {
      sessionId,
      requestedModel: requestedModel || null,
      hasQueryGenerator: !!session.queryGenerator,
      hasMessageQueue: !!session.messageQueue,
      messageQueueDone: session.messageQueue?.isDone ?? null,
      sdkSessionId: session.sdkSessionId || null
    })
    console.log(`[AgentSessionManager] Creating new streaming query for session ${sessionId} (title: ${session.title})`)

    try {
      // 使用会话创建时绑定的 profile，fallback 到默认
      const sessionProfile = session.apiProfileId
        ? this.configManager.getAPIProfile(session.apiProfileId) || this.configManager.getDefaultProfile()
        : this.configManager.getDefaultProfile()
      const env = this.runner.buildEnv(sessionProfile, this.configManager)

      // 创建 MessageQueue
      const messageQueue = new MessageQueue()
      session.messageQueue = messageQueue

      // 构建 runner query 选项
      const queryOptions = {
        cwd: session.cwd,
        env,
        onToolPermissionRequest: async ({ toolName, input, toolUseID, title, description, displayName, blockedPath, decisionReason, suggestions }) => {
          if (toolName === 'AskUserQuestion') {
            return this._requestInteraction(session, 'ask_user_question', {
              toolName,
              toolUseID,
              title,
              description,
              displayName,
              questions: input?.questions || []
            })
          }

      const actions = this._buildPermissionActions(suggestions)
      console.log('[AgentSession] Permission interaction request:', {
        sessionId: session.id,
        toolName,
        title,
        description,
        blockedPath,
        suggestionCount: Array.isArray(suggestions) ? suggestions.length : 0,
        suggestions,
        actionKeys: actions.map(item => item.key)
      })

      return this._requestInteraction(session, 'permission_request', {
        toolName,
        toolUseID,
        title,
        description,
        displayName,
        blockedPath,
        decisionReason,
        suggestions,
        actions,
        input
      })
        }
      }

      let appendSystemPrompt = session.source === 'scheduled'
        ? undefined
        : HYDRO_IDENTITY_SYSTEM_PROMPT

      try {
        const desktopCapabilityOptions = await buildDesktopCapabilityQueryOptions({
          scheduledTaskService: this.scheduledTaskService,
          weixinNotifyService: this.weixinNotifyService,
          session
        })
        if (desktopCapabilityOptions?.mcpServers) {
          queryOptions.mcpServers = desktopCapabilityOptions.mcpServers
        }
        if (desktopCapabilityOptions?.appendSystemPrompt) {
          appendSystemPrompt = mergeSystemPrompts(
            appendSystemPrompt,
            desktopCapabilityOptions.appendSystemPrompt
          )
        }
        if (desktopCapabilityOptions?.allowedTools?.length) {
          queryOptions.allowedTools = desktopCapabilityOptions.allowedTools
        }
        if (desktopCapabilityOptions?.disallowedTools?.length) {
          queryOptions.disallowedTools = desktopCapabilityOptions.disallowedTools
        }
      } catch (err) {
        console.warn('[AgentSession] Failed to build desktop capability query options:', err)
      }

      if (appendSystemPrompt) {
        queryOptions.appendSystemPrompt = appendSystemPrompt
      }

      // 前端明确指定模型时覆盖，否则 SDK 从 env.ANTHROPIC_MODEL 自动读取
      let resolvedRequest = null
      if (requestedModel) {
        resolvedRequest = resolveRequestedModel(sessionProfile, this.configManager, requestedModel)
        if (resolvedRequest.queryModel) {
          queryOptions.model = resolvedRequest.queryModel
          if (queryOptions.env && typeof queryOptions.env === 'object') {
            queryOptions.env.ANTHROPIC_MODEL = resolvedRequest.queryModel
          }
        }
      }

      if (maxTurns) {
        queryOptions.maxTurns = maxTurns
      }

      // resume：恢复历史对话上下文（应用重启、会话重新打开等场景必需）
      if (session.sdkSessionId) {
        // 跨模式占用检查：该 CLI 会话是否正在 Terminal 模式中使用
        if (this.peerManager?.isCliSessionActive(session.sdkSessionId)) {
          throw new Error('SESSION_IN_USE_BY_TERMINAL')
        }
        queryOptions.resume = session.sdkSessionId
      }

      console.log('[AgentSession] createQuery config:', {
        sessionId,
        apiProfileId: sessionProfile?.id || null,
        profileName: sessionProfile?.name || null,
        profileBaseUrl: sessionProfile?.baseUrl || null,
        requestedModel: requestedModel || null,
        queryModel: queryOptions.model || null,
        resume: queryOptions.resume || null,
        envBaseUrl: env.ANTHROPIC_BASE_URL || env.ANTHROPIC_API_URL || null,
        envModel: env.ANTHROPIC_MODEL || null
      })

      // 通过 Runner 创建持久 query（AsyncIterable 模式）
      const generator = await this.runner.createQuery(messageQueue, queryOptions, session)
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
        // 主进程内部事件（DingTalkBridge 监听）
        this.emit('agentError', session.id, error.message || 'Session error')

      }
    } finally {
      this._cleanupPendingInteractions(session, 'Session closed')
      // 清理引用
      session.queryGenerator = null
      session.messageQueue = null
      session.outputLoopPromise = null

      // CLI 进程异常退出时通知前端；即使 stderr 为空，也要把退出码透出给 UI。
      if (session._lastCliExitCode != null && session._lastCliExitCode !== 0) {
        this._safeSend('agent:cliError', {
          sessionId: session.id,
          exitCode: session._lastCliExitCode,
          stderr: session._lastCliStderr
        })
      }
      const cliExitWasError = session.status === AgentStatus.ERROR
        || (session._lastCliExitCode != null && session._lastCliExitCode !== 0)
      const sessionStatus = cliExitWasError ? AgentStatus.ERROR : session.status

      session.cliPid = null
      session._lastCliExitCode = null
      session._lastCliStderr = null

      if (session.preserveSessionOnQueryExit) {
        session.preserveSessionOnQueryExit = false
        this._safeSend('agent:statusChange', {
          sessionId: session.id,
          status: sessionStatus,
          activeSessionEnded: true
        })
        return
      }

      // 结束当前激活连接：从内存 Map 中移除会话。
      // 注意：异常退出不应被视为“用户主动关闭会话”，因此不在这里写 closed。
      const sessionId = session.id
      this.sessions.delete(sessionId)
      console.log(`[AgentSessionManager] Session ${sessionId} removed from memory after CLI exit`)

      this._safeSend('agent:statusChange', {
        sessionId: session.id,
        status: sessionStatus,
        cliExited: true,
        cliExitWasError
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

  _findPendingToolMessage(session, parentToolUseId = null) {
    if (!session?.messages?.length) return null

    if (parentToolUseId) {
      const matched = [...session.messages]
        .reverse()
        .find(msg => msg.role === 'tool' && msg.toolUseId === parentToolUseId)
      if (matched) return matched
    }

    return [...session.messages]
      .reverse()
      .find(msg => msg.role === 'tool' && !msg.output)
  }

  _normalizeToolResultPayload(msg) {
    const contentBlocks = Array.isArray(msg.content) ? msg.content : []
    const toolResultBlock = contentBlocks.find(block => block?.type === 'tool_result') || null
    const rawResult = msg.toolUseResult && typeof msg.toolUseResult === 'object'
      ? msg.toolUseResult
      : null

    const resultContent = Array.isArray(rawResult?.content)
      ? rawResult.content
      : Array.isArray(toolResultBlock?.content)
        ? toolResultBlock.content
        : []
    const structuredContent = rawResult?.structuredContent || toolResultBlock?.structured_content || null
    const isError = Boolean(rawResult?.isError ?? toolResultBlock?.is_error)

    if (resultContent.length === 0 && !structuredContent && !isError) {
      return null
    }

    return {
      type: 'tool_result',
      parentToolUseId: msg.parentToolUseId || toolResultBlock?.tool_use_id || null,
      content: resultContent,
      structuredContent,
      isError
    }
  }

  /**
   * 处理单条 Runner 标准消息
   * Runner.normalizeMessage() 已将 SDK 原始格式转为内部标准格式
   */
  async _processMessage(session, rawMsg) {
    const msg = this.runner.normalizeMessage(rawMsg)

    switch (msg.type) {
      case 'init':
        session.sdkSessionId = msg.sdkSessionId
        this._safeSend('agent:init', {
          sessionId: session.id,
          sdkSessionId: msg.sdkSessionId,
          tools: msg.tools,
          model: msg.model,
          slashCommands: msg.slashCommands
        })
        if (this.sessionDatabase) {
          try {
            this.sessionDatabase.updateAgentConversation(session.id, {
              sdkSessionId: msg.sdkSessionId
            })
          } catch (err) {
            console.error('[AgentSession] Failed to update sdk_session_id:', err)
          }
        }
        break

      case 'compact_done':
        console.log(`[AgentSession] Compact completed for session ${session.id}, pre_tokens=${msg.preTokens}, trigger=${msg.trigger}`)
        this._safeSend('agent:compacted', {
          sessionId: session.id,
          preTokens: msg.preTokens,
          trigger: msg.trigger
        })
        break

      case 'system_status':
        this._safeSend('agent:systemStatus', {
          sessionId: session.id,
          status: msg.status
        })
        break

      case 'assistant_message': {
        const assistantData = {
          type: 'assistant',
          content: msg.content,
          uuid: msg.uuid,
          sessionId: msg.sdkSessionId
        }
        this._safeSend('agent:message', {
          sessionId: session.id,
          message: assistantData
        })
        // 主进程内部事件（DingTalkBridge 监听）
        this.emit('agentMessage', session.id, assistantData)
        if (msg.usage) {
          this._safeSend('agent:usage', {
            sessionId: session.id,
            usage: msg.usage
          })
        }
        for (const block of msg.content) {
          if (block.type === 'text') {
            this._storeMessage(session, {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'assistant',
              content: block.text,
              timestamp: Date.now()
            })
          } else if (block.type === 'tool_use') {
            if (block.name === 'AskUserQuestion') continue
            this._storeMessage(session, {
              id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'tool',
              toolName: block.name,
              toolUseId: block.id || block.tool_use_id || block.toolUseID || null,
              input: block.input,
              output: null,
              timestamp: Date.now()
            })
          }
        }
        break
      }

      case 'user_message': {
        const toolResult = this._normalizeToolResultPayload(msg)
        if (!toolResult) break

        const targetMessage = this._findPendingToolMessage(session, toolResult.parentToolUseId)
        if (!targetMessage) {
          console.warn('[AgentSession] Received tool result without matching tool message:', toolResult.parentToolUseId)
          break
        }

        targetMessage.output = toolResult

        if (this.sessionDatabase && session.dbConversationId) {
          try {
            this.sessionDatabase.updateAgentMessageToolOutput(targetMessage.id, toolResult)
          } catch (err) {
            console.error('[AgentSession] Failed to persist tool result:', err)
          }
        }

        this._safeSend('agent:message', {
          sessionId: session.id,
          message: {
            type: 'tool_result',
            parentToolUseId: toolResult.parentToolUseId,
            toolUseId: targetMessage.toolUseId || null,
            toolResult
          }
        })
        break
      }

      case 'stream_event':
        this._safeSend('agent:stream', {
          sessionId: session.id,
          event: msg.event
        })
        break

      case 'result':
        session.totalCostUsd += msg.totalCostUsd || 0
        session.status = AgentStatus.IDLE
        this._safeSend('agent:result', {
          sessionId: session.id,
          result: {
            subtype: msg.subtype,
            isError: msg.isError,
            result: msg.result,
            totalCostUsd: msg.totalCostUsd,
            numTurns: msg.numTurns,
            durationMs: msg.durationMs,
            usage: msg.usage,
            modelUsage: msg.modelUsage
          }
        })
        this._safeSend('agent:statusChange', {
          sessionId: session.id,
          status: AgentStatus.IDLE
        })
        // 主进程内部事件（DingTalkBridge 监听）
        this.emit('agentResult', session.id)
        if (this.sessionDatabase) {
          try {
            this.sessionDatabase.updateAgentConversation(session.id, {
              totalCostUsd: session.totalCostUsd,
              messageCount: session.messageCount
            })
            session.updatedAt = new Date()
          } catch (err) {
            console.error('[AgentSession] Failed to update result stats:', err)
          }
        }
        break

      case 'tool_progress':
        this._safeSend('agent:toolProgress', {
          sessionId: session.id,
          toolUseId: msg.toolUseId,
          toolName: msg.toolName,
          elapsedSeconds: msg.elapsedSeconds
        })
        break

      default:
        this._safeSend('agent:otherMessage', {
          sessionId: session.id,
          message: rawMsg
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
   * 切换 API Profile：终止当前 CLI 进程 + 更新 apiProfileId。
   * 保留 sdkSessionId，用于验证“新环境参数 + 旧 resume id”的实际行为。
   */
  async switchApiProfile(sessionId, newProfileId) {
    let session = this.sessions.get(sessionId)
    if (!session) {
      this.reopen(sessionId)
      session = this.sessions.get(sessionId)
    }
    if (!session) throw new Error('Session not found')

    const profile = this.configManager.getAPIProfile(newProfileId)
    if (!profile) throw new Error('API Profile not found: ' + newProfileId)

    // 终止当前 CLI 进程（若有）
    if (session.messageQueue) {
      session.messageQueue.end()
      session.messageQueue = null
    }
    if (session.queryGenerator) {
      session.preserveSessionOnQueryExit = true
      try { killProcessTree(session.cliPid) } catch {}
      try { session.queryGenerator.close() } catch {}
      session.queryGenerator = null
      session.cliPid = null
    }

    // 更新 apiProfileId（内存 + DB）
    session.apiProfileId = newProfileId
    session.apiBaseUrl = profile.baseUrl || null
    session.modelId = normalizeModelIdOrNull(profile.selectedModelId)
    console.log('[AgentSession] switchApiProfile:', {
      sessionId,
      newProfileId,
      profileName: profile.name || null,
      profileBaseUrl: profile.baseUrl || null,
      modelId: session.modelId,
      sdkSessionId: session.sdkSessionId || null
    })
    this.sessionDatabase.updateAgentConversation(sessionId, {
      apiProfileId: newProfileId,
      apiBaseUrl: profile.baseUrl || null
    })
    this.sessionDatabase.updateAgentConversationModel(sessionId, session.modelId)

    session.status = AgentStatus.IDLE
    this._safeSend('agent:statusChange', { sessionId, status: AgentStatus.IDLE })
    return {
      success: true,
      apiProfileId: session.apiProfileId,
      apiBaseUrl: session.apiBaseUrl,
      modelId: session.modelId
    }
  }

  /**
   * 清空并重建会话：新建 fresh session 并切换过去，旧会话保留历史但退出当前上下文
   * @param {string} sessionId - 旧会话 ID
   * @param {object} overrides - 可选覆盖参数 { type, title, cwd, cwdSubDir }
   * @returns {object} 新会话的 JSON 表示
   */
  async clearAndRecreate(sessionId, overrides = {}) {
    const oldSession = this.sessions.get(sessionId)
    if (!oldSession) {
      throw new Error(`Agent session ${sessionId} not found`)
    }

    // 继承必要配置
    const newType = overrides.type || oldSession.type
    const newTitle = overrides.title !== undefined ? overrides.title : '' // 新会话默认空标题，由首条消息触发自动命名
    const newCwd = overrides.cwd || oldSession.cwd
    const newApiProfileId = oldSession.apiProfileId
    const newModelId = this._resolveSessionModelId(oldSession)

    // 软关闭旧会话（保留历史）
    await this.close(sessionId)

    // 创建全新会话（新 session.id，新 DB 记录）
    const newSession = this.create({
      type: newType,
      title: newTitle,
      cwd: newCwd,
      apiProfileId: newApiProfileId,
      modelId: newModelId,
      cwdSubDir: overrides.cwdSubDir
    })

    console.log(`[AgentSession] Cleared and recreated session: ${sessionId} -> ${newSession.id}`)
    return newSession
  }

  /**
   * 关闭会话（终止持久 CLI 进程 + DB 标记 closed + 内存移除）
   */
  async close(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this._cleanupPendingInteractions(session, 'Session closed')

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
      this._cleanupPendingInteractions(session, 'Session closed')
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
      this.emit('agentInterrupted', sessionId, { reason: 'host-cleanup' })
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
    return session ? this._serializeSession(session) : null
  }

  /**
   * 通过 SDK 启用/禁用 MCP 服务器（等效于 /mcp enable|disable，立即生效）
   * @param {string} sessionId - Agent 会话 ID
   * @param {string} name - MCP 服务器名称
   * @param {boolean} enabled - true=启用，false=禁用
   */
  async toggleMcp(sessionId, name, enabled) {
    const session = this.sessions.get(sessionId)
    if (!session?.queryGenerator) {
      return { success: false, error: '当前会话无活跃连接，无法切换 MCP 状态' }
    }
    try {
      await session.queryGenerator.toggleMcpServer(name, enabled)
      console.log(`[AgentSession] toggleMcp: ${name} enabled=${enabled} for session ${sessionId}`)
      return { success: true }
    } catch (err) {
      console.error(`[AgentSession] toggleMcp error:`, err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 获取所有会话列表（合并内存活跃 + DB 历史，去重）
   * 排除 type === 'notebook' 的会话，与 Notebook 模式隔离
   */
  list() {
    // 1. 内存中的活跃会话（排除 notebook 类型）
    const activeIds = new Set()
    const result = []

    for (const session of this.sessions.values()) {
      if (session.type !== 'notebook') {
        result.push(this._serializeSession(session))
        activeIds.add(session.id)
      }
    }

    // 2. 从 DB 加载历史会话（排除 notebook 类型）
    if (this.sessionDatabase) {
      try {
        const dbConversations = this.sessionDatabase.listAllAgentConversations({ limit: 100 })
        for (const row of dbConversations) {
          if (row.type === 'notebook') continue  // 排除 notebook 类型
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
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
            messageCount: row.message_count || 0,
            totalCostUsd: row.total_cost_usd || 0,
            apiProfileId: row.api_profile_id || null,
            apiBaseUrl: row.api_base_url || null,
            modelId: normalizeModelIdOrNull(row.model_id),
            source: resolveConversationSource(row.type, row.source),
            taskId: row.task_id || null
          })
        }
      } catch (err) {
        console.error('[AgentSession] Failed to load DB conversations:', err)
      }
    }

    // 按 updatedAt 降序排序（最近访问/活跃的在前）
    result.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
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
            input: row.tool_input ? (() => { try { return JSON.parse(row.tool_input) } catch { return undefined } })() : undefined,
            output: row.tool_output ? (() => { try { return JSON.parse(row.tool_output) } catch { return undefined } })() : undefined,
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
    this.emit('agentDeleted', sessionId)
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

  /**
   * 搜索文件
   */
  async searchFiles(sessionId, keyword, showHidden = false) {
    return this.fileManager.searchFiles(sessionId, keyword, showHidden)
  }

  // ============= Query 控制委托（委托给 queryManager） =============

  async setModel(sessionId, model) {
    const session = this.sessions.get(sessionId)
    const profile = session?.apiProfileId
      ? this.configManager.getAPIProfile(session.apiProfileId) || this.configManager.getDefaultProfile()
      : this.configManager.getDefaultProfile()
    const normalizedRequestedModel = normalizeModelValue(model)

    if (!normalizedRequestedModel) {
      console.log('[AgentSession] setModel request:', {
        sessionId,
        requestedModel: null,
        resolvedModel: null,
        hasSession: !!session,
        hasQueryGenerator: !!session?.queryGenerator,
        apiProfileId: session?.apiProfileId || profile?.id || null
      })
      if (session) {
        session.modelId = null
      }
      this.sessionDatabase?.updateAgentConversationModel?.(sessionId, null)
      if (!session?.queryGenerator) {
        console.log('[AgentSession] setModel persisted without active query:', {
          sessionId,
          resolvedModel: null
        })
        return { success: true, persistedOnly: true }
      }
      const result = await this.queryManager.setModel(sessionId, undefined)
      return result
    }

    const resolvedRequest = resolveRequestedModel(profile, this.configManager, normalizedRequestedModel)
    console.log('[AgentSession] setModel request:', {
      sessionId,
      requestedModel: normalizedRequestedModel,
      resolvedModel: resolvedRequest.queryModel || null,
      ignored: resolvedRequest.ignored,
      hasSession: !!session,
      hasQueryGenerator: !!session?.queryGenerator,
      apiProfileId: session?.apiProfileId || profile?.id || null
    })

    try {
      if (session) {
        session.modelId = normalizeModelIdOrNull(resolvedRequest.queryModel)
      }
      this.sessionDatabase?.updateAgentConversationModel?.(sessionId, resolvedRequest.queryModel)
      if (!session?.queryGenerator) {
        console.log('[AgentSession] setModel persisted without active query:', {
          sessionId,
          resolvedModel: resolvedRequest.queryModel || null
        })
        return { success: true, persistedOnly: true }
      }
      const result = await this.queryManager.setModel(sessionId, resolvedRequest.queryModel)
      console.log('[AgentSession] setModel request applied:', {
        sessionId,
        resolvedModel: resolvedRequest.queryModel || null
      })
      return result
    } catch (error) {
      console.warn('[AgentSession] setModel request failed:', {
        sessionId,
        requestedModel: normalizedRequestedModel,
        resolvedModel: resolvedRequest.queryModel || null,
        error: error.message
      })
      throw error
    }
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

  _saveImagesToDir(cwd, images) {
    try {
      const imagesDir = path.join(cwd, 'chat_paste_images')
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        const ext = this._getImageExt(img.mediaType)
        const suffix = images.length > 1 ? `-${i + 1}` : ''
        const fileName = `${timestamp}${suffix}.${ext}`
        const filePath = path.join(imagesDir, fileName)
        fs.writeFileSync(filePath, Buffer.from(img.base64, 'base64'))
        console.log(`[Agent] Image saved: ${filePath}`)
      }
    } catch (e) {
      console.warn('[Agent] Failed to save images:', e.message)
    }
  }

  _getImageExt(mediaType) {
    const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
    return map[mediaType] || 'png'
  }
}

module.exports = {
  AgentSessionManager,
  AgentStatus,
  AgentType
}

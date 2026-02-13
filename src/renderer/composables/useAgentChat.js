/**
 * Agent 对话状态管理组合式函数
 * 管理单个 Agent 对话的消息、流式状态等
 *
 * Streaming Input 模式：
 * - CLI 进程常驻，通过 MessageQueue 推送消息
 * - 模型切换使用 setModel() 实时生效
 * - 取消使用 interrupt() 不杀进程
 */
import { ref, watch, onUnmounted } from 'vue'

/**
 * Agent 消息角色
 */
export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
}

/**
 * Agent 对话状态管理
 * @param {string} sessionId - Agent 会话 ID
 */
export function useAgentChat(sessionId) {
  const messages = ref([])
  const isStreaming = ref(false)
  const isRestored = ref(false)
  const currentStreamText = ref('')
  const error = ref(null)
  const selectedModel = ref('sonnet')  // 默认值，initDefaultModel() 会从配置覆盖
  const streamingElapsed = ref(0)
  const contextTokens = ref(0)      // 上下文 token 数量
  const isCompacting = ref(false)    // 是否正在压缩
  const slashCommands = ref([])     // SDK 提供的可用 slash 命令
  const activeModel = ref('')        // SDK 实际使用的模型名
  const totalCostUsd = ref(0)        // 累计花费
  const numTurns = ref(0)            // 累计轮数
  let streamingTimer = null
  let currentBlockType = null  // 当前流式 content block 的类型（text / tool_use 等）

  // 模型切换标记：防止 init 同步触发 watch
  let syncFromInit = false
  // 是否已有活跃的 streaming 连接（CLI 进程在跑）
  let hasActiveSession = false
  // 用户是否主动取消了生成（用于抑制 "Unknown error" 提示）
  let isUserCancelling = false

  // 用户手动切换模型时，通过 setAgentModel 实时生效
  watch(selectedModel, async (newVal) => {
    if (syncFromInit) {
      syncFromInit = false
      return
    }
    // 有活跃连接时，使用 setModel() 实时切换
    if (hasActiveSession && window.electronAPI?.setAgentModel) {
      try {
        await window.electronAPI.setAgentModel(sessionId, newVal)
        console.log(`[useAgentChat] Model switched to ${newVal} via setModel()`)
      } catch (err) {
        console.warn('[useAgentChat] setModel failed (will use on next query):', err.message)
      }
    }
  })

  // 清理函数列表
  const cleanupFns = []

  /**
   * 加载历史消息
   */
  const loadMessages = async () => {
    if (!window.electronAPI?.getAgentMessages) return
    // 已有消息时跳过（避免 tab 切换导致的重复加载覆盖运行时状态）
    if (messages.value.length > 0) return

    try {
      const history = await window.electronAPI.getAgentMessages(sessionId)
      if (Array.isArray(history) && history.length > 0) {
        messages.value = history
        isRestored.value = true
      }
    } catch (err) {
      console.error('[useAgentChat] loadMessages error:', err)
    }
  }

  /**
   * 添加用户消息
   */
  const addUserMessage = (text) => {
    messages.value.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.USER,
      content: text,
      timestamp: Date.now()
    })
  }

  /**
   * 添加助手消息
   */
  const addAssistantMessage = (content, metadata = {}) => {
    messages.value.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.ASSISTANT,
      content,
      timestamp: Date.now(),
      ...metadata
    })
  }

  /**
   * 添加工具调用消息
   */
  const addToolMessage = (toolName, input, output) => {
    messages.value.push({
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.TOOL,
      toolName,
      input,
      output,
      timestamp: Date.now()
    })
  }

  // 计时器控制
  const startTimer = () => {
    if (streamingTimer) clearInterval(streamingTimer)
    streamingElapsed.value = 0
    streamingTimer = setInterval(() => {
      streamingElapsed.value++
    }, 1000)
  }

  const stopTimer = () => {
    if (streamingTimer) {
      clearInterval(streamingTimer)
      streamingTimer = null
    }
  }

  /**
   * 本地处理 slash 命令（不发送到 SDK）
   * /compact 走 IPC compactConversation
   * /status, /cost, /help, /clear 前端本地处理
   * @returns {boolean} 是否已处理
   */
  const handleLocalSlashCommand = (cmd) => {
    const lower = cmd.toLowerCase()

    if (lower === '/compact') {
      compactConversation()
      return true
    }

    if (lower === '/status') {
      const lines = [
        `Session: ${sessionId.substring(0, 8)}`,
        `Model: ${activeModel.value || 'unknown'}`,
        `Turns: ${numTurns.value}`,
        `Messages: ${messages.value.length}`,
        `Cost: $${totalCostUsd.value.toFixed(4)}`,
        contextTokens.value > 0 ? `Context tokens: ${contextTokens.value.toLocaleString()}` : ''
      ].filter(Boolean)
      addAssistantMessage(lines.join('\n'))
      return true
    }

    if (lower === '/cost') {
      addAssistantMessage(`Total cost: $${totalCostUsd.value.toFixed(4)} USD`)
      return true
    }

    if (lower === '/help') {
      const lines = [
        'Available commands:',
        '  /compact - Compress conversation context',
        '  /status  - Show session status',
        '  /cost    - Show total cost',
        '  /clear   - Clear message display',
        '  /help    - Show this help'
      ]
      addAssistantMessage(lines.join('\n'))
      return true
    }

    if (lower === '/clear') {
      messages.value = []
      currentStreamText.value = ''
      return true
    }

    return false
  }

  const sendMessage = async (text) => {
    if (!text.trim() || isStreaming.value) return

    const trimmed = text.trim()

    // 本地 slash 命令拦截
    if (trimmed.startsWith('/')) {
      addUserMessage(trimmed)
      if (handleLocalSlashCommand(trimmed)) {
        return
      }
      // 未识别的 slash 命令，照常发送给 SDK
    }

    error.value = null
    isRestored.value = false
    isUserCancelling = false  // 重置取消标志，允许下次错误显示
    if (!trimmed.startsWith('/')) {
      addUserMessage(trimmed)
    }

    // 第一条用户消息 → 自动设为对话标题（截取前10个字符）
    const userMessages = messages.value.filter(m => m.role === MessageRole.USER)
    if (userMessages.length === 1 && !trimmed.startsWith('/') && !trimmed.startsWith('@')) {
      const autoTitle = trimmed.length > 10 ? trimmed.slice(0, 10) + '…' : trimmed
      window.electronAPI?.renameAgentSession?.({ sessionId, title: autoTitle }).catch(() => {})
    }

    isStreaming.value = true
    currentStreamText.value = ''
    startTimer()

    const sendOptions = {
      sessionId,
      message: trimmed,
      // 每次都传当前选择的模型，确保：
      // 1. 新建 query 时使用正确模型
      // 2. push 到现有队列前自动 setModel()
      modelTier: selectedModel.value
    }

    try {
      await window.electronAPI.sendAgentMessage(sendOptions)
    } catch (err) {
      console.error('[useAgentChat] sendMessage error:', err)
      error.value = err.message || 'Failed to send message'
      isStreaming.value = false
      stopTimer()
    }
  }

  /**
   * 取消生成（使用 interrupt，不杀 CLI 进程）
   */
  const cancelGeneration = async () => {
    try {
      // 标记为用户主动取消，避免显示 "Unknown error"
      isUserCancelling = true
      await window.electronAPI.cancelAgentGeneration(sessionId)
    } catch (err) {
      console.error('[useAgentChat] cancel error:', err)
      isUserCancelling = false  // 取消失败，重置标志
    }
  }

  /**
   * 处理 init 事件（获取可用 slash 命令等）
   */
  const handleInit = (data) => {
    if (data.sessionId !== sessionId) return

    hasActiveSession = true

    if (data.slashCommands && Array.isArray(data.slashCommands)) {
      slashCommands.value = data.slashCommands
    }
    if (data.model) {
      activeModel.value = data.model
      // 未手动切换过时，根据 SDK 返回的模型名同步下拉菜单
      syncFromInit = true
      const modelLower = data.model.toLowerCase()
      if (modelLower.includes('opus')) selectedModel.value = 'opus'
      else if (modelLower.includes('haiku')) selectedModel.value = 'haiku'
      else selectedModel.value = 'sonnet'
    }
  }

  /**
   * 处理 SDK 流式消息事件
   */
  const handleMessage = (data) => {
    if (data.sessionId !== sessionId) return
    const msg = data.message
    if (!msg) return

    // msg.content 是完整 assistant 消息的 content 块数组
    // text 块已由 handleStream 流式处理并添加，这里只处理 tool_use 等非流式块
    const blocks = msg.content || []
    for (const block of blocks) {
      if (block.type === 'tool_use') {
        addToolMessage(block.name, block.input, null)
      }
    }
  }

  /**
   * 处理流式文本事件
   */
  const handleStream = (data) => {
    if (data.sessionId !== sessionId) return
    const event = data.event

    if (!event) return

    // 记录当前 block 类型（区分 text / tool_use 等）
    if (event.type === 'content_block_start') {
      currentBlockType = event.content_block?.type || null
    }

    if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta') {
        currentStreamText.value += event.delta.text
      }
    }

    if (event.type === 'content_block_stop') {
      // 仅在 text block 结束时 flush 累积文本，避免 tool_use block stop 误触发
      if (currentBlockType === 'text' && currentStreamText.value) {
        addAssistantMessage(currentStreamText.value)
        currentStreamText.value = ''
      }
      currentBlockType = null
    }

    if (event.type === 'message_stop') {
      if (currentStreamText.value) {
        addAssistantMessage(currentStreamText.value)
        currentStreamText.value = ''
      }
      currentBlockType = null
      // 注意：不在此处停止 isStreaming
      // Agent 可能继续下一轮（工具调用、思考等），由 statusChange/result 统一管理状态
    }
  }

  /**
   * 处理结果事件（一轮对话结束，CLI 仍在运行）
   */
  const handleResult = (data) => {
    if (data.sessionId !== sessionId) return

    // result 表示一轮完成，状态由 statusChange 统一管理
    isCompacting.value = false
    stopTimer()

    // flush 未完成的流式文本
    if (currentStreamText.value) {
      addAssistantMessage(currentStreamText.value)
      currentStreamText.value = ''
    }

    const result = data.result

    // 注意：result.modelUsage 是一轮中所有 API 调用的累计值，
    // 不代表真实上下文大小，不用于 contextTokens。
    // 上下文大小由 handleUsage（单次 API 调用的 usage）更新。

    // 累计花费和轮数
    if (result?.totalCostUsd) {
      totalCostUsd.value += result.totalCostUsd
    }
    if (result?.numTurns) {
      numTurns.value += result.numTurns
    }

    // 检查是否是错误结果
    if (result?.subtype?.startsWith('error')) {
      // 如果是用户主动取消，不显示错误（CLI interrupt 会返回 error subtype）
      if (isUserCancelling) {
        console.log('[useAgentChat] User cancelled, suppressing error display')
        isUserCancelling = false  // 重置标志
      } else {
        // 真正的错误，显示错误消息
        error.value = result.error || result.result || 'Unknown error'
      }
    }
  }

  /**
   * 处理 usage 事件（assistant 消息级别的 token 用量）
   */
  const handleUsage = (data) => {
    if (data.sessionId !== sessionId) return
    const usage = data.usage
    if (usage) {
      // 真实上下文大小 = input_tokens + 缓存创建 + 缓存读取
      // 三者互斥，总和 = 实际发送到 API 的 token 数
      const input = usage.input_tokens || usage.inputTokens || 0
      const cacheCreation = usage.cache_creation_input_tokens || usage.cacheCreationInputTokens || 0
      const cacheRead = usage.cache_read_input_tokens || usage.cacheReadInputTokens || 0
      const total = input + cacheCreation + cacheRead
      if (total > 0) {
        contextTokens.value = total
      }
    }
  }

  /**
   * 处理错误事件
   */
  // 错误码 → 友好提示映射
  const ERROR_MESSAGES = {
    'SESSION_IN_USE_BY_TERMINAL': '该会话正在终端模式中使用，请先关闭对应终端'
  }

  const handleError = (data) => {
    if (data.sessionId !== sessionId) return
    isStreaming.value = false
    stopTimer()
    const rawError = data.error || 'Unknown error'
    error.value = ERROR_MESSAGES[rawError] || rawError
  }

  /**
   * 处理状态变化事件（统一管理 streaming/idle 状态）
   */
  const handleStatusChange = (data) => {
    if (data.sessionId !== sessionId) return

    if (data.status === 'idle' || data.status === 'error') {
      isStreaming.value = false
      stopTimer()
      // flush 未完成的流式文本
      if (currentStreamText.value) {
        addAssistantMessage(currentStreamText.value)
        currentStreamText.value = ''
      }
      // CLI 进程退出时重置标记，下次发消息会重建 query
      if (data.cliExited) {
        hasActiveSession = false
      }
    } else if (data.status === 'streaming') {
      isStreaming.value = true
      startTimer()
    }
  }

  /**
   * 处理上下文压缩完成事件
   */
  const handleCompacted = (data) => {
    if (data.sessionId !== sessionId) return
    isCompacting.value = false
    console.log(`[useAgentChat] Compacted: preTokens=${data.preTokens}, trigger=${data.trigger}`)
  }

  /**
   * 压缩上下文
   */
  const compactConversation = async () => {
    if (isStreaming.value || isCompacting.value) return

    error.value = null
    isCompacting.value = true

    try {
      await window.electronAPI.compactAgentConversation(sessionId)
    } catch (err) {
      console.error('[useAgentChat] compact error:', err)
      error.value = err.message || 'Compact failed'
      isCompacting.value = false
    }
  }

  /**
   * 处理工具进度事件
   */
  const handleToolProgress = (data) => {
    if (data.sessionId !== sessionId) return
    const lastToolMsg = [...messages.value].reverse().find(m => m.role === MessageRole.TOOL && !m.output)
    if (lastToolMsg && data.content) {
      lastToolMsg.output = data.content
    }
  }

  /**
   * 设置 IPC 事件监听
   */
  const setupListeners = () => {
    if (!window.electronAPI) return

    if (window.electronAPI.onAgentInit) {
      cleanupFns.push(window.electronAPI.onAgentInit(handleInit))
    }
    if (window.electronAPI.onAgentMessage) {
      cleanupFns.push(window.electronAPI.onAgentMessage(handleMessage))
    }
    if (window.electronAPI.onAgentStream) {
      cleanupFns.push(window.electronAPI.onAgentStream(handleStream))
    }
    if (window.electronAPI.onAgentResult) {
      cleanupFns.push(window.electronAPI.onAgentResult(handleResult))
    }
    if (window.electronAPI.onAgentError) {
      cleanupFns.push(window.electronAPI.onAgentError(handleError))
    }
    if (window.electronAPI.onAgentToolProgress) {
      cleanupFns.push(window.electronAPI.onAgentToolProgress(handleToolProgress))
    }
    if (window.electronAPI.onAgentStatusChange) {
      cleanupFns.push(window.electronAPI.onAgentStatusChange(handleStatusChange))
    }
    if (window.electronAPI.onAgentCompacted) {
      cleanupFns.push(window.electronAPI.onAgentCompacted(handleCompacted))
    }
    if (window.electronAPI.onAgentUsage) {
      cleanupFns.push(window.electronAPI.onAgentUsage(handleUsage))
    }
    // macOS: 窗口重建后所有 Agent 会话已关闭，重置前端状态
    if (window.electronAPI.onAgentAllSessionsClosed) {
      cleanupFns.push(window.electronAPI.onAgentAllSessionsClosed(() => {
        isStreaming.value = false
        hasActiveSession = false
      }))
    }
  }

  /**
   * 从配置读取默认模型，覆盖硬编码的 'sonnet'
   */
  const initDefaultModel = async () => {
    try {
      if (!window.electronAPI?.getConfig) return
      const config = await window.electronAPI.getConfig()
      if (config?.apiProfiles && config.defaultProfileId) {
        const profile = config.apiProfiles.find(p => p.id === config.defaultProfileId)
        if (profile?.selectedModelTier) {
          syncFromInit = true
          selectedModel.value = profile.selectedModelTier
        }
      }
    } catch (err) {
      console.warn('[useAgentChat] Failed to load default model from config:', err)
    }
  }

  /**
   * 清理监听器
   */
  const cleanup = () => {
    stopTimer()
    cleanupFns.forEach(fn => fn && fn())
    cleanupFns.length = 0
  }

  // 自动清理
  onUnmounted(cleanup)

  return {
    messages,
    isStreaming,
    isRestored,
    currentStreamText,
    error,
    selectedModel,
    streamingElapsed,
    contextTokens,
    isCompacting,
    slashCommands,
    activeModel,
    totalCostUsd,
    numTurns,
    loadMessages,
    sendMessage,
    cancelGeneration,
    compactConversation,
    setupListeners,
    initDefaultModel,
    cleanup
  }
}

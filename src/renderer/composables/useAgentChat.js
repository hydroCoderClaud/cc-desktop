/**
 * Agent 对话状态管理组合式函数
 * 管理单个 Agent 对话的消息、流式状态等
 */
import { ref, computed, watch, onUnmounted } from 'vue'

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
  const sessionInfo = ref(null)
  const selectedModel = ref('sonnet')
  const modelOverride = ref(null)  // 用户手动切换后的模型，null=使用配置默认
  const streamingElapsed = ref(0)
  const contextTokens = ref(0)      // 上下文 token 数量
  const isCompacting = ref(false)    // 是否正在压缩
  const slashCommands = ref([])     // SDK 提供的可用 slash 命令
  const activeModel = ref('')        // SDK 实际使用的模型名
  const totalCostUsd = ref(0)        // 累计花费
  const numTurns = ref(0)            // 累计轮数
  let streamingTimer = null

  // 用户手动切换模型时记录（syncFromInit 守卫防止 init 同步触发）
  let syncFromInit = false
  watch(selectedModel, (newVal) => {
    if (syncFromInit) {
      syncFromInit = false
      return
    }
    modelOverride.value = newVal
  })

  // 清理函数列表
  const cleanupFns = []

  /**
   * 加载历史消息
   */
  const loadMessages = async () => {
    if (!window.electronAPI?.getAgentMessages) return

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
      id: `msg-${Date.now()}`,
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
   * 这些命令在 CLI 中由 REPL 处理，SDK query() 不支持
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
    if (!trimmed.startsWith('/')) {
      // 只有非 slash 命令才在这里添加用户消息（slash 命令已在上面添加）
      addUserMessage(trimmed)
    }
    isStreaming.value = true
    currentStreamText.value = ''
    startTimer()

    const sendOptions = {
      sessionId,
      message: trimmed
    }
    // 仅在用户手动切换过模型时才传 modelTier，否则使用配置文件默认
    if (modelOverride.value) {
      sendOptions.modelTier = modelOverride.value
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
   * 取消生成
   */
  const cancelGeneration = async () => {
    try {
      await window.electronAPI.cancelAgentGeneration(sessionId)
    } catch (err) {
      console.error('[useAgentChat] cancel error:', err)
    }
  }

  /**
   * 处理 init 事件（获取可用 slash 命令等）
   */
  const handleInit = (data) => {
    if (data.sessionId !== sessionId) return
    if (data.slashCommands && Array.isArray(data.slashCommands)) {
      slashCommands.value = data.slashCommands
    }
    if (data.model) {
      activeModel.value = data.model
      // 未手动切换过时，根据 SDK 返回的模型名同步下拉菜单
      if (!modelOverride.value) {
        syncFromInit = true
        const modelLower = data.model.toLowerCase()
        if (modelLower.includes('opus')) selectedModel.value = 'opus'
        else if (modelLower.includes('haiku')) selectedModel.value = 'haiku'
        else selectedModel.value = 'sonnet'
      }
    }
  }

  /**
   * 处理 SDK 流式消息事件
   */
  const handleMessage = (data) => {
    if (data.sessionId !== sessionId) return
    const msg = data.message

    if (!msg) return

    // SDK assistant message 包含完整的 BetaMessage
    // 内容可能是 text、tool_use 等
    if (msg.message && msg.message.content) {
      const blocks = msg.message.content
      for (const block of blocks) {
        if (block.type === 'text') {
          addAssistantMessage(block.text)
        } else if (block.type === 'tool_use') {
          addToolMessage(block.name, block.input, null)
        }
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

    // content_block_delta 包含增量文本
    if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta') {
        currentStreamText.value += event.delta.text
      }
    }

    // content_block_stop 表示当前块完成
    if (event.type === 'content_block_stop') {
      if (currentStreamText.value) {
        addAssistantMessage(currentStreamText.value)
        currentStreamText.value = ''
      }
    }

    // message_stop 表示整个消息完成
    if (event.type === 'message_stop') {
      if (currentStreamText.value) {
        addAssistantMessage(currentStreamText.value)
        currentStreamText.value = ''
      }
    }
  }

  /**
   * 处理结果事件
   */
  const handleResult = (data) => {
    if (data.sessionId !== sessionId) return

    isStreaming.value = false
    isCompacting.value = false
    stopTimer()

    // 如果还有未 flush 的流式文本
    if (currentStreamText.value) {
      addAssistantMessage(currentStreamText.value)
      currentStreamText.value = ''
    }

    const result = data.result

    // 从 result.modelUsage 读取上下文 token 数
    // Anthropic API 使用 prompt caching，实际上下文 = inputTokens + cacheCreationInputTokens + cacheReadInputTokens
    if (result?.modelUsage) {
      let totalInput = 0
      for (const model of Object.values(result.modelUsage)) {
        totalInput += (model.inputTokens || 0) + (model.cacheCreationInputTokens || 0) + (model.cacheReadInputTokens || 0)
      }
      if (totalInput > 0) {
        contextTokens.value = totalInput
      }
    }

    // 累计花费和轮数
    if (result?.totalCostUsd) {
      totalCostUsd.value += result.totalCostUsd
    }
    if (result?.numTurns) {
      numTurns.value += result.numTurns
    }

    if (result?.subtype?.startsWith('error')) {
      error.value = result.error || 'Unknown error'
    }
  }

  /**
   * 处理 usage 事件（assistant 消息级别的 token 用量）
   */
  const handleUsage = (data) => {
    if (data.sessionId !== sessionId) return
    const usage = data.usage
    if (usage) {
      // input_tokens ≈ 当前会话上下文大小
      contextTokens.value = usage.input_tokens || usage.inputTokens || 0
    }
  }

  /**
   * 处理错误事件
   */
  const handleError = (data) => {
    if (data.sessionId !== sessionId) return
    isStreaming.value = false
    stopTimer()
    error.value = data.error || 'Unknown error'
  }

  /**
   * 处理状态变化事件（取消、完成等）
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
    }
  }

  /**
   * 处理上下文压缩完成事件
   */
  const handleCompacted = (data) => {
    if (data.sessionId !== sessionId) return
    isCompacting.value = false
    // compact_boundary 返回压缩前的 token 数，压缩后会在下次 result 中更新
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
    // 更新最后一条工具消息的输出
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
    sessionInfo,
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
    cleanup
  }
}

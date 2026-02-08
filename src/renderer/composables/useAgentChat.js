/**
 * Agent 对话状态管理组合式函数
 * 管理单个 Agent 对话的消息、流式状态等
 */
import { ref, computed, onUnmounted } from 'vue'

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
  const streamingElapsed = ref(0)
  const contextTokens = ref(0)      // 上下文 token 数量
  const isCompacting = ref(false)    // 是否正在压缩
  const slashCommands = ref([])     // SDK 提供的可用 slash 命令
  const activeModel = ref('')        // SDK 实际使用的模型名
  let streamingTimer = null

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
   * 发送消息
   */
  const sendMessage = async (text) => {
    if (!text.trim() || isStreaming.value) return

    const trimmed = text.trim()

    // /compact 走专用方法
    if (trimmed === '/compact') {
      return compactConversation()
    }

    error.value = null
    isRestored.value = false
    addUserMessage(trimmed)
    isStreaming.value = true
    currentStreamText.value = ''
    startTimer()

    // slash 命令自动限制 maxTurns=1
    const isSlashCmd = trimmed.startsWith('/')
    const sendOptions = {
      sessionId,
      message: trimmed,
      modelTier: selectedModel.value
    }
    if (isSlashCmd) {
      sendOptions.maxTurns = 1
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
    if (result?.subtype?.startsWith('error')) {
      error.value = result.error || 'Unknown error'
    }

    // 提取 token 用量（input_tokens 近似当前上下文大小）
    if (result?.usage) {
      const usage = result.usage
      contextTokens.value = usage.inputTokens || usage.input_tokens || 0
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
    loadMessages,
    sendMessage,
    cancelGeneration,
    compactConversation,
    setupListeners,
    cleanup
  }
}

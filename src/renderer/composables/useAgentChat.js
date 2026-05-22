/**
 * Agent 对话状态管理组合式函数
 * 管理单个 Agent 对话的消息、流式状态等
 *
 * Streaming Input 模式：
 * - CLI 进程常驻，通过 MessageQueue 推送消息
 * - 模型切换使用 setModel() 实时生效
 * - 取消使用 interrupt() 不杀进程
 *
 * @param {string} sessionId - Agent 会话 ID
 * @param {object} options - 可选配置
 * @param {function} options.onClearRequested - /clear 命令回调（调用方负责重建会话）
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useLocale } from './useLocale'
import { useAgentLocalCommands } from './useAgentLocalCommands'
import { setupExternalImListeners } from './external-im-message-adapter'
import {
  buildBuiltinSlashCommands,
  mergeSlashCommands,
  normalizeSlashCommands,
  parseSlashCommand
} from '@utils/slash-commands'
import { getLeadingSlashInputKind } from '@utils/chat-input-utils'

/**
 * Agent 消息角色
 */
export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
}

export function useAgentChat(sessionId, options = {}) {
  const { t } = useLocale()
  const slashCommandsEnabled = options.enableSlashCommands !== false
  const agentApi = options.agentApi || (typeof window !== 'undefined' ? window.electronAPI : null)

  const messages = ref([])
  const isStreaming = ref(false)
  const isRestored = ref(false)
  const currentStreamText = ref('')
  const error = ref(null)
  const selectedModel = ref('')
  const streamingElapsed = ref(0)
  const contextTokens = ref(0)      // 上下文 token 数量
  const isCompacting = ref(false)    // 是否正在压缩
  const sdkSlashCommands = ref([])  // SDK 提供的可用 slash 命令
  const totalCostUsd = ref(0)        // 累计花费
  const numTurns = ref(0)            // 累计轮数
  let streamingTimer = null
  let currentBlockType = null  // 当前流式 content block 的类型（text / tool_use 等）
  let streamTextReceived = false  // 本轮是否收到过流式 text delta（用于判断是否为非流式 API）
  let currentTurnSlashCommand = ''
  let currentTurnHasVisibleOutput = false
  let lastSystemStatusFingerprint = ''

  const modelOptions = ref([])
  let modelInitToken = 0
  let selectedModelChangeSource = 'bootstrap'

  const normalizeModelValue = (value) => typeof value === 'string' ? value.trim() : ''

  const normalizeModelIds = (values) => {
    const normalized = []
    const seen = new Set()

    for (const value of Array.isArray(values) ? values : []) {
      const modelId = normalizeModelValue(value)
      if (!modelId || seen.has(modelId)) continue
      seen.add(modelId)
      normalized.push(modelId)
    }

    return normalized
  }

  const getProviderModelIds = (config, serviceProvider) => {
    const definitions = Array.isArray(config?.serviceProviderDefinitions) ? config.serviceProviderDefinitions : []
    const provider = definitions.find(item => item.id === serviceProvider)
    return normalizeModelIds(provider?.defaultModels)
  }

  const buildModelOptions = (profile, config) => {
    const modelIds = normalizeModelIds([
      ...getProviderModelIds(config, profile?.serviceProvider),
      profile?.selectedModelId
    ])

    return modelIds.map(modelId => ({
      value: modelId,
      label: modelId,
      id: modelId
    }))
  }

  const resolveSendModel = () => {
    if (selectedModelChangeSource !== 'user') {
      return ''
    }

    const currentModel = normalizeModelValue(selectedModel.value)
    const allowedModelIds = normalizeModelIds(modelOptions.value.map(model => model?.value))

    if (!currentModel) {
      return ''
    }

    if (allowedModelIds.length > 0 && !allowedModelIds.includes(currentModel)) {
      console.warn('[useAgentChat] Detected stale selectedModel, keeping explicit selection for send:', {
        sessionId,
        selectedModel: currentModel,
        allowedModelIds
      })
    }

    return currentModel
  }

  const applyUserSelectedModel = (value) => {
    selectedModelChangeSource = 'user'
    selectedModel.value = normalizeModelValue(value)
  }
  // 是否已有活跃的 streaming 连接（CLI 进程在跑）
  const hasActiveSession = ref(false)
  // 用户是否主动取消了生成（用于抑制队列自动消费和错误显示）
  const isInterrupting = ref(false)
  const slashCommandsReady = computed(() => slashCommandsEnabled && hasActiveSession.value)
  const builtinSlashCommands = computed(() => buildBuiltinSlashCommands(t))
  const slashCommands = computed(() =>
    slashCommandsReady.value
      ? mergeSlashCommands(builtinSlashCommands.value, sdkSlashCommands.value)
      : []
  )

  // 用户手动切换模型时，通过 setAgentModel 实时生效
  watch(selectedModel, (newVal, oldVal) => {
    const nextModel = normalizeModelValue(newVal)
    const prevModel = normalizeModelValue(oldVal)
    const canSetModelLive = !!agentApi?.setAgentModel
    const changeSource = selectedModelChangeSource

    console.log('[useAgentChat] selectedModel changed:', {
      sessionId,
      previousModel: prevModel || null,
      nextModel: nextModel || null,
      changeSource,
      hasActiveSession: hasActiveSession.value,
      willCallSetModel: canSetModelLive
    })

    if (changeSource !== 'user') {
      selectedModelChangeSource = 'idle'
      return
    }

    if (canSetModelLive) {
      agentApi.setAgentModel(sessionId, nextModel)
        .then(result => {
          if (result?.ignored) {
            console.warn('[useAgentChat] setAgentModel ignored by main process:', {
              sessionId,
              model: nextModel || null,
              requestedModel: result.requestedModel || nextModel || null
            })
            if (prevModel !== nextModel) {
              selectedModel.value = prevModel
            }
            return
          }
          console.log('[useAgentChat] setAgentModel resolved:', {
            sessionId,
            model: nextModel || null,
            persistedOnly: !!result?.persistedOnly
          })
        })
        .catch(err =>
          console.warn('[useAgentChat] setModel failed (will use on next query):', {
            sessionId,
            model: nextModel || null,
            error: err.message
          })
        )
    }

    selectedModelChangeSource = 'idle'
  })

  // 清理函数列表
  const cleanupFns = []

  const beginCurrentTurn = ({ slashCommandName = '' } = {}) => {
    currentTurnSlashCommand = slashCommandName
    currentTurnHasVisibleOutput = false
    lastSystemStatusFingerprint = ''
  }

  const resetCurrentTurn = () => {
    currentTurnSlashCommand = ''
    currentTurnHasVisibleOutput = false
    lastSystemStatusFingerprint = ''
  }

  const markCurrentTurnVisible = () => {
    currentTurnHasVisibleOutput = true
  }

  const stringifyDisplayValue = (value, preferredKeys = []) => {
    if (value == null) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)

    if (Array.isArray(value)) {
      const parts = value
        .map(item => stringifyDisplayValue(item, preferredKeys))
        .filter(Boolean)
      return parts.join('\n').trim()
    }

    if (typeof value === 'object') {
      for (const key of preferredKeys) {
        const candidate = stringifyDisplayValue(value[key], preferredKeys)
        if (candidate) return candidate
      }

      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return ''
      }
    }

    return String(value)
  }

  const summarizeResultText = (value) => stringifyDisplayValue(value, [
    'message',
    'text',
    'result',
    'summary',
    'content',
    'status'
  ])

  const isHiddenStructuredSystemStatus = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false

    const subtype = typeof value.subtype === 'string' ? value.subtype.toLowerCase() : ''
    const taskType = typeof value.task_type === 'string' ? value.task_type.toLowerCase() : ''
    const description = typeof value.description === 'string' ? value.description.trim() : ''

    if (subtype.startsWith('task_')) {
      return true
    }

    if (taskType && description && value.tool_use_id) {
      return true
    }

    return false
  }

  const summarizeSystemStatus = (value) => {
    if (isHiddenStructuredSystemStatus(value)) {
      return ''
    }

    return stringifyDisplayValue(value, [
      'message',
      'text',
      'status',
      'summary',
      'detail'
    ])
  }

  const summarizeOtherMessage = (value) => {
    if (isHiddenStructuredSystemStatus(value)) {
      return ''
    }

    const directText = stringifyDisplayValue(value, [
      'message',
      'text',
      'status',
      'result',
      'summary',
      'content'
    ])
    if (directText) return directText

    if (value && typeof value === 'object') {
      const eventName = [value.type, value.subtype].filter(Boolean).join(':')
      if (eventName) {
        return t('agent.sdkEvent', { event: eventName })
      }
    }

    return ''
  }

  const isTransientSystemStatus = (statusText) => {
    if (!statusText) return true
    const lower = statusText.toLowerCase()

    return [
      'thinking',
      'requesting',
      'streaming',
      'idle',
      'working',
      'processing'
    ].some(keyword => lower === keyword || lower.startsWith(`${keyword} `) || lower.startsWith(`${keyword}:`))
  }

  const formatElapsedSeconds = (value) => {
    if (!Number.isFinite(value) || value < 0) return ''
    if (value < 60) return `${value}s`
    const minutes = Math.floor(value / 60)
    const seconds = value % 60
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }

  /**
   * 加载历史消息
   */
  const loadMessages = async () => {
    if (!agentApi?.getAgentMessages) return

    try {
      const history = await agentApi.getAgentMessages(sessionId)
      if (Array.isArray(history) && history.length > 0) {
        if (messages.value.length > 0) {
          // 已有消息（如钉钉实时注入），将历史插入到前面，避免覆盖运行时状态
          const existingIds = new Set(messages.value.map(m => m.id))
          const toInsert = history.filter(m => !existingIds.has(m.id))
          if (toInsert.length > 0) {
            messages.value = [...toInsert, ...messages.value]
            isRestored.value = !isStreaming.value
          }
        } else {
          messages.value = history
          // 仍在 streaming 时不标记为历史会话
          isRestored.value = !isStreaming.value
        }
      }
    } catch (err) {
      console.error('[useAgentChat] loadMessages error:', err)
    }
  }

  /**
   * 添加用户消息
   */
  const addUserMessage = (text, images = null) => {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.USER,
      content: text,
      timestamp: Date.now()
    }

    // 如果有图片，附加到消息对象
    if (images && images.length > 0) {
      message.images = images
    }

    messages.value.push(message)
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
    markCurrentTurnVisible()
  }

  const addSystemMessage = (content, metadata = {}) => {
    const normalizedContent = summarizeResultText(content)
    if (!normalizedContent) return

    messages.value.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.SYSTEM,
      content: normalizedContent,
      timestamp: Date.now(),
      ...metadata
    })
    markCurrentTurnVisible()
  }

  /**
   * 添加工具调用消息
   */
  const addToolMessage = (toolName, input, output, metadata = {}) => {
    const toolUseId = metadata.toolUseId || null
    const existingMessage = toolUseId
      ? [...messages.value].reverse().find(msg => msg.role === MessageRole.TOOL && msg.toolUseId === toolUseId)
      : null

    if (existingMessage) {
      existingMessage.toolName = toolName || existingMessage.toolName
      existingMessage.input = input ?? existingMessage.input
      existingMessage.output = output ?? existingMessage.output
      Object.assign(existingMessage, metadata)
      markCurrentTurnVisible()
      return
    }

    messages.value.push({
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.TOOL,
      toolName,
      input,
      output,
      timestamp: Date.now(),
      ...metadata
    })
    markCurrentTurnVisible()
  }

  const updateToolMessageOutput = (toolUseId, output) => {
    const toolMessage = toolUseId
      ? [...messages.value].reverse().find(msg => msg.role === MessageRole.TOOL && msg.toolUseId === toolUseId)
      : [...messages.value].reverse().find(msg => msg.role === MessageRole.TOOL && !msg.output)

    if (toolMessage) {
      toolMessage.output = output
      toolMessage.inProgress = false
      toolMessage.progressText = ''
    }
  }

  const getToolMessageById = (messageId) => messages.value.find(msg => msg.id === messageId && msg.role === MessageRole.TOOL)

  const upsertInteractionMessage = (interaction, output = null) => {
    const interactionId = interaction?.interactionId
    if (!interactionId) return

    const existing = messages.value.find(msg => msg.role === MessageRole.TOOL && msg.input?.interactionId === interactionId)
    if (existing) {
      existing.toolName = 'AskUserQuestion'
      existing.input = {
        ...(existing.input || {}),
        ...interaction
      }
      if (output !== null) existing.output = output
      return
    }

    messages.value.push({
      id: interaction.messageId || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.TOOL,
      toolName: 'AskUserQuestion',
      input: interaction,
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

  const setSdkSlashCommands = (commands) => {
    sdkSlashCommands.value = normalizeSlashCommands(commands, {
      source: 'sdk',
      icon: 'zap',
      autoSubmit: false
    })
  }

  const refreshSupportedSlashCommands = async (fallback = []) => {
    if (!slashCommandsEnabled) {
      setSdkSlashCommands([])
      return
    }

    const fallbackCommands = normalizeSlashCommands(fallback, {
      source: 'sdk',
      icon: 'zap',
      autoSubmit: false
    })

    if (!agentApi?.getAgentSupportedCommands) {
      if (fallbackCommands.length > 0) {
        setSdkSlashCommands(fallbackCommands)
      }
      return
    }

    try {
      const supported = await agentApi.getAgentSupportedCommands(sessionId)
      const normalized = normalizeSlashCommands(supported, {
        source: 'sdk',
        icon: 'zap',
        autoSubmit: false
      })
      if (normalized.length > 0) {
        setSdkSlashCommands(normalized)
        return
      }
    } catch (err) {
      console.warn('[useAgentChat] Failed to refresh supported slash commands:', err)
    }

    if (fallbackCommands.length > 0) {
      setSdkSlashCommands(fallbackCommands)
    }
  }

  const syncActiveSessionState = async () => {
    if (!agentApi?.getAgentInitResult) {
      return
    }

    try {
      const initResult = await agentApi.getAgentInitResult(sessionId)
      if (!initResult || initResult.error) {
        console.log('[useAgentChat] syncActiveSessionState: no active init result', {
          sessionId,
          hasResult: !!initResult,
          error: initResult?.error || null
        })
        return
      }

      hasActiveSession.value = true
      isRestored.value = false
      console.log('[useAgentChat] syncActiveSessionState: active session restored', {
        sessionId,
        model: initResult.model || null,
        slashCommandCount: Array.isArray(initResult.slashCommands) ? initResult.slashCommands.length : 0
      })

      if (slashCommandsEnabled && Array.isArray(initResult.slashCommands)) {
        void refreshSupportedSlashCommands(initResult.slashCommands)
      }
    } catch (err) {
      const message = String(err?.message || err || '')
      console.log('[useAgentChat] syncActiveSessionState failed:', {
        sessionId,
        error: message
      })
      if (!message.includes('No active streaming session') && !message.includes('not found')) {
        console.warn('[useAgentChat] Failed to sync active session state:', err)
      }
    }
  }

  const {
    triggerScheduledTaskDraft,
    submitScheduledTaskDraft,
    cancelScheduledTaskDraft,
    handleLocalSlashCommand
  } = useAgentLocalCommands({
    sessionId,
    t,
    options,
    messages,
    selectedModel,
    hasActiveSession,
    numTurns,
    totalCostUsd,
    contextTokens,
    slashCommandsReady,
    slashCommands,
    builtinSlashCommands,
    sdkSlashCommands,
    addAssistantMessage,
    compactConversation: () => compactConversation()
  })

  const normalizeOutgoingMessage = (message) => {
    if (typeof message === 'string') {
      return message
    }

    if (!message || typeof message !== 'object') {
      return ''
    }

    const text = typeof message.text === 'string'
      ? message.text
      : String(message.text || '')

    const images = Array.isArray(message.images)
      ? message.images
        .filter(image => image && typeof image === 'object')
        .map(image => ({
          base64: typeof image.base64 === 'string' ? image.base64 : '',
          mediaType: typeof image.mediaType === 'string' ? image.mediaType : '',
          sizeBytes: Number.isFinite(image.sizeBytes) ? image.sizeBytes : 0,
          warning: Boolean(image.warning)
        }))
        .filter(image => image.base64 && image.mediaType)
      : []

    if (images.length === 0) {
      return text
    }

    return { text, images }
  }

  const sendMessage = async (text) => {
    // 支持两种格式：字符串（纯文本）和对象（带图片）
    let textContent = ''
    let originalMessage = null
    let hasImages = false
    const normalizedMessage = normalizeOutgoingMessage(text)

    if (typeof normalizedMessage === 'string') {
      textContent = normalizedMessage
      originalMessage = normalizedMessage
    } else if (normalizedMessage && typeof normalizedMessage === 'object') {
      textContent = normalizedMessage.text || ''
      originalMessage = normalizedMessage
      hasImages = normalizedMessage.images && normalizedMessage.images.length > 0
    }

    // 必须有文本内容或图片
    if ((!textContent.trim() && !hasImages) || isStreaming.value) {
      return
    }

    const trimmed = textContent.trim()
    const parsedSlashCommand = parseSlashCommand(trimmed)
    const isActualSlashCommand = getLeadingSlashInputKind(trimmed) === 'slash-command'

    // 本地 slash 命令拦截（仅对纯文本消息）
    if (slashCommandsReady.value && isActualSlashCommand && parsedSlashCommand.isSlashCommand) {
      // /clear 比较特殊，不添加到消息列表（因为会重建 session）
      if (parsedSlashCommand.lowerName === '/clear') {
        return await handleLocalSlashCommand(parsedSlashCommand)
      }
      addUserMessage(trimmed)
      if (await handleLocalSlashCommand(parsedSlashCommand)) {
        return
      }
      // 未识别的 slash 命令，照常发送给 SDK
    }

    error.value = null
    isRestored.value = false
    isInterrupting.value = false  // 重置中断标志，允许正常队列消费
    beginCurrentTurn({
      slashCommandName: isActualSlashCommand && parsedSlashCommand.isSlashCommand
        ? parsedSlashCommand.lowerName
        : ''
    })

    // 添加用户消息到界面
    if (trimmed && !isActualSlashCommand) {
      // 有文字内容，传递图片数据（如果有）
      addUserMessage(trimmed, hasImages ? originalMessage.images : null)
    } else if (hasImages && !trimmed) {
      // 只有图片，没有文字，显示 [图片] 但附加图片数据
      addUserMessage('[图片]', originalMessage.images)
    }

    // 第一条用户消息 → 自动设为对话标题（截取前10个字符）
    const userMessages = messages.value.filter(m => m.role === MessageRole.USER)
    if (userMessages.length === 1 && trimmed && !isActualSlashCommand && !trimmed.startsWith('@')) {
      const autoTitle = trimmed.length > 10 ? trimmed.slice(0, 10) + '…' : trimmed
      agentApi?.renameAgentSession?.({ sessionId, title: autoTitle }).catch(() => {})
    } else if (userMessages.length === 1 && hasImages && !trimmed) {
      // 第一条消息是纯图片，标题设为 [图片]
      agentApi?.renameAgentSession?.({ sessionId, title: '[图片]' }).catch(() => {})
    }

    isStreaming.value = true
    currentStreamText.value = ''
    startTimer()

    const sendOptions = {
      sessionId,
      message: originalMessage,  // 发送原始消息（可能包含图片）
      // 每次都传当前选择的模型，确保：
      // 1. 新建 query 时使用正确模型
      // 2. push 到现有队列前自动 setModel()
      model: resolveSendModel()
    }

    try {
      console.log('[useAgentChat] sendMessage dispatch:', {
        sessionId,
        requestedModel: sendOptions.model || null,
        hasActiveSession: hasActiveSession.value,
        messageKind: typeof originalMessage === 'string' ? 'text' : 'multimodal',
        imageCount: Array.isArray(originalMessage?.images) ? originalMessage.images.length : 0
      })
      await agentApi.sendAgentMessage(sendOptions)
    } catch (err) {
      console.error('[useAgentChat] sendMessage error:', err)
      error.value = err.message || 'Failed to send message'
      isStreaming.value = false
      stopTimer()
      resetCurrentTurn()
    }
  }

  /**
   * 取消生成（使用 interrupt，不杀 CLI 进程）
   */
  const cancelGeneration = async () => {
    try {
      // CRITICAL: 先设置中断标志，阻止队列自动消费
      isInterrupting.value = true
      console.log('[useAgentChat] 🛑 User interrupting, blocking auto-consume')
      await agentApi.cancelAgentGeneration(sessionId)
      return true
    } catch (err) {
      console.error('[useAgentChat] cancel error:', err)
      isInterrupting.value = false  // 取消失败，重置标志
      return false
    }
  }

  /**
   * 处理 init 事件（获取可用 slash 命令等）
   */
  const handleInit = (data) => {
    if (data.sessionId !== sessionId) return

    hasActiveSession.value = true
    isRestored.value = false

    if (slashCommandsEnabled && data.slashCommands && Array.isArray(data.slashCommands)) {
      void refreshSupportedSlashCommands(data.slashCommands)
    }
  }

  /**
   * 处理 SDK 流式消息事件
   */
  const handleMessage = (data) => {
    if (data.sessionId !== sessionId) return
    const msg = data.message
    if (!msg) return

    if (msg.type === 'tool_result' && msg.toolResult) {
      updateToolMessageOutput(msg.parentToolUseId || msg.toolUseId || null, msg.toolResult)
      return
    }

    // msg.content 是完整 assistant 消息的 content 块数组
    const blocks = msg.content || []
    for (const block of blocks) {
      if (block.type === 'tool_use') {
        if (block.name === 'AskUserQuestion') continue
        addToolMessage(block.name, block.input, null, {
          toolUseId: block.id || block.tool_use_id || block.toolUseID || null
        })
      } else if (block.type === 'text' && !streamTextReceived && block.text) {
        // 慢速/非流式 API 场景：没有收到流式 token，直接从完整消息添加文本
        addAssistantMessage(block.text)
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
        streamTextReceived = true  // 标记本轮收到了流式文本
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

    // 重置流式标记，为下一轮对话做准备
    streamTextReceived = false

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
      // 如果是用户主动中断，显示友好消息而不是错误
      if (isInterrupting.value) {
        console.log('[useAgentChat] 🛑 User interrupted, showing friendly message')
        error.value = t('agent.outputInterrupted')  // 友好提示，不是错误
        isInterrupting.value = false  // 重置标志，允许下次正常队列消费
      } else {
        // 真正的错误，显示错误消息
        error.value = result.error || result.result || 'Unknown error'
      }
      resetCurrentTurn()
      return
    }

    if (!currentTurnHasVisibleOutput) {
      const fallbackText = summarizeResultText(result?.result)
      if (fallbackText) {
        addSystemMessage(fallbackText, { systemKind: 'result' })
      } else if (currentTurnSlashCommand) {
        addSystemMessage(t('agent.commandCompleted', { command: currentTurnSlashCommand }), {
          systemKind: 'result'
        })
      }
    }

    resetCurrentTurn()
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
    'SESSION_IN_USE_BY_TERMINAL': () => t('session.sessionInUseByTerminal')
  }

  const handleError = (data) => {
    if (data.sessionId !== sessionId) return
    isStreaming.value = false
    stopTimer()
    streamTextReceived = false
    resetCurrentTurn()
    const rawError = data.error || t('agent.unknownError')
    const resolver = ERROR_MESSAGES[rawError]
    error.value = typeof resolver === 'function' ? resolver() : (resolver || rawError)
  }

  const handleCliError = (data) => {
    if (data.sessionId !== sessionId) return

    const stderr = typeof data.stderr === 'string' ? data.stderr.trim() : ''
    const exitCode = Number.isFinite(data.exitCode) ? data.exitCode : null

    if (stderr) {
      error.value = stderr
      resetCurrentTurn()
      return
    }

    error.value = exitCode == null
      ? 'Claude Code CLI exited unexpectedly'
      : `Claude Code CLI exited unexpectedly (code ${exitCode})`
    resetCurrentTurn()
  }

  /**
   * 处理状态变化事件（统一管理 streaming/idle 状态）
   */
  const handleStatusChange = (data) => {
    if (data.sessionId !== sessionId) return

    console.log('[useAgentChat] statusChange:', {
      sessionId,
      status: data.status || null,
      cliExited: !!data.cliExited,
      cliExitWasError: !!data.cliExitWasError
    })

    if (data.status === 'idle' || data.status === 'error') {
      isStreaming.value = false
      stopTimer()
      streamTextReceived = false
      // flush 未完成的流式文本
      if (currentStreamText.value) {
        addAssistantMessage(currentStreamText.value)
        currentStreamText.value = ''
      }
      // CLI 进程退出时重置标记，下次发消息会重建 query
      if (data.cliExited) {
        hasActiveSession.value = false
        isRestored.value = true
      }
      if (data.activeSessionEnded) {
        hasActiveSession.value = false
        isRestored.value = true
      }
      resetCurrentTurn()
    } else if (data.status === 'streaming') {
      hasActiveSession.value = true
      isRestored.value = false
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
    addSystemMessage(
      t('agent.compactCompleted', {
        count: Number.isFinite(data.preTokens) ? data.preTokens : 0,
        trigger: data.trigger || 'manual'
      }),
      { systemKind: 'compact' }
    )
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
      await agentApi.compactAgentConversation(sessionId)
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
    const toolUseId = data.toolUseId || null
    let toolMessage = toolUseId
      ? [...messages.value].reverse().find(msg => msg.role === MessageRole.TOOL && msg.toolUseId === toolUseId)
      : null

    if (!toolMessage) {
      addToolMessage(data.toolName || 'Tool', null, null, { toolUseId })
      toolMessage = toolUseId
        ? [...messages.value].reverse().find(msg => msg.role === MessageRole.TOOL && msg.toolUseId === toolUseId)
        : [...messages.value].reverse().find(msg => msg.role === MessageRole.TOOL)
    }

    if (toolMessage) {
      if (data.toolName && !toolMessage.toolName) {
        toolMessage.toolName = data.toolName
      }
      if (Number.isFinite(data.elapsedSeconds)) {
        toolMessage.elapsedSeconds = data.elapsedSeconds
        toolMessage.progressText = formatElapsedSeconds(data.elapsedSeconds)
      }
      toolMessage.inProgress = !toolMessage.output
      markCurrentTurnVisible()
    }
  }

  const handleSystemStatus = (data) => {
    if (data.sessionId !== sessionId) return

    const statusText = summarizeSystemStatus(data.status)
    if (!statusText) return

    const fingerprint = statusText.toLowerCase()
    if (fingerprint === lastSystemStatusFingerprint) return
    lastSystemStatusFingerprint = fingerprint

    if (isTransientSystemStatus(statusText)) return

    addSystemMessage(statusText, { systemKind: 'status' })
  }

  const handleOtherMessage = (data) => {
    if (data.sessionId !== sessionId) return

    const summary = summarizeOtherMessage(data.message)
    if (!summary) return

    addSystemMessage(summary, { systemKind: 'sdk' })
  }

  const handleInteractionRequest = (data) => {
    if (data.sessionId !== sessionId) return
    if (!data.interaction) return
    upsertInteractionMessage(data.interaction, null)
  }

  const handleInteractionResolved = (data) => {
    if (data.sessionId !== sessionId) return
    if (!data.interactionId) return
    upsertInteractionMessage({ interactionId: data.interactionId }, data.output || null)
  }

  const submitInteractionAnswer = async ({ interactionId, answers, questions, annotations, updatedInput, updatedPermissions, decisionClassification, behavior }) => {
    if (!agentApi?.respondAgentInteraction) return { error: 'Interaction API unavailable' }
    try {
      const plainAnswers = answers ? JSON.parse(JSON.stringify(answers)) : []
      const plainQuestions = questions ? JSON.parse(JSON.stringify(questions)) : []
      const plainAnnotations = annotations ? JSON.parse(JSON.stringify(annotations)) : undefined
      const plainUpdatedInput = updatedInput ? JSON.parse(JSON.stringify(updatedInput)) : undefined
      const plainUpdatedPermissions = updatedPermissions ? JSON.parse(JSON.stringify(updatedPermissions)) : undefined
      const result = await agentApi.respondAgentInteraction({
        sessionId,
        interactionId,
        answers: plainAnswers,
        questions: plainQuestions,
        annotations: plainAnnotations,
        updatedInput: plainUpdatedInput,
        updatedPermissions: plainUpdatedPermissions,
        decisionClassification,
        behavior
      })
      return result || { success: true }
    } catch (err) {
      console.error('[useAgentChat] submitInteractionAnswer error:', err)
      return { error: err.message || 'Failed to submit interaction answer' }
    }
  }

  const cancelInteraction = async ({ interactionId, reason }) => {
    if (!agentApi?.cancelAgentInteraction) return { error: 'Interaction API unavailable' }
    try {
      const result = await agentApi.cancelAgentInteraction({
        sessionId,
        interactionId,
        reason
      })
      return result || { success: true }
    } catch (err) {
      console.error('[useAgentChat] cancelInteraction error:', err)
      return { error: err.message || 'Failed to cancel interaction' }
    }
  }

  /**
   * 提前注册流式相关监听器（在 loadMessages 之前调用）
   * 避免钉钉消息触发时 streaming 事件已发出但监听器尚未注册
   */
  const setupStreamListeners = () => {
    if (!agentApi) return

    if (agentApi.onAgentInit) {
      cleanupFns.push(agentApi.onAgentInit(handleInit))
    }
    if (agentApi.onAgentMessage) {
      cleanupFns.push(agentApi.onAgentMessage(handleMessage))
    }
    if (agentApi.onAgentStream) {
      cleanupFns.push(agentApi.onAgentStream(handleStream))
    }
    if (agentApi.onAgentResult) {
      cleanupFns.push(agentApi.onAgentResult(handleResult))
    }
    if (agentApi.onAgentError) {
      cleanupFns.push(agentApi.onAgentError(handleError))
    }
    if (agentApi.onAgentCliError) {
      cleanupFns.push(agentApi.onAgentCliError(handleCliError))
    }
    if (agentApi.onAgentToolProgress) {
      cleanupFns.push(agentApi.onAgentToolProgress(handleToolProgress))
    }
    if (agentApi.onAgentSystemStatus) {
      cleanupFns.push(agentApi.onAgentSystemStatus(handleSystemStatus))
    }
    if (agentApi.onAgentOtherMessage) {
      cleanupFns.push(agentApi.onAgentOtherMessage(handleOtherMessage))
    }
    if (agentApi.onAgentStatusChange) {
      cleanupFns.push(agentApi.onAgentStatusChange(handleStatusChange))
    }
    if (agentApi.onAgentCompacted) {
      cleanupFns.push(agentApi.onAgentCompacted(handleCompacted))
    }
    if (agentApi.onAgentUsage) {
      cleanupFns.push(agentApi.onAgentUsage(handleUsage))
    }
    if (agentApi.onAgentInteractionRequest) {
      cleanupFns.push(agentApi.onAgentInteractionRequest(handleInteractionRequest))
    }
    if (agentApi.onAgentInteractionResolved) {
      cleanupFns.push(agentApi.onAgentInteractionResolved(handleInteractionResolved))
    }
    // macOS: 窗口重建后所有 Agent 会话已关闭，重置前端状态
    if (agentApi.onAgentAllSessionsClosed) {
      cleanupFns.push(agentApi.onAgentAllSessionsClosed(() => {
        isStreaming.value = false
        hasActiveSession.value = false
      }))
    }
  }

  /**
   * 注册外部 IM 消息监听器（钉钉/微信/飞书统一适配）
   */
  const setupExternalImMessageListeners = () => {
    setupExternalImListeners(sessionId, messages, cleanupFns)
  }

  /**
   * 注册钉钉消息监听器（在 loadMessages 之后调用，避免与历史加载竞争）
   * @deprecated 请使用 setupExternalImMessageListeners
   */
  const setupDingTalkListeners = () => {
    setupExternalImListeners(sessionId, messages, cleanupFns, ['dingtalk'])
  }

  /**
   * @deprecated 请使用 setupExternalImMessageListeners
   */
  const setupWeixinListeners = () => {
    setupExternalImListeners(sessionId, messages, cleanupFns, ['weixin'])
  }

  // 向后兼容：保留 setupListeners 供外部调用（已拆分为两步）
  const setupListeners = () => {
    setupStreamListeners()
    setupExternalImMessageListeners()
  }

  /**
   * 从配置读取模型
   * @param {string} [apiProfileId] - 会话绑定的 profile ID，不传则使用默认 profile
   * @param {string} [preferredModelId] - notebook/session 级别的模型覆盖
   */
  const initDefaultModel = async (apiProfileId, preferredModelId = null) => {
    const token = ++modelInitToken
    try {
      if (!window.electronAPI?.getConfig) return false
      const config = await window.electronAPI.getConfig()
      if (!config?.apiProfiles) return false
      // 优先使用会话绑定的 profile，否则回退到默认 profile
      const profileId = apiProfileId || config.defaultProfileId
      const profile = config.apiProfiles.find(p => p.id === profileId)
        || config.apiProfiles.find(p => p.id === config.defaultProfileId)
      if (profile) {
        const nextModelOptions = buildModelOptions(profile, config)
        const normalizedPreferredModelId = normalizeModelValue(preferredModelId)
        const preferredModelExists = normalizedPreferredModelId
          ? nextModelOptions.some(option => option?.value === normalizedPreferredModelId)
          : false
        const nextSelectedModel = preferredModelExists
          ? normalizedPreferredModelId
          : normalizeModelValue(profile.selectedModelId)
        if (token !== modelInitToken) return false
        modelOptions.value = nextModelOptions
        selectedModelChangeSource = 'bootstrap'
        selectedModel.value = nextSelectedModel
        return true
      }
    } catch (err) {
      console.warn('[useAgentChat] Failed to load default model from config:', err)
    }
    return false
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
    applyUserSelectedModel,
    streamingElapsed,
    contextTokens,
    isCompacting,
    slashCommands,
    modelOptions,
    totalCostUsd,
    numTurns,
    isInterrupting,  // 暴露中断标志供父组件检查
    hasActiveSession,  // 暴露激活状态供父组件判断
    loadMessages,
    sendMessage,
    cancelGeneration,
    submitInteractionAnswer,
    cancelInteraction,
    compactConversation,
    triggerScheduledTaskDraft,
    submitScheduledTaskDraft,
    cancelScheduledTaskDraft,
    syncActiveSessionState,
    setupStreamListeners,
    setupDingTalkListeners,
    setupWeixinListeners,
    setupExternalImMessageListeners,
    setupListeners,
    initDefaultModel,
    cleanup
  }
}


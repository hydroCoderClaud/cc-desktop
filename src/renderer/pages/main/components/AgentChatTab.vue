<template>
  <div class="agent-chat-tab" v-show="visible">
    <!-- 消息列表 -->
    <div class="messages-list" ref="messagesListRef">
      <!-- 欢迎引导（无消息且未在流式输出时显示） -->
      <div v-if="messages.length === 0 && !isStreaming" class="welcome-guide">
        <div class="welcome-icon">
          <Icon name="robot" :size="48" />
        </div>
        <h3 class="welcome-title">{{ t('agent.welcomeTitle') }}</h3>
        <p class="welcome-desc">{{ t('agent.welcomeDesc') }}</p>
        <div class="welcome-hints">
          <div class="hint-item" v-for="(hint, i) in welcomeHints" :key="i" @click="handleSend(hint)">
            <Icon name="send" :size="14" class="hint-icon" />
            <span>{{ hint }}</span>
          </div>
        </div>
      </div>

      <template v-for="msg in messages" :key="msg.id">
        <!-- 用户/助手消息 -->
        <MessageBubble
          v-if="msg.role === 'user' || msg.role === 'assistant'"
          :message="msg"
          :session-cwd="sessionCwd"
          @preview-image="$emit('preview-image', $event)"
          @preview-link="$emit('preview-link', $event)"
          @preview-path="emitPreviewPath"
        />
        <!-- 工具调用 / 宿主交互 -->
        <AskUserQuestionCard
          v-else-if="msg.role === 'tool' && (msg.toolName === 'AskUserQuestion' || msg.input?.kind === 'permission_request')"
          :message="msg"
          :submitting="Boolean(interactionSubmitting[msg.input?.interactionId])"
          @submit="handleInteractionSubmit"
          @cancel="handleInteractionCancel"
        />
        <ScheduledTaskDraftCard
          v-else-if="msg.role === 'tool' && msg.toolName === 'ScheduledTaskDraft'"
          :message="msg"
          :submitting="Boolean(scheduledTaskSubmitting[msg.id])"
          @submit="handleScheduledTaskDraftSubmit"
          @cancel="handleScheduledTaskDraftCancel"
        />
        <ToolCallCard
          v-else-if="msg.role === 'tool'"
          :message="msg"
          @preview-image="$emit('preview-image', $event)"
          @preview-path="emitPreviewPath"
        />
      </template>

      <!-- 历史会话恢复提示 -->
      <div v-if="isRestored && !isStreaming && messages.length > 0 && !isExternalObserveSession" class="restored-divider">
        <span class="restored-line"></span>
        <span class="restored-text">{{ t('agent.restoredHint') }}</span>
        <span class="restored-line"></span>
      </div>

      <!-- 流式输出指示器 -->
      <StreamingIndicator
        :visible="isStreaming"
        :text="currentStreamText"
        :elapsed="streamingElapsed"
      />

      <!-- 错误提示 -->
      <div v-if="error" class="error-banner">
        <Icon name="xCircle" :size="16" />
        <span>{{ error }}</span>
      </div>

      <!-- 滚动锚点 -->
      <div ref="scrollAnchor"></div>
    </div>

    <!-- 提示条：根据会话状态显示不同提示 -->
    <div v-if="sessionType === 'dingtalk'" class="dingtalk-observe-bar">
      <Icon name="dingtalk" :size="14" />
      <span>{{ t('agent.dingtalkObserving') }}</span>
    </div>
    <div v-else-if="sessionType === 'weixin'" class="dingtalk-observe-bar">
      <Icon name="chat" :size="14" />
      <span>{{ t('agent.weixinObserving') }}</span>
    </div>
    <div v-else-if="!hasActiveSession" class="status-hint-bar">
      <Icon name="info" :size="14" />
      <span>{{ t('agent.historyHint') }}</span>
    </div>

    <!-- 输入框 -->
    <ChatInput
      ref="chatInputRef"
      :is-streaming="isStreaming"
      :disabled="false"
      :queue-enabled="queueEnabled"
      :placeholder="queueEnabled ? t('agent.inputPlaceholder') : t('agent.inputPlaceholderDisabled')"
      :context-tokens="contextTokens"
      :slash-commands="slashCommands"
      :slash-commands-supported="!isExternalObserveSession"
      :enable-slash-commands="!isExternalObserveSession && hasActiveSession"
      :model-options="modelOptions"
      :session-id="props.sessionId"
      :session-type="props.sessionType"
      v-model:model-value="selectedModel"
      @send="handleSend"
      @schedule="handleScheduleDraftCreate"
      @cancel="handleCancel"
      @update:queue-enabled="handleToggleQueue"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useAgentChat } from '@composables/useAgentChat'
import { useAutoScrollToBottom } from '@composables/useAutoScrollToBottom'
import { isSessionClosed, unmarkSessionClosed } from '@composables/useAgentPanel'
import { extractToolResultFilePaths } from '@utils/mcp-tool-result'
import MessageBubble from './agent/MessageBubble.vue'
import ToolCallCard from './agent/ToolCallCard.vue'
import AskUserQuestionCard from './agent/AskUserQuestionCard.vue'
import ScheduledTaskDraftCard from './agent/ScheduledTaskDraftCard.vue'
import StreamingIndicator from './agent/StreamingIndicator.vue'
import ChatInput from './agent/ChatInput.vue'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  sessionId: {
    type: String,
    required: true
  },
  sessionType: {
    type: String,
    default: 'chat'  // 'chat' | 'dingtalk' | 'weixin'
  },
  sessionCwd: {
    type: String,
    default: null
  },
  visible: {
    type: Boolean,
    default: true
  },
  apiProfileId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['ready', 'preview-image', 'preview-link', 'preview-path', 'agent-done', 'request-clear-session'])

// 使用 Agent 对话 composable
const {
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
  modelOptions,
  isInterrupting,  // 中断标志，用于阻止队列自动消费
  hasActiveSession,  // 激活状态，用于显示提示文字
  loadMessages,
  sendMessage,
  cancelGeneration,
  submitInteractionAnswer,
  cancelInteraction,
  submitScheduledTaskDraft,
  cancelScheduledTaskDraft,
  compactConversation,
  triggerScheduledTaskDraft,
  syncActiveSessionState,
  setupStreamListeners,
  setupDingTalkListeners,
  setupWeixinListeners,
  setupListeners,
  initDefaultModel,
  cleanup
} = useAgentChat(props.sessionId, {
  enableSlashCommands: !['dingtalk', 'weixin'].includes(props.sessionType),
  sessionCwd: props.sessionCwd,
  apiProfileId: props.apiProfileId,
  onClearRequested: () => {
    emit('request-clear-session')
  }
})

const isExternalObserveSession = computed(() => ['dingtalk', 'weixin'].includes(props.sessionType))

// 消息队列开关（从配置读取）
const queueEnabled = ref(true)
const loadQueueSetting = async () => {
  try {
    const config = await window.electronAPI?.getConfig()
    if (config?.settings?.agent?.messageQueue !== undefined) {
      queueEnabled.value = config.settings.agent.messageQueue
    }
  } catch {}
}

// 工具栏切换队列开关 — 同时持久化到配置
const handleToggleQueue = async (enabled) => {
  queueEnabled.value = enabled
  try {
    const config = await window.electronAPI?.getConfig()
    if (config?.settings?.agent) {
      config.settings.agent.messageQueue = enabled
      await window.electronAPI?.saveConfig(JSON.parse(JSON.stringify(config)))
    }
  } catch (err) {
    console.error('Failed to save queue setting:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

// 欢迎引导提示词
const welcomeHints = computed(() => [
  t('agent.hintTranslate'),
  t('agent.hintSummarize'),
  t('agent.hintCode'),
  t('agent.hintAnalyze')
])

const messagesListRef = ref(null)
const scrollAnchor = ref(null)
const chatInputRef = ref(null)
const interactionSubmitting = ref({})
const scheduledTaskSubmitting = ref({})
const {
  scrollToBottom,
  onContainerScroll: onMessagesScroll,
  startAutoScrollObservers,
  stopAutoScrollObservers
} = useAutoScrollToBottom({
  containerRef: messagesListRef,
  anchorRef: scrollAnchor,
  itemsRef: messages,
  streamingTextRef: currentStreamText,
  isStreamingRef: isStreaming
})

// 发送消息 → 强制回到底部
const handleSend = async (text) => {
  await sendMessage(text)
  scrollToBottom(false, true)
}

// 取消生成（只停止当前输出，保留队列）
const handleCancel = async () => {
  await cancelGeneration()
  // 注意：不清空队列！队列面板有独立的"清空全部"按钮供用户使用
}

const handleScheduleDraftCreate = (prompt = '') => {
  triggerScheduledTaskDraft(typeof prompt === 'string' ? prompt : '')
  scrollToBottom(false, true)
}

const setInteractionSubmitting = (interactionId, submitting) => {
  if (!interactionId) return
  const next = { ...interactionSubmitting.value }
  if (submitting) {
    next[interactionId] = true
  } else {
    delete next[interactionId]
  }
  interactionSubmitting.value = next
}

const setScheduledTaskSubmitting = (messageId, submitting) => {
  if (!messageId) return
  const next = { ...scheduledTaskSubmitting.value }
  if (submitting) {
    next[messageId] = true
  } else {
    delete next[messageId]
  }
  scheduledTaskSubmitting.value = next
}

const handleInteractionSubmit = async ({ interactionId, answers, questions, annotations, updatedInput, updatedPermissions, decisionClassification, behavior }) => {
  if (!interactionId || interactionSubmitting.value[interactionId]) return

  setInteractionSubmitting(interactionId, true)
  try {
    const result = await submitInteractionAnswer({
      interactionId,
      answers,
      questions,
      annotations,
      updatedInput,
      updatedPermissions,
      decisionClassification,
      behavior
    })
    if (result?.error) {
      message.error(result.error)
    }
  } finally {
    setInteractionSubmitting(interactionId, false)
  }
}

const handleInteractionCancel = async ({ interactionId }) => {
  if (!interactionId || interactionSubmitting.value[interactionId]) return

  setInteractionSubmitting(interactionId, true)
  try {
    const result = await cancelInteraction({ interactionId, reason: 'User cancelled the question' })
    if (result?.error) {
      message.error(result.error)
    }
  } finally {
    setInteractionSubmitting(interactionId, false)
  }
}

const handleScheduledTaskDraftSubmit = async ({ messageId, draft }) => {
  if (!messageId || scheduledTaskSubmitting.value[messageId]) return

  setScheduledTaskSubmitting(messageId, true)
  try {
    const result = await submitScheduledTaskDraft({ messageId, draft })
    if (result?.error) {
      message.error(result.error)
      return
    }
    message.success(t('agent.scheduleDraftCreatedToast', { name: result?.task?.name || draft?.name || '' }))
    if (result?.runError) {
      message.warning(`${t('rightPanel.scheduledTasks.runFailed')}: ${result.runError}`)
    }
  } finally {
    setScheduledTaskSubmitting(messageId, false)
  }
}

const handleScheduledTaskDraftCancel = async ({ messageId }) => {
  if (!messageId || scheduledTaskSubmitting.value[messageId]) return

  setScheduledTaskSubmitting(messageId, true)
  try {
    const result = await cancelScheduledTaskDraft({ messageId })
    if (result?.error) {
      message.error(result.error)
    }
  } finally {
    setScheduledTaskSubmitting(messageId, false)
  }
}

const emitPreviewPath = (filePath) => {
  emit('preview-path', {
    filePath,
    sessionId: props.sessionId
  })
}

// --- 卸载标志：防止在组件卸载过程中触发消息发送 ---
let isUnmounting = false

// --- 队列自动消费：提取公共逻辑避免重复 ---
const tryAutoConsumeQueue = () => {
  // CRITICAL: 如果会话已关闭，不发送新消息（避免会话重启）
  if (isSessionClosed(props.sessionId)) {
    console.log('[AgentChatTab] 🚫 Skip auto-send - session is closed')
    return
  }
  // 如果组件正在卸载，不发送新消息（避免会话重启）
  if (isUnmounting) {
    console.log('[AgentChatTab] 🚫 Skip auto-send - component is unmounting')
    return
  }
  nextTick(async () => {
    const next = chatInputRef.value?.dequeue()
    if (next) {
      await handleSend(next)
    }
  })
}

// --- streaming 结束时通知父组件刷新文件树，并带出本轮生成的文件路径 ---
watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    const msgs = messages.value
    let startIdx = msgs.length - 1
    while (startIdx > 0 && msgs[startIdx].role !== 'user') startIdx--
    const filePaths = []
    for (let i = startIdx + 1; i < msgs.length; i++) {
      const msg = msgs[i]
      // Claude Code 工具：从 input.file_path 提取
      const fp = msg.input?.file_path || msg.input?.filePath
      if (fp) filePaths.push(fp)
      // MCP 工具结构化输出：提取标准 tool_result/resource_link 返回的文件路径
      if (msg.output) {
        extractToolResultFilePaths(msg.output).forEach(p => filePaths.push(p))
      }
      // 助手文本 / MCP 工具：从回复内容中提取绝对路径
      if (msg.content) {
        const unixPaths = msg.content.match(/\/(?:[\w\-. ]+\/)+[\w\-. ]+\.[\w]{1,10}/g) || []
        const winPaths = msg.content.match(/[A-Za-z]:\\(?:[\w\-. ]+\\)+[\w\-. ]+\.[\w]{1,10}/g) || []
        unixPaths.concat(winPaths).forEach(p => filePaths.push(p))
      }
    }
    emit('agent-done', {
      sessionId: props.sessionId,
      filePaths: [...new Set(filePaths)]
    })
  }
})

// --- 消息队列自动发送：流式正常结束后自动消费队列 ---
const streamingWatchStop = watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming && queueEnabled.value) {
    // CRITICAL: 用户中断时不自动消费，避免立即发送下一条
    if (isInterrupting.value) {
      console.log('[AgentChatTab] 🛑 User interrupted, skip auto-consume')
      return
    }
    // 流式刚结束 — 如果有错误，暂停队列消费，避免连环出错
    if (error.value) return
    tryAutoConsumeQueue()
  }
})

// --- 队列开关：从关闭切换到启用时，自动消费队列 ---
const queueEnabledWatchStop = watch(queueEnabled, (enabled, wasEnabled) => {
  // 从 false → true，且不在流式输出中，且队列有消息
  if (!wasEnabled && enabled && !isStreaming.value) {
    tryAutoConsumeQueue()
  }
})

// --- 队列持久化：监听队列变化自动保存 ---
let saveQueueTimer = null
let queueWatchStop = null

const startQueuePersistence = () => {
  if (queueWatchStop) return  // 避免重复监听
  if (!chatInputRef.value?.messageQueue) {
    console.error('[AgentChatTab] ❌ Cannot start queue persistence: chatInputRef or messageQueue not ready')
    return
  }

  console.log('[AgentChatTab] 🚀 Starting queue persistence watch for session:', props.sessionId)
  console.log('[AgentChatTab] 🔍 Initial queue state:', chatInputRef.value.messageQueue)

  // defineExpose 会自动解包 ref，所以 messageQueue 直接就是数组
  queueWatchStop = watch(
    () => chatInputRef.value?.messageQueue,  // 添加可选链，防止组件卸载时报错
    (newQueue, oldQueue) => {
      // 组件卸载时 chatInputRef.value 可能为 null，直接忽略
      if (!chatInputRef.value) {
        return
      }

      console.log('[AgentChatTab] 📝 Queue changed:', {
        oldLength: oldQueue?.length || 0,
        newLength: newQueue?.length || 0,
        sessionId: props.sessionId,
        newQueue
      })

      // 忽略 undefined 值（组件卸载时触发）
      if (newQueue === undefined) {
        console.log('[AgentChatTab] ⏭️ Skip save - queue is undefined (component unmounting?)')
        return
      }

      // 防抖保存（避免高频变化时频繁写入数据库）
      if (saveQueueTimer) clearTimeout(saveQueueTimer)
      saveQueueTimer = setTimeout(async () => {
        // CRITICAL: 即使队列为空也要保存，确保数据库与前端状态同步
        // 用户点击停止清空队列时，必须清空数据库中的队列，否则重新打开会话时队列又出现
        try {
          const plainQueue = newQueue ? JSON.parse(JSON.stringify(newQueue)) : []  // 深拷贝避免 Proxy
          await window.electronAPI?.saveAgentQueue({
            sessionId: props.sessionId,
            queue: plainQueue
          })
          console.log('[AgentChatTab] ✅ Saved queue:', plainQueue.length, 'messages', plainQueue)
        } catch (err) {
          console.error('[AgentChatTab] ❌ Failed to save queue:', err)
        }
      }, 300)
    },
    { deep: true }  // 必须 deep: true 才能追踪数组内部变化
  )
}

// 窗口获焦时重新读取队列开关（同步全局设置页面的修改）
// 添加 500ms 防抖，避免频繁切换窗口时重复读取
let focusDebounceTimer = null
const onWindowFocus = () => {
  if (focusDebounceTimer) clearTimeout(focusDebounceTimer)
  focusDebounceTimer = setTimeout(() => {
    loadQueueSetting()
  }, 500)
}

onMounted(async () => {
  // 先注册流式监听器，再加载历史消息，确保钉钉第一条消息的 streaming 事件不被错过
  setupStreamListeners()
  await loadQueueSetting()
  await initDefaultModel(props.apiProfileId)  // 从配置读取会话绑定的模型
  await loadMessages()  // 加载历史消息
  await syncActiveSessionState()

  setupDingTalkListeners()  // 钉钉监听器在历史加载后注册，避免与 loadMessages 竞争
  setupWeixinListeners()
  // 绑定滚动事件检测用户手动滚动
  if (messagesListRef.value) {
    messagesListRef.value.addEventListener('scroll', onMessagesScroll, { passive: true })
  }
  startAutoScrollObservers()
  window.addEventListener('focus', onWindowFocus)

  // 恢复持久化队列（需要等待 chatInputRef 准备好）
  await nextTick()  // 确保 ChatInput 组件已渲染

  try {
    const result = await window.electronAPI?.getAgentQueue(props.sessionId)
    console.log('[AgentChatTab] 📖 Loading queue for session:', props.sessionId, result)
    console.log('[AgentChatTab] 🔍 chatInputRef.value:', chatInputRef.value)
    console.log('[AgentChatTab] 🔍 chatInputRef.value?.messageQueue:', chatInputRef.value?.messageQueue)

    if (result?.success && result.queue?.length > 0 && chatInputRef.value) {
      // defineExpose 自动解包，messageQueue 直接是数组，替换整个数组
      chatInputRef.value.messageQueue.splice(0, chatInputRef.value.messageQueue.length, ...result.queue)
      console.log('[AgentChatTab] ✅ Restored queue:', result.queue.length, 'messages', result.queue)

      // CRITICAL: 清除关闭标记，允许队列自动消费
      unmarkSessionClosed(props.sessionId)
    } else {
      console.log('[AgentChatTab] ⏭️ No queue to restore, reasons:', {
        hasResult: !!result,
        success: result?.success,
        queueLength: result?.queue?.length,
        hasChatInputRef: !!chatInputRef.value
      })
    }
  } catch (err) {
    console.error('[AgentChatTab] ❌ Failed to load queue:', err)
  }

  // 启动队列持久化监听（必须在 chatInputRef 有值后）
  startQueuePersistence()

  scrollToBottom(true, true)
  emit('ready', { sessionId: props.sessionId })
})

// 在组件卸载前保存队列（此时子组件还存在）
onBeforeUnmount(async () => {
  console.log('[AgentChatTab] 🚪 Component before unmount, sessionId:', props.sessionId)

  // CRITICAL: 立即设置卸载标志，防止任何异步操作触发消息发送
  isUnmounting = true
  console.log('[AgentChatTab] 🚫 Set isUnmounting = true, blocking all message sends')

  // 立即停止所有 watch，防止卸载过程中触发异步操作
  if (queueWatchStop) {
    console.log('[AgentChatTab] 🛑 Stopping queue persistence watch')
    queueWatchStop()
  }
  if (streamingWatchStop) {
    console.log('[AgentChatTab] 🛑 Stopping streaming watch (auto-consume)')
    streamingWatchStop()
  }
  if (queueEnabledWatchStop) {
    console.log('[AgentChatTab] 🛑 Stopping queue enabled watch')
    queueEnabledWatchStop()
  }

  // 清除防抖，立即保存队列
  if (saveQueueTimer) {
    console.log('[AgentChatTab] ⏱️ Clearing pending save timer')
    clearTimeout(saveQueueTimer)
  }
  stopAutoScrollObservers()

  console.log('[AgentChatTab] 🔍 Checking queue before unmount:', {
    hasChatInputRef: !!chatInputRef.value,
    hasMessageQueue: !!chatInputRef.value?.messageQueue,
    queueValue: chatInputRef.value?.messageQueue,
    queueLength: chatInputRef.value?.messageQueue?.length
  })

  const currentQueue = chatInputRef.value?.messageQueue
  if (currentQueue && currentQueue.length > 0) {
    console.log('[AgentChatTab] 💾 Saving queue on beforeUnmount...')
    try {
      const plainQueue = JSON.parse(JSON.stringify(currentQueue))
      // CRITICAL: 使用 await 确保保存完成后再卸载
      await window.electronAPI?.saveAgentQueue({
        sessionId: props.sessionId,
        queue: plainQueue
      })
      console.log('[AgentChatTab] ✅ Saved queue on beforeUnmount:', plainQueue.length, 'messages')
    } catch (err) {
      console.error('[AgentChatTab] ❌ Failed to save queue on beforeUnmount:', err)
    }
  } else {
    console.log('[AgentChatTab] ⏭️ No queue to save on beforeUnmount')
  }
})

onUnmounted(() => {
  console.log('[AgentChatTab] 🗑️ Component unmounted, sessionId:', props.sessionId)

  if (messagesListRef.value) {
    messagesListRef.value.removeEventListener('scroll', onMessagesScroll)
  }
  window.removeEventListener('focus', onWindowFocus)
  if (focusDebounceTimer) clearTimeout(focusDebounceTimer)
  // watch 已在 onBeforeUnmount 中停止，无需重复
  cleanup()
})

defineExpose({
  focus: () => chatInputRef.value?.focus(),
  insertText: (text) => chatInputRef.value?.insertText(text)
})
</script>

<style scoped>
.agent-chat-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.messages-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 0;
}

/* Welcome Guide */
.welcome-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.welcome-icon {
  color: var(--primary-color);
  opacity: 0.7;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px;
}

.welcome-desc {
  font-size: 14px;
  color: var(--text-color-muted);
  margin: 0 0 24px;
  max-width: 400px;
  line-height: 1.6;
}

.welcome-hints {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 360px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
}

.hint-item:hover {
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.hint-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

/* Restored Divider */
.restored-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  margin: 8px 0;
}

.restored-line {
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.restored-text {
  font-size: 12px;
  color: var(--text-color-muted);
  white-space: nowrap;
}

/* 钉钉观察模式提示条 */
.dingtalk-observe-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--warning-bg);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

/* 历史信息提示条 */
.status-hint-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--info-bg);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  margin: 8px 16px;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.3);
  border-radius: 8px;
  color: #ff4d4f;
  font-size: 13px;
}
</style>

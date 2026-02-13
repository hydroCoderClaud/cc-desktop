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
        <MessageBubble v-if="msg.role === 'user' || msg.role === 'assistant'" :message="msg" />
        <!-- 工具调用 -->
        <ToolCallCard v-else-if="msg.role === 'tool'" :message="msg" />
      </template>

      <!-- 历史会话恢复提示 -->
      <div v-if="isRestored && messages.length > 0" class="restored-divider">
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

    <!-- 输入框 -->
    <ChatInput
      ref="chatInputRef"
      :is-streaming="isStreaming"
      :disabled="false"
      :queue-enabled="queueEnabled"
      :placeholder="isStreaming && queueEnabled ? t('agent.inputPlaceholderQueued') : t('agent.inputPlaceholder')"
      :context-tokens="contextTokens"
      :slash-commands="slashCommands"
      :active-model="activeModel"
      v-model:model-value="selectedModel"
      @send="handleSend"
      @cancel="handleCancel"
      @update:queue-enabled="handleToggleQueue"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useAgentChat } from '@composables/useAgentChat'
import MessageBubble from './agent/MessageBubble.vue'
import ToolCallCard from './agent/ToolCallCard.vue'
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
  visible: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['ready'])

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
  activeModel,
  loadMessages,
  sendMessage,
  cancelGeneration,
  compactConversation,
  setupListeners,
  initDefaultModel,
  cleanup
} = useAgentChat(props.sessionId)

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

// --- 智能滚动：用户手动上滚时暂停自动滚动 ---
const userAtBottom = ref(true)
const BOTTOM_THRESHOLD = 60 // 距底部 60px 以内视为"在底部"

const checkIfAtBottom = () => {
  const el = messagesListRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
}

const onMessagesScroll = () => {
  userAtBottom.value = checkIfAtBottom()
}

// 自动滚动到底部（仅在用户处于底部时触发，force=true 可强制滚动）
const scrollToBottom = (instant = false, force = false) => {
  if (!force && !userAtBottom.value) return
  nextTick(() => {
    if (scrollAnchor.value) {
      scrollAnchor.value.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' })
    }
    userAtBottom.value = true
  })
}

// 新消息添加 → 仅在用户处于底部时平滑滚动
watch(messages, () => {
  scrollToBottom()
})

// 流式文本变化 → 节流滚动（高频场景，每 100ms 最多触发一次）
let lastScrollTime = 0
const SCROLL_THROTTLE_MS = 100
watch(currentStreamText, () => {
  if (!userAtBottom.value) return
  const now = Date.now()
  if (now - lastScrollTime >= SCROLL_THROTTLE_MS) {
    lastScrollTime = now
    scrollToBottom(true)
  }
})

// 发送消息 → 强制回到底部
const handleSend = async (text) => {
  await sendMessage(text)
  scrollToBottom(false, true)
}

// 取消生成（同时清空队列）
const handleCancel = async () => {
  chatInputRef.value?.clearQueue()
  await cancelGeneration()
}

// --- 消息队列自动发送：流式正常结束后自动消费队列 ---
watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming && queueEnabled.value) {
    // 流式刚结束 — 如果有错误，暂停队列消费，避免连环出错
    if (error.value) return
    nextTick(async () => {
      const next = chatInputRef.value?.dequeue()
      if (next) {
        await handleSend(next)
      }
    })
  }
})

// --- 队列开关：从关闭切换到启用时，自动消费队列 ---
watch(queueEnabled, (enabled, wasEnabled) => {
  // 从 false → true，且不在流式输出中，且队列有消息
  if (!wasEnabled && enabled && !isStreaming.value) {
    nextTick(async () => {
      const next = chatInputRef.value?.dequeue()
      if (next) {
        await handleSend(next)
      }
    })
  }
})

// --- 队列持久化：监听队列变化自动保存 ---
let saveQueueTimer = null
watch(() => chatInputRef.value?.messageQueue.value, (newQueue) => {
  // 防抖保存（避免高频变化时频繁写入数据库）
  if (saveQueueTimer) clearTimeout(saveQueueTimer)
  saveQueueTimer = setTimeout(async () => {
    if (!newQueue) return
    try {
      const plainQueue = JSON.parse(JSON.stringify(newQueue))  // 深拷贝避免 Proxy
      await window.electronAPI?.saveAgentQueue({
        sessionId: props.sessionId,
        queue: plainQueue
      })
      console.log('[AgentChatTab] Saved queue:', plainQueue.length, 'messages')
    } catch (err) {
      console.error('Failed to save queue:', err)
    }
  }, 300)
}, { deep: true })

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
  setupListeners()
  // 绑定滚动事件检测用户手动滚动
  if (messagesListRef.value) {
    messagesListRef.value.addEventListener('scroll', onMessagesScroll, { passive: true })
  }
  window.addEventListener('focus', onWindowFocus)
  await loadQueueSetting()
  await initDefaultModel()  // 从配置读取默认模型
  await loadMessages()  // 加载历史消息

  // 恢复持久化队列
  try {
    const result = await window.electronAPI?.getAgentQueue(props.sessionId)
    if (result?.success && result.queue?.length > 0 && chatInputRef.value) {
      // messageQueue 是 ref，需要赋值给 .value
      chatInputRef.value.messageQueue.value = result.queue
      console.log('[AgentChatTab] Restored queue:', result.queue.length, 'messages')
    }
  } catch (err) {
    console.error('Failed to load queue:', err)
  }

  scrollToBottom(true, true)
  emit('ready', { sessionId: props.sessionId })
})

onUnmounted(() => {
  if (messagesListRef.value) {
    messagesListRef.value.removeEventListener('scroll', onMessagesScroll)
  }
  window.removeEventListener('focus', onWindowFocus)
  if (focusDebounceTimer) clearTimeout(focusDebounceTimer)
  if (saveQueueTimer) clearTimeout(saveQueueTimer)
  cleanup()
})

defineExpose({
  focus: () => chatInputRef.value?.focus()
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

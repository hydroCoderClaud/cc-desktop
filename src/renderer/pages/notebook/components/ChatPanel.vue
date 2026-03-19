<template>
  <div class="notebook-chat-panel" ref="panelRef">
    <div class="panel-header">
      <span class="panel-title">{{ t('notebook.chat.title') }}</span>
      <span v-if="selectedCount > 0" class="panel-subtitle">{{ t('notebook.chat.sources', { count: selectedCount }) }}</span>
    </div>

    <div class="messages-list" ref="messagesListRef">
      <div v-if="messages.length === 0 && !isStreaming" class="welcome-message">
        <h2>{{ t('notebook.chat.welcome') }}</h2>
        <p class="welcome-subtitle">{{ t('notebook.chat.subtitle') }}</p>
      </div>

      <template v-for="msg in messages" :key="msg.id">
        <MessageBubble
          v-if="msg.role === 'user' || msg.role === 'assistant'"
          :message="msg"
          :session-cwd="sessionCwd"
          @preview-image="$emit('preview-image', $event)"
          @preview-link="$emit('preview-link', $event)"
          @preview-path="$emit('preview-path', $event)"
        />
        <ToolCallCard
          v-else-if="msg.role === 'tool'"
          :message="msg"
          @preview-path="$emit('preview-path', $event)"
        />
      </template>

      <div v-if="isRestored && !isStreaming && messages.length > 0" class="restored-divider">
        <span class="restored-line"></span>
        <span class="restored-text">{{ t('agent.restoredHint') }}</span>
        <span class="restored-line"></span>
      </div>

      <StreamingIndicator
        :visible="isStreaming"
        :text="currentStreamText"
        :elapsed="streamingElapsed"
      />

      <div v-if="error" class="error-banner">
        <Icon name="xCircle" :size="16" />
        <span>{{ error }}</span>
      </div>

      <div ref="scrollAnchor"></div>
    </div>

    <div v-if="!hasActiveSession" class="status-hint-bar">
      <Icon name="info" :size="14" />
      <span>{{ t('agent.historyHint') }}</span>
    </div>

    <ChatInput
      ref="chatInputRef"
      :is-streaming="isStreaming"
      :disabled="false"
      :queue-enabled="false"
      :placeholder="t('notebook.chat.placeholder')"
      :context-tokens="contextTokens"
      :slash-commands="slashCommands"
      :active-model="activeModel"
      v-model:model-value="selectedModel"
      @send="handleSend"
      @cancel="handleCancel"
      @update:queue-enabled="noop"
    />
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useAgentChat } from '@composables/useAgentChat'
import MessageBubble from '@/pages/main/components/agent/MessageBubble.vue'
import ToolCallCard from '@/pages/main/components/agent/ToolCallCard.vue'
import StreamingIndicator from '@/pages/main/components/agent/StreamingIndicator.vue'
import ChatInput from '@/pages/main/components/agent/ChatInput.vue'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  sessionId: {
    type: String,
    required: true
  },
  sessionCwd: {
    type: String,
    default: null
  },
  apiProfileId: {
    type: String,
    default: null
  },
  selectedCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['preview-image', 'preview-link', 'preview-path', 'agent-done'])

const {
  messages,
  isStreaming,
  isRestored,
  currentStreamText,
  error,
  selectedModel,
  streamingElapsed,
  contextTokens,
  slashCommands,
  activeModel,
  hasActiveSession,
  loadMessages,
  sendMessage,
  cancelGeneration,
  setupStreamListeners,
  initDefaultModel
} = useAgentChat(props.sessionId)

const panelRef = ref(null)
const messagesListRef = ref(null)
const scrollAnchor = ref(null)
const chatInputRef = ref(null)
const userAtBottom = ref(true)
const BOTTOM_THRESHOLD = 60
let lastScrollTime = 0
const SCROLL_THROTTLE_MS = 100

const noop = () => {}

const checkIfAtBottom = () => {
  const el = messagesListRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
}

const onMessagesScroll = () => {
  userAtBottom.value = checkIfAtBottom()
}

const scrollToBottom = (instant = false, force = false) => {
  if (!force && !userAtBottom.value) return
  nextTick(() => {
    if (scrollAnchor.value) {
      scrollAnchor.value.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' })
    }
    userAtBottom.value = true
  })
}

watch(messages, () => {
  scrollToBottom()
})

watch(currentStreamText, () => {
  if (!userAtBottom.value) return
  const now = Date.now()
  if (now - lastScrollTime >= SCROLL_THROTTLE_MS) {
    lastScrollTime = now
    scrollToBottom(true)
  }
})

watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    const msgs = messages.value
    let startIdx = msgs.length - 1
    while (startIdx > 0 && msgs[startIdx].role !== 'user') startIdx--
    const filePaths = []
    for (let i = startIdx + 1; i < msgs.length; i++) {
      const msg = msgs[i]
      const fp = msg.input?.file_path || msg.input?.filePath
      if (fp) filePaths.push(fp)
      if (msg.content) {
        const unixPaths = msg.content.match(/\/(?:[\w\-. ]+\/)+[\w\-. ]+\.[\w]{1,10}/g) || []
        const winPaths = msg.content.match(/[A-Za-z]:\\(?:[\w\-. ]+\\)+[\w\-. ]+\.[\w]{1,10}/g) || []
        unixPaths.concat(winPaths).forEach(p => filePaths.push(p))
      }
    }
    emit('agent-done', [...new Set(filePaths)])
  }
})

const handleSend = async (text) => {
  await sendMessage(text)
  scrollToBottom(false, true)
}

const handleCancel = async () => {
  await cancelGeneration()
}

onMounted(async () => {
  setupStreamListeners()
  await initDefaultModel(props.apiProfileId)
  await loadMessages()
  if (messagesListRef.value) {
    messagesListRef.value.addEventListener('scroll', onMessagesScroll, { passive: true })
  }
  scrollToBottom(true, true)

  // Notebook 模式：缩小输入框初始高度（rows=3 → 1）
  await nextTick()
  const textarea = panelRef.value?.querySelector('textarea')
  if (textarea) {
    textarea.rows = 1
    textarea.style.height = '32px'
  }
})
</script>

<style scoped>
.notebook-chat-panel {
  flex: 1;
  min-width: 300px;
  background: var(--bg-color-secondary);
  border: none;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 12px;
}

.notebook-chat-panel :deep(.chat-input-area) {
  background: transparent;
  border-top: none;
  padding: 4px 16px 0;
}

.notebook-chat-panel :deep(.input-wrapper) {
  padding: 4px 12px;
  align-items: center;
}

.notebook-chat-panel :deep(.send-btn),
.notebook-chat-panel :deep(.stop-btn) {
  border-radius: 50%;
}

.notebook-chat-panel :deep(.chat-textarea) {
  max-height: 120px;
  padding: 4px 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  min-height: 52px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  gap: 8px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-subtitle {
  font-size: 12px;
  color: var(--text-color-muted);
  white-space: nowrap;
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.welcome-message {
  text-align: center;
  padding: 64px 24px;
}

.welcome-message h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px;
}

.welcome-subtitle {
  font-size: 14px;
  color: var(--text-color-muted);
  margin: 0;
}

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

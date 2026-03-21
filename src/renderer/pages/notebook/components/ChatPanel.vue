<template>
  <div class="notebook-chat-panel" ref="panelRef">
    <div class="panel-header">
      <span class="panel-title">{{ t('notebook.chat.title') }}</span>
      <div class="header-right">
        <!-- API 切换器 -->
        <div class="api-switcher" ref="apiSwitcherRef">
          <button
            class="api-switcher-btn"
            :class="{ disabled: isStreaming }"
            :disabled="isStreaming"
            :title="currentProfileName"
            @click="toggleApiDropdown"
          >
            <Icon name="api" :size="14" :class="hasActiveSession ? 'cli-active' : 'cli-inactive'" />
            <span class="api-name">{{ currentProfileName }}</span>
            <Icon name="chevronDown" :size="12" />
          </button>
          <Teleport to="body">
            <div
              v-if="showApiDropdown"
              class="api-dropdown"
              :style="apiDropdownStyle"
            >
              <div v-if="apiProfiles.length === 0" class="api-dropdown-empty">{{ t('notebook.chat.noProfiles') }}</div>
              <div
                v-for="p in apiProfiles"
                :key="p.id"
                class="api-dropdown-item"
                :class="{ active: p.id === currentApiProfileId }"
                @click="handleSwitchApi(p)"
              >
                <Icon v-if="p.id === currentApiProfileId" name="check" :size="14" class="api-check" />
                <span v-else class="api-check-placeholder"></span>
                <span class="api-item-name">{{ p.name }}</span>
              </div>
            </div>
          </Teleport>
        </div>
      </div>
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
      :queue-enabled="queueEnabled"
      :placeholder="t('notebook.chat.placeholder')"
      :context-tokens="contextTokens"
      :slash-commands="slashCommands"
      :active-model="activeModel"
      v-model:model-value="selectedModel"
      @send="handleSend"
      @cancel="handleCancel"
      @update:queue-enabled="handleToggleQueue"
    >
      <template #suffix>
        <div v-if="selectedCount > 0" class="input-source-count" :title="t('notebook.chat.sources', { count: selectedCount })">
          <Icon name="fileText" :size="12" />
          <span>{{ selectedCount }}</span>
        </div>
      </template>
    </ChatInput>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useMessage } from 'naive-ui'
import { useAgentChat } from '@composables/useAgentChat'
import MessageBubble from '@/pages/main/components/agent/MessageBubble.vue'
import ToolCallCard from '@/pages/main/components/agent/ToolCallCard.vue'
import StreamingIndicator from '@/pages/main/components/agent/StreamingIndicator.vue'
import ChatInput from '@/pages/main/components/agent/ChatInput.vue'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const queueEnabled = ref(true)

const loadQueueSetting = async () => {
  try {
    const config = await window.electronAPI?.getConfig()
    if (config?.settings?.agent?.messageQueue !== undefined) {
      queueEnabled.value = config.settings.agent.messageQueue
    }
  } catch {}
}

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
  }
}

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
  initDefaultModel,
  isInterrupting
} = useAgentChat(props.sessionId)

let isUnmounting = false

const panelRef = ref(null)
const messagesListRef = ref(null)
const scrollAnchor = ref(null)
const chatInputRef = ref(null)
const apiSwitcherRef = ref(null)
const userAtBottom = ref(true)
const BOTTOM_THRESHOLD = 60
let lastScrollTime = 0
const SCROLL_THROTTLE_MS = 100

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

// ─── API 切换器 ────────────────────────────────────────────────────────────────
const apiProfiles = ref([])
const currentApiProfileId = ref(props.apiProfileId)
const showApiDropdown = ref(false)
const apiDropdownPos = ref({ top: 0, right: 0 })

const apiDropdownStyle = computed(() => ({
  position: 'fixed',
  top: apiDropdownPos.value.top + 'px',
  right: apiDropdownPos.value.right + 'px',
  zIndex: 9999
}))

const currentProfileName = computed(() => {
  const p = apiProfiles.value.find(p => p.id === currentApiProfileId.value)
  return p?.name || 'API'
})

const loadApiProfiles = async () => {
  try {
    apiProfiles.value = await window.electronAPI.listAPIProfiles()
  } catch {}
}

const toggleApiDropdown = () => {
  if (!showApiDropdown.value && apiSwitcherRef.value) {
    const rect = apiSwitcherRef.value.getBoundingClientRect()
    apiDropdownPos.value = { top: rect.bottom + 6, right: window.innerWidth - rect.right }
  }
  showApiDropdown.value = !showApiDropdown.value
}

const onWindowResize = () => {
  if (showApiDropdown.value && apiSwitcherRef.value) {
    const rect = apiSwitcherRef.value.getBoundingClientRect()
    apiDropdownPos.value = { top: rect.bottom + 6, right: window.innerWidth - rect.right }
  }
}

let isSwitchingApi = false
const handleSwitchApi = async (profile) => {
  showApiDropdown.value = false
  if (profile.id === currentApiProfileId.value || isSwitchingApi) return
  isSwitchingApi = true
  try {
    await window.electronAPI.switchAgentApiProfile({ sessionId: props.sessionId, profileId: profile.id })
    currentApiProfileId.value = profile.id
    await initDefaultModel(profile.id)
    message.success(t('notebook.chat.apiSwitched', { name: profile.name }))
  } catch (err) {
    console.error('[ChatPanel] switchApiProfile failed:', err)
    message.error(t('notebook.chat.apiSwitchFailed') + '：' + err.message)
  } finally {
    isSwitchingApi = false
  }
}

const onApiSwitcherClickOutside = (e) => {
  if (showApiDropdown.value && apiSwitcherRef.value && !apiSwitcherRef.value.contains(e.target)) {
    showApiDropdown.value = false
  }
}
const tryAutoConsumeQueue = () => {
  if (isUnmounting) return
  nextTick(async () => {
    const next = chatInputRef.value?.dequeue()
    if (next) {
      await handleSend(next)
    }
  })
}

// 暴露方法给父组件
defineExpose({
  sendMessage: handleSend
})

// 流式结束后自动消费队列
watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming && queueEnabled.value) {
    if (isInterrupting.value) return
    if (error.value) return
    tryAutoConsumeQueue()
  }
})

// 队列从关闭切换到启用时，自动消费
watch(queueEnabled, (enabled, wasEnabled) => {
  if (!wasEnabled && enabled && !isStreaming.value) {
    tryAutoConsumeQueue()
  }
})

onBeforeUnmount(() => {
  isUnmounting = true
  document.removeEventListener('click', onApiSwitcherClickOutside, true)
  window.removeEventListener('resize', onWindowResize)
  if (messagesListRef.value) {
    messagesListRef.value.removeEventListener('scroll', onMessagesScroll, { passive: true })
  }
})

onMounted(async () => {
  setupStreamListeners()
  await initDefaultModel(props.apiProfileId)
  await loadQueueSetting()
  await loadApiProfiles()
  await loadMessages()
  document.addEventListener('click', onApiSwitcherClickOutside, true)
  window.addEventListener('resize', onWindowResize)
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

.notebook-chat-panel .status-hint-bar {
  display: none;
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

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.api-switcher {
  position: relative;
}

.cli-active { color: #22c55e; }
.cli-inactive { color: var(--text-color-muted); }

.api-switcher-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  max-width: 130px;
}

.api-switcher-btn:hover:not(.disabled) {
  background: var(--border-color);
  color: var(--text-color);
}

.api-switcher-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.api-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-dropdown {
  min-width: 180px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  padding: 4px;
}

.api-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: background 0.1s;
}

.api-dropdown-item:hover { background: var(--hover-bg); }
.api-dropdown-item.active { color: var(--primary-color); }

.api-dropdown-empty {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text-color-muted);
  text-align: center;
}

.api-check { color: var(--primary-color); flex-shrink: 0; }
.api-check-placeholder { width: 14px; flex-shrink: 0; }

.api-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.input-source-count {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--primary-ghost, rgba(0, 0, 0, 0.05));
  border-radius: 12px;
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 600;
  margin-right: 4px;
  margin-bottom: 6px; /* 配合 align-items: flex-end */
  user-select: none;
  border: 1px solid var(--primary-color-alpha, rgba(var(--primary-color-rgb), 0.1));
}
</style>

<template>
  <div class="notebook-chat-panel">
    <div class="panel-header">
      <span class="panel-title">{{ t('notebook.chat.title') }}</span>
    </div>

    <div class="messages-list" ref="messagesListRef">
      <div v-if="messages.length === 0 && !isStreaming" class="welcome-message">
        <h2>{{ t('notebook.chat.welcome') }}</h2>
        <p class="welcome-subtitle">{{ t('notebook.chat.subtitle') }}</p>
      </div>

      <template v-for="msg in messages" :key="msg.id">
        <MessageBubble
          v-if="msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'"
          :message="msg"
          :session-cwd="sessionCwd"
          chat-mode="notebook"
          @preview-image="$emit('preview-image', $event)"
          @preview-link="$emit('preview-link', $event)"
          @preview-path="$emit('preview-path', $event)"
          @save-image-to-source="$emit('save-image-to-source', $event)"
          @save-image-to-achievement="$emit('save-image-to-achievement', $event)"
          @copy-content-to-source="$emit('copy-content-to-source', $event)"
          @copy-content-to-achievement="$emit('copy-content-to-achievement', $event)"
          @add-path-to-source="$emit('add-path-to-source', $event)"
          @add-path-to-achievement="$emit('add-path-to-achievement', $event)"
        />
        <AskUserQuestionCard
          v-else-if="msg.role === 'tool' && (msg.toolName === 'AskUserQuestion' || msg.input?.kind === 'permission_request')"
          :message="msg"
          :submitting="Boolean(interactionSubmitting[msg.input?.interactionId])"
          @submit="handleInteractionSubmit"
          @cancel="handleInteractionCancel"
        />
        <ToolCallCard
          v-else-if="msg.role === 'tool'"
          :message="msg"
          @preview-image="$emit('preview-image', $event)"
          @preview-path="$emit('preview-path', $event)"
        />
      </template>

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
      :collapsed-rows="1"
      :collapsed-min-height="32"
      :collapsed-max-height="120"
      :placeholder="t('notebook.chat.placeholder')"
      :context-tokens="contextTokens"
      :slash-commands="slashCommands"
      :slash-commands-supported="true"
      :enable-slash-commands="hasActiveSession"
      :model-options="modelOptions"
      :api-profile-id="currentApiProfileId"
      :api-profiles="apiProfiles"
      :api-profile-disabled="isStreaming || !props.sessionId"
      :show-api-profile-switcher="true"
      :session-id="props.sessionId"
      :session-title="currentSessionTitle"
      :session-type="'chat'"
      :session-source="currentSessionSource"
      :session-im-channel="currentSessionImChannel"
      v-model:model-value="selectedModel"
      @api-profile-selected="handleApiProfileSelected"
      @send="handleInputSend"
      @input-change="handleInputChange"
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
import { useAutoScrollToBottom } from '@composables/useAutoScrollToBottom'
import { collectGenerationResult } from '../utils/generation-result.js'
import MessageBubble from '@/pages/main/components/agent/MessageBubble.vue'
import ToolCallCard from '@/pages/main/components/agent/ToolCallCard.vue'
import AskUserQuestionCard from '@/pages/main/components/agent/AskUserQuestionCard.vue'
import StreamingIndicator from '@/pages/main/components/agent/StreamingIndicator.vue'
import ChatInput from '@/pages/main/components/agent/ChatInput.vue'
import Icon from '@components/icons/Icon.vue'
import { isExternalImChannel } from '@shared/external-im-meta'

const { t } = useLocale()
const message = useMessage()
const normalizeModelValue = (value) => typeof value === 'string' ? value.trim() : ''
const currentSessionTitle = ref('')
const currentSessionSource = ref('manual')
const currentSessionImChannel = ref(null)

const queueEnabled = ref(true)
const activeGenerationToken = ref(null)

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
  selectedModelId: {
    type: String,
    default: null
  },
  selectedCount: {
    type: Number,
    default: 0
  },
  generationToken: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits([
  'preview-image',
  'preview-link',
  'preview-path',
  'input-change',
  'send',
  'api-profile-switched',
  'model-selected',
  'agent-done',
  'agent-cancelled',
  'request-clear-session',
  'save-image-to-source',
  'save-image-to-achievement',
  'copy-content-to-source',
  'copy-content-to-achievement',
  'add-path-to-source',
  'add-path-to-achievement'
])

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
  modelOptions,
  hasActiveSession,
  loadMessages,
  sendMessage,
  cancelGeneration,
  submitInteractionAnswer,
  cancelInteraction,
  syncActiveSessionState,
  setupStreamListeners,
  setupExternalImMessageListeners,
  initDefaultModel,
  isInterrupting
} = useAgentChat(props.sessionId, {
  onClearRequested: () => {
    emit('request-clear-session')
  }
})

let isUnmounting = false
let cleanupSessionUpdated = null

const messagesListRef = ref(null)
const scrollAnchor = ref(null)
const chatInputRef = ref(null)
const interactionSubmitting = ref({})
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

watch(isStreaming, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    if (isInterrupting.value) return
    const finishedToken = activeGenerationToken.value
    const result = collectGenerationResult(messages.value, window.electronAPI?.platform || 'win32')
    emit('agent-done', { ...result, generationToken: finishedToken })
  }
})

const dispatchMessage = async (text) => {
  activeGenerationToken.value = props.generationToken
  await sendMessage(text)
  scrollToBottom(false, true)
}

const handleInputSend = (payload) => {
  emit('send', payload)
}

const handleInputChange = (text) => {
  emit('input-change', text)
}

const handleCancel = async () => {
  const cancelled = await cancelGeneration()
  if (cancelled) {
    // 通知父组件清理本次未完成的 generating 记录
    emit('agent-cancelled', { generationToken: activeGenerationToken.value })
  }
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

// ─── API 切换器 ────────────────────────────────────────────────────────────────
const apiProfiles = ref([])
const currentApiProfileId = ref(props.apiProfileId)

const loadApiProfiles = async () => {
  try {
    apiProfiles.value = await window.electronAPI.listAPIProfiles()
  } catch {}
}

let isSwitchingApi = false
let profileSyncToken = 0

const syncApiProfileState = async (profileId, preferredModelId = props.selectedModelId) => {
  const syncToken = ++profileSyncToken
  currentApiProfileId.value = profileId || null
  const applied = await initDefaultModel(profileId, preferredModelId)
  return applied && syncToken === profileSyncToken
}

const handleApiProfileSelected = async (profileId) => {
  const nextProfileId = typeof profileId === 'string' ? profileId.trim() : ''
  if (!nextProfileId || nextProfileId === currentApiProfileId.value || isSwitchingApi) return
  isSwitchingApi = true
  try {
    const result = await window.electronAPI.switchAgentApiProfile({ sessionId: props.sessionId, profileId: nextProfileId })
    if (result?.error) {
      throw new Error(result.error)
    }
    const applied = await syncApiProfileState(nextProfileId, null)
    if (!applied) return
    emit('api-profile-switched', { profileId: nextProfileId })
    message.success(t('notebook.chat.apiSwitched', {
      name: apiProfiles.value.find(profile => profile.id === nextProfileId)?.name || nextProfileId
    }))
  } catch (err) {
    console.error('[ChatPanel] switchApiProfile failed:', err)
    message.error(t('notebook.chat.apiSwitchFailed') + '：' + err.message)
  } finally {
    isSwitchingApi = false
  }
}

const syncNotebookSessionMeta = async () => {
  if (!props.sessionId || !window.electronAPI?.getAgentSession) return
  try {
    const session = await window.electronAPI.getAgentSession(props.sessionId)
    currentSessionTitle.value = typeof session?.title === 'string' ? session.title : ''
    currentSessionSource.value = typeof session?.source === 'string' ? session.source : 'manual'
    currentSessionImChannel.value = isExternalImChannel(session?.imChannel) ? session.imChannel : null
  } catch (err) {
    console.warn('[ChatPanel] Failed to sync notebook session meta:', err)
  }
}
const tryAutoConsumeQueue = () => {
  if (isUnmounting) return
  nextTick(async () => {
    const next = chatInputRef.value?.dequeue()
    if (next) {
      handleInputSend(next)
    }
  })
}

// 暴露方法给父组件
const insertText = (text) => {
  chatInputRef.value?.insertText?.(text)
}

const setText = (text) => {
  chatInputRef.value?.setText?.(text)
}

defineExpose({
  sendMessage: dispatchMessage,
  insertText,
  setText
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

watch(selectedModel, (modelId, previousModelId) => {
  const normalizedModelId = normalizeModelValue(modelId)
  const normalizedPreviousModelId = normalizeModelValue(previousModelId)
  const persistedModelId = normalizeModelValue(props.selectedModelId)

  if (!normalizedModelId || normalizedModelId === normalizedPreviousModelId || normalizedModelId === persistedModelId) {
    return
  }

  emit('model-selected', { modelId: normalizedModelId })
})

watch(() => props.apiProfileId, (profileId) => {
  void syncApiProfileState(profileId, props.selectedModelId)
}, { immediate: true })

watch(() => props.selectedModelId, (modelId) => {
  const normalizedModelId = normalizeModelValue(modelId)
  if (!normalizedModelId || normalizedModelId === normalizeModelValue(selectedModel.value)) {
    return
  }

  const existsInOptions = modelOptions.value.some(option => option?.value === normalizedModelId)
  if (existsInOptions) {
    selectedModel.value = normalizedModelId
  }
})

watch(() => props.sessionId, () => {
  currentSessionTitle.value = ''
  currentSessionSource.value = 'manual'
  currentSessionImChannel.value = null
  void syncNotebookSessionMeta()
}, { immediate: true })

onBeforeUnmount(() => {
  isUnmounting = true
  cleanupSessionUpdated?.()
  stopAutoScrollObservers()
  if (messagesListRef.value) {
    messagesListRef.value.removeEventListener('scroll', onMessagesScroll, { passive: true })
  }
})

onMounted(async () => {
  setupStreamListeners()
  await loadQueueSetting()
  await loadApiProfiles()
  setupExternalImMessageListeners()
  await loadMessages()
  await syncNotebookSessionMeta()
  await syncActiveSessionState()
  if (window.electronAPI?.onSessionUpdated) {
    cleanupSessionUpdated = window.electronAPI.onSessionUpdated((eventData) => {
      if (eventData?.sessionId !== props.sessionId) return
      void syncNotebookSessionMeta()
    })
  }
  if (messagesListRef.value) {
    messagesListRef.value.addEventListener('scroll', onMessagesScroll, { passive: true })
  }
  startAutoScrollObservers()
  scrollToBottom(true, true)
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

.notebook-chat-panel :deep(.chat-input-area.expanded .input-wrapper) {
  align-items: flex-end;
}

.notebook-chat-panel :deep(.send-btn),
.notebook-chat-panel :deep(.stop-btn) {
  border-radius: 50%;
}

.notebook-chat-panel :deep(.chat-textarea) {
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
  min-height: 0;
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

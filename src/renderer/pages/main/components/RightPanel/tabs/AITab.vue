<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.ai') }}</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.ai.clear')" @click="handleClear">
          🗑️
        </button>
      </div>
    </div>

    <div class="chat-content" ref="chatContentRef">
      <!-- Empty State -->
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon">🤖</div>
        <div class="empty-text">{{ t('rightPanel.ai.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.ai.emptyHint') }}</div>
      </div>

      <!-- Message List -->
      <div v-else class="message-list">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message-item"
          :class="msg.role"
        >
          <div class="message-avatar">
            {{ msg.role === 'user' ? '👤' : '🤖' }}
          </div>
          <div class="message-body">
            <div class="message-content">{{ msg.content }}</div>
            <div class="message-actions" v-if="msg.role === 'assistant'">
              <button
                class="action-link"
                @click="handleCopy(msg.content)"
              >
                {{ t('common.copy') }}
              </button>
              <button
                class="action-link"
                @click="handleInsertToInput(msg.content)"
              >
                {{ t('rightPanel.ai.insertToInput') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Loading indicator -->
        <div v-if="loading" class="message-item assistant">
          <div class="message-avatar">🤖</div>
          <div class="message-body">
            <div class="loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="chat-input">
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="input-field"
        :placeholder="t('rightPanel.ai.placeholder')"
        rows="2"
        :disabled="loading"
        @keydown="handleKeydown"
      />
      <button
        class="send-btn"
        :disabled="!inputText.trim() || loading"
        @click="handleSend"
      >
        {{ loading ? '...' : '▶' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const emit = defineEmits(['insert-to-input'])

// Refs
const chatContentRef = ref(null)
const inputRef = ref(null)

// State
const messages = ref([])
const inputText = ref('')
const loading = ref(false)

// Methods
const handleKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

const handleSend = async () => {
  const text = inputText.value.trim()
  if (!text || loading.value) return

  // Add user message
  messages.value.push({
    id: Date.now().toString(),
    role: 'user',
    content: text
  })
  inputText.value = ''

  // Scroll to bottom
  await nextTick()
  scrollToBottom()

  // Send to AI
  loading.value = true
  try {
    // TODO: Call AI API
    // const response = await window.electronAPI?.invoke('ai:chat', messages.value)

    // Mock response for now
    await new Promise(resolve => setTimeout(resolve, 1000))
    messages.value.push({
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: t('rightPanel.ai.notConfigured')
    })
  } catch (err) {
    console.error('AI chat error:', err)
    message.error(t('rightPanel.ai.error'))
  } finally {
    loading.value = false
    await nextTick()
    scrollToBottom()
  }
}

const handleClear = () => {
  if (messages.value.length === 0) return
  if (!window.confirm(t('rightPanel.ai.clearConfirm'))) return
  messages.value = []
}

const handleCopy = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t('common.copied'))
  } catch (err) {
    message.error(t('common.copyFailed'))
  }
}

const handleInsertToInput = (text) => {
  emit('insert-to-input', text)
}

const scrollToBottom = () => {
  if (chatContentRef.value) {
    chatContentRef.value.scrollTop = chatContentRef.value.scrollHeight
  }
}

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<style scoped>
.tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.tab-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover-bg);
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-muted);
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
}

/* Message List */
.message-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-item {
  display: flex;
  gap: 8px;
}

.message-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-color-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-word;
}

.message-item.user .message-content {
  background: var(--primary-color);
  color: white;
  padding: 8px 12px;
  border-radius: 12px 12px 2px 12px;
}

.message-item.assistant .message-content {
  background: var(--bg-color-tertiary);
  padding: 8px 12px;
  border-radius: 12px 12px 12px 2px;
}

.message-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  padding-left: 12px;
}

.action-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: color 0.15s ease;
}

.action-link:hover {
  color: var(--primary-color);
}

/* Loading dots */
.loading-dots {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  background: var(--text-color-muted);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}

.loading-dots span:nth-child(1) { animation-delay: 0s; }
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

/* Chat Input */
.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.15s ease;
}

.input-field:focus {
  border-color: var(--primary-color);
}

.input-field:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-field::placeholder {
  color: var(--text-color-muted);
}

.send-btn {
  width: 40px;
  border-radius: 6px;
  background: var(--primary-color);
  color: white;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

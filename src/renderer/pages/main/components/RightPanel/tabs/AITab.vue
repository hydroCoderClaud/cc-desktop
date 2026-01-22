<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.ai') }}</span>
      <div class="tab-actions">
        <!-- Token 显示 -->
        <span class="token-info" v-if="tokenInfo.tokens > 0" :title="t('rightPanel.ai.tokenInfo')">
          {{ formatTokens(tokenInfo.tokens) }} ({{ tokenInfo.percentage }}%)
        </span>
        <button class="icon-btn" :title="t('rightPanel.ai.settings')" @click="showSettings = !showSettings">
          <span :class="{ 'settings-active': showSettings }">&#9881;</span>
        </button>
        <button class="icon-btn" :title="t('rightPanel.ai.clear')" @click="handleClear">
          &#128465;
        </button>
      </div>
    </div>

    <!-- Settings Panel -->
    <div v-if="showSettings" class="settings-panel">
      <div class="setting-row">
        <label>{{ t('rightPanel.ai.profile') }}</label>
        <select v-model="config.profileId" @change="saveConfig">
          <option :value="null">{{ t('rightPanel.ai.useDefault') }}</option>
          <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div class="setting-row">
        <label>{{ t('rightPanel.ai.model') }}</label>
        <input v-model="config.model" @change="saveConfig" :placeholder="t('rightPanel.ai.modelPlaceholder')" />
      </div>
      <div class="setting-row">
        <label>{{ t('rightPanel.ai.maxTokens') }}</label>
        <input type="number" v-model.number="config.maxTokens" @change="saveConfig" min="100" max="8192" />
      </div>
      <div class="setting-row">
        <label>{{ t('rightPanel.ai.temperature') }}</label>
        <input type="number" v-model.number="config.temperature" @change="saveConfig" min="0" max="1" step="0.1" />
      </div>
      <div class="setting-row">
        <label>{{ t('rightPanel.ai.systemPrompt') }}</label>
        <textarea v-model="config.systemPrompt" @change="saveConfig" rows="3" :placeholder="t('rightPanel.ai.systemPromptPlaceholder')" />
      </div>
    </div>

    <div class="chat-content" ref="chatContentRef">
      <!-- Empty State -->
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon">&#129302;</div>
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
            {{ msg.role === 'user' ? '&#128100;' : '&#129302;' }}
          </div>
          <div class="message-body">
            <!-- Markdown 渲染 -->
            <div
              v-if="msg.role === 'assistant'"
              class="message-content markdown-body"
              v-html="renderMarkdown(msg.content)"
            />
            <div v-else class="message-content">{{ msg.content }}</div>
            <!-- Token 信息 -->
            <div class="message-meta" v-if="msg.tokens">
              <span class="token-badge">{{ msg.tokens.input }}&#8595; {{ msg.tokens.output }}&#8593;</span>
            </div>
            <div class="message-actions" v-if="msg.role === 'assistant' && !loading">
              <button class="action-link" @click="handleCopy(msg.content)">
                {{ t('common.copy') }}
              </button>
              <button class="action-link" @click="handleInsertToInput(msg.content)">
                {{ t('rightPanel.ai.insertToInput') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Streaming indicator -->
        <div v-if="loading" class="message-item assistant">
          <div class="message-avatar">&#129302;</div>
          <div class="message-body">
            <div v-if="streamingContent" class="message-content markdown-body" v-html="renderMarkdown(streamingContent)" />
            <div v-else class="loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Compact Warning -->
    <div v-if="tokenInfo.shouldCompact && !loading" class="compact-warning">
      <span>{{ t('rightPanel.ai.contextLarge') }}</span>
      <button class="compact-btn" @click="handleCompact">{{ t('rightPanel.ai.compact') }}</button>
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
        {{ loading ? '...' : '&#9654;' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { marked } from 'marked'

const { t } = useLocale()
const message = useMessage()

const emit = defineEmits(['insert-to-input'])

// API
const {
  aiChat, aiCompact, aiCountTokens,
  aiGetConfig, aiUpdateConfig,
  listProfiles,
  onAIStreamChunk, onAIStreamEnd, onAIStreamError
} = window.electronAPI || {}

// Refs
const chatContentRef = ref(null)
const inputRef = ref(null)

// State
const messages = ref([])
const inputText = ref('')
const loading = ref(false)
const streamingContent = ref('')
const tokenInfo = ref({ tokens: 0, percentage: 0, shouldCompact: false })

// Settings
const showSettings = ref(false)
const profiles = ref([])
const config = reactive({
  profileId: null,
  model: 'claude-3-haiku-20240307',
  maxTokens: 2048,
  temperature: 1,
  systemPrompt: ''
})

// Stream listeners cleanup
let cleanupChunk = null
let cleanupEnd = null
let cleanupError = null

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true
})

// Load config and profiles
const loadConfig = async () => {
  try {
    if (aiGetConfig) {
      const cfg = await aiGetConfig()
      Object.assign(config, cfg)
    }
    if (listProfiles) {
      profiles.value = await listProfiles()
    }
  } catch (err) {
    console.error('Failed to load AI config:', err)
  }
}

// Save config
const saveConfig = async () => {
  try {
    if (aiUpdateConfig) {
      await aiUpdateConfig({
        profileId: config.profileId,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt
      })
    }
  } catch (err) {
    console.error('Failed to save AI config:', err)
  }
}

// Markdown rendering
const renderMarkdown = (content) => {
  if (!content) return ''
  try {
    return marked.parse(content)
  } catch (e) {
    return content
  }
}

// Format tokens for display
const formatTokens = (tokens) => {
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K'
  }
  return tokens.toString()
}

// Update token info
const updateTokenInfo = async () => {
  if (!aiCountTokens) return
  // 转为纯对象，避免 IPC 序列化错误
  const plainMessages = messages.value.map(m => ({
    role: m.role,
    content: m.content
  }))
  const info = await aiCountTokens(plainMessages)
  tokenInfo.value = info
}

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
  streamingContent.value = ''

  try {
    // 准备发送的消息（只包含 role 和 content）
    const apiMessages = messages.value.map(m => ({
      role: m.role,
      content: m.content
    }))

    const result = await aiChat(apiMessages)

    if (result.success) {
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.data.content,
        tokens: {
          input: result.data.inputTokens,
          output: result.data.outputTokens
        }
      })
      await updateTokenInfo()
    } else {
      // 错误处理
      let errorMsg = result.message || t('rightPanel.ai.error')
      if (result.error === 'NO_API_KEY') {
        errorMsg = t('rightPanel.ai.noApiKey')
      }
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `&#9888; ${errorMsg}`
      })
    }
  } catch (err) {
    console.error('AI chat error:', err)
    messages.value.push({
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: `&#9888; ${t('rightPanel.ai.error')}: ${err.message}`
    })
  } finally {
    loading.value = false
    streamingContent.value = ''
    await nextTick()
    scrollToBottom()
    inputRef.value?.focus()
  }
}

const handleCompact = async () => {
  if (!aiCompact || messages.value.length < 2) return

  loading.value = true
  try {
    // 转为纯对象，避免 IPC 序列化错误
    const plainMessages = messages.value.map(m => ({
      role: m.role,
      content: m.content
    }))
    const result = await aiCompact(plainMessages)
    if (result.success) {
      // 用摘要替换历史
      messages.value = [{
        id: Date.now().toString(),
        role: 'assistant',
        content: `&#128203; **${t('rightPanel.ai.compactedHistory')}**\n\n${result.data.summary}`
      }]
      await updateTokenInfo()
      message.success(t('rightPanel.ai.compactSuccess'))
    } else {
      message.error(result.message || t('rightPanel.ai.compactFailed'))
    }
  } catch (err) {
    console.error('Compact error:', err)
    message.error(t('rightPanel.ai.compactFailed'))
  } finally {
    loading.value = false
    inputRef.value?.focus()
  }
}

const handleClear = () => {
  if (messages.value.length === 0) return
  if (!window.confirm(t('rightPanel.ai.clearConfirm'))) return
  messages.value = []
  tokenInfo.value = { tokens: 0, percentage: 0, shouldCompact: false }
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
  loadConfig()

  // Setup stream listeners (for future streaming support)
  if (onAIStreamChunk) {
    cleanupChunk = onAIStreamChunk(({ text }) => {
      streamingContent.value += text
      scrollToBottom()
    })
  }
  if (onAIStreamEnd) {
    cleanupEnd = onAIStreamEnd(({ content, inputTokens, outputTokens }) => {
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        tokens: { input: inputTokens, output: outputTokens }
      })
      loading.value = false
      streamingContent.value = ''
      updateTokenInfo()
    })
  }
  if (onAIStreamError) {
    cleanupError = onAIStreamError(({ message: errMsg }) => {
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `&#9888; ${errMsg}`
      })
      loading.value = false
      streamingContent.value = ''
    })
  }
})

onUnmounted(() => {
  cleanupChunk?.()
  cleanupEnd?.()
  cleanupError?.()
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
  align-items: center;
  gap: 8px;
}

.token-info {
  font-size: 11px;
  color: var(--text-color-muted);
  padding: 2px 6px;
  background: var(--bg-color-tertiary);
  border-radius: 4px;
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

.settings-active {
  color: var(--primary-color);
}

/* Settings Panel */
.settings-panel {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-row label {
  font-size: 11px;
  color: var(--text-color-muted);
  font-weight: 500;
}

.setting-row input,
.setting-row select,
.setting-row textarea {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.setting-row input:focus,
.setting-row select:focus,
.setting-row textarea:focus {
  border-color: var(--primary-color);
}

.setting-row textarea {
  resize: vertical;
  min-height: 60px;
}

.setting-row input[type="number"] {
  width: 100px;
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

/* Markdown styling */
.markdown-body :deep(p) {
  margin: 0 0 8px 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(pre) {
  background: var(--bg-color-secondary);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.markdown-body :deep(ul), .markdown-body :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.message-meta {
  margin-top: 4px;
  padding-left: 12px;
}

.token-badge {
  font-size: 10px;
  color: var(--text-color-muted);
  background: var(--bg-color-secondary);
  padding: 1px 4px;
  border-radius: 3px;
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

/* Compact Warning */
.compact-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--warning-bg, rgba(255, 193, 7, 0.1));
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--warning-text, #856404);
}

.compact-btn {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.compact-btn:hover {
  background: var(--warning-bg, rgba(255, 193, 7, 0.2));
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

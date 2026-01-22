<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.ai') }}</span>
      <div class="tab-actions">
        <!-- Token 显示 -->
        <span class="token-info" v-if="tokenInfo.tokens > 0" :title="t('rightPanel.ai.tokenInfo')">
          {{ formatTokens(tokenInfo.tokens) }} ({{ tokenInfo.percentage }}%)
        </span>
        <button
          class="icon-btn"
          :title="t('rightPanel.ai.compact')"
          @click="handleCompact"
          :disabled="loading || messages.length < 2"
        >
          &#128230;
        </button>
        <button class="icon-btn" :title="t('rightPanel.ai.clear')" @click="handleClear">
          &#128465;
        </button>
        <button class="icon-btn" :title="t('rightPanel.ai.settings')" @click="showSettings = !showSettings">
          <span :class="{ 'settings-active': showSettings }">&#9881;</span>
        </button>
      </div>
    </div>

    <!-- Settings Panel -->
    <div v-if="showSettings" class="settings-panel">
      <div class="setting-row-header">
        <label>{{ t('rightPanel.ai.profile') }}</label>
        <button class="collapse-link" @click="showSettings = false">{{ t('common.collapse') }}</button>
      </div>
      <select v-model="config.profileId" @change="saveConfig" class="setting-select">
        <option :value="null">{{ t('rightPanel.ai.useDefault') }}</option>
        <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <div class="setting-row-inline">
        <div class="setting-field">
          <label>{{ t('rightPanel.ai.maxTokens') }}</label>
          <input type="number" v-model.number="config.maxTokens" @change="saveConfig" min="100" max="8192" />
        </div>
        <div class="setting-field">
          <label>{{ t('rightPanel.ai.temperature') }}</label>
          <input type="number" v-model.number="config.temperature" @change="saveConfig" min="0" max="1" step="0.1" />
        </div>
      </div>
      <div class="setting-row">
        <label>{{ t('rightPanel.ai.systemPrompt') }}</label>
        <textarea v-model="config.systemPrompt" @change="saveConfig" rows="3" :placeholder="t('rightPanel.ai.systemPromptPlaceholder')" />
      </div>
      <div class="setting-row-inline">
        <div class="setting-field">
          <label>{{ t('rightPanel.ai.contextMaxTokens') }}</label>
          <input type="number" v-model.number="config.contextMaxTokens" @change="saveConfig" min="10000" max="1000000" step="10000" />
        </div>
        <div class="setting-field">
          <label>{{ t('rightPanel.ai.compactThreshold') }}</label>
          <input type="number" v-model.number="config.compactThreshold" @change="saveConfig" min="10" max="90" step="5" />
        </div>
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
            <!-- Token 信息和操作按钮 -->
            <div class="message-meta" v-if="msg.role === 'assistant' && !loading">
              <span class="token-badge" v-if="msg.tokens">{{ msg.tokens.input }}&#8595; {{ msg.tokens.output }}&#8593;</span>
              <span class="meta-divider" v-if="msg.tokens">|</span>
              <button class="action-link" @click="handleCopy(msg.content)">{{ t('common.copy') }}</button>
              <button class="action-link" @click="handleInsertToInput(msg.content)">{{ t('rightPanel.ai.insertToInput') }}</button>
              <button class="action-link" @click="handleSaveAsPrompt(msg.content)">{{ t('rightPanel.ai.saveAsPrompt') }}</button>
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
import { useMessage, useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { marked } from 'marked'

const { t } = useLocale()
const message = useMessage()
const dialog = useDialog()

const emit = defineEmits(['insert-to-input', 'save-as-prompt'])

// API
const {
  aiChat, aiCompact, aiCountTokens,
  aiGetConfig, aiUpdateConfig,
  listAPIProfiles,
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

// Message ID counter (避免 Date.now() 重复)
let messageIdCounter = 0
const generateMessageId = () => `msg_${Date.now()}_${++messageIdCounter}`

// Settings
const showSettings = ref(false)
const profiles = ref([])
const config = reactive({
  profileId: null,
  maxTokens: 2048,
  temperature: 1,
  systemPrompt: '',
  contextMaxTokens: 200000,
  compactThreshold: 50
})

// Stream listeners cleanup
let cleanupChunk = null
let cleanupEnd = null
let cleanupError = null

// Configure marked with security options
marked.setOptions({
  breaks: true,
  gfm: true
})

// Simple HTML sanitizer (removes dangerous tags and attributes)
const sanitizeHtml = (html) => {
  // 移除 script, iframe, object, embed, form 标签
  html = html.replace(/<(script|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
  html = html.replace(/<(script|iframe|object|embed|form)[^>]*\/?>/gi, '')
  // 移除事件处理属性 (onclick, onerror, onload 等)
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  html = html.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
  // 移除 javascript: 协议
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
  return html
}

// Load config and profiles
const loadConfig = async () => {
  try {
    if (aiGetConfig) {
      const cfg = await aiGetConfig()
      Object.assign(config, cfg)
    }
    if (listAPIProfiles) {
      profiles.value = await listAPIProfiles()
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
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        systemPrompt: config.systemPrompt,
        contextMaxTokens: config.contextMaxTokens,
        compactThreshold: config.compactThreshold
      })
      // 更新 token 信息（阈值可能改变）
      await updateTokenInfo()
    }
  } catch (err) {
    console.error('Failed to save AI config:', err)
  }
}

// Markdown rendering
const renderMarkdown = (content) => {
  if (!content) return ''
  try {
    let html = marked.parse(content)
    // 移除空段落和多余空白
    html = html.replace(/<p>\s*<\/p>/g, '')
    html = html.replace(/(<br\s*\/?>\s*){2,}/g, '<br>')
    // 安全处理
    return sanitizeHtml(html)
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
    id: generateMessageId(),
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
    // 准备发送的消息（只包含 role 和 content，过滤空消息）
    const apiMessages = messages.value
      .filter(m => m.content && m.content.trim())
      .map(m => ({
        role: m.role,
        content: m.content
      }))

    const result = await aiChat(apiMessages)

    if (result.success) {
      messages.value.push({
        id: generateMessageId(),
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
        id: generateMessageId(),
        role: 'assistant',
        content: `&#9888; ${errorMsg}`
      })
    }
  } catch (err) {
    console.error('AI chat error:', err)
    messages.value.push({
      id: generateMessageId(),
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
        id: generateMessageId(),
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
  dialog.warning({
    title: t('common.confirm'),
    content: t('rightPanel.ai.clearConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => {
      messages.value = []
      tokenInfo.value = { tokens: 0, percentage: 0, shouldCompact: false }
    }
  })
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

const handleSaveAsPrompt = (text) => {
  emit('save-as-prompt', text)
}

const scrollToBottom = () => {
  if (chatContentRef.value) {
    chatContentRef.value.scrollTop = chatContentRef.value.scrollHeight
  }
}

onMounted(() => {
  inputRef.value?.focus()
  loadConfig()

  // 预留：流式响应监听器（当前使用非流式 aiChat，未来可切换到 aiStream）
  if (onAIStreamChunk) {
    cleanupChunk = onAIStreamChunk(({ text }) => {
      streamingContent.value += text
      scrollToBottom()
    })
  }
  if (onAIStreamEnd) {
    cleanupEnd = onAIStreamEnd(({ content, inputTokens, outputTokens }) => {
      messages.value.push({
        id: generateMessageId(),
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
        id: generateMessageId(),
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
  padding: 0 12px;
  height: 40px;
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
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.setting-row-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.setting-row-header label {
  font-size: 11px;
  color: var(--text-color-muted);
  font-weight: 500;
}

.collapse-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: color 0.15s ease;
}

.collapse-link:hover {
  color: var(--primary-color);
}

.setting-select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s ease;
}

.setting-select:focus {
  border-color: var(--primary-color);
}

.setting-row-inline {
  display: flex;
  gap: 12px;
}

.setting-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.setting-field label {
  font-size: 11px;
  color: var(--text-color-muted);
  font-weight: 500;
}

.setting-field input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.setting-field input:focus {
  border-color: var(--primary-color);
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
  resize: vertical;
  min-height: 50px;
}

.setting-row textarea:focus {
  border-color: var(--primary-color);
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

/* Markdown styling - 紧凑间距 */
.markdown-body :deep(p) {
  margin: 0 0 6px 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3),
.markdown-body :deep(h4), .markdown-body :deep(h5), .markdown-body :deep(h6) {
  margin: 8px 0 4px 0;
  font-weight: 600;
}

.markdown-body :deep(h1) { font-size: 1.3em; }
.markdown-body :deep(h2) { font-size: 1.2em; }
.markdown-body :deep(h3) { font-size: 1.1em; }

.markdown-body :deep(pre) {
  background: var(--bg-color-secondary);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 6px 0;
}

.markdown-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.markdown-body :deep(ul), .markdown-body :deep(ol) {
  margin: 2px 0;
  padding-left: 18px;
}

.markdown-body :deep(li) {
  margin: 2px 0;
}

.markdown-body :deep(li > ul), .markdown-body :deep(li > ol) {
  margin: 2px 0;
}

.markdown-body :deep(blockquote) {
  margin: 6px 0;
  padding-left: 10px;
  border-left: 3px solid var(--border-color);
  color: var(--text-color-muted);
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding-left: 12px;
  flex-wrap: wrap;
}

.token-badge {
  font-size: 10px;
  color: var(--text-color-muted);
  background: var(--bg-color-secondary);
  padding: 1px 4px;
  border-radius: 3px;
}

.meta-divider {
  color: var(--border-color);
  font-size: 10px;
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

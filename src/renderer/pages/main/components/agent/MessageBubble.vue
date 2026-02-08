<template>
  <div class="message-bubble" :class="[message.role]">
    <div class="bubble-avatar">
      <Icon :name="message.role === 'user' ? 'user' : 'robot'" :size="16" />
    </div>
    <div class="bubble-content">
      <div class="bubble-body" v-html="renderedContent"></div>
      <div class="bubble-meta" v-if="message.timestamp">
        {{ formatTime(message.timestamp) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

/**
 * 简单的 Markdown 渲染（代码块、加粗、斜体、链接）
 */
const renderedContent = computed(() => {
  let text = props.message.content || ''

  // 转义 HTML
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // 代码块
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')

  // 行内代码
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 加粗
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 换行
  text = text.replace(/\n/g, '<br>')

  return text
})

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.message-bubble {
  display: flex;
  gap: 10px;
  padding: 8px 16px;
  transition: background 0.15s;
}

.message-bubble:hover {
  background: var(--hover-bg);
}

.message-bubble.user {
  flex-direction: row-reverse;
}

.bubble-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-color-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--primary-color);
}

.message-bubble.user .bubble-avatar {
  background: var(--primary-color);
  color: white;
}

.bubble-content {
  max-width: 75%;
  min-width: 0;
}

.bubble-body {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.message-bubble.assistant .bubble-body {
  background: var(--bg-color-secondary);
  color: var(--text-color);
  border-top-left-radius: 4px;
}

.message-bubble.user .bubble-body {
  background: var(--primary-color);
  color: white;
  border-top-right-radius: 4px;
}

.bubble-body :deep(pre) {
  background: var(--bg-color-tertiary);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
  font-size: 13px;
}

.bubble-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}

.bubble-body :deep(code:not(pre code)) {
  background: var(--bg-color-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
}

.bubble-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-top: 4px;
  padding: 0 4px;
}

.message-bubble.user .bubble-meta {
  text-align: right;
}
</style>

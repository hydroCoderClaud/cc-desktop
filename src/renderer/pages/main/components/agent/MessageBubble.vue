<template>
  <div class="message-bubble" :class="[message.role]">
    <div class="bubble-avatar">
      <Icon :name="message.role === 'user' ? 'user' : 'robot'" :size="16" />
    </div>
    <div class="bubble-content">
      <div class="bubble-body" ref="bodyRef" v-html="renderedContent" @click="handleLinkClick"></div>
      <div class="bubble-meta" v-if="message.timestamp">
        {{ formatTime(message.timestamp) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

const bodyRef = ref(null)

/**
 * 简单的 Markdown 渲染（代码块、加粗、斜体、链接、路径）
 */
const renderedContent = computed(() => {
  let text = props.message.content || ''

  // 转义 HTML
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // 代码块 — 提取保护，避免内部被链接正则误匹配
  const codeBlocks = []
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code class="lang-${lang}">${code}</code></pre>`)
    return `\x00CB${codeBlocks.length - 1}\x00`
  })

  // 行内代码 — 同样保护
  const inlineCodes = []
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    inlineCodes.push(`<code>${code}</code>`)
    return `\x00IC${inlineCodes.length - 1}\x00`
  })

  // 加粗
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // URL 链接（http:// 或 https://）
  text = text.replace(/(https?:\/\/[^\s<>&"')\]]+)/g,
    '<a class="clickable-link" data-link-type="url" data-href="$1" title="点击打开链接">$1</a>')

  // Windows 绝对路径（C:\... D:\...）
  text = text.replace(/([A-Z]):(\\[^\s<>&"',:*?]+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1:$2" title="点击打开文件">$1:$2</a>')

  // Unix 绝对路径（/home/... /usr/... /tmp/... 等）
  text = text.replace(/(\/(?:home|usr|etc|tmp|var|opt|mnt|srv|root|Users|Library|Applications|Volumes)[^\s<>&"']+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1" title="点击打开文件">$1</a>')

  // 相对路径（./... 或 ../...）
  text = text.replace(/(\.\.?\/[^\s<>&"']+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1" title="点击打开文件">$1</a>')

  // ~ 路径（~/...）
  text = text.replace(/(~\/[^\s<>&"']+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1" title="点击打开文件">$1</a>')

  // 换行
  text = text.replace(/\n/g, '<br>')

  // 还原代码块（代码块内不做链接检测）
  text = text.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[i])

  // 还原行内代码 — 如果内容是 URL/路径，注入可点击链接
  text = text.replace(/\x00IC(\d+)\x00/g, (_, i) => {
    const code = inlineCodes[i] // '<code>...</code>'
    const inner = code.slice(6, -7) // 提取 <code> 和 </code> 之间的内容
    let linkType = ''
    if (/^https?:\/\//.test(inner)) {
      linkType = 'url'
    } else if (/^[A-Z]:\\/.test(inner) || /^\/(?:home|usr|etc|tmp|var|opt|mnt|srv|root|Users|Library|Applications|Volumes)\//.test(inner) || /^\.\.?\//.test(inner) || /^~\//.test(inner)) {
      linkType = 'path'
    }
    if (linkType) {
      const tip = linkType === 'url' ? '点击打开链接' : '点击打开文件'
      return `<code><a class="clickable-link" data-link-type="${linkType}" data-href="${inner}" title="${tip}">${inner}</a></code>`
    }
    return code
  })

  return text
})

/**
 * 单击事件委托：打开链接/路径
 */
const handleLinkClick = async (e) => {
  const link = e.target.closest('.clickable-link')
  if (!link) return

  e.preventDefault()
  e.stopPropagation()
  const type = link.dataset.linkType
  const href = link.dataset.href

  if (!href) return

  if (type === 'url') {
    await window.electronAPI.openExternal(href)
  } else if (type === 'path') {
    await window.electronAPI.openPath(href)
  }
}

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

.bubble-body :deep(.clickable-link) {
  color: var(--primary-color);
  text-decoration: none;
  cursor: pointer;
  border-bottom: 1px dashed var(--primary-color);
  opacity: 0.85;
  transition: opacity 0.15s;
}

.bubble-body :deep(.clickable-link:hover) {
  opacity: 1;
  border-bottom-style: solid;
}

.bubble-body :deep(code .clickable-link) {
  border-bottom: none;
  opacity: 1;
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 2px;
}

.message-bubble.user .bubble-body :deep(.clickable-link) {
  color: rgba(255, 255, 255, 0.9);
  border-bottom-color: rgba(255, 255, 255, 0.5);
}

.message-bubble.user .bubble-body :deep(.clickable-link:hover) {
  color: white;
  border-bottom-color: white;
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

<template>
  <div class="message-bubble" :class="[message.role]">
    <div class="bubble-avatar">
      <Icon :name="message.role === 'user' ? 'user' : 'robot'" :size="16" />
    </div>
    <div class="bubble-content">
      <!-- 钉钉来源标识 -->
      <div v-if="message.source === 'dingtalk' && message.senderNick" class="dingtalk-sender">
        {{ message.senderNick }}（钉钉）
      </div>
      <!-- 图片区域（如果消息包含图片） -->
      <div v-if="message.images && message.images.length > 0" class="bubble-images">
        <div
          v-for="(img, index) in message.images"
          :key="index"
          class="bubble-image-item"
          @click="handleImageClick(img)"
        >
          <img
            :src="`data:${img.mediaType};base64,${img.base64}`"
            :alt="`Image ${index + 1}`"
            class="bubble-image"
          />
        </div>
      </div>
      <!-- 文字内容（过滤掉 [图片] 占位符） -->
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

const emit = defineEmits(['preview-image', 'preview-link', 'preview-path'])

const bodyRef = ref(null)

/**
 * HTML 转义函数
 */
const escapeHtml = (str) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * 简单的 Markdown 渲染（代码块、加粗、斜体、链接、路径）
 */
const renderedContent = computed(() => {
  let text = props.message.content || ''

  // 如果有图片且内容只是 [图片] 占位符，不显示文字
  if (props.message.images && props.message.images.length > 0 && text === '[图片]') {
    return ''
  }

  // 步骤1：提取代码块（保存原始未转义内容）
  const codeBlocks = []
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push({ lang, code })
    return `\x00CB${codeBlocks.length - 1}\x00`
  })

  // 步骤2：提取行内代码（保存原始未转义内容）
  const inlineCodes = []
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    inlineCodes.push(code)
    return `\x00IC${inlineCodes.length - 1}\x00`
  })

  // 步骤3：转义剩余的文本（这时代码已被占位符替换）
  text = escapeHtml(text)

  // 加粗
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // URL 链接（http:// 或 https://）
  text = text.replace(/(https?:\/\/[^\s<>&"')\]]+)/g,
    '<a class="clickable-link" data-link-type="url" data-href="$1" title="单击预览 · Ctrl+单击打开">$1</a>')

  // Windows 绝对路径（C:\... D:\...）
  text = text.replace(/([A-Z]):(\\[^\s<>&"',:*?]+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1:$2" title="单击预览 · Ctrl+单击打开">$1:$2</a>')

  // Unix 绝对路径（/home/... /usr/... /tmp/... 等）
  text = text.replace(/(\/(?:home|usr|etc|tmp|var|opt|mnt|srv|root|Users|Library|Applications|Volumes)[^\s<>&"']+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1" title="单击预览 · Ctrl+单击打开">$1</a>')

  // 相对路径（./... 或 ../...）
  text = text.replace(/(\.\.?\/[^\s<>&"']+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1" title="单击预览 · Ctrl+单击打开">$1</a>')

  // ~ 路径（~/...）
  text = text.replace(/(~\/[^\s<>&"']+)/g,
    '<a class="clickable-link" data-link-type="path" data-href="$1" title="单击预览 · Ctrl+单击打开">$1</a>')

  // 换行
  text = text.replace(/\n/g, '<br>')

  // 步骤4：还原代码块（转义后再插入）
  // 单行代码块如果整行是路径/URL，注入可点击链接
  text = text.replace(/\x00CB(\d+)\x00/g, (_, i) => {
    const { lang, code } = codeBlocks[i]
    const trimmed = code.trim()
    // 单行且匹配路径/URL 模式
    if (!trimmed.includes('\n')) {
      let linkType = ''
      if (/^https?:\/\//.test(trimmed)) {
        linkType = 'url'
      } else if (/^[A-Z]:\\/.test(trimmed) || /^\/.*[\\/.]/.test(trimmed) || /^\.\.?\//.test(trimmed) || /^~\//.test(trimmed)) {
        linkType = 'path'
      }
      if (linkType) {
        const escaped = escapeHtml(trimmed)
        return `<pre><code><a class="clickable-link" data-link-type="${linkType}" data-href="${escaped}" title="单击预览 · Ctrl+单击打开">${escaped}</a></code></pre>`
      }
    }
    return `<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`
  })

  // 步骤5：还原行内代码 — 如果内容是 URL/路径，注入可点击链接
  text = text.replace(/\x00IC(\d+)\x00/g, (_, i) => {
    const code = inlineCodes[i]
    let linkType = ''
    if (/^https?:\/\//.test(code)) {
      linkType = 'url'
    } else if (/^[A-Z]:\\/.test(code) || /^\/(?:home|usr|etc|tmp|var|opt|mnt|srv|root|Users|Library|Applications|Volumes)\//.test(code) || /^\.\.?\//.test(code) || /^~\//.test(code)) {
      linkType = 'path'
    }
    if (linkType) {
      const escapedCode = escapeHtml(code)
      return `<code><a class="clickable-link" data-link-type="${linkType}" data-href="${escapedCode}" title="单击预览 · Ctrl+单击打开">${escapedCode}</a></code>`
    }
    return `<code>${escapeHtml(code)}</code>`
  })

  return text
})

/**
 * 点击事件委托：普通点击预览，Ctrl+点击外部打开
 */
const handleLinkClick = async (e) => {
  const link = e.target.closest('.clickable-link')
  if (!link) return

  e.preventDefault()
  e.stopPropagation()
  const type = link.dataset.linkType
  const href = link.dataset.href

  if (!href) return

  // Ctrl/Cmd+点击：在外部打开
  if (e.ctrlKey || e.metaKey) {
    if (type === 'url') {
      await window.electronAPI.openExternal(href)
    } else if (type === 'path') {
      await window.electronAPI.openPath(href)
    }
  }
  // 普通点击：预览
  else {
    if (type === 'url') {
      // URL 链接：用 iframe 预览
      emit('preview-link', {
        type: 'url',
        name: href,
        url: href
      })
    } else if (type === 'path') {
      // 文件路径：请求后端读取文件并预览（文件）或打开（目录）
      emit('preview-path', href)
    }
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * 点击图片处理 - 在右侧面板预览
 */
const handleImageClick = (img) => {
  // 发射事件到父组件，传递图片数据
  emit('preview-image', {
    type: 'image',
    name: img.fileName || 'image.png',
    content: `data:${img.mediaType};base64,${img.base64}`,
    size: img.base64 ? Math.round((img.base64.length * 3) / 4) : 0, // base64 大小估算
    ext: `.${img.mediaType?.split('/')[1] || 'png'}`
  })
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

/* 图片显示区域 */
.bubble-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.bubble-image-item {
  max-width: 200px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  background: var(--bg-color-tertiary);
}

.bubble-image-item:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.bubble-image {
  width: 100%;
  height: auto;
  display: block;
  max-height: 200px;
  object-fit: cover;
}

/* 用户消息的图片样式 */
.message-bubble.user .bubble-images {
  justify-content: flex-end;
}

/* 钉钉来源标识 */
.dingtalk-sender {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-bottom: 4px;
  padding: 0 4px;
}

.message-bubble.user .dingtalk-sender {
  text-align: right;
  color: rgba(255, 255, 255, 0.7);
}
</style>

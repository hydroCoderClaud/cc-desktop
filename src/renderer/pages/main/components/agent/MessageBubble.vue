<template>
  <div class="message-bubble" :class="[message.role]" @contextmenu.prevent="handleContextMenu">
    <div class="bubble-avatar">
      <Icon :name="message.role === 'user' ? 'user' : 'robot'" :size="16" />
    </div>
    <div class="bubble-content">
      <!-- 钉钉来源标识 -->
      <div v-if="message.source === 'dingtalk' && message.senderNick" class="dingtalk-sender">
        {{ message.senderNick }}{{ t('agent.dingtalkSuffix') }}
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
      <div class="bubble-meta" v-if="message.timestamp || message.role === 'assistant'">
        <span v-if="message.timestamp">{{ formatTime(message.timestamp) }}</span>
        <button v-if="message.role === 'assistant'" class="bubble-save-btn" :title="t('agent.saveAsImage')" @click="saveAsImage">
          <Icon name="download" :size="12" />
        </button>
        <button v-if="message.role === 'assistant'" class="bubble-save-btn" :title="t('agent.copyContent')" @click="copyContent">
          <Icon name="copy" :size="12" />
        </button>
      </div>
    </div>
  </div>
  <ContextMenu ref="contextMenuRef" :items="contextMenuItems" @select="onContextMenuSelect" />
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '@components/icons/Icon.vue'
import ContextMenu from '@components/ContextMenu.vue'
import { useLocale } from '@composables/useLocale'
import { extractLatex, restoreLatex } from '@utils/latex-utils'

const { t } = useLocale()

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  sessionCwd: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['preview-image', 'preview-link', 'preview-path'])

const bodyRef = ref(null)
const TRAILING_SENTENCE_PUNCTUATION = /[。．，,；;：:！!？?]+$/
const UNMATCHED_TRAILING_BRACKETS = {
  '）': '（',
  ')': '(',
  '】': '【',
  ']': '[',
  '」': '「',
  '』': '『',
  '》': '《',
  '〉': '〈',
  '}': '{',
  '>': '<'
}

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

const trimTrailingPathPunctuation = (value) => {
  if (!value) return value

  let trimmed = value.replace(TRAILING_SENTENCE_PUNCTUATION, '')
  while (trimmed) {
    const trailingChar = trimmed.at(-1)
    const openingChar = UNMATCHED_TRAILING_BRACKETS[trailingChar]
    if (!openingChar) break

    const openingCount = [...trimmed].filter(char => char === openingChar).length
    const closingCount = [...trimmed].filter(char => char === trailingChar).length
    if (closingCount > openingCount) {
      trimmed = trimmed.slice(0, -1)
      continue
    }
    break
  }

  return trimmed
}

const wrapPathLink = (rawPath) => {
  const cleanPath = trimTrailingPathPunctuation(rawPath)
  if (!cleanPath) return rawPath

  const trailing = escapeHtml(rawPath.slice(cleanPath.length))
  const escapedPath = escapeHtml(cleanPath)
  return `<a class="clickable-link" data-link-type="path" data-href="${escapedPath}" title="单击预览 · Ctrl+单击打开">${escapedPath}</a>${trailing}`
}

const normalizePathForAction = async (rawPath) => {
  if (!rawPath) return rawPath

  let normalizedPath = trimTrailingPathPunctuation(rawPath)
  if (!normalizedPath) return rawPath

  if (/^\.\.?[/\\]/.test(normalizedPath) && props.sessionCwd) {
    normalizedPath = await window.electronAPI.resolvePath(props.sessionCwd, normalizedPath)
  }

  const sessionId = props.message?.sessionId || props.message?.conversationId || props.message?.conversation_id
  try {
    const fileData = await window.electronAPI.readAbsolutePath({
      filePath: normalizedPath,
      sessionId,
      confirmed: true
    })
    if (!fileData?.error) {
      return fileData.path || fileData.filePath || normalizedPath
    }
  } catch {
    // ignore and fall back to normalized path
  }

  return normalizedPath
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

  // 步骤3：提取 LaTeX 公式（代码块/行内代码已被占位符保护）
  const { text: latexProcessed, blocks: latexBlocks } = extractLatex(text)
  text = latexProcessed

  // 步骤4：转义剩余的文本（代码和 LaTeX 已被占位符替换）
  text = escapeHtml(text)

  // 加粗
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // URL 链接（http:// 或 https://）
  text = text.replace(/(https?:\/\/[^\s<>&"')\]]+)/g,
    '<a class="clickable-link" data-link-type="url" data-href="$1" title="单击预览 · Ctrl+单击打开">$1</a>')

  // Windows 绝对路径（C:\... D:\...）
  text = text.replace(/([A-Z]:(?:\\[^\n<>&"':*?]+)+)/g,
    (_, pathText) => wrapPathLink(pathText))

  // Unix 绝对路径（/home/... /usr/... /tmp/... 等）
  text = text.replace(/(\/(?:home|usr|etc|tmp|var|opt|mnt|srv|root|Users|Library|Applications|Volumes)[^\n<>&"']*)/g,
    (_, pathText) => wrapPathLink(pathText))

  // 相对路径（Unix: ./... 或 ../... | Windows: .\... 或 ..\...）
  text = text.replace(/(\.\.?[/\\][^\n<>&"']*)/g,
    (_, pathText) => wrapPathLink(pathText))

  // ~ 路径（~/...）
  text = text.replace(/(~\/[^\n<>&"']*)/g,
    (_, pathText) => wrapPathLink(pathText))

  // 换行
  text = text.replace(/\n/g, '<br>')

  // 步骤5：还原 LaTeX 公式（在代码还原之前）
  text = restoreLatex(text, latexBlocks)

  // 步骤6：还原代码块（转义后再插入）
  // 单行代码块如果整行是路径/URL，注入可点击链接
  text = text.replace(/\x00CB(\d+)\x00/g, (_, i) => {
    const { lang, code } = codeBlocks[i]
    const trimmed = code.trim()
    // 单行且匹配路径/URL 模式
    if (!trimmed.includes('\n')) {
      let linkType = ''
      if (/^https?:\/\//.test(trimmed)) {
        linkType = 'url'
      } else if (/^[A-Z]:\\/.test(trimmed) || /^\/.*[\\/.]/.test(trimmed) || /^\.\.?[/\\]/.test(trimmed) || /^~\//.test(trimmed)) {
        linkType = 'path'
      }
      if (linkType) {
        const cleanPath = linkType === 'path' ? trimTrailingPathPunctuation(trimmed) : trimmed
        const escaped = escapeHtml(cleanPath)
        const trailing = linkType === 'path' ? escapeHtml(trimmed.slice(cleanPath.length)) : ''
        return `<pre><code><a class="clickable-link" data-link-type="${linkType}" data-href="${escaped}" title="单击预览 · Ctrl+单击打开">${escaped}</a>${trailing}</code></pre>`
      }
    }
    return `<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`
  })

  // 步骤7：还原行内代码 — 如果内容是 URL/路径，注入可点击链接
  text = text.replace(/\x00IC(\d+)\x00/g, (_, i) => {
    const code = inlineCodes[i]
    let linkType = ''
    if (/^https?:\/\//.test(code)) {
      linkType = 'url'
    } else if (/^[A-Z]:\\/.test(code) || /^\/(?:home|usr|etc|tmp|var|opt|mnt|srv|root|Users|Library|Applications|Volumes)\//.test(code) || /^\.\.?[/\\]/.test(code) || /^~\//.test(code)) {
      linkType = 'path'
    }
    if (linkType) {
      const cleanCode = linkType === 'path' ? trimTrailingPathPunctuation(code) : code
      const escapedCode = escapeHtml(cleanCode)
      const trailing = linkType === 'path' ? escapeHtml(code.slice(cleanCode.length)) : ''
      return `<code><a class="clickable-link" data-link-type="${linkType}" data-href="${escapedCode}" title="单击预览 · Ctrl+单击打开">${escapedCode}</a>${trailing}</code>`
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

  let resolvedPath = href
  if (type === 'path') {
    resolvedPath = await normalizePathForAction(href)
  }

  // Ctrl/Cmd+点击：在外部打开
  if (e.ctrlKey || e.metaKey) {
    if (type === 'url') {
      await window.electronAPI.openExternal(href)
    } else if (type === 'path') {
      await window.electronAPI.openPath(resolvedPath)
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
      emit('preview-path', resolvedPath)
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

/**
 * 右键菜单
 */
const contextMenuRef = ref(null)
const contextMenuItems = ref([])

const handleContextMenu = (event) => {
  const sel = window.getSelection()?.toString() || ''
  const items = [
    { key: 'copy-selection', label: t('agent.copySelection'), disabled: !sel },
    { key: 'copy-content', label: t('agent.copyContent') }
  ]
  if (props.message.role === 'assistant') {
    items.push({ key: 'save-as-image', label: t('agent.saveAsImage') })
  }
  contextMenuItems.value = items
  contextMenuRef.value.show(event.clientX, event.clientY)
}

const onContextMenuSelect = async (key) => {
  if (key === 'copy-selection') {
    await navigator.clipboard.writeText(window.getSelection()?.toString() || '')
  } else if (key === 'copy-content') {
    await navigator.clipboard.writeText(props.message.content || '')
  } else if (key === 'save-as-image') {
    await saveAsImage()
  }
}

/**
 * 保存消息气泡为图片
 */
const saveAsImage = async () => {
  const el = bodyRef.value
  if (!el) return

  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(el, {
      backgroundColor: getComputedStyle(el).backgroundColor || '#ffffff',
      scale: 2,
      useCORS: true
    })
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `message-${timestamp}.png`

    const res = await window.electronAPI.saveImage({
      filename,
      base64,
      dir: props.sessionCwd || null
    })
    if (res?.success && res.filePath) {
      emit('preview-image', {
        type: 'image',
        name: filename,
        content: dataUrl,
        size: Math.round((base64.length * 3) / 4),
        ext: '.png'
      })
    }
  } catch (err) {
    console.error('[MessageBubble] Save as image failed:', err)
  }
}

const copyContent = async () => {
  await navigator.clipboard.writeText(props.message.content || '')
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
  background: unset;
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
  position: relative;
}

.bubble-body {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
  border: 1px solid transparent;
  transition: border-color 0.15s;
}

.message-bubble:hover .bubble-body {
  border-color: var(--primary-color);
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

.message-bubble.user .bubble-body :deep(code:not(pre code)) {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.95);
}

.message-bubble.user .bubble-body :deep(.clickable-link:hover) {
  color: white;
  border-bottom-color: white;
}

/* hover 操作栏 - 已移除，按钮内联到 bubble-meta */

.bubble-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-top: 4px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.message-bubble.user .bubble-meta {
  justify-content: flex-end;
}

.bubble-save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
  padding: 0;
}

.bubble-content:hover .bubble-save-btn {
  opacity: 1;
}

.bubble-save-btn:hover {
  background: var(--bg-color-tertiary);
  color: var(--primary-color);
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
}

/* KaTeX 公式样式 */
.bubble-body :deep(.katex-display) {
  margin: 8px 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.message-bubble.user .bubble-body :deep(.katex) {
  color: white;
}
</style>

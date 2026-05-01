<template>
  <div class="message-bubble" :class="[message.role]" @contextmenu.prevent="handleContextMenu">
    <div class="bubble-avatar">
      <Icon :name="message.role === 'user' ? 'user' : 'robot'" :size="16" />
    </div>
    <div class="bubble-content">
      <div class="bubble-capture" ref="captureRef">
        <!-- 外部来源标识 -->
        <div v-if="externalSenderLabel" class="external-sender">
          {{ externalSenderLabel }}
        </div>
        <!-- 图片区域（如果消息包含图片） -->
        <div v-if="message.images && message.images.length > 0" class="bubble-images">
          <div
            v-for="(img, index) in message.images"
            :key="index"
            class="bubble-image-item"
            @click="handleImageClick(img)"
            @contextmenu.prevent.stop="handleImageContextMenu($event, img)"
          >
            <img
              :src="`data:${img.mediaType};base64,${img.base64}`"
              :alt="`Image ${index + 1}`"
              class="bubble-image"
            />
          </div>
        </div>
        <!-- 文字内容（过滤掉 [图片] 占位符） -->
        <div
          class="bubble-body"
          :class="{ 'user-clamped': shouldClampUserMessage && isUserCollapsed, 'user-toggleable': shouldClampUserMessage }"
          ref="bodyRef"
          v-html="renderedContent"
          @click="handleBubbleBodyClick"
        ></div>
        <div v-if="shouldClampUserMessage" class="bubble-expand-row">
          <button class="bubble-expand-btn" @click="toggleUserCollapse">
            {{ isUserCollapsed ? t('common.expand') : t('common.collapse') }}
          </button>
        </div>
      </div>
      <div class="bubble-meta" :class="{ 'notebook-actions': isNotebookAssistant }" v-if="message.timestamp || message.role === 'assistant'">
        <span v-if="message.timestamp">{{ formatTime(message.timestamp) }}</span>
        <template v-if="message.role === 'assistant' && !isNotebookMode">
          <button class="bubble-save-btn" :title="t('agent.saveAsImage')" @click="saveAsImage">
            <Icon name="download" :size="12" />
          </button>
          <button class="bubble-save-btn" :title="t('agent.copyContent')" @click="copyContent">
            <Icon name="copy" :size="12" />
          </button>
        </template>
        <template v-else-if="isNotebookAssistant">
          <button class="bubble-save-btn" :title="t('notebook.chat.saveImageToSource')" @click="emitNotebookImageAction('save-image-to-source')">
            <Icon name="imageArrowLeft" :size="12" />
          </button>
          <button class="bubble-save-btn" :title="t('notebook.chat.saveImageToAchievement')" @click="emitNotebookImageAction('save-image-to-achievement')">
            <Icon name="imageArrowRight" :size="12" />
          </button>
          <button class="bubble-save-btn" :title="t('agent.copyContent')" @click="copyContent">
            <Icon name="copy" :size="12" />
          </button>
          <button class="bubble-save-btn" :title="t('notebook.chat.copyContentToSource')" @click="copyContentToSource">
            <Icon name="copyArrowLeft" :size="12" />
          </button>
          <button class="bubble-save-btn" :title="t('notebook.chat.copyContentToAchievement')" @click="copyContentToAchievement">
            <Icon name="copyArrowRight" :size="12" />
          </button>
        </template>
      </div>
    </div>
  </div>
  <ContextMenu ref="contextMenuRef" :items="contextMenuItems" @select="onContextMenuSelect" />
</template>

<script setup>
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import ContextMenu from '@components/ContextMenu.vue'
import { useLocale } from '@composables/useLocale'
import { renderMessageHtml, trimTrailingPathPunctuation } from '@utils/message-render-utils'

const { t } = useLocale()
const messageApi = useMessage()

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  sessionCwd: {
    type: String,
    default: null
  },
  chatMode: {
    type: String,
    default: 'agent'
  }
})

const emit = defineEmits([
  'preview-image',
  'preview-link',
  'preview-path',
  'save-image-to-source',
  'save-image-to-achievement',
  'copy-content-to-source',
  'copy-content-to-achievement',
  'add-path-to-source',
  'add-path-to-achievement'
])

const bodyRef = ref(null)
const captureRef = ref(null)
const isUserCollapsed = ref(true)
const isUserOverflowing = ref(false)
const isNotebookMode = computed(() => props.chatMode === 'notebook')
const isNotebookAssistant = computed(() => isNotebookMode.value && props.message.role === 'assistant')
const shouldClampUserMessage = computed(() => isNotebookMode.value && props.message.role === 'user' && isUserOverflowing.value)
const externalSenderLabel = computed(() => {
  if (!props.message.senderNick) return ''
  if (props.message.source === 'dingtalk') return `${props.message.senderNick}${t('agent.dingtalkSuffix')}`
  if (props.message.source === 'weixin') return `${props.message.senderNick}${t('agent.weixinSuffix')}`
  return ''
})
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
  return renderMessageHtml(text, {
    platform: window.electronAPI?.platform || 'win32'
  })
})

const measureUserClampState = async () => {
  if (!isNotebookMode.value || props.message.role !== 'user') {
    isUserOverflowing.value = false
    isUserCollapsed.value = true
    return
  }
  await nextTick()
  const el = bodyRef.value
  if (!el) return
  const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 22.4
  const maxHeight = lineHeight * 10 + 2
  const overflow = el.scrollHeight > maxHeight
  isUserOverflowing.value = overflow
  isUserCollapsed.value = overflow
}

const toggleUserCollapse = () => {
  if (!isUserOverflowing.value) return
  isUserCollapsed.value = !isUserCollapsed.value
}

watch(() => props.message.content, () => {
  isUserCollapsed.value = true
  measureUserClampState()
})

watch(() => props.chatMode, () => {
  isUserCollapsed.value = true
  measureUserClampState()
})

onMounted(() => {
  measureUserClampState()
})

const handleBubbleBodyClick = async (e) => {
  const link = e.target.closest('.clickable-link')
  if (link) {
    await handleLinkClick(e)
    return
  }

  if (!(isNotebookMode.value && props.message.role === 'user' && isUserOverflowing.value)) {
    return
  }

  // 选中文本时不触发展开收起
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) return

  toggleUserCollapse()
}

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

const buildImagePreviewPayload = (img) => ({
  dataUrl: `data:${img.mediaType};base64,${img.base64}`,
  message: props.message,
  filename: img.fileName || 'image.png'
})

/**
 * 右键菜单
 */
const contextMenuRef = ref(null)
const contextMenuItems = ref([])
const contextMenuPath = ref(null)
const contextMenuImageData = ref(null)

const handleImageContextMenu = (event, img) => {
  if (!isNotebookMode.value) {
    handleContextMenu(event)
    return
  }

  contextMenuPath.value = null
  contextMenuImageData.value = buildImagePreviewPayload(img)
  contextMenuItems.value = [
    { key: 'save-image-to-source', label: t('notebook.chat.saveImageToSource') },
    { key: 'save-image-to-achievement', label: t('notebook.chat.saveImageToAchievement') }
  ]
  contextMenuRef.value.show(event.clientX, event.clientY)
}

const handleContextMenu = async (event) => {
  const sel = window.getSelection()?.toString() || ''
  const link = event.target?.closest?.('.clickable-link')
  const linkType = link?.dataset?.linkType
  const linkHref = link?.dataset?.href
  contextMenuPath.value = null
  contextMenuImageData.value = null
  const items = [
    { key: 'copy-selection', label: t('agent.copySelection'), disabled: !sel },
    { key: 'copy-content', label: t('agent.copyContent') }
  ]

  if (isNotebookMode.value && linkType === 'path' && linkHref) {
    const resolvedPath = await normalizePathForAction(linkHref)
    const sessionId = props.message?.sessionId || props.message?.conversationId || props.message?.conversation_id
    try {
      const fileData = await window.electronAPI.readAbsolutePath({
        filePath: resolvedPath,
        sessionId,
        confirmed: true
      })

      if (!fileData?.error && fileData?.type !== 'directory') {
        contextMenuPath.value = fileData.path || fileData.filePath || resolvedPath
        items.push(
          { key: 'add-path-to-source', label: t('notebook.chat.addLinkToSource') },
          { key: 'add-path-to-achievement', label: t('notebook.chat.addLinkToAchievement') }
        )
      }
    } catch {
      contextMenuPath.value = null
    }
  }

  if (props.message.role === 'assistant') {
    if (isNotebookMode.value) {
      items.push(
        { key: 'save-image-to-source', label: t('notebook.chat.saveImageToSource') },
        { key: 'save-image-to-achievement', label: t('notebook.chat.saveImageToAchievement') },
        { key: 'copy-content-to-source', label: t('notebook.chat.copyContentToSource') },
        { key: 'copy-content-to-achievement', label: t('notebook.chat.copyContentToAchievement') }
      )
    } else {
      items.push({ key: 'save-as-image', label: t('agent.saveAsImage') })
    }
  }
  contextMenuItems.value = items
  contextMenuRef.value.show(event.clientX, event.clientY)
}

const onContextMenuSelect = async (key) => {
  if (key === 'copy-selection') {
    await navigator.clipboard.writeText(window.getSelection()?.toString() || '')
  } else if (key === 'copy-content') {
    await copyContent()
  } else if (key === 'save-as-image') {
    await saveAsImage()
  } else if (key === 'save-image-to-source') {
    if (contextMenuImageData.value) {
      emit('save-image-to-source', contextMenuImageData.value)
    } else {
      await emitNotebookImageAction('save-image-to-source')
    }
  } else if (key === 'save-image-to-achievement') {
    if (contextMenuImageData.value) {
      emit('save-image-to-achievement', contextMenuImageData.value)
    } else {
      await emitNotebookImageAction('save-image-to-achievement')
    }
  } else if (key === 'copy-content-to-source') {
    await copyContentToSource()
  } else if (key === 'copy-content-to-achievement') {
    await copyContentToAchievement()
  } else if (key === 'add-path-to-source' || key === 'add-path-to-achievement') {
    if (!contextMenuPath.value) return
    const resolvedPath = await normalizePathForAction(contextMenuPath.value)
    emit(key === 'add-path-to-source' ? 'add-path-to-source' : 'add-path-to-achievement', {
      filePath: resolvedPath,
      message: props.message
    })
  }
}

/**
 * 保存消息气泡为图片
 */
const captureBubbleAsDataUrl = async () => {
  const el = captureRef.value || bodyRef.value
  if (!el) return null

  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(el, {
    backgroundColor: getComputedStyle(el).backgroundColor || '#ffffff',
    scale: 2,
    useCORS: true
  })
  return canvas.toDataURL('image/png')
}

const saveAsImage = async () => {
  try {
    const dataUrl = await captureBubbleAsDataUrl()
    if (!dataUrl) return
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
      messageApi.success(t('agent.imageSaved'))
    }
  } catch (err) {
    console.error('[MessageBubble] Save as image failed:', err)
  }
}

const emitNotebookImageAction = async (eventName) => {
  try {
    const dataUrl = await captureBubbleAsDataUrl()
    if (!dataUrl) return
    emit(eventName, { dataUrl, message: props.message })
  } catch (err) {
    console.error(`[MessageBubble] ${eventName} failed:`, err)
  }
}

const copyContent = async () => {
  await navigator.clipboard.writeText(props.message.content || '')
  messageApi.success(t('common.copySuccess'))
}

const copyContentToSource = async () => {
  emit('copy-content-to-source', { content: props.message.content || '', message: props.message })
}

const copyContentToAchievement = async () => {
  emit('copy-content-to-achievement', { content: props.message.content || '', message: props.message })
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

.message-bubble.user .bubble-body.user-clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 10;
  overflow: hidden;
}

.message-bubble.user .bubble-body.user-toggleable {
  cursor: pointer;
}

.bubble-expand-row {
  margin-top: 4px;
  padding: 0 4px;
}

.message-bubble.user .bubble-expand-row {
  display: flex;
  justify-content: flex-end;
}

.bubble-expand-btn {
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
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
  flex-wrap: wrap;
}

.bubble-meta.notebook-actions {
  gap: 6px;
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

.bubble-meta.notebook-actions .bubble-save-btn {
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

/* 外部来源标识 */
.external-sender {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-bottom: 4px;
  padding: 0 4px;
}

.message-bubble.user .external-sender {
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

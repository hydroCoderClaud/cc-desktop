<template>
  <div class="chat-input-area" ref="chatInputAreaRef" :class="{ expanded: isExpanded }">
    <div ref="inputToolbarRef">
      <ChatInputToolbar
        :model-value="modelValue"
        :model-options="modelOptions"
        :context-tokens="contextTokens"
        :queue-enabled="queueEnabled"
        :is-expanded="isExpanded"
        :session-id="sessionId"
        :session-type="sessionType"
        :draft-text="inputText"
        @update:model-value="$emit('update:modelValue', $event)"
        @toggle-queue="$emit('update:queueEnabled', !queueEnabled)"
        @toggle-expanded="toggleExpanded"
        @schedule="handleSchedule"
        @trigger-image-upload="triggerImageUpload"
        @clear="handleClear"
        @use-capability="useCapability"
      />
    </div>
    <input
      ref="imageInputRef"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      multiple
      style="display: none"
      @change="handleImageUpload"
    />

    <div v-if="attachedImages.length > 0" ref="imagePreviewRef">
      <ChatInputImagePreview :images="attachedImages" @remove="removeImage" />
    </div>

    <!-- 输入区域 -->
    <div class="input-wrapper" ref="inputWrapperRef">
      <!-- Slash 命令面板 -->
      <ChatInputSlashPanel
        :show="showSlashPanel"
        :unavailable="showSlashUnavailableHint"
        :commands="filteredCommands"
        :active-index="slashActiveIndex"
        @select="selectSlashCommand"
        @hover="slashActiveIndex = $event"
      />

      <textarea
        ref="textareaRef"
        v-model="inputText"
        :placeholder="placeholder"
        :disabled="disabled"
        class="chat-textarea"
        :rows="collapsedRows"
        :style="textareaStyle"
        @input="handleInput"
        @keydown="handleKeyDown"
        @paste="handlePaste"
        @contextmenu.prevent="handleInputContextMenu"
      />
      <ChatInputQueuePanel :queue="messageQueue" @update:queue="messageQueue = $event" />

      <!-- Suffix Slot (e.g. for Notebook Source Count) -->
      <slot name="suffix"></slot>

      <!-- 停止/发送按钮 -->
      <button
        v-if="isStreaming"
        class="stop-btn"
        @click="$emit('cancel')"
        :title="t('agent.stopGeneration')"
      >
        <Icon name="stop" :size="18" />
      </button>
      <button
        v-else
        class="send-btn"
        :disabled="(!inputText.trim() && attachedImages.length === 0) || disabled"
        @click="handleSend"
        :title="t('agent.send')"
      >
        <Icon name="send" :size="18" />
      </button>
    </div>
  </div>
  <ContextMenu ref="inputContextMenuRef" :items="inputContextMenuItems" @select="onInputContextMenuSelect" />
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import ContextMenu from '@components/ContextMenu.vue'
import ChatInputToolbar from './ChatInputToolbar.vue'
import ChatInputImagePreview from './ChatInputImagePreview.vue'
import ChatInputSlashPanel from './ChatInputSlashPanel.vue'
import ChatInputQueuePanel from './ChatInputQueuePanel.vue'
import {
  readFileAsBase64,
  getImageMediaType,
  getBase64Size,
  isImageTooLarge,
  formatFileSize,
  isSupportedImageType
} from '@/utils/image-utils'
import {
  buildBuiltinSlashCommands,
  filterSlashCommands,
  mergeSlashCommands,
  normalizeSlashCommands,
  shouldAutoSubmitSlashCommand
} from '@utils/slash-commands'
import {
  shouldOpenSlashPanel,
  shouldBlockAsUnavailableSlash
} from '@utils/chat-input-utils'

const { t } = useLocale()

const props = defineProps({
  isStreaming: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  placeholder: {
    type: String,
    default: ''
  },
  modelValue: {
    type: String,
    default: 'claude-sonnet-4-6'
  },
  contextTokens: {
    type: Number,
    default: 0
  },
  slashCommands: {
    type: Array,
    default: () => []
  },
  slashCommandsSupported: {
    type: Boolean,
    default: true
  },
  enableSlashCommands: {
    type: Boolean,
    default: true
  },
  modelOptions: {
    type: Array,
    default: () => []
  },
  queueEnabled: {
    type: Boolean,
    default: true
  },
  collapsedRows: {
    type: Number,
    default: 3
  },
  collapsedMaxHeight: {
    type: Number,
    default: 200
  },
  collapsedMinHeight: {
    type: Number,
    default: 0
  },
  expandedHeightRatio: {
    type: Number,
    default: 3 / 4
  },
  sessionId: {
    type: String,
    default: null
  },
  sessionType: {
    type: String,
    default: 'chat'
  }
})

const emit = defineEmits(['send', 'cancel', 'schedule', 'update:modelValue', 'update:queueEnabled', 'enqueue', 'input-change'])

const useCapability = (cap) => {
  if (props.isStreaming && !props.queueEnabled) return
  const prefix = cap.type === 'agent' ? '@' : '/'
  const text = `${prefix}${cap.id}`
  if (props.isStreaming) {
    if (messageQueue.value.length >= MAX_QUEUE_SIZE) return
    messageQueue.value.push({ id: ++queueIdCounter, text })
    emit('enqueue', text)
  } else {
    emit('send', text)
  }
}

// ============================
// Slash 命令面板
// ============================

const builtinCommands = computed(() => buildBuiltinSlashCommands(t))
const normalizedSdkCommands = computed(() =>
  normalizeSlashCommands(props.slashCommands, {
    source: 'sdk',
    icon: 'zap',
    autoSubmit: false
  })
)

const allCommands = computed(() => {
  if (!props.enableSlashCommands) return []
  return mergeSlashCommands(builtinCommands.value, normalizedSdkCommands.value)
})

const showSlashPanel = ref(false)
const slashActiveIndex = ref(0)
const slashFilter = ref('')
const showSlashUnavailableHint = computed(() => props.slashCommandsSupported && !props.enableSlashCommands)

const filteredCommands = computed(() => filterSlashCommands(allCommands.value, slashFilter.value))

// 监听 filteredCommands 变化，重置索引
watch(filteredCommands, () => {
  slashActiveIndex.value = 0
})

const selectSlashCommand = (cmd) => {
  inputText.value = cmd.argumentHint ? `${cmd.name} ` : cmd.name
  showSlashPanel.value = false
  emit('input-change', inputText.value)
  nextTick(() => {
    autoResize()
    focus()
  })

  if (shouldAutoSubmitSlashCommand(cmd)) {
    handleSend()
  }
}

// ============================
// 输入与发送
// ============================
const inputText = ref('')
const textareaRef = ref(null)
const inputWrapperRef = ref(null)
const chatInputAreaRef = ref(null)
const inputToolbarRef = ref(null)
const imagePreviewRef = ref(null)
const isExpanded = ref(false)
const expandedTextareaHeight = ref(0)

const textareaStyle = computed(() => {
  if (!isExpanded.value || !expandedTextareaHeight.value) return {}
  return {
    height: `${expandedTextareaHeight.value}px`,
    maxHeight: 'none'
  }
})

const getWrapperVerticalPadding = () => {
  if (!inputWrapperRef.value) return 0
  const styles = window.getComputedStyle(inputWrapperRef.value)
  return (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)
}

const applyCollapsedHeight = () => {
  if (!textareaRef.value) return
  textareaRef.value.style.height = 'auto'
  const minHeight = Math.max(0, Number(props.collapsedMinHeight) || 0)
  const maxHeight = Math.max(minHeight, Number(props.collapsedMaxHeight) || 200)
  const nextHeight = Math.min(textareaRef.value.scrollHeight, maxHeight)
  textareaRef.value.style.height = `${Math.max(nextHeight, minHeight)}px`
}

const updateExpandedLayout = () => {
  if (!isExpanded.value || !textareaRef.value) return
  const host = chatInputAreaRef.value?.parentElement
  const hostHeight = host?.clientHeight || window.innerHeight
  const toolbarHeight = inputToolbarRef.value?.offsetHeight || 0
  const previewHeight = imagePreviewRef.value?.offsetHeight || 0
  const wrapperPadding = getWrapperVerticalPadding()
  const actionAreaHeight = 52
  const reservedHeight = toolbarHeight + previewHeight + wrapperPadding + actionAreaHeight + 28
  const targetHeight = Math.round(hostHeight * props.expandedHeightRatio) - reservedHeight
  expandedTextareaHeight.value = Math.max(180, targetHeight)
}

const autoResize = () => {
  nextTick(() => {
    if (!textareaRef.value) return
    if (isExpanded.value) {
      updateExpandedLayout()
      return
    }
    applyCollapsedHeight()
  })
}

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
  nextTick(() => {
    if (isExpanded.value) {
      updateExpandedLayout()
    } else {
      expandedTextareaHeight.value = 0
      applyCollapsedHeight()
    }
    focus()
  })
}

const handleInput = () => {
  autoResize()
  emit('input-change', inputText.value)

  // 检测 slash 命令
  const text = inputText.value
  if (shouldOpenSlashPanel({ text, slashCommandsSupported: props.slashCommandsSupported })) {
    showSlashPanel.value = true
    slashFilter.value = text
  } else {
    showSlashPanel.value = false
    slashFilter.value = ''
  }
}

const handleKeyDown = (event) => {
  // Slash 面板激活时的键盘导航
  if (showSlashPanel.value) {
    if (showSlashUnavailableHint.value) {
      if (event.key === 'Escape') {
        event.preventDefault()
        showSlashPanel.value = false
      }
    } else if (filteredCommands.value.length === 0) {
      if (event.key === 'Escape') {
        event.preventDefault()
        showSlashPanel.value = false
      }
      return
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      slashActiveIndex.value = Math.min(slashActiveIndex.value + 1, filteredCommands.value.length - 1)
      return
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      slashActiveIndex.value = Math.max(slashActiveIndex.value - 1, 0)
      return
    } else if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
      if (filteredCommands.value.length > 0) {
        event.preventDefault()
        selectSlashCommand(filteredCommands.value[slashActiveIndex.value])
        return
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      showSlashPanel.value = false
      return
    }
  }

  // 普通模式：Enter 发送，Shift+Enter 换行
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }

  // Ctrl+L: 清空输入框
  if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
    event.preventDefault()
    handleClear()
  }
}

// 消息队列（流式输出期间暂存）
const messageQueue = ref([])
const MAX_QUEUE_SIZE = 10
let queueIdCounter = 0

const clearQueue = () => {
  messageQueue.value = []
}

const dequeue = () => {
  if (messageQueue.value.length === 0) return null
  const item = messageQueue.value.shift()
  return item.text
}

// ============================
// 图片上传与处理
// ============================
const attachedImages = ref([])
const imageInputRef = ref(null)
let imageIdCounter = 0
const MAX_IMAGE_SIZE_MB = 5
const MAX_IMAGES = 4  // 最多4张图片

const triggerImageUpload = () => {
  if (props.disabled) return
  imageInputRef.value?.click()
}

const handleImageUpload = async (event) => {
  const files = Array.from(event.target.files)
  await processImages(files)
  // 清空 input，允许重复选择相同文件
  event.target.value = ''
}

const handlePaste = async (event) => {
  const items = Array.from(event.clipboardData.items)
  const imageItems = items.filter(item => item.type.startsWith('image/'))

  if (imageItems.length > 0) {
    event.preventDefault()  // 阻止默认粘贴行为
    const files = await Promise.all(
      imageItems.map(item => item.getAsFile())
    ).then(files => files.filter(f => f !== null))

    await processImages(files)
  }
}

const processImages = async (files) => {
  if (files.length === 0) return

  // 检查数量限制
  const remaining = MAX_IMAGES - attachedImages.value.length
  if (remaining <= 0) {
    window.electronAPI?.showNotification({
      title: t('agent.imageUploadTitle'),
      body: t('agent.imageLimitReached', { max: MAX_IMAGES })
    })
    return
  }

  const filesToProcess = files.slice(0, remaining)

  for (const file of filesToProcess) {
    // 检查文件类型
    if (!isSupportedImageType(file)) {
      console.warn(`Unsupported image type: ${file.type}`)
      continue
    }

    try {
      const base64 = await readFileAsBase64(file)
      const mediaType = getImageMediaType(file)
      const sizeBytes = getBase64Size(base64)
      const warning = isImageTooLarge(base64, MAX_IMAGE_SIZE_MB)

      attachedImages.value.push({
        id: ++imageIdCounter,
        base64,
        mediaType,
        sizeBytes,
        sizeText: formatFileSize(sizeBytes),
        warning,
        fileName: file.name || 'image'
      })
    } catch (error) {
      console.error('Failed to process image:', error)
    }
  }
}

const removeImage = (index) => {
  attachedImages.value.splice(index, 1)
}

watch(() => attachedImages.value.length, () => {
  if (!isExpanded.value) return
  nextTick(() => {
    updateExpandedLayout()
  })
})

const handleClear = () => {
  inputText.value = ''
  attachedImages.value = []
  emit('input-change', '')
  nextTick(autoResize)
}

const handleSchedule = () => {
  emit('schedule', inputText.value.trim())
}

const handleSend = () => {
  const text = inputText.value.trim()
  // 有文本或有图片才能发送
  if ((!text && attachedImages.value.length === 0) || props.disabled) return
  // 队列关闭时，流式输出中禁止发送
  if (props.isStreaming && !props.queueEnabled) return

  if (shouldBlockAsUnavailableSlash({ text, slashUnavailable: showSlashUnavailableHint.value })) {
    showSlashPanel.value = false
    window.electronAPI?.showNotification({
      title: t('agent.slashDisabledTitle'),
      body: t('agent.slashDisabledHint')
    })
    return
  }

  showSlashPanel.value = false

  // 构建消息对象
  const message = {
    text,
    images: attachedImages.value.map(img => ({
      base64: img.base64,
      mediaType: img.mediaType,
      sizeBytes: img.sizeBytes,
      warning: img.warning
    }))
  }

  if (props.isStreaming) {
    // 流式输出中 → 加入队列（上限 MAX_QUEUE_SIZE 条）
    // 注意：队列暂不支持图片，仅支持文本
    if (messageQueue.value.length >= MAX_QUEUE_SIZE) return
    if (attachedImages.value.length > 0) {
      // 有图片时，不允许加入队列，提示用户等待
      window.electronAPI?.showNotification({
        title: t('agent.queueTitle'),
        body: t('agent.imageQueueNotSupported')
      })
      return
    }
    messageQueue.value.push({ id: ++queueIdCounter, text })
    emit('enqueue', text)
  } else {
    // 根据是否有图片决定发送格式
    if (attachedImages.value.length > 0) {
      // 有图片：发送对象格式
      emit('send', message)
    } else {
      // 无图片：发送纯文本（兼容旧代码）
      emit('send', text)
    }
  }

  // 清空输入和图片
  inputText.value = ''
  attachedImages.value = []
  nextTick(autoResize)
}

// ============================
// 点击外部关闭
// ============================
const handleClickOutside = (e) => {
  if (inputWrapperRef.value && !inputWrapperRef.value.contains(e.target)) {
    showSlashPanel.value = false
  }
}

const handleWindowResize = () => {
  if (!isExpanded.value) return
  updateExpandedLayout()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', handleWindowResize)
  focus()
  if (props.collapsedRows !== 3 || props.collapsedMinHeight > 0 || props.collapsedMaxHeight !== 200) {
    nextTick(() => {
      applyCollapsedHeight()
    })
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', handleWindowResize)
})

const focus = () => {
  textareaRef.value?.focus()
}

const setText = (text) => {
  inputText.value = typeof text === 'string' ? text : ''
  attachedImages.value = []
  showSlashPanel.value = false
  slashFilter.value = ''
  emit('input-change', inputText.value)
  nextTick(() => {
    autoResize()
    const textarea = textareaRef.value
    if (!textarea) return
    const position = inputText.value.length
    textarea.focus()
    textarea.setSelectionRange(position, position)
  })
}

// 插入文本到输入框（光标位置或末尾）
const insertText = (text) => {
  const textarea = textareaRef.value
  if (!textarea) {
    // 如果 textarea 未挂载，直接追加到末尾
    inputText.value += text
    return
  }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = inputText.value

  // 插入到光标位置
  inputText.value = value.substring(0, start) + text + value.substring(end)

  // 恢复光标位置（光标移动到插入文本后）
  nextTick(() => {
    const newPosition = start + text.length
    textarea.setSelectionRange(newPosition, newPosition)
    textarea.focus()
  })
}

// ============================
// 输入框右键菜单
// ============================
const inputContextMenuRef = ref(null)
const inputContextMenuItems = ref([])

const handleInputContextMenu = (event) => {
  const textarea = textareaRef.value
  const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd
  inputContextMenuItems.value = [
    { key: 'cut', label: t('common.cut'), shortcut: 'Ctrl+X', disabled: !hasSelection },
    { key: 'copy', label: t('common.copy'), shortcut: 'Ctrl+C', disabled: !hasSelection },
    { key: 'paste', label: t('common.paste'), shortcut: 'Ctrl+V' }
  ]
  inputContextMenuRef.value.show(event.clientX, event.clientY)
}

const onInputContextMenuSelect = async (key) => {
  const textarea = textareaRef.value
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  if (key === 'cut') {
    const selected = inputText.value.substring(start, end)
    await navigator.clipboard.writeText(selected)
    inputText.value = inputText.value.substring(0, start) + inputText.value.substring(end)
    nextTick(() => textarea.setSelectionRange(start, start))
  } else if (key === 'copy') {
    await navigator.clipboard.writeText(inputText.value.substring(start, end))
  } else if (key === 'paste') {
    // 优先尝试读取图片
    try {
      const clipItems = await navigator.clipboard.read()
      const imageItem = clipItems.find(item => item.types.some(t => t.startsWith('image/')))
      if (imageItem) {
        const imageType = imageItem.types.find(t => t.startsWith('image/'))
        const blob = await imageItem.getType(imageType)
        const file = new File([blob], 'pasted-image.png', { type: imageType })
        await processImages([file])
        return
      }
    } catch {
      // clipboard.read() 权限被拒绝时降级为文本粘贴
    }
    const text = await navigator.clipboard.readText()
    insertText(text)
  }
}

defineExpose({ focus, messageQueue, dequeue, clearQueue, insertText, setText })
</script>

<style scoped>
.chat-input-area {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-color);
}

/* Input wrapper */
.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px 12px;
  transition: border-color 0.2s;
  position: relative;
}

.input-wrapper:focus-within {
  border-color: var(--primary-color);
}

/* Slash Command Panel */
.slash-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.slash-panel-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.slash-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.1s;
}

.slash-item:hover,
.slash-item.active {
  background: var(--hover-bg);
}

.slash-item-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.slash-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.slash-item-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.slash-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.slash-item-hint {
  font-size: 11px;
  color: var(--text-color-muted);
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slash-item-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slash-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--text-color-muted);
  text-align: center;
}

.slash-empty-disabled {
  text-align: left;
  line-height: 1.5;
}

/* Slash panel transition */
.slash-panel-enter-active,
.slash-panel-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}

.slash-panel-enter-from,
.slash-panel-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.chat-textarea {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  max-height: 200px;
  font-family: inherit;
}

.chat-input-area.expanded .chat-textarea {
  overflow-y: auto;
}

.chat-textarea::placeholder {
  color: var(--text-color-muted);
}

.chat-textarea:disabled {
  opacity: 0.5;
}

.send-btn,
.stop-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-btn {
  background: var(--primary-color);
  color: white;
}

.send-btn:hover:not(:disabled) {
  background: var(--primary-color-hover);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stop-btn {
  background: #ff4d4f;
  color: white;
}

.stop-btn:hover {
  background: #ff7875;
}

</style>

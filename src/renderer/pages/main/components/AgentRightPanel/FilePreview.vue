<template>
  <div class="file-preview">
    <!-- Header -->
    <div class="preview-header">
      <span class="preview-filename" :title="preview?.name">{{ preview?.name || '' }}</span>
      <div class="preview-actions">
        <!-- 工具栏显隐开关 -->
        <button
          v-if="hasToolbar"
          class="preview-toggle"
          @click="toggleToolbar"
          :title="showToolbar ? t('agent.files.hideToolbar') : t('agent.files.showToolbar')"
        >
          <Icon :name="showToolbar ? 'chevronUp' : 'chevronDown'" :size="12" />
        </button>
        <!-- 关闭按钮 -->
        <button class="preview-close" @click="$emit('close')">
          <Icon name="close" :size="12" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="preview-body">
      <!-- Loading -->
      <div v-if="loading" class="preview-placeholder">
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error -->
      <div v-else-if="preview?.error" class="preview-placeholder preview-error">
        <Icon name="warning" :size="16" />
        <span>{{ preview.error }}</span>
      </div>

      <!-- Too Large -->
      <div v-else-if="preview?.tooLarge" class="preview-placeholder">
        <Icon name="fileText" :size="24" />
        <span>{{ t('agent.files.tooLarge') }}</span>
        <span class="preview-meta">{{ formatFileSize(preview.size) }}</span>
      </div>

      <!-- Text -->
      <div v-else-if="preview?.type === 'text'" class="preview-text">
        <!-- Text Toolbar -->
        <div v-if="showToolbar" class="text-toolbar">
          <button
            class="toolbar-btn"
            @click="saveText"
            :disabled="!isTextDirty || savingText"
            :title="t('agent.files.save')"
          >
            <Icon name="check" :size="14" />
          </button>
          <span v-if="isTextDirty" class="toolbar-status">{{ t('agent.files.unsaved') }}</span>
          <span v-else-if="saveSuccess" class="toolbar-status success">{{ t('agent.files.saved') }}</span>
          <span class="toolbar-tips">{{ t('agent.files.textTips') }}</span>
          <button
            v-if="preview?.filePath"
            class="toolbar-btn"
            @click="openTextExternal"
            :title="t('agent.files.openInDefaultApp')"
          >
            <Icon name="externalLink" :size="14" />
          </button>
        </div>

        <!-- Text Editor -->
        <textarea
          v-model="editableText"
          class="text-editor"
          spellcheck="false"
          @input="handleTextInput"
        />
      </div>

      <!-- HTML/URL Preview (统一使用 webview) -->
      <div v-else-if="preview?.type === 'html' || preview?.type === 'url'" class="preview-html">
        <!-- Toolbar -->
        <div v-if="showToolbar" class="html-toolbar">
          <span class="toolbar-tips">{{ t('agent.files.webviewTips') }}</span>
          <button class="toolbar-btn" @click="refreshHTML" :title="t('agent.files.refresh')">
            <Icon name="refresh" :size="14" />
          </button>
          <button class="toolbar-btn" @click="openExternal" :title="t('agent.files.openExternal')">
            <Icon name="externalLink" :size="14" />
          </button>
        </div>

        <!-- webview（统一技术栈） -->
        <webview
          ref="webviewRef"
          :key="htmlRefreshKey"
          :src="getWebviewSrc()"
          partition="persist:webview-preview"
          class="html-iframe"
          @dom-ready="handleWebviewReady"
        />
      </div>

      <!-- Image Enhanced -->
      <div v-else-if="preview?.type === 'image'" class="preview-image-enhanced">
        <!-- Image Toolbar -->
        <div v-if="showToolbar" class="image-toolbar">
          <button class="toolbar-btn" @click="zoomIn" :title="t('agent.files.zoomIn')">
            <Icon name="add" :size="14" />
          </button>
          <span class="zoom-level">{{ Math.round(imageZoom * 100) }}%</span>
          <button class="toolbar-btn" @click="zoomOut" :title="t('agent.files.zoomOut')">
            <Icon name="minus" :size="14" />
          </button>
          <button class="toolbar-btn" @click="resetZoom" :title="t('agent.files.resetZoom')">
            <Icon name="refresh" :size="14" />
          </button>
          <button class="toolbar-btn" @click="downloadImage" :title="t('agent.files.download')">
            <Icon name="download" :size="14" />
          </button>
          <button
            v-if="preview?.filePath"
            class="toolbar-btn"
            @click="openImageExternal"
            :title="t('agent.files.openInDefaultApp')"
          >
            <Icon name="externalLink" :size="14" />
          </button>
        </div>

        <!-- Image Container -->
        <div
          class="image-container"
          ref="imageContainerRef"
          @wheel.prevent="handleWheel"
        >
          <img
            :src="preview.content"
            :alt="preview.name"
            :style="{ transform: `scale(${imageZoom})` }"
            @load="handleImageLoad"
          />
        </div>

        <!-- Image Info -->
        <div v-if="imageInfo" class="image-info">
          <span>{{ imageInfo.width }} × {{ imageInfo.height }}</span>
          <span class="info-separator">·</span>
          <span>{{ formatFileSize(preview.size || 0) }}</span>
        </div>
      </div>

      <!-- Binary -->
      <div v-else-if="preview?.type === 'binary'" class="preview-placeholder">
        <Icon name="fileText" :size="24" />
        <span>{{ t('agent.files.cannotPreview') }}</span>
        <span class="preview-meta">{{ preview.ext }} · {{ formatFileSize(preview.size) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import { formatFileSize } from '@composables/useAgentFiles'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  preview: { type: Object, default: null },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

// 图片预览增强
const imageZoom = ref(1)
const imageInfo = ref(null)
const imageContainerRef = ref(null)

// HTML 预览刷新
const htmlRefreshKey = ref(0)

// webview 相关（统一 HTML 和 URL）
const webviewRef = ref(null)

// 工具栏显隐控制
const showToolbar = ref(true) // 默认显示

// 判断当前类型是否有工具栏
const hasToolbar = computed(() => {
  const type = props.preview?.type
  return type === 'image' || type === 'html' || type === 'url' || type === 'text'
})

// 切换工具栏显示
const toggleToolbar = () => {
  showToolbar.value = !showToolbar.value
}

// 文本编辑相关
const editableText = ref('')
const originalText = ref('')
const isTextDirty = ref(false)
const savingText = ref(false)
const saveSuccess = ref(false)

// 文本输入处理
const handleTextInput = () => {
  isTextDirty.value = editableText.value !== originalText.value
  saveSuccess.value = false
}

// 保存文本
const saveText = async () => {
  if (!props.preview?.filePath || !isTextDirty.value || savingText.value) return

  savingText.value = true
  try {
    // 获取当前会话 ID（从父组件传入的 preview 数据中）
    const sessionId = props.preview.sessionId
    const relativePath = props.preview.relativePath

    const result = await window.electronAPI.saveAgentFile({
      sessionId,
      relativePath,
      content: editableText.value
    })

    if (result.error) {
      console.error('Save failed:', result.error)
      return
    }

    // 保存成功
    originalText.value = editableText.value
    isTextDirty.value = false
    saveSuccess.value = true

    // 3秒后隐藏成功提示
    setTimeout(() => {
      saveSuccess.value = false
    }, 3000)
  } catch (err) {
    console.error('Save error:', err)
  } finally {
    savingText.value = false
  }
}

// 在默认应用中打开文本文件
const openTextExternal = async () => {
  if (!window.electronAPI || !props.preview?.filePath) return
  await window.electronAPI.openPath(props.preview.filePath)
}

// 重置状态（当切换文件时）
watch(() => props.preview, (newPreview) => {
  imageZoom.value = 1
  imageInfo.value = null
  htmlRefreshKey.value = 0
  showToolbar.value = true // 重置工具栏为显示状态

  // 初始化文本编辑器
  if (newPreview?.type === 'text' && newPreview?.content) {
    editableText.value = newPreview.content
    originalText.value = newPreview.content
    isTextDirty.value = false
    saveSuccess.value = false
  }
}, { immediate: true })

// 放大
const zoomIn = () => {
  imageZoom.value = Math.min(imageZoom.value + 0.25, 5)
}

// 缩小
const zoomOut = () => {
  imageZoom.value = Math.max(imageZoom.value - 0.25, 0.25)
}

// 重置缩放
const resetZoom = () => {
  imageZoom.value = 1
}

// 鼠标滚轮缩放
const handleWheel = (e) => {
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  imageZoom.value = Math.max(0.25, Math.min(5, imageZoom.value + delta))
}

// 图片加载完成，获取尺寸信息
const handleImageLoad = (e) => {
  const img = e.target
  imageInfo.value = {
    width: img.naturalWidth,
    height: img.naturalHeight
  }
}

// 下载图片
const downloadImage = () => {
  if (!props.preview?.content) return

  const link = document.createElement('a')
  link.href = props.preview.content
  link.download = props.preview.name || 'image'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 在默认应用中打开图片
const openImageExternal = async () => {
  if (!window.electronAPI || !props.preview?.filePath) return
  await window.electronAPI.openPath(props.preview.filePath)
}

// 刷新 HTML/URL 预览
const refreshHTML = () => {
  htmlRefreshKey.value++
}

// 获取 webview 的 src（统一处理 HTML 文件和 URL）
const getWebviewSrc = () => {
  if (props.preview?.type === 'url') {
    return props.preview.url
  } else if (props.preview?.type === 'html' && props.preview?.filePath) {
    // 本地 HTML 文件：使用 file:// 协议
    return `file://${props.preview.filePath}`
  }
  return ''
}

// 统一的外部打开方法
const openExternal = async () => {
  if (!window.electronAPI) return

  if (props.preview?.type === 'url' && props.preview?.url) {
    // URL：在浏览器打开
    await window.electronAPI.openExternal(props.preview.url)
  } else if (props.preview?.type === 'html' && props.preview?.filePath) {
    // HTML 文件：在默认应用打开
    await window.electronAPI.openPath(props.preview.filePath)
  }
}

// webview 加载完成后处理
const handleWebviewReady = () => {
  // 暂时不做任何处理，保持网页原始内容
  // 等待进一步讨论如何优化显示
}

// 键盘快捷键处理
const handleKeyDown = (e) => {
  // ESC 键关闭预览
  if (e.key === 'Escape') {
    emit('close')
  }

  // Ctrl+S / Cmd+S 保存文本
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault() // 阻止浏览器默认保存行为
    if (props.preview?.type === 'text' && isTextDirty.value && !savingText.value) {
      saveText()
    }
  }
}

// 挂载时添加键盘监听
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

// 卸载时移除键盘监听
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-color);
  min-height: 0;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.preview-filename {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.preview-toggle,
.preview-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.preview-toggle:hover,
.preview-close:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.preview-body {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--text-color-muted);
  font-size: 12px;
}

.preview-error {
  color: var(--error-color, #e53e3e);
}

.preview-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  opacity: 0.7;
}

.preview-text {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.text-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-status {
  font-size: 11px;
  color: var(--text-color-muted);
  user-select: none;
}

.toolbar-status.success {
  color: var(--success-color, #10b981);
}

.text-editor {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
  tab-size: 2;
  color: var(--text-color);
  background: var(--bg-color);
}

/* 图片预览增强 */
.preview-image-enhanced {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.image-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.zoom-level {
  font-size: 11px;
  color: var(--text-color-muted);
  min-width: 40px;
  text-align: center;
  user-select: none;
}

.image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 8px;
  cursor: move;
}

.image-container img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  transition: transform 0.2s ease;
  transform-origin: center center;
}

.image-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-color-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-color-muted);
  flex-shrink: 0;
}

.info-separator {
  opacity: 0.5;
}

/* HTML 预览 */
.preview-html {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.html-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-tips {
  flex: 1;
  font-size: 11px;
  color: var(--text-color-muted);
  user-select: none;
  opacity: 0.7;
  text-align: right;
}

.html-iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: white;
}
</style>

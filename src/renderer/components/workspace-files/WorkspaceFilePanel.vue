<template>
  <div :class="panelClasses">
    <template v-if="sourceReady">
      <FileTreeHeader
        v-show="!previewMaximized"
        :cwd="files.cwd.value"
        :show-hidden="files.showHidden.value"
        :search-active="searchActive"
        :show-collapse="showCollapse"
        @open-explorer="files.openInExplorer()"
        @refresh="files.refresh()"
        @toggle-hidden="files.toggleShowHidden()"
        @toggle-search="toggleSearch"
        @collapse="$emit('collapse')"
      />

      <div v-if="searchActive && !previewMaximized" class="search-box">
        <Icon name="search" :size="12" class="search-icon" />
        <input
          ref="searchInputRef"
          class="search-input"
          :placeholder="t('agent.files.searchPlaceholder')"
          :value="files.searchKeyword.value"
          @input="files.searchFiles($event.target.value)"
          @keydown.esc="closeSearch"
        />
        <button
          v-if="files.searchKeyword.value"
          class="search-clear"
          @click="closeSearch"
        >
          <Icon name="close" :size="10" />
        </button>
      </div>

      <div v-if="files.loading.value && !previewMaximized && !files.selectedFile.value" class="panel-loading">
        <Icon name="refresh" :size="16" class="spin-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="files.error.value && !previewMaximized && !files.selectedFile.value" class="panel-error">
        <Icon name="warning" :size="16" />
        <span>{{ t('agent.files.errorLoading') }}</span>
      </div>

      <template v-else>
        <div class="panel-body" :class="{ 'has-preview': files.selectedFile.value, 'preview-maximized': previewMaximized }">
          <div v-if="isSearchMode && !previewMaximized" class="tree-section search-results">
            <div v-if="files.searchLoading.value" class="search-status">
              <Icon name="refresh" :size="14" class="spin-icon" />
            </div>
            <div v-else-if="files.searchResults.value.length === 0" class="search-status">
              <span>{{ t('agent.files.noResults') }}</span>
            </div>
            <template v-else>
              <div
                v-for="item in files.searchResults.value"
                :key="item.relativePath"
                class="search-result-item"
                :class="{ 'is-selected': files.selectedFile.value === item.relativePath }"
                @click="handleSearchResultClick(item)"
                @dblclick="item.isDirectory || files.openFile(item.relativePath)"
              >
                <Icon :name="item.isDirectory ? 'folder' : 'file'" :size="14" class="result-icon" />
                <div class="result-info">
                  <span class="result-name">{{ item.name }}</span>
                  <span class="result-path">{{ item.relativePath }}</span>
                </div>
              </div>
            </template>
          </div>

          <FileTree
            ref="fileTreeRef"
            v-show="!previewMaximized && !isSearchMode"
            class="tree-section"
            :entries="files.entries.value"
            :expanded-dirs="files.expandedDirs"
            :selected-file="files.selectedFile.value"
            :get-dir-entries="files.getDirEntries"
            :loading="files.loading.value"
            @toggle-dir="files.toggleDir($event)"
            @select-file="files.selectFile($event)"
            @open-file="files.openFile($event)"
            @insert-path="handleInsertPath"
            @context-menu="handleContextMenu"
          />

          <FilePreview
            v-if="files.selectedFile.value"
            class="preview-section"
            :preview="files.filePreview.value"
            :loading="files.previewLoading.value"
            :maximized="previewMaximized"
            :save-text-handler="saveTextHandler"
            @close="handleClosePreview"
            @toggle-maximize="previewMaximized = !previewMaximized"
            @insert-path="$emit('insert-path', $event)"
          />
        </div>
      </template>
    </template>

    <template v-else>
      <div :class="emptyHeaderClass">
        <span class="empty-title">{{ emptyTitle || t('agent.files.title') }}</span>
        <button
          v-if="showCollapse"
          class="header-btn panel-collapse-btn"
          :title="t('common.collapse')"
          @click="$emit('collapse')"
        >
          <Icon name="panelRight" :size="16" :strokeWidth="1.8" />
        </button>
      </div>
      <div class="panel-empty">
        <Icon name="folder" :size="32" />
        <span>{{ emptyMessage }}</span>
      </div>
    </template>

    <FileTreeContextMenu
      v-if="allowMutations"
      ref="contextMenuRef"
      @action="handleMenuAction"
    />
  </div>
</template>

<script setup>
import { computed, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useDialog, useMessage, NInput } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import FilePreview from '@/pages/main/components/AgentRightPanel/FilePreview.vue'
import FileTree from '@/pages/main/components/AgentRightPanel/FileTree.vue'
import FileTreeContextMenu from '@/pages/main/components/AgentRightPanel/FileTreeContextMenu.vue'
import FileTreeHeader from '@/pages/main/components/AgentRightPanel/FileTreeHeader.vue'

const props = defineProps({
  files: { type: Object, required: true },
  sourceReady: { type: Boolean, default: false },
  emptyTitle: { type: String, default: '' },
  emptyMessage: { type: String, default: '' },
  showCollapse: { type: Boolean, default: true },
  framed: { type: Boolean, default: true },
  saveTextHandler: { type: Function, default: null },
  allowMutations: { type: Boolean, default: true }
})

const emit = defineEmits(['collapse', 'insert-path'])

const { t } = useLocale()
const dialog = useDialog()
const message = useMessage()
const previewMaximized = ref(false)
const fileTreeRef = ref(null)
const contextMenuRef = ref(null)
const searchActive = ref(false)
const searchInputRef = ref(null)

const isSearchMode = computed(() => searchActive.value && props.files.searchKeyword.value)
const panelClasses = computed(() => [
  'workspace-file-panel',
  { framed: props.framed }
])
const emptyHeaderClass = computed(() => props.framed ? 'empty-header panel-shell-header' : 'empty-header flat')

const toggleSearch = () => {
  searchActive.value = !searchActive.value
  if (searchActive.value) {
    nextTick(() => searchInputRef.value?.focus())
  } else {
    props.files.clearSearch()
  }
}

const closeSearch = () => {
  props.files.clearSearch()
  searchActive.value = false
}

const handleSearchResultClick = (item) => {
  if (item.isDirectory) {
    closeSearch()
    props.files.toggleDir(item.relativePath)
  } else {
    props.files.selectFile(item.relativePath)
  }
}

const mapErrorMessage = (errorMsg) => {
  const errorMap = {
    'File or folder already exists': t('agent.files.fileAlreadyExists'),
    'Target name already exists': t('agent.files.targetNameExists'),
    'File or folder not found': t('agent.files.fileNotFound'),
    'Unsupported operation': t('common.operationFailed') || 'Unsupported operation'
  }
  return errorMap[errorMsg] || errorMsg
}

const handleClosePreview = () => {
  previewMaximized.value = false
  props.files.closePreview()
}

const previewImage = (previewData) => {
  props.files.previewLoading.value = true
  props.files.selectedFile.value = previewData.name

  setTimeout(() => {
    props.files.filePreview.value = previewData
    props.files.previewLoading.value = false
  }, 50)
}

const handleInsertPath = (relativePath) => {
  const cwd = props.files.cwd.value
  if (!cwd || !relativePath) return
  const separator = cwd.includes('\\') ? '\\' : '/'
  const fullPath = cwd + separator + relativePath.replace(/\//g, separator)
  emit('insert-path', fullPath)
}

const handleContextMenu = ({ x, y, entry }) => {
  contextMenuRef.value?.show(x, y, entry)
}

const handleClickOutside = () => {
  contextMenuRef.value?.hide()
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('contextmenu', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside)
  window.removeEventListener('contextmenu', handleClickOutside)
})

const validateFileName = (name) => {
  const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
  const upperName = name.toUpperCase()
  const baseName = upperName.split('.')[0]
  if (reserved.includes(baseName)) return t('agent.files.reservedName')
  if (/[<>:"/\\|?*\x00-\x1F]/.test(name)) return t('agent.files.invalidChars')
  if (name.includes('/') || name.includes('\\')) return t('agent.files.noPathSeparator')
  if (/[.\s]$/.test(name)) return t('agent.files.invalidEnding')
  return null
}

const openNameDialog = ({ title, initialValue = '', placeholder, positiveText, onConfirm }) => {
  const inputValue = ref(initialValue)
  let dialogInstance = null

  const handleConfirm = async () => onConfirm(inputValue, dialogInstance)

  dialogInstance = dialog.create({
    title,
    content: () => h(NInput, {
      value: inputValue.value,
      onUpdateValue: (value) => { inputValue.value = value },
      placeholder,
      autofocus: true,
      selectOnFocus: true,
      onKeydown: (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          handleConfirm()
        }
      }
    }),
    positiveText,
    negativeText: t('common.cancel'),
    onPositiveClick: handleConfirm
  })
}

const handleNewFile = async (target) => {
  const parentPath = target?.relativePath || ''
  openNameDialog({
    title: t('agent.files.newFile'),
    placeholder: t('agent.files.fileNamePlaceholder'),
    positiveText: t('common.create'),
    onConfirm: async (inputValue, dialogInstance) => {
      const fileName = inputValue.value.trim()
      if (!fileName) {
        message.warning(t('agent.files.fileNameRequired'))
        return false
      }
      const validationError = validateFileName(fileName)
      if (validationError) {
        message.warning(validationError)
        return false
      }
      const result = await props.files.createFile(parentPath, fileName, false)
      if (result?.error) {
        message.error(mapErrorMessage(result.error))
        return false
      }
      message.success(t('agent.files.createSuccess'))
      await props.files.refresh()
      dialogInstance?.destroy()
    }
  })
}

const handleNewFolder = async (target) => {
  const parentPath = target?.relativePath || ''
  openNameDialog({
    title: t('agent.files.newFolder'),
    placeholder: t('agent.files.folderNamePlaceholder'),
    positiveText: t('common.create'),
    onConfirm: async (inputValue, dialogInstance) => {
      const folderName = inputValue.value.trim()
      if (!folderName) {
        message.warning(t('agent.files.folderNameRequired'))
        return false
      }
      const validationError = validateFileName(folderName)
      if (validationError) {
        message.warning(validationError)
        return false
      }
      const result = await props.files.createFile(parentPath, folderName, true)
      if (result?.error) {
        message.error(mapErrorMessage(result.error))
        return false
      }
      message.success(t('agent.files.createSuccess'))
      await props.files.refresh()
      dialogInstance?.destroy()
    }
  })
}

const handleRename = async (target) => {
  if (!target) return
  openNameDialog({
    title: t('common.rename'),
    initialValue: target.name,
    placeholder: t('agent.files.newNamePlaceholder'),
    positiveText: t('common.confirm'),
    onConfirm: async (inputValue, dialogInstance) => {
      const newName = inputValue.value.trim()
      if (!newName) {
        message.warning(t('agent.files.nameRequired'))
        return false
      }
      if (newName === target.name) {
        dialogInstance?.destroy()
        return
      }
      const validationError = validateFileName(newName)
      if (validationError) {
        message.warning(validationError)
        return false
      }
      const result = await props.files.renameFile(target.relativePath, newName)
      if (result?.error) {
        message.error(mapErrorMessage(result.error))
        return false
      }
      message.success(t('agent.files.renameSuccess'))
      await props.files.refresh()
      dialogInstance?.destroy()
    }
  })
}

const handleDelete = async (target) => {
  if (!target) return
  const typeName = target.isDirectory ? t('common.folder') : t('common.file')
  dialog.warning({
    title: t('common.confirmDelete'),
    content: `${t('agent.files.deleteConfirm')} ${typeName} "${target.name}"？`,
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      const result = await props.files.deleteFile(target.relativePath)
      if (result?.error) {
        message.error(mapErrorMessage(result.error))
        return
      }
      message.success(t('agent.files.deleteSuccess'))
      await props.files.refresh()
    }
  })
}

const handleMenuAction = async ({ action, target }) => {
  switch (action) {
    case 'insertPath':
      if (target) handleInsertPath(target.relativePath)
      break
    case 'newFile':
      await handleNewFile(target)
      break
    case 'newFolder':
      await handleNewFolder(target)
      break
    case 'rename':
      await handleRename(target)
      break
    case 'delete':
      await handleDelete(target)
      break
  }
}

const toForwardSlash = (value) => {
  if (!value) return value
  let normalized = value.replace(/\\/g, '/')
  if (window.electronAPI?.platform === 'win32') {
    const msys = normalized.match(/^\/([a-zA-Z])\/(.*)/)
    if (msys) {
      normalized = msys[1].toUpperCase() + ':/' + msys[2]
    } else if (/^[a-z]:/.test(normalized)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1)
    }
  }
  return normalized
}

const revealInTree = async (absolutePath, { preview = false } = {}) => {
  const cwd = props.files.cwd.value
  if (!cwd || !absolutePath) return false
  const normalizedAbsolute = toForwardSlash(absolutePath)
  const normalizedCwd = toForwardSlash(cwd).replace(/\/+$/, '') + '/'
  if (!normalizedAbsolute.startsWith(normalizedCwd)) return false
  const relativePath = normalizedAbsolute.slice(normalizedCwd.length)
  if (!relativePath) return false

  if (preview) {
    await props.files.revealFile(relativePath, { select: false })
    await props.files.selectFile(relativePath)
  } else {
    await props.files.revealFile(relativePath)
  }

  await nextTick()
  fileTreeRef.value?.scrollToFile(relativePath)
  return true
}

defineExpose({
  previewImage,
  refreshFiles: () => props.files.refresh(),
  revealInTree
})
</script>

<style scoped>
@import '@styles/common.css';

.workspace-file-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--panel-bg);
  overflow: hidden;
}

.workspace-file-panel.framed {
  flex-shrink: 0;
  border: 1px solid var(--panel-border);
  border-radius: var(--panel-radius);
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.tree-section {
  flex: 1;
  min-height: 100px;
  overflow: auto;
}

.panel-body.has-preview .tree-section {
  flex: 1;
  max-height: 50%;
}

.panel-body.preview-maximized .preview-section {
  flex: 1;
  max-height: none;
}

.preview-section {
  flex: 1;
  min-height: 120px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-loading,
.panel-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  font-size: 12px;
}

.panel-loading {
  color: var(--text-color-muted);
}

.panel-error {
  color: var(--error-color, #e53e3e);
}

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-color-muted);
  font-size: 12px;
  text-align: center;
  padding: 24px;
}

.panel-empty :deep(svg) {
  opacity: 0.7;
}

.empty-header {
  padding: 0 14px;
}

.empty-header.flat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-bg-subtle);
  flex-shrink: 0;
}

.empty-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-btn:not(.panel-collapse-btn) {
  color: var(--text-color-muted);
}

.header-btn:not(.panel-collapse-btn):hover,
.empty-header.flat .header-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.search-box {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-bg-subtle);
  flex-shrink: 0;
  gap: 6px;
}

.search-icon {
  color: var(--text-color-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 12px;
  outline: none;
  padding: 3px 0;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--text-color-muted);
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.search-clear:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.search-results {
  padding: 2px 0;
}

.search-status {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 8px;
  color: var(--text-color-muted);
  font-size: 12px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.1s;
}

.search-result-item:hover {
  background: var(--hover-bg);
}

.search-result-item.is-selected {
  background: var(--selected-bg, var(--primary-color-light, rgba(var(--primary-rgb, 99, 102, 241), 0.12)));
}

.result-icon {
  color: var(--text-color-muted);
  flex-shrink: 0;
}

.result-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.result-name {
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-path {
  font-size: 10px;
  color: var(--text-color-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

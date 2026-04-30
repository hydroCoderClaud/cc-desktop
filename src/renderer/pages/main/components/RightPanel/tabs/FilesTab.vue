<template>
  <div class="files-tab-panel">
    <!-- 有活跃会话 -->
    <template v-if="rootPath">
      <!-- Header -->
      <FileTreeHeader
        v-show="!previewMaximized"
        :cwd="projectFiles.cwd.value"
        :show-hidden="projectFiles.showHidden.value"
        :search-active="searchActive"
        @open-explorer="projectFiles.openInExplorer()"
        @refresh="projectFiles.refresh()"
        @toggle-hidden="projectFiles.toggleShowHidden()"
        @toggle-search="toggleSearch"
        :show-collapse="false"
      />

      <!-- Search Box -->
      <div v-if="searchActive && !previewMaximized" class="search-box">
        <Icon name="search" :size="12" class="search-icon" />
        <input
          ref="searchInputRef"
          class="search-input"
          :placeholder="t('agent.files.searchPlaceholder')"
          :value="projectFiles.searchKeyword.value"
          @input="projectFiles.searchFiles($event.target.value)"
          @keydown.esc="closeSearch"
        />
        <button
          v-if="projectFiles.searchKeyword.value"
          class="search-clear"
          @click="closeSearch"
        >
          <Icon name="close" :size="10" />
        </button>
      </div>

      <!-- Loading（有 preview 时直接跳过，避免遮住 FilePreview） -->
      <div v-if="projectFiles.loading.value && !previewMaximized && !projectFiles.selectedFile.value" class="panel-loading">
        <Icon name="refresh" :size="16" class="spin-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error（有 preview 时同样跳过） -->
      <div v-else-if="projectFiles.error.value && !previewMaximized && !projectFiles.selectedFile.value" class="panel-error">
        <Icon name="warning" :size="16" />
        <span>{{ t('agent.files.errorLoading') }}</span>
      </div>

      <!-- Content: File Tree + Preview -->
      <template v-else>
        <div class="panel-body" :class="{ 'has-preview': projectFiles.selectedFile.value, 'preview-maximized': previewMaximized }">
          <!-- Search Results -->
          <div v-if="isSearchMode && !previewMaximized" class="tree-section search-results">
            <div v-if="projectFiles.searchLoading.value" class="search-status">
              <Icon name="refresh" :size="14" class="spin-icon" />
            </div>
            <div v-else-if="projectFiles.searchResults.value.length === 0" class="search-status">
              <span>{{ t('agent.files.noResults') }}</span>
            </div>
            <template v-else>
              <div
                v-for="item in projectFiles.searchResults.value"
                :key="item.relativePath"
                class="search-result-item"
                :class="{ 'is-selected': projectFiles.selectedFile.value === item.relativePath }"
                @click="handleSearchResultClick(item)"
                @dblclick="item.isDirectory || projectFiles.openFile(item.relativePath)"
              >
                <Icon :name="item.isDirectory ? 'folder' : 'file'" :size="14" class="result-icon" />
                <div class="result-info">
                  <span class="result-name">{{ item.name }}</span>
                  <span class="result-path">{{ item.relativePath }}</span>
                </div>
              </div>
            </template>
          </div>

          <!-- File Tree -->
          <FileTree
            ref="fileTreeRef"
            v-show="!previewMaximized && !isSearchMode"
            class="tree-section"
            :entries="projectFiles.entries.value"
            :expanded-dirs="projectFiles.expandedDirs"
            :selected-file="projectFiles.selectedFile.value"
            :get-dir-entries="projectFiles.getDirEntries"
            :loading="projectFiles.loading.value"
            @toggle-dir="projectFiles.toggleDir($event)"
            @select-file="projectFiles.selectFile($event)"
            @open-file="projectFiles.openFile($event)"
            @insert-path="handleInsertPath"
            @context-menu="handleContextMenu"
          />

          <!-- File Preview -->
          <FilePreview
            v-if="projectFiles.selectedFile.value"
            class="preview-section"
            :preview="projectFiles.filePreview.value"
            :loading="projectFiles.previewLoading.value"
            :maximized="previewMaximized"
            @close="handleClosePreview"
            @toggle-maximize="previewMaximized = !previewMaximized"
            @insert-path="emit('insert-path', $event)"
          />
        </div>
      </template>
    </template>

    <!-- 无活跃会话：空状态 -->
    <template v-else>
      <div class="empty-header">
        <span class="empty-title">{{ t('agent.files.title') }}</span>
        <button
          class="header-btn"
          :title="t('common.collapse')"
          @click="$emit('collapse')"
        >
          <Icon name="chevronRight" :size="14" />
        </button>
      </div>
      <div class="panel-empty">
        <Icon name="folder" :size="32" />
        <span>{{ t('main.pleaseSelectProject') }}</span>
      </div>
    </template>

    <!-- 右键菜单 -->
    <FileTreeContextMenu ref="contextMenuRef" @action="handleMenuAction" />
  </div>
</template>

<script setup>
import { ref, computed, watch, h, nextTick, onMounted, onUnmounted } from 'vue'
import { useDialog, useMessage, NInput } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useProjectFiles } from '@composables/useProjectFiles'
import Icon from '@components/icons/Icon.vue'
import FileTreeHeader from '../../AgentRightPanel/FileTreeHeader.vue'
import FileTree from '../../AgentRightPanel/FileTree.vue'
import FilePreview from '../../AgentRightPanel/FilePreview.vue'
import FileTreeContextMenu from '../../AgentRightPanel/FileTreeContextMenu.vue'

const { t } = useLocale()
const dialog = useDialog()
const message = useMessage()
const projectFiles = useProjectFiles()
const contextMenuRef = ref(null)
const previewMaximized = ref(false)
const fileTreeRef = ref(null)
const searchActive = ref(false)
const searchInputRef = ref(null)

const isSearchMode = computed(() => searchActive.value && projectFiles.searchKeyword.value)

const toggleSearch = () => {
  searchActive.value = !searchActive.value
  if (searchActive.value) {
    nextTick(() => searchInputRef.value?.focus())
  } else {
    projectFiles.clearSearch()
  }
}

const closeSearch = () => {
  projectFiles.clearSearch()
  searchActive.value = false
}

const handleSearchResultClick = (item) => {
  if (item.isDirectory) {
    // 关闭搜索，展开目录
    closeSearch()
    projectFiles.toggleDir(item.relativePath)
  } else {
    projectFiles.selectFile(item.relativePath)
  }
}

const props = defineProps({
  currentProject: { type: Object, default: null },
  activeTabCwd: { type: String, default: null }
})

const emit = defineEmits(['collapse', 'insert-path'])

// 错误消息映射（将后端英文错误映射到 i18n key）
const mapErrorMessage = (errorMsg) => {
  const errorMap = {
    'File or folder already exists': t('agent.files.fileAlreadyExists'),
    'Target name already exists': t('agent.files.targetNameExists'),
    'File or folder not found': t('agent.files.fileNotFound')
  }
  return errorMap[errorMsg] || errorMsg
}

// watch rootPath 变化自动重置并加载
// 优先使用 activeTabCwd（例如Agent会话的工作目录），否则回退到项目根目录
const rootPath = computed(() => props.activeTabCwd || props.currentProject?.path || null)

watch(() => rootPath.value, (newId) => {
  projectFiles.setRootPath(newId)
}, { immediate: true })

// 关闭预览时自动还原最大化状态
const handleClosePreview = () => {
  previewMaximized.value = false
  projectFiles.closePreview()
}

// 暴露预览方法给父组件调用
const previewImage = (previewData) => {
  // 设置加载状态
  projectFiles.previewLoading.value = true
  projectFiles.selectedFile.value = previewData.name

  // 模拟异步加载（给用户视觉反馈）
  setTimeout(() => {
    projectFiles.filePreview.value = previewData
    projectFiles.previewLoading.value = false
  }, 50)
}

// 处理路径插入：拼接完整路径
const handleInsertPath = (relativePath) => {
  let cwd = projectFiles.cwd.value || rootPath.value
  if (!cwd || !relativePath) return

  const separator = cwd.includes('\\') ? '\\' : '/'
  const fullPath = cwd + separator + relativePath.replace(/\//g, separator)

  emit('insert-path', fullPath)
}

// 处理右键菜单
const handleContextMenu = ({ x, y, entry }) => {
  contextMenuRef.value?.show(x, y, entry)
}

// 关闭右键菜单（点击外部）
const handleClickOutside = () => {
  contextMenuRef.value?.hide()
}

// 生命周期：注册和清理事件监听器
onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('contextmenu', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside)
  window.removeEventListener('contextmenu', handleClickOutside)
})

// 文件名验证函数
const validateFileName = (name) => {
  // Windows 保留名
  const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
    'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4',
    'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']

  const upperName = name.toUpperCase()
  // 检查保留名（包括带扩展名的，如 CON.txt）
  const baseName = upperName.split('.')[0]
  if (reserved.includes(baseName)) {
    return t('agent.files.reservedName')
  }

  // 非法字符检查（Windows 和 Unix 通用）
  if (/[<>:"/\\|?*\x00-\x1F]/.test(name)) {
    return t('agent.files.invalidChars')
  }

  // 路径分隔符
  if (name.includes('/') || name.includes('\\')) {
    return t('agent.files.noPathSeparator')
  }

  // 不能以点或空格结尾（Windows 限制）
  if (/[.\s]$/.test(name)) {
    return t('agent.files.invalidEnding')
  }

  return null
}

// 处理菜单操作
const handleMenuAction = async ({ action, target }) => {
  const currentRootPath = rootPath.value
  if (!currentRootPath) return

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

// 创建新文件
const handleNewFile = async (target) => {
  const currentRootPath = rootPath.value
  const parentPath = target?.relativePath || ''

  let inputValue = ref('')
  let dialogInstance = null

  const handleCreate = async () => {
    const fileName = inputValue.value.trim()

    if (!fileName) {
      message.warning(t('agent.files.fileNameRequired'))
      return false
    }

    // 验证文件名
    const validationError = validateFileName(fileName)
    if (validationError) {
      message.warning(validationError)
      return false
    }

    try {
      const result = await window.electronAPI.createProjectFile({
        rootPath: currentRootPath,
        parentPath,
        name: fileName,
        isDirectory: false
      })

      if (result.error) {
        message.error(mapErrorMessage(result.error))
        return false
      }

      message.success(t('agent.files.createSuccess'))
      projectFiles.refresh()
      if (dialogInstance) dialogInstance.destroy()
    } catch (err) {
      message.error(t('agent.files.createFailed') + ': ' + err.message)
    }
  }

  dialogInstance = dialog.create({
    title: t('agent.files.newFile'),
    content: () => h(NInput, {
      value: inputValue.value,
      onUpdateValue: (v) => { inputValue.value = v },
      placeholder: t('agent.files.fileNamePlaceholder'),
      autofocus: true,
      onKeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleCreate()
        }
      }
    }),
    positiveText: t('common.create'),
    negativeText: t('common.cancel'),
    onPositiveClick: handleCreate
  })
}

// 创建新文件夹
const handleNewFolder = async (target) => {
  const currentRootPath = rootPath.value
  const parentPath = target?.relativePath || ''

  let inputValue = ref('')
  let dialogInstance = null

  const handleCreate = async () => {
    const folderName = inputValue.value.trim()

    if (!folderName) {
      message.warning(t('agent.files.folderNameRequired'))
      return false
    }

    // 验证文件夹名
    const validationError = validateFileName(folderName)
    if (validationError) {
      message.warning(validationError)
      return false
    }

    try {
      const result = await window.electronAPI.createProjectFile({
        rootPath: currentRootPath,
        parentPath,
        name: folderName,
        isDirectory: true
      })

      if (result.error) {
        message.error(mapErrorMessage(result.error))
        return false
      }

      message.success(t('agent.files.createSuccess'))
      projectFiles.refresh()
      if (dialogInstance) dialogInstance.destroy()
    } catch (err) {
      message.error(t('agent.files.createFailed') + ': ' + err.message)
    }
  }

  dialogInstance = dialog.create({
    title: t('agent.files.newFolder'),
    content: () => h(NInput, {
      value: inputValue.value,
      onUpdateValue: (v) => { inputValue.value = v },
      placeholder: t('agent.files.folderNamePlaceholder'),
      autofocus: true,
      onKeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleCreate()
        }
      }
    }),
    positiveText: t('common.create'),
    negativeText: t('common.cancel'),
    onPositiveClick: handleCreate
  })
}

// 重命名
const handleRename = async (target) => {
  if (!target) return

  const currentRootPath = rootPath.value
  let inputValue = ref(target.name)
  let dialogInstance = null

  const handleConfirm = async () => {
    const newName = inputValue.value.trim()

    if (!newName) {
      message.warning(t('agent.files.nameRequired'))
      return false
    }

    if (newName === target.name) {
      if (dialogInstance) dialogInstance.destroy()
      return
    }

    // 验证新名称
    const validationError = validateFileName(newName)
    if (validationError) {
      message.warning(validationError)
      return false
    }

    try {
      const result = await window.electronAPI.renameProjectFile({
        rootPath: currentRootPath,
        oldPath: target.relativePath,
        newName
      })

      if (result.error) {
        message.error(mapErrorMessage(result.error))
        return false
      }

      message.success(t('agent.files.renameSuccess'))
      projectFiles.refresh()
      if (dialogInstance) dialogInstance.destroy()
    } catch (err) {
      message.error(t('agent.files.renameFailed') + ': ' + err.message)
    }
  }

  dialogInstance = dialog.create({
    title: t('common.rename'),
    content: () => h(NInput, {
      value: inputValue.value,
      onUpdateValue: (v) => { inputValue.value = v },
      placeholder: t('agent.files.newNamePlaceholder'),
      autofocus: true,
      selectOnFocus: true,
      onKeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleConfirm()
        }
      }
    }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: handleConfirm
  })
}

// 删除
const handleDelete = async (target) => {
  if (!target) return

  const currentRootPath = rootPath.value
  const typeName = target.isDirectory ? t('common.folder') : t('common.file')

  dialog.warning({
    title: t('common.confirmDelete'),
    content: `${t('agent.files.deleteConfirm')} ${typeName} "${target.name}"？`,
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        const result = await window.electronAPI.deleteProjectFile({
          rootPath: currentRootPath,
          path: target.relativePath
        })

        if (result.error) {
          message.error(mapErrorMessage(result.error))
          return
        }

        message.success(t('agent.files.deleteSuccess'))
        projectFiles.refresh()
      } catch (err) {
        message.error(t('agent.files.deleteFailed') + ': ' + err.message)
      }
    }
  })
}

/**
 * 在文件树中定位并高亮文件（展开父目录 + 选中 + 滚动到可见位置）
 * @param {string} absolutePath - 文件绝对路径
 */
/**
 * @param {string} absolutePath
 * @param {{ preview?: boolean }} options
 *   preview=true：展开父目录 + 选中 + 加载文件预览 + 滚动（agent-done 自动定位用）
 *   preview=false（默认）：展开父目录 + 选中 + 滚动（手动点击路径用）
 */
// 将路径统一为 Windows 正斜杠格式（兼容 MSYS /c/... → C:/... 和反斜杠）
const toForwardSlash = (p) => {
  if (!p) return p
  p = p.replace(/\\/g, '/')
  // MSYS/Windows 路径规范化：仅在 Windows 平台执行
  // 在 macOS/Linux 上，/c/foo 是合法 Unix 路径，不能转换
  if (window.electronAPI?.platform === 'win32') {
    const msys = p.match(/^\/([a-zA-Z])\/(.*)/)
    if (msys) {
      // MSYS 格式：/c/foo → C:/foo
      p = msys[1].toUpperCase() + ':/' + msys[2]
    } else if (/^[a-z]:/.test(p)) {
      // Windows 小写盘符 → 大写（c:/foo → C:/foo）
      p = p[0].toUpperCase() + p.slice(1)
    }
  }
  return p
}

const revealInTree = async (absolutePath, { preview = false } = {}) => {
  const cwd = projectFiles.cwd.value
  if (!cwd || !absolutePath) return false

  const normalizedAbsolute = toForwardSlash(absolutePath)
  const normalizedCwd = toForwardSlash(cwd).replace(/\/+$/, '') + '/'
  if (!normalizedAbsolute.startsWith(normalizedCwd)) return false

  const relativePath = normalizedAbsolute.slice(normalizedCwd.length)
  if (!relativePath) return false

  if (preview) {
    // 展开父目录（不预设 selectedFile），再由 selectFile 统一设置选中 + 加载预览
    await projectFiles.revealFile(relativePath, { select: false })
    await projectFiles.selectFile(relativePath)
  } else {
    await projectFiles.revealFile(relativePath)
  }

  await nextTick()
  fileTreeRef.value?.scrollToFile(relativePath)
  return true
}

// 使用 defineExpose 暴露方法
defineExpose({
  previewImage,
  refreshFiles: () => projectFiles.refresh(),
  revealInTree
})
</script>

<style scoped>
.files-tab-panel {
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  background: var(--panel-bg);
  overflow: hidden;
  flex-shrink: 0;
  border: none;
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.tree-section {
  flex: 1;
  width: 100%;
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

.panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--text-color-muted);
  font-size: 12px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.panel-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--error-color, #e53e3e);
  font-size: 12px;
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

.empty-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
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
  color: var(--text-color-muted);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

/* Search Box */
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

/* Search Results */
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
  background: var(--primary-color-light, rgba(var(--primary-rgb, 99, 102, 241), 0.12));
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
</style>

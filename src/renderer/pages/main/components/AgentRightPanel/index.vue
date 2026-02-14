<template>
  <div class="agent-right-panel">
    <!-- 有活跃会话 -->
    <template v-if="sessionId">
      <!-- Header -->
      <FileTreeHeader
        :cwd="agentFiles.cwd.value"
        :show-hidden="agentFiles.showHidden.value"
        @open-explorer="agentFiles.openInExplorer()"
        @refresh="agentFiles.refresh()"
        @toggle-hidden="agentFiles.toggleShowHidden()"
        @collapse="$emit('collapse')"
      />

      <!-- Loading -->
      <div v-if="agentFiles.loading.value" class="panel-loading">
        <Icon name="refresh" :size="16" class="spin-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error -->
      <div v-else-if="agentFiles.error.value" class="panel-error">
        <Icon name="warning" :size="16" />
        <span>{{ t('agent.files.errorLoading') }}</span>
      </div>

      <!-- Content: File Tree + Preview -->
      <template v-else>
        <div class="panel-body" :class="{ 'has-preview': agentFiles.selectedFile.value }">
          <!-- File Tree -->
          <FileTree
            class="tree-section"
            :entries="agentFiles.entries.value"
            :expanded-dirs="agentFiles.expandedDirs"
            :selected-file="agentFiles.selectedFile.value"
            :get-dir-entries="agentFiles.getDirEntries"
            :loading="agentFiles.loading.value"
            @toggle-dir="agentFiles.toggleDir($event)"
            @select-file="agentFiles.selectFile($event)"
            @open-file="agentFiles.openFile($event)"
            @insert-path="handleInsertPath"
            @context-menu="handleContextMenu"
          />

          <!-- File Preview -->
          <FilePreview
            v-if="agentFiles.selectedFile.value"
            class="preview-section"
            :preview="agentFiles.filePreview.value"
            :loading="agentFiles.previewLoading.value"
            @close="agentFiles.closePreview()"
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
        <span>{{ t('agent.files.noSession') }}</span>
      </div>
    </template>

    <!-- 右键菜单 -->
    <FileTreeContextMenu ref="contextMenuRef" @action="handleMenuAction" />
  </div>
</template>

<script setup>
import { ref, watch, h, onMounted, onUnmounted } from 'vue'
import { useDialog, useMessage, NInput } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useAgentFiles } from '@composables/useAgentFiles'
import Icon from '@components/icons/Icon.vue'
import FileTreeHeader from './FileTreeHeader.vue'
import FileTree from './FileTree.vue'
import FilePreview from './FilePreview.vue'
import FileTreeContextMenu from './FileTreeContextMenu.vue'

const { t } = useLocale()
const dialog = useDialog()
const message = useMessage()
const agentFiles = useAgentFiles()
const contextMenuRef = ref(null)

const props = defineProps({
  sessionId: { type: String, default: null }
})

const emit = defineEmits(['collapse', 'insert-path'])

// watch sessionId 变化自动重置并加载
watch(() => props.sessionId, (newId) => {
  agentFiles.setSessionId(newId)
}, { immediate: true })

// 暴露预览方法给父组件调用
const previewImage = (previewData) => {
  // 设置加载状态
  agentFiles.previewLoading.value = true
  agentFiles.selectedFile.value = previewData.name

  // 模拟异步加载（给用户视觉反馈）
  setTimeout(() => {
    agentFiles.filePreview.value = previewData
    agentFiles.previewLoading.value = false
  }, 50)
}

// 处理路径插入：拼接完整路径
const handleInsertPath = (relativePath) => {
  const cwd = agentFiles.cwd.value
  if (!cwd || !relativePath) return

  // 判断路径分隔符（Windows 使用 \，Unix 使用 /）
  const separator = cwd.includes('\\') ? '\\' : '/'

  // 拼接完整路径
  const fullPath = cwd + separator + relativePath.replace(/\//g, separator)

  // emit 完整路径
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
  const sessionId = props.sessionId
  if (!sessionId) return

  switch (action) {
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
  const sessionId = props.sessionId
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
      const result = await window.electronAPI.createAgentFile({
        sessionId,
        parentPath,
        name: fileName,
        isDirectory: false
      })

      if (result.error) {
        message.error(t('agent.files.createFailed') + ': ' + result.error)
        return false
      }

      message.success(t('agent.files.createSuccess'))
      agentFiles.refresh()
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
  const sessionId = props.sessionId
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
      const result = await window.electronAPI.createAgentFile({
        sessionId,
        parentPath,
        name: folderName,
        isDirectory: true
      })

      if (result.error) {
        message.error(t('agent.files.createFailed') + ': ' + result.error)
        return false
      }

      message.success(t('agent.files.createSuccess'))
      agentFiles.refresh()
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

  const sessionId = props.sessionId
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
      const result = await window.electronAPI.renameAgentFile({
        sessionId,
        oldPath: target.relativePath,
        newName
      })

      if (result.error) {
        message.error(t('agent.files.renameFailed') + ': ' + result.error)
        return false
      }

      message.success(t('agent.files.renameSuccess'))
      agentFiles.refresh()
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

  const sessionId = props.sessionId
  const typeName = target.isDirectory ? t('common.folder') : t('common.file')

  dialog.warning({
    title: t('common.confirmDelete'),
    content: `${t('agent.files.deleteConfirm')} ${typeName} "${target.name}"？`,
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        const result = await window.electronAPI.deleteAgentFile({
          sessionId,
          path: target.relativePath
        })

        if (result.error) {
          message.error(t('agent.files.deleteFailed') + ': ' + result.error)
          return
        }

        message.success(t('agent.files.deleteSuccess'))
        agentFiles.refresh()
      } catch (err) {
        message.error(t('agent.files.deleteFailed') + ': ' + err.message)
      }
    }
  })
}

// 使用 defineExpose 暴露方法
defineExpose({
  previewImage
})
</script>

<style scoped>
.agent-right-panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  overflow: hidden;
  flex-shrink: 0;
  border: none;
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
  gap: 12px;
  color: var(--text-color-muted);
  font-size: 13px;
}

.empty-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  flex-shrink: 0;
  min-height: 36px;
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
</style>

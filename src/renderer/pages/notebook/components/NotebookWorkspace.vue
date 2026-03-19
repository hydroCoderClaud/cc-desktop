<template>
  <div class="notebook-workspace">
    <!-- 顶部导航栏 -->
    <div class="top-nav">
      <div class="nav-left">
        <div class="app-logo" @click="switchMode('agent')" :title="t('notebook.nav.backToMain')">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="15" :stroke="primaryColor" stroke-width="1.5" :fill="primaryGhost"/>
            <path d="M16 7 C16 7 10 14 10 18 a6 6 0 0 0 12 0 C22 14 16 7 16 7z" :fill="primaryColor" opacity="0.85"/>
          </svg>
        </div>

        <!-- 标题 + 下拉切换 -->
        <div class="title-group">
          <h1
            v-if="!editingTitle"
            class="notebook-title"
            :class="{ 'notebook-title--no-notebook': !currentNotebook }"
            @click="currentNotebook ? startEditTitle() : handleCreateNotebook()"
            :title="currentNotebook ? t('notebook.nav.editTitle') : t('notebook.nav.createNotebook')"
          >{{ notebookTitle || t('notebook.nav.createNotebook') }}</h1>
          <input
            v-else
            ref="titleInput"
            v-model="notebookTitle"
            class="notebook-title-input"
            spellcheck="false"
            @blur="stopEditTitle"
            @keyup.enter="stopEditTitle"
            @keyup.escape="stopEditTitle"
          />
          <div class="dropdown-wrapper" v-if="!editingTitle">
            <button class="dropdown-trigger" @click="toggleNotebookDropdown" :title="t('notebook.switchNotebook')">
              <Icon name="chevronDown" :size="16" />
            </button>
            <div v-if="showNotebookDropdown" class="notebook-dropdown">
              <div
                v-for="nb in notebookList"
                :key="nb.id"
                class="dropdown-item"
                :class="{ active: currentNotebook?.id === nb.id }"
                @click="switchNotebook(nb)"
              >
                <Icon name="fileText" :size="14" />
                <span v-if="renamingId !== nb.id" class="dropdown-item-name">{{ nb.name }}</span>
                <input
                  v-else
                  class="dropdown-rename-input"
                  v-model="renamingName"
                  @click.stop
                  @keydown.enter.stop="confirmRename(nb)"
                  @keydown.escape.stop="cancelRename"
                  @blur="cancelRename"
                  :ref="el => { if (el) renamingInputRef = el }"
                />
                <Icon v-if="currentNotebook?.id === nb.id && renamingId !== nb.id" name="check" :size="14" class="dropdown-check" />
                <div v-if="renamingId !== nb.id" class="dropdown-item-actions" @click.stop>
                  <button
                    v-if="currentNotebook?.id === nb.id"
                    class="item-action-btn"
                    @click.stop="closeNotebook"
                    :title="t('notebook.closeNotebook')"
                  >
                    <Icon name="close" :size="12" />
                  </button>
                  <button class="item-action-btn" @click.stop="startRename(nb)" :title="t('common.rename')">
                    <Icon name="edit" :size="12" />
                  </button>
                  <button class="item-action-btn" @click.stop="openNotebookDir(nb)" :title="t('notebook.openDir')">
                    <Icon name="folder" :size="12" />
                  </button>
                  <button class="item-action-btn item-action-btn--danger" @click.stop="confirmDelete(nb)" :title="t('common.delete')">
                    <Icon name="delete" :size="12" />
                  </button>
                </div>
              </div>
              <div v-if="notebookList.length === 0" class="dropdown-empty">{{ t('notebook.noNotebooks') }}</div>
              <div class="dropdown-divider"></div>
              <div class="dropdown-item dropdown-item-create" @click="handleCreateNotebook">
                <Icon name="plus" :size="14" />
                <span>{{ t('notebook.nav.createNotebook') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="nav-right">
        <button class="create-notebook-btn" @click="handleCreateNotebook">
          <Icon name="plus" :size="16" />
          <span>{{ t('notebook.nav.createNotebook') }}</span>
        </button>
        <button class="nav-btn" :title="t('notebook.nav.share')">
          <Icon name="link" :size="16" />
          <span>{{ t('notebook.nav.share') }}</span>
        </button>
        <button class="nav-btn" :title="t('notebook.nav.settings')">
          <Icon name="settings" :size="16" />
          <span>{{ t('notebook.nav.settings') }}</span>
        </button>
        <button class="nav-btn" :title="t('notebook.nav.apps')">
          <Icon name="grip" :size="16" />
          <span>{{ t('notebook.nav.apps') }}</span>
        </button>
        <div class="user-avatar">
          <Icon name="user" :size="20" />
        </div>
      </div>
    </div>

    <!-- 三栏面板 -->
    <div class="panels-container">
      <SourcePanel
        :sources="sources"
        :all-selected="allSelected"
        @add-source="handleAddSource"
        @toggle-select-all="toggleSelectAll"
        @open-external="handleOpenExternal"
      />

      <div class="resize-handle" @mousedown="startResize('left', $event)"></div>

      <!-- 有会话时用 key 强制重建，确保 useAgentChat 在 setup 顶层调用 -->
      <ChatPanel
        v-if="currentNotebook?.sessionId"
        :key="currentNotebook.sessionId"
        :session-id="currentNotebook.sessionId"
        :session-cwd="currentNotebook.notebookPath || ''"
        :selected-count="selectedSources.length"
        :api-profile-id="currentNotebook.apiProfileId"
        @preview-image="handlePreviewImage"
        @preview-link="handlePreviewLink"
        @preview-path="handlePreviewPath"
      />
      <!-- 无会话时显示引导 -->
      <div v-else class="empty-chat-panel">
        <div class="no-notebook-state">
          <div class="no-notebook-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="23" stroke="currentColor" stroke-width="1.5" opacity="0.2"/>
              <path d="M24 10 C24 10 14 21 14 27 a10 10 0 0 0 20 0 C34 21 24 10 24 10z" fill="currentColor" opacity="0.3"/>
            </svg>
          </div>
          <p class="empty-chat-title">开始你的第一个笔记本</p>
          <p class="empty-chat-hint">整理资料，用 AI 生成报告、视频、图表</p>
          <button class="empty-chat-btn" @click="handleCreateNotebook">
            <Icon name="plus" :size="16" />
            <span>新建笔记本</span>
          </button>
        </div>
      </div>

      <div class="resize-handle" @mousedown="startResize('right', $event)"></div>

      <StudioPanel :achievements="achievements" :available-types="availableTypes" />
    </div>

    <!-- 新建笔记本弹窗 -->
    <NotebookCreateModal
      v-model:show="showCreateModal"
      @created="handleNotebookCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useTheme } from '@composables/useTheme'
import { useAppMode } from '@composables/useAppMode'
import { useNotebookLayout } from '../composables/useNotebookLayout'
import SourcePanel from './SourcePanel.vue'
import ChatPanel from './ChatPanel.vue'
import StudioPanel from './StudioPanel.vue'
import NotebookCreateModal from './NotebookCreateModal.vue'

const message = useMessage()
const dialog = useDialog()
const { t } = useLocale()
const { cssVars } = useTheme()
const { switchMode } = useAppMode()
const { startResize } = useNotebookLayout()

const primaryColor = computed(() => cssVars.value?.['--primary-color'] || '#4a90d9')
const primaryGhost = computed(() => cssVars.value?.['--primary-ghost'] || '#e8f4ff')

// ─── 当前笔记本状态 ────────────────────────────────────────────────────────────
const currentNotebook = ref(null)   // { id, name, path, ... }
const notebookTitle = ref('')
const editingTitle = ref(false)
const titleInput = ref(null)
const isFullscreen = ref(false)
const loading = ref(false)

// ─── 数据 ─────────────────────────────────────────────────────────────────────
const sources = ref([])
const achievements = ref([])

const availableTypes = [
  { id: 'audio', icon: 'audio', beta: false, bgColor: '#E3F2FD', color: '#1976D2', tip: '生成一个由 AI 向您演示的解说音频' },
  { id: 'presentation', icon: 'presentation', beta: true, bgColor: '#FFF3E0', color: '#F57C00', tip: '生成一份演示文稿' },
  { id: 'video', icon: 'video', beta: false, bgColor: '#E8F5E9', color: '#388E3C', tip: '生成一个由 AI 向您演示的解说视频' },
  { id: 'mindmap', icon: 'mindmap', beta: false, bgColor: '#F3E5F5', color: '#7B1FA2', tip: '生成一张思维导图' },
  { id: 'report', icon: 'fileText', beta: false, bgColor: '#FFF8E1', color: '#FFA000', tip: '生成一份详细报告' },
  { id: 'flashcard', icon: 'heart', beta: false, bgColor: '#FCE4EC', color: '#C2185B', tip: '生成学习闪卡' },
  { id: 'quiz', icon: 'clipboard', beta: true, bgColor: '#FBE9E7', color: '#D84315', tip: '生成一份测验题目' },
  { id: 'infographic', icon: 'image', beta: true, bgColor: '#E0F7FA', color: '#0097A7', tip: '生成一张信息图' },
  { id: 'table', icon: 'table', beta: false, bgColor: '#EDE7F6', color: '#512DA8', tip: '生成一份数据表格' }
]

// ─── 加载 ─────────────────────────────────────────────────────────────────────
const loadNotebook = async (notebook) => {
  try {
    const data = await window.electronAPI.notebookGet(notebook.id)
    console.log('[NotebookWorkspace] notebookGet result:', {
      id: data.id,
      name: data.name,
      sessionId: data.sessionId,
      notebookPath: data.notebookPath
    })
    // 用 get() 的完整数据（含 sessionId、notebookPath）更新 currentNotebook
    currentNotebook.value = data
    notebookTitle.value = data.name
    sources.value = data.sources || []
    achievements.value = (data.achievements || []).map(a => ({
      ...a,
      icon: a.type,
      color: availableTypes.find(t => t.id === a.type)?.color || '#888',
      sourceCount: a.sourceIds?.length || 0,
      time: new Date(a.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }))
  } catch (err) {
    console.error('[Notebook] Failed to load notebook data:', err)
  }
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('click', handleGlobalClick, true)
  // 启动时不自动选中任何笔记本，等待用户从下拉列表选择或新建
  loading.value = false
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('click', handleGlobalClick, true)
})

// ─── 标题编辑 ─────────────────────────────────────────────────────────────────
const startEditTitle = async () => {
  editingTitle.value = true
  await nextTick()
  titleInput.value?.select()
}

const stopEditTitle = async () => {
  const newName = notebookTitle.value.trim()
  if (!newName) {
    notebookTitle.value = currentNotebook.value?.name || ''
    editingTitle.value = false
    return
  }
  if (currentNotebook.value && newName !== currentNotebook.value.name) {
    try {
      const updated = await window.electronAPI.notebookRename({ id: currentNotebook.value.id, name: newName })
      currentNotebook.value = { ...currentNotebook.value, ...updated }
    } catch (err) {
      message.error('重命名失败：' + err.message)
      notebookTitle.value = currentNotebook.value.name
    }
  }
  editingTitle.value = false
}

// ─── 新建笔记本弹窗 ──────────────────────────────────────────────────────────
const showCreateModal = ref(false)

const handleCreateNotebook = () => {
  showNotebookDropdown.value = false
  showCreateModal.value = true
}

const handleNotebookCreated = async (nb) => {
  await loadNotebook(nb)
  message.success(`已创建：${nb.name}`)
}

// ─── 笔记本下拉切换 ──────────────────────────────────────────────────────────
const showNotebookDropdown = ref(false)
const notebookList = ref([])

const toggleNotebookDropdown = async () => {
  if (showNotebookDropdown.value) {
    showNotebookDropdown.value = false
    return
  }
  try {
    notebookList.value = await window.electronAPI.notebookList()
  } catch (err) {
    console.error('[Notebook] Failed to list notebooks:', err)
  }
  showNotebookDropdown.value = true
}

const switchNotebook = async (nb) => {
  showNotebookDropdown.value = false
  if (currentNotebook.value?.id === nb.id) return
  await loadNotebook(nb)
}

// ─── 下拉列表内操作 ───────────────────────────────────────────────────────────
const renamingId = ref(null)
const renamingName = ref('')
let renamingInputRef = null

const startRename = async (nb) => {
  renamingId.value = nb.id
  renamingName.value = nb.name
  await nextTick()
  renamingInputRef?.select()
}

const cancelRename = () => {
  renamingId.value = null
  renamingName.value = ''
}

const confirmRename = async (nb) => {
  const newName = renamingName.value.trim()
  cancelRename()
  if (!newName || newName === nb.name) return
  try {
    await window.electronAPI.notebookRename({ id: nb.id, name: newName })
    // 更新列表和当前笔记本标题
    const item = notebookList.value.find(n => n.id === nb.id)
    if (item) item.name = newName
    if (currentNotebook.value?.id === nb.id) {
      currentNotebook.value = { ...currentNotebook.value, name: newName }
      notebookTitle.value = newName
    }
  } catch (err) {
    message.error('重命名失败：' + err.message)
  }
}

const openNotebookDir = async (nb) => {
  const targetNb = nb.notebookPath
    ? nb
    : notebookList.value.find(n => n.id === nb.id)
  const dirPath = targetNb?.notebookPath
  if (!dirPath) return
  window.electronAPI.openPath(dirPath).catch(() => {})
}

const closeNotebook = async () => {
  showNotebookDropdown.value = false

  // 关闭 Agent 会话，释放资源
  if (currentNotebook.value?.sessionId) {
    try {
      await window.electronAPI.closeAgentSession(currentNotebook.value.sessionId)
    } catch (err) {
      console.warn('[Notebook] Failed to close agent session:', err)
    }
  }

  currentNotebook.value = null
  notebookTitle.value = ''
  sources.value = []
}

const confirmDelete = async (nb) => {
  // 先关闭下拉菜单，避免删除过程中状态混乱
  showNotebookDropdown.value = false

  dialog.warning({
    title: '删除笔记本',
    content: `确定删除「${nb.name}」？此操作将删除笔记本目录及所有对话记录，不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await window.electronAPI.notebookDelete(nb.id)
        notebookList.value = notebookList.value.filter(n => n.id !== nb.id)
        if (currentNotebook.value?.id === nb.id) {
          currentNotebook.value = null
          notebookTitle.value = ''
          sources.value = []
        }
        message.success(`已删除：${nb.name}`)
      } catch (err) {
        console.error('[Notebook] Delete failed:', err)
        message.error('删除失败：' + (err.message || '未知错误'))
      }
    }
  })
}

// 点击外部关闭下拉
const handleGlobalClick = (e) => {
  if (showNotebookDropdown.value) {
    const wrapper = e.target.closest('.dropdown-wrapper')
    if (!wrapper) showNotebookDropdown.value = false
  }
}

// ─── 全屏 ─────────────────────────────────────────────────────────────────────
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

const onFullscreenChange = () => { isFullscreen.value = !!document.fullscreenElement }

// ─── Sources ─────────────────────────────────────────────────────────────────
const selectedSources = computed(() => sources.value.filter(s => s.selected))
const allSelected = computed(() => sources.value.length > 0 && sources.value.every(s => s.selected))

const toggleSelectAll = async () => {
  const newValue = !allSelected.value
  if (!currentNotebook.value) return
  const updates = sources.value.map(s => window.electronAPI.notebookUpdateSource({ notebookId: currentNotebook.value.id, sourceId: s.id, updates: { selected: newValue } }))
  await Promise.all(updates).catch(() => {})
  sources.value.forEach(s => { s.selected = newValue })
}

const handleAddSource = () => message.info('添加来源功能开发中...')

const handleOpenExternal = (source) => {
  if (source.url) window.electronAPI.openExternal(source.url).catch(() => {})
  else message.info(`外部打开：${source.name}`)
}

const handlePreviewImage = (previewData) => {
  if (previewData?.path) {
    window.electronAPI.openPath(previewData.path).catch(() => {})
  }
}

const handlePreviewLink = (linkData) => {
  if (linkData?.url) {
    window.electronAPI.openExternal(linkData.url).catch(() => {})
  }
}

const handlePreviewPath = async (filePath) => {
  if (!filePath) return
  try {
    const fileData = await window.electronAPI.readAbsolutePath({
      filePath,
      sessionId: currentNotebook.value?.sessionId,
      confirmed: true
    })

    if (fileData?.error) {
      message.error(fileData.error)
      return
    }

    if (fileData?.type === 'directory') {
      await window.electronAPI.openPath(filePath)
      return
    }

    await window.electronAPI.openPath(filePath)
  } catch (err) {
    console.error('[Notebook] Failed to preview path:', err)
    message.error('文件预览失败')
  }
}
</script>

<style scoped>
.notebook-workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-color);
  color: var(--text-color);
}

.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  min-height: 56px;
  max-height: 56px;
  padding: 10px 24px 0;
  background: var(--bg-color);
  flex-shrink: 0;
}

.nav-left { display: flex; align-items: center; gap: 8px; }

.app-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s;
}

.app-logo:hover { background: var(--hover-bg); }

.notebook-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color);
  margin: 0;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
}

.notebook-title:hover { background: var(--hover-bg); }
.notebook-title--no-notebook { color: var(--text-secondary); }
.notebook-title--no-notebook:hover { color: var(--text-primary); }

.notebook-title-input {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color);
  margin: 0;
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  padding: 2px 6px;
  outline: none;
  background: var(--bg-color-secondary);
  min-width: 200px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dropdown-wrapper {
  position: relative;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.dropdown-trigger:hover { background: var(--hover-bg); color: var(--text-color); }

.notebook-dropdown {
  position: absolute;
  top: 100%;
  left: -80px;
  margin-top: 6px;
  min-width: 260px;
  max-height: 380px;
  overflow-y: auto;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 100;
  padding: 4px;
}

.dropdown-header {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: background 0.1s;
}

.dropdown-item:hover { background: var(--hover-bg); }

.dropdown-item.active { background: var(--primary-ghost, rgba(74, 144, 217, 0.08)); }

.dropdown-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-check { color: var(--primary-color); flex-shrink: 0; }

/* hover 时显示操作按钮 */
.dropdown-item-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.dropdown-item:hover .dropdown-item-actions {
  display: flex;
}

.item-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 0;
}

.item-action-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.item-action-btn--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.dropdown-rename-input {
  flex: 1;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--bg-color);
  outline: none;
}

.dropdown-empty {
  padding: 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-muted);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
}

.dropdown-item-create { color: var(--primary-color); font-weight: 500; }

.nav-right { display: flex; align-items: center; gap: 8px; }

.create-notebook-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 18px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.create-notebook-btn:hover { background: var(--primary-color-hover); }

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  background: var(--hover-bg);
  border: none;
  border-radius: 20px;
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.nav-btn:hover { background: var(--border-color); }

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  margin-left: 8px;
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover-bg);
  color: var(--text-color-muted);
}

.panels-container {
  flex: 1;
  display: flex;
  gap: 0;
  padding: 8px 16px 16px;
  overflow: hidden;
  align-items: stretch;
}

.resize-handle {
  width: 4px;
  height: 100%;
  cursor: col-resize;
  flex-shrink: 0;
  border-radius: 2px;
  background: transparent;
  margin: 0 4px;
  transition: background 0.15s;
}

.resize-handle:hover { background: transparent; }

.empty-chat-panel {
  flex: 1;
  min-width: 300px;
  background: var(--bg-color-secondary);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-notebook-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.no-notebook-icon { color: var(--primary-color); }

.empty-chat-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.empty-chat-hint {
  font-size: 13px;
  color: var(--text-color-muted);
  margin: 0;
}

.empty-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  height: 38px;
  padding: 0 22px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.empty-chat-btn:hover { background: var(--primary-color-hover); }
</style>

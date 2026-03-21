<template>
  <div class="notebook-workspace">
    <NotebookTopNav
      :current-notebook="currentNotebook"
      :primary-color="primaryColor"
      :primary-ghost="primaryGhost"
      @create="handleCreateNotebook"
      @switch="loadNotebook"
      @close="handleCloseNotebook"
      @renamed="handleRenamed"
      @deleted="handleDeleted"
    />

    <!-- 三栏面板 -->
    <div class="panels-container">
      <SourcePanel
        :sources="sources"
        :all-selected="allSelected"
        @add-source="handleAddSource"
        @toggle-select-all="handleToggleSelectAll"
        @invert-selection="handleInvertSelection"
        @update-source="handleUpdateSource"
        @open-external="handleOpenExternal"
        @delete-sources="handleDeleteSources"
      />

      <div class="resize-handle" @mousedown="startResize('left', $event)"></div>

      <!-- 有会话时用 key 强制重建，确保 useAgentChat 在 setup 顶层调用 -->
      <ChatPanel
        ref="chatPanelRef"
        v-if="currentNotebook?.sessionId"
        :key="currentNotebook.sessionId"
        :session-id="currentNotebook.sessionId"
        :session-cwd="currentNotebook.notebookPath || ''"
        :selected-count="selectedSources.length"
        :api-profile-id="currentNotebook.apiProfileId"
        @preview-image="handlePreviewImage"
        @preview-link="handlePreviewLink"
        @preview-path="handlePreviewPath"
        @agent-done="handleAgentDone"
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
          <p class="empty-chat-title">{{ t('notebook.empty.title') }}</p>
          <p class="empty-chat-hint">{{ t('notebook.empty.hint') }}</p>
          <button class="empty-chat-btn" @click="handleCreateNotebook">
            <Icon name="plus" :size="16" />
            <span>{{ t('notebook.nav.createNotebook') }}</span>
          </button>
        </div>
      </div>

      <div class="resize-handle" @mousedown="startResize('right', $event)"></div>

      <StudioPanel
        :achievements="achievements"
        :available-types="availableTypes"
        @generate="handleGenerateAchievement"
        @toggle-select-all="handleToggleSelectAllAchievements"
        @invert-selection="handleInvertSelectionAchievements"
        @update-achievement="handleUpdateAchievement"
        @delete-achievements="handleDeleteAchievements"
      />
    </div>

    <!-- 新建笔记本弹窗 -->
    <NotebookCreateModal
      v-model:show="showCreateModal"
      @created="handleNotebookCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useTheme } from '@composables/useTheme'
import { useNotebookLayout } from '../composables/useNotebookLayout'
import NotebookTopNav from './NotebookTopNav.vue'
import SourcePanel from './SourcePanel.vue'
import ChatPanel from './ChatPanel.vue'
import StudioPanel from './StudioPanel.vue'
import NotebookCreateModal from './NotebookCreateModal.vue'

const message = useMessage()
const dialog = useDialog()
const { t } = useLocale()
const { cssVars } = useTheme()
const { startResize, showRightPanel } = useNotebookLayout()

const primaryColor = computed(() => cssVars.value?.['--primary-color'] || '#4a90d9')
const primaryGhost = computed(() => cssVars.value?.['--primary-ghost'] || '#e8f4ff')

const chatPanelRef = ref(null)

// ─── 当前笔记本状态 ────────────────────────────────────────────────────────────
const currentNotebook = ref(null)
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

// ─── 加载笔记本 ───────────────────────────────────────────────────────────────
const loadNotebook = async (notebook) => {
  // 关闭当前会话（若有），释放 CLI 进程
  if (currentNotebook.value?.sessionId) {
    try {
      await window.electronAPI.closeAgentSession(currentNotebook.value.sessionId)
    } catch (err) {
      console.warn('[Notebook] Failed to close previous session:', err)
    }
  }
  try {
    const data = await window.electronAPI.notebookGet(notebook.id)
    currentNotebook.value = data
    // 注入全局 ID 供预览组件使用
    window.currentNotebookId = data.id
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

// ─── 笔记本 CRUD 事件处理 ─────────────────────────────────────────────────────
const showCreateModal = ref(false)

const handleCreateNotebook = () => { showCreateModal.value = true }

const handleNotebookCreated = async (nb) => {
  await loadNotebook(nb)
  message.success(t('notebook.createSuccess', { name: nb.name }))
}

const handleCloseNotebook = async () => {
  if (currentNotebook.value?.sessionId) {
    try {
      await window.electronAPI.closeAgentSession(currentNotebook.value.sessionId)
    } catch (err) {
      console.warn('[Notebook] Failed to close agent session:', err)
    }
  }
  currentNotebook.value = null
  sources.value = []
}

const handleRenamed = ({ id, name }) => {
  if (currentNotebook.value?.id === id) {
    currentNotebook.value = { ...currentNotebook.value, name }
  }
}

const handleDeleted = (id) => {
  if (currentNotebook.value?.id === id) {
    currentNotebook.value = null
    sources.value = []
  }
}

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

const handleAddSource = async () => {
  if (!currentNotebook.value) return
  const filePaths = await window.electronAPI.selectFiles({
    title: t('notebook.source.add'),
    filters: [
      { name: 'All Supported', extensions: ['pdf', 'docx', 'xlsx', 'xls', 'csv', 'pptx', 'ppt', 'md', 'markdown', 'txt', 'html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'json', 'vue', 'sh', 'ps1'] },
      { name: 'Office Documents', extensions: ['docx', 'xlsx', 'xls', 'csv', 'pptx', 'ppt'] },
      { name: 'Documents', extensions: ['pdf', 'md', 'markdown', 'txt', 'html', 'htm', 'csv'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'] },
      { name: 'Media', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
      { name: 'Code', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'json', 'yaml', 'yml', 'toml', 'vue', 'sh', 'ps1', 'sql', 'rb', 'php', 'swift', 'kt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (filePaths && filePaths.length > 0) {
    const loading = message.loading(t('common.loading'), { duration: 0 })
    try {
      await window.electronAPI.notebookImportFiles({
        notebookId: currentNotebook.value.id,
        filePaths
      })
      // 重新加载数据以刷新来源列表
      await loadNotebook(currentNotebook.value)
      message.success(t('common.success'))
    } catch (err) {
      console.error('[Notebook] Failed to import files:', err)
      message.error(t('common.error'))
    } finally {
      loading.destroy()
    }
  }
}

const handleOpenExternal = async (source) => {
  if (!source) return
  
  // 1. 如果是网页链接
  if (source.url) {
    window.electronAPI.openExternal(source.url).catch(() => {})
    return
  }

  // 2. 如果是本地文件
  if (source.path && currentNotebook.value?.notebookPath) {
    try {
      const absPath = await window.electronAPI.resolvePath(currentNotebook.value.notebookPath, source.path)
      await window.electronAPI.openPath(absPath)
    } catch (err) {
      console.error('[Notebook] Failed to open path:', err)
      message.error(t('common.error'))
    }
  } else {
    message.warning(t('messages.loadFailed'))
  }
}

const handleToggleSelectAll = async () => {
  if (!currentNotebook.value) return
  const allSelected = sources.value.every(s => s.selected)
  const newValue = !allSelected
  
  // 本地更新 UI
  sources.value.forEach(s => { s.selected = newValue })
  
  // 同步到后端
  try {
    const promises = sources.value.map(s => 
      window.electronAPI.notebookUpdateSource({
        notebookId: currentNotebook.value.id,
        sourceId: s.id,
        updates: { selected: newValue }
      })
    )
    await Promise.all(promises)
  } catch (err) {
    console.error('[Notebook] Failed to sync select all:', err)
  }
}

const handleInvertSelection = async () => {
  if (!currentNotebook.value) return
  
  // 本地更新 UI
  sources.value.forEach(s => { s.selected = !s.selected })
  
  // 同步到后端
  try {
    const promises = sources.value.map(s => 
      window.electronAPI.notebookUpdateSource({
        notebookId: currentNotebook.value.id,
        sourceId: s.id,
        updates: { selected: s.selected }
      })
    )
    await Promise.all(promises)
  } catch (err) {
    console.error('[Notebook] Failed to sync invert selection:', err)
  }
}

const handleUpdateSource = async (sourceId, updates) => {
  if (!currentNotebook.value) return
  
  // 本地更新 UI
  const source = sources.value.find(s => s.id === sourceId)
  if (source) Object.assign(source, updates)
  
  // 同步到后端
  try {
    await window.electronAPI.notebookUpdateSource({
      notebookId: currentNotebook.value.id,
      sourceId,
      updates
    })
  } catch (err) {
    console.error('[Notebook] Failed to update source:', err)
    message.error(t('common.error'))
  }
}

const handleDeleteSources = async (sourceIds) => {
  if (!currentNotebook.value || !sourceIds.length) return
  
  dialog.warning({
    title: t('common.delete'),
    content: t('messages.confirmDelete'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await window.electronAPI.notebookDeleteSources({
          notebookId: currentNotebook.value.id,
          sourceIds
        })
        // 本地过滤掉已删除项
        sources.value = sources.value.filter(s => !sourceIds.includes(s.id))
        message.success(t('common.deleteSuccess'))
      } catch (err) {
        console.error('[Notebook] Failed to delete sources:', err)
        message.error(t('common.deleteFailed'))
      }
    }
  })
}

// ─── Studio Achievements 持久化同步 ───────────────────────────────────────────
const handleToggleSelectAllAchievements = async () => {
  if (!currentNotebook.value) return
  const allSelected = achievements.value.every(a => a.selected)
  const newValue = !allSelected
  achievements.value.forEach(a => { a.selected = newValue })
  try {
    const promises = achievements.value.map(a => 
      window.electronAPI.notebookUpdateAchievement({
        notebookId: currentNotebook.value.id,
        achievementId: a.id,
        updates: { selected: newValue }
      })
    )
    await Promise.all(promises)
  } catch (err) {
    console.error('[Notebook] Sync achievements select all failed:', err)
  }
}

const handleInvertSelectionAchievements = async () => {
  if (!currentNotebook.value) return
  achievements.value.forEach(a => { a.selected = !a.selected })
  try {
    const promises = achievements.value.map(a => 
      window.electronAPI.notebookUpdateAchievement({
        notebookId: currentNotebook.value.id,
        achievementId: a.id,
        updates: { selected: a.selected }
      })
    )
    await Promise.all(promises)
  } catch (err) {
    console.error('[Notebook] Sync achievements invert failed:', err)
  }
}

const handleUpdateAchievement = async (achievementId, updates) => {
  if (!currentNotebook.value) return
  const ach = achievements.value.find(a => a.id === achievementId)
  if (ach) Object.assign(ach, updates)
  try {
    await window.electronAPI.notebookUpdateAchievement({
      notebookId: currentNotebook.value.id,
      achievementId,
      updates
    })
  } catch (err) {
    console.error('[Notebook] Update achievement failed:', err)
  }
}

const handleDeleteAchievements = async (achievementIds) => {
  if (!currentNotebook.value || !achievementIds.length) return
  dialog.warning({
    title: t('common.delete'),
    content: t('messages.confirmDelete'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await window.electronAPI.notebookDeleteAchievements({
          notebookId: currentNotebook.value.id,
          achievementIds
        })
        achievements.value = achievements.value.filter(a => !achievementIds.includes(a.id))
        message.success(t('common.deleteSuccess'))
      } catch (err) {
        console.error('[Notebook] Batch delete achievements failed:', err)
        message.error(t('common.deleteFailed'))
      }
    }
  })
}

// ─── Studio Achievements ──────────────────────────────────────────────────
const handleGenerateAchievement = async (typeId) => {
  if (!currentNotebook.value) return
  if (selectedSources.value.length === 0) {
    message.warning(t('notebook.chat.selectSourcesFirst') || '请先在左侧选择至少一个来源')
    return
  }

  const type = availableTypes.find(t => t.id === typeId)
  const typeName = t('notebook.types.' + typeId)
  const sourceInfo = selectedSources.value.map(s => `- ${s.name} (路径: ${s.path})`).join('\n')

  // 1. 创建成果记录（状态为 generating）
  try {
    await window.electronAPI.notebookAddAchievement({
      notebookId: currentNotebook.value.id,
      achievementData: {
        name: `${typeName} - ${new Date().toLocaleDateString()}`,
        type: typeId,
        sourceIds: selectedSources.value.map(s => s.id)
      }
    })
    // 刷新列表显示正在生成
    await loadNotebook(currentNotebook.value)
  } catch (err) {
    console.error('[Notebook] Failed to create achievement record:', err)
  }

  // 2. 构建指令并发送给 Agent (包含路径以防幻觉)
  const prompt = `请分析以下选中的来源文件：\n${sourceInfo}\n\n我的目标是：基于这些文件内容生成一份 ${typeName}。\n请直接输出 ${typeName} 的详细内容，如果是报告请保持结构完整，如果是思维导图请使用 Markdown 列表格式，如果是演示文稿请分页面描述。`

  if (chatPanelRef.value) {
    showRightPanel.value = true
    await chatPanelRef.value.sendMessage(prompt)
  }
}

const handleAgentDone = async (newFilePaths = []) => {
  // Agent 完成后，如果生成了新文件，或者只是对话结束，我们刷新笔记本数据
  // 以便获取可能更新的 achievements.json
  if (currentNotebook.value) {
    await loadNotebook(currentNotebook.value)
  }
}

// ─── 预览处理 ─────────────────────────────────────────────────────────────────
const handlePreviewImage = (previewData) => {
  if (previewData?.path) window.electronAPI.openPath(previewData.path).catch(() => {})
}

const handlePreviewLink = (linkData) => {
  if (linkData?.url) window.electronAPI.openExternal(linkData.url).catch(() => {})
}

const handlePreviewPath = async (filePath) => {
  if (!filePath) return
  try {
    const fileData = await window.electronAPI.readAbsolutePath({
      filePath,
      sessionId: currentNotebook.value?.sessionId,
      confirmed: true
    })
    if (fileData?.error) { message.error(fileData.error); return }
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

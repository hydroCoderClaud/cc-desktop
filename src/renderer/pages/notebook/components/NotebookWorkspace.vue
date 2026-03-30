<template>
  <div class="notebook-workspace">
    <NotebookTopNav
      :current-notebook="currentNotebook"
      :primary-color="primaryColor"
      :primary-ghost="primaryGhost"
      @create="handleCreateNotebook"
      @switch="loadNotebook"
      @close="handleCloseNotebook"
      @cleanup="handleCleanupIndexes"
      @renamed="handleRenamed"
      @deleted="handleDeleted"
    />

    <!-- 三栏面板 -->
    <div class="panels-container">
      <SourcePanel
        :key="currentNotebook?.id || 'no-notebook-source'"
        :sources="sources"
        :all-selected="allSelected"
        :copy-source-files="currentNotebook?.copySourceFiles ?? false"
        :notebook-id="currentNotebook?.id || null"
        :notebook-path="currentNotebook?.notebookPath ?? ''"
        :leftWidth="leftWidth"
        :showLeftPanel="showLeftPanel"
        :expandPanel="expandPanel"
        :collapsePanel="collapsePanel"
        @add-source="handleAddSource"
        @toggle-select-all="handleToggleSelectAll"
        @invert-selection="handleInvertSelection"
        @update-source="handleUpdateSource"
        @open-external="handleOpenExternal"
        @delete-sources="handleDeleteSources"
        @toggle-copy-source-files="handleToggleCopySourceFiles"
        @rename-source="handleRenameSource"
        @export-source="handleExportSource"
        @add-to-achievement="handleAddSourceToAchievement"
        @delete-source="handleDeleteSource"
        @update:showLeftPanel="showLeftPanel = $event"
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
        :generation-token="activeGenerationToken"
        @preview-image="handlePreviewImage"
        @preview-link="handlePreviewLink"
        @preview-path="handlePreviewPath"
        @agent-done="handleAgentDone"
        @agent-cancelled="handleAgentCancelled"
        @request-clear-session="handleClearSession"
        @save-image-to-source="handleSaveChatImageToSource"
        @save-image-to-achievement="handleSaveChatImageToAchievement"
        @copy-content-to-source="handleCopyChatContentToSource"
        @copy-content-to-achievement="handleCopyChatContentToAchievement"
        @add-path-to-source="handleAddPathToSource"
        @add-path-to-achievement="handleAddPathToAchievement"
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
        :key="currentNotebook?.id || 'no-notebook-studio'"
        :achievements="achievements"
        :available-types="availableTypes"
        :has-new-tools="hasNewTools"
        :notebook-id="currentNotebook?.id || null"
        :rightWidth="rightWidth"
        :showRightPanel="showRightPanel"
        :expandPanel="expandPanel"
        :collapsePanel="collapsePanel"
        @generate="handleGenerateAchievement"
        @toggle-select-all="handleToggleSelectAllAchievements"
        @invert-selection="handleInvertSelectionAchievements"
        @update-achievement="handleUpdateAchievement"
        @delete-achievements="handleDeleteAchievements"
        @delete="handleDeleteAchievement"
        @rename="handleRenameAchievement"
        @edit-tool="handleEditTool"
        @download-tool="handleDownloadTool"
        @add-to-source="handleAddAchievementToSource"
        @export="handleExportAchievement"
        @open-external="handleOpenExternal"
        @open-market="showMarketModal = true"
        @update:showRightPanel="showRightPanel = $event"
      />
    </div>

    <div v-if="previewImageData" class="image-preview-backdrop" @click="closePreviewImage">
      <div class="image-preview-modal" @click.stop>
        <div class="image-preview-header">
          <span class="image-preview-title">{{ previewImageData.name }}</span>
          <button class="image-preview-close" @click="closePreviewImage" :title="t('common.close')">
            <Icon name="close" :size="16" />
          </button>
        </div>
        <div class="image-preview-body">
          <ImageRenderer :content="previewImageData.content" :name="previewImageData.name" />
        </div>
      </div>
    </div>

    <!-- 新建笔记本弹窗 -->
    <NotebookCreateModal
      v-model:show="showCreateModal"
      @created="handleNotebookCreated"
    />

    <!-- 工具配置弹窗 -->
    <ToolConfigModal
      v-model:show="showToolConfig"
      :tool="editingToolData"
      @save="handleSaveTool"
      @open-prompt-editor="handleOpenPromptEditor"
    />

    <!-- 提示词模板编辑器 -->
    <PromptEditModal
      v-model:show="showPromptEditor"
      :market-id="editingPromptMarketId"
      :runtime-placeholders="editingPromptRuntimePlaceholders"
    />

    <!-- 创作工具市场 -->
    <NotebookMarketModal
      v-model:show="showMarketModal"
      :local-tools="availableTypes"
      @install="handleInstallWithMcpConfig"
      @uninstall="handleUninstallTool"
    />

    <McpEnvConfigModal
      v-model="showMcpEnvConfig"
      :mcp-name="pendingMcpDep?.id || ''"
      :env-vars="pendingMcpEnvVars"
      :proxy-available="false"
      @confirm="onMcpEnvConfigConfirm"
      @cancel="onMcpEnvConfigCancel"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, h } from 'vue'
import { useMessage, useDialog, NInput } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useTheme } from '@composables/useTheme'
import { useNotebookLayout } from '../composables/useNotebookLayout'
import { isNewerVersion } from '../utils/version'
import { extractAllEnvVars } from '@/utils/mcp-env-utils'
import NotebookTopNav from './NotebookTopNav.vue'
import SourcePanel from './SourcePanel.vue'
import ChatPanel from './ChatPanel.vue'
import StudioPanel from './StudioPanel.vue'
import NotebookCreateModal from './NotebookCreateModal.vue'
import ToolConfigModal from './ToolConfigModal.vue'
import PromptEditModal from './PromptEditModal.vue'
import NotebookMarketModal from './NotebookMarketModal.vue'
import ImageRenderer from './renderers/ImageRenderer.vue'
import McpEnvConfigModal from '../../main/components/RightPanel/tabs/skills/McpEnvConfigModal.vue'

const message = useMessage()
const dialog = useDialog()
const { t } = useLocale()
const { cssVars } = useTheme()

const primaryColor = computed(() => cssVars.value?.['--primary-color'] || '#4a90d9')
const primaryGhost = computed(() => cssVars.value?.['--primary-ghost'] || '#e8f4ff')

const chatPanelRef = ref(null)
const activeGenerationAchievementId = ref(null)
const activeGenerationToken = ref(0)
const previewImageData = ref(null)

// ─── 当前笔记本状态 ────────────────────────────────────────────────────────────
const currentNotebook = ref(null)
// 布局状态（需要 notebookId 实现 per-notebook 隔离）
const notebookLayoutId = computed(() => currentNotebook.value?.id)
const {
  leftWidth, rightWidth,
  showLeftPanel, showRightPanel,
  expandPanel, collapsePanel,
  startResize
} = useNotebookLayout(notebookLayoutId)
const sources = ref([])
const achievements = ref([])

const availableTypes = ref([])
const showToolConfig = ref(false)
const editingToolData = ref(null)

// 提示词编辑器状态
const showPromptEditor = ref(false)
const editingPromptMarketId = ref('')
const editingPromptRuntimePlaceholders = ref({})

const remoteTools = ref([])
const showMarketModal = ref(false)
const showMcpEnvConfig = ref(false)
const pendingInstallTool = ref(null)
const pendingMcpDep = ref(null)
const pendingMcpEnvVars = ref([])

// 仅当已安装工具可更新时，市场图标显示红点
const hasNewTools = computed(() => {
  if (!remoteTools.value.length) return false
  return remoteTools.value.some(rt => {
    const lt = availableTypes.value.find(t => t.id === rt.id && t.installed === true)
    if (!lt) return false
    return isNewerVersion(rt.version, lt.version)
  })
})

const normalizeToolTags = (tool) => ({
  ...tool,
  tags: Array.isArray(tool?.tags)
    ? [...new Set(tool.tags.map(tag => String(tag).trim()).filter(Boolean))]
    : []
})

const loadTools = async () => {
  try {
    // 1. 获取本地已配置的工��
    const localTools = await window.electronAPI.notebookListTools()
    const defaultStyles = {
      image: { bgColor: '#E0F7FA', color: '#0097A7' },
      video: { bgColor: '#E8F5E9', color: '#388E3C' },
      notes: { bgColor: '#FFF8E1', color: '#FFA000' },
      pdf: { bgColor: '#FCE4EC', color: '#C2185B' },
      presentation: { bgColor: '#FFF3E0', color: '#F57C00' },
      word: { bgColor: '#E3F2FD', color: '#1976D2' },
      web: { bgColor: '#F3E5F5', color: '#7B1FA2' },
      data: { bgColor: '#EDE7F6', color: '#512DA8' }
    }
    
    const localMapped = (localTools || []).map(t => normalizeToolTags({
      ...t,
      bgColor: t.bgColor || defaultStyles[t.id]?.bgColor || '#f5f5f5',
      color: t.color || defaultStyles[t.id]?.color || '#666',
      installed: true
    }))

    // 2. 尝试拉取远程工具清单进行比对
    try {
      console.log('[Notebook] Fetching remote tools from market...')
      const remoteRes = await window.electronAPI.notebookFetchRemoteTools()
      console.log('[Notebook] Remote tools response:', remoteRes)

      if (remoteRes.success && remoteRes.data && remoteRes.data.tools) {
        remoteTools.value = remoteRes.data.tools.map(normalizeToolTags)
        console.log('[Notebook] Successfully synced remote tools count:', remoteRes.data.tools.length)
        availableTypes.value = localMapped
      } else {
        remoteTools.value = []
        const errorMsg = remoteRes.error || '返回数据格式错误'
        console.warn('[Notebook] Remote sync failed:', errorMsg)
        // 只有在真的出错时才提示，空数据不提示
        if (remoteRes.error) message.info(`远程工具同步跳过: ${errorMsg}`)
        availableTypes.value = localMapped
      }
    } catch (e) {
      console.error('[Notebook] Failed to sync remote tools exception:', e)
      remoteTools.value = []
      availableTypes.value = localMapped
    }
  } catch (err) {
    console.error('[Notebook] Failed to load tools:', err)
  }
}

const handleEditTool = (tool) => {
  editingToolData.value = tool
  showToolConfig.value = true
}

const handleOpenPromptEditor = (data) => {
  console.log('[Notebook] Opening prompt editor for:', data.promptTemplateId)
  editingPromptMarketId.value = data.promptTemplateId
  editingPromptRuntimePlaceholders.value = data.runtimePlaceholders || {}
  showPromptEditor.value = true
}

const restartNotebookSession = async () => {
  const notebook = currentNotebook.value
  if (!notebook?.id || !notebook?.sessionId) return

  const result = await window.electronAPI.notebookRestartSession(notebook.id)
  if (!result) return

  activeGenerationAchievementId.value = null
  activeGenerationToken.value = 0

  // 更新本地状态
  currentNotebook.value = result
  sources.value = result.sources || []
  const sourceMetaMap = new Map((result.sources || []).map(s => [s.id, s]))
  achievements.value = processAchievements(result.achievements || [], result.notebookPath, sourceMetaMap)
}

const handleClearSession = async () => {
  await restartNotebookSession()
}

const buildChatAssetName = (message, suffix) => {
  const firstLine = (message?.content || '')
    .split('\n')
    .map(line => line.trim())
    .find(Boolean)
  const base = (firstLine || suffix || 'chat')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
  return base || suffix || 'chat'
}

const refreshSources = async () => {
  if (!currentNotebook.value?.id) return
  sources.value = await window.electronAPI.notebookListSources(currentNotebook.value.id)
  recomputeAchievementsPresentation()
}

const getSelectedSourceIdsForChat = () => selectedSources.value.map(s => s.id)

const handleSaveChatImageToSource = async ({ dataUrl, message: chatMessage, filename } = {}) => {
  if (!currentNotebook.value?.id) return
  try {
    await window.electronAPI.notebookSaveChatImageToSource({
      notebookId: currentNotebook.value.id,
      filename: filename || buildChatAssetName(chatMessage, 'chat-image'),
      dataUrl
    })
    await refreshSources()
    message.success(t('notebook.chat.saveImageToSourceSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to save chat image to source:', err)
    message.error(t('notebook.chat.saveImageToSourceFailed', { error: err.message }))
  }
}

const handleSaveChatImageToAchievement = async ({ dataUrl, message: chatMessage, filename } = {}) => {
  if (!currentNotebook.value?.id) return
  try {
    await window.electronAPI.notebookSaveChatImageToAchievement({
      notebookId: currentNotebook.value.id,
      filename: filename || buildChatAssetName(chatMessage, 'chat-image'),
      dataUrl,
      sourceIds: getSelectedSourceIdsForChat()
    })
    await refreshAchievements()
    message.success(t('notebook.chat.saveImageToAchievementSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to save chat image to achievement:', err)
    message.error(t('notebook.chat.saveImageToAchievementFailed', { error: err.message }))
  }
}

const handleCopyChatContentToSource = async ({ content, message: chatMessage } = {}) => {
  if (!currentNotebook.value?.id) return
  try {
    await window.electronAPI.notebookSaveChatMarkdownToSource({
      notebookId: currentNotebook.value.id,
      filename: buildChatAssetName(chatMessage, 'chat-markdown'),
      content
    })
    await refreshSources()
    message.success(t('notebook.chat.copyContentToSourceSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to copy chat content to source:', err)
    message.error(t('notebook.chat.copyContentToSourceFailed', { error: err.message }))
  }
}

const handleCopyChatContentToAchievement = async ({ content, message: chatMessage } = {}) => {
  if (!currentNotebook.value?.id) return
  try {
    await window.electronAPI.notebookSaveChatMarkdownToAchievement({
      notebookId: currentNotebook.value.id,
      filename: buildChatAssetName(chatMessage, 'chat-markdown'),
      content,
      sourceIds: getSelectedSourceIdsForChat()
    })
    await refreshAchievements()
    message.success(t('notebook.chat.copyContentToAchievementSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to copy chat content to achievement:', err)
    message.error(t('notebook.chat.copyContentToAchievementFailed', { error: err.message }))
  }
}

const handleAddPathToSource = async ({ filePath } = {}) => {
  if (!currentNotebook.value?.id || !filePath) return
  try {
    await window.electronAPI.notebookAddPathToSource({
      notebookId: currentNotebook.value.id,
      filePath
    })
    await refreshSources()
    message.success(t('notebook.chat.addLinkToSourceSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to add linked file to source:', err)
    message.error(t('notebook.chat.addLinkToSourceFailed', { error: err.message }))
  }
}

const handleAddPathToAchievement = async ({ filePath } = {}) => {
  if (!currentNotebook.value?.id || !filePath) return
  try {
    await window.electronAPI.notebookAddPathToAchievement({
      notebookId: currentNotebook.value.id,
      filePath
    })
    await refreshAchievements()
    message.success(t('notebook.chat.addLinkToAchievementSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to add linked file to achievement:', err)
    message.error(t('notebook.chat.addLinkToAchievementFailed', { error: err.message }))
  }
}

const handleAddAchievementToSource = async (achievement) => {
  if (!currentNotebook.value?.id || !achievement?.id) return
  const loading = message.loading(t('common.loading'), { duration: 0 })
  try {
    await window.electronAPI.notebookAddAchievementToSource({
      notebookId: currentNotebook.value.id,
      achievementId: achievement.id
    })
    sources.value = await window.electronAPI.notebookListSources(currentNotebook.value.id)
    recomputeAchievementsPresentation()
    message.success(t('notebook.studio.addToSourceSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to add achievement to source:', err)
    message.error(t('notebook.studio.addToSourceFailed', { error: err.message }))
  } finally {
    loading.destroy()
  }
}

const handleExportAchievement = async (achievement) => {
  if (!currentNotebook.value?.id || !achievement?.id) return
  try {
    const targetDir = await window.electronAPI.selectFolder()
    if (!targetDir) return
    const result = await window.electronAPI.notebookExportAchievement({
      notebookId: currentNotebook.value.id,
      achievementId: achievement.id,
      targetDir
    })
    const exportedName = result?.path ? result.path.split(/[/\\]/).pop() : ''
    message.success(exportedName ? `${t('notebook.studio.exportSuccess')}: ${exportedName}` : t('notebook.studio.exportSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to export achievement:', err)
    message.error(t('notebook.studio.exportFailed', { error: err.message }))
  }
}

const handleDownloadTool = async (tool, installOptions = {}) => {
  const loading = message.loading(`正在安装创作工具：${tool.name}...`, { duration: 0 })
  try {
    const res = await window.electronAPI.notebookInstallTool({
      tool: JSON.parse(JSON.stringify(tool)),
      options: installOptions
    })
    if (!res.success) throw new Error(res.error)
    if (res.requiresSessionRestart && currentNotebook.value?.sessionId) {
      await restartNotebookSession()
    }
    await loadTools()
    message.success(t('notebook.market.installSuccess', { name: tool.name }))
  } catch (err) {
    console.error('[Notebook] Installation failed:', err)
    message.error(t('notebook.market.installFailed', { error: err.message }))
  } finally {
    loading.destroy()
  }
}

const handleInstallWithMcpConfig = async (tool) => {
  const mcpDep = tool?.installDependencies?.find(dep => dep.type === 'mcp' && dep.id)
  if (!mcpDep) {
    await handleDownloadTool(tool)
    return
  }

  try {
    const mcpStatus = await window.electronAPI.checkCapabilityInstalled('mcp', mcpDep.id)
    if (mcpStatus === 'installed' || mcpStatus === 'disabled') {
      await handleDownloadTool(tool)
      return
    }

    const marketConfig = await window.electronAPI.getMarketConfig()
    const preview = await window.electronAPI.previewMarketMcpConfig({
      registryUrl: marketConfig.registryUrl,
      mcp: { id: mcpDep.id }
    })
    if (!preview.success) {
      throw new Error(preview.error || 'MCP 配置预览失败')
    }
    const vars = preview.config ? extractAllEnvVars(preview.config) : []
    pendingInstallTool.value = tool
    pendingMcpDep.value = mcpDep
    pendingMcpEnvVars.value = vars
    showMcpEnvConfig.value = true
  } catch (err) {
    console.error('[Notebook] MCP preview failed:', err)
    message.error(t('notebook.market.installFailed', { error: err.message }))
  }
}

const onMcpEnvConfigConfirm = async (envOverrides) => {
  const tool = pendingInstallTool.value
  const mcpDep = pendingMcpDep.value
  pendingInstallTool.value = null
  pendingMcpDep.value = null
  pendingMcpEnvVars.value = []
  if (!tool || !mcpDep) return

  await handleDownloadTool(tool, {
    dependencyOptions: {
      [`mcp:${mcpDep.id}`]: { envOverrides }
    }
  })
}

const onMcpEnvConfigCancel = () => {
  pendingInstallTool.value = null
  pendingMcpDep.value = null
  pendingMcpEnvVars.value = []
}

const handleUninstallTool = async (toolId) => {
  try {
    const res = await window.electronAPI.notebookUninstallTool(toolId)
    if (!res.success) throw new Error(res.error)
    await loadTools()
    message.success(t('notebook.market.uninstallSuccess', { name: toolId }))
  } catch (err) {
    console.error('[Notebook] Uninstall failed:', err)
    message.error(t('notebook.market.uninstallFailed', { error: err.message }))
  }
}

const handleSaveTool = async (updatedTool) => {
  if (!updatedTool || !updatedTool.id) return
  
  try {
    // 强制转换为普通 JS 对象，解决 Vue Proxy 传参可能导致的序列化问题
    const plainUpdates = JSON.parse(JSON.stringify(updatedTool))
    console.log('[Notebook] Saving plain tool config:', plainUpdates)
    
    await window.electronAPI.notebookUpdateTool({ toolId: updatedTool.id, updates: plainUpdates })
    await loadTools()
    showToolConfig.value = false
    message.success(t('notebook.toolConfig.saveSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to save tool:', err)
    message.error(t('notebook.toolConfig.saveFailed', { error: err.message || '未知错误' }))
  }
}

onMounted(async () => {
  loadTools()
})

// ─── 加载笔记本 ───────────────────────────────────────────────────────────────
/**
 * 处理 achievements 原始数据，添加前端需要的计算字段
 */
const processAchievements = (rawAchievements, notebookPath, sourceMetaMap) => {
  return rawAchievements.map(a => {
    const tool = (availableTypes.value || []).find(t => t.outputType === a.type)
    const relativePath = a.path || ''
    const absolutePath = relativePath
      ? (relativePath.match(/^[A-Za-z]:[/\\]/) || relativePath.startsWith('/')
          ? relativePath
          : `${notebookPath}/${relativePath}`)
      : ''
    const sourceDisplayPaths = (a.sourceIds || []).map(id => {
      const source = sourceMetaMap.get(id)
      if (!source) return t('common.deleted')
      if (source.path) {
        return (source.path.match(/^[A-Za-z]:[/\\]/) || source.path.startsWith('/'))
          ? source.path
          : `${notebookPath}/${source.path}`
      }
      return source.url || source.name || t('common.deleted')
    }).filter(Boolean)
    return {
      ...a,
      icon: a.type,
      color: tool?.color || '#888',
      sourceCount: a.sourceIds?.length || 0,
      sourceNames: sourceDisplayPaths,
      absolutePath,
      time: new Date(a.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
  })
}

/**
 * 基于当前 sources 重新计算 achievements 的展示派生字段
 * 不访问后端，只修正前端展示层的一致性
 */
const recomputeAchievementsPresentation = () => {
  if (!currentNotebook.value) return
  const sourceMetaMap = new Map(sources.value.map(s => [s.id, s]))
  achievements.value = processAchievements(achievements.value, currentNotebook.value.notebookPath, sourceMetaMap)
}

/**
 * 只刷新 achievements 列表（不关闭会话，不触发 sanitizeAchievements）
 * 用于生成过程中的 UI 更新
 */
const refreshAchievements = async () => {
  if (!currentNotebook.value) return
  try {
    const rawAchievements = await window.electronAPI.notebookListAchievements(currentNotebook.value.id)
    const sourceMetaMap = new Map(sources.value.map(s => [s.id, s]))
    achievements.value = processAchievements(rawAchievements, currentNotebook.value.notebookPath, sourceMetaMap)
  } catch (err) {
    console.error('[Notebook] Failed to refresh achievements:', err)
  }
}

const handleCleanupIndexes = async () => {
  if (!currentNotebook.value?.id) return
  const loading = message.loading(t('common.loading'), { duration: 0 })
  try {
    const result = await window.electronAPI.notebookSanitizeIndexes(currentNotebook.value.id)
    await refreshSources()
    await refreshAchievements()
    message.success(t('notebook.nav.cleanupSuccess', {
      sources: result?.sourcesRemoved || 0,
      achievements: result?.achievementsRemoved || 0
    }))
  } catch (err) {
    console.error('[Notebook] Failed to cleanup indexes:', err)
    message.error(t('notebook.nav.cleanupFailed', { error: err.message }))
  } finally {
    loading.destroy()
  }
}

/**
 * 加载笔记本（会关闭旧会话，触发 sanitizeAchievements）
 * 仅用于：1. 首次打开笔记本  2. 切换笔记本
 */
const loadNotebook = async (notebook) => {
  activeGenerationAchievementId.value = null
  activeGenerationToken.value = 0
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
    const sourceMetaMap = new Map((data.sources || []).map(s => [s.id, s]))
    achievements.value = processAchievements(data.achievements || [], data.notebookPath, sourceMetaMap)
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
  activeGenerationAchievementId.value = null
  activeGenerationToken.value = 0
  if (currentNotebook.value?.sessionId) {
    try {
      await window.electronAPI.closeAgentSession(currentNotebook.value.sessionId)
    } catch (err) {
      console.warn('[Notebook] Failed to close agent session:', err)
    }
  }
  currentNotebook.value = null
  window.currentNotebookId = null
  sources.value = []
  achievements.value = []
}

const handleRenamed = ({ id, name }) => {
  if (currentNotebook.value?.id === id) {
    currentNotebook.value = { ...currentNotebook.value, name }
  }
}

const handleDeleted = (id) => {
  if (currentNotebook.value?.id === id) {
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0
    currentNotebook.value = null
    window.currentNotebookId = null
    sources.value = []
    achievements.value = []
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
      // 刷新来源列表（不关闭会话，不触发 sanitizeAchievements）
      sources.value = await window.electronAPI.notebookListSources(currentNotebook.value.id)
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

const resolveSourceAbsolutePath = async (source) => {
  if (!source?.path) throw new Error('该来源没有可用文件路径')
  if (!currentNotebook.value?.notebookPath) throw new Error('当前笔记本路径不存在')
  return window.electronAPI.resolvePath(currentNotebook.value.notebookPath, source.path)
}

const handleRenameSource = (source) => {
  if (!currentNotebook.value || !source?.id) return
  const nextName = ref(source.name || '')
  dialog.create({
    title: t('common.rename'),
    content: () => h(NInput, {
      value: nextName.value,
      placeholder: t('common.rename'),
      onUpdateValue: (value) => { nextName.value = value }
    }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      const trimmed = nextName.value.trim()
      if (!trimmed || trimmed === source.name) return
      try {
        await handleUpdateSource(source.id, { name: trimmed })
        message.success(t('common.saveSuccess'))
      } catch (err) {
        console.error('[Notebook] Rename source failed:', err)
        message.error(t('common.saveFailed'))
      }
    }
  })
}

const handleDeleteSource = async (source) => {
  if (!source?.id) return
  await handleDeleteSources([source.id])
}

const handleExportSource = async (source) => {
  if (!currentNotebook.value?.id || !source?.id) return
  try {
    const targetDir = await window.electronAPI.selectFolder()
    if (!targetDir) return
    const result = await window.electronAPI.notebookExportSource({
      notebookId: currentNotebook.value.id,
      sourceId: source.id,
      targetDir
    })
    const exportedName = result?.path ? result.path.split(/[/\\]/).pop() : ''
    message.success(exportedName ? `${t('notebook.source.exportSuccess')}: ${exportedName}` : t('notebook.source.exportSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to export source:', err)
    message.error(t('notebook.source.exportFailed', { error: err.message }))
  }
}

const handleAddSourceToAchievement = async (source) => {
  if (!currentNotebook.value?.id || !source) return
  try {
    const filePath = await resolveSourceAbsolutePath(source)
    await window.electronAPI.notebookAddPathToAchievement({
      notebookId: currentNotebook.value.id,
      filePath,
      preferredName: source.name
    })
    await refreshAchievements()
    message.success(t('notebook.source.addToAchievementSuccess'))
  } catch (err) {
    console.error('[Notebook] Failed to add source to achievement:', err)
    message.error(t('notebook.source.addToAchievementFailed', { error: err.message }))
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
  if (source) {
    Object.assign(source, updates)
    recomputeAchievementsPresentation()
  }

  // 同步到后端
  try {
    await window.electronAPI.notebookUpdateSource({
      notebookId: currentNotebook.value.id,
      sourceId,
      updates
    })
    recomputeAchievementsPresentation()
  } catch (err) {
    console.error('[Notebook] Failed to update source:', err)
    message.error(t('common.error'))
  }
}

const handleToggleCopySourceFiles = async () => {
  if (!currentNotebook.value) return
  const notebookId = currentNotebook.value.id
  const newValue = !currentNotebook.value.copySourceFiles
  currentNotebook.value = { ...currentNotebook.value, copySourceFiles: newValue }
  try {
    await window.electronAPI.notebookSetCopySourceFiles({ notebookId, value: newValue })
  } catch (err) {
    console.error('[Notebook] Failed to set copySourceFiles:', err)
    currentNotebook.value = { ...currentNotebook.value, copySourceFiles: !newValue }
    message.error(t('common.error'))
  }
}

const isNotebookManagedSource = (source) => {
  const sourcePath = source?.path || ''
  if (!sourcePath) return false
  if (sourcePath.match(/^[A-Za-z]:[/\\]/) || sourcePath.startsWith('/')) return false
  const normalized = sourcePath.replace(/\\/g, '/').replace(/^\.\//, '')
  return normalized.startsWith('sources/')
}

const handleDeleteSources = async (sourceIds) => {
  if (!currentNotebook.value || !sourceIds.length) return

  const selectedSources = sources.value.filter(s => sourceIds.includes(s.id))
  const physicalCount = selectedSources.filter(isNotebookManagedSource).length
  const referenceCount = selectedSources.length - physicalCount

  let confirmKey = 'notebook.source.deleteConfirmIndexOnly'
  let confirmParams = {}
  if (physicalCount > 0 && referenceCount > 0) {
    confirmKey = 'notebook.source.deleteConfirmMixed'
    confirmParams = { physicalCount, referenceCount }
  } else if (physicalCount > 0) {
    confirmKey = 'notebook.source.deleteConfirmPhysical'
  }

  dialog.warning({
    title: t('common.delete'),
    content: t(confirmKey, confirmParams),
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
        recomputeAchievementsPresentation()
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
    content: t('notebook.studio.deleteConfirmPhysical'),
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

const handleDeleteAchievement = async (achievement) => {
  if (!currentNotebook.value || !achievement?.id) return
  await handleDeleteAchievements([achievement.id])
}

const handleRenameAchievement = (achievement) => {
  if (!currentNotebook.value || !achievement?.id) return
  const nextName = ref(achievement.name || '')
  dialog.create({
    title: t('common.rename'),
    content: () => h(NInput, {
      value: nextName.value,
      placeholder: t('common.rename'),
      onUpdateValue: (value) => { nextName.value = value }
    }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      const trimmed = nextName.value.trim()
      if (!trimmed || trimmed === achievement.name) return
      try {
        await handleUpdateAchievement(achievement.id, { name: trimmed })
        message.success(t('common.saveSuccess'))
      } catch (err) {
        console.error('[Notebook] Rename achievement failed:', err)
        message.error(t('common.saveFailed'))
      }
    }
  })
}

// ─── Studio Achievements ──────────────────────────────────────────────────
const handleGenerateAchievement = async (typeId) => {
  if (!currentNotebook.value) return
  if (activeGenerationAchievementId.value) {
    message.warning('当前已有生成任务，请等待完成或先停止')
    return
  }

  const sourceIds = selectedSources.value.map(s => s.id)

  try {
    const { achievementId, prompt } = await window.electronAPI.notebookPrepareGeneration({
      notebookId: currentNotebook.value.id,
      toolId: typeId,
      sourceIds
    })

    activeGenerationAchievementId.value = achievementId
    activeGenerationToken.value += 1

    // 刷新 achievements 列表（不关闭会话，不触发 sanitizeAchievements）
    await refreshAchievements()

    // 发送到 Agent
    if (chatPanelRef.value) {
      showRightPanel.value = true
      await chatPanelRef.value.sendMessage(prompt)
    }
  } catch (err) {
    console.error('[Notebook] Generation failed:', err)
    const rollbackAchievementId = activeGenerationAchievementId.value
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0

    if (rollbackAchievementId && currentNotebook.value) {
      try {
        await window.electronAPI.notebookDeleteAchievements({
          notebookId: currentNotebook.value.id,
          achievementIds: [rollbackAchievementId]
        })
        await refreshAchievements()
      } catch (rollbackErr) {
        console.error('[Notebook] Failed to rollback generation achievement:', rollbackErr)
      }
    }

    message.error(err.message || '生成准备失败')
  }
}

const handleAgentDone = async (payload = {}) => {
  if (!currentNotebook.value) return

  const { filePaths = [], generationToken = 0 } = payload
  if (generationToken !== activeGenerationToken.value || !generationToken) return

  const achievementId = activeGenerationAchievementId.value
  if (!achievementId) return

  const ach = achievements.value.find(a => a.id === achievementId && a.status === 'generating')
  if (!ach) {
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0
    return
  }

  // 标准化路径为正斜杠格式，便于比较
  const normalize = (p) => p?.replace(/\\/g, '/') || ''

  let hasOutputFile = false
  if (ach.path) {
    const expectedAbs = await window.electronAPI.resolvePath(currentNotebook.value.notebookPath, ach.path)

    // 直接检查预期路径的文件是否存在（最可靠的判断方式）
    // 无论 Claude 是否在对话中提到该路径，只要文件在那里就判定成功
    try {
      const fileData = await window.electronAPI.readAbsolutePath({
        filePath: expectedAbs,
        sessionId: currentNotebook.value?.sessionId,
        confirmed: true
      })
      hasOutputFile = !fileData?.error
    } catch {
      hasOutputFile = false
    }
  }

  try {
    if (hasOutputFile) {
      await window.electronAPI.notebookUpdateAchievement({
        notebookId: currentNotebook.value.id,
        achievementId: ach.id,
        updates: { status: 'done' }
      })
    } else {
      await window.electronAPI.notebookDeleteAchievements({
        notebookId: currentNotebook.value.id,
        achievementIds: [ach.id]
      })
    }
  } catch (err) {
    console.error('[Notebook] Failed to finalize achievement:', err)
  } finally {
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0
  }

  // 刷新 achievements 列表（不关闭会话，不触发 sanitizeAchievements）
  await refreshAchievements()
}

/**
 * Agent 取消生成时的处理
 * 只清理当前 active generation 对应的成果记录
 */
const handleAgentCancelled = async (payload = {}) => {
  if (!currentNotebook.value) return

  const { generationToken = 0 } = payload
  if (generationToken !== activeGenerationToken.value || !generationToken) return

  const achievementId = activeGenerationAchievementId.value
  if (!achievementId) return

  const ach = achievements.value.find(a => a.id === achievementId && a.status === 'generating')
  if (!ach) {
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0
    return
  }

  try {
    await window.electronAPI.notebookDeleteAchievements({
      notebookId: currentNotebook.value.id,
      achievementIds: [achievementId]
    })
  } catch (err) {
    console.error('[Notebook] Failed to clean up cancelled achievement:', err)
  } finally {
    activeGenerationAchievementId.value = null
    activeGenerationToken.value = 0
  }

  // 刷新 UI
  await refreshAchievements()
}

// ─── 预览处理 ─────────────────────────────────────────────────────────────────
const closePreviewImage = () => {
  previewImageData.value = null
}

const handlePreviewImage = (previewData) => {
  if (previewData?.content) {
    previewImageData.value = previewData
    return
  }
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
    const effectivePath = fileData.path || fileData.filePath || filePath
    await window.electronAPI.openPath(effectivePath)
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

.image-preview-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.image-preview-modal {
  width: 100%;
  max-width: min(68vw, 900px);
  height: 100%;
  max-height: min(68vh, 600px);
  background: var(--bg-color-secondary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.image-preview-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-preview-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-color-muted);
  cursor: pointer;
}

.image-preview-close:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.image-preview-body {
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
}

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

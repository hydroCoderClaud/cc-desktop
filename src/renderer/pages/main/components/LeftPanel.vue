<template>
  <div class="left-panel">
    <LeftPanelHeader
      :t="t"
      :panel-title="panelTitle"
      :mode-options="modeOptions"
      @mode-select="handleModeSelect"
    />

    <LeftPanelDeveloperPane
      :t="t"
      :is-developer-mode="isDeveloperMode"
      :current-project="currentProject"
      :selected-project-id="selectedProjectId"
      :project-options="projectOptions"
      :render-project-label="renderProjectLabel"
      :project-menu-options="projectMenuOptions"
      :active-sessions="activeSessions"
      :focused-session-id="focusedSessionId"
      :history-sessions="historySessions"
      :displayed-history-sessions="displayedHistorySessions"
      :show-subagent-sessions="showSubagentSessions"
      :is-syncing="isSyncing"
      :show-new-session-dialog="showNewSessionDialog"
      :new-session-title="newSessionTitle"
      :show-rename-dialog="showRenameDialog"
      :rename-title="renameTitle"
      :show-history-rename-dialog="showHistoryRenameDialog"
      :history-rename-title="historyRenameTitle"
      :format-session-name="formatSessionName"
      :format-date="formatDate"
      @open-project="$emit('open-project')"
      @update:selected-project-id="handleProjectChange"
      @project-menu-select="handleProjectMenuSelect"
      @new-session="handleNewSession"
      @open-terminal="handleOpenTerminal"
      @select-session="handleSelectSession"
      @rename-session="openRenameDialog"
      @close-session="handleCloseSession"
      @toggle-subagent-sessions="toggleSubagentSessions"
      @sync-sessions="handleSyncSessions"
      @view-more="handleViewMore"
      @open-history-session="handleOpenHistorySession"
      @rename-history-session="handleEditHistorySession"
      @delete-history-session="handleDeleteHistorySession"
      @update:show-new-session-dialog="showNewSessionDialog = $event"
      @update:new-session-title="newSessionTitle = $event"
      @confirm-new-session="confirmNewSession"
      @update:show-rename-dialog="showRenameDialog = $event"
      @update:rename-title="renameTitle = $event"
      @confirm-rename="confirmRename"
      @update:show-history-rename-dialog="showHistoryRenameDialog = $event"
      @update:history-rename-title="historyRenameTitle = $event"
      @confirm-history-rename="confirmHistoryRename"
    />

    <!-- ========== Agent Mode Content (v-show 避免切换模式时 remount) ========== -->
    <AgentLeftContent
      v-show="isAgentMode"
      ref="agentLeftContentRef"
      :active-session-id="activeAgentSessionId"
      :current-project="currentProject"
      @created="handleAgentCreated"
      @select="handleAgentSelected"
      @close="handleAgentClosed"
      @profile-updated="emit('agent-profile-updated', $event)"
      @new-conversation-request="showNewConvModal = true"
    />

    <!-- Agent 新建对话 Modal -->
    <AgentNewConversationModal
      :show="showNewConvModal"
      @update:show="showNewConvModal = $event"
      @create="handleNewConvCreate"
    />

    <!-- 能力管理 Modal（仅 Agent 模式） -->
    <CapabilityModal
      v-if="isAgentMode"
      v-model:show="showCapabilityModal"
      :project-path="agentCwd"
      :session-id="agentSessionId"
    />

    <LeftPanelFooter
      :t="t"
      :settings-options="settingsOptions"
      :render-settings-label="renderSettingsLabel"
      :has-update-available="hasUpdateAvailable"
      :has-capability-update="hasCapabilityUpdate"
      :is-dark="isDark"
      :is-agent-mode="isAgentMode"
      @settings-select="handleSettingsSelect"
      @toggle-theme="$emit('toggle-theme')"
      @open-capability="showCapabilityModal = true"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick, h } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useLocale } from '@composables/useLocale'
import { useSessionPanel } from '@composables/useSessionPanel'
import { useAppMode, AppMode } from '@composables/useAppMode'
import Icon from '@components/icons/Icon.vue'
import LeftPanelHeader from './LeftPanelHeader.vue'
import LeftPanelDeveloperPane from './LeftPanelDeveloperPane.vue'
import LeftPanelFooter from './LeftPanelFooter.vue'
import AgentLeftContent from './agent/AgentLeftContent.vue'
import AgentNewConversationModal from './agent/AgentNewConversationModal.vue'
import CapabilityModal from './agent/CapabilityModal.vue'

const message = useMessage()
const dialog = useDialog()
const { invoke } = useIPC()
const { t, locale } = useLocale()
const { isDeveloperMode, isAgentMode, isNotebookMode, developerModeEnabled, switchMode, appMode } = useAppMode()

const renderModeIcon = (iconName) => () => h(Icon, { name: iconName, size: 16, style: 'margin-right: 8px; color: var(--primary-color)' })

const modeOptions = computed(() => {
  const options = []
  if (developerModeEnabled.value && !isDeveloperMode.value) {
    options.push({ label: t('mode.switchToDeveloper'), key: 'developer', icon: renderModeIcon('terminal') })
  }
  if (!isAgentMode.value) {
    options.push({ label: t('mode.switchToAgent'), key: 'agent', icon: renderModeIcon('robot') })
  }
  if (!isNotebookMode.value) {
    options.push({ label: t('mode.switchToNotebook'), key: 'notebook', icon: renderModeIcon('notebook') })
  }
  return options
})

const handleModeSelect = (key) => {
  if (key === 'notebook') {
    handleOpenNotebook()
    return
  }
  if (key === 'developer' || key === 'agent') {
    handleSwitchMode(key)
  }
}

const panelTitle = computed(() => {
  if (isAgentMode.value) return t('app.modes.agent')
  if (isNotebookMode.value) return t('app.modes.notebook')
  return t('app.modes.developer')
})

// 切换到指定模式
const handleSwitchMode = async (mode) => {
  await switchMode(mode)
  emit('mode-changed', mode)
}

// 打开 Notebook 工作台（切换到 Notebook 模式）
const handleOpenNotebook = async () => {
  await switchMode(AppMode.NOTEBOOK)
  emit('mode-changed', AppMode.NOTEBOOK)
}

// ========================================
// Agent 模式事件处理
// ========================================

const handleAgentCreated = (session) => {
  activeAgentSessionId.value = session.id
  emit('agent-created', session)
}

const handleNewConvCreate = async ({ cwd, apiProfileId }) => {
  showNewConvModal.value = false
  if (agentLeftContentRef.value) {
    const session = await agentLeftContentRef.value.createConversation({
      type: 'chat',
      cwd: cwd || null,
      apiProfileId: apiProfileId || null
    })
    if (session) {
      handleAgentCreated(session)
    }
  }
}

const handleAgentSelected = async (conv) => {
  // 非活跃会话（closed / 重启后的历史）先恢复到后端内存
  if (conv.status === 'closed' || conv.status === undefined) {
    try {
      const result = await window.electronAPI.reopenAgentSession(conv.id)
      if (result && !result.error) {
        conv.status = result.status || 'idle'
      } else if (result?.error) {
        // 显示实际错误信息
        message.error(`${t('agent.reopenFailed') || '恢复会话失败'}：${result.error}`)
      }
    } catch (err) {
      console.error('[LeftPanel] reopen agent session error:', err)
      message.error(`${t('agent.reopenError') || '恢复会话异常'}：${err.message}`)
    }
  }
  activeAgentSessionId.value = conv.id
  emit('agent-selected', conv)
}

const handleAgentClosed = async (conv) => {
  if (agentLeftContentRef.value) {
    await agentLeftContentRef.value.closeConversation(conv.id)
  }
  if (activeAgentSessionId.value === conv.id) {
    activeAgentSessionId.value = null
  }
  emit('agent-closed', conv)
}

// Props
const props = defineProps({
  projects: {
    type: Array,
    default: () => []
  },
  currentProject: {
    type: Object,
    default: null
  },
  agentCwd: {
    type: String,
    default: null
  },
  agentSessionId: {
    type: String,
    default: null
  },
  isDark: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits([
  'open-project',
  'select-project',
  'toggle-theme',
  'context-action',
  'session-created',
  'session-selected',
  'session-closed',
  'terminal-created',
  'mode-changed',
  'agent-created',
  'agent-selected',
  'agent-closed',
  'agent-profile-updated'
])

// Use session panel composable
const {
  activeSessions,
  historySessions,
  focusedSessionId,
  maxHistorySessions,
  showSubagentSessions,
  showNewSessionDialog,
  newSessionTitle,
  showRenameDialog,
  renameTitle,
  renamingSession,
  displayedHistorySessions,
  loadActiveSessions,
  loadHistorySessions,
  loadConfig,
  checkCanCreateSession,
  openNewSessionDialog,
  closeNewSessionDialog,
  createSession,
  selectSession,
  closeSession,
  openRenameDialog: doOpenRenameDialog,
  closeRenameDialog,
  confirmRename: doConfirmRename,
  resumeHistorySession,
  deleteHistorySession,
  formatSessionName: doFormatSessionName,
  formatDate: doFormatDate,
  setupEventListeners,
  toggleSubagentSessions
} = useSessionPanel(props, emit)

// Local state
const selectedProjectId = ref(null)
const isSyncing = ref(false)
const agentLeftContentRef = ref(null)
const activeAgentSessionId = ref(null)
const showNewConvModal = ref(false)
const showCapabilityModal = ref(false)

// 更新红点状态
const hasUpdateAvailable = ref(false)
const hasCapabilityUpdate = ref(false)

// History session rename (仅内存，不持久化)
const showHistoryRenameDialog = ref(false)
const historyRenameTitle = ref('')
const editingHistorySession = ref(null)

// Watch currentProject changes
watch(() => props.currentProject, (newProject) => {
  selectedProjectId.value = newProject?.id || null
}, { immediate: true })

// Project dropdown options
const projectOptions = computed(() => {
  return props.projects.map(project => ({
    label: `${project.icon || '📁'} ${project.name}`,
    value: project.id,
    disabled: !project.pathValid,
    path: project.path
  }))
})

// 渲染项目选项，显示完整路径 tooltip
const renderProjectLabel = (option) => {
  return h('span', { title: option.path, style: 'display: block; overflow: hidden; text-overflow: ellipsis;' }, option.label)
}

// Project settings menu options
const renderMenuIcon = (iconName) => () => h(Icon, { name: iconName, size: 16, style: 'margin-right: 8px; color: var(--primary-color)' })

const projectMenuOptions = computed(() => [
  { label: t('project.openFolder'), key: 'openFolder', icon: renderMenuIcon('folderOpen') },
  { label: t('terminal.openTerminal'), key: 'openTerminal', icon: renderMenuIcon('terminal') },
  { label: t('project.edit'), key: 'edit', icon: renderMenuIcon('edit') },
  { label: t('session.sync'), key: 'syncSessions', icon: renderMenuIcon('sync') },
  { type: 'divider', key: 'd1' },
  { label: t('project.openClaudeConfig'), key: 'openProjectConfig', icon: renderMenuIcon('fileText') },
  { label: t('settingsMenu.claudeSettings'), key: 'openClaudeSettings', icon: renderMenuIcon('settings') },
  { type: 'divider', key: 'd2' },
  { label: t('project.hide'), key: 'hide', icon: renderMenuIcon('eyeOff') }
])

// Settings dropdown options
const settingsOptions = computed(() => [
  { label: t('settingsMenu.apiConfig'), key: 'api-config', icon: renderMenuIcon('key') },
  { label: t('settingsMenu.providerManager'), key: 'provider-manager', icon: renderMenuIcon('building') },
  { label: t('settingsMenu.dingtalkBridge'), key: 'dingtalk-settings', icon: renderMenuIcon('robot') },
  { label: t('settingsMenu.globalSettings'), key: 'global-settings', icon: renderMenuIcon('settings') },
  { label: t('settingsMenu.capabilityWorkbench'), key: 'capability-workbench', icon: renderMenuIcon('wrench') },
  { type: 'divider', key: 'd1' },
  { label: t('settingsMenu.appearanceSettings'), key: 'appearance-settings', icon: renderMenuIcon('sliders') },
  { label: t('settingsMenu.sessionHistory'), key: 'session-history', icon: renderMenuIcon('history') },
  {
    key: 'app-update',
    icon: renderMenuIcon('download'),
    label: t('settingsMenu.appUpdate')
  }
])

// 有更新时在 app-update 菜单项标签后追加红点
const renderSettingsLabel = (option) => {
  if (option.key === 'app-update' && hasUpdateAvailable.value) {
    return h('span', { style: 'display:inline-flex; align-items:center; gap:6px;' }, [
      String(option.label),
      h('span', { style: 'width:7px; height:7px; border-radius:50%; background:#ff4d4f; flex-shrink:0;' })
    ])
  }
  return typeof option.label === 'function' ? option.label() : option.label
}

// Handle project selection change
const handleProjectChange = async (projectId) => {
  selectedProjectId.value = projectId

  if (projectId === null) {
    emit('select-project', null)
    return
  }
  const project = props.projects.find(p => p.id === projectId)
  if (project) {
    // 更新最后打开时间（用于排序）
    try {
      await invoke('touchProject', projectId)
    } catch (err) {
      console.error('Failed to touch project:', err)
    }
    emit('select-project', project)
  }
}

// Handle project menu actions
const handleProjectMenuSelect = async (key) => {
  if (!props.currentProject) return

  // 同步会话直接在本组件处理
  if (key === 'syncSessions') {
    handleSyncSessions()
    return
  }

  // 打开终端直接在本组件处理
  if (key === 'openTerminal') {
    handleOpenTerminal()
    return
  }

  // 打开项目 Claude 配置目录
  if (key === 'openProjectConfig') {
    handleOpenProjectConfig()
    return
  }

  // 打开 Claude 全局配置文件
  if (key === 'openClaudeSettings') {
    handleOpenClaudeSettings()
    return
  }

  emit('context-action', { action: key, project: props.currentProject })
}

// 打开项目 Claude 配置文件 (settings.local.json)
const handleOpenProjectConfig = async () => {
  if (!props.currentProject?.path) return

  try {
    const result = await window.electronAPI.getProjectConfigPath(props.currentProject.path)
    // 检查是否返回错误对象
    if (result && result.success === false) {
      message.error(result.error || t('messages.operationFailed'))
      return
    }
    // result 是文件路径字符串
    const openResult = await window.electronAPI.openPath(result)
    if (!openResult.success) {
      message.error(openResult.error || t('messages.operationFailed'))
    }
  } catch (err) {
    console.error('Failed to open project config:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Handle settings menu
const handleSettingsSelect = async (key) => {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  switch (key) {
    case 'api-config':
      window.electronAPI.openProfileManager()
      break
    case 'provider-manager':
      window.electronAPI.openProviderManager()
      break
    case 'global-settings':
      window.electronAPI.openGlobalSettings()
      break
    case 'capability-workbench':
      window.electronAPI.openSettingsWorkbench({
        mode: isAgentMode.value ? 'agent' : 'developer',
        cwd: isAgentMode.value ? props.agentCwd : props.currentProject?.path
      })
      break
    case 'appearance-settings':
      window.electronAPI.openAppearanceSettings()
      break
    case 'session-history':
      window.electronAPI.openSessionManager()
      break
    case 'dingtalk-settings':
      window.electronAPI.openDingTalkSettings()
      break
    case 'app-update':
      window.electronAPI.openUpdateManager()
      break
  }
}

// 打开 Claude 全局配置文件
const handleOpenClaudeSettings = async () => {
  try {
    const settingsPath = await window.electronAPI.getClaudeSettingsPath()
    const result = await window.electronAPI.openPath(settingsPath)
    if (!result.success) {
      message.warning(t('settingsMenu.claudeSettingsNotFound') || 'Claude 配置文件不存在')
    }
  } catch (err) {
    console.error('Failed to open Claude settings:', err)
    message.error(t('messages.operationFailed'))
  }
}

// 查看更多历史会话
const handleViewMore = () => {
  if (window.electronAPI && props.currentProject) {
    window.electronAPI.openSessionManager({ projectPath: props.currentProject.path })
  }
}

// 手动同步会话
const handleSyncSessions = async () => {
  if (!props.currentProject || isSyncing.value) return

  isSyncing.value = true
  try {
    const result = await window.electronAPI.syncProjectSessions({
      projectPath: props.currentProject.path,
      projectName: props.currentProject.name
    })

    if (result.success) {
      await loadHistorySessions(props.currentProject)
      const synced = result.synced || 0
      if (synced > 0) {
        message.success(t('session.syncSuccess', { added: synced, updated: 0 }) || `同步完成：新增 ${synced}`)
      } else {
        message.info(t('session.syncNoChanges') || '已是最新，无需同步')
      }
    } else {
      message.warning(result.error || t('session.syncFailed') || '同步失败')
    }
  } catch (err) {
    console.error('Sync sessions failed:', err)
    message.error(t('session.syncFailed') || '同步失败')
  } finally {
    isSyncing.value = false
  }
}

// ========================================
// Wrapper functions using composable
// ========================================

// Formatters with locale
const formatSessionName = (session) => doFormatSessionName(session, t)
const formatDate = (dateStr) => doFormatDate(dateStr, t)

// New session
const handleNewSession = async () => {
  if (!props.currentProject) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!props.currentProject.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  const { canCreate, maxSessions } = await checkCanCreateSession()
  if (!canCreate) {
    message.warning(t('session.maxSessionsReached', { max: maxSessions }))
    return
  }

  openNewSessionDialog()
}

// Open plain terminal (without starting claude)
const handleOpenTerminal = async () => {
  if (!props.currentProject) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!props.currentProject.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  try {
    const result = await invoke('createActiveSession', {
      type: 'terminal',
      projectId: props.currentProject.id,
      projectPath: props.currentProject.path,
      projectName: props.currentProject.name,
      title: t('terminal.terminal'),
      apiProfileId: props.currentProject.api_profile_id
    })

    if (result.success) {
      emit('terminal-created', result.session)
    } else {
      message.error(result.error || t('terminal.createFailed'))
    }
  } catch (err) {
    console.error('Failed to open terminal:', err)
    message.error(t('terminal.createFailed'))
  }
}

// Confirm new session
const confirmNewSession = async () => {
  const result = await createSession(props.currentProject)
  if (result.success) {
    emit('session-created', result.session)
    message.success(t('messages.connectionSuccess'))
  } else {
    message.error(result.error || t('messages.connectionFailed'))
  }
}

// Select active session
const handleSelectSession = (session) => {
  selectSession(session)
  emit('session-selected', session)
}

// Open rename dialog
const openRenameDialog = (session) => {
  doOpenRenameDialog(session)
}

// Confirm rename (运行中会话)
// 后端 renameSession 会同时更新内存和数据库，前端只需调用一次
const confirmRename = async () => {
  const result = await doConfirmRename()
  if (result.success) {
    // 重新加载历史会话以保持同步（后端已更新数据库）
    await loadHistorySessions(props.currentProject)
    message.success(t('messages.saveSuccess'))
  } else if (result.error) {
    message.error(t('messages.saveFailed'))
  }
}

// Close active session
const handleCloseSession = async (session) => {
  const result = await closeSession(session.id)
  if (result.success) {
    emit('session-closed', session)
  } else {
    message.error(t('messages.operationFailed'))
  }
}

// Open history session
const handleOpenHistorySession = async (session) => {
  if (!props.currentProject) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!props.currentProject.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  const result = await resumeHistorySession(props.currentProject, session, t)

  if (result.success) {
    if (result.alreadyRunning) {
      emit('session-selected', result.session)
    } else {
      emit('session-created', result.session)
      message.success(t('session.resumeSuccess') || '会话已恢复')
    }
  } else if (result.error === 'SESSION_IN_USE_BY_AGENT') {
    message.warning(t('session.sessionInUseByAgent'))
  } else if (result.error === 'maxSessionsReached') {
    message.warning(t('session.maxSessionsReached', { max: result.maxSessions }))
  } else if (result.error === 'pendingSessionClosed') {
    message.warning(t('session.pendingSessionClosed') || '该会话已关闭，无法恢复')
  } else {
    message.error(result.error || t('messages.connectionFailed'))
  }
}

// Edit history session name (仅内存，不恢复会话)
const handleEditHistorySession = (session) => {
  editingHistorySession.value = session
  historyRenameTitle.value = session.name || ''
  showHistoryRenameDialog.value = true
}

// Confirm history session rename (保存到数据库)
const confirmHistoryRename = async () => {
  if (!editingHistorySession.value) return

  const newName = historyRenameTitle.value.trim()
  if (!newName) {
    message.warning(t('session.nameRequired') || '请输入会话名称')
    return
  }

  try {
    // 保存到数据库
    const result = await invoke('updateSessionTitle', {
      sessionId: editingHistorySession.value.id,
      title: newName
    })

    if (result.success) {
      // 更新历史会话内存数据
      const historySession = historySessions.value.find(
        s => s.id === editingHistorySession.value.id
      )
      if (historySession) {
        historySession.name = newName
        historySession.title = newName
      }

      // 同步更新运行中会话（两种关联方式）
      // 1. 通过 resumeSessionId === session_uuid（恢复会话或已关联的新建会话）
      // 2. 通过 dbSessionId === id（新建会话，通过数据库 ID 关联）
      const activeSession = activeSessions.value.find(
        s => (s.resumeSessionId && s.resumeSessionId === editingHistorySession.value.session_uuid) ||
             (s.dbSessionId && s.dbSessionId === editingHistorySession.value.id)
      )
      if (activeSession) {
        activeSession.title = newName
        // 同步到后端内存（数据库已在上面更新）
        await invoke('renameActiveSession', {
          sessionId: activeSession.id,
          newTitle: newName
        })
      }

      message.success(t('messages.saveSuccess') || '已保存')
    } else {
      message.error(result.error || t('messages.saveFailed'))
    }
  } catch (err) {
    console.error('Failed to update session title:', err)
    message.error(t('messages.saveFailed'))
  }

  showHistoryRenameDialog.value = false
  editingHistorySession.value = null
}

// Delete history session
const handleDeleteHistorySession = (session) => {
  dialog.warning({
    title: t('session.deleteTitle'),
    content: `${t('session.deleteConfirm', { name: session.name || session.session_uuid?.slice(0, 8) })}\n\n${t('session.deleteWarning')}`,
    positiveText: t('common.confirm') || '确认',
    negativeText: t('common.cancel') || '取消',
    onPositiveClick: async () => {
      const result = await deleteHistorySession(props.currentProject, session)
      if (result.success) {
        message.success(t('session.deleted'))
      } else if (result.error === 'sessionIsRunning') {
        message.warning(t('session.cannotDeleteRunning'))
      } else {
        message.error(result.error || t('messages.operationFailed'))
      }
    }
  })
}

// Watch project change to reload sessions and start file watching
watch(() => props.currentProject, async (newProject) => {
  if (newProject) {
    await Promise.all([
      loadActiveSessions(),
      loadHistorySessions(newProject)
    ])
    // Start watching session files for this project
    if (window.electronAPI?.watchSessionFiles) {
      window.electronAPI.watchSessionFiles({
        projectPath: newProject.path,
        projectId: newProject.id
      })
    }
  } else {
    historySessions.value = []
    // Stop watching when no project selected
    if (window.electronAPI?.stopWatchingSessionFiles) {
      window.electronAPI.stopWatchingSessionFiles()
    }
  }
}, { immediate: true })

// 打开 CapabilityModal 时清除能力更新红点
watch(showCapabilityModal, (show) => {
  if (show && hasCapabilityUpdate.value) {
    hasCapabilityUpdate.value = false
    window.electronAPI?.clearCapabilitiesUpdateBadge?.()
  }
})

// Listen for session events
let cleanupFn = null
let fileWatcherCleanup = null
let sessionUpdatedCleanup = null
let updateAvailableCleanup = null
let capUpdateCleanup = null

onMounted(async () => {
  await loadConfig()

  // 初始加载活动会话列表
  await loadActiveSessions()

  // 检查是否已有可用更新（应用启动时自动检查后留存的状态）
  if (window.electronAPI?.getUpdateStatus) {
    try {
      const status = await window.electronAPI.getUpdateStatus()
      if (status?.hasUpdate) {
        hasUpdateAvailable.value = true
      }
    } catch (err) {
      console.error('[LeftPanel] Failed to get update status:', err)
    }
  }

  // 监听更新事件，实时显示红点
  if (window.electronAPI?.onUpdateAvailable) {
    updateAvailableCleanup = window.electronAPI.onUpdateAvailable(() => {
      hasUpdateAvailable.value = true
    })
  }

  // 检查是否有能力清单更新
  if (window.electronAPI?.getCapabilitiesUpdateStatus) {
    try {
      const status = await window.electronAPI.getCapabilitiesUpdateStatus()
      if (status?.hasUpdate) {
        hasCapabilityUpdate.value = true
      }
    } catch (err) {
      console.error('[LeftPanel] Failed to get capabilities update status:', err)
    }
  }

  // 监听能力清单更新事件
  if (window.electronAPI?.onCapabilitiesUpdateAvailable) {
    capUpdateCleanup = window.electronAPI.onCapabilitiesUpdateAvailable(() => {
      hasCapabilityUpdate.value = true
    })
  }

  cleanupFn = setupEventListeners()

  // Listen for session file changes
  if (window.electronAPI?.onSessionFileChanged) {
    fileWatcherCleanup = window.electronAPI.onSessionFileChanged(async (data) => {
      // Reload history sessions when files change
      if (props.currentProject?.path === data.projectPath) {
        await loadHistorySessions(props.currentProject)
      }
    })
  }

  // Listen for session updates (e.g., when uuid is linked after file detection, visibility changed)
  if (window.electronAPI?.onSessionUpdated) {
    sessionUpdatedCleanup = window.electronAPI.onSessionUpdated(async (eventData) => {
      const { sessionId, session } = eventData || {}
      if (!sessionId || !session) return

      // 重新加载会话列表以确保UI同步
      await loadActiveSessions()

      // 强制 Vue 更新 DOM
      await nextTick()

      // 如果是当前项目的会话，同时更新历史会话列表（可能有 resumeSessionId 变化）
      if (props.currentProject && session.projectId === props.currentProject.id) {
        await loadHistorySessions(props.currentProject)
      }
    })
  }
})

onUnmounted(() => {
  if (cleanupFn) cleanupFn()
  if (fileWatcherCleanup) fileWatcherCleanup()
  if (sessionUpdatedCleanup) sessionUpdatedCleanup()
  if (updateAvailableCleanup) updateAvailableCleanup()
  if (capUpdateCleanup) capUpdateCleanup()
  // Stop file watching when component unmounts
  if (window.electronAPI?.stopWatchingSessionFiles) {
    window.electronAPI.stopWatchingSessionFiles()
  }
})

// Expose methods
defineExpose({
  loadActiveSessions,
  loadHistorySessions: () => loadHistorySessions(props.currentProject),
  reloadAgentConversations: () => agentLeftContentRef.value?.loadConversations?.(),
  focusedSessionId,
  activeAgentSessionId,
  handleNewSession
})
</script>

<style scoped>
.left-panel {
  width: 280px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--panel-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}
</style>

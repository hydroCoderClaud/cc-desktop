<template>
  <div class="left-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="logo-wrap">
        <n-dropdown trigger="click" :options="modeOptions" @select="handleModeSelect">
          <button
            type="button"
            class="app-logo"
            :title="t('mode.mode')"
            :aria-label="t('mode.mode')"
          >
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="15" stroke="var(--primary-color)" stroke-width="1.5" fill="rgba(74, 144, 217, 0.12)"/>
              <path d="M16 7 C16 7 10 14 10 18 a6 6 0 0 0 12 0 C22 14 16 7 16 7z" fill="var(--primary-color)" opacity="0.85"/>
            </svg>
          </button>
        </n-dropdown>
        <div class="logo">{{ panelTitle }}</div>
      </div>
      <div class="header-actions">
        <button class="panel-collapse-btn" @click="$emit('toggle-both-panels')" :title="t('panel.toggleBoth')">
          <Icon name="panelsCollapse" :size="14" />
        </button>
        <button class="panel-collapse-btn" @click="$emit('collapse')" :title="t('panel.hideLeft')">
          <Icon name="chevronLeft" :size="14" />
        </button>
      </div>
    </div>

    <!-- ========== Developer Mode Content ========== -->
    <template v-if="isDeveloperMode">
      <!-- Project Selector -->
      <div class="project-section">
        <div class="section-header">
          <span>{{ t('main.projects') }}</span>
          <button class="open-project-btn" @click="$emit('open-project')" :title="t('project.openExisting')">
            <Icon name="folderOpen" :size="14" />
          </button>
        </div>

        <div class="project-selector-row">
          <n-select
            v-model:value="selectedProjectId"
            :options="projectOptions"
            :render-label="renderProjectLabel"
            :placeholder="t('main.selectProject')"
            clearable
            filterable
            class="project-dropdown"
            @update:value="handleProjectChange"
          />
          <n-dropdown
            v-if="selectedProjectId"
            trigger="click"
            :options="projectMenuOptions"
            @select="handleProjectMenuSelect"
            placement="bottom-end"
          >
            <button class="project-settings-btn" :title="t('main.projectSettings')">
              <Icon name="settings" :size="14" />
            </button>
          </n-dropdown>
        </div>
      </div>

      <!-- New Session Button (固定不滚动) -->
      <div class="new-session-area" v-if="currentProject && currentProject.pathValid">
        <button class="new-session-btn" @click="handleNewSession">
          <span class="icon">+</span>
          <span>{{ t('session.newSession') }}</span>
        </button>
        <button class="open-terminal-btn" @click="handleOpenTerminal" :title="t('terminal.openTerminal')">
          <Icon name="terminal" :size="14" />
        </button>
      </div>
    </template>

    <!-- ========== Agent Mode Content (v-show 避免切换模式时 remount) ========== -->
    <AgentLeftContent
      v-show="isAgentMode"
      ref="agentLeftContentRef"
      :active-session-id="activeAgentSessionId"
      @created="handleAgentCreated"
      @select="handleAgentSelected"
      @close="handleAgentClosed"
      @new-conversation-request="showNewConvModal = true"
    />

    <!-- Agent 新建对话 Modal -->
    <AgentNewConversationModal
      :show="showNewConvModal"
      :projects="props.projects"
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

    <!-- Session Area (滚动区域) - 仅开发者模式 -->
    <div class="session-section" v-if="isDeveloperMode">
      <!-- Active Sessions -->
      <div class="sessions-group" v-if="activeSessions.length > 0">
        <div class="group-header">
          <span class="icon running-icon"></span>
          <span>{{ t('session.running') }}</span>
          <span class="count">({{ activeSessions.length }})</span>
        </div>
        <div
          v-for="session in activeSessions"
          :key="session.id"
          class="session-item"
          :class="{
            active: focusedSessionId === session.id,
            'other-project': currentProject && session.projectId !== currentProject.id
          }"
          @click="handleSelectSession(session)"
        >
          <div class="session-info">
            <div class="session-title">
              <span class="status-dot running"></span>
              <span class="title-text">{{ session.projectName }}：{{ session.title || t('session.session') }}</span>
            </div>
          </div>
          <div class="session-actions">
            <button
              class="rename-btn"
              @click.stop="openRenameDialog(session)"
              :title="t('common.edit')"
            >
              <Icon name="edit" :size="12" />
            </button>
            <button
              class="close-btn"
              @click.stop="handleCloseSession(session)"
              :title="t('session.close')"
            >
              <Icon name="close" :size="12" />
            </button>
          </div>
        </div>
      </div>

      <!-- History Sessions -->
      <div class="sessions-group" v-if="currentProject">
        <div class="group-header">
          <Icon name="history" :size="14" class="icon" />
          <span>{{ t('session.history') }}</span>
          <span class="count" v-if="historySessions.length > 0">({{ displayedHistorySessions.length }}/{{ historySessions.length }})</span>
          <button
            class="toggle-subagent-btn"
            :class="{ active: showSubagentSessions }"
            @click.stop="toggleSubagentSessions"
            :title="showSubagentSessions ? t('session.hideSubagent') : t('session.showSubagent')"
          >
            <Icon name="agent" :size="14" />
          </button>
          <button
            class="sync-btn"
            :class="{ syncing: isSyncing }"
            @click.stop="handleSyncSessions"
            :disabled="isSyncing"
            :title="t('session.sync') || '同步会话'"
          >
            <Icon name="refresh" :size="12" />
          </button>
          <span class="view-more" @click.stop="handleViewMore" v-if="historySessions.length > displayedHistorySessions.length">
            {{ t('session.viewMore') }}
          </span>
        </div>
        <template v-if="displayedHistorySessions.length > 0">
          <div
            v-for="session in displayedHistorySessions"
            :key="session.session_uuid"
            class="session-item history"
            @click="handleOpenHistorySession(session)"
          >
            <div class="session-info">
              <div class="session-title">
                <Icon name="message" :size="12" class="icon" />
                <span class="title-text">{{ formatSessionName(session) }}</span>
              </div>
              <div class="session-meta">
                {{ formatDate(session.created_at) }} · {{ session.message_count || 0 }} {{ t('session.messages') }}
              </div>
            </div>
            <div class="session-actions">
              <button
                class="rename-btn"
                @click.stop="handleEditHistorySession(session)"
                :title="t('common.edit')"
              >
                <Icon name="edit" :size="12" />
              </button>
              <button
                class="delete-btn"
                @click.stop="handleDeleteHistorySession(session)"
                :title="t('session.delete')"
              >
                <Icon name="close" :size="12" />
              </button>
            </div>
          </div>
        </template>
        <div v-else class="empty-hint small">
          {{ t('session.noHistorySessions') || '点击同步历史会话' }}
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!currentProject" class="empty-hint">
        {{ t('main.pleaseSelectProject') }}
      </div>
    </div>

    <!-- Footer -->
    <div class="panel-footer">
      <div class="footer-row">
        <n-dropdown
          trigger="click"
          :options="settingsOptions"
          :render-label="renderSettingsLabel"
          @select="handleSettingsSelect"
          placement="top-start"
        >
          <button class="settings-btn" :title="t('main.settingsMenu')">
            <Icon name="settings" :size="16" class="icon" />
            <span v-if="hasUpdateAvailable" class="update-badge"></span>
          </button>
        </n-dropdown>

        <div class="footer-right">
          <button class="theme-toggle-btn" @click="$emit('toggle-theme')" :title="isDark ? t('main.toggleLight') : t('main.toggleDark')">
            <Icon :name="isDark ? 'sun' : 'moon'" :size="18" />
          </button>

          <button
            v-if="isAgentMode"
            class="capability-btn"
            @click="showCapabilityModal = true"
            :title="t('agent.capabilities')"
          >
            <Icon name="lightning" :size="18" />
            <span v-if="hasCapabilityUpdate" class="capability-update-badge"></span>
          </button>
        </div>
      </div>
    </div>

    <!-- New Session Dialog -->
    <n-modal
      v-model:show="showNewSessionDialog"
      preset="card"
      :title="t('session.newSession')"
      style="width: 360px;"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            v-model:value="newSessionTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @keyup.enter="confirmNewSession"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="showNewSessionDialog = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="confirmNewSession">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Rename Session Dialog (活动会话) -->
    <n-modal
      v-model:show="showRenameDialog"
      preset="card"
      :title="t('session.rename') || '重命名会话'"
      style="width: 360px;"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            v-model:value="renameTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @keyup.enter="confirmRename"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="showRenameDialog = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="confirmRename">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Rename History Session Dialog (历史会话，仅内存) -->
    <n-modal
      v-model:show="showHistoryRenameDialog"
      preset="card"
      :title="t('session.rename') || '重命名会话'"
      style="width: 360px;"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            v-model:value="historyRenameTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @keyup.enter="confirmHistoryRename"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="showHistoryRenameDialog = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="confirmHistoryRename">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick, h } from 'vue'
import { useMessage, useDialog, NSelect, NDropdown, NModal, NForm, NFormItem, NInput, NButton } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useLocale } from '@composables/useLocale'
import { useSessionPanel } from '@composables/useSessionPanel'
import { useAppMode, AppMode } from '@composables/useAppMode'
import Icon from '@components/icons/Icon.vue'
import AgentLeftContent from './agent/AgentLeftContent.vue'
import AgentNewConversationModal from './agent/AgentNewConversationModal.vue'
import CapabilityModal from './agent/CapabilityModal.vue'

const message = useMessage()
const dialog = useDialog()
const { invoke } = useIPC()
const { t, locale } = useLocale()
const { isDeveloperMode, isAgentMode, isNotebookMode, switchMode, appMode } = useAppMode()

const renderModeIcon = (iconName) => () => h(Icon, { name: iconName, size: 16, style: 'margin-right: 8px; color: var(--primary-color)' })

const modeOptions = computed(() => {
  const options = []
  if (!isDeveloperMode.value) {
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
  if (isAgentMode.value) return 'Hydro Agent'
  if (isNotebookMode.value) return 'Hydro Notebook'
  return 'Hydro Coder'
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
      }
    } catch (err) {
      console.error('[LeftPanel] reopen agent session error:', err)
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
  'collapse',
  'toggle-both-panels',
  'mode-changed',
  'agent-created',
  'agent-selected',
  'agent-closed'
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
  focusedSessionId,
  activeAgentSessionId,
  handleNewSession
})
</script>

<style scoped>
@import '@styles/common.css';

.left-panel {
  width: 280px;
  background: var(--bg-color-secondary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 60px;
}

.logo-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-logo {
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.logo {
  font-family: var(--font-logo);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-color);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Project Section */
.project-section {
  padding: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.open-project-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.open-project-btn:hover {
  background: var(--hover-bg);
}

.project-selector-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.project-dropdown {
  flex: 1;
}

.project-settings-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  flex-shrink: 0;
}

.project-settings-btn:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

/* New Session Area (固定不滚动) */
.new-session-area {
  padding: 12px;
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  padding: 10px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.new-session-btn:hover {
  background: var(--primary-color-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.new-session-btn .icon {
  font-size: 16px;
  font-weight: bold;
}

.open-terminal-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  padding: 10px;
  background: var(--bg-color-tertiary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.2s;
}

.open-terminal-btn:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* Session Section (滚动区域) */
.session-section {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Sessions Group */
.sessions-group {
  margin-bottom: 16px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  padding: 8px 4px;
}

.group-header .icon {
  font-size: 12px;
}

.group-header .running-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #52c41a;
}

.group-header .count {
  font-weight: 400;
}

.group-header .sync-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-color-muted);
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-header .toggle-subagent-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-color-muted);
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-header .toggle-subagent-btn:hover {
  opacity: 0.8;
  background: var(--hover-bg);
}

.group-header .toggle-subagent-btn.active {
  opacity: 1;
  color: var(--primary-color);
}

.group-header .sync-btn:hover {
  opacity: 1;
  background: var(--hover-bg);
  color: var(--primary-color);
}

.group-header .sync-btn:disabled {
  cursor: not-allowed;
}

.group-header .sync-btn.syncing {
  animation: spin 1s linear infinite;
  opacity: 1;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.group-header .view-more {
  margin-left: auto;
  font-size: 11px;
  color: var(--primary-color);
  cursor: pointer;
  font-weight: 500;
  text-transform: none;
}

.group-header .view-more:hover {
  text-decoration: underline;
}

/* Session Item */
.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  background: var(--hover-bg);
}

.session-item.active {
  background: var(--warning-bg);
  border: 1px solid var(--primary-color);
}

.session-item.other-project {
  opacity: 0.7;
}

.session-info {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.session-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.session-title .icon {
  font-size: 12px;
  flex-shrink: 0;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.running {
  background: #52c41a;
}

.session-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Session Actions */
.session-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-item:hover .session-actions {
  opacity: 1;
}

/* Close/Delete/Rename Button */
.close-btn,
.delete-btn,
.rename-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.rename-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.close-btn:hover {
  background: var(--primary-color);
  color: white;
}

.delete-btn:hover {
  background: #ff4d4f;
  color: white;
}

/* Empty Hint */
.empty-hint {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-muted);
}

.empty-hint.small {
  padding: 12px 8px;
  font-size: 12px;
}

/* Footer */
.panel-footer {
  padding: 12px;
  margin-top: auto;
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-color);
  position: relative;
}

.settings-btn:hover {
  transform: scale(1.05);
  border-color: var(--primary-color);
}

.update-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  border: 1.5px solid var(--bg-color);
}


.theme-toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 18px;
}

.theme-toggle-btn:hover {
  transform: scale(1.05);
  border-color: var(--primary-color);
}

.capability-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 18px;
  color: var(--primary-color);
}

.capability-btn:hover {
  transform: scale(1.05);
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.capability-update-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  border: 1.5px solid var(--bg-color);
}

/* Agent mode button */
.agent-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Dialog Footer */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

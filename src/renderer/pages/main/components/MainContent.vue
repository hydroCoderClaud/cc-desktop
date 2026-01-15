<template>
  <div class="app-container" :class="{ 'dark-theme': isDark }" :style="cssVars" @click="handleGlobalClick">
    <!-- Sidebar (Project List) -->
    <Sidebar
      ref="sidebarRef"
      :projects="projects"
      :current-project="currentProject"
      :is-dark="isDark"
      @add-project="handleAddProject"
      @open-project="handleOpenProject"
      @select-project="selectProject"
      @toggle-theme="handleToggleTheme"
      @context-action="handleContextAction"
    />

    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Header -->
      <div class="main-header">
        <div class="session-name">{{ currentProject?.name || t('main.welcome') }}</div>
        <div class="project-path">{{ currentProject?.path || t('main.pleaseSelectProject') }}</div>
      </div>

      <!-- Tab Bar -->
      <TabBar
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :current-project="currentProject"
        @select-tab="handleSelectTab"
        @close-tab="handleCloseTab"
        @new-tab="handleNewSession"
      />

      <!-- Main Area -->
      <div class="main-area">
        <!-- Welcome Page -->
        <div v-show="activeTabId === 'welcome'" class="empty-state">
          <div class="pixel-mascot">🤖</div>

          <div class="selectors-row">
            <div class="selector" @click="handleAddProject">
              <span>📁</span>
              <span>{{ currentProject?.name || t('main.selectProject') }}</span>
            </div>
          </div>

          <div class="new-session-form" v-if="currentProject && currentProject.pathValid">
            <n-input
              v-model:value="welcomeSessionTitle"
              :placeholder="t('session.sessionTitlePlaceholder')"
              class="session-title-input"
              @keyup.enter="handleWelcomeNewSession"
            >
              <template #suffix>
                <n-button
                  type="primary"
                  size="small"
                  :disabled="isCreatingSession"
                  @click="handleWelcomeNewSession"
                >
                  {{ t('session.newSession') }}
                </n-button>
              </template>
            </n-input>
          </div>
          <div class="connect-actions" v-else>
            <button class="connect-btn" disabled>
              <span>▶️</span>
              <span>{{ t('main.selectProject') }}</span>
            </button>
          </div>

          <div class="warning-box">
            <div class="warning-icon">⚠️</div>
            <div class="warning-text">
              {{ t('main.warningText') }}
            </div>
          </div>
        </div>

        <!-- Terminal Tabs Container -->
        <div v-show="activeTabId !== 'welcome'" class="terminal-container">
          <TerminalTab
            v-for="tab in tabs"
            :key="tab.id"
            :ref="el => setTerminalRef(tab.id, el)"
            :session-id="tab.sessionId"
            :visible="activeTabId === tab.id"
            :is-dark="isDark"
            @ready="handleTerminalReady"
          />
        </div>
      </div>
    </div>

    <!-- Session Panel (Right Side) -->
    <SessionPanel
      ref="sessionPanelRef"
      :project="currentProject"
      @session-created="handleSessionCreated"
      @session-selected="handleSessionSelected"
      @session-closed="handleSessionClosed"
    />

    <!-- Project Edit Modal -->
    <n-modal v-model:show="showProjectModal" preset="card" :title="editingProject ? t('project.editTitle') : t('project.createTitle')" style="width: 500px;">
      <n-form :model="projectForm" label-placement="left" label-width="80">
        <n-form-item :label="t('project.name')">
          <n-input v-model:value="projectForm.name" :placeholder="t('project.namePlaceholder')" />
          <template #feedback>
            <span class="form-hint">{{ t('project.nameHint') }}</span>
          </template>
        </n-form-item>
        <n-form-item :label="t('project.path')">
          <n-input v-model:value="projectForm.path" disabled />
          <template #feedback>
            <span class="form-hint">{{ t('project.pathHint') }}</span>
          </template>
        </n-form-item>
        <n-form-item :label="t('project.description')">
          <n-input v-model:value="projectForm.description" type="textarea" :placeholder="t('project.descriptionPlaceholder')" />
        </n-form-item>
        <n-form-item :label="t('project.icon')">
          <div class="emoji-picker-container">
            <div class="selected-emoji" @click="showEmojiPicker = !showEmojiPicker">
              {{ projectForm.icon || '📁' }}
            </div>
            <div v-if="showEmojiPicker" class="emoji-picker" @click.stop>
              <div
                v-for="emoji in commonEmojis"
                :key="emoji"
                class="emoji-option"
                :class="{ selected: projectForm.icon === emoji }"
                @click="selectEmoji(emoji)"
              >
                {{ emoji }}
              </div>
            </div>
          </div>
        </n-form-item>
        <n-form-item :label="t('project.borderColor')">
          <div class="color-picker-row">
            <n-color-picker
              v-model:value="projectForm.color"
              :modes="['hex']"
              :show-alpha="false"
              :swatches="['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#eb2f96', '#13c2c2', '#2f54eb']"
              style="width: 120px;"
            />
            <n-button size="small" @click="projectForm.color = '#1890ff'">{{ t('project.resetColor') }}</n-button>
          </div>
        </n-form-item>
        <n-form-item :label="t('project.apiProfile')">
          <div class="api-profile-row">
            <n-select
              v-model:value="projectForm.api_profile_id"
              :options="apiProfileOptions"
              :placeholder="t('project.apiProfilePlaceholder')"
              clearable
              style="flex: 1;"
            />
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  size="small"
                  quaternary
                  :disabled="!projectForm.api_profile_id"
                  @click="openApiProfileManager"
                >
                  ⚙️
                </n-button>
              </template>
              {{ t('project.editApiProfile') }}
            </n-tooltip>
          </div>
          <template #feedback>
            <span class="form-hint">{{ t('project.apiProfileHint') }}</span>
          </template>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showProjectModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="saveProject">{{ t('common.save') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Delete Confirmation Modal -->
    <n-modal v-model:show="showDeleteModal" preset="dialog" type="warning" :title="t('project.deleteConfirm')">
      <div class="delete-confirm-content">
        <p>{{ t('project.deleteWarning', { name: deleteProject?.name }) }}</p>
        <n-checkbox v-model:checked="deleteWithSessions">{{ t('project.deleteWithSessions') }}</n-checkbox>
      </div>
      <template #action>
        <n-button @click="showDeleteModal = false">{{ t('common.cancel') }}</n-button>
        <n-button type="error" @click="confirmDeleteProject">{{ t('common.confirm') }}</n-button>
      </template>
    </n-modal>

    <!-- New Session Modal -->
    <n-modal
      v-model:show="showNewSessionModal"
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
        <div class="modal-footer">
          <n-button @click="showNewSessionModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="confirmNewSession">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage, NModal, NForm, NFormItem, NInput, NButton, NColorPicker, NCheckbox, NSelect, NTooltip } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import { createTabFromSession, findTabBySessionId, removeTabAndGetNextActive } from '@composables/useSessionUtils'
import Sidebar from './Sidebar.vue'
import TabBar from './TabBar.vue'
import TerminalTab from './TerminalTab.vue'
import SessionPanel from './SessionPanel/index.vue'

const message = useMessage()
const { invoke } = useIPC()
const { isDark, cssVars, toggleTheme } = useTheme()
const { t, initLocale } = useLocale()

// Refs
const sidebarRef = ref(null)
const sessionPanelRef = ref(null)
const terminalRefs = ref({})

// State
const projects = ref([])
const currentProject = ref(null)

// Tabs state
const tabs = ref([])
const activeTabId = ref('welcome')  // 默认显示欢迎页

// Project edit modal
const showProjectModal = ref(false)
const editingProject = ref(null)
const projectForm = ref({
  name: '',
  path: '',
  description: '',
  icon: '📁',
  color: '#1890ff',
  api_profile_id: null
})

// Delete confirmation
const showDeleteModal = ref(false)
const deleteProject = ref(null)
const deleteWithSessions = ref(false)

// New session modal
const showNewSessionModal = ref(false)
const newSessionTitle = ref('')

// Welcome page new session
const welcomeSessionTitle = ref('')
const isCreatingSession = ref(false)

// Emoji picker
const showEmojiPicker = ref(false)
const commonEmojis = [
  '📁', '📂', '📦', '🗂️', '💼',
  '🚀', '⚡', '🔥', '✨', '💡',
  '🎯', '🎨', '🎮', '🎵', '🎬',
  '🌐', '🔧', '⚙️', '🛠️', '🔨',
  '📱', '💻', '🖥️', '⌨️', '🖱️',
  '📊', '📈', '📉', '📋', '📝',
  '🔒', '🔑', '🔐', '🛡️', '⚔️',
  '🌟', '⭐', '🏆', '🎖️', '🏅',
  '❤️', '💚', '💙', '💜', '🧡'
]

const selectEmoji = (emoji) => {
  projectForm.value.icon = emoji
  showEmojiPicker.value = false
}

// API Profiles
const apiProfiles = ref([])

const apiProfileOptions = computed(() => {
  return apiProfiles.value.map(profile => ({
    label: `${profile.icon || '🔑'} ${profile.name}${profile.isDefault ? ' (' + t('common.default') + ')' : ''}`,
    value: profile.id
  }))
})

const loadApiProfiles = async () => {
  try {
    apiProfiles.value = await invoke('listAPIProfiles')
  } catch (err) {
    console.error('Failed to load API profiles:', err)
    apiProfiles.value = []
  }
}

// Set terminal ref
const setTerminalRef = (tabId, el) => {
  if (el) {
    terminalRefs.value[tabId] = el
  } else {
    delete terminalRefs.value[tabId]
  }
}

// Initialize
onMounted(async () => {
  await initLocale()
  await loadProjects()

  // 自动选中第一个项目（如果有的话），需要通过 selectProject 来触发路径检查
  if (projects.value.length > 0 && !currentProject.value) {
    await selectProject(projects.value[0])
  }

  setupSessionListeners()
})

// Cleanup listeners
let cleanupFns = []

onUnmounted(() => {
  cleanupFns.forEach(fn => fn && fn())
})

// Setup session event listeners
const setupSessionListeners = () => {
  if (!window.electronAPI) return

  // 监听会话数据
  cleanupFns.push(
    window.electronAPI.onSessionData(({ sessionId, data }) => {
      // 找到对应的 tab
      const tab = tabs.value.find(t => t.sessionId === sessionId)
      if (tab && terminalRefs.value[tab.id]) {
        terminalRefs.value[tab.id].write(data)
      }
    })
  )

  // 监听会话退出
  cleanupFns.push(
    window.electronAPI.onSessionExit(({ sessionId }) => {
      // 更新 tab 状态
      const tab = tabs.value.find(t => t.sessionId === sessionId)
      if (tab) {
        tab.status = 'exited'
      }
    })
  )

  // 监听会话错误
  cleanupFns.push(
    window.electronAPI.onSessionError(({ sessionId, error }) => {
      const tab = tabs.value.find(t => t.sessionId === sessionId)
      if (tab) {
        tab.status = 'error'
      }
      message.error(t('messages.terminalError') + ': ' + error)
    })
  )
}

// Load projects
const loadProjects = async () => {
  try {
    projects.value = await invoke('getProjects', false)
  } catch (err) {
    console.error('Failed to load projects:', err)
    projects.value = []
  }
}

// Project management
const selectProject = async (project) => {
  // 实时检查路径是否存在
  try {
    const result = await invoke('checkPath', project.path)
    if (result.valid !== project.pathValid) {
      if (!result.valid) {
        message.warning(t('project.pathNotExist'))
      }
      await loadProjects()
      const updated = projects.value.find(p => p.id === project.id)
      if (updated) {
        currentProject.value = updated
        return
      }
    }
  } catch (err) {
    console.error('Failed to check path:', err)
  }
  currentProject.value = project
}

// Handle global click (close context menu)
const handleGlobalClick = () => {
  if (sidebarRef.value) {
    sidebarRef.value.closeContextMenu()
  }
}

// Create new project
const handleAddProject = async () => {
  try {
    const result = await invoke('createProject', {})
    if (result.canceled) return

    await loadProjects()
    currentProject.value = result

    if (result.restored) {
      message.success(t('messages.projectRestored') + ': ' + result.name)
    } else {
      message.success(t('messages.projectAdded') + ': ' + result.name)
    }
  } catch (err) {
    console.error('Failed to add project:', err)
    message.error(err.message || t('messages.operationFailed'))
  }
}

// Open existing project
const handleOpenProject = async () => {
  try {
    const result = await invoke('openProject')
    if (result.canceled) return

    await loadProjects()
    currentProject.value = result

    if (result.restored) {
      message.success(t('messages.projectRestored') + ': ' + result.name)
    } else if (result.alreadyExists) {
      message.info(t('messages.projectOpened') + ': ' + result.name)
    } else {
      message.success(t('messages.projectAdded') + ': ' + result.name)
    }
  } catch (err) {
    console.error('Failed to open project:', err)
    message.error(err.message || t('messages.operationFailed'))
  }
}

// Context menu action handler
const handleContextAction = async ({ action, project }) => {
  switch (action) {
    case 'openFolder':
      await handleOpenFolder(project)
      break
    case 'pin':
      await handleTogglePin(project)
      break
    case 'edit':
      openEditModal(project)
      break
    case 'hide':
      await handleHideProject(project)
      break
    case 'delete':
      openDeleteModal(project)
      break
  }
}

// Open folder in file explorer
const handleOpenFolder = async (project) => {
  try {
    await invoke('openFolder', project.path)
  } catch (err) {
    console.error('Failed to open folder:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Toggle pin
const handleTogglePin = async (project) => {
  try {
    await invoke('toggleProjectPinned', project.id)
    await loadProjects()
    message.success(project.is_pinned ? t('messages.projectUnpinned') : t('messages.projectPinned'))
  } catch (err) {
    console.error('Failed to toggle pin:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Hide project
const handleHideProject = async (project) => {
  try {
    await invoke('hideProject', project.id)
    await loadProjects()

    if (currentProject.value?.id === project.id) {
      currentProject.value = null
    }

    message.success(t('messages.projectHidden'))
  } catch (err) {
    console.error('Failed to hide project:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Edit project modal
const openEditModal = async (project) => {
  await loadApiProfiles()

  editingProject.value = project
  projectForm.value = {
    name: project.name || '',
    path: project.path || '',
    description: project.description || '',
    icon: project.icon || '📁',
    color: project.color || '#1890ff',
    api_profile_id: project.api_profile_id || null
  }
  showEmojiPicker.value = false
  showProjectModal.value = true
}

const saveProject = async () => {
  if (!editingProject.value) return

  try {
    await invoke('updateProject', {
      projectId: editingProject.value.id,
      updates: {
        name: projectForm.value.name,
        description: projectForm.value.description,
        icon: projectForm.value.icon,
        color: projectForm.value.color,
        api_profile_id: projectForm.value.api_profile_id
      }
    })

    await loadProjects()
    showProjectModal.value = false
    editingProject.value = null
    message.success(t('messages.projectUpdated'))
  } catch (err) {
    console.error('Failed to update project:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Delete project
const openDeleteModal = (project) => {
  deleteProject.value = project
  deleteWithSessions.value = false
  showDeleteModal.value = true
}

const confirmDeleteProject = async () => {
  if (!deleteProject.value) return

  try {
    await invoke('deleteProject', {
      projectId: deleteProject.value.id,
      deleteSessions: deleteWithSessions.value
    })

    await loadProjects()

    if (currentProject.value?.id === deleteProject.value.id) {
      currentProject.value = null
    }

    showDeleteModal.value = false
    deleteProject.value = null
    message.success(t('messages.projectDeleted'))
  } catch (err) {
    console.error('Failed to delete project:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Tab helpers
const addSessionTab = async (session, project) => {
  const newTab = createTabFromSession(session, project)
  tabs.value.push(newTab)
  activeTabId.value = newTab.id

  // 同步右侧面板
  if (sessionPanelRef.value) {
    await sessionPanelRef.value.loadActiveSessions()
    sessionPanelRef.value.focusedSessionId = session.id
  }
}

// Tab management
const handleSelectTab = (tab) => {
  activeTabId.value = tab.id

  // Welcome tab 不需要后续处理
  if (tab.id === 'welcome') {
    return
  }

  // 如果是其他项目的 Tab，切换左侧项目选中
  if (tab.projectId !== currentProject.value?.id) {
    const targetProject = projects.value.find(p => p.id === tab.projectId)
    if (targetProject) {
      currentProject.value = targetProject
    }
  }

  // 同步右侧面板的选中状态
  if (sessionPanelRef.value?.focusedSessionId !== undefined) {
    sessionPanelRef.value.focusedSessionId = tab.sessionId
  }

  // 通知后端聚焦该会话
  if (window.electronAPI) {
    window.electronAPI.focusActiveSession(tab.sessionId)
  }
  // 调整终端大小
  nextTick(() => {
    if (terminalRefs.value[tab.id]) {
      terminalRefs.value[tab.id].fit()
    }
  })
}

const handleCloseTab = async (tab) => {
  // 断开连接（会话在后台继续运行）
  try {
    await invoke('disconnectActiveSession', tab.sessionId)
  } catch (err) {
    console.error('Failed to disconnect session:', err)
  }

  // 移除 tab 并切换到合适的 tab
  activeTabId.value = removeTabAndGetNextActive(tabs.value, tab.id, activeTabId.value)
}

// Open new session dialog
const handleNewSession = async () => {
  if (!currentProject.value) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!currentProject.value.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  // Check session count limit
  try {
    const runningCount = await invoke('getRunningSessionCount')
    const maxSessions = await invoke('getMaxActiveSessions')
    if (runningCount >= maxSessions) {
      message.warning(t('session.maxSessionsReached', { max: maxSessions }))
      return
    }
  } catch (err) {
    console.error('Failed to check session limit:', err)
  }

  newSessionTitle.value = ''
  showNewSessionModal.value = true
}

// Confirm and create new session
const confirmNewSession = async () => {
  try {
    const result = await invoke('createActiveSession', {
      projectId: currentProject.value.id,
      projectPath: currentProject.value.path,
      projectName: currentProject.value.name,
      title: newSessionTitle.value.trim(),
      apiProfileId: currentProject.value.api_profile_id
    })

    if (result.success) {
      showNewSessionModal.value = false
      await addSessionTab(result.session, currentProject.value)
      message.success(t('messages.connectionSuccess'))
    } else {
      message.error(result.error || t('messages.connectionFailed'))
    }
  } catch (err) {
    console.error('Failed to create session:', err)
    message.error(t('messages.connectionFailed'))
  }
}

// Welcome page direct create session
const handleWelcomeNewSession = async () => {
  if (!currentProject.value || !currentProject.value.pathValid) {
    return
  }

  // Check session count limit
  try {
    const runningCount = await invoke('getRunningSessionCount')
    const maxSessions = await invoke('getMaxActiveSessions')
    if (runningCount >= maxSessions) {
      message.warning(t('session.maxSessionsReached', { max: maxSessions }))
      return
    }
  } catch (err) {
    console.error('Failed to check session limit:', err)
  }

  isCreatingSession.value = true
  try {
    const result = await invoke('createActiveSession', {
      projectId: currentProject.value.id,
      projectPath: currentProject.value.path,
      projectName: currentProject.value.name,
      title: welcomeSessionTitle.value.trim(),
      apiProfileId: currentProject.value.api_profile_id
    })

    if (result.success) {
      welcomeSessionTitle.value = ''
      await addSessionTab(result.session, currentProject.value)
      message.success(t('messages.connectionSuccess'))
    } else {
      message.error(result.error || t('messages.connectionFailed'))
    }
  } catch (err) {
    console.error('Failed to create session:', err)
    message.error(t('messages.connectionFailed'))
  } finally {
    isCreatingSession.value = false
  }
}

// Session panel events - 确保会话有对应的 Tab（如果没有则创建）
const ensureSessionTab = (session) => {
  const existingTab = findTabBySessionId(tabs.value, session.id)
  if (existingTab) {
    activeTabId.value = existingTab.id
    return
  }

  // 创建新 tab（使用 session 自带的 project 信息）
  const newTab = {
    id: `tab-${session.id}`,
    sessionId: session.id,
    projectId: session.projectId,
    projectName: session.projectName,
    projectPath: session.projectPath,
    title: session.title || '',
    status: session.status
  }
  tabs.value.push(newTab)
  activeTabId.value = newTab.id
}

const handleSessionCreated = (session) => {
  ensureSessionTab(session)
}

const handleSessionSelected = (session) => {
  // 如果是其他项目的会话，切换左侧项目选中
  if (session.projectId !== currentProject.value?.id) {
    const targetProject = projects.value.find(p => p.id === session.projectId)
    if (targetProject) {
      currentProject.value = targetProject
    }
  }
  ensureSessionTab(session)
}

const handleSessionClosed = (session) => {
  const tab = findTabBySessionId(tabs.value, session.id)
  if (tab) {
    activeTabId.value = removeTabAndGetNextActive(tabs.value, tab.id, activeTabId.value)
  }
}

// Terminal ready event
const handleTerminalReady = ({ sessionId }) => {
  console.log('Terminal ready for session:', sessionId)
}

// Theme toggle handler
const handleToggleTheme = async () => {
  await toggleTheme()
}

// Open API Profile Manager
const openApiProfileManager = async () => {
  if (window.electronAPI) {
    await window.electronAPI.openProfileManager()
  }
}
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #f5f5f0;
  color: #2d2d2d;
  transition: all 0.3s ease;
  overflow: hidden;
}

.app-container.dark-theme {
  background: #1a1a1a;
  color: #e8e8e8;
}

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e5e0;
  background: #ffffff;
}

.dark-theme .main-header {
  background: #242424;
  border-color: #333333;
}

.session-name {
  font-size: 15px;
  font-weight: 600;
}

.project-path {
  font-size: 13px;
  color: #8c8c8c;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.main-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Empty State */
.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 500px;
  width: calc(100% - 48px);
  text-align: center;
}

.pixel-mascot {
  font-size: 80px;
  margin-bottom: 32px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

.selectors-row {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
  justify-content: center;
}

.selector {
  min-width: 200px;
  padding: 12px 16px;
  background: white;
  border: 1.5px solid #e5e5e0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #2d2d2d;
}

.selector:hover {
  border-color: #ff6b35;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}

.new-session-form {
  max-width: 400px;
  margin: 0 auto;
}

.new-session-form .session-title-input {
  border-radius: 8px;
}

.new-session-form :deep(.n-input) {
  --n-border-radius: 8px !important;
}

.new-session-form :deep(.n-input__suffix) {
  padding-right: 4px;
}

.connect-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.connect-btn {
  padding: 12px 32px;
  background: #ff6b35;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.connect-btn:hover:not(:disabled) {
  background: #ff5722;
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  background: #fef9e7;
  border: 1px solid #f4d03f;
  border-radius: 10px;
  margin-top: 32px;
  text-align: left;
}

.dark-theme .warning-box {
  background: #3a3a1a;
}

.warning-icon {
  color: #f39c12;
  font-size: 20px;
  flex-shrink: 0;
}

.warning-text {
  font-size: 13px;
  line-height: 1.6;
  color: #856404;
}

.dark-theme .warning-text {
  color: #f4d03f;
}

/* Terminal Container */
.terminal-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden !important;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d0d0c8;
  border-radius: 4px;
}

.dark-theme ::-webkit-scrollbar-thumb {
  background: #444444;
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Delete Confirm */
.delete-confirm-content {
  padding: 8px 0;
}

.delete-confirm-content p {
  margin-bottom: 12px;
}

/* Emoji Picker */
.emoji-picker-container {
  position: relative;
}

.selected-emoji {
  width: 48px;
  height: 48px;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e5e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #f5f5f0;
}

.selected-emoji:hover {
  border-color: #ff6b35;
  background: #fff;
}

.dark-theme .selected-emoji {
  background: #333333;
  border-color: #444444;
}

.dark-theme .selected-emoji:hover {
  border-color: #ff6b35;
  background: #404040;
}

.emoji-picker {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e5e5e0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  z-index: 100;
  width: 220px;
}

.dark-theme .emoji-picker {
  background: #2a2a2a;
  border-color: #444444;
}

.emoji-option {
  width: 36px;
  height: 36px;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.emoji-option:hover {
  background: #f0f0f0;
  transform: scale(1.1);
}

.dark-theme .emoji-option:hover {
  background: #3a3a3a;
}

.emoji-option.selected {
  background: #ff6b35;
  color: white;
}

/* Form Hint */
.form-hint {
  font-size: 12px;
  color: #8c8c8c;
}

/* Color Picker Row */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* API Profile Row */
.api-profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>

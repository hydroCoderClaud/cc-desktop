<template>
  <div class="app-container" :class="{ 'dark-theme': isDark }" :style="cssVars">
    <!-- Left Panel Collapsed Strip -->
    <div
      v-if="!showLeftPanel"
      class="panel-collapsed-strip panel-collapsed-left"
      @click="showLeftPanel = true"
      :title="t('panel.showLeft')"
    >
      <span class="strip-icon">›</span>
    </div>

    <!-- Left Panel (Project Selector + Sessions) -->
    <LeftPanel
      v-if="showLeftPanel"
      ref="leftPanelRef"
      :projects="projects"
      :current-project="currentProject"
      :is-dark="isDark"
      @open-project="handleOpenProject"
      @select-project="selectProject"
      @toggle-theme="handleToggleTheme"
      @context-action="handleContextAction"
      @session-created="onSessionCreated"
      @session-selected="handleSessionSelected"
      @session-closed="onSessionClosed"
      @collapse="showLeftPanel = false"
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
        :show-new-button="false"
        @select-tab="handleSelectTab"
        @close-tab="handleCloseTab"
      />

      <!-- Main Area -->
      <div class="main-area">
        <!-- Welcome Page -->
        <div v-show="activeTabId === 'welcome'" class="empty-state">
          <div class="pixel-mascot">🤖</div>

          <div class="welcome-message">
            <h2>{{ t('main.welcome') }}</h2>
            <p v-if="!currentProject">{{ t('main.pleaseSelectProject') }}</p>
            <p v-else-if="!currentProject.pathValid">{{ t('project.pathNotExist') }}</p>
            <p v-else>{{ t('session.newSessionHint') || '在左侧面板点击"新建会话"开始' }}</p>
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
            :font-size="terminalFontSize"
            :font-family="terminalFontFamily"
            @ready="handleTerminalReady"
          />
        </div>
      </div>
    </div>

    <!-- Right Panel -->
    <RightPanel
      v-if="showRightPanel"
      ref="rightPanelRef"
      :current-project="currentProject"
      :terminal-busy="terminalBusy"
      @collapse="showRightPanel = false"
      @send-to-terminal="handleSendToTerminal"
    />

    <!-- Right Panel Collapsed Strip -->
    <div
      v-if="!showRightPanel"
      class="panel-collapsed-strip panel-collapsed-right"
      @click="showRightPanel = true"
      :title="t('panel.showRight')"
    >
      <span class="strip-icon">‹</span>
    </div>

    <!-- Project Edit Modal -->
    <ProjectEditModal
      v-model:show="showProjectModal"
      :project="editingProject"
      :api-profiles="apiProfiles"
      @save="handleProjectSave"
      @open-profile-manager="openApiProfileManager"
    />

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import { useProjects } from '@composables/useProjects'
import { useTabManagement } from '@composables/useTabManagement'
import { isValidSessionEvent } from '@composables/useValidation'
import LeftPanel from './LeftPanel.vue'
import RightPanel from './RightPanel/index.vue'
import TabBar from './TabBar.vue'
import TerminalTab from './TerminalTab.vue'
import ProjectEditModal from './ProjectEditModal.vue'

const message = useMessage()
const { isDark, cssVars, toggleTheme } = useTheme()
const { t, initLocale } = useLocale()

// Use composables
const {
  projects,
  currentProject,
  showProjectModal,
  editingProject,
  apiProfiles,
  loadProjects,
  selectProject: doSelectProject,
  openProject,
  openFolder,
  togglePin,
  hideProject,
  openEditModal,
  closeEditModal,
  saveProject,
  selectFirstProject
} = useProjects()

const {
  tabs,
  activeTabId,
  ensureSessionTab,
  selectTab,
  closeTab,
  handleSessionCreated,
  handleSessionSelected: doHandleSessionSelected,
  handleSessionClosed,
  updateTabStatus,
  updateTabTitle,
  findTabBySessionId
} = useTabManagement()

// Refs
const leftPanelRef = ref(null)
const rightPanelRef = ref(null)
const terminalRefs = ref({})
const terminalFontSize = ref(14)
const terminalFontFamily = ref('"Ubuntu Mono", monospace')
const terminalBusy = ref(false)

// Panel visibility
const showLeftPanel = ref(true)
const showRightPanel = ref(true)  // 默认显示右侧面板

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
  selectFirstProject()
  setupSessionListeners()
  window.addEventListener('keydown', handleKeyDown)

  // Load terminal settings
  try {
    const terminalSettings = await window.electronAPI.getTerminalSettings()
    terminalFontSize.value = terminalSettings?.fontSize || 14
    terminalFontFamily.value = terminalSettings?.fontFamily || 'Consolas, monospace'
  } catch (err) {
    console.error('Failed to load terminal settings:', err)
  }
})

// Cleanup listeners
let cleanupFns = []

// Keyboard shortcuts handler
const handleKeyDown = (event) => {
  // Ctrl+N: New session
  if (event.ctrlKey && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    if (leftPanelRef.value && currentProject.value?.pathValid) {
      // 触发左侧面板的新建会话
      leftPanelRef.value.handleNewSession?.()
    }
    return
  }
}

onUnmounted(() => {
  cleanupFns.forEach(fn => fn && fn())
  window.removeEventListener('keydown', handleKeyDown)
})

// Setup session event listeners
const setupSessionListeners = () => {
  if (!window.electronAPI) return

  // 监听会话数据
  cleanupFns.push(
    window.electronAPI.onSessionData((eventData) => {
      if (!isValidSessionEvent(eventData)) return
      const { sessionId, data } = eventData
      const tab = findTabBySessionId(sessionId)
      if (tab && terminalRefs.value[tab.id]) {
        terminalRefs.value[tab.id].write(data)
      }
    })
  )

  // 监听会话退出
  cleanupFns.push(
    window.electronAPI.onSessionExit((eventData) => {
      if (!isValidSessionEvent(eventData)) return
      const { sessionId } = eventData
      updateTabStatus(sessionId, 'exited')
    })
  )

  // 监听会话错误
  cleanupFns.push(
    window.electronAPI.onSessionError((eventData) => {
      if (!isValidSessionEvent(eventData)) return
      const { sessionId, error } = eventData
      updateTabStatus(sessionId, 'error')
      message.error(t('messages.terminalError') + ': ' + (error || 'Unknown error'))
    })
  )

  // 监听会话更新（如重命名）
  cleanupFns.push(
    window.electronAPI.onSessionUpdated((eventData) => {
      if (!isValidSessionEvent(eventData)) return
      const { sessionId, session } = eventData
      if (session) {
        updateTabTitle(sessionId, session.title || '')
      }
    })
  )

  // 监听设置变化（终端字体大小、字体类型等）
  if (window.electronAPI.onSettingsChanged) {
    cleanupFns.push(
      window.electronAPI.onSettingsChanged((settings) => {
        if (settings.terminalFontSize !== undefined) {
          terminalFontSize.value = settings.terminalFontSize
        }
        if (settings.terminalFontFamily !== undefined) {
          terminalFontFamily.value = settings.terminalFontFamily
        }
      })
    )
  }
}

// ========================================
// Project management wrapper functions
// ========================================

const selectProject = async (project) => {
  await doSelectProject(project, {
    onPathInvalid: () => message.warning(t('project.pathNotExist'))
  })
}

const handleOpenProject = async () => {
  try {
    const result = await openProject()
    if (result.canceled) return

    if (result.restored) {
      message.success(t('messages.projectRestored') + ': ' + result.name)
    } else if (result.alreadyExists) {
      message.info(t('messages.projectOpened') + ': ' + result.name)
    } else {
      message.success(t('messages.projectAdded') + ': ' + result.name)
    }
  } catch (err) {
    message.error(err.message || t('messages.operationFailed'))
  }
}

const handleContextAction = async ({ action, project }) => {
  try {
    switch (action) {
      case 'openFolder':
        await openFolder(project)
        break
      case 'pin':
        const { wasPinned } = await togglePin(project)
        message.success(wasPinned ? t('messages.projectUnpinned') : t('messages.projectPinned'))
        break
      case 'edit':
        await openEditModal(project)
        break
      case 'hide':
        await hideProject(project)
        message.success(t('messages.projectHidden'))
        break
    }
  } catch (err) {
    message.error(t('messages.operationFailed'))
  }
}

// ========================================
// Project edit modal wrapper
// ========================================

const handleProjectSave = async (updates) => {
  try {
    await saveProject(updates)
    message.success(t('messages.projectUpdated'))
  } catch (err) {
    message.error(t('messages.operationFailed'))
  }
}

// ========================================
// Tab management wrapper functions
// ========================================

const handleSelectTab = (tab) => {
  selectTab(tab, {
    onProjectSwitch: (projectId) => {
      if (projectId !== currentProject.value?.id) {
        const targetProject = projects.value.find(p => p.id === projectId)
        if (targetProject) {
          currentProject.value = targetProject
        }
      }
      // 同步左侧面板的选中状态
      if (leftPanelRef.value?.focusedSessionId !== undefined) {
        leftPanelRef.value.focusedSessionId = tab.sessionId
      }
    },
    onTerminalFocus: (focusedTab) => {
      nextTick(() => {
        if (terminalRefs.value[focusedTab.id]) {
          terminalRefs.value[focusedTab.id].fit()
        }
      })
    }
  })
}

const handleCloseTab = async (tab) => {
  await closeTab(tab)
}

// ========================================
// Session events wrapper functions
// ========================================

const onSessionCreated = (session) => {
  handleSessionCreated(session)
}

const handleSessionSelected = (session) => {
  doHandleSessionSelected(session, {
    onProjectSwitch: (projectId) => {
      if (projectId !== currentProject.value?.id) {
        const targetProject = projects.value.find(p => p.id === projectId)
        if (targetProject) {
          currentProject.value = targetProject
        }
      }
    }
  })
}

const onSessionClosed = (session) => {
  handleSessionClosed(session)
}

// Terminal ready event
const handleTerminalReady = ({ sessionId }) => {
  // 终端就绪，无需额外处理
}

// Send to terminal without executing, then focus terminal
const handleSendToTerminal = (command) => {
  const activeTab = tabs.value.find(t => t.id === activeTabId.value)
  if (!activeTab || activeTab.id === 'welcome') {
    message.warning(t('messages.noActiveTerminal'))
    return
  }

  if (window.electronAPI) {
    // 写入命令到终端（不执行）
    window.electronAPI.writeActiveSession({
      sessionId: activeTab.sessionId,
      data: command
    })
  }

  // 聚焦终端
  nextTick(() => {
    if (terminalRefs.value[activeTab.id]) {
      terminalRefs.value[activeTab.id].focus()
    }
  })
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
  background: var(--bg-color);
  color: var(--text-color);
  transition: all 0.3s ease;
  overflow: hidden;
}

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color);
}

.main-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
}

.session-name {
  font-size: 15px;
  font-weight: 600;
}

.project-path {
  font-size: 13px;
  color: var(--text-color-muted);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.main-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--bg-color);
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

.welcome-message {
  margin-bottom: 32px;
  text-align: center;
}

.welcome-message h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-color);
}

.welcome-message p {
  font-size: 14px;
  color: var(--text-color-muted);
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  background: var(--warning-bg);
  border: 1px solid #f4d03f;
  border-radius: 10px;
  margin-top: 32px;
  text-align: left;
}

.warning-icon {
  color: #f39c12;
  font-size: 20px;
  flex-shrink: 0;
}

.warning-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--warning-text);
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
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

/* Panel Collapsed Strip */
.panel-collapsed-strip {
  width: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.panel-collapsed-strip:hover {
  width: 20px;
  background: var(--hover-bg);
}

.panel-collapsed-strip .strip-icon {
  font-size: 14px;
  color: var(--text-color-muted);
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.panel-collapsed-strip:hover .strip-icon {
  opacity: 1;
  color: var(--text-color);
}

.panel-collapsed-left {
  border-right: 1px solid var(--border-color);
}

.panel-collapsed-right {
  border-left: 1px solid var(--border-color);
}
</style>

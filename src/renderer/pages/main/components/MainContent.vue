<template>
  <div class="app-container" :class="{ 'dark-theme': isDark }" :style="cssVars">
    <!-- Left Panel Collapsed Strip -->
    <div
      v-if="!showLeftPanel"
      class="panel-collapsed-strip panel-collapsed-left"
    >
      <button
        class="strip-toggle-btn"
        @click.stop="toggleBothPanels"
        :title="t('panel.toggleBoth')"
      >
        <Icon name="panelsCollapse" :size="12" />
      </button>
      <div
        class="strip-expand"
        @click="showLeftPanel = true"
        :title="t('panel.showLeft')"
      >
        <span class="strip-icon">›</span>
      </div>
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
      @terminal-created="onTerminalCreated"
      @collapse="showLeftPanel = false"
      @toggle-both-panels="toggleBothPanels"
      @mode-changed="handleModeChanged"
      @agent-created="handleAgentCreated"
      @agent-selected="handleAgentSelected"
      @agent-closed="handleAgentClosed"
    />

    <!-- Main Content Area -->
    <div class="main-content">
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
        <!-- Developer Mode Content -->
        <template v-if="isDeveloperMode">
          <!-- Welcome Page -->
          <div v-show="activeTabId === 'welcome'" class="empty-state">
            <div class="pixel-mascot"><Icon name="robot" :size="80" /></div>

            <div class="welcome-message">
              <h2>{{ t('main.welcome') }}</h2>
              <p v-if="!currentProject">{{ t('main.pleaseSelectProject') }}</p>
              <p v-else-if="!currentProject.pathValid">{{ t('project.pathNotExist') }}</p>
              <p v-else v-html="t('session.newSessionHint')"></p>
            </div>

            <div class="warning-box">
              <div class="warning-icon"><Icon name="warning" :size="20" /></div>
              <div class="warning-text">
                {{ t('main.warningText') }}
              </div>
            </div>
          </div>

          <!-- Terminal Tabs Container -->
          <div v-show="activeTabId !== 'welcome'" class="terminal-container">
            <TerminalTab
              v-for="tab in developerTabs"
              :key="tab.id"
              :ref="el => setTerminalRef(tab.id, el)"
              :session-id="tab.sessionId"
              :visible="activeTabId === tab.id"
              :font-size="terminalFontSize"
              :font-family="terminalFontFamily"
              :cursor-color="currentColors.primary"
              :dark-background="terminalDarkBackground"
              @ready="handleTerminalReady"
            />
          </div>
        </template>

        <!-- Agent Mode Content -->
        <template v-else>
          <!-- Agent Welcome -->
          <div v-show="!hasAgentTabs" class="empty-state">
            <div class="pixel-mascot"><Icon name="robot" :size="80" /></div>
            <div class="welcome-message">
              <h2>{{ t('mode.agentMode') }}</h2>
              <p>{{ t('mode.agentWelcome') }}</p>
            </div>
          </div>

          <!-- Agent Chat Tabs Container -->
          <div v-show="hasAgentTabs" class="agent-container">
            <AgentChatTab
              v-for="tab in agentTabs"
              :key="tab.id"
              :session-id="tab.sessionId"
              :visible="activeTabId === tab.id"
              @ready="handleAgentTabReady"
            />
          </div>
        </template>
      </div>
    </div>

    <!-- Right Panel -->
    <RightPanel
      v-if="showRightPanel"
      ref="rightPanelRef"
      :current-project="currentProject"
      :terminal-busy="terminalBusy"
      :current-session-uuid="currentSessionUuid"
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import { useProjects } from '@composables/useProjects'
import { useTabManagement } from '@composables/useTabManagement'
import { useAppMode } from '@composables/useAppMode'
import { isValidSessionEvent } from '@composables/useValidation'
import LeftPanel from './LeftPanel.vue'
import RightPanel from './RightPanel/index.vue'
import TabBar from './TabBar.vue'
import TerminalTab from './TerminalTab.vue'
import AgentChatTab from './AgentChatTab.vue'
import ProjectEditModal from './ProjectEditModal.vue'
import Icon from '@components/icons/Icon.vue'

const message = useMessage()
const dialog = useDialog()
const { isDark, cssVars, toggleTheme, currentColors } = useTheme()
const { t, initLocale } = useLocale()
const { isDeveloperMode, isAgentMode, initMode } = useAppMode()

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
  allTabs,  // 所有 TerminalTab 组件（包括后台的）
  activeTabId,
  ensureSessionTab,
  selectTab,
  closeTab,
  handleSessionCreated,
  handleSessionSelected: doHandleSessionSelected,
  handleSessionClosed,
  updateTabStatus,
  updateTabTitle,
  findTabBySessionId,
  ensureAgentTab,
  closeAgentTab
} = useTabManagement()

// Computed: 按模式过滤 Tabs
const developerTabs = computed(() => allTabs.value.filter(t => t.type !== 'agent-chat'))
const agentTabs = computed(() => allTabs.value.filter(t => t.type === 'agent-chat'))
const hasAgentTabs = computed(() => agentTabs.value.length > 0)

// 各模式最后的 activeTabId，切换模式时保存/恢复
let lastDeveloperTabId = 'welcome'
let lastAgentTabId = 'welcome'

// Refs
const leftPanelRef = ref(null)
const rightPanelRef = ref(null)
const terminalRefs = ref({})
const terminalFontSize = ref(14)
const terminalFontFamily = ref('"Ubuntu Mono", monospace')
const terminalDarkBackground = ref(true)
const terminalBusy = ref(false)
const currentSessionUuid = ref('')

// 当前活动会话的 sessionUuid（用于消息队列等功能）
const updateCurrentSessionUuid = async () => {
  if (activeTabId.value === 'welcome') {
    currentSessionUuid.value = ''
    return
  }
  const activeTab = tabs.value.find(t => t.id === activeTabId.value)
  if (!activeTab) {
    currentSessionUuid.value = ''
    return
  }
  try {
    const session = await window.electronAPI.getActiveSession(activeTab.sessionId)
    currentSessionUuid.value = session?.resumeSessionId || ''
  } catch (err) {
    console.error('Failed to get session uuid:', err)
    currentSessionUuid.value = ''
  }
}

// 监听 activeTabId 变化
watch(activeTabId, updateCurrentSessionUuid, { immediate: true })

// Panel visibility
const showLeftPanel = ref(true)
const showRightPanel = ref(true)  // 默认显示右侧面板

// 一键切换两侧面板
const toggleBothPanels = () => {
  const bothVisible = showLeftPanel.value && showRightPanel.value
  showLeftPanel.value = !bothVisible
  showRightPanel.value = !bothVisible
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
  await initMode()
  await loadProjects()
  selectFirstProject()
  setupSessionListeners()
  window.addEventListener('keydown', handleKeyDown)

  // Load terminal settings
  try {
    const terminalSettings = await window.electronAPI.getTerminalSettings()
    terminalFontSize.value = terminalSettings?.fontSize || 14
    terminalFontFamily.value = terminalSettings?.fontFamily || 'Consolas, monospace'
    terminalDarkBackground.value = terminalSettings?.darkBackground !== false
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

  // 监听会话更新（如重命名、UUID关联）
  cleanupFns.push(
    window.electronAPI.onSessionUpdated((eventData) => {
      if (!isValidSessionEvent(eventData)) return
      const { sessionId, session } = eventData
      if (session) {
        updateTabTitle(sessionId, session.title || '')
        // 如果当前活动会话的 UUID 被更新，刷新 currentSessionUuid
        const activeTab = tabs.value.find(t => t.id === activeTabId.value)
        if (activeTab && activeTab.sessionId === sessionId && session.resumeSessionId) {
          currentSessionUuid.value = session.resumeSessionId
        }
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
        if (settings.terminalDarkBackground !== undefined) {
          terminalDarkBackground.value = settings.terminalDarkBackground
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

    // 检查是否有路径不支持的错误
    if (result.error && result.errorType === 'unsupportedPath') {
      message.error(
        t('project.unsupportedPathError', { name: result.folderName }) ||
        `项目文件夹名称 "${result.folderName}" 包含下划线(_)或连字符(-)，会导致会话同步问题。请重命名文件夹后再添加。`
      )
      return
    }

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
    const result = await saveProject(updates)

    if (result.success) {
      // 如果 API 配置变更被阻止（有运行中的会话），弹出提示
      if (result.apiProfileBlocked) {
        dialog.warning({
          title: t('project.apiProfileBlockedTitle') || 'API 配置未修改',
          content: t('project.apiProfileBlockedContent') || '运行中的历史会话，不能修改 API 配置，可能会导致签名错误，无法持续！如需修改，请在启动新会话之前修改 API 配置！',
          positiveText: t('common.ok') || '知道了'
        })
      } else {
        message.success(t('messages.projectUpdated'))
      }
    }
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
  if (tab.type === 'agent-chat') {
    closeAgentTab(tab)
  } else {
    await closeTab(tab)
  }
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

// 终端创建事件（纯终端，不启动 claude）
const onTerminalCreated = (session) => {
  // 复用会话创建逻辑，终端也是一种会话（type='terminal'）
  handleSessionCreated(session)
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

// Mode changed handler：保存当前模式的 tabId，恢复目标模式的 tabId
const handleModeChanged = (mode) => {
  if (mode === 'developer') {
    // 切到开发者模式：保存 agent tab，恢复 developer tab
    lastAgentTabId = activeTabId.value
    activeTabId.value = lastDeveloperTabId
    // 验证恢复的 tab 是否仍存在
    if (lastDeveloperTabId !== 'welcome' && !tabs.value.find(t => t.id === lastDeveloperTabId)) {
      const lastDev = developerTabs.value[developerTabs.value.length - 1]
      activeTabId.value = lastDev ? lastDev.id : 'welcome'
    }
  } else {
    // 切到 agent 模式：保存 developer tab，恢复 agent tab
    lastDeveloperTabId = activeTabId.value
    activeTabId.value = lastAgentTabId
    // 验证恢复的 tab 是否仍存在
    if (lastAgentTabId !== 'welcome' && !tabs.value.find(t => t.id === lastAgentTabId)) {
      const lastAgent = agentTabs.value[agentTabs.value.length - 1]
      activeTabId.value = lastAgent ? lastAgent.id : 'welcome'
    }
  }
}

// ========================================
// Agent event handlers
// ========================================

const handleAgentCreated = (session) => {
  const tab = ensureAgentTab(session)
  if (tab) {
    activeTabId.value = tab.id
  }
}

const handleAgentSelected = (conv) => {
  const tab = ensureAgentTab(conv)
  if (tab) {
    activeTabId.value = tab.id
  }
}

const handleAgentClosed = (conv) => {
  const tab = allTabs.value.find(t => t.id === `agent-${conv.id}`)
  if (tab) {
    closeAgentTab(tab)
  }
}

const handleAgentTabReady = ({ sessionId }) => {
  // Agent tab 就绪
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

.main-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--bg-color);
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  margin-bottom: 8px;
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
  margin-bottom: 32px;
  animation: float 3s ease-in-out infinite;
  color: var(--primary-color);
  opacity: 0.8;
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
  border: 1px solid var(--primary-color);
  border-radius: 10px;
  margin-top: 32px;
  text-align: left;
}

.warning-icon {
  color: var(--primary-color);
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

/* Agent Container */
.agent-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
  width: 20px;
  display: flex;
  flex-direction: column;
  background: var(--bg-color-secondary);
  flex-shrink: 0;
}

.strip-toggle-btn {
  width: 20px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.strip-toggle-btn:hover {
  opacity: 1;
  background: var(--hover-bg);
}

.strip-expand {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}

.strip-expand:hover {
  background: var(--hover-bg);
}

.panel-collapsed-strip .strip-icon {
  font-size: 14px;
  color: var(--primary-color);
  font-weight: bold;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}

.strip-expand:hover .strip-icon {
  opacity: 1;
}

.panel-collapsed-left {
  border-right: 1px solid var(--border-color);
}

.panel-collapsed-right {
  border-left: 1px solid var(--border-color);
}
</style>

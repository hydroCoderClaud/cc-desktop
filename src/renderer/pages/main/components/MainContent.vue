<template>
  <div class="app-container" :class="{ 'dark-theme': isDark }" :style="cssVars">
    <!-- Left Panel Collapsed Strip -->
    <div
      v-if="!showLeftPanel && !isNotebookMode"
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
      v-if="showLeftPanel && !isNotebookMode"
      ref="leftPanelRef"
      :projects="projects"
      :current-project="currentProject"
      :agent-cwd="activeAgentCwd"
      :agent-session-id="activeAgentSessionId"
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
      @agent-created="handleAgentCreated"
      @agent-selected="handleAgentSelected"
      @agent-closed="handleAgentClosed"
      @agent-profile-updated="handleAgentProfileUpdated"
    />

    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Tab Bar -->
      <TabBar
        v-if="!isNotebookMode"
        :tabs="currentModeTabs"
        :active-tab-id="activeTabId"
        :current-project="currentProject"
        :show-new-button="false"
        @select-tab="handleSelectTab"
        @close-tab="handleCloseTab"
      />

      <!-- Main Area -->
      <div class="main-area" :class="{ 'notebook-main-area': isNotebookMode }">
        <!-- Developer Mode Content (v-show 保持组件活跃，避免终端 buffer 丢失) -->
        <div v-show="isDeveloperMode" class="mode-content">
          <!-- Welcome Page -->
          <div v-show="activeTabId === 'welcome'" class="empty-state">
            <div class="pixel-mascot"><Icon name="robot" :size="72" /></div>

            <div class="welcome-message">
              <h2>{{ t('main.developerWelcome') }}</h2>
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
        </div>

        <!-- Agent Mode Content (v-show 保持组件活跃，避免 IPC 监听丢失和重复加载) -->
        <div v-show="!isDeveloperMode && !isNotebookMode" class="mode-content">
          <!-- Agent Welcome -->
          <div v-show="!hasAgentTabs || activeTabId === 'welcome'" class="empty-state">
            <div class="pixel-mascot"><Icon name="robot" :size="72" /></div>
            <div class="welcome-message">
              <h2>{{ t('mode.agentMode') }}</h2>
              <p>{{ t('mode.agentWelcome') }}</p>
            </div>
          </div>

          <!-- Agent Chat Tabs Container -->
          <div v-show="hasAgentTabs && activeTabId !== 'welcome'" class="agent-container">
            <AgentChatTab
              v-for="tab in agentTabs"
              :key="tab.id"
              :ref="el => { if (el) agentChatTabRefs[tab.id] = el }"
              :session-id="tab.sessionId"
              :session-type="tab.sessionType"
              :session-cwd="tab.cwd"
              :api-profile-id="tab.apiProfileId"
              :model-id="tab.modelId"
              :visible="activeTabId === tab.id"
              @ready="handleAgentTabReady"
              @request-clear-session="handleAgentClearSession(tab.sessionId)"
              @preview-image="handlePreviewImage"
              @preview-link="handlePreviewLink"
              @preview-path="handlePreviewPath"
              @agent-done="handleAgentDone"
            />
          </div>
        </div>

        <!-- Notebook Mode Content -->
        <div v-show="isNotebookMode" class="mode-content notebook-mode-content">
          <NotebookWorkspace />
        </div>
      </div>
    </div>

    <!-- Resize Handle -->
    <div
      v-if="showRightPanel && !isNotebookMode"
      class="resize-handle"
      @mousedown="startResize"
      :title="t('panel.dragToResize')"
    />

    <!-- Right Panel: Developer 模式用配置面板，Agent 模式用文件浏览面板 -->
    <template v-if="showRightPanel && !isNotebookMode">
      <RightPanel
        v-show="isDeveloperMode"
        ref="rightPanelRef"
        :style="{ width: rightPanelWidth }"
        :current-project="currentProject"
        :terminal-busy="terminalBusy"
        :current-session-uuid="currentSessionUuid"
        @collapse="showRightPanel = false"
        @send-to-terminal="handleSendToTerminal"
      />
      <AgentRightPanel
        v-show="!isDeveloperMode"
        ref="agentRightPanelRef"
        :style="{ width: rightPanelWidth }"
        :session-id="activeAgentSessionId"
        @collapse="showRightPanel = false"
        @insert-path="handleInsertPath"
      />
    </template>

    <!-- Right Panel Collapsed Strip -->
    <div
      v-if="!showRightPanel && !isNotebookMode"
      class="panel-collapsed-strip panel-collapsed-right"
      @click="showRightPanel = true"
      :title="t('panel.showRight')"
    >
      <div class="strip-expand">
        <span class="strip-icon">‹</span>
      </div>
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
import { useAppMode, AppMode } from '@composables/useAppMode'
import { useIPC } from '@composables/useIPC'
import { isValidSessionEvent } from '@composables/useValidation'
import LeftPanel from './LeftPanel.vue'
import RightPanel from './RightPanel/index.vue'
import AgentRightPanel from './AgentRightPanel/index.vue'
import TabBar from './TabBar.vue'
import TerminalTab from './TerminalTab.vue'
import AgentChatTab from './AgentChatTab.vue'
import ProjectEditModal from './ProjectEditModal.vue'
import Icon from '@components/icons/Icon.vue'
import NotebookWorkspace from '@/pages/notebook/components/NotebookWorkspace.vue'

const message = useMessage()
const dialog = useDialog()
const { isDark, cssVars, toggleTheme, currentColors } = useTheme()
const { t, initLocale } = useLocale()
const { invoke } = useIPC()
const { isDeveloperMode, isAgentMode, isNotebookMode, appMode, initMode, switchMode } = useAppMode()

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
  closeAgentTab,
  closeAgentTabFully
} = useTabManagement()

// Computed: 按模式过滤
const developerTabs = computed(() => allTabs.value.filter(t => t.type !== 'agent-chat'))
const agentTabs = computed(() => allTabs.value.filter(t => t.type === 'agent-chat'))
const hasAgentTabs = computed(() => agentTabs.value.length > 0)

// TabBar 只显示当前模式的 tabs（隔离三种模式，防止跨模式误操作）
const currentModeTabs = computed(() => {
  if (isDeveloperMode.value) {
    return tabs.value.filter(t => t.type !== 'agent-chat')
  }
  if (isAgentMode.value) {
    return tabs.value.filter(t => t.type === 'agent-chat')
  }
  return []
})

// Agent 模式下当前活动会话的 sessionId（用于 AgentRightPanel）
const activeAgentSessionId = computed(() => {
  if (!isAgentMode.value || activeTabId.value === 'welcome') return null
  const tab = allTabs.value.find(t => t.id === activeTabId.value)
  return (tab?.type === 'agent-chat') ? tab.sessionId : null
})

// Agent 模式下当前活动会话的工作目录（用于 MCP 启闭）
const activeAgentCwd = computed(() => {
  if (!isAgentMode.value || activeTabId.value === 'welcome') return null
  const tab = allTabs.value.find(t => t.id === activeTabId.value)
  return (tab?.type === 'agent-chat') ? (tab.cwd || null) : null
})

// 计算当前活动的目录（Agent会话优先使用cwd，否则使用当前项目路径）
const activeTabCwd = computed(() => {
  if (activeTabId.value === 'welcome') return currentProject.value?.path || null
  const tab = allTabs.value.find(t => t.id === activeTabId.value)
  if (tab?.type === 'agent-chat' && tab.cwd) return tab.cwd
  return currentProject.value?.path || null
})

// 各模式最后的 activeTabId，切换模式时保存/恢复
let lastDeveloperTabId = 'welcome'
let lastAgentTabId = 'welcome'
let lastMode = AppMode.DEVELOPER

/**
 * 确保 activeTabId 指向当前模式内的 tab
 * 所有可能改变 activeTabId 的操作后调用（关闭 tab、切换模式、会话关闭等）
 */
const ensureActiveTabInCurrentMode = () => {
  if (activeTabId.value === 'welcome') return
  const tab = allTabs.value.find(t => t.id === activeTabId.value)
  if (!tab) {
    activeTabId.value = 'welcome'
    return
  }
  const isAgentTab = tab.type === 'agent-chat'
  if (isDeveloperMode.value && isAgentTab) {
    const devTabs = tabs.value.filter(t => t.type !== 'agent-chat')
    activeTabId.value = devTabs.length > 0 ? devTabs[devTabs.length - 1].id : 'welcome'
  } else if (isAgentMode.value && !isAgentTab) {
    const agTabs = tabs.value.filter(t => t.type === 'agent-chat')
    activeTabId.value = agTabs.length > 0 ? agTabs[agTabs.length - 1].id : 'welcome'
  } else if (isNotebookMode.value) {
    activeTabId.value = 'welcome'
  }
}

// Refs
const leftPanelRef = ref(null)
const rightPanelRef = ref(null)
const agentRightPanelRef = ref(null)
const agentChatTabRefs = ref({})
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

// 监听 activeTabId 变化，同步左侧列表焦点
watch(activeTabId, (newTabId) => {
  if (!newTabId || newTabId === 'welcome') return
  const tab = allTabs.value.find(t => t.id === newTabId)
  if (!tab) return

  // 更新 currentProject，以便 RightPanel (FilesTab) 能随当前会话切换
  if (tab.projectId && tab.projectId !== currentProject.value?.id) {
    const targetProject = projects.value.find(p => p.id === tab.projectId)
    if (targetProject) {
      currentProject.value = targetProject
    }
  } else if (tab.type === 'agent-chat' && tab.cwd && tab.cwd !== currentProject.value?.path) {
    const targetProject = projects.value.find(p => p.path === tab.cwd)
    if (targetProject) {
      currentProject.value = targetProject
    }
  }

  // 同步左侧面板焦点（按 tab 类型区分）
  if (tab.type === 'agent-chat') {
    if (leftPanelRef.value?.activeAgentSessionId !== undefined) {
      leftPanelRef.value.activeAgentSessionId = tab.sessionId
    }
  } else {
    if (leftPanelRef.value?.focusedSessionId !== undefined) {
      leftPanelRef.value.focusedSessionId = tab.sessionId
    }
  }
})

// Panel visibility
const showLeftPanel = ref(true)
const showRightPanel = ref(true)  // 默认显示右侧面板
let leftPanelVisibleBeforeNotebook = true

// 一键切换两侧面板
const toggleBothPanels = () => {
  const bothVisible = showLeftPanel.value && showRightPanel.value
  showLeftPanel.value = !bothVisible
  showRightPanel.value = !bothVisible
}

// ========================================
// Right Panel Resize
// ========================================
const rightPanelWidth = ref('25%')  // 默认 25%（最小宽度，用户可拖动调整）
const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

// 加载保存的宽度配置
const loadRightPanelWidth = async () => {
  try {
    const config = await window.electronAPI.getConfig()
    const savedWidth = config?.ui?.rightPanelWidth
    if (savedWidth) {
      rightPanelWidth.value = savedWidth
    }
  } catch (err) {
    console.error('Failed to load right panel width:', err)
  }
}

// 保存宽度配置
const saveRightPanelWidth = async (width) => {
  try {
    await window.electronAPI.saveConfig({
      ui: { rightPanelWidth: width }
    })
  } catch (err) {
    console.error('Failed to save right panel width:', err)
  }
}

// 开始拖动
const startResize = (e) => {
  isResizing.value = true
  startX.value = e.clientX

  // 获取当前宽度（百分比转像素）
  const containerWidth = document.querySelector('.app-container').offsetWidth
  const currentPercent = parseFloat(rightPanelWidth.value)
  startWidth.value = (containerWidth * currentPercent) / 100

  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// 拖动中
const handleResize = (e) => {
  if (!isResizing.value) return

  const containerWidth = document.querySelector('.app-container').offsetWidth
  const deltaX = startX.value - e.clientX  // 向左拖动为正，向右拖动为负
  const newWidth = startWidth.value + deltaX

  // 转换为百分比
  let newPercent = (newWidth / containerWidth) * 100

  // 限制范围：20% ~ 50%
  newPercent = Math.max(20, Math.min(50, newPercent))

  rightPanelWidth.value = `${newPercent.toFixed(1)}%`
}

// 停止拖动
const stopResize = async () => {
  if (!isResizing.value) return

  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''

  // 保存配置
  await saveRightPanelWidth(rightPanelWidth.value)
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
  loadRightPanelWidth()  // 加载右侧面板宽度配置
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

  // 监听 Agent 会话重命名 → 同步更新 Tab 标题
  if (window.electronAPI.onAgentRenamed) {
    cleanupFns.push(
      window.electronAPI.onAgentRenamed((data) => {
        if (data?.sessionId && data?.title) {
          updateTabTitle(data.sessionId, data.title)
        }
      })
    )
  }

  // 钉钉会话关闭时，关闭对应 Tab
  if (window.electronAPI?.onDingTalkSessionClosed) {
    cleanupFns.push(
      window.electronAPI.onDingTalkSessionClosed((data) => {
        if (data?.sessionId) {
          handleSessionClosed({ id: data.sessionId })
          ensureActiveTabInCurrentMode()
        }
      })
    )
  }

  // Agent CLI 进程退出时，关闭对应 Tab
  if (window.electronAPI?.onAgentStatusChange) {
    cleanupFns.push(
      window.electronAPI.onAgentStatusChange((data) => {
        if (data?.sessionId && data?.cliExited) {
          console.log(`[MainContent] CLI exited for session ${data.sessionId}, closing tab`)
          const tab = allTabs.value.find(t => t.sessionId === data.sessionId && t.type === 'agent-chat')
          if (tab) {
            closeAgentTabFully(tab)
            ensureActiveTabInCurrentMode()
          }
        }
      })
    )
  }

  // 钉钉会话创建时，自动切换到 Agent 模式并打开 Tab
  if (window.electronAPI.onDingTalkSessionCreated) {
    cleanupFns.push(
      window.electronAPI.onDingTalkSessionCreated(async (data) => {
        if (data?.sessionId) {
          // 如果当前在 Developer 模式，自动切换到 Agent 模式
          if (isDeveloperMode.value) {
            await switchMode(AppMode.AGENT)
          }
          const tab = ensureAgentTab({
            id: data.sessionId,
            type: 'dingtalk',
            title: data.title || (data.nickname ? `钉钉 · ${data.nickname}` : 'DingTalk'),
          })
          if (tab) {
            activeTabId.value = tab.id
          }
        }
      })
    )
  }

  if (window.electronAPI.onWeixinSessionCreated) {
    cleanupFns.push(
      window.electronAPI.onWeixinSessionCreated(async (data) => {
        if (data?.sessionId) {
          if (isDeveloperMode.value) {
            await switchMode(AppMode.AGENT)
          }
          const tab = ensureAgentTab({
            id: data.sessionId,
            type: 'weixin',
            title: data.title || (data.senderNick ? `微信 · ${data.senderNick}` : '微信'),
          })
          if (tab) {
            activeTabId.value = tab.id
          }
        }
      })
    )
  }

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

    // 路径包含可能导致同步问题的字符时，弹确认对话框（后端未创建记录）
    if (result.pathWarning) {
      dialog.warning({
        title: t('project.pathWarningTitle'),
        content: t('project.pathWarningContent', { path: result.path }),
        positiveText: t('project.pathWarningContinue'),
        negativeText: t('project.pathWarningCancel'),
        onPositiveClick: async () => {
          // 用户确认风险
          try {
            if (result.alreadyExists && result.existingId) {
              // 已存在的项目（可能是隐藏的）：恢复显示
              await invoke('unhideProject', result.existingId)
            } else {
              // 新项目：创建记录（skipPathCheck 绕过二次检测）
              await invoke('createProject', { path: result.path, name: result.name, skipPathCheck: true })
            }
            await loadProjects()
            message.success(t('messages.projectAdded') + ': ' + result.name)
          } catch (err) {
            message.error(err.message || t('messages.operationFailed'))
          }
        }
        // 取消：无需处理，后端本来就没创建记录
      })
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
    },
    onTerminalFocus: (focusedTab) => {
      nextTick(() => {
        if (terminalRefs.value[focusedTab.id]) {
          terminalRefs.value[focusedTab.id].fit()
        }
      })
    }
  })

  // 同步左侧面板焦点（按 tab 类型区分）
  if (tab.id === 'welcome') return
  if (tab.type === 'agent-chat') {
    if (leftPanelRef.value?.activeAgentSessionId !== undefined) {
      leftPanelRef.value.activeAgentSessionId = tab.sessionId
    }
  } else {
    if (leftPanelRef.value?.focusedSessionId !== undefined) {
      leftPanelRef.value.focusedSessionId = tab.sessionId
    }
  }
}

const handleCloseTab = async (tab) => {
  if (tab.type === 'agent-chat') {
    closeAgentTab(tab)
  } else {
    await closeTab(tab)
  }
  // closeTab/closeAgentTab 的 fallback 从混合 tabs 选，可能选到跨模式 tab
  ensureActiveTabInCurrentMode()
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
  ensureActiveTabInCurrentMode()
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

// 模式切换：保存当前模式 tab 并恢复目标模式 tab
watch(appMode, (mode) => {
  if (mode === lastMode) return

  if (lastMode === AppMode.DEVELOPER) {
    lastDeveloperTabId = activeTabId.value
  } else if (lastMode === AppMode.AGENT) {
    lastAgentTabId = activeTabId.value
  }

  if (mode === AppMode.DEVELOPER) {
    activeTabId.value = lastDeveloperTabId
    showLeftPanel.value = leftPanelVisibleBeforeNotebook
    showRightPanel.value = true
  } else if (mode === AppMode.AGENT) {
    activeTabId.value = lastAgentTabId
    showLeftPanel.value = leftPanelVisibleBeforeNotebook
    showRightPanel.value = true
  } else if (mode === AppMode.NOTEBOOK) {
    leftPanelVisibleBeforeNotebook = showLeftPanel.value
    activeTabId.value = 'welcome'
    showLeftPanel.value = false
    showRightPanel.value = false
  }

  lastMode = mode
  ensureActiveTabInCurrentMode()
})

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
  if (!tab) return

  closeAgentTabFully(tab)
  ensureActiveTabInCurrentMode()
}

const handleAgentProfileUpdated = ({ sessionId, apiProfileId, modelId }) => {
  if (!sessionId) return
  const tab = allTabs.value.find(item => item.sessionId === sessionId && item.type === 'agent-chat')
  if (!tab) return
  tab.apiProfileId = apiProfileId || null
  tab.modelId = modelId || null
}

const handleAgentTabReady = ({ sessionId }) => {
  // Agent tab 就绪
}

const handleAgentClearSession = async (sessionId) => {
  if (!sessionId || !window.electronAPI?.clearAndRecreateAgentSession) return

  try {
    const result = await window.electronAPI.clearAndRecreateAgentSession({ sessionId })
    if (!result?.success || !result.session) {
      throw new Error(result?.error || 'Failed to recreate session')
    }

    const oldTab = allTabs.value.find(t => t.sessionId === sessionId && t.type === 'agent-chat')
    if (oldTab) {
      closeAgentTabFully(oldTab)
    }

    const newTab = ensureAgentTab(result.session)
    if (newTab) {
      activeTabId.value = newTab.id
    }

    if (leftPanelRef.value?.activeAgentSessionId !== undefined) {
      leftPanelRef.value.activeAgentSessionId = result.session.id
    }

    await leftPanelRef.value?.reloadAgentConversations?.()
  } catch (err) {
    console.error('[MainContent] Failed to clear agent session:', err)
    message.error(t('messages.operationFailed') + ': ' + err.message)
  }
}

// 处理路径插入请求（Ctrl+点击文件）
const handleInsertPath = (relativePath) => {
  if (!activeTabId.value) return

  if (isDeveloperMode.value) {
    if (rightPanelRef.value && rightPanelRef.value.insertToInput) {
      rightPanelRef.value.insertToInput(relativePath)
    }
  } else if (isAgentMode.value) {
    const activeTabRef = agentChatTabRefs.value[activeTabId.value]
    if (activeTabRef && activeTabRef.insertText) {
      activeTabRef.insertText(relativePath + '\n')
    }
  }
}

// 处理图片预览请求
const handlePreviewImage = (previewData) => {
  // 确保右侧面板可见
  if (!showRightPanel.value) {
    showRightPanel.value = true
  }

  // 调用 AgentRightPanel 的预览方法并刷新文件树
  nextTick(() => {
    if (agentRightPanelRef.value) {
      if (agentRightPanelRef.value.previewImage) {
        agentRightPanelRef.value.previewImage(previewData)
      }
      if (agentRightPanelRef.value.refreshFiles) {
        agentRightPanelRef.value.refreshFiles()
      }
    }
  })
}

// 处理链接预览请求（URL）
const handlePreviewLink = (linkData) => {
  // 确保右侧面板可见
  if (!showRightPanel.value) {
    showRightPanel.value = true
  }

  // 调用 AgentRightPanel 的预览方法
  nextTick(() => {
    if (agentRightPanelRef.value && agentRightPanelRef.value.previewImage) {
      agentRightPanelRef.value.previewImage(linkData)
    }
  })
}

// 处理文件路径预览请求（仅响应当前激活会话，避免跨会话串台）
const handlePreviewPath = async (payload) => {
  const filePath = typeof payload === 'string' ? payload : payload?.filePath
  const sourceSessionId = typeof payload === 'string' ? activeAgentSessionId.value : payload?.sessionId

  if (!filePath || !sourceSessionId) return
  if (sourceSessionId !== activeAgentSessionId.value) return

  // 请求后端读取文件（只读预览，直接 confirmed=true，不弹安全确认框）
  try {
    const fileData = await window.electronAPI.readAbsolutePath({
      filePath,
      sessionId: sourceSessionId,
      confirmed: true
    })

    // 检查错误
    if (fileData.error) {
      message.error(fileData.error)
      return
    }

    // 如果是目录，直接打开文件夹
    const effectivePath = fileData.path || fileData.filePath || filePath

    if (fileData.type === 'directory') {
      await window.electronAPI.openPath(effectivePath)
      return
    }

    // 如果是文件，确保右侧面板可见并预览
    if (!showRightPanel.value) {
      showRightPanel.value = true
    }

    // 调用 AgentRightPanel 展示预览
    nextTick(async () => {
      if (!agentRightPanelRef.value) return
      // 优先尝试在文件树中定位（仅对 cwd 内的文件有效）
      const revealed = await agentRightPanelRef.value.revealInTree?.(effectivePath, { preview: true })
      // 如果文件不在 cwd 内（revealInTree 返回 false/undefined），直接展示预览
      if (!revealed) {
        agentRightPanelRef.value.previewImage?.({ ...fileData, isExternalFile: true })
      }
    })
  } catch (err) {
    console.error('Failed to preview file:', err)
    message.error(t('agent.files.errorLoading'))
  }
}

// Agent 完成：仅当前激活会话刷新文件树，并自动预览本轮最后一个文件
const handleAgentDone = async (payload = {}) => {
  const sourceSessionId = payload?.sessionId
  const filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths : []

  if (!sourceSessionId) return
  if (sourceSessionId !== activeAgentSessionId.value) return
  if (!agentRightPanelRef.value) return

  await agentRightPanelRef.value.refreshFiles()
  if (!filePaths.length) return

  for (let i = 0; i < filePaths.length; i++) {
    const isLast = i === filePaths.length - 1
    const revealed = await agentRightPanelRef.value.revealInTree(filePaths[i], { preview: isLast })
    // 如果文件不在 cwd 内（revealInTree 返回 false），且是最后一个，通过 handlePreviewPath 展示
    if (!revealed && isLast) {
      await handlePreviewPath({ filePath: filePaths[i], sessionId: sourceSessionId })
    }
  }
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
  box-sizing: border-box;
  padding: 10px 12px 12px;
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
  padding: 0;
  margin: 0 8px;
}

.main-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-top: none;
  border-radius: 0 0 var(--panel-radius) var(--panel-radius);
  box-shadow: none;
  margin-bottom: 0;
}

.notebook-main-area {
  border: none;
  border-radius: 0;
  margin-bottom: 0;
}

/* Empty State */
.empty-state {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 460px;
  width: calc(100% - 72px);
  text-align: center;
}

.pixel-mascot {
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
  color: var(--primary-color);
  opacity: 0.72;
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

.welcome-message {
  margin-bottom: 24px;
  text-align: center;
}

.welcome-message h2 {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--text-color);
}

.welcome-message p {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-color-muted);
  max-width: 420px;
  margin: 0 auto;
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  background: var(--warning-bg);
  border: 1px solid var(--border-color-light);
  border-radius: var(--panel-radius);
  margin-top: 24px;
  text-align: left;
}

.warning-icon {
  color: var(--warning-color);
  font-size: 20px;
  flex-shrink: 0;
}

.warning-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color-secondary);
}

/* Mode Content Wrapper (v-show 切换，保持子组件活跃) */
.mode-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.notebook-mode-content {
  background: var(--bg-color);
}

.notebook-mode-content :deep(.notebook-workspace) {
  height: 100%;
}

.notebook-mode-content :deep(.panels-container) {
  padding: 0 12px 12px;
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
  justify-content: center;
}

/* Resize Handle */
.resize-handle {
  width: 1px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
}

.resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  left: -2px;
  right: -2px;
  bottom: 0;
  /* 扩大点击区域，方便拖动 */
}
</style>

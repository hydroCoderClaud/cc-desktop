/**
 * Tab 管理组合式函数
 * 管理终端 Tab 的创建、切换、关闭等操作
 */
import { ref, computed } from 'vue'
import { useIPC } from './useIPC'
import { createTabFromSession, findTabBySessionId, removeTabAndGetNextActive } from './useSessionUtils'
import { isValidSession } from './useValidation'

export function useTabManagement() {
  const { invoke } = useIPC()

  // State
  const tabs = ref([])  // TabBar 中显示的 tabs（用户可见的）
  const allTabs = ref([])  // 所有 TerminalTab 组件（包括后台的，保持缓冲区数据）
  const activeTabId = ref('welcome')  // 默认显示欢迎页

  /**
   * 当前活动的 Tab
   */
  const activeTab = computed(() => {
    if (activeTabId.value === 'welcome') return null
    return tabs.value.find(t => t.id === activeTabId.value) || null
  })

  /**
   * 终端 Tab 数量（不含欢迎页）
   */
  const terminalTabCount = computed(() => tabs.value.length)

  /**
   * 是否在欢迎页
   */
  const isWelcomePage = computed(() => activeTabId.value === 'welcome')

  /**
   * 添加会话 Tab
   * @param {Object} session - 会话对象
   * @param {Object} project - 项目对象
   * @returns {Object} 新创建的 Tab
   */
  const addSessionTab = (session, project) => {
    const newTab = createTabFromSession(session, project)
    tabs.value.push(newTab)
    activeTabId.value = newTab.id
    return newTab
  }

  /**
   * 确保会话有对应的 Tab（如果没有则创建）
   * @param {Object} session - 会话对象
   * @returns {Object} Tab 对象
   */
  const ensureSessionTab = (session) => {
    // 先在 allTabs 中查找（保持终端缓冲区的 tabs）
    const existingTab = findTabBySessionId(allTabs.value, session.id)
    if (existingTab) {
      activeTabId.value = existingTab.id

      // 如果不在 tabs 中（TabBar 显示），添加回去
      if (!tabs.value.find(t => t.id === existingTab.id)) {
        tabs.value.push(existingTab)
      }

      // 重要：通知后端该会话被聚焦（设置 visible=true）
      if (window.electronAPI) {
        window.electronAPI.focusActiveSession(session.id)
      }

      return existingTab
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

    // 同时添加到两个数组
    tabs.value.push(newTab)
    allTabs.value.push(newTab)
    activeTabId.value = newTab.id

    // 通知后端聚焦该会话
    if (window.electronAPI) {
      window.electronAPI.focusActiveSession(session.id)
    }

    return newTab
  }

  /**
   * 选择 Tab
   * @param {Object} tab - Tab 对象
   * @param {Object} options - 选项
   * @param {Function} options.onProjectSwitch - 项目切换时的回调
   * @param {Function} options.onTerminalFocus - 终端聚焦时的回调
   */
  const selectTab = (tab, options = {}) => {
    activeTabId.value = tab.id

    // Welcome tab 不需要后续处理
    if (tab.id === 'welcome') {
      return
    }

    // 如果需要切换项目
    if (options.onProjectSwitch) {
      options.onProjectSwitch(tab.projectId)
    }

    // 通知后端聚焦该会话
    if (window.electronAPI) {
      window.electronAPI.focusActiveSession(tab.sessionId)
    }

    // 终端聚焦回调
    if (options.onTerminalFocus) {
      options.onTerminalFocus(tab)
    }
  }

  /**
   * 关闭 Tab
   * @param {Object} tab - Tab 对象
   */
  const closeTab = async (tab) => {
    // 断开连接（会话在后台继续运行）
    try {
      await invoke('disconnectActiveSession', tab.sessionId)
    } catch (err) {
      console.error('Failed to disconnect session:', err)
    }

    // 从 TabBar 的 tabs 数组中删除（UI 上移除 Tab）
    const index = tabs.value.findIndex(t => t.id === tab.id)
    if (index !== -1) {
      tabs.value.splice(index, 1)
    }

    // 但保留在 allTabs 中，这样 TerminalTab 组件和缓冲区数据不会丢失

    // 如果关闭的是当前活动 tab，切换到其他 tab
    if (activeTabId.value === tab.id) {
      if (tabs.value.length > 0) {
        // 切换到剩余 tabs 中的最后一个
        activeTabId.value = tabs.value[tabs.value.length - 1].id
      } else {
        // 没有其他 tabs 了，显示欢迎页
        activeTabId.value = 'welcome'
      }
    }
  }

  /**
   * 关闭会话的 Tab（通过 sessionId）
   * @param {string} sessionId - 会话 ID
   */
  const closeTabBySessionId = async (sessionId) => {
    const tab = findTabBySessionId(tabs.value, sessionId)
    if (tab) {
      await closeTab(tab)
    }
  }

  /**
   * 处理会话创建事件
   * @param {Object} session - 会话对象
   */
  const handleSessionCreated = (session) => {
    if (!isValidSession(session)) return
    ensureSessionTab(session)
  }

  /**
   * 处理会话选中事件
   * @param {Object} session - 会话对象
   * @param {Object} options - 选项
   * @param {Function} options.onProjectSwitch - 项目切换时的回调
   */
  const handleSessionSelected = (session, options = {}) => {
    if (!isValidSession(session)) return

    // 如果需要切换项目
    if (options.onProjectSwitch) {
      options.onProjectSwitch(session.projectId)
    }

    ensureSessionTab(session)
  }

  /**
   * 处理会话关闭事件
   * @param {Object} session - 会话对象
   */
  const handleSessionClosed = (session) => {
    if (!isValidSession(session)) return
    const tab = findTabBySessionId(tabs.value, session.id)
    if (tab) {
      activeTabId.value = removeTabAndGetNextActive(tabs.value, tab.id, activeTabId.value)
    }
  }

  /**
   * 更新 Tab 状态
   * @param {string} sessionId - 会话 ID
   * @param {string} status - 新状态
   */
  const updateTabStatus = (sessionId, status) => {
    const tab = allTabs.value.find(t => t.sessionId === sessionId)
    if (tab) {
      tab.status = status
    }
  }

  /**
   * 更新 Tab 标题
   * @param {string} sessionId - 会话 ID
   * @param {string} title - 新标题
   */
  const updateTabTitle = (sessionId, title) => {
    const tab = allTabs.value.find(t => t.sessionId === sessionId)
    if (tab) {
      tab.title = title
    }
  }

  /**
   * 获取指定项目的 Tab
   * @param {string} projectId - 项目 ID
   * @returns {Array} Tab 列表
   */
  const getTabsByProjectId = (projectId) => {
    return allTabs.value.filter(t => t.projectId === projectId)
  }

  /**
   * 切换到欢迎页
   */
  const goToWelcome = () => {
    activeTabId.value = 'welcome'
  }

  /**
   * 根据 Tab ID 查找 Tab
   * @param {string} tabId - Tab ID
   * @returns {Object|null} Tab 对象
   */
  const findTabById = (tabId) => {
    return allTabs.value.find(t => t.id === tabId) || null
  }

  return {
    // State
    tabs,  // TabBar 显示的 tabs
    allTabs,  // 所有 TerminalTab 组件（包括后台的）
    activeTabId,

    // Computed
    activeTab,
    terminalTabCount,
    isWelcomePage,

    // Methods
    addSessionTab,
    ensureSessionTab,
    selectTab,
    closeTab,
    closeTabBySessionId,
    handleSessionCreated,
    handleSessionSelected,
    handleSessionClosed,
    updateTabStatus,
    updateTabTitle,
    getTabsByProjectId,
    goToWelcome,
    findTabById,
    findTabBySessionId: (sessionId) => findTabBySessionId(allTabs.value, sessionId)  // 使用 allTabs 查找
  }
}

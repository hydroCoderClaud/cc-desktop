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
  const tabs = ref([])
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
    const existingTab = findTabBySessionId(tabs.value, session.id)
    if (existingTab) {
      activeTabId.value = existingTab.id
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
    tabs.value.push(newTab)
    activeTabId.value = newTab.id
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

    // 移除 tab 并切换到合适的 tab
    activeTabId.value = removeTabAndGetNextActive(tabs.value, tab.id, activeTabId.value)
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
    const tab = tabs.value.find(t => t.sessionId === sessionId)
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
    const tab = tabs.value.find(t => t.sessionId === sessionId)
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
    return tabs.value.filter(t => t.projectId === projectId)
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
    return tabs.value.find(t => t.id === tabId) || null
  }

  return {
    // State
    tabs,
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
    findTabBySessionId: (sessionId) => findTabBySessionId(tabs.value, sessionId)
  }
}

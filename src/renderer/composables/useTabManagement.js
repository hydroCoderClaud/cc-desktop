/**
 * Tab 管理组合式函数
 * 管理 Agent 对话 Tab 的创建、切换、关闭等操作
 */
import { ref, computed } from 'vue'
import { useLocale } from './useLocale'
import { unmarkSessionClosed } from './useAgentPanel'

export function useTabManagement() {
  const { t } = useLocale()

  // State
  const tabs = ref([])  // TabBar 中显示的 tabs（用户可见的）
  const allTabs = ref([])  // 所有 Agent 对话 Tab（包括后台保留的组件）
  const activeTabId = ref('welcome')  // 默认显示欢迎页

  /**
   * 当前活动的 Tab
   */
  const activeTab = computed(() => {
    if (activeTabId.value === 'welcome') return null
    return tabs.value.find(t => t.id === activeTabId.value) || null
  })

  /**
   * 是否在欢迎页
   */
  const isWelcomePage = computed(() => activeTabId.value === 'welcome')

  /**
   * 选择 Tab
   * @param {Object} tab - Tab 对象
   * @param {Object} options - 选项
   * @param {Function} options.onProjectSwitch - 项目切换时的回调
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
   * 确保 Agent 对话有对应的 Tab（如果没有则创建）
   * @param {Object} agentSession - Agent 会话对象 { id, type, title, status }
   * @returns {Object} Tab 对象
   */
  const ensureAgentTab = (agentSession) => {
    // CRITICAL: 重新打开会话时，清除关闭标记（恢复队列自动消费）
    unmarkSessionClosed(agentSession.id)

    const tabId = `agent-${agentSession.id}`

    // 先在 allTabs 中查找
    const existingTab = allTabs.value.find(t => t.id === tabId)
    if (existingTab) {
      // 同步标题（对话可能已被重命名）
      if (agentSession.title) {
        existingTab.title = agentSession.title
      }
      // 同步 sessionType（可能从历史加载时缺失）
      if (agentSession.type) {
        existingTab.sessionType = agentSession.type
      }
      if (agentSession.source) {
        existingTab.sessionSource = agentSession.source
      }
      existingTab.imChannel = agentSession.imChannel || null
      existingTab.apiProfileId = agentSession.apiProfileId || null
      existingTab.modelId = agentSession.modelId || null
      existingTab.cwd = agentSession.cwd || existingTab.cwd || null
      existingTab.cwdAuto = agentSession.cwdAuto === true
      existingTab.projectId = agentSession.projectId || existingTab.projectId || null
      existingTab.projectPath = agentSession.projectPath || existingTab.projectPath || null
      existingTab.projectName = agentSession.projectName || existingTab.projectName || null
      existingTab.projectKind = agentSession.projectKind || existingTab.projectKind || null
      activeTabId.value = existingTab.id

      // 如果不在 tabs 中，添加回去
      if (!tabs.value.find(t => t.id === existingTab.id)) {
        tabs.value.push(existingTab)
      }

      return existingTab
    }

    // 创建新 agent tab
    const newTab = {
      id: tabId,
      sessionId: agentSession.id,
      type: 'agent-chat',
      sessionType: agentSession.type || 'chat',  // 'chat' | 'notebook'
      sessionSource: agentSession.source || 'manual',
      title: agentSession.title || t('agent.chat'),
      status: agentSession.status || 'idle',
      imChannel: agentSession.imChannel || null,
      apiProfileId: agentSession.apiProfileId || null,
      modelId: agentSession.modelId || null,
      cwd: agentSession.cwd || null,
      cwdAuto: agentSession.cwdAuto === true,
      projectId: agentSession.projectId || null,
      projectPath: agentSession.projectPath || null,
      projectName: agentSession.projectName || null,
      projectKind: agentSession.projectKind || null
    }

    tabs.value.push(newTab)
    allTabs.value.push(newTab)
    activeTabId.value = newTab.id

    return newTab
  }

  /**
   * 关闭 Agent Tab
   * @param {Object} tab - Agent Tab 对象
   */
  const closeAgentTab = async (tab) => {
    // 从 tabs 中移除，但保留组件以便重新打开时直接复用
    const index = tabs.value.findIndex(t => t.id === tab.id)
    if (index !== -1) {
      tabs.value.splice(index, 1)
    }

    // 如果关闭的是当前活动 tab，切换到其他 tab
    if (activeTabId.value === tab.id) {
      if (tabs.value.length > 0) {
        activeTabId.value = tabs.value[tabs.value.length - 1].id
      } else {
        activeTabId.value = 'welcome'
      }
    }
  }

  /**
   * 完全关闭 Agent Tab（关闭会话时使用）
   * 同时从 tabs 和 allTabs 移除，销毁组件
   * 重新打开时会重建组件并自然触发历史消息分隔线
   */
  const closeAgentTabFully = (tab) => {
    const index = tabs.value.findIndex(t => t.id === tab.id)
    if (index !== -1) {
      tabs.value.splice(index, 1)
    }

    const allIndex = allTabs.value.findIndex(t => t.id === tab.id)
    if (allIndex !== -1) {
      allTabs.value.splice(allIndex, 1)
    }

    if (activeTabId.value === tab.id) {
      if (tabs.value.length > 0) {
        activeTabId.value = tabs.value[tabs.value.length - 1].id
      } else {
        activeTabId.value = 'welcome'
      }
    }
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
    allTabs,
    activeTabId,

    // Computed
    activeTab,
    isWelcomePage,

    // Methods
    ensureAgentTab,
    closeAgentTab,
    closeAgentTabFully,
    selectTab,
    updateTabTitle,
    goToWelcome,
    findTabById
  }
}

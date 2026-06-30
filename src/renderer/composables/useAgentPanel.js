/**
 * Agent 面板状态管理组合式函数
 * 管理 Agent 对话列表、创建、删除等操作
 */
import { ref, computed, watch } from 'vue'
import { getSessionImChannel } from '@shared/external-im-meta'

const RECENT_CWD_LIMIT = 10
const RECENT_CWD_STORAGE_KEY = 'agent.leftPanel.recentCwds'

// 模块级别的已关闭会话集合（跨组件共享）
// 用于在队列自动消费前检查会话是否已关闭
const closedSessionIds = new Set()

/**
 * 检查会话是否已关闭
 * @param {string} sessionId
 * @returns {boolean}
 */
export function isSessionClosed(sessionId) {
  return closedSessionIds.has(sessionId)
}

/**
 * 标记会话为已关闭（供内部使用）
 * @param {string} sessionId
 */
function markSessionClosed(sessionId) {
  closedSessionIds.add(sessionId)
  console.log('[useAgentPanel] 🚫 Marked session as closed:', sessionId)
}

/**
 * 移除会话的关闭标记（供重新打开使用）
 * @param {string} sessionId
 */
export function unmarkSessionClosed(sessionId) {
  closedSessionIds.delete(sessionId)
  console.log('[useAgentPanel] ✅ Unmarked session as closed:', sessionId)
}

function isEmbeddedAppConversation(conv) {
  if (conv?.sessionAppId) {
    return false
  }

  const ownerClientId = typeof conv?.ownerClientId === 'string' ? conv.ownerClientId : ''
  const clientType = typeof conv?.clientType === 'string' ? conv.clientType : ''
  const cwd = typeof conv?.cwd === 'string' ? conv.cwd.replace(/\\/g, '/') : ''

  return ownerClientId.startsWith('embed:') ||
    clientType === 'embedded' ||
    cwd.includes('/embedded-apps/')
}

function isChatConversation(conv) {
  return typeof conv?.type !== 'string' || conv.type === 'chat'
}

function isListableConversation(conv) {
  return isChatConversation(conv) && !isEmbeddedAppConversation(conv)
}

function matchesSourceFilter(conv, selectedSource) {
  if (selectedSource === 'all') return true

  const imChannel = getSessionImChannel(conv)
  if (selectedSource === 'no-im') return !imChannel
  return imChannel === selectedSource
}

function matchesTaskFilter(conv, selectedTaskFilter) {
  if (selectedTaskFilter === 'all') return true

  const hasTask = Boolean(conv?.taskId)
  return selectedTaskFilter === 'with-task' ? hasTask : !hasTask
}

function matchesAppFilter(conv, selectedAppFilter) {
  if (selectedAppFilter === 'all') return true
  if (selectedAppFilter === 'session-app') return Boolean(conv?.sessionAppId)
  if (selectedAppFilter === 'plain-session') return !conv?.sessionAppId
  return conv?.sessionAppId === selectedAppFilter
}

function normalizeCwd(cwd) {
  return typeof cwd === 'string' ? cwd.trim() : ''
}

function getLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function uniqueCwds(cwds) {
  const seen = new Set()
  const result = []
  for (const cwd of cwds) {
    const normalized = normalizeCwd(cwd)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  return result
}

function loadRecentCwds() {
  const storage = getLocalStorage()
  if (!storage) return []

  try {
    const raw = storage.getItem(RECENT_CWD_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? uniqueCwds(parsed).slice(0, RECENT_CWD_LIMIT)
      : []
  } catch {
    return []
  }
}

function saveRecentCwds(cwds) {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(
      RECENT_CWD_STORAGE_KEY,
      JSON.stringify(uniqueCwds(cwds).slice(0, RECENT_CWD_LIMIT))
    )
  } catch {
    // 忽略本地存储不可用的情况，目录筛选本身仍可用。
  }
}

function getConversationTimestamp(conv) {
  const ts = Date.parse(conv?.updatedAt || conv?.createdAt || '')
  return Number.isFinite(ts) ? ts : 0
}

function getConversationCwdsByRecency(conversations) {
  const latestByCwd = new Map()
  for (const conv of conversations) {
    const cwd = normalizeCwd(conv?.cwd)
    if (!cwd) continue

    const timestamp = getConversationTimestamp(conv)
    const previous = latestByCwd.get(cwd)
    if (!previous || timestamp > previous.timestamp) {
      latestByCwd.set(cwd, { cwd, timestamp })
    }
  }

  return Array.from(latestByCwd.values())
    .sort((a, b) => b.timestamp - a.timestamp || a.cwd.localeCompare(b.cwd))
    .map(item => item.cwd)
}

function mergeRecentCwds(recentCwds, conversationCwds) {
  return uniqueCwds([...recentCwds, ...conversationCwds]).slice(0, RECENT_CWD_LIMIT)
}

export function useAgentPanel() {
  const conversations = ref([])
  const loading = ref(false)
  const selectedSource = ref('all')
  const selectedTaskFilter = ref('all')
  const selectedAppFilter = ref('all')
  const recentCwds = ref(loadRecentCwds())
  const sessionApps = ref([])

  /**
   * 加载对话列表（后端已合并活跃+历史）
   */
  const loadConversations = async () => {
    if (!window.electronAPI) return

    loading.value = true
    try {
      const [list, apps] = await Promise.all([
        window.electronAPI.listAgentSessions(),
        window.electronAPI.listSessionApps?.()
      ])
      conversations.value = Array.isArray(list)
        ? list.filter(isListableConversation)
        : []
      sessionApps.value = Array.isArray(apps) ? apps : []
    } catch (err) {
      console.error('[useAgentPanel] loadConversations error:', err)
      conversations.value = []
      sessionApps.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建新对话
   * @param {Object} options - { type, title, cwd, apiProfileId }
   * @returns {Object} 会话对象
   */
  const createConversation = async (options = {}) => {
    if (!window.electronAPI) return null

    try {
      const session = await window.electronAPI.createAgentSession({
        type: options.type || 'chat',
        title: options.title || '',
        cwd: options.cwd || null,
        apiProfileId: options.apiProfileId || null
      })

      if (session && !session.error) {
        conversations.value.unshift(session)
        return session
      } else {
        console.error('[useAgentPanel] create error:', session?.error)
        return null
      }
    } catch (err) {
      console.error('[useAgentPanel] createConversation error:', err)
      return null
    }
  }

  /**
   * 关闭对话（软关闭，标记为 closed）
   */
  const closeConversation = async (sessionId) => {
    if (!window.electronAPI) return

    // CRITICAL: 立即标记会话为已关闭，阻止队列自动消费
    markSessionClosed(sessionId)

    try {
      await window.electronAPI.closeAgentSession(sessionId)
      // 更新列表中的状态
      const conv = conversations.value.find(c => c.id === sessionId)
      if (conv) {
        conv.status = 'closed'
      }
    } catch (err) {
      console.error('[useAgentPanel] closeConversation error:', err)
    }
  }

  /**
   * 物理删除对话
   */
  const deleteConversation = async (sessionId) => {
    if (!window.electronAPI) return

    try {
      await window.electronAPI.deleteAgentConversation(sessionId)
      const index = conversations.value.findIndex(c => c.id === sessionId)
      if (index !== -1) {
        conversations.value.splice(index, 1)
      }

      // CRITICAL: 清理关闭标记，防止内存泄露
      closedSessionIds.delete(sessionId)
      console.log('[useAgentPanel] 🗑️ Removed closed mark for deleted session:', sessionId)
    } catch (err) {
      console.error('[useAgentPanel] deleteConversation error:', err)
    }
  }

  /**
   * 将指定会话上浮到列表最前（收到 agent:result 时调用）
   */
  const bumpConversation = (sessionId) => {
    const index = conversations.value.findIndex(c => c.id === sessionId)
    if (index > 0) {
      const [conv] = conversations.value.splice(index, 1)
      conv.updatedAt = new Date().toISOString()
      conversations.value.unshift(conv)
    } else if (index === 0) {
      conversations.value[0].updatedAt = new Date().toISOString()
    }
  }

  /**
   * 重命名对话
   */
  const renameConversation = async (sessionId, title) => {
    if (!window.electronAPI) return

    try {
      await window.electronAPI.renameAgentSession({ sessionId, title })
      const conv = conversations.value.find(c => c.id === sessionId)
      if (conv) {
        conv.title = title
      }
    } catch (err) {
      console.error('[useAgentPanel] renameConversation error:', err)
    }
  }

  // 当前选中的目录筛选（null = 全部）
  const selectedCwd = ref(null)

  const sourceFilteredConversations = computed(() => {
    return conversations.value.filter(conv => matchesSourceFilter(conv, selectedSource.value))
  })

  const taskFilteredConversations = computed(() => {
    return sourceFilteredConversations.value.filter(conv => matchesTaskFilter(conv, selectedTaskFilter.value))
  })

  const appFilterOptions = computed(() => {
    const appMap = new Map()
    for (const app of sessionApps.value) {
      if (!app?.appId) continue
      appMap.set(app.appId, {
        id: app.appId,
        name: app.name || app.appId
      })
    }
    for (const conv of taskFilteredConversations.value) {
      if (!conv?.sessionAppId) continue
      if (!appMap.has(conv.sessionAppId)) {
        appMap.set(conv.sessionAppId, {
          id: conv.sessionAppId,
          name: conv.sessionAppId
        })
      }
    }

    return [
      { key: 'all', label: 'all' },
      { key: 'session-app', label: 'session-app' },
      { key: 'plain-session', label: 'plain-session' },
      ...Array.from(appMap.values()).map(app => ({
        key: app.id,
        label: app.name
      }))
    ]
  })

  /**
   * 从当前候选对话中提取最近目录，并与手动打开目录合并，最多展示 10 个
   */
  const availableCwds = computed(() => {
    return mergeRecentCwds(
      recentCwds.value,
      getConversationCwdsByRecency(taskFilteredConversations.value)
    )
  })

  const selectCwd = (cwd) => {
    const normalized = normalizeCwd(cwd)
    if (!normalized) {
      selectedCwd.value = null
      return
    }

    const nextRecentCwds = uniqueCwds([normalized, ...recentCwds.value]).slice(0, RECENT_CWD_LIMIT)
    recentCwds.value = nextRecentCwds
    saveRecentCwds(nextRecentCwds)
    selectedCwd.value = normalized
  }

  watch(availableCwds, (nextCwds) => {
    if (selectedCwd.value && !nextCwds.includes(selectedCwd.value)) {
      selectedCwd.value = null
    }
  }, { immediate: true })

  /**
   * 按 selectedCwd 过滤后的对话列表
   */
  const filteredConversations = computed(() => {
    return taskFilteredConversations.value.filter(conv => {
      if (!matchesAppFilter(conv, selectedAppFilter.value)) return false
      return !selectedCwd.value || conv.cwd === selectedCwd.value
    })
  })

  /**
   * 按时间分组（今天、昨天、更早）
   */
  const groupedConversations = computed(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)

    const groups = {
      today: [],
      yesterday: [],
      older: []
    }

    for (const conv of filteredConversations.value) {
      const ts = new Date(conv.updatedAt || conv.createdAt)
      if (ts >= today) {
        groups.today.push(conv)
      } else if (ts >= yesterday) {
        groups.yesterday.push(conv)
      } else {
        groups.older.push(conv)
      }
    }

    return groups
  })

  return {
    conversations,
    loading,
    selectedCwd,
    selectedSource,
    selectedTaskFilter,
    selectedAppFilter,
    availableCwds,
    appFilterOptions,
    selectCwd,
    groupedConversations,
    loadConversations,
    createConversation,
    closeConversation,
    deleteConversation,
    bumpConversation,
    renameConversation
  }
}

/**
 * Agent 面板状态管理组合式函数
 * 管理 Agent 对话列表、创建、删除等操作
 */
import { ref, computed, watch } from 'vue'
import { getSessionImChannel } from '@shared/external-im-meta'

const RECENT_CWD_LIMIT = 10
const RECENT_CWD_STORAGE_KEY = 'agent.leftPanel.recentCwds'
const PINNED_PROJECTS_STORAGE_KEY = 'agent.leftPanel.pinnedProjectKeys'
const EXPANDED_PROJECTS_STORAGE_KEY = 'agent.leftPanel.expandedProjectKeys'
const UNCATEGORIZED_PROJECT_KEY = 'uncategorized'

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

function normalizeProjectId(projectId) {
  if (projectId === null || projectId === undefined || projectId === '') return ''
  return String(projectId)
}

function buildCwdDirectoryKey(cwd) {
  const normalized = normalizeCwd(cwd)
  return normalized ? `cwd:${normalized}` : ''
}

function getConversationDirectoryKey(conv) {
  const projectId = normalizeProjectId(conv?.projectId)
  if (projectId) return `project:${projectId}`
  return buildCwdDirectoryKey(conv?.cwd)
}

function getConversationDirectoryEntry(conv) {
  const key = getConversationDirectoryKey(conv)
  if (!key) return null

  return {
    key,
    cwd: normalizeCwd(conv?.projectPath || conv?.cwd),
    projectId: normalizeProjectId(conv?.projectId) || null,
    projectName: conv?.projectName || null,
    projectKind: conv?.projectKind || null
  }
}

function getFallbackDirectoryEntry() {
  return {
    key: UNCATEGORIZED_PROJECT_KEY,
    cwd: '',
    projectId: null,
    projectName: null,
    projectKind: 'uncategorized'
  }
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

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  return result
}

function loadStringList(storageKey) {
  const storage = getLocalStorage()
  if (!storage) return { found: false, values: [] }

  try {
    const raw = storage.getItem(storageKey)
    if (raw === null || raw === undefined) return { found: false, values: [] }
    const parsed = JSON.parse(raw)
    return {
      found: true,
      values: Array.isArray(parsed) ? uniqueStrings(parsed) : []
    }
  } catch {
    return { found: false, values: [] }
  }
}

function saveStringList(storageKey, values) {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(storageKey, JSON.stringify(uniqueStrings(values)))
  } catch {
    // 本地 UI 状态不可写时，不影响会话列表本身。
  }
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

function getDirectorySortName(entry) {
  const name = entry?.projectName || entry?.cwd || entry?.key || ''
  return String(name).toLocaleLowerCase()
}

function getConversationDirectoriesByRecency(conversations) {
  const latestByKey = new Map()
  for (const conv of conversations) {
    const entry = getConversationDirectoryEntry(conv)
    if (!entry) continue

    const timestamp = getConversationTimestamp(conv)
    const previous = latestByKey.get(entry.key)
    if (!previous || timestamp > previous.timestamp) {
      latestByKey.set(entry.key, { ...entry, timestamp })
    }
  }

  return Array.from(latestByKey.values())
    .sort((a, b) => b.timestamp - a.timestamp || (a.cwd || a.key).localeCompare(b.cwd || b.key))
    .map(({ timestamp, ...entry }) => entry)
}

function mergeDirectoryEntries(recentCwds, conversationDirectories) {
  const entries = []
  const seen = new Set()
  const projectDirectoryByCwd = new Map()

  for (const directory of conversationDirectories) {
    const normalized = normalizeCwd(directory?.cwd)
    if (normalized && directory?.projectId) {
      projectDirectoryByCwd.set(normalized, directory)
    }
  }

  const addEntry = (entry) => {
    if (!entry?.key || seen.has(entry.key)) return
    seen.add(entry.key)
    entries.push(entry)
  }

  for (const cwd of recentCwds) {
    const normalized = normalizeCwd(cwd)
    if (!normalized) continue
    const projectDirectory = projectDirectoryByCwd.get(normalized)
    if (projectDirectory) {
      addEntry(projectDirectory)
      continue
    }
    addEntry({
      key: buildCwdDirectoryKey(normalized),
      cwd: normalized,
      projectId: null,
      projectName: null,
      projectKind: null
    })
  }

  for (const directory of conversationDirectories) {
    addEntry(directory)
  }

  return entries.slice(0, RECENT_CWD_LIMIT)
}

export function useAgentPanel() {
  const conversations = ref([])
  const loading = ref(false)
  const selectedSource = ref('all')
  const selectedTaskFilter = ref('all')
  const selectedAppFilter = ref('all')
  const recentCwds = ref(loadRecentCwds())
  const sessionApps = ref([])
  const pinnedProjectKeys = ref(loadStringList(PINNED_PROJECTS_STORAGE_KEY).values)
  const expandedProjectStorage = loadStringList(EXPANDED_PROJECTS_STORAGE_KEY)
  const expandedProjectKeys = ref(expandedProjectStorage.values)
  const hasInitializedExpandedProjectKeys = ref(expandedProjectStorage.found)

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

  // 当前选中的目录筛选 key（null = 全部；project:<id> 优先，cwd:<path> 兜底）
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
  const availableDirectories = computed(() => {
    return mergeDirectoryEntries(
      recentCwds.value,
      getConversationDirectoriesByRecency(taskFilteredConversations.value)
    )
  })

  const selectCwd = (cwd) => {
    const value = normalizeCwd(cwd)
    if (!value) {
      selectedCwd.value = null
      return
    }

    if (value.startsWith('project:')) {
      selectedCwd.value = value
      return
    }

    const normalized = value.startsWith('cwd:') ? value.slice(4) : value
    const nextRecentCwds = uniqueCwds([normalized, ...recentCwds.value]).slice(0, RECENT_CWD_LIMIT)
    recentCwds.value = nextRecentCwds
    saveRecentCwds(nextRecentCwds)
    selectedCwd.value = buildCwdDirectoryKey(normalized)
  }

  watch(availableDirectories, (nextDirectories) => {
    if (selectedCwd.value && !nextDirectories.some(directory => directory.key === selectedCwd.value)) {
      selectedCwd.value = null
    }
  }, { immediate: true })

  /**
   * 按 selectedCwd 过滤后的对话列表
   */
  const filteredConversations = computed(() => {
    return taskFilteredConversations.value.filter(conv => {
      if (!matchesAppFilter(conv, selectedAppFilter.value)) return false
      return !selectedCwd.value || getConversationDirectoryKey(conv) === selectedCwd.value
    })
  })

  const isProjectPinned = (projectKey) => pinnedProjectKeys.value.includes(projectKey)

  const projectConversationGroups = computed(() => {
    const groupsByKey = new Map()

    for (const conv of filteredConversations.value) {
      const entry = getConversationDirectoryEntry(conv) || getFallbackDirectoryEntry()
      if (!groupsByKey.has(entry.key)) {
        groupsByKey.set(entry.key, {
          ...entry,
          items: [],
          count: 0,
          latestTimestamp: 0
        })
      }

      const group = groupsByKey.get(entry.key)
      const timestamp = getConversationTimestamp(conv)
      group.items.push(conv)
      group.count += 1
      group.latestTimestamp = Math.max(group.latestTimestamp, timestamp)
    }

    const pinnedOrder = new Map(pinnedProjectKeys.value.map((key, index) => [key, index]))

    return Array.from(groupsByKey.values())
      .map(group => ({
        ...group,
        items: group.items.sort((a, b) => getConversationTimestamp(b) - getConversationTimestamp(a)),
        pinned: pinnedOrder.has(group.key),
        expanded: expandedProjectKeys.value.includes(group.key)
      }))
      .sort((a, b) => {
        const aPinnedIndex = pinnedOrder.has(a.key) ? pinnedOrder.get(a.key) : Number.POSITIVE_INFINITY
        const bPinnedIndex = pinnedOrder.has(b.key) ? pinnedOrder.get(b.key) : Number.POSITIVE_INFINITY
        if (aPinnedIndex !== bPinnedIndex) return aPinnedIndex - bPinnedIndex
        if (a.latestTimestamp !== b.latestTimestamp) return b.latestTimestamp - a.latestTimestamp
        return getDirectorySortName(a).localeCompare(getDirectorySortName(b))
      })
  })

  watch(projectConversationGroups, (groups) => {
    if (hasInitializedExpandedProjectKeys.value || groups.length === 0) return
    expandedProjectKeys.value = groups.map(group => group.key)
    hasInitializedExpandedProjectKeys.value = true
  }, { immediate: true })

  const setProjectExpanded = (projectKey, expanded) => {
    if (!projectKey) return
    const current = new Set(expandedProjectKeys.value)
    if (expanded) {
      current.add(projectKey)
    } else {
      current.delete(projectKey)
    }
    expandedProjectKeys.value = Array.from(current)
    hasInitializedExpandedProjectKeys.value = true
    saveStringList(EXPANDED_PROJECTS_STORAGE_KEY, expandedProjectKeys.value)
  }

  const toggleProjectExpanded = (projectKey) => {
    setProjectExpanded(projectKey, !expandedProjectKeys.value.includes(projectKey))
  }

  const expandProject = (projectKey) => {
    setProjectExpanded(projectKey, true)
  }

  const collapseOtherProjects = (projectKey) => {
    if (!projectKey) return
    expandedProjectKeys.value = [projectKey]
    hasInitializedExpandedProjectKeys.value = true
    saveStringList(EXPANDED_PROJECTS_STORAGE_KEY, expandedProjectKeys.value)
  }

  const toggleProjectPinned = (projectKey) => {
    if (!projectKey) return
    const current = pinnedProjectKeys.value.filter(key => key !== projectKey)
    pinnedProjectKeys.value = isProjectPinned(projectKey)
      ? current
      : [projectKey, ...current]
    saveStringList(PINNED_PROJECTS_STORAGE_KEY, pinnedProjectKeys.value)
  }

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
    availableDirectories,
    appFilterOptions,
    pinnedProjectKeys,
    expandedProjectKeys,
    selectCwd,
    projectConversationGroups,
    toggleProjectPinned,
    toggleProjectExpanded,
    expandProject,
    collapseOtherProjects,
    groupedConversations,
    loadConversations,
    createConversation,
    closeConversation,
    deleteConversation,
    bumpConversation,
    renameConversation
  }
}

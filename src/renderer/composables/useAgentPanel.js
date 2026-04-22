/**
 * Agent 面板状态管理组合式函数
 * 管理 Agent 对话列表、创建、删除等操作
 */
import { ref, computed } from 'vue'

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

export function useAgentPanel() {
  const conversations = ref([])
  const loading = ref(false)
  const selectedSource = ref('all')

  /**
   * 加载对话列表（后端已合并活跃+历史）
   */
  const loadConversations = async () => {
    if (!window.electronAPI) return

    loading.value = true
    try {
      const list = await window.electronAPI.listAgentSessions()
      conversations.value = Array.isArray(list) ? list : []
    } catch (err) {
      console.error('[useAgentPanel] loadConversations error:', err)
      conversations.value = []
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

  /**
   * 从对话列表中提取所有不重复的 cwd，按字母排序
   */
  const availableCwds = computed(() => {
    const cwdSet = new Set()
    for (const conv of conversations.value) {
      if (conv.cwd) cwdSet.add(conv.cwd)
    }
    return Array.from(cwdSet).sort()
  })

  /**
   * 按 selectedCwd 过滤后的对话列表
   */
  const filteredConversations = computed(() => {
    return conversations.value.filter(conv => {
      const source = conv.type === 'dingtalk' ? 'dingtalk' : (conv.source || 'manual')
      const matchesCwd = !selectedCwd.value || conv.cwd === selectedCwd.value
      const matchesSource = selectedSource.value === 'all' || source === selectedSource.value
      return matchesCwd && matchesSource
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
    availableCwds,
    groupedConversations,
    loadConversations,
    createConversation,
    closeConversation,
    deleteConversation,
    bumpConversation,
    renameConversation
  }
}

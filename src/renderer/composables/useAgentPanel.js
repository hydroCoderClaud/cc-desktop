/**
 * Agent 面板状态管理组合式函数
 * 管理 Agent 对话列表、创建、删除等操作
 */
import { ref, computed } from 'vue'

export function useAgentPanel() {
  const conversations = ref([])
  const loading = ref(false)

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
   * @param {Object} options - { type, title, cwd }
   * @returns {Object} 会话对象
   */
  const createConversation = async (options = {}) => {
    if (!window.electronAPI) return null

    try {
      const session = await window.electronAPI.createAgentSession({
        type: options.type || 'chat',
        title: options.title || '',
        cwd: options.cwd || null
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
    } catch (err) {
      console.error('[useAgentPanel] deleteConversation error:', err)
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

    for (const conv of conversations.value) {
      const created = new Date(conv.createdAt)
      if (created >= today) {
        groups.today.push(conv)
      } else if (created >= yesterday) {
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
    groupedConversations,
    loadConversations,
    createConversation,
    closeConversation,
    deleteConversation,
    renameConversation
  }
}

/**
 * Session Manager Composable
 *
 * Shared state and functions for session management
 */

import { ref, computed, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useLocale } from '@composables/useLocale'

// Singleton state - shared across all components
const projects = ref([])
const sessions = ref([])
const messages = ref([])
const selectedProject = ref(null)
const selectedSession = ref(null)
const selectedMessages = ref([])
const loadingProjects = ref(false)
const loadingSessions = ref(false)
const loadingMessages = ref(false)
const syncing = ref(false)
const syncStats = ref(null)

// Tags
const allTags = ref([])
const showTagModal = ref(false)
const messageTagsMap = ref({})
const activeTagFilter = ref(null)
const sessionTagFilter = ref(null)

// Search
const searchQuery = ref('')
const searchScope = ref('all')
const searching = ref(false)
const searchResults = ref([])
const searchIndex = ref(0)
const highlightedMessageId = ref(null)

export function useSessionManager() {
  const message = useMessage()
  const { invoke } = useIPC()
  const { t } = useLocale()

  // ========================================
  // Computed Properties
  // ========================================

  const filteredSessions = computed(() => {
    if (!sessionTagFilter.value) {
      return sessions.value
    }
    return sessions.value.filter(session =>
      session.tags && session.tags.some(tag => tag.id === sessionTagFilter.value.id)
    )
  })

  const displayMessages = computed(() => {
    let filtered = messages.value.filter(m => {
      const content = String(m.content || '').trim()
      if (!content) return false
      if (content.match(/^\[object \w+\]$/)) return false
      return true
    })

    if (activeTagFilter.value) {
      filtered = filtered.filter(m => {
        const tags = messageTagsMap.value[m.id]
        return tags && tags.some(t => t.id === activeTagFilter.value.id)
      })
    }

    return filtered
  })

  // Tag lists for filter dropdowns
  const sessionFilterTagList = computed(() => {
    const tagCountMap = {}
    for (const session of sessions.value) {
      if (session.tags) {
        for (const tag of session.tags) {
          if (!tagCountMap[tag.id]) {
            tagCountMap[tag.id] = { tag, count: 0 }
          }
          tagCountMap[tag.id].count++
        }
      }
    }
    return Object.values(tagCountMap)
  })

  const messageFilterTagList = computed(() => {
    const tagCountMap = {}
    for (const msgId of Object.keys(messageTagsMap.value)) {
      const tags = messageTagsMap.value[msgId]
      for (const tag of tags) {
        if (!tagCountMap[tag.id]) {
          tagCountMap[tag.id] = { tag, count: 0 }
        }
        tagCountMap[tag.id].count++
      }
    }
    return Object.values(tagCountMap)
  })

  // ========================================
  // Data Loading Functions
  // ========================================

  const loadProjects = async () => {
    loadingProjects.value = true
    try {
      projects.value = await invoke('getSessionProjects')
    } catch (err) {
      console.error('Failed to load projects:', err)
      message.error(t('messages.loadFailed'))
    } finally {
      loadingProjects.value = false
    }
  }

  const loadSessions = async (projectId) => {
    loadingSessions.value = true
    try {
      sessions.value = await invoke('getProjectSessions', projectId)
    } catch (err) {
      console.error('Failed to load sessions:', err)
      message.error(t('messages.loadFailed'))
    } finally {
      loadingSessions.value = false
    }
  }

  const loadMessages = async (sessionId) => {
    loadingMessages.value = true
    try {
      messages.value = await invoke('getSessionMessages', { sessionId, limit: 1000 })
      await loadMessageTags()
    } catch (err) {
      console.error('Failed to load messages:', err)
      message.error(t('messages.loadFailed'))
    } finally {
      loadingMessages.value = false
    }
  }

  const loadTags = async () => {
    try {
      allTags.value = await invoke('getAllTags')
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }

  const loadMessageTags = async () => {
    if (!selectedSession.value) {
      messageTagsMap.value = {}
      return
    }

    try {
      const taggedMessages = await invoke('getSessionTaggedMessages', selectedSession.value.id)
      const tagsMap = {}
      for (const item of taggedMessages) {
        if (!tagsMap[item.message_id]) {
          tagsMap[item.message_id] = []
        }
        tagsMap[item.message_id].push({
          id: item.tag_id,
          name: item.tag_name,
          color: item.tag_color
        })
      }
      messageTagsMap.value = tagsMap
    } catch (err) {
      console.error('Failed to load message tags:', err)
      messageTagsMap.value = {}
    }
  }

  // ========================================
  // Selection Functions
  // ========================================

  const selectProject = async (project) => {
    selectedProject.value = project
    selectedSession.value = null
    selectedMessages.value = []
    messages.value = []
    messageTagsMap.value = {}
    activeTagFilter.value = null
    sessionTagFilter.value = null
    await loadSessions(project.id)
  }

  const selectSession = async (session) => {
    selectedSession.value = session
    selectedMessages.value = []
    await loadMessages(session.id)
  }

  const selectMessage = (msg, event) => {
    highlightedMessageId.value = null
    const isSelected = selectedMessages.value.some(m => m.id === msg.id)

    if (event.ctrlKey || event.metaKey) {
      if (isSelected) {
        selectedMessages.value = selectedMessages.value.filter(m => m.id !== msg.id)
      } else {
        selectedMessages.value = [...selectedMessages.value, msg]
      }
    } else {
      if (isSelected && selectedMessages.value.length === 1) {
        selectedMessages.value = []
      } else {
        selectedMessages.value = [msg]
      }
    }
  }

  // ========================================
  // Sync Functions
  // ========================================

  const handleSync = async () => {
    syncing.value = true
    try {
      const result = await invoke('syncSessions')
      if (result.status === 'success') {
        const stats = await invoke('getSessionStats')
        syncStats.value = {
          timestamp: Date.now(),
          messagesAdded: result.messagesAdded,
          sessionsAdded: result.sessionsAdded,
          totalMessages: stats?.messages || 0
        }
        message.success(`${t('sessionManager.syncSuccess')}: ${result.messagesAdded} ${t('sessionManager.newMessages')}`)
      } else if (result.status === 'error') {
        message.error(result.message)
      }
      await loadProjects()
    } catch (err) {
      console.error('Sync failed:', err)
      message.error(t('messages.operationFailed'))
    } finally {
      syncing.value = false
    }
  }

  // ========================================
  // Tag Functions
  // ========================================

  const createTag = async (name, color) => {
    try {
      await invoke('createTag', { name, color })
      await loadTags()
      message.success(t('messages.operationSuccess'))
      return true
    } catch (err) {
      console.error('Failed to create tag:', err)
      message.error(t('messages.operationFailed'))
      return false
    }
  }

  const deleteTag = async (tagId) => {
    try {
      await invoke('deleteTag', tagId)
      await loadTags()
      message.success(t('messages.deleteSuccess'))
    } catch (err) {
      console.error('Failed to delete tag:', err)
      message.error(t('messages.operationFailed'))
    }
  }

  const addSessionTag = async (sessionId, tagId) => {
    try {
      await invoke('addTagToSession', { sessionId, tagId })
      if (selectedProject.value) {
        await loadSessions(selectedProject.value.id)
      }
      await loadTags()
      message.success(t('messages.operationSuccess'))
    } catch (err) {
      console.error('Failed to add session tag:', err)
      message.error(t('messages.operationFailed'))
    }
  }

  const removeSessionTag = async (sessionId, tagId) => {
    try {
      await invoke('removeTagFromSession', { sessionId, tagId })
      if (selectedProject.value) {
        await loadSessions(selectedProject.value.id)
      }
      await loadTags()
      message.success(t('messages.deleteSuccess'))
    } catch (err) {
      console.error('Failed to remove session tag:', err)
      message.error(t('messages.operationFailed'))
    }
  }

  const addMessageTag = async (messageId, tagId) => {
    try {
      await invoke('addTagToMessage', { messageId, tagId })
      await loadMessageTags()
      await loadTags()
      message.success(t('messages.operationSuccess'))
    } catch (err) {
      console.error('Failed to add message tag:', err)
      message.error(t('messages.operationFailed'))
    }
  }

  const removeMessageTag = async (messageId, tagId) => {
    try {
      await invoke('removeTagFromMessage', { messageId, tagId })
      await loadMessageTags()
      await loadTags()
      message.success(t('messages.deleteSuccess'))
    } catch (err) {
      console.error('Failed to remove message tag:', err)
      message.error(t('messages.operationFailed'))
    }
  }

  const setSessionTagFilter = (tagId) => {
    if (tagId === 'all') {
      sessionTagFilter.value = null
    } else {
      const tag = allTags.value.find(t => t.id === tagId)
      sessionTagFilter.value = tag || null
    }
  }

  const setMessageTagFilter = (tagId) => {
    if (tagId === 'all') {
      activeTagFilter.value = null
    } else {
      const tag = allTags.value.find(t => t.id === tagId)
      activeTagFilter.value = tag || null
    }
  }

  // ========================================
  // Favorite Functions
  // ========================================

  const toggleFavorite = async (session) => {
    try {
      if (session.is_favorite) {
        await invoke('removeFavorite', session.id)
        session.is_favorite = 0
      } else {
        await invoke('addFavorite', { sessionId: session.id, note: '' })
        session.is_favorite = 1
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
      message.error(t('messages.operationFailed'))
    }
  }

  // ========================================
  // Search Functions
  // ========================================

  const handleSearch = async () => {
    if (!searchQuery.value.trim()) return

    sessionTagFilter.value = null
    activeTagFilter.value = null
    searching.value = true

    try {
      let projectId = null
      let sessionId = null

      if (searchScope.value === 'project' && selectedProject.value) {
        projectId = selectedProject.value.id
      } else if (searchScope.value === 'session' && selectedSession.value) {
        sessionId = selectedSession.value.id
      }

      const results = await invoke('searchSessions', {
        query: searchQuery.value,
        projectId,
        sessionId,
        limit: 200
      })

      searchResults.value = results
      searchIndex.value = 0

      if (results.length > 0) {
        message.success(`${t('sessionManager.found')} ${results.length} ${t('sessionManager.results')}`)
      } else {
        message.info(t('sessionManager.noResults'))
      }
    } catch (err) {
      console.error('Search failed:', err)
      message.error(t('messages.operationFailed'))
    } finally {
      searching.value = false
    }
  }

  const clearSearchResults = () => {
    searchResults.value = []
    searchIndex.value = 0
    highlightedMessageId.value = null
  }

  // ========================================
  // Export Functions
  // ========================================

  const generateExportContent = async (scope, format) => {
    if (!selectedSession.value) return ''

    if (scope === 'all') {
      return await invoke('exportSession', {
        sessionId: selectedSession.value.id,
        format
      })
    } else if (scope === 'selected' && selectedMessages.value.length > 0) {
      const sortedMsgs = [...selectedMessages.value].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

      if (format === 'markdown') {
        return sortedMsgs.map(msg => {
          const role = msg.role === 'user' ? t('sessionManager.user') : t('sessionManager.assistant')
          const time = formatTime(msg.timestamp)
          return `## ${role} (${time})\n\n${msg.content}\n`
        }).join('\n---\n\n')
      } else {
        return JSON.stringify(sortedMsgs, null, 2)
      }
    }

    return ''
  }

  // ========================================
  // Utility Functions
  // ========================================

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return {
    // State
    projects,
    sessions,
    messages,
    selectedProject,
    selectedSession,
    selectedMessages,
    loadingProjects,
    loadingSessions,
    loadingMessages,
    syncing,
    syncStats,
    allTags,
    showTagModal,
    messageTagsMap,
    activeTagFilter,
    sessionTagFilter,
    searchQuery,
    searchScope,
    searching,
    searchResults,
    searchIndex,
    highlightedMessageId,

    // Computed
    filteredSessions,
    displayMessages,
    sessionFilterTagList,
    messageFilterTagList,

    // Methods
    loadProjects,
    loadSessions,
    loadMessages,
    loadTags,
    loadMessageTags,
    selectProject,
    selectSession,
    selectMessage,
    handleSync,
    createTag,
    deleteTag,
    addSessionTag,
    removeSessionTag,
    addMessageTag,
    removeMessageTag,
    setSessionTagFilter,
    setMessageTagFilter,
    toggleFavorite,
    handleSearch,
    clearSearchResults,
    generateExportContent,
    formatDate,
    formatTime
  }
}

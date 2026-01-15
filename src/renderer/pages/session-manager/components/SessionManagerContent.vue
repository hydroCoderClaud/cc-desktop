<template>
  <div class="session-manager" :style="cssVars">
    <!-- Header -->
    <div class="header">
      <h1>{{ t('sessionManager.title') }}</h1>
      <n-space align="center">
        <!-- Search Scope -->
        <n-select
          v-model:value="searchScope"
          :options="searchScopeOptions"
          style="width: 120px"
        />
        <!-- Search Input -->
        <n-input
          v-model:value="searchQuery"
          :placeholder="t('sessionManager.searchPlaceholder')"
          clearable
          style="width: 200px"
          @keyup.enter="doSearch"
          @clear="clearSearchResults"
        >
          <template #prefix>
            <span>🔍</span>
          </template>
        </n-input>
        <!-- Search Button -->
        <n-button type="primary" :loading="searching" @click="doSearch">
          {{ t('common.search') }}
        </n-button>
        <!-- Search Results Navigation -->
        <n-space v-if="searchResults.length > 0" align="center" :size="4" class="search-nav">
          <n-button size="small" quaternary :disabled="searchIndex <= 0" @click="prevResult">◀</n-button>
          <n-input-number
            v-model:value="searchIndexDisplay"
            size="small"
            :min="1"
            :max="searchResults.length"
            :show-button="false"
            style="width: 50px"
            @update:value="goToResult"
          />
          <span class="search-nav-total">/ {{ searchResults.length }}</span>
          <n-button size="small" quaternary :disabled="searchIndex >= searchResults.length - 1" @click="nextResult">▶</n-button>
          <n-button size="small" quaternary @click="clearSearchResults">✕</n-button>
        </n-space>
        <!-- Sync Button -->
        <n-button :loading="syncing" @click="handleSync">
          <span style="margin-right: 4px">🔄</span>
          {{ t('sessionManager.sync') }}
        </n-button>
        <!-- Clear Invalid Sessions Button -->
        <n-popconfirm @positive-click="handleClearInvalid">
          <template #trigger>
            <n-button :loading="clearing" type="warning">
              <span style="margin-right: 4px">🧹</span>
              {{ t('sessionManager.clearInvalid') }}
            </n-button>
          </template>
          {{ t('sessionManager.clearInvalidConfirm') }}
        </n-popconfirm>
      </n-space>
    </div>

    <!-- Sync Status -->
    <div v-if="syncStats" class="sync-status">
      <span>{{ t('sessionManager.lastSync') }}: {{ formatDate(syncStats.timestamp) }}</span>
      <span>{{ syncStats.messagesAdded }} {{ t('sessionManager.newMessages') }}</span>
      <span>{{ t('sessionManager.totalMessages') }}: {{ syncStats.totalMessages }}</span>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Left: Project List -->
      <ProjectList
        :projects="projects"
        :selected-project="selectedProject"
        :loading-projects="loadingProjects"
        @select="selectProject"
        @sync="handleSync"
      />

      <!-- Center: Session List -->
      <SessionList
        :selected-project="selectedProject"
        :selected-session="selectedSession"
        :filtered-sessions="filteredSessions"
        :session-filter-tag-list="sessionFilterTagList"
        :session-tag-filter="sessionTagFilter"
        :all-tags="allTags"
        :loading-sessions="loadingSessions"
        :show-favorites-only="showFavoritesOnly"
        @select="handleSelectSession"
        @filter="setSessionTagFilter"
        @add-tag="addSessionTag"
        @remove-tag="removeSessionTag"
        @toggle-favorite="toggleFavorite"
        @manage-tags="showTagModal = true"
        @quick-add-tag="handleQuickAddSessionTag"
        @toggle-favorites-filter="showFavoritesOnly = !showFavoritesOnly"
      />

      <!-- Right: Message Viewer -->
      <MessageViewer
        ref="messageViewerRef"
        :selected-session="selectedSession"
        :display-messages="displayMessages"
        :selected-messages="selectedMessages"
        :message-tags-map="messageTagsMap"
        :message-filter-tag-list="messageFilterTagList"
        :active-tag-filter="activeTagFilter"
        :all-tags="allTags"
        :loading-messages="loadingMessages"
        :highlighted-message-id="highlightedMessageId"
        @select-message="selectMessage"
        @filter="setMessageTagFilter"
        @add-message-tag="addMessageTag"
        @remove-message-tag="removeMessageTag"
        @manage-tags="showTagModal = true"
        @quick-add-tag="handleQuickAddMessageTag"
        @copy="handleCopy"
        @export="handleExport"
      />
    </div>

    <!-- Tag Management Modal -->
    <TagManager
      v-model:show="showTagModal"
      :all-tags="allTags"
      @create="handleCreateTag"
      @delete="deleteTag"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage, NPopconfirm } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import { formatDate, formatTime, scrollToElement } from '@composables/useFormatters'

// Sub-components
import ProjectList from './ProjectList.vue'
import SessionList from './SessionList.vue'
import MessageViewer from './MessageViewer.vue'
import TagManager from './TagManager.vue'

const message = useMessage()
const { invoke } = useIPC()
const { cssVars, initTheme } = useTheme()
const { t, initLocale } = useLocale()

// Refs
const messageViewerRef = ref(null)

// ========================================
// State
// ========================================
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
const clearing = ref(false)
const syncStats = ref(null)

// Tags
const allTags = ref([])
const showTagModal = ref(false)
const messageTagsMap = ref({})
const activeTagFilter = ref(null)
const sessionTagFilter = ref(null)
const showFavoritesOnly = ref(false)

// Search
const searchQuery = ref('')
const searchScope = ref('all')
const searching = ref(false)
const searchResults = ref([])
const searchIndex = ref(0)
const highlightedMessageId = ref(null)

// ========================================
// Computed
// ========================================
const searchIndexDisplay = computed({
  get: () => searchIndex.value + 1,
  set: (val) => { searchIndex.value = Math.max(0, Math.min(val - 1, searchResults.value.length - 1)) }
})

const searchScopeOptions = computed(() => [
  { label: t('sessionManager.scopeAll'), value: 'all' },
  { label: t('sessionManager.scopeProject'), value: 'project', disabled: !selectedProject.value },
  { label: t('sessionManager.scopeSession'), value: 'session', disabled: !selectedSession.value }
])

const filteredSessions = computed(() => {
  let result = sessions.value

  // Filter by favorites
  if (showFavoritesOnly.value) {
    result = result.filter(session => session.is_favorite)
  }

  // Filter by tag
  if (sessionTagFilter.value) {
    result = result.filter(session =>
      session.tags && session.tags.some(tag => tag.id === sessionTagFilter.value.id)
    )
  }

  return result
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
// Lifecycle
// ========================================
const handleKeyDown = async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedMessages.value.length > 0) {
    // 如果有文本选择，让浏览器处理默认复制
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) {
      return // 不拦截，使用默认复制行为
    }
    // 没有文本选择，复制选中的消息
    e.preventDefault()
    const content = await generateExportContent('selected', 'markdown')
    if (content) {
      await navigator.clipboard.writeText(content)
      message.success(`${t('sessionManager.copySuccess')} (${selectedMessages.value.length})`)
    }
  }
}

onMounted(async () => {
  await initTheme()
  await initLocale()
  await handleSync()
  await loadTags()
  window.addEventListener('keydown', handleKeyDown)

  // 检查 URL 参数，自动选中指定项目
  const urlParams = new URLSearchParams(window.location.search)
  const projectPath = urlParams.get('projectPath')
  if (projectPath) {
    const targetProject = projects.value.find(p => p.path === projectPath)
    if (targetProject) {
      await selectProject(targetProject)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// ========================================
// Data Loading
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
// Sync
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

const handleClearInvalid = async () => {
  clearing.value = true
  try {
    const result = await invoke('clearInvalidSessions')
    if (result.status === 'success') {
      const totalDeleted = result.filesDeleted + result.dbSessionsDeleted
      message.success(`${t('sessionManager.clearInvalidSuccess')}: ${result.filesDeleted} ${t('sessionManager.filesDeleted')}`)
      // 清除后重新同步
      await handleSync()
    } else if (result.status === 'error') {
      message.error(result.message)
    }
  } catch (err) {
    console.error('Clear invalid sessions failed:', err)
    message.error(t('messages.operationFailed'))
  } finally {
    clearing.value = false
  }
}

// ========================================
// Selection
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

const handleSelectSession = async (session) => {
  selectedSession.value = session
  selectedMessages.value = []
  await loadMessages(session.id)
  await nextTick()
  messageViewerRef.value?.scrollToNewest()
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
// Tags
// ========================================
const handleCreateTag = async (name, color) => {
  try {
    await invoke('createTag', { name, color })
    await loadTags()
    message.success(t('messages.operationSuccess'))
  } catch (err) {
    console.error('Failed to create tag:', err)
    message.error(t('messages.operationFailed'))
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

// Quick add tag to session (create + add)
const handleQuickAddSessionTag = async ({ sessionId, name }) => {
  try {
    // 创建标签（使用默认颜色）
    const tag = await invoke('createTag', { name, color: '#1890ff' })
    // 添加到会话
    await invoke('addTagToSession', { sessionId, tagId: tag.id })
    if (selectedProject.value) {
      await loadSessions(selectedProject.value.id)
    }
    await loadTags()
    message.success(t('sessionManager.tagCreateSuccess'))
  } catch (err) {
    console.error('Failed to quick add session tag:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Quick add tag to message (create + add)
const handleQuickAddMessageTag = async ({ messageId, name }) => {
  try {
    // 创建标签（使用默认颜色）
    const tag = await invoke('createTag', { name, color: '#1890ff' })
    // 添加到消息
    await invoke('addTagToMessage', { messageId, tagId: tag.id })
    await loadMessageTags()
    await loadTags()
    message.success(t('sessionManager.tagCreateSuccess'))
  } catch (err) {
    console.error('Failed to quick add message tag:', err)
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
    sessionTagFilter.value = allTags.value.find(t => t.id === tagId) || null
  }
}

const setMessageTagFilter = (tagId) => {
  if (tagId === 'all') {
    activeTagFilter.value = null
  } else {
    activeTagFilter.value = allTags.value.find(t => t.id === tagId) || null
  }
}

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
// Search
// ========================================
const doSearch = async () => {
  if (!searchQuery.value.trim()) return

  // 搜索时取消所有筛选，以便显示搜索结果
  sessionTagFilter.value = null
  activeTagFilter.value = null
  showFavoritesOnly.value = false
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
      await navigateToResult(0)
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

const navigateToResult = async (index) => {
  if (index < 0 || index >= searchResults.value.length) return

  const result = searchResults.value[index]
  searchIndex.value = index

  const project = projects.value.find(p => p.path === result.project_path)
  if (!project) return

  const projectChanged = !selectedProject.value || selectedProject.value.id !== project.id
  if (projectChanged) {
    await selectProject(project)
  }

  await nextTick()
  scrollToElement(`[data-project-id="${project.id}"]`, 50)

  const session = sessions.value.find(s => s.id === result.session_id)
  if (!session) return

  const sessionChanged = !selectedSession.value || selectedSession.value.id !== session.id
  if (sessionChanged) {
    selectedSession.value = session
    selectedMessages.value = []
    await loadMessages(session.id)
  }

  await nextTick()
  scrollToElement(`[data-session-id="${session.id}"]`, 100)

  highlightedMessageId.value = result.id
  await nextTick()
  scrollToElement(`[data-message-id="${result.id}"]`, 200)
}

const prevResult = () => {
  if (searchIndex.value > 0) {
    navigateToResult(searchIndex.value - 1)
  }
}

const nextResult = () => {
  if (searchIndex.value < searchResults.value.length - 1) {
    navigateToResult(searchIndex.value + 1)
  }
}

const goToResult = (val) => {
  if (val >= 1 && val <= searchResults.value.length) {
    navigateToResult(val - 1)
  }
}

// ========================================
// Export
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

const handleCopy = async (key) => {
  if (!selectedSession.value) return

  try {
    const [scope, format] = key.split('-')
    const content = await generateExportContent(scope, format)

    if (content) {
      await navigator.clipboard.writeText(content)
      const count = scope === 'selected' ? selectedMessages.value.length : displayMessages.value.length
      message.success(`${t('sessionManager.copySuccess')} (${count})`)
    } else {
      message.warning(t('sessionManager.noContent'))
    }
  } catch (err) {
    console.error('Copy failed:', err)
    message.error(t('messages.operationFailed'))
  }
}

const handleExport = async (key) => {
  if (!selectedSession.value) return

  try {
    const [scope, format] = key.split('-')
    const content = await generateExportContent(scope, format)

    if (content) {
      const ext = format === 'markdown' ? 'md' : 'json'
      const filename = `session-${selectedSession.value.id}-${scope}.${ext}`

      const result = await invoke('saveFile', { filename, content, ext })
      if (result && result.success) {
        message.success(t('sessionManager.exportSuccess'))
      } else if (result && result.canceled) {
        // User canceled
      } else {
        message.error(t('messages.operationFailed'))
      }
    }
  } catch (err) {
    console.error('Export failed:', err)
    message.error(t('messages.operationFailed'))
  }
}

</script>

<style scoped>
.session-manager {
  padding: 16px;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.header h1 {
  font-size: 20px;
  font-weight: 600;
}

.sync-status {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  font-size: 12px;
  color: #888;
}

.main-content {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  margin-top: 12px;
}

.search-nav-total {
  font-size: 12px;
  color: #888;
}
</style>

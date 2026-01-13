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
          @keyup.enter="handleSearch"
          @clear="clearSearchResults"
        >
          <template #prefix>
            <span>🔍</span>
          </template>
        </n-input>
        <!-- Search Button -->
        <n-button type="primary" :loading="searching" @click="handleSearch">
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
      </n-space>
    </div>

    <!-- Sync Status -->
    <div v-if="syncStats" class="sync-status">
      <span>{{ t('sessionManager.lastSync') }}: {{ formatDate(syncStats.timestamp) }}</span>
      <span>{{ syncStats.messagesAdded }} {{ t('sessionManager.newMessages') }}</span>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Left: Project List -->
      <div class="sidebar">
        <div class="sidebar-header">
          <span>{{ t('sessionManager.projects') }}</span>
          <n-tag size="small">{{ projects.length }}</n-tag>
        </div>
        <n-scrollbar style="max-height: calc(100vh - 220px)">
          <n-spin :show="loadingProjects">
            <div v-if="projects.length === 0 && !loadingProjects" class="empty-state">
              <n-empty :description="t('sessionManager.noProjects')" />
              <n-button size="small" @click="handleSync" style="margin-top: 12px">
                {{ t('sessionManager.syncNow') }}
              </n-button>
            </div>
            <div
              v-for="project in projects"
              :key="project.id"
              :data-project-id="project.id"
              class="project-item"
              :class="{ active: selectedProject?.id === project.id }"
              @click="selectProject(project)"
            >
              <div class="project-name">{{ project.name }}</div>
              <div class="project-meta">
                <span>{{ project.session_count || 0 }} {{ t('sessionManager.sessions') }}</span>
              </div>
            </div>
          </n-spin>
        </n-scrollbar>
      </div>

      <!-- Center: Session List -->
      <div class="session-list-panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span>{{ t('sessionManager.sessionList') }}</span>
            <n-tag v-if="selectedProject" size="small" type="info">
              {{ filteredSessions.length }}
            </n-tag>
            <!-- Session tag filter (only show if there are tags in current project) -->
            <n-dropdown v-if="sessionFilterOptions.length > 1" :options="sessionFilterOptions" @select="handleSessionTagFilter">
              <n-button size="tiny" quaternary :type="sessionTagFilter ? 'primary' : 'default'">
                🏷️ {{ sessionTagFilter ? sessionTagFilter.name : t('sessionManager.filterByTag') }}
              </n-button>
            </n-dropdown>
          </div>
          <n-space v-if="selectedSession" :size="4">
            <n-dropdown :options="sessionTagOptions" @select="handleAddSessionTag">
              <n-button size="tiny" quaternary :title="t('sessionManager.addTag')">+🏷️</n-button>
            </n-dropdown>
          </n-space>
        </div>
        <n-scrollbar style="max-height: calc(100vh - 220px)">
          <n-spin :show="loadingSessions">
            <div v-if="!selectedProject" class="empty-state">
              <n-empty :description="t('sessionManager.selectProject')" />
            </div>
            <div v-else-if="filteredSessions.length === 0 && !loadingSessions" class="empty-state">
              <n-empty :description="sessionTagFilter ? t('sessionManager.noTaggedSessions') : t('sessionManager.noSessions')" />
            </div>
            <div
              v-for="session in filteredSessions"
              :key="session.id"
              :data-session-id="session.id"
              class="session-item"
              :class="{ active: selectedSession?.id === session.id }"
              @click="selectSession(session)"
            >
              <div class="session-header-row">
                <div class="session-time">{{ formatDate(session.last_message_at) }}</div>
                <div class="session-actions">
                  <span
                    class="action-icon"
                    :class="{ active: session.is_favorite }"
                    @click.stop="toggleFavorite(session)"
                    :title="session.is_favorite ? t('sessionManager.unfavorite') : t('sessionManager.favorite')"
                  >
                    {{ session.is_favorite ? '⭐' : '☆' }}
                  </span>
                </div>
              </div>
              <div class="session-summary">
                {{ session.firstUserMessage || session.summary || t('sessionManager.newConversation') }}
              </div>
              <div class="session-meta">
                <span>{{ session.message_count || 0 }} {{ t('sessionManager.messages') }}</span>
                <span v-if="session.model" class="model-tag">{{ session.model }}</span>
              </div>
              <div v-if="session.tags && session.tags.length > 0" class="session-tags">
                <n-tag
                  v-for="tag in session.tags"
                  :key="tag.id"
                  size="tiny"
                  :color="{ color: tag.color, textColor: '#fff' }"
                  closable
                  @close="handleRemoveSessionTag(session.id, tag.id)"
                  @click.stop
                >
                  {{ tag.name }}
                </n-tag>
              </div>
            </div>
          </n-spin>
        </n-scrollbar>
      </div>

      <!-- Right: Message Viewer -->
      <div class="message-viewer-panel">
        <div class="panel-header">
          <div class="panel-header-left">
            <span>{{ t('sessionManager.conversation') }}</span>
            <!-- Tag filter dropdown (only show if there are tags in current session) -->
            <n-dropdown v-if="tagFilterOptions.length > 1" :options="tagFilterOptions" @select="handleTagFilter">
              <n-button size="tiny" quaternary :type="activeTagFilter ? 'primary' : 'default'">
                🏷️ {{ activeTagFilter ? activeTagFilter.name : t('sessionManager.filterByTag') }}
              </n-button>
            </n-dropdown>
          </div>
          <n-space v-if="selectedSession">
            <n-tooltip>
              <template #trigger>
                <n-button size="small" quaternary @click="toggleMessageSort">
                  {{ messageSort === 'asc' ? '⬆️' : '⬇️' }}
                </n-button>
              </template>
              {{ messageSort === 'asc' ? t('sessionManager.sortOldToNew') : t('sessionManager.sortNewToOld') }}
            </n-tooltip>
            <n-dropdown :options="exportOptions" @select="handleExport">
              <n-button size="small">{{ t('sessionManager.export') }}</n-button>
            </n-dropdown>
          </n-space>
        </div>
        <n-scrollbar style="max-height: calc(100vh - 220px)">
          <n-spin :show="loadingMessages">
            <div v-if="!selectedSession" class="empty-state">
              <n-empty :description="t('sessionManager.selectSession')" />
            </div>
            <div v-else-if="displayMessages.length === 0 && !loadingMessages" class="empty-state">
              <n-empty :description="activeTagFilter ? t('sessionManager.noTaggedMessages') : t('sessionManager.noMessages')" />
            </div>
            <div v-else class="messages-container" @click="handleLinkClick">
              <div
                v-for="msg in displayMessages"
                :key="msg.id"
                :data-message-id="msg.id"
                class="message-item"
                :class="[msg.role, { highlighted: highlightedMessageId === msg.id, active: selectedMessage?.id === msg.id }]"
                @click="selectMessage(msg)"
              >
                <div class="message-header">
                  <span class="role-label">
                    {{ msg.role === 'user' ? t('sessionManager.user') : t('sessionManager.assistant') }}
                  </span>
                  <div class="message-header-right">
                    <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                    <n-dropdown :options="messageTagOptions" @select="(tagId) => handleAddMessageTag(msg.id, tagId)">
                      <span class="tag-action" @click.stop>🏷️</span>
                    </n-dropdown>
                  </div>
                </div>
                <!-- Message tags -->
                <div v-if="messageTagsMap[msg.id]" class="message-tags">
                  <n-tag
                    v-for="tag in messageTagsMap[msg.id]"
                    :key="tag.id"
                    size="tiny"
                    :color="{ color: tag.color, textColor: '#fff' }"
                    closable
                    @close="handleRemoveMessageTag(msg.id, tag.id)"
                    @click.stop="handleTagFilter(tag.id)"
                  >
                    {{ tag.name }}
                  </n-tag>
                </div>
                <div class="message-content" v-html="formatContent(msg.content)"></div>
                <div v-if="msg.tokens_in || msg.tokens_out" class="message-usage">
                  {{ msg.tokens_in || 0 }} in / {{ msg.tokens_out || 0 }} out
                </div>
              </div>
            </div>
          </n-spin>
        </n-scrollbar>
      </div>
    </div>

    <!-- Tag Management Modal -->
    <n-modal v-model:show="showTagModal" preset="dialog" :title="t('sessionManager.manageTags')">
      <div class="tag-manager">
        <div class="tag-input-row">
          <n-input
            v-model:value="newTagName"
            :placeholder="t('sessionManager.tagName')"
            style="flex: 1"
          />
          <n-color-picker v-model:value="newTagColor" :swatches="tagColors" style="width: 80px" />
          <n-button type="primary" @click="createTag">{{ t('common.add') }}</n-button>
        </div>
        <div class="tag-list">
          <div v-for="tag in allTags" :key="tag.id" class="tag-item">
            <n-tag :color="{ color: tag.color, textColor: '#fff' }">{{ tag.name }}</n-tag>
            <span class="tag-count">{{ tag.usage_count || 0 }}</span>
            <n-button size="tiny" quaternary @click="deleteTag(tag.id)">🗑️</n-button>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { cssVars, initTheme } = useTheme()
const { t, initLocale } = useLocale()

// State
const searchQuery = ref('')
const projects = ref([])
const sessions = ref([])
const messages = ref([])
const selectedProject = ref(null)
const selectedSession = ref(null)
const selectedMessage = ref(null)
const loadingProjects = ref(false)
const loadingSessions = ref(false)
const loadingMessages = ref(false)
const syncing = ref(false)
const syncStats = ref(null)
const messageSort = ref('asc') // 'asc' = 旧到新, 'desc' = 新到旧

// Search
const searchScope = ref('all') // 'all', 'project', 'session'
const searching = ref(false)
const searchResults = ref([])
const searchIndex = ref(0)
const highlightedMessageId = ref(null)

// Search index for display (1-based)
const searchIndexDisplay = computed({
  get: () => searchIndex.value + 1,
  set: (val) => { searchIndex.value = Math.max(0, Math.min(val - 1, searchResults.value.length - 1)) }
})

// Search scope options
const searchScopeOptions = computed(() => [
  { label: t('sessionManager.scopeAll'), value: 'all' },
  { label: t('sessionManager.scopeProject'), value: 'project', disabled: !selectedProject.value },
  { label: t('sessionManager.scopeSession'), value: 'session', disabled: !selectedSession.value }
])

// Tags
const allTags = ref([])
const showTagModal = ref(false)
const newTagName = ref('')
const newTagColor = ref('#1890ff')
const tagColors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96']

// Message tags
const messageTagsMap = ref({}) // { messageId: [tags] }
const activeTagFilter = ref(null) // Currently selected tag for message filtering

// Session tag filter
const sessionTagFilter = ref(null) // Currently selected tag for session filtering

// Export options
const exportOptions = computed(() => [
  { label: 'Markdown', key: 'markdown' },
  { label: 'JSON', key: 'json' }
])

// Tag options for dropdown (legacy - kept for compatibility)
const tagOptions = computed(() => {
  const options = allTags.value.map(tag => ({
    label: tag.name,
    key: tag.id
  }))
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '⚙️ ' + t('sessionManager.manageTags'), key: 'manage' })
  return options
})

// Session tag dropdown options (for session list header)
const sessionTagOptions = computed(() => {
  const options = allTags.value.map(tag => ({
    label: tag.name,
    key: tag.id,
    props: { style: `border-left: 3px solid ${tag.color}; padding-left: 8px;` }
  }))
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '⚙️ ' + t('sessionManager.manageTags'), key: 'manage' })
  return options
})

// Message tag dropdown options (for message items)
const messageTagOptions = computed(() => {
  const options = allTags.value.map(tag => ({
    label: tag.name,
    key: tag.id,
    props: { style: `border-left: 3px solid ${tag.color}; padding-left: 8px;` }
  }))
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '⚙️ ' + t('sessionManager.manageTags'), key: 'manage' })
  return options
})

// Tag filter dropdown options (for conversation header - message level)
// Only show tags that exist in current session's messages
const tagFilterOptions = computed(() => {
  const options = [
    { label: t('sessionManager.showAll'), key: 'all' }
  ]

  // Collect tags used in current session's messages
  const tagCountMap = {} // { tagId: { tag, count } }
  for (const msgId of Object.keys(messageTagsMap.value)) {
    const tags = messageTagsMap.value[msgId]
    for (const tag of tags) {
      if (!tagCountMap[tag.id]) {
        tagCountMap[tag.id] = { tag, count: 0 }
      }
      tagCountMap[tag.id].count++
    }
  }

  // Only add divider and tags if there are any
  const tagEntries = Object.values(tagCountMap)
  if (tagEntries.length > 0) {
    options.push({ type: 'divider', key: 'd0' })
    tagEntries.forEach(({ tag, count }) => {
      options.push({
        label: `${tag.name} (${count})`,
        key: tag.id,
        props: { style: `border-left: 3px solid ${tag.color}; padding-left: 8px;` }
      })
    })
  }

  return options
})

// Session filter dropdown options (for session list header)
// Only show tags that exist in current project's sessions
const sessionFilterOptions = computed(() => {
  const options = [
    { label: t('sessionManager.showAll'), key: 'all' }
  ]

  // Collect tags used in current project's sessions
  const tagCountMap = {} // { tagId: { tag, count } }
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

  // Only add divider and tags if there are any
  const tagEntries = Object.values(tagCountMap)
  if (tagEntries.length > 0) {
    options.push({ type: 'divider', key: 'd0' })
    tagEntries.forEach(({ tag, count }) => {
      options.push({
        label: `${tag.name} (${count})`,
        key: tag.id,
        props: { style: `border-left: 3px solid ${tag.color}; padding-left: 8px;` }
      })
    })
  }

  return options
})

// Filtered sessions by tag
const filteredSessions = computed(() => {
  if (!sessionTagFilter.value) {
    return sessions.value
  }
  return sessions.value.filter(session =>
    session.tags && session.tags.some(tag => tag.id === sessionTagFilter.value.id)
  )
})

// Display messages (filter out empty content, with sort)
const displayMessages = computed(() => {
  let filtered = messages.value.filter(m => {
    const content = String(m.content || '').trim()
    if (!content) return false
    if (content.match(/^\[object \w+\]$/)) return false
    return true
  })

  // Filter by tag if active
  if (activeTagFilter.value) {
    filtered = filtered.filter(m => {
      const tags = messageTagsMap.value[m.id]
      return tags && tags.some(t => t.id === activeTagFilter.value.id)
    })
  }

  // Sort by timestamp
  if (messageSort.value === 'desc') {
    return [...filtered].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  }
  return filtered // default asc (already sorted from DB)
})

// Toggle message sort order
const toggleMessageSort = () => {
  messageSort.value = messageSort.value === 'asc' ? 'desc' : 'asc'
}

// Initialize
onMounted(async () => {
  await initTheme()
  await initLocale()

  // Auto sync on open
  await handleSync()
  await loadTags()
})

// Load projects from database
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

// Load tags
const loadTags = async () => {
  try {
    allTags.value = await invoke('getAllTags')
  } catch (err) {
    console.error('Failed to load tags:', err)
  }
}

// Sync sessions
const handleSync = async () => {
  syncing.value = true
  try {
    const result = await invoke('syncSessions')
    if (result.status === 'success') {
      syncStats.value = {
        timestamp: Date.now(),
        messagesAdded: result.messagesAdded,
        sessionsAdded: result.sessionsAdded
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

// Select project
const selectProject = async (project) => {
  selectedProject.value = project
  selectedSession.value = null
  selectedMessage.value = null
  messages.value = []
  messageTagsMap.value = {} // Clear message tags
  activeTagFilter.value = null // Clear message tag filter
  sessionTagFilter.value = null // Clear session tag filter
  await loadSessions(project.id)
}

// Load sessions for project
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

// Select session
const selectSession = async (session) => {
  selectedSession.value = session
  selectedMessage.value = null // Clear selected message when switching session
  await loadMessages(session.id)
}

// Select message (toggle)
const selectMessage = (msg) => {
  // Clear search/filter highlight when clicking
  highlightedMessageId.value = null

  if (selectedMessage.value?.id === msg.id) {
    selectedMessage.value = null // Deselect if clicking same message
  } else {
    selectedMessage.value = msg
  }
}

// Load messages for session
const loadMessages = async (sessionId) => {
  loadingMessages.value = true
  try {
    messages.value = await invoke('getSessionMessages', { sessionId, limit: 1000 })
    // Also load message tags
    await loadMessageTags()
  } catch (err) {
    console.error('Failed to load messages:', err)
    message.error(t('messages.loadFailed'))
  } finally {
    loadingMessages.value = false
  }
}

// Toggle favorite
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

// Handle add tag
const handleAddTag = async (key) => {
  if (key === 'manage') {
    showTagModal.value = true
    return
  }

  if (!selectedSession.value) return

  try {
    await invoke('addTagToSession', { sessionId: selectedSession.value.id, tagId: key })
    // Refresh session list to show new tag
    await loadSessions(selectedProject.value.id)
    message.success(t('messages.operationSuccess'))
  } catch (err) {
    console.error('Failed to add tag:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Create tag
const createTag = async () => {
  if (!newTagName.value.trim()) return

  try {
    await invoke('createTag', { name: newTagName.value.trim(), color: newTagColor.value })
    newTagName.value = ''
    await loadTags()
    message.success(t('messages.operationSuccess'))
  } catch (err) {
    console.error('Failed to create tag:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Delete tag
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

// Handle add session tag (from session list header dropdown)
const handleAddSessionTag = async (key) => {
  if (key === 'manage') {
    showTagModal.value = true
    return
  }

  if (!selectedSession.value) {
    message.warning(t('sessionManager.selectSession'))
    return
  }

  try {
    await invoke('addTagToSession', { sessionId: selectedSession.value.id, tagId: key })
    // Refresh session list to show new tag
    await loadSessions(selectedProject.value.id)
    await loadTags() // Refresh tag counts
    message.success(t('messages.operationSuccess'))
  } catch (err) {
    console.error('Failed to add session tag:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Handle add message tag
const handleAddMessageTag = async (messageId, tagId) => {
  if (tagId === 'manage') {
    showTagModal.value = true
    return
  }

  try {
    await invoke('addTagToMessage', { messageId, tagId })
    await loadMessageTags() // Refresh message tags
    await loadTags() // Refresh tag counts
    message.success(t('messages.operationSuccess'))
  } catch (err) {
    console.error('Failed to add message tag:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Handle remove message tag
const handleRemoveMessageTag = async (messageId, tagId) => {
  try {
    await invoke('removeTagFromMessage', { messageId, tagId })
    await loadMessageTags() // Refresh message tags
    await loadTags() // Refresh tag counts
    message.success(t('messages.deleteSuccess'))
  } catch (err) {
    console.error('Failed to remove message tag:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Handle session tag filter (filter sessions by tag)
const handleSessionTagFilter = (key) => {
  if (key === 'all') {
    sessionTagFilter.value = null
    return
  }
  const tag = allTags.value.find(t => t.id === key)
  sessionTagFilter.value = tag || null
}

// Handle remove session tag
const handleRemoveSessionTag = async (sessionId, tagId) => {
  try {
    await invoke('removeTagFromSession', { sessionId, tagId })
    // Refresh session list to update tags
    await loadSessions(selectedProject.value.id)
    await loadTags() // Refresh tag counts
    message.success(t('messages.deleteSuccess'))
  } catch (err) {
    console.error('Failed to remove session tag:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Handle tag filter (filter messages by tag or navigate to tagged messages)
// Handle message tag filter (filter messages by tag)
const handleTagFilter = (key) => {
  if (key === 'all') {
    activeTagFilter.value = null
    return
  }

  const tag = allTags.value.find(t => t.id === key)
  activeTagFilter.value = tag || null
}

// Load message tags for current session
const loadMessageTags = async () => {
  if (!selectedSession.value) {
    messageTagsMap.value = {}
    return
  }

  try {
    const taggedMessages = await invoke('getSessionTaggedMessages', selectedSession.value.id)

    // Group tags by message ID
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

// Search
const handleSearch = async () => {
  if (!searchQuery.value.trim()) return

  // Clear tag filters before searching
  sessionTagFilter.value = null
  activeTagFilter.value = null

  searching.value = true
  try {
    // Determine search scope
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
      // Auto navigate to first result
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

// Clear search results
const clearSearchResults = () => {
  searchResults.value = []
  searchIndex.value = 0
  highlightedMessageId.value = null
}

// Helper: scroll element into view within n-scrollbar
const scrollToElement = (selector, delay = 0) => {
  setTimeout(() => {
    const el = document.querySelector(selector)
    if (el) {
      // Find the scrollbar container (n-scrollbar uses .n-scrollbar-container)
      const scrollContainer = el.closest('.n-scrollbar-container')
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const scrollTop = scrollContainer.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2)
        scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' })
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, delay)
}

// Navigate to specific search result
const navigateToResult = async (index) => {
  if (index < 0 || index >= searchResults.value.length) return

  const result = searchResults.value[index]
  searchIndex.value = index

  // Find the project by path
  const project = projects.value.find(p => p.path === result.project_path)

  if (!project) {
    console.warn('Project not found for result:', result)
    return
  }

  // If project changed, load it first
  const projectChanged = !selectedProject.value || selectedProject.value.id !== project.id
  if (projectChanged) {
    await selectProject(project)
  }

  // Wait for DOM update, then scroll to project
  await nextTick()
  scrollToElement(`[data-project-id="${project.id}"]`, 50)

  // Find the session by id
  const session = sessions.value.find(s => s.id === result.session_id)

  if (!session) {
    console.warn('Session not found for result:', result)
    return
  }

  // If session changed, load it
  const sessionChanged = !selectedSession.value || selectedSession.value.id !== session.id
  if (sessionChanged) {
    await selectSession(session)
  }

  // Wait for DOM update, then scroll to session
  await nextTick()
  scrollToElement(`[data-session-id="${session.id}"]`, 100)

  // Highlight the message
  highlightedMessageId.value = result.id

  // Scroll to the message after messages loaded
  await nextTick()
  scrollToElement(`[data-message-id="${result.id}"]`, 200)
}

// Previous result
const prevResult = () => {
  if (searchIndex.value > 0) {
    navigateToResult(searchIndex.value - 1)
  }
}

// Next result
const nextResult = () => {
  if (searchIndex.value < searchResults.value.length - 1) {
    navigateToResult(searchIndex.value + 1)
  }
}

// Go to result by index (from input)
const goToResult = (val) => {
  if (val >= 1 && val <= searchResults.value.length) {
    navigateToResult(val - 1)
  }
}

// Export
const handleExport = async (format) => {
  if (!selectedSession.value) return

  try {
    const content = await invoke('exportSession', {
      sessionId: selectedSession.value.id,
      format
    })

    await navigator.clipboard.writeText(content)
    message.success(t('sessionManager.exportSuccess'))
  } catch (err) {
    console.error('Export failed:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Helpers
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

const formatContent = (content) => {
  if (!content) return ''

  let text = String(content)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Convert URLs to clickable links
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g
  text = text.replace(urlRegex, '<a href="$1" class="external-link" data-url="$1">$1</a>')

  text = text.replace(/\n/g, '<br>')

  return text
}

const handleLinkClick = (event) => {
  const target = event.target
  if (target.classList.contains('external-link')) {
    event.preventDefault()
    const url = target.dataset.url
    if (url && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    }
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

/* Sidebar */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--bg-color-secondary, #fff);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  font-weight: 600;
  font-size: 14px;
}

.project-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background-color 0.15s;
}

.project-item:hover {
  background: var(--hover-color, #f5f5f5);
}

.project-item.active {
  background: var(--primary-color-light, #e6f4ff);
}

.project-name {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-meta {
  font-size: 11px;
  color: #888;
}

/* Session List */
.session-list-panel {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-color-secondary, #fff);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  font-weight: 600;
  font-size: 14px;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid var(--border-color, #e0e0e0);
  transition: all 0.15s;
}

.session-item:hover {
  border-color: var(--primary-color, #1890ff);
}

.session-item.active {
  border-color: var(--primary-color, #1890ff);
  background: var(--primary-color-light, #e6f4ff);
}

.session-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.session-time {
  font-size: 11px;
  color: #888;
}

.session-actions {
  display: flex;
  gap: 4px;
}

.action-icon {
  cursor: pointer;
  font-size: 14px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.action-icon:hover,
.action-icon.active {
  opacity: 1;
}

.session-summary {
  font-size: 13px;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.session-meta {
  font-size: 11px;
  color: #888;
  display: flex;
  gap: 8px;
  align-items: center;
}

.model-tag {
  background: var(--tag-bg, #f0f0f0);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.session-tags {
  margin-top: 6px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* Message Viewer */
.message-viewer-panel {
  flex: 1;
  background: var(--bg-color-secondary, #fff);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  min-width: 0;
}

.messages-container {
  padding: 8px 6px;
}

.message-item {
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--message-bg, #f8f8f8);
}

.message-item.user {
  background: var(--user-message-bg, #e6f4ff);
  margin-left: 40px;
}

.message-item.assistant {
  background: var(--assistant-message-bg, #f0f0f0);
  margin-right: 40px;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.role-label {
  font-weight: 600;
  color: var(--primary-color, #1890ff);
}

.message-time {
  color: #888;
}

.message-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-action {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.tag-action:hover {
  opacity: 1;
}

.message-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
  margin-bottom: 4px;
}

.message-content {
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.message-content :deep(.external-link) {
  color: #1890ff;
  text-decoration: underline;
  cursor: pointer;
  word-break: break-all;
}

.message-content :deep(.external-link:hover) {
  color: #40a9ff;
}

.message-usage {
  margin-top: 8px;
  font-size: 11px;
  color: #888;
  text-align: right;
}

/* Highlighted message (search result) */
.message-item.highlighted {
  outline: 2px solid var(--primary-color, #1890ff);
  outline-offset: 2px;
  animation: highlight-pulse 1s ease-in-out;
}

.message-item.active {
  outline: 2px solid var(--primary-color, #1890ff);
  outline-offset: 2px;
}

.message-item {
  cursor: pointer;
}

@keyframes highlight-pulse {
  0%, 100% { outline-color: var(--primary-color, #1890ff); }
  50% { outline-color: #52c41a; }
}

/* Search navigation */
.search-nav-total {
  font-size: 12px;
  color: #888;
}

/* Empty state */
.empty-state {
  padding: 40px 20px;
  text-align: center;
}

/* Tag Manager Modal */
.tag-manager {
  padding: 8px 0;
}

.tag-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tag-list {
  max-height: 300px;
  overflow-y: auto;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.tag-count {
  font-size: 12px;
  color: #888;
  margin-left: auto;
}

/* Dark theme */
:root[data-theme="dark"] .sidebar,
:root[data-theme="dark"] .session-list-panel,
:root[data-theme="dark"] .message-viewer-panel {
  background: #252525;
  border-color: #333;
}

:root[data-theme="dark"] .project-item:hover,
:root[data-theme="dark"] .session-item:hover {
  background: #333;
}

:root[data-theme="dark"] .project-item.active,
:root[data-theme="dark"] .session-item.active {
  background: #2a3f4f;
}

:root[data-theme="dark"] .message-item.user {
  background: #2a3f4f;
}

:root[data-theme="dark"] .message-item.assistant {
  background: #333;
}

:root[data-theme="dark"] .model-tag {
  background: #444;
}

:root[data-theme="dark"] .message-content :deep(.external-link) {
  color: #69b1ff;
}

:root[data-theme="dark"] .message-content :deep(.external-link:hover) {
  color: #91caff;
}

:root[data-theme="dark"] .tag-item {
  border-color: #333;
}
</style>

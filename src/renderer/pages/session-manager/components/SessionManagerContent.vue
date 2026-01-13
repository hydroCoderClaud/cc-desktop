<template>
  <div class="session-manager" :style="cssVars">
    <!-- Header -->
    <div class="header">
      <h1>{{ t('sessionManager.title') }}</h1>
      <n-space>
        <n-input
          v-model:value="searchQuery"
          :placeholder="t('sessionManager.searchPlaceholder')"
          clearable
          style="width: 250px"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <span>🔍</span>
          </template>
        </n-input>
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
          <span>{{ t('sessionManager.sessionList') }}</span>
          <n-tag v-if="selectedProject" size="small" type="info">
            {{ sessions.length }} {{ t('sessionManager.sessions') }}
          </n-tag>
        </div>
        <n-scrollbar style="max-height: calc(100vh - 220px)">
          <n-spin :show="loadingSessions">
            <div v-if="!selectedProject" class="empty-state">
              <n-empty :description="t('sessionManager.selectProject')" />
            </div>
            <div v-else-if="sessions.length === 0 && !loadingSessions" class="empty-state">
              <n-empty :description="t('sessionManager.noSessions')" />
            </div>
            <div
              v-for="session in sessions"
              :key="session.id"
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
              <div v-if="session.tag_names" class="session-tags">
                <n-tag
                  v-for="tagName in session.tag_names.split(',')"
                  :key="tagName"
                  size="tiny"
                  type="info"
                >
                  {{ tagName }}
                </n-tag>
              </div>
            </div>
          </n-spin>
        </n-scrollbar>
      </div>

      <!-- Right: Message Viewer -->
      <div class="message-viewer-panel">
        <div class="panel-header">
          <span>{{ t('sessionManager.conversation') }}</span>
          <n-space v-if="selectedSession">
            <n-tooltip>
              <template #trigger>
                <n-button size="small" quaternary @click="toggleMessageSort">
                  {{ messageSort === 'asc' ? '⬆️' : '⬇️' }}
                </n-button>
              </template>
              {{ messageSort === 'asc' ? t('sessionManager.sortOldToNew') : t('sessionManager.sortNewToOld') }}
            </n-tooltip>
            <n-dropdown :options="tagOptions" @select="handleAddTag">
              <n-button size="small">🏷️ {{ t('sessionManager.addTag') }}</n-button>
            </n-dropdown>
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
              <n-empty :description="t('sessionManager.noMessages')" />
            </div>
            <div v-else class="messages-container" @click="handleLinkClick">
              <div
                v-for="message in displayMessages"
                :key="message.id"
                class="message-item"
                :class="message.role"
              >
                <div class="message-header">
                  <span class="role-label">
                    {{ message.role === 'user' ? t('sessionManager.user') : t('sessionManager.assistant') }}
                  </span>
                  <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                </div>
                <div class="message-content" v-html="formatContent(message.content)"></div>
                <div v-if="message.tokens_in || message.tokens_out" class="message-usage">
                  {{ message.tokens_in || 0 }} in / {{ message.tokens_out || 0 }} out
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
import { ref, computed, onMounted, watch } from 'vue'
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
const loadingProjects = ref(false)
const loadingSessions = ref(false)
const loadingMessages = ref(false)
const syncing = ref(false)
const syncStats = ref(null)
const messageSort = ref('asc') // 'asc' = 旧到新, 'desc' = 新到旧

// Tags
const allTags = ref([])
const showTagModal = ref(false)
const newTagName = ref('')
const newTagColor = ref('#1890ff')
const tagColors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96']

// Export options
const exportOptions = computed(() => [
  { label: 'Markdown', key: 'markdown' },
  { label: 'JSON', key: 'json' }
])

// Tag options for dropdown
const tagOptions = computed(() => {
  const options = allTags.value.map(tag => ({
    label: tag.name,
    key: tag.id
  }))
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '⚙️ ' + t('sessionManager.manageTags'), key: 'manage' })
  return options
})

// Display messages (filter out empty content, with sort)
const displayMessages = computed(() => {
  const filtered = messages.value.filter(m => {
    const content = String(m.content || '').trim()
    if (!content) return false
    if (content.match(/^\[object \w+\]$/)) return false
    return true
  })

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
  messages.value = []
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
  await loadMessages(session.id)
}

// Load messages for session
const loadMessages = async (sessionId) => {
  loadingMessages.value = true
  try {
    messages.value = await invoke('getSessionMessages', { sessionId, limit: 1000 })
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

// Search
const handleSearch = async () => {
  if (!searchQuery.value.trim()) return

  message.info(t('sessionManager.searching'))
  try {
    const results = await invoke('searchSessions', {
      query: searchQuery.value,
      projectId: selectedProject.value?.id,
      limit: 100
    })
    console.log('Search results:', results)
    message.success(`${t('sessionManager.found')} ${results.length} ${t('sessionManager.results')}`)
    // TODO: Display search results in a better way
  } catch (err) {
    console.error('Search failed:', err)
    message.error(t('messages.operationFailed'))
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
  padding: 8px 0;
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

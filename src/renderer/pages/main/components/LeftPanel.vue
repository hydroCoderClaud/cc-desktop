<template>
  <div class="left-panel" :class="{ 'dark': isDark }">
    <!-- Header -->
    <div class="panel-header">
      <div class="logo">Claude Code</div>
    </div>

    <!-- Project Selector -->
    <div class="project-section">
      <div class="section-header">
        <span>{{ t('main.projects') }}</span>
        <button class="open-project-btn" @click="$emit('open-project')" :title="t('project.openExisting')">
          📂
        </button>
      </div>

      <div class="project-selector-row">
        <n-select
          v-model:value="selectedProjectId"
          :options="projectOptions"
          :placeholder="t('main.selectProject')"
          clearable
          filterable
          class="project-dropdown"
          @update:value="handleProjectChange"
        />
        <n-dropdown
          v-if="selectedProjectId"
          trigger="click"
          :options="projectMenuOptions"
          @select="handleProjectMenuSelect"
          placement="bottom-end"
        >
          <button class="project-settings-btn" :title="t('main.projectSettings')">
            ⚙️
          </button>
        </n-dropdown>
      </div>
    </div>

    <!-- New Session Button (固定不滚动) -->
    <div class="new-session-area" v-if="currentProject && currentProject.pathValid">
      <button class="new-session-btn" @click="handleNewSession">
        <span class="icon">+</span>
        <span>{{ t('session.newSession') }}</span>
      </button>
    </div>

    <!-- Session Area (滚动区域) -->
    <div class="session-section">
      <!-- Active Sessions -->
      <div class="sessions-group" v-if="activeSessions.length > 0">
        <div class="group-header">
          <span class="icon">🟢</span>
          <span>{{ t('session.running') }}</span>
          <span class="count">({{ activeSessions.length }})</span>
        </div>
        <div
          v-for="session in activeSessions"
          :key="session.id"
          class="session-item"
          :class="{
            active: focusedSessionId === session.id,
            'other-project': currentProject && session.projectId !== currentProject.id
          }"
          @click="handleSelectSession(session)"
        >
          <div class="session-info">
            <div class="session-title">
              <span class="status-dot running"></span>
              <span class="title-text">{{ session.projectName }}：{{ session.title || t('session.session') }}</span>
            </div>
          </div>
          <div class="session-actions">
            <button
              class="rename-btn"
              @click.stop="openRenameDialog(session)"
              title="✏️"
            >
              ✏️
            </button>
            <button
              class="close-btn"
              @click.stop="handleCloseSession(session)"
              :title="t('session.close')"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <!-- History Sessions -->
      <div class="sessions-group" v-if="currentProject && displayedHistorySessions.length > 0">
        <div class="group-header">
          <span class="icon">📜</span>
          <span>{{ t('session.history') }}</span>
          <span class="count">({{ displayedHistorySessions.length }}/{{ historySessions.length }})</span>
          <span class="view-more" @click.stop="handleViewMore" v-if="historySessions.length > displayedHistorySessions.length">
            {{ t('session.viewMore') }}
          </span>
        </div>
        <div
          v-for="session in displayedHistorySessions"
          :key="session.session_uuid"
          class="session-item history"
          @click="handleOpenHistorySession(session)"
        >
          <div class="session-info">
            <div class="session-title">
              <span class="icon">💬</span>
              <span class="title-text">{{ formatSessionName(session) }}</span>
            </div>
            <div class="session-meta">
              {{ formatDate(session.created_at) }} · {{ session.message_count || 0 }} {{ t('session.messages') }}
            </div>
          </div>
          <button
            class="delete-btn"
            @click.stop="handleDeleteHistorySession(session)"
            :title="t('session.delete')"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!currentProject" class="empty-hint">
        {{ t('main.pleaseSelectProject') }}
      </div>
      <div v-else-if="activeSessions.length === 0 && historySessions.length === 0" class="empty-hint">
        {{ t('session.noSessions') }}
      </div>
    </div>

    <!-- Footer -->
    <div class="panel-footer">
      <div class="footer-row">
        <n-dropdown
          trigger="click"
          :options="settingsOptions"
          @select="handleSettingsSelect"
          placement="top-start"
        >
          <button class="settings-btn">
            <span class="icon">⚙️</span>
            <span class="text">{{ t('main.settingsMenu') }}</span>
          </button>
        </n-dropdown>

        <button class="theme-toggle-btn" @click="$emit('toggle-theme')" :title="isDark ? t('main.toggleLight') : t('main.toggleDark')">
          <span>{{ isDark ? '☀️' : '🌙' }}</span>
        </button>
      </div>
    </div>

    <!-- New Session Dialog -->
    <n-modal
      v-model:show="showNewSessionDialog"
      preset="card"
      :title="t('session.newSession')"
      style="width: 360px;"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            v-model:value="newSessionTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @keyup.enter="confirmNewSession"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="showNewSessionDialog = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="confirmNewSession">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Rename Session Dialog -->
    <n-modal
      v-model:show="showRenameDialog"
      preset="card"
      :title="t('session.rename') || '重命名会话'"
      style="width: 360px;"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            v-model:value="renameTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @keyup.enter="confirmRename"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="showRenameDialog = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="confirmRename">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMessage, NSelect, NDropdown, NModal, NForm, NFormItem, NInput, NButton } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { t } = useLocale()

// Props
const props = defineProps({
  projects: {
    type: Array,
    default: () => []
  },
  currentProject: {
    type: Object,
    default: null
  },
  isDark: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits([
  'open-project',
  'select-project',
  'toggle-theme',
  'context-action',
  'session-created',
  'session-selected',
  'session-closed'
])

// State
const selectedProjectId = ref(null)
const activeSessions = ref([])
const historySessions = ref([])
const focusedSessionId = ref(null)
const maxHistorySessions = ref(10)

// New session dialog
const showNewSessionDialog = ref(false)
const newSessionTitle = ref('')

// Rename session dialog
const showRenameDialog = ref(false)
const renameTitle = ref('')
const renamingSession = ref(null)

// 限制显示的历史会话
const displayedHistorySessions = computed(() => {
  return historySessions.value.slice(0, maxHistorySessions.value)
})

// Watch currentProject changes
watch(() => props.currentProject, (newProject) => {
  selectedProjectId.value = newProject?.id || null
}, { immediate: true })

// Project dropdown options
const projectOptions = computed(() => {
  return props.projects.map(project => ({
    label: `${project.icon || '📁'} ${project.name}`,
    value: project.id,
    disabled: !project.pathValid
  }))
})

// Project settings menu options
const projectMenuOptions = computed(() => [
  { label: '📂 ' + t('project.openFolder'), key: 'openFolder' },
  { label: '✏️ ' + t('project.edit'), key: 'edit' },
  { type: 'divider', key: 'd1' },
  { label: '👁️ ' + t('project.hide'), key: 'hide' },
  { label: '🗑️ ' + t('project.delete'), key: 'delete', props: { style: { color: '#e74c3c' } } }
])

// Settings dropdown options
const settingsOptions = computed(() => [
  { label: '🔑 ' + t('settingsMenu.apiConfig'), key: 'api-config' },
  { label: '🏪 ' + t('settingsMenu.providerManager'), key: 'provider-manager' },
  { label: '⚙️ ' + t('settingsMenu.globalSettings'), key: 'global-settings' },
  { type: 'divider', key: 'd1' },
  { label: '📜 ' + t('settingsMenu.sessionHistory'), key: 'session-history' }
])

// Handle project selection change
const handleProjectChange = async (projectId) => {
  if (projectId === null) {
    emit('select-project', null)
    return
  }
  const project = props.projects.find(p => p.id === projectId)
  if (project) {
    // 更新最后打开时间（用于排序）
    try {
      await invoke('touchProject', projectId)
    } catch (err) {
      console.error('Failed to touch project:', err)
    }
    emit('select-project', project)
  }
}

// Handle project menu actions
const handleProjectMenuSelect = (key) => {
  if (!props.currentProject) return
  emit('context-action', { action: key, project: props.currentProject })
}

// Handle settings menu
const handleSettingsSelect = (key) => {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  switch (key) {
    case 'api-config':
      window.electronAPI.openProfileManager()
      break
    case 'provider-manager':
      window.electronAPI.openProviderManager()
      break
    case 'global-settings':
      window.electronAPI.openGlobalSettings()
      break
    case 'session-history':
      window.electronAPI.openSessionManager()
      break
  }
}

// 查看更多历史会话
const handleViewMore = () => {
  if (window.electronAPI && props.currentProject) {
    window.electronAPI.openSessionManager({ projectPath: props.currentProject.path })
  }
}

// Load active sessions
const loadActiveSessions = async () => {
  try {
    const sessions = await invoke('listActiveSessions', true)
    activeSessions.value = sessions
  } catch (err) {
    console.error('Failed to load active sessions:', err)
    activeSessions.value = []
  }
}

// Load history sessions
const loadHistorySessions = async () => {
  if (!props.currentProject) {
    historySessions.value = []
    return
  }

  try {
    const sessions = await invoke('getFileBasedSessions', props.currentProject.path)
    historySessions.value = (sessions || [])
      .filter(s => s.messageCount > 0)
      // 过滤掉 warmup 预热会话
      .filter(s => !s.firstUserMessage?.toLowerCase().includes('warmup'))
      .map(s => ({
        ...s,
        session_uuid: s.id,
        name: s.firstUserMessage,
        message_count: s.messageCount,
        created_at: s.startTime
      }))
  } catch (err) {
    console.error('Failed to load history sessions:', err)
    historySessions.value = []
  }
}

// Format session name
const formatSessionName = (session) => {
  if (session.name) return session.name
  return `${t('session.session')} ${session.session_uuid?.slice(0, 8) || session.id}`
}

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date

  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.getDate() === yesterday.getDate()) {
    return t('common.yesterday') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

// New session
const handleNewSession = async () => {
  if (!props.currentProject) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!props.currentProject.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  // Check session count limit
  try {
    const runningCount = await invoke('getRunningSessionCount')
    const maxSessions = await invoke('getMaxActiveSessions')
    if (runningCount >= maxSessions) {
      message.warning(t('session.maxSessionsReached', { max: maxSessions }))
      return
    }
  } catch (err) {
    console.error('Failed to check session limit:', err)
  }

  newSessionTitle.value = ''
  showNewSessionDialog.value = true
}

// Confirm new session
const confirmNewSession = async () => {
  try {
    const result = await invoke('createActiveSession', {
      projectId: props.currentProject.id,
      projectPath: props.currentProject.path,
      projectName: props.currentProject.name,
      title: newSessionTitle.value.trim(),
      apiProfileId: props.currentProject.api_profile_id
    })

    if (result.success) {
      showNewSessionDialog.value = false
      await loadActiveSessions()
      focusedSessionId.value = result.session.id
      emit('session-created', result.session)
      message.success(t('messages.connectionSuccess'))
    } else {
      message.error(result.error || t('messages.connectionFailed'))
    }
  } catch (err) {
    console.error('Failed to create session:', err)
    message.error(t('messages.connectionFailed'))
  }
}

// Select active session
const handleSelectSession = (session) => {
  focusedSessionId.value = session.id
  emit('session-selected', session)
}

// Open rename dialog
const openRenameDialog = (session) => {
  renamingSession.value = session
  renameTitle.value = session.title || ''
  showRenameDialog.value = true
}

// Confirm rename
const confirmRename = async () => {
  if (!renamingSession.value) return

  try {
    await invoke('renameActiveSession', {
      sessionId: renamingSession.value.id,
      newTitle: renameTitle.value.trim()
    })
    showRenameDialog.value = false
    await loadActiveSessions()
    message.success(t('messages.saveSuccess'))
  } catch (err) {
    console.error('Failed to rename session:', err)
    message.error(t('messages.saveFailed'))
  }
}

// Close active session
const handleCloseSession = async (session) => {
  try {
    await invoke('closeActiveSession', session.id)
    await loadActiveSessions()

    if (focusedSessionId.value === session.id) {
      focusedSessionId.value = null
    }

    emit('session-closed', session)
  } catch (err) {
    console.error('Failed to close session:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Open history session
const handleOpenHistorySession = async (session) => {
  if (!props.currentProject) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!props.currentProject.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  // 检查是否已有运行中的会话关联了这个历史会话
  const existingSession = activeSessions.value.find(
    s => s.resumeSessionId === session.session_uuid
  )
  if (existingSession) {
    // 直接选中已有的运行中会话
    focusedSessionId.value = existingSession.id
    emit('session-selected', existingSession)
    return
  }

  // Check session count limit
  try {
    const runningCount = await invoke('getRunningSessionCount')
    const maxSessions = await invoke('getMaxActiveSessions')
    if (runningCount >= maxSessions) {
      message.warning(t('session.maxSessionsReached', { max: maxSessions }))
      return
    }
  } catch (err) {
    console.error('Failed to check session limit:', err)
  }

  try {
    const result = await invoke('createActiveSession', {
      projectId: props.currentProject.id,
      projectPath: props.currentProject.path,
      projectName: props.currentProject.name,
      title: session.name || `${t('session.resume')}: ${session.session_uuid?.slice(0, 8)}`,
      apiProfileId: props.currentProject.api_profile_id,
      resumeSessionId: session.session_uuid
    })

    if (result.success) {
      await loadActiveSessions()
      focusedSessionId.value = result.session.id
      emit('session-created', result.session)
      message.success(t('session.resumeSuccess') || '会话已恢复')
    } else {
      message.error(result.error || t('messages.connectionFailed'))
    }
  } catch (err) {
    console.error('Failed to resume session:', err)
    message.error(t('messages.connectionFailed'))
  }
}

// Delete history session
const handleDeleteHistorySession = async (session) => {
  // 检查该会话是否正在运行（通过 resumeSessionId 关联）
  const isRunning = activeSessions.value.some(
    s => s.resumeSessionId === session.session_uuid
  )
  if (isRunning) {
    message.warning(t('session.cannotDeleteRunning'))
    return
  }

  const confirmDelete = window.confirm(
    `${t('session.deleteConfirm', { name: session.name || session.session_uuid?.slice(0, 8) })}\n\n${t('session.deleteWarning')}`
  )
  if (!confirmDelete) return

  try {
    const result = await invoke('deleteSessionFile', {
      projectPath: props.currentProject.path,
      sessionId: session.session_uuid
    })

    if (result.success) {
      message.success(t('session.deleted'))
      await loadHistorySessions()
    } else {
      message.error(result.error || t('messages.operationFailed'))
    }
  } catch (err) {
    console.error('Failed to delete session:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Watch project change to reload sessions
watch(() => props.currentProject, async (newProject) => {
  if (newProject) {
    await Promise.all([
      loadActiveSessions(),
      loadHistorySessions()
    ])
  } else {
    historySessions.value = []
  }
}, { immediate: true })

// Listen for session events
let cleanupFns = []

onMounted(async () => {
  // 加载历史会话显示上限配置
  try {
    const max = await invoke('getMaxHistorySessions')
    maxHistorySessions.value = max || 10
  } catch (err) {
    console.error('Failed to load maxHistorySessions:', err)
  }

  if (window.electronAPI) {
    cleanupFns.push(
      window.electronAPI.onSessionStarted(() => {
        loadActiveSessions()
      })
    )

    cleanupFns.push(
      window.electronAPI.onSessionExit(() => {
        loadActiveSessions()
      })
    )
  }
})

onUnmounted(() => {
  cleanupFns.forEach(fn => fn && fn())
})

// Expose methods
defineExpose({
  loadActiveSessions,
  loadHistorySessions,
  focusedSessionId,
  handleNewSession  // 暴露给外部用于快捷键调用
})
</script>

<style scoped>
.left-panel {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e5e5e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.left-panel.dark {
  background: #242424;
  border-color: #333333;
}

/* Header */
.panel-header {
  padding: 16px;
  border-bottom: 1px solid #e5e5e0;
}

.dark .panel-header {
  border-color: #333333;
}

.logo {
  font-family: 'Crimson Pro', serif;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

/* Project Section */
.project-section {
  padding: 12px;
  border-bottom: 1px solid #e5e5e0;
}

.dark .project-section {
  border-color: #333333;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #8c8c8c;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.open-project-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.open-project-btn:hover {
  background: #f5f5f0;
}

.dark .open-project-btn:hover {
  background: #333333;
}

.project-selector-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.project-dropdown {
  flex: 1;
}

.project-settings-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #f5f5f0;
  border: 1px solid #e5e5e0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  flex-shrink: 0;
}

.project-settings-btn:hover {
  background: #e8e8e3;
  border-color: #ff6b35;
}

.dark .project-settings-btn {
  background: #333333;
  border-color: #444444;
}

.dark .project-settings-btn:hover {
  background: #404040;
  border-color: #ff6b35;
}

/* New Session Area (固定不滚动) */
.new-session-area {
  padding: 12px;
  border-bottom: 1px solid #e5e5e0;
  flex-shrink: 0;
}

.dark .new-session-area {
  border-color: #333333;
}

.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: #ff6b35;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.new-session-btn:hover {
  background: #ff5722;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.new-session-btn .icon {
  font-size: 16px;
  font-weight: bold;
}

/* Session Section (滚动区域) */
.session-section {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Sessions Group */
.sessions-group {
  margin-bottom: 16px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #8c8c8c;
  text-transform: uppercase;
  padding: 8px 4px;
}

.group-header .icon {
  font-size: 12px;
}

.group-header .count {
  font-weight: 400;
}

.group-header .view-more {
  margin-left: auto;
  font-size: 11px;
  color: #ff6b35;
  cursor: pointer;
  font-weight: 500;
  text-transform: none;
}

.group-header .view-more:hover {
  text-decoration: underline;
}

/* Session Item */
.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  background: #f5f5f0;
}

.dark .session-item:hover {
  background: #333333;
}

.session-item.active {
  background: #fff3e0;
  border: 1px solid #ff6b35;
}

.dark .session-item.active {
  background: #3a2a1a;
}

.session-item.other-project {
  opacity: 0.7;
}

.session-info {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.session-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.session-title .icon {
  font-size: 12px;
  flex-shrink: 0;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.running {
  background: #52c41a;
}

.session-meta {
  font-size: 11px;
  color: #8c8c8c;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Session Actions */
.session-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-item:hover .session-actions {
  opacity: 1;
}

/* Close/Delete/Rename Button */
.close-btn,
.delete-btn,
.rename-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 12px;
  color: #cccccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.rename-btn:hover {
  background: #e8e8e3;
}

.dark .rename-btn:hover {
  background: #404040;
}

.close-btn:hover {
  background: #ff6b35;
  color: white;
}

.delete-btn:hover {
  background: #ff4d4f;
  color: white;
}

/* Empty Hint */
.empty-hint {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: #999999;
}

/* Footer */
.panel-footer {
  border-top: 1px solid #e5e5e0;
  padding: 12px;
  margin-top: auto;
}

.dark .panel-footer {
  border-color: #333333;
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f5f5f0;
  border: 1px solid #e5e5e0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: #2d2d2d;
}

.settings-btn:hover {
  background: #e8e8e3;
  border-color: #ff6b35;
}

.dark .settings-btn {
  background: #333333;
  border-color: #444444;
  color: #e8e8e8;
}

.dark .settings-btn:hover {
  background: #404040;
  border-color: #ff6b35;
}

.theme-toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f5f5f0;
  border: 1px solid #e5e5e0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 18px;
}

.theme-toggle-btn:hover {
  transform: scale(1.05);
  border-color: #ff6b35;
}

.dark .theme-toggle-btn {
  background: #333333;
  border-color: #444444;
}

/* Dialog Footer */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

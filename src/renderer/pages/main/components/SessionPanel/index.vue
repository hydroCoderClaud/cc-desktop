<template>
  <div class="session-panel">
    <!-- Toolbar -->
    <SessionToolbar
      :project="project"
      :active-sessions="activeSessions"
      @new-session="openNewSessionDialog"
    />

    <!-- Sessions Content -->
    <div class="sessions-content">
      <!-- Active Sessions (所有项目) -->
      <ActiveSessionList
        v-if="activeSessions.length > 0"
        :sessions="activeSessions"
        :focused-session-id="focusedSessionId"
        :current-project-id="project?.id"
        @select="handleSelectSession"
        @close="handleCloseSession"
        @move-up="handleMoveUp"
        @move-down="handleMoveDown"
      />

      <!-- History Sessions -->
      <HistorySessionList
        :sessions="historySessions"
        :project-id="project?.id"
        @select="handleOpenHistorySession"
        @delete="handleDeleteHistorySession"
        @update-title="handleUpdateHistoryTitle"
      />
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
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useMessage, NModal, NForm, NFormItem, NInput, NButton } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useLocale } from '@composables/useLocale'
import { swapArrayItems } from '@composables/useSessionUtils'
import SessionToolbar from './SessionToolbar.vue'
import ActiveSessionList from './ActiveSessionList.vue'
import HistorySessionList from './HistorySessionList.vue'

const message = useMessage()
const { invoke } = useIPC()
const { t } = useLocale()

// Props
const props = defineProps({
  project: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits([
  'session-created',
  'session-selected',
  'session-closed'
])

// State
const activeSessions = ref([])
const historySessions = ref([])
const focusedSessionId = ref(null)

// New session dialog
const showNewSessionDialog = ref(false)
const newSessionTitle = ref('')

// Load active sessions (显示所有项目的运行中会话)
const loadActiveSessions = async () => {
  try {
    const sessions = await invoke('listActiveSessions', true)
    activeSessions.value = sessions
  } catch (err) {
    console.error('Failed to load active sessions:', err)
    activeSessions.value = []
  }
}

// Load history sessions (从数据库加载，先同步文件系统)
const loadHistorySessions = async () => {
  if (!props.project) {
    historySessions.value = []
    return
  }

  try {
    // 先同步文件系统到数据库
    await invoke('syncProjectSessions', {
      projectPath: props.project.path,
      projectId: props.project.id
    })

    // 从数据库加载
    const sessions = await invoke('getProjectSessionsFromDb', props.project.id)
    historySessions.value = (sessions || [])
      // 过滤掉没有任何内容的会话（无 uuid 且无 title）
      .filter(s => s.session_uuid || s.title)
      // 过滤掉 warmup 预热会话
      .filter(s => !s.first_user_message?.toLowerCase().includes('warmup'))
      .map(s => ({
        ...s,
        // 保持兼容性
        name: s.title || s.first_user_message || null,
        message_count: s.message_count || 0,
        created_at: s.started_at || s.created_at
      }))
  } catch (err) {
    console.error('Failed to load history sessions:', err)
    historySessions.value = []
  }
}

// Start watching session files
const startFileWatcher = () => {
  if (!props.project || !window.electronAPI) return

  window.electronAPI.watchSessionFiles({
    projectPath: props.project.path,
    projectId: props.project.id
  })
}

// Stop watching session files
const stopFileWatcher = () => {
  if (window.electronAPI) {
    window.electronAPI.stopWatchingSessionFiles()
  }
}

// Open new session dialog
const openNewSessionDialog = async () => {
  if (!props.project) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!props.project.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  // Check session count limit
  try {
    const { runningCount, maxSessions } = await invoke('getSessionLimits')
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

// Confirm and create new session
const confirmNewSession = async () => {
  try {
    const result = await invoke('createActiveSession', {
      projectId: props.project.id,
      projectPath: props.project.path,
      projectName: props.project.name,
      title: newSessionTitle.value.trim(),
      apiProfileId: props.project.api_profile_id
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

// Open history session - 恢复历史会话
const handleOpenHistorySession = async (session) => {
  if (!props.project) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  if (!props.project.pathValid) {
    message.error(t('project.pathNotExist'))
    return
  }

  // 检查会话数量限制
  try {
    const { runningCount, maxSessions } = await invoke('getSessionLimits')
    if (runningCount >= maxSessions) {
      message.warning(t('session.maxSessionsReached', { max: maxSessions }))
      return
    }
  } catch (err) {
    console.error('Failed to check session limit:', err)
  }

  try {
    const result = await invoke('createActiveSession', {
      projectId: props.project.id,
      projectPath: props.project.path,
      projectName: props.project.name,
      title: session.name || `恢复: ${session.session_uuid?.slice(0, 8)}`,
      apiProfileId: props.project.api_profile_id,
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

// Move session up in list
const handleMoveUp = (index) => {
  swapArrayItems(activeSessions.value, index, index - 1)
}

// Move session down in list
const handleMoveDown = (index) => {
  swapArrayItems(activeSessions.value, index, index + 1)
}

// Update history session title (保存到数据库)
const handleUpdateHistoryTitle = async ({ session, newTitle }) => {
  try {
    const result = await invoke('updateSessionTitle', {
      sessionId: session.id,
      title: newTitle
    })

    if (result.success) {
      // 更新本地数据
      const idx = historySessions.value.findIndex(s => s.id === session.id)
      if (idx !== -1) {
        historySessions.value[idx].title = newTitle
        historySessions.value[idx].name = newTitle
      }
      message.success(t('messages.saveSuccess') || '已保存')
    } else {
      message.error(result.error || t('messages.saveFailed'))
    }
  } catch (err) {
    console.error('Failed to update session title:', err)
    message.error(t('messages.saveFailed'))
  }
}

// Delete history session (数据库 + 文件)
const handleDeleteHistorySession = async (session) => {
  const confirmDelete = window.confirm(`确定要删除会话 "${session.name || session.session_uuid?.slice(0, 8)}" 吗？\n\n此操作将永久删除会话，无法恢复。`)
  if (!confirmDelete) return

  try {
    const result = await invoke('deleteSessionWithFile', {
      sessionId: session.id,
      projectPath: props.project.path,
      sessionUuid: session.session_uuid
    })

    if (result.success) {
      message.success('会话已删除')
      await loadHistorySessions()
    } else {
      message.error(result.error || '删除失败')
    }
  } catch (err) {
    console.error('Failed to delete session:', err)
    message.error('删除失败')
  }
}

// Watch project change
watch(() => props.project, async (newProject, oldProject) => {
  // 停止旧项目的文件监控
  if (oldProject) {
    stopFileWatcher()
  }

  if (newProject) {
    await Promise.all([
      loadActiveSessions(),
      loadHistorySessions()
    ])
    // 启动新项目的文件监控
    startFileWatcher()
  } else {
    activeSessions.value = []
    historySessions.value = []
  }
}, { immediate: true })

// Listen for session events
let cleanupFns = []

onMounted(() => {
  if (window.electronAPI) {
    // 会话启动事件
    cleanupFns.push(
      window.electronAPI.onSessionStarted(({ session }) => {
        loadActiveSessions()
      })
    )

    // 会话退出事件
    cleanupFns.push(
      window.electronAPI.onSessionExit(({ sessionId }) => {
        loadActiveSessions()
      })
    )

    // 会话文件变化事件
    cleanupFns.push(
      window.electronAPI.onSessionFileChanged(({ projectPath, projectId }) => {
        // 确保是当前项目
        if (props.project && props.project.path === projectPath) {
          console.log('[SessionPanel] Session file changed, reloading...')
          loadHistorySessions()
        }
      })
    )
  }
})

onUnmounted(() => {
  cleanupFns.forEach(fn => fn && fn())
  stopFileWatcher()
})

// 暴露方法
defineExpose({
  loadActiveSessions,
  loadHistorySessions,
  focusedSessionId
})
</script>

<style scoped>
.session-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-secondary);
  border-left: 1px solid var(--border-color);
  width: 280px;
  flex-shrink: 0;
}

.sessions-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

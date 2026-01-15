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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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
    // 显示所有运行中的会话，保持原始顺序
    activeSessions.value = sessions
  } catch (err) {
    console.error('Failed to load active sessions:', err)
    activeSessions.value = []
  }
}

// Load history sessions (从文件实时读取，而非数据库)
const loadHistorySessions = async () => {
  if (!props.project) {
    historySessions.value = []
    return
  }

  try {
    // 使用文件版本的 API，直接从 ~/.claude 读取，更实时
    const sessions = await invoke('getFileBasedSessions', props.project.path)
    // 映射字段名以兼容现有组件（文件版返回 id，数据库版返回 session_uuid）
    // 过滤掉消息数为 0 的空会话（无法恢复）
    historySessions.value = (sessions || [])
      .filter(s => s.messageCount > 0)
      .map(s => ({
        ...s,
        session_uuid: s.id,  // 文件版的 id 就是 session_uuid
        name: s.firstUserMessage,  // 使用第一条用户消息作为会话名称
        message_count: s.messageCount,
        created_at: s.startTime
      }))
  } catch (err) {
    console.error('Failed to load history sessions:', err)
    historySessions.value = []
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

// Confirm and create new session
const confirmNewSession = async () => {
  try {
    const result = await invoke('createActiveSession', {
      projectId: props.project.id,
      projectPath: props.project.path,
      projectName: props.project.name,
      title: newSessionTitle.value.trim(),  // 用户输入的标题
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

    // 如果关闭的是当前聚焦的会话，清空聚焦
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
    // 使用 session_uuid 恢复会话
    const result = await invoke('createActiveSession', {
      projectId: props.project.id,
      projectPath: props.project.path,
      projectName: props.project.name,
      title: session.name || `恢复: ${session.session_uuid?.slice(0, 8)}`,
      apiProfileId: props.project.api_profile_id,
      resumeSessionId: session.session_uuid  // Claude Code 会话 UUID
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

// Delete history session (硬删除 ~/.claude 下的会话文件)
const handleDeleteHistorySession = async (session) => {
  // 确认删除
  const confirmDelete = window.confirm(`确定要删除会话 "${session.name || session.session_uuid?.slice(0, 8)}" 吗？\n\n此操作将永久删除会话文件，无法恢复。`)
  if (!confirmDelete) return

  try {
    const result = await invoke('deleteSessionFile', {
      projectPath: props.project.path,
      sessionId: session.session_uuid
    })

    if (result.success) {
      message.success('会话已删除')
      await loadHistorySessions()  // 刷新列表
    } else {
      message.error(result.error || '删除失败')
    }
  } catch (err) {
    console.error('Failed to delete session:', err)
    message.error('删除失败')
  }
}

// Watch project change
watch(() => props.project, async (newProject) => {
  if (newProject) {
    await Promise.all([
      loadActiveSessions(),
      loadHistorySessions()
    ])
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
  }
})

onUnmounted(() => {
  cleanupFns.forEach(fn => fn && fn())
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
  background: #ffffff;
  border-left: 1px solid #e5e5e0;
  width: 280px;
  flex-shrink: 0;
}

:deep(.dark-theme) .session-panel {
  background: #242424;
  border-color: #333333;
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

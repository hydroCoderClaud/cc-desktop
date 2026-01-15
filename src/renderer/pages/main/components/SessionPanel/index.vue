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
      />

      <!-- History Sessions -->
      <HistorySessionList
        :sessions="historySessions"
        :project-id="project?.id"
        @select="handleOpenHistorySession"
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

// Load history sessions
const loadHistorySessions = async () => {
  if (!props.project) {
    historySessions.value = []
    return
  }

  try {
    const sessions = await invoke('getProjectSessions', props.project.id)
    historySessions.value = sessions || []
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

// Open history session (暂未实现，占位)
const handleOpenHistorySession = (session) => {
  message.info('历史会话查看功能开发中...')
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

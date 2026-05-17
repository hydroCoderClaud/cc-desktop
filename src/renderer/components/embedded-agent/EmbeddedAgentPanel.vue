<template>
  <n-config-provider class="embedded-agent-provider" :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <n-dialog-provider>
        <div class="embedded-agent-panel" :style="cssVars">
          <header class="embedded-agent-header">
            <div v-if="appLabel || title">
              <p v-if="appLabel" class="embedded-agent-eyebrow">{{ appLabel }}</p>
              <h3 v-if="title">{{ title }}</h3>
            </div>
            <div class="embedded-agent-actions">
              <button type="button" class="context-send-btn" :disabled="!sessionId" @click="toggleCapabilityPanel">
                当前会话能力
              </button>
              <button type="button" class="context-send-btn" :disabled="!sessionId" @click="handleClearSession">
                新建会话
              </button>
            </div>
          </header>

          <p class="embedded-agent-context">{{ contextText }}</p>

          <section v-if="showCapabilityPanel" class="embedded-capability-panel">
            <div class="embedded-capability-summary">
              <span><strong>App</strong> {{ props.appId }}</span>
              <span><strong>Session</strong> {{ sessionId || '-' }}</span>
            </div>
            <div v-if="capabilityError" class="embedded-capability-error">{{ capabilityError }}</div>
            <div v-else class="embedded-capability-body">
              <p class="embedded-capability-text">
                <strong>会话状态</strong> {{ capabilitySnapshot.sessionStatusLabel }}
              </p>
              <p class="embedded-capability-text">
                <strong>上下文</strong> {{ capabilitySnapshot.contextSummary || '暂无上下文摘要' }}
              </p>
              <p class="embedded-capability-text">
                <strong>工具</strong> {{ capabilitySnapshot.toolNames.length > 0 ? capabilitySnapshot.toolNames.join('，') : '当前没有读取到会话级工具列表' }}
              </p>
              <p class="embedded-capability-text">
                <strong>MCP</strong> {{ capabilitySnapshot.mcpNames.length > 0 ? capabilitySnapshot.mcpNames.join('，') : '当前没有读取到 MCP 状态' }}
              </p>
              <p class="embedded-capability-text">
                <strong>运行态注入 MCP</strong> {{ capabilitySnapshot.injectedMcpNames.length > 0 ? capabilitySnapshot.injectedMcpNames.join('，') : '当前没有读取到 query 注入快照' }}
              </p>
              <p class="embedded-capability-text">
                <strong>运行态允许工具</strong> {{ capabilitySnapshot.injectedToolNames.length > 0 ? capabilitySnapshot.injectedToolNames.join('，') : '当前没有读取到 query 允许工具快照' }}
              </p>
              <p v-if="capabilitySnapshot.hint" class="embedded-capability-hint">
                {{ capabilitySnapshot.hint }}
              </p>
            </div>
          </section>

          <div v-if="error" class="embedded-agent-error">{{ error }}</div>
          <div v-else-if="!sessionId" class="embedded-agent-loading">正在创建 Agent 会话...</div>
          <AgentChatTab
            v-else
            :key="sessionId"
            ref="chatRef"
            class="embedded-agent-chat"
            :session-id="sessionId"
            :session-cwd="resolvedCwd"
            :api-profile-id="currentApiProfileId"
            :model-id="currentModelId"
            :agent-api="agentApi"
            @ready="handleReady"
            @api-profile-selected="handleApiProfileSelected"
            @model-selected="handleModelSelected"
            @request-clear-session="handleClearSession"
          />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useNaiveLocale } from '@composables/useNaiveLocale'
import AgentChatTab from '@/pages/main/components/AgentChatTab.vue'
import { createHydroAgentApiAdapter } from './hydro-agent-api-adapter'

const props = defineProps({
  appId: {
    type: String,
    required: true
  },
  appLabel: {
    type: String,
    default: 'Embedded App'
  },
  title: {
    type: String,
    default: 'Agent 助手'
  },
  cwd: {
    type: String,
    default: ''
  },
  contextProvider: {
    type: Function,
    default: null
  },
  apiProfileId: {
    type: String,
    default: null
  },
  modelId: {
    type: String,
    default: null
  }
})

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()
const { naiveLocale, naiveDateLocale, initLocale } = useNaiveLocale()
const chatRef = ref(null)
const sessionId = ref('')
const resolvedCwd = ref(props.cwd || '')
const error = ref('')
const contextSnapshot = ref(null)
const agentApi = ref(null)
const apiProfiles = ref([])
const loadingProfiles = ref(false)
const currentApiProfileId = ref(props.apiProfileId || null)
const currentModelId = ref(props.modelId || null)
const switchingProfile = ref(false)
const showCapabilityPanel = ref(false)
const capabilityError = ref('')
const capabilitySnapshot = ref({
  toolNames: [],
  mcpNames: [],
  injectedMcpNames: [],
  injectedToolNames: [],
  contextSummary: '',
  sessionStatusLabel: '',
  hint: ''
})

const contextText = computed(() => {
  const context = contextSnapshot.value
  if (!context) return '当前应用尚未提供业务上下文。'
  return context.summary || context.title || '已接入当前应用业务上下文。'
})

const persistAppPreferences = async (updates = {}) => {
  if (!window.electronAPI?.updateEmbeddedAppPreferences || !props.appId) return null

  try {
    const next = await window.electronAPI.updateEmbeddedAppPreferences({
      appId: props.appId,
      updates
    })
    if (next?.apiProfileId !== undefined) {
      currentApiProfileId.value = next.apiProfileId || null
    }
    if (next?.modelId !== undefined) {
      currentModelId.value = next.modelId || null
    }
    return next
  } catch (err) {
    console.warn('[EmbeddedAgentPanel] Failed to persist embedded app preferences:', err)
    return null
  }
}

const getLastSessionStorageKey = () => `embedded-agent:last-session:${props.appId}`

const readStoredSessionId = () => {
  try {
    return window.localStorage.getItem(getLastSessionStorageKey()) || ''
  } catch {
    return ''
  }
}

const persistSessionId = (nextSessionId) => {
  try {
    const key = getLastSessionStorageKey()
    if (nextSessionId) {
      window.localStorage.setItem(key, nextSessionId)
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {}
}

const normalizeContext = (context) => {
  if (!context || typeof context !== 'object') return null
  return {
    title: context.title || '',
    summary: context.summary || '',
    payload: context.payload || {}
  }
}

const readContext = () => {
  const next = typeof props.contextProvider === 'function'
    ? normalizeContext(props.contextProvider())
    : null
  contextSnapshot.value = next
  capabilitySnapshot.value = {
    ...capabilitySnapshot.value,
    contextSummary: next?.summary || next?.title || ''
  }
  return next
}

const findLatestSession = (sessions) => {
  const candidates = Array.isArray(sessions)
    ? sessions.filter(session => session?.id)
    : []

  candidates.sort((a, b) => {
    const left = a.updatedAt || a.createdAt || ''
    const right = b.updatedAt || b.createdAt || ''
    return new Date(right).getTime() - new Date(left).getTime()
  })

  return candidates[0] || null
}

const createNewSession = async (overrides = {}) => {
  const session = await agentApi.value.createAgentSession({
    type: 'chat',
    title: props.title,
    cwd: resolvedCwd.value || null,
    apiProfileId: currentApiProfileId.value || null,
    modelId: currentModelId.value || null,
    ...overrides
  })
  if (session?.error) {
    error.value = session.error
    return null
  }
  return session
}

const reopenSessionIfNeeded = async (session) => {
  if (!session?.id) return null
  if (session.status !== 'closed') return session

  const reopened = await agentApi.value.reopenAgentSession(session.id)
  if (reopened?.error) {
    error.value = reopened.error
    return null
  }
  return reopened || session
}

const applySession = (session) => {
  sessionId.value = session?.id || ''
  if (session?.cwd) resolvedCwd.value = session.cwd
  currentApiProfileId.value = session?.apiProfileId !== undefined ? (session.apiProfileId || null) : currentApiProfileId.value
  currentModelId.value = session?.modelId !== undefined ? (session.modelId || null) : currentModelId.value
  persistSessionId(sessionId.value)
}

const loadApiProfiles = async () => {
  if (!window.electronAPI?.listAPIProfiles) return

  loadingProfiles.value = true
  try {
    const profiles = await window.electronAPI.listAPIProfiles()
    apiProfiles.value = Array.isArray(profiles) ? profiles : []
  } catch (err) {
    console.error('[EmbeddedAgentPanel] Failed to load API profiles:', err)
    apiProfiles.value = []
  } finally {
    loadingProfiles.value = false
  }
}

const loadAppPreferences = async () => {
  if (!window.electronAPI?.getEmbeddedAppPreferences || !props.appId) return

  try {
    const preferences = await window.electronAPI.getEmbeddedAppPreferences(props.appId)
    if (preferences?.apiProfileId !== undefined) {
      currentApiProfileId.value = preferences.apiProfileId || currentApiProfileId.value || null
    }
    if (preferences?.modelId !== undefined) {
      currentModelId.value = preferences.modelId || currentModelId.value || null
    }
  } catch (err) {
    console.warn('[EmbeddedAgentPanel] Failed to load embedded app preferences:', err)
  }
}

const syncSessionProfileSnapshot = async () => {
  if (!sessionId.value || !agentApi.value?.getAgentSession) return

  try {
    const latestSession = await agentApi.value.getAgentSession(sessionId.value)
    if (latestSession) {
      currentApiProfileId.value = latestSession.apiProfileId !== undefined
        ? (latestSession.apiProfileId || null)
        : currentApiProfileId.value
      currentModelId.value = latestSession.modelId !== undefined
        ? (latestSession.modelId || null)
        : currentModelId.value
    }
  } catch (err) {
    console.warn('[EmbeddedAgentPanel] Failed to sync session profile snapshot:', err)
  }
}

const extractInitToolNames = (initResult) => {
  if (!Array.isArray(initResult?.tools)) return []
  return initResult.tools
    .map((tool) => typeof tool?.name === 'string' ? tool.name.trim() : '')
    .filter(Boolean)
}

const extractMcpNames = (mcpStatus) => {
  if (Array.isArray(mcpStatus)) {
    return mcpStatus
      .map((item) => typeof item?.name === 'string' ? item.name.trim() : '')
      .filter(Boolean)
  }
  if (Array.isArray(mcpStatus?.servers)) {
    return mcpStatus.servers
      .map((item) => typeof item?.name === 'string' ? item.name.trim() : '')
      .filter(Boolean)
  }
  if (mcpStatus && typeof mcpStatus === 'object') {
    return Object.keys(mcpStatus)
  }
  return []
}

const refreshCapabilitySnapshot = async () => {
  if (!sessionId.value || !agentApi.value) return

  capabilityError.value = ''

  try {
    const session = await agentApi.value.getAgentSession?.(sessionId.value)
    let initResult = null
    let mcpStatus = null
    let hint = ''

    try {
      initResult = await agentApi.value.getAgentInitResult?.(sessionId.value)
      mcpStatus = await agentApi.value.getAgentMcpServerStatus?.(sessionId.value).catch(() => null)
    } catch (err) {
      const message = err?.message || String(err)
      if (message.includes('No active streaming session')) {
        hint = '当前会话尚未发送首条消息，底层 Agent query 还未启动。先发送一条消息后，这里会显示真实工具和 MCP 列表。'
      } else {
        throw err
      }
    }

    const sessionStatus = typeof session?.status === 'string' && session.status.trim()
      ? session.status.trim()
      : 'unknown'
    const sessionClientType = typeof session?.clientType === 'string' && session.clientType.trim()
      ? session.clientType.trim()
      : 'unknown'
    const querySnapshot = session?.lastQueryOptionsSnapshot && typeof session.lastQueryOptionsSnapshot === 'object'
      ? session.lastQueryOptionsSnapshot
      : null

    capabilitySnapshot.value = {
      toolNames: extractInitToolNames(initResult),
      mcpNames: extractMcpNames(mcpStatus),
      injectedMcpNames: Array.isArray(querySnapshot?.mcpServerNames) ? querySnapshot.mcpServerNames : [],
      injectedToolNames: Array.isArray(querySnapshot?.allowedTools) ? querySnapshot.allowedTools : [],
      contextSummary: contextSnapshot.value?.summary || contextSnapshot.value?.title || '',
      sessionStatusLabel: `${sessionClientType} / ${sessionStatus}`,
      hint
    }
  } catch (err) {
    capabilityError.value = err?.message || String(err)
  }
}

const toggleCapabilityPanel = async () => {
  showCapabilityPanel.value = !showCapabilityPanel.value
  if (showCapabilityPanel.value) {
    await refreshCapabilitySnapshot()
  }
}

const handleApiProfileSelected = async ({ apiProfileId } = {}) => {
  const nextProfileId = typeof apiProfileId === 'string' ? apiProfileId.trim() : ''
  if (!nextProfileId || !sessionId.value || switchingProfile.value) return
  if (nextProfileId === currentApiProfileId.value) return
  if (!agentApi.value?.switchAgentApiProfile) return

  switchingProfile.value = true
  error.value = ''
  try {
    const result = await agentApi.value.switchAgentApiProfile({
      sessionId: sessionId.value,
      profileId: nextProfileId
    })
    if (result?.error) {
      throw new Error(result.error)
    }
    currentApiProfileId.value = nextProfileId
    currentModelId.value = result?.modelId !== undefined ? (result.modelId || null) : null
    await syncSessionProfileSnapshot()
    await persistAppPreferences({
      apiProfileId: currentApiProfileId.value,
      modelId: currentModelId.value
    })
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    switchingProfile.value = false
  }
}

const handleModelSelected = async ({ modelId } = {}) => {
  const normalizedModelId = typeof modelId === 'string' ? modelId.trim() : ''
  if (!normalizedModelId || normalizedModelId === currentModelId.value) return

  currentModelId.value = normalizedModelId
  await persistAppPreferences({
    modelId: normalizedModelId
  })
}

const initializeSession = async () => {
  if (!window.hydroAgent?.connect) {
    error.value = '当前环境无法访问 embedded Agent 接口。'
    return
  }

  try {
    const client = await window.hydroAgent.connect({
      appId: props.appId,
      clientMeta: {
        component: 'EmbeddedAgentPanel',
        appLabel: props.appLabel
      }
    })
    if (!resolvedCwd.value) {
      resolvedCwd.value = client?.defaultCwd || ''
    }

    await window.hydroAgent.updateContext?.(readContext())

    agentApi.value = createHydroAgentApiAdapter(window.hydroAgent)
    if (!agentApi.value) {
      error.value = '当前环境无法访问 embedded Agent 接口。'
      return
    }

    const sessions = await window.hydroAgent.listSessions()
    const storedSessionId = readStoredSessionId()
    const storedSession = storedSessionId
      ? sessions.find(session => session?.id === storedSessionId)
      : null
    const latestSession = findLatestSession(sessions)
    const restorableSession = storedSession || latestSession

    if (restorableSession) {
      const activeSession = await reopenSessionIfNeeded(restorableSession)
      if (activeSession) {
        applySession(activeSession)
        await refreshCapabilitySnapshot()
        return
      }
    }

    const session = await createNewSession()
    if (session) {
      applySession(session)
      await refreshCapabilitySnapshot()
    }
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const handleContextChanged = () => {
  readContext()
}

const handleReady = () => {
  readContext()
  void refreshCapabilitySnapshot()
}

const handleClearSession = async () => {
  if (!sessionId.value || !agentApi.value?.clearAndRecreateAgentSession) return

  try {
    const session = await agentApi.value.clearAndRecreateAgentSession({
      sessionId: sessionId.value,
      overrides: {
        title: props.title,
        cwd: resolvedCwd.value || null
      }
    })
    if (session?.error) {
      error.value = session.error
      return
    }
    applySession(session)
    await refreshCapabilitySnapshot()
    await persistAppPreferences({
      apiProfileId: currentApiProfileId.value,
      modelId: currentModelId.value
    })
  } catch (err) {
    error.value = err.message || String(err)
  }
}

onMounted(async () => {
  initLocale()
  initTheme()
  readContext()
  await loadAppPreferences()
  await loadApiProfiles()
  window.addEventListener('embedded-agent:context-changed', handleContextChanged)
  await initializeSession()
})

onBeforeUnmount(() => {
  window.removeEventListener('embedded-agent:context-changed', handleContextChanged)
  agentApi.value?.dispose?.()
})
</script>

<style scoped>
.embedded-agent-provider,
.embedded-agent-provider :deep(.n-config-provider) {
  height: 100%;
  min-height: 0;
}

.embedded-agent-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--text-color);
}

.embedded-agent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.embedded-agent-eyebrow {
  margin: 0 0 4px;
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.embedded-agent-header h3 {
  margin: 0;
  font-size: 17px;
}

.embedded-agent-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-send-btn {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  height: 34px;
  padding: 0 12px;
  background: var(--panel-bg, var(--bg-color-secondary));
  color: var(--primary-color);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.context-send-btn:hover:not(:disabled) {
  border-color: var(--selected-border, var(--border-color));
  background: var(--primary-ghost);
}

.context-send-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.embedded-agent-context {
  margin: 12px 0;
  color: var(--text-color-muted);
  font-size: 12px;
  line-height: 1.6;
}

.embedded-capability-panel {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-color-secondary);
}

.embedded-capability-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.embedded-capability-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.embedded-capability-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color);
}

.embedded-capability-error {
  font-size: 12px;
  color: var(--danger-color);
}

.embedded-capability-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-muted);
}

.embedded-agent-error,
.embedded-agent-loading {
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-color-secondary);
  color: var(--text-color-secondary);
}

.embedded-agent-error {
  color: var(--danger-color);
}

.embedded-agent-chat {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 18px;
}

.embedded-agent-chat :deep(.chat-input-area) {
  padding: 8px 12px 12px;
}

.embedded-agent-chat :deep(.input-toolbar) {
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
}

.embedded-agent-chat :deep(.toolbar-left) {
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.embedded-agent-chat :deep(.toolbar-right) {
  width: 100%;
  justify-content: flex-end;
}

.embedded-agent-chat :deep(.model-selector) {
  flex: 1 1 180px;
  min-width: 0;
  max-width: 100%;
}

.embedded-agent-chat :deep(.model-label),
.embedded-agent-chat :deep(.token-count) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

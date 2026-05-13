<template>
  <n-config-provider class="embedded-agent-provider" :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <n-dialog-provider>
        <div class="embedded-agent-panel" :style="cssVars">
          <header class="embedded-agent-header">
            <div>
              <p class="embedded-agent-eyebrow">{{ appLabel }}</p>
              <h3>{{ title }}</h3>
            </div>
            <button type="button" class="context-send-btn" :disabled="!sessionId || sendingContext" @click="sendContext">
              发送当前上下文
            </button>
          </header>

          <p class="embedded-agent-context">{{ contextText }}</p>

          <div v-if="error" class="embedded-agent-error">{{ error }}</div>
          <div v-else-if="!sessionId" class="embedded-agent-loading">正在创建 Agent 会话...</div>
          <AgentChatTab
            v-else
            :key="sessionId"
            ref="chatRef"
            class="embedded-agent-chat"
            :session-id="sessionId"
            :session-cwd="resolvedCwd"
            :api-profile-id="apiProfileId"
            :model-id="modelId"
            :agent-api="agentApi"
            @ready="handleReady"
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
const sendingContext = ref(false)
const contextSnapshot = ref(null)
const agentApi = ref(null)

const contextText = computed(() => {
  const context = contextSnapshot.value
  if (!context) return '当前应用尚未提供业务上下文。'
  return context.summary || context.title || '已接入当前应用业务上下文。'
})

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
  return next
}

const buildContextPrompt = (context) => {
  const payload = context?.payload && Object.keys(context.payload).length > 0
    ? `\n\n结构化上下文：\n${JSON.stringify(context.payload, null, 2)}`
    : ''
  return [
    '请基于当前内嵌应用上下文继续协助用户。',
    context?.title ? `业务位置：${context.title}` : '',
    context?.summary ? `业务摘要：${context.summary}` : '',
    payload
  ].filter(Boolean).join('\n')
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
  persistSessionId(sessionId.value)
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
        return
      }
    }

    const session = await createNewSession()
    if (session) applySession(session)
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const sendContext = async () => {
  const context = readContext()
  if (!context || !chatRef.value?.sendMessage) return

  sendingContext.value = true
  try {
    await chatRef.value.sendMessage(buildContextPrompt(context))
  } finally {
    sendingContext.value = false
  }
}

const handleContextChanged = () => {
  readContext()
}

const handleReady = () => {
  readContext()
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
  } catch (err) {
    error.value = err.message || String(err)
  }
}

onMounted(async () => {
  initLocale()
  initTheme()
  readContext()
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

.context-send-btn {
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 8px 11px;
  background: var(--primary-ghost);
  color: var(--primary-color);
  cursor: pointer;
  white-space: nowrap;
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
</style>

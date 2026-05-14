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
            <div class="embedded-agent-actions">
              <div class="embedded-profile-switcher" ref="profileSwitcherRef">
                <button
                  type="button"
                  class="embedded-profile-btn"
                  :disabled="!sessionId || switchingProfile || loadingProfiles"
                  :title="currentProfileName"
                  @click="toggleProfileDropdown"
                >
                  <span class="embedded-profile-label">{{ currentProfileName }}</span>
                  <span class="embedded-profile-caret">▾</span>
                </button>
                <Teleport to="body">
                  <div
                    v-if="showProfileDropdown"
                    class="embedded-profile-dropdown"
                    :style="profileDropdownStyle"
                  >
                    <div v-if="apiProfiles.length === 0" class="embedded-profile-empty">暂无 API 配置</div>
                    <button
                      v-for="profile in apiProfiles"
                      :key="profile.id"
                      type="button"
                      class="embedded-profile-option"
                      :class="{ active: profile.id === currentApiProfileId }"
                      :disabled="switchingProfile"
                      @click="handleSwitchProfile(profile)"
                    >
                      <span class="embedded-profile-check">{{ profile.id === currentApiProfileId ? '✓' : '' }}</span>
                      <span class="embedded-profile-option-name">{{ profile.name }}</span>
                    </button>
                  </div>
                </Teleport>
              </div>
              <button type="button" class="context-send-btn" :disabled="!sessionId || sendingContext" @click="sendContext">
                发送当前上下文
              </button>
            </div>
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
            :api-profile-id="currentApiProfileId"
            :model-id="currentModelId"
            :agent-api="agentApi"
            @ready="handleReady"
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
const sendingContext = ref(false)
const contextSnapshot = ref(null)
const agentApi = ref(null)
const apiProfiles = ref([])
const loadingProfiles = ref(false)
const currentApiProfileId = ref(props.apiProfileId || null)
const currentModelId = ref(props.modelId || null)
const switchingProfile = ref(false)
const showProfileDropdown = ref(false)
const profileSwitcherRef = ref(null)
const profileDropdownPos = ref({ top: 0, right: 0 })

const contextText = computed(() => {
  const context = contextSnapshot.value
  if (!context) return '当前应用尚未提供业务上下文。'
  return context.summary || context.title || '已接入当前应用业务上下文。'
})

const profileDropdownStyle = computed(() => ({
  position: 'fixed',
  top: `${profileDropdownPos.value.top}px`,
  right: `${profileDropdownPos.value.right}px`,
  zIndex: 9999
}))

const currentProfileName = computed(() => {
  const active = apiProfiles.value.find(profile => profile.id === currentApiProfileId.value)
  return active?.name || '默认 API'
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

const updateProfileDropdownPos = () => {
  if (!profileSwitcherRef.value) return
  const rect = profileSwitcherRef.value.getBoundingClientRect()
  profileDropdownPos.value = {
    top: rect.bottom + 6,
    right: window.innerWidth - rect.right
  }
}

const toggleProfileDropdown = () => {
  if (!sessionId.value || switchingProfile.value || loadingProfiles.value) return
  if (!showProfileDropdown.value) {
    updateProfileDropdownPos()
  }
  showProfileDropdown.value = !showProfileDropdown.value
}

const closeProfileDropdown = () => {
  showProfileDropdown.value = false
}

const handleDocumentClick = (event) => {
  if (!showProfileDropdown.value) return
  if (profileSwitcherRef.value?.contains(event.target)) return
  closeProfileDropdown()
}

const handleWindowResize = () => {
  if (showProfileDropdown.value) {
    updateProfileDropdownPos()
  }
}

const handleSwitchProfile = async (profile) => {
  closeProfileDropdown()
  if (!profile?.id || !sessionId.value || switchingProfile.value) return
  if (profile.id === currentApiProfileId.value) return
  if (!agentApi.value?.switchAgentApiProfile) return

  switchingProfile.value = true
  error.value = ''
  try {
    const result = await agentApi.value.switchAgentApiProfile({
      sessionId: sessionId.value,
      profileId: profile.id
    })
    if (result?.error) {
      throw new Error(result.error)
    }
    currentApiProfileId.value = profile.id
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
  document.addEventListener('click', handleDocumentClick, true)
  window.addEventListener('resize', handleWindowResize)
  await initializeSession()
})

onBeforeUnmount(() => {
  window.removeEventListener('embedded-agent:context-changed', handleContextChanged)
  document.removeEventListener('click', handleDocumentClick, true)
  window.removeEventListener('resize', handleWindowResize)
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
  gap: 10px;
}

.embedded-profile-switcher {
  position: relative;
}

.embedded-profile-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  cursor: pointer;
  min-width: 116px;
  max-width: 180px;
}

.embedded-profile-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.embedded-profile-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.embedded-profile-caret {
  color: var(--text-color-muted);
}

.embedded-profile-dropdown {
  min-width: 180px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  padding: 6px;
}

.embedded-profile-empty {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-color-muted);
}

.embedded-profile-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-color);
  padding: 9px 10px;
  cursor: pointer;
  text-align: left;
}

.embedded-profile-option:hover {
  background: var(--hover-bg);
}

.embedded-profile-option.active {
  color: var(--primary-color);
  background: var(--primary-ghost);
}

.embedded-profile-check {
  width: 14px;
  flex-shrink: 0;
}

.embedded-profile-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

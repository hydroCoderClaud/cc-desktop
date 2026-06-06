<template>
  <n-config-provider class="embedded-agent-provider" :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <n-dialog-provider>
        <div class="embedded-agent-panel" :style="cssVars">
          <div class="embedded-agent-tabs" role="tablist" aria-label="Embedded agent tabs">
            <button
              type="button"
              class="embedded-agent-tab"
              :class="{ active: activeTab === 'chat' }"
              @click="activeTab = 'chat'"
            >
              工作台助手
            </button>
            <button
              type="button"
              class="embedded-agent-tab"
              :class="{ active: activeTab === 'files' }"
              @click="activeTab = 'files'"
            >
              工作目录
            </button>
          </div>

          <div v-show="activeTab === 'chat'" class="embedded-agent-assistant-view">
            <header class="embedded-agent-header">
              <div v-if="appLabel || title" class="embedded-agent-title">
                <p v-if="appLabel" class="embedded-agent-eyebrow">{{ appLabel }}</p>
                <h3 v-if="title">{{ title }}</h3>
              </div>
              <div class="embedded-agent-actions">
                <div class="embedded-agent-tip-anchor">
                  <button
                    type="button"
                    class="embedded-agent-icon-btn"
                    :class="{ active: showContextTip }"
                    title="当前上下文"
                    aria-label="当前上下文"
                    @click="toggleContextTip"
                  >
                    <Icon name="info" :size="17" :stroke-width="1.8" />
                  </button>
                  <div v-if="showContextTip" class="embedded-context-tip" :style="contextTipStyle" role="tooltip">
                    {{ contextText }}
                  </div>
                </div>
                <button
                  v-if="boundScheduledTaskId"
                  type="button"
                  class="embedded-agent-icon-btn"
                  :disabled="!sessionId"
                  title="绑定定时任务"
                  aria-label="绑定定时任务"
                  @click="toggleScheduledTaskModal"
                >
                  <Icon name="clock" :size="17" :stroke-width="1.8" />
                </button>
                <button
                  type="button"
                  class="embedded-agent-icon-btn"
                  :class="{ active: showCapabilityPanel }"
                  :disabled="!sessionId"
                  title="当前会话能力"
                  aria-label="当前会话能力"
                  @click="toggleCapabilityPanel"
                >
                  <Icon name="sliders" :size="17" :stroke-width="1.8" />
                </button>
                <button
                  type="button"
                  class="embedded-agent-icon-btn primary"
                  :disabled="!sessionId"
                  title="新建会话"
                  aria-label="新建会话"
                  @click="handleClearSession"
                >
                  <Icon name="plus" :size="18" :stroke-width="2" />
                </button>
              </div>
            </header>

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
            <div v-else class="embedded-agent-content">
              <AgentChatTab
                :key="sessionId"
                ref="chatRef"
                class="embedded-agent-chat"
                :session-id="sessionId"
                :session-title="currentSessionTitle"
                :session-source="currentSessionSource"
                :session-im-channel="currentSessionImChannel"
                :session-cwd="resolvedCwd"
                :api-profile-id="currentApiProfileId"
                :model-id="currentModelId"
                :agent-api="agentApi"
                :dingtalk-notify-api="dingtalkNotifyApi"
                :weixin-notify-api="weixinNotifyApi"
                :feishu-notify-api="feishuNotifyApi"
                :enterprise-weixin-notify-api="enterpriseWeixinNotifyApi"
                @ready="handleReady"
                @api-profile-selected="handleApiProfileSelected"
                @model-selected="handleModelSelected"
                @request-clear-session="handleClearSession"
              />
            </div>
          </div>

          <div v-show="activeTab === 'files'" class="embedded-agent-files-view">
            <WorkspaceFilePanel
              class="embedded-agent-files"
              :files="embeddedFiles"
              :source-ready="Boolean(sessionId)"
              :empty-title="'工作目录'"
              :empty-message="'当前会话尚未创建工作目录。'"
              :show-collapse="false"
              :framed="false"
              :save-text-handler="handleEmbeddedFileSave"
              :allow-mutations="true"
              @insert-path="handleInsertPath"
            />
          </div>
          <n-modal
            v-model:show="showScheduledTaskModal"
            @after-leave="showScheduledTaskModal = false"
          >
            <div class="scheduled-task-manager-modal embedded-scheduled-task-shell">
              <ScheduledTaskDetailPanel
                v-if="showScheduledTaskModal && boundScheduledTaskId"
                :task-id="boundScheduledTaskId"
                @updated="handleScheduledTaskUpdated"
                @deleted="handleScheduledTaskDeleted"
                @close="showScheduledTaskModal = false"
              />
            </div>
          </n-modal>
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { useTheme } from '@composables/useTheme'
import { useNaiveLocale } from '@composables/useNaiveLocale'
import AgentChatTab from '@/pages/main/components/AgentChatTab.vue'
import ScheduledTaskDetailPanel from '@/pages/main/components/agent/ScheduledTaskDetailPanel.vue'
import WorkspaceFilePanel from '@components/workspace-files/WorkspaceFilePanel.vue'
import Icon from '@components/icons/Icon.vue'
import { useEmbeddedAgentFiles } from '@composables/useEmbeddedAgentFiles'
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
const currentSessionTitle = ref('')
const currentSessionSource = ref('manual')
const currentSessionImChannel = ref(null)
const resolvedCwd = ref(props.cwd || '')
const error = ref('')
const contextSnapshot = ref(null)
const agentApi = ref(null)
const dingtalkNotifyApi = computed(() => {
  const api = window.electronAPI || null
  if (!api) return null
  return {
    listDingTalkTargets: api.listDingTalkTargets?.bind(api),
    getSessionDingTalkBinding: api.getSessionDingTalkBinding?.bind(api),
    bindSessionToDingTalkTarget: api.bindSessionToDingTalkTarget?.bind(api),
    unbindSessionDingTalkTarget: api.unbindSessionDingTalkTarget?.bind(api),
    sendDingTalkText: api.sendDingTalkText?.bind(api)
  }
})
const weixinNotifyApi = computed(() => {
  const api = window.electronAPI || null
  if (!api) return null
  return {
    listWeixinNotifyTargets: api.listWeixinNotifyTargets?.bind(api),
    getSessionWeixinBinding: api.getSessionWeixinBinding?.bind(api),
    bindSessionToWeixinTarget: api.bindSessionToWeixinTarget?.bind(api),
    unbindSessionWeixinTarget: api.unbindSessionWeixinTarget?.bind(api),
    sendWeixinNotifyText: api.sendWeixinNotifyText?.bind(api)
  }
})
const feishuNotifyApi = computed(() => {
  const api = window.electronAPI || null
  if (!api) return null
  return {
    listFeishuTargets: api.listFeishuTargets?.bind(api),
    getSessionFeishuBinding: api.getSessionFeishuBinding?.bind(api),
    bindSessionToFeishuTarget: api.bindSessionToFeishuTarget?.bind(api),
    unbindSessionFeishuTarget: api.unbindSessionFeishuTarget?.bind(api),
    sendFeishuNotifyText: api.sendFeishuNotifyText?.bind(api)
  }
})
const enterpriseWeixinNotifyApi = computed(() => {
  const api = window.electronAPI || null
  if (!api) return null
  return {
    listEnterpriseWeixinTargets: api.listEnterpriseWeixinTargets?.bind(api),
    getSessionEnterpriseWeixinBinding: api.getSessionEnterpriseWeixinBinding?.bind(api),
    bindSessionToEnterpriseWeixinTarget: api.bindSessionToEnterpriseWeixinTarget?.bind(api),
    unbindSessionEnterpriseWeixinTarget: api.unbindSessionEnterpriseWeixinTarget?.bind(api),
    renameEnterpriseWeixinKnownChat: api.renameEnterpriseWeixinKnownChat?.bind(api),
    sendEnterpriseWeixinText: api.sendEnterpriseWeixinText?.bind(api),
    getEnterpriseWeixinCliStatus: api.getEnterpriseWeixinCliStatus?.bind(api),
    getEnterpriseWeixinCliBootstrapStatus: api.getEnterpriseWeixinCliBootstrapStatus?.bind(api),
    listEnterpriseWeixinContacts: api.listEnterpriseWeixinContacts?.bind(api),
    getEnterpriseWeixinCliInstallCommand: api.getEnterpriseWeixinCliInstallCommand?.bind(api),
    runEnterpriseWeixinCliInstallCommand: api.runEnterpriseWeixinCliInstallCommand?.bind(api),
    getEnterpriseWeixinCliInitCommand: api.getEnterpriseWeixinCliInitCommand?.bind(api),
    runEnterpriseWeixinCliInitCommand: api.runEnterpriseWeixinCliInitCommand?.bind(api),
    getEnterpriseWeixinCliReauthorizeCommand: api.getEnterpriseWeixinCliReauthorizeCommand?.bind(api)
  }
})
const apiProfiles = ref([])
const loadingProfiles = ref(false)
const currentApiProfileId = ref(props.apiProfileId || null)
const currentModelId = ref(props.modelId || null)
const switchingProfile = ref(false)
const showCapabilityPanel = ref(false)
const showContextTip = ref(false)
const showScheduledTaskModal = ref(false)
const contextTipPosition = ref({ top: 0, right: 24 })
const activeTab = ref('chat')
const capabilityError = ref('')
const boundScheduledTaskId = ref(null)
let cleanupScheduledTaskChanged = null
let cleanupSessionUpdated = null
const capabilitySnapshot = ref({
  toolNames: [],
  mcpNames: [],
  injectedMcpNames: [],
  injectedToolNames: [],
  contextSummary: '',
  sessionStatusLabel: '',
  hint: ''
})
const embeddedFiles = useEmbeddedAgentFiles(agentApi)

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
  currentSessionTitle.value = typeof session?.title === 'string' ? session.title : ''
  currentSessionSource.value = typeof session?.source === 'string' ? session.source : 'manual'
  currentSessionImChannel.value = typeof session?.imChannel === 'string' ? session.imChannel : null
  currentApiProfileId.value = session?.apiProfileId !== undefined ? (session.apiProfileId || null) : currentApiProfileId.value
  currentModelId.value = session?.modelId !== undefined ? (session.modelId || null) : currentModelId.value
  persistSessionId(sessionId.value)
  void agentApi.value?.setCurrentAgentSession?.(sessionId.value)
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
      const taskId = Number(latestSession.taskId)
      boundScheduledTaskId.value = Number.isInteger(taskId) && taskId > 0 ? taskId : null
      currentSessionTitle.value = typeof latestSession?.title === 'string'
        ? latestSession.title
        : currentSessionTitle.value
      currentSessionSource.value = latestSession?.source !== undefined
        ? (typeof latestSession.source === 'string' ? latestSession.source : 'manual')
        : currentSessionSource.value
      currentSessionImChannel.value = latestSession?.imChannel !== undefined
        ? (typeof latestSession.imChannel === 'string' ? latestSession.imChannel : null)
        : currentSessionImChannel.value
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

const refreshBoundScheduledTask = async () => {
  await syncSessionProfileSnapshot()
  if (!boundScheduledTaskId.value) {
    showScheduledTaskModal.value = false
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
    let hint = ''

    try {
      initResult = await agentApi.value.getAgentInitResult?.(sessionId.value)
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
      mcpNames: [],
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

const refreshMcpStatus = async () => {
  if (!sessionId.value || !agentApi.value) return
  try {
    const mcpStatus = await agentApi.value.getAgentMcpServerStatus?.(sessionId.value).catch(() => null)
    const current = capabilitySnapshot.value
    if (current) {
      capabilitySnapshot.value = { ...current, mcpNames: extractMcpNames(mcpStatus) }
    }
  } catch (_) {
    // MCP 状态获取失败不影响面板
  }
}

const toggleCapabilityPanel = async () => {
  showCapabilityPanel.value = !showCapabilityPanel.value
  showContextTip.value = false
  showScheduledTaskModal.value = false
  if (showCapabilityPanel.value) {
    await refreshCapabilitySnapshot()
    await refreshMcpStatus()
  }
}

const toggleScheduledTaskModal = async () => {
  if (!boundScheduledTaskId.value) return
  showCapabilityPanel.value = false
  showContextTip.value = false
  showScheduledTaskModal.value = !showScheduledTaskModal.value
  if (showScheduledTaskModal.value) {
    await refreshBoundScheduledTask()
  }
}

const positionContextTip = (triggerEl) => {
  if (!triggerEl?.getBoundingClientRect || typeof window === 'undefined') return

  const rect = triggerEl.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
  const tipWidth = Math.min(280, Math.max(0, viewportWidth - 48))
  const top = Math.min(rect.bottom + 8, Math.max(16, viewportHeight - 296))
  const right = Math.max(16, viewportWidth - rect.right)
  const maxRight = Math.max(16, viewportWidth - tipWidth - 16)

  contextTipPosition.value = {
    top,
    right: Math.min(right, maxRight)
  }
}

const contextTipStyle = computed(() => ({
  top: `${contextTipPosition.value.top}px`,
  right: `${contextTipPosition.value.right}px`
}))

const toggleContextTip = (event) => {
  readContext()
  positionContextTip(event?.currentTarget)
  showContextTip.value = !showContextTip.value
}

const handleInsertPath = (path) => {
  if (!path) return
  chatRef.value?.insertText?.(`${path}\n`)
  activeTab.value = 'chat'
}

const handleEmbeddedFileSave = async ({ sessionId: targetSessionId, relativePath, content }) => {
  if (!targetSessionId || !relativePath || !agentApi.value?.saveAgentFile) {
    return { error: 'Embedded agent file API unavailable' }
  }
  return agentApi.value.saveAgentFile({
    sessionId: targetSessionId,
    relativePath,
    content
  })
}

const handleApiProfileSelected = async (payload) => {
  const nextProfileId = typeof payload === 'string'
    ? payload.trim()
    : (typeof payload?.apiProfileId === 'string' ? payload.apiProfileId.trim() : '')
  const nextModelId = typeof payload?.modelId === 'string'
    ? (payload.modelId.trim() || null)
    : null
  if (!nextProfileId || !sessionId.value) return

  currentApiProfileId.value = nextProfileId
  currentModelId.value = nextModelId
  error.value = ''

  await persistAppPreferences({
    apiProfileId: currentApiProfileId.value,
    modelId: currentModelId.value
  })

  if (showCapabilityPanel.value) {
    await refreshCapabilitySnapshot()
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

    const restoredRequestedSession = await restoreRequestedSession()
    if (restoredRequestedSession) {
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
        await syncSessionProfileSnapshot()
        await refreshCapabilitySnapshot()
        return
      }
    }

    const session = await createNewSession()
    if (session) {
      applySession(session)
      await syncSessionProfileSnapshot()
      await refreshCapabilitySnapshot()
    }
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const handleContextChanged = () => {
  readContext()
}

const handleImBindingChanged = async (event) => {
  const changedSessionId = typeof event?.detail?.sessionId === 'string' ? event.detail.sessionId : ''
  if (!changedSessionId || changedSessionId !== sessionId.value) return
  await syncSessionProfileSnapshot()
}

const consumeRequestedRestoreSessionId = () => {
  const key = `embedded-agent:restore-session:${props.appId}`
  try {
    const requestedSessionId = window.localStorage.getItem(key) || ''
    if (requestedSessionId) {
      window.localStorage.removeItem(key)
    }
    return requestedSessionId
  } catch {
    return ''
  }
}

const restoreRequestedSession = async () => {
  const requestedSessionId = consumeRequestedRestoreSessionId()
  if (!requestedSessionId || !agentApi.value?.getAgentSession) return false

  const requestedSession = await agentApi.value.getAgentSession(requestedSessionId).catch(() => null)
  if (!requestedSession?.id) return false

  const activeSession = await reopenSessionIfNeeded(requestedSession)
  if (!activeSession?.id) return false

  applySession(activeSession)
  await syncSessionProfileSnapshot()
  await refreshCapabilitySnapshot()
  return true
}

const handleReady = () => {
  readContext()
  void syncSessionProfileSnapshot()
  void refreshCapabilitySnapshot()
}

const handleClearSession = async () => {
  if (!sessionId.value || !agentApi.value?.clearAndRecreateAgentSession) return

  showContextTip.value = false

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
    await syncSessionProfileSnapshot()
    await refreshCapabilitySnapshot()
    await persistAppPreferences({
      apiProfileId: currentApiProfileId.value,
      modelId: currentModelId.value
    })
  } catch (err) {
    error.value = err.message || String(err)
  }
}

const handleScheduledTaskUpdated = async () => {
  await refreshBoundScheduledTask()
}

const handleScheduledTaskDeleted = async () => {
  await refreshBoundScheduledTask()
}

watch(sessionId, (nextSessionId) => {
  embeddedFiles.setSessionId(nextSessionId)
  if (!nextSessionId) {
    boundScheduledTaskId.value = null
    showScheduledTaskModal.value = false
    currentSessionTitle.value = ''
    currentSessionSource.value = 'manual'
    currentSessionImChannel.value = null
    return
  }
  void syncSessionProfileSnapshot()
}, { immediate: true })

onMounted(async () => {
  initLocale()
  initTheme()
  readContext()
  await loadAppPreferences()
  await loadApiProfiles()
  window.addEventListener('embedded-agent:context-changed', handleContextChanged)
  window.addEventListener('agent-session:im-binding-updated', handleImBindingChanged)
  if (window.electronAPI?.onScheduledTaskChanged) {
    cleanupScheduledTaskChanged = window.electronAPI.onScheduledTaskChanged(async () => {
      await refreshBoundScheduledTask()
    })
  }
  if (window.electronAPI?.onSessionUpdated) {
    cleanupSessionUpdated = window.electronAPI.onSessionUpdated(async (eventData) => {
      if (eventData?.sessionId !== sessionId.value) return
      await syncSessionProfileSnapshot()
    })
  }
  await initializeSession()
})

onBeforeUnmount(() => {
  window.removeEventListener('embedded-agent:context-changed', handleContextChanged)
  window.removeEventListener('agent-session:im-binding-updated', handleImBindingChanged)
  cleanupScheduledTaskChanged?.()
  cleanupSessionUpdated?.()
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
  justify-content: flex-end;
  gap: 12px;
  padding-bottom: 10px;
}

.embedded-agent-title {
  min-width: 0;
  margin-right: auto;
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.embedded-agent-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0;
  background: var(--panel-bg, var(--bg-color-secondary));
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.embedded-agent-icon-btn:hover:not(:disabled) {
  border-color: var(--selected-border, var(--border-color));
  background: var(--primary-ghost);
  color: var(--primary-color);
}

.embedded-agent-icon-btn.active {
  border-color: var(--primary-color);
  background: var(--primary-ghost);
  color: var(--primary-color);
}

.embedded-agent-icon-btn.primary {
  border-color: transparent;
  background: var(--primary-color);
  color: #fff;
}

.embedded-agent-icon-btn.primary:hover:not(:disabled) {
  background: var(--primary-color-hover);
  color: #fff;
}

.embedded-agent-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.embedded-agent-tip-anchor {
  position: relative;
  display: inline-flex;
}

.embedded-context-tip {
  position: fixed;
  z-index: 1000;
  width: min(280px, calc(100vw - 48px));
  max-height: min(280px, calc(100vh - 160px));
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow-soft);
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.embedded-agent-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  margin: -2px -2px 12px;
  padding: 4px;
}

.embedded-agent-tab {
  flex: 1;
  min-width: 0;
  border: 0;
  border-radius: 8px;
  height: 34px;
  padding: 0 10px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.embedded-agent-tab:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.embedded-agent-tab.active {
  background: var(--primary-color);
  color: var(--primary-color);
  color: #fff;
}

.embedded-agent-assistant-view,
.embedded-agent-files-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.embedded-agent-content {
  flex: 1;
  min-height: 0;
  display: flex;
}

.embedded-capability-panel {
  flex: 0 1 auto;
  max-height: min(320px, 42vh);
  overflow: auto;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-color-secondary);
}

.embedded-scheduled-task-shell {
  width: min(1180px, calc(100vw - 48px));
  max-width: min(1180px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  margin: 24px auto;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
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

.embedded-agent-files {
  flex: 1;
  min-height: 0;
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
  flex: 0 1 auto;
  min-width: 0;
  max-width: 220px;
  padding: 0 6px;
  gap: 4px;
}

.embedded-agent-chat :deep(.model-label),
.embedded-agent-chat :deep(.token-count) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

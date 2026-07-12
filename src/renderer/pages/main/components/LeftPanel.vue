<template>
  <div class="left-panel">
    <LeftPanelHeader
      :t="t"
      :panel-title="panelTitle"
      :mode-options="modeOptions"
      @mode-select="handleModeSelect"
    />

    <AgentLeftContent
      v-show="isAgentMode"
      ref="agentLeftContentRef"
      :active-session-id="activeAgentSessionId"
      :current-project="currentProject"
      @created="handleAgentCreated"
      @select="handleAgentSelected"
      @close="handleAgentClosed"
      @new-conversation-request="openAgentNewConversation"
    />

    <AgentNewConversationModal
      :show="showNewConvModal"
      @update:show="showNewConvModal = $event"
      @create="handleNewConvCreate"
    />

    <LeftPanelFooter
      :t="t"
      :settings-options="settingsOptions"
      :render-settings-label="renderSettingsLabel"
      :has-update-available="hasUpdateAvailable"
      :is-dark="isDark"
      :is-agent-mode="isAgentMode"
      @settings-select="handleSettingsSelect"
      @toggle-theme="$emit('toggle-theme')"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, h } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useAppMode, AppMode } from '@composables/useAppMode'
import { useEmbeddedApps } from '@composables/useEmbeddedApps'
import Icon from '@components/icons/Icon.vue'
import LeftPanelHeader from './LeftPanelHeader.vue'
import LeftPanelFooter from './LeftPanelFooter.vue'
import AgentLeftContent from './agent/AgentLeftContent.vue'
import AgentNewConversationModal from './agent/AgentNewConversationModal.vue'

const message = useMessage()
const { t } = useLocale()
const { isAgentMode, isNotebookMode, switchMode } = useAppMode()
const { embeddedApps, loadEmbeddedApps, openEmbeddedApp } = useEmbeddedApps()

const props = defineProps({
  projects: {
    type: Array,
    default: () => []
  },
  currentProject: {
    type: Object,
    default: null
  },
  agentCwd: {
    type: String,
    default: null
  },
  agentSessionId: {
    type: String,
    default: null
  },
  isDark: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'open-project',
  'select-project',
  'toggle-theme',
  'context-action',
  'session-created',
  'session-selected',
  'session-closed',
  'terminal-created',
  'mode-changed',
  'agent-created',
  'agent-selected',
  'agent-closed'
])

const agentLeftContentRef = ref(null)
const activeAgentSessionId = ref(null)
const showNewConvModal = ref(false)
const hasUpdateAvailable = ref(false)
let updateAvailableCleanup = null

watch(() => props.agentSessionId, (sessionId) => {
  activeAgentSessionId.value = sessionId || null
}, { immediate: true })

const renderModeIcon = (iconName) => () => h(Icon, { name: iconName, size: 16, style: 'margin-right: 8px; color: var(--primary-color)' })
const renderMenuIcon = (iconName) => () => h(Icon, { name: iconName, size: 16, style: 'margin-right: 8px; color: var(--primary-color)' })

const modeOptions = computed(() => {
  const options = []
  if (!isAgentMode.value) {
    options.push({ label: t('mode.switchToAgent'), key: 'agent', icon: renderModeIcon('robot') })
  }
  if (!isNotebookMode.value) {
    options.push({ label: t('mode.switchToNotebook'), key: 'notebook', icon: renderModeIcon('notebook') })
  }
  return options
})

const panelTitle = computed(() => {
  if (isNotebookMode.value) return t('app.modes.notebook')
  return t('app.modes.agent')
})

const settingsOptions = computed(() => [
  { label: t('settingsMenu.modelSettings'), key: 'model-settings', icon: renderMenuIcon('key') },
  { label: t('settingsMenu.channelSettings'), key: 'channel-settings', icon: renderMenuIcon('chat') },
  { label: t('settingsMenu.globalSettings'), key: 'global-settings', icon: renderMenuIcon('settings') },
  { label: t('settingsMenu.appearanceSettings'), key: 'appearance-settings', icon: renderMenuIcon('sliders') },
  { type: 'divider', key: 'd1' },
  {
    label: t('settingsMenu.embeddedApps'),
    key: 'embedded-apps',
    icon: renderMenuIcon('panelLeft'),
    children: embeddedApps.value.map((app) => ({
      label: app.label,
      key: app.menuKey,
      icon: renderMenuIcon(app.icon || 'panelLeft')
    }))
  },
  { label: t('settingsMenu.sessionApps'), key: 'session-apps', icon: renderMenuIcon('sessionApp') },
  { label: t('settingsMenu.capabilityWorkbench'), key: 'capability-workbench', icon: renderMenuIcon('wrench') },
  {
    key: 'app-update',
    icon: renderMenuIcon('download'),
    label: t('settingsMenu.appUpdate')
  }
])

const renderSettingsLabel = (option) => {
  if (option.key === 'app-update' && hasUpdateAvailable.value) {
    return h('span', { style: 'display:inline-flex; align-items:center; gap:6px;' }, [
      String(option.label),
      h('span', { style: 'width:7px; height:7px; border-radius:50%; background:#ff4d4f; flex-shrink:0;' })
    ])
  }
  return typeof option.label === 'function' ? option.label() : option.label
}

const handleModeSelect = (key) => {
  if (key === 'notebook') {
    handleOpenNotebook()
    return
  }
  if (key === 'agent') {
    handleSwitchMode(key)
  }
}

const handleSwitchMode = async (mode) => {
  await switchMode(mode)
  emit('mode-changed', mode)
}

const handleOpenNotebook = async () => {
  await switchMode(AppMode.NOTEBOOK)
  emit('mode-changed', AppMode.NOTEBOOK)
}

const openAgentNewConversation = () => {
  showNewConvModal.value = true
}

const handleAgentCreated = (session) => {
  activeAgentSessionId.value = session.id
  emit('agent-created', session)
}

const handleNewConvCreate = async ({ cwd, apiProfileId }) => {
  showNewConvModal.value = false
  if (agentLeftContentRef.value) {
    const session = await agentLeftContentRef.value.createConversation({
      type: 'chat',
      cwd: cwd || null,
      apiProfileId: apiProfileId || null
    })
    if (session) {
      handleAgentCreated(session)
    }
  }
}

const handleAgentSelected = async (conv) => {
  if (conv.status === 'closed' || conv.status === undefined) {
    try {
      const result = await window.electronAPI.reopenAgentSession(conv.id)
      if (result && !result.error) {
        Object.assign(conv, result, {
          status: result.status || 'idle'
        })
      } else if (result?.error) {
        message.error(`${t('agent.reopenFailed') || '恢复会话失败'}：${result.error}`)
      }
    } catch (err) {
      console.error('[LeftPanel] reopen agent session error:', err)
      message.error(`${t('agent.reopenError') || '恢复会话异常'}：${err.message}`)
    }
  }
  activeAgentSessionId.value = conv.id
  emit('agent-selected', conv)
}

const handleAgentClosed = async (conv) => {
  if (agentLeftContentRef.value) {
    await agentLeftContentRef.value.closeConversation(conv.id)
  }
  if (activeAgentSessionId.value === conv.id) {
    activeAgentSessionId.value = null
  }
  emit('agent-closed', conv)
}

const updateAgentConversationRuntime = (payload) => {
  agentLeftContentRef.value?.updateConversationRuntime?.(payload)
}

const handleSettingsSelect = async (key) => {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  if (embeddedApps.value.some((app) => app.menuKey === key)) {
    await openEmbeddedApp(key)
    return
  }

  switch (key) {
    case 'model-settings':
      window.electronAPI.openModelSettings()
      break
    case 'global-settings':
      window.electronAPI.openGlobalSettings()
      break
    case 'capability-workbench':
      window.electronAPI.openSettingsWorkbench({
        mode: 'agent',
        cwd: props.agentCwd || props.currentProject?.path || null
      })
      break
    case 'session-apps':
      window.electronAPI.openSettingsWorkbench({
        mode: 'agent',
        cwd: props.agentCwd || props.currentProject?.path || null,
        section: 'session-apps'
      })
      break
    case 'appearance-settings':
      window.electronAPI.openAppearanceSettings()
      break
    case 'channel-settings':
      window.electronAPI.openChannelSettings()
      break
    case 'app-update':
      window.electronAPI.openUpdateManager()
      break
  }
}

onMounted(async () => {
  await loadEmbeddedApps()

  if (window.electronAPI?.getUpdateStatus) {
    try {
      const status = await window.electronAPI.getUpdateStatus()
      if (status?.hasUpdate) {
        hasUpdateAvailable.value = true
      }
    } catch (err) {
      console.error('[LeftPanel] Failed to get update status:', err)
    }
  }

  if (window.electronAPI?.onUpdateAvailable) {
    updateAvailableCleanup = window.electronAPI.onUpdateAvailable(() => {
      hasUpdateAvailable.value = true
    })
  }
})

onUnmounted(() => {
  if (updateAvailableCleanup) updateAvailableCleanup()
})

const loadActiveSessions = async () => []
const loadHistorySessions = async () => []

defineExpose({
  loadActiveSessions,
  loadHistorySessions,
  reloadAgentConversations: () => agentLeftContentRef.value?.loadConversations?.(),
  updateAgentConversationRuntime,
  openAgentNewConversation,
  activeAgentSessionId
})
</script>

<style scoped>
.left-panel {
  width: 280px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--panel-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}
</style>

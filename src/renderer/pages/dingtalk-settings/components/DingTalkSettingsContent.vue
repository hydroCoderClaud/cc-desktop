<template>
  <div class="settings-page" :style="cssVars">
    <template v-if="configLoaded">
      <div v-if="!embedded" class="settings-header">
        <h1>{{ t('dingtalkSettings.title') }}</h1>
        <n-space>
          <n-tag :type="statusType" size="small" round>
            {{ statusText }}
          </n-tag>
        </n-space>
      </div>
      <div v-else class="embedded-header">
        <div>
          <div class="embedded-title">{{ t('dingtalkSettings.title') }}</div>
          <div class="embedded-subtitle">{{ t('dingtalkSettings.embeddedSubtitle') }}</div>
        </div>
        <n-tag :type="statusType" size="small" round>
          {{ statusText }}
        </n-tag>
      </div>

      <n-alert type="info" :show-icon="true" style="margin-bottom: 16px;">
        {{ t('dingtalkSettings.description') }}
      </n-alert>

      <n-card :title="t('dingtalkSettings.basicConfig')" class="settings-section">
        <template #header-extra>
          <n-button text type="primary" size="small" @click="openGuide">
            {{ t('dingtalkSettings.viewGuide') }}
          </n-button>
        </template>
        <n-form-item :label="t('dingtalkSettings.enableBridge')">
          <n-switch
            :value="formData.enabled"
            :loading="togglingEnabled"
            @update:value="handleEnabledChange"
          />
          <template #feedback>{{ t('dingtalkSettings.enableHint') }}</template>
        </n-form-item>

        <n-form-item :label="t('dingtalkSettings.appKey')">
          <n-input
            v-model:value="formData.appKey"
            :placeholder="t('dingtalkSettings.appKeyPlaceholder')"
            :disabled="!formData.enabled"
          />
          <template #feedback>{{ t('dingtalkSettings.appKeyHint') }}</template>
        </n-form-item>

        <n-form-item :label="t('dingtalkSettings.appSecret')">
          <n-input
            v-model:value="formData.appSecret"
            type="password"
            show-password-on="click"
            :placeholder="t('dingtalkSettings.appSecretPlaceholder')"
            :disabled="!formData.enabled"
          />
          <template #feedback>{{ t('dingtalkSettings.appSecretHint') }}</template>
        </n-form-item>

        <n-form-item :label="t('dingtalkSettings.robotCode')">
          <n-input
            v-model:value="formData.robotCode"
            :placeholder="t('dingtalkSettings.robotCodePlaceholder')"
            :disabled="!formData.enabled"
          />
          <template #feedback>{{ t('dingtalkSettings.robotCodeHint') }}</template>
        </n-form-item>
      </n-card>

      <n-card :title="t('dingtalkSettings.connectionControl')" class="settings-section">
        <n-space>
          <n-button
            type="primary"
            :disabled="!canRunAction"
            :loading="connecting"
            @click="handleConnect"
          >
            {{ primaryActionText }}
          </n-button>
          <n-button
            :disabled="!canDisconnect"
            @click="handleDisconnect"
          >
            {{ t('dingtalkSettings.disconnect') }}
          </n-button>
        </n-space>
        <div v-if="activeSessions > 0" class="session-info">
          {{ t('dingtalkSettings.activeSessions', { count: activeSessions }) }}
        </div>
      </n-card>

      <n-card :title="t('dingtalkSettings.advancedSettings')" class="settings-section">
        <n-form-item :label="t('dingtalkSettings.maxHistorySessions')">
          <n-input-number
            v-model:value="formData.maxHistorySessions"
            :min="1"
            :max="20"
            :disabled="!formData.enabled"
          />
          <template #feedback>{{ t('dingtalkSettings.maxHistorySessionsHint') }}</template>
        </n-form-item>
      </n-card>

      <div class="settings-footer">
        <n-space>
          <n-button v-if="!embedded" @click="handleClose">{{ t('common.close') }}</n-button>
          <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
        </n-space>
      </div>
    </template>
    <div v-else class="loading-state">{{ t('common.loading') }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})

const message = useMessage()
const { invoke } = useIPC()
const { cssVars, initTheme } = useTheme()
const { t, initLocale } = useLocale()

const formData = ref({
  enabled: false,
  appKey: '',
  appSecret: '',
  robotCode: '',
  maxHistorySessions: 5
})

const connected = ref(false)
const activeSessions = ref(0)
const connecting = ref(false)
const togglingEnabled = ref(false)
const configLoaded = ref(false)
const runtimeState = ref('disabled')
const manualStopped = ref(false)

// Cleanup listeners
const cleanups = []

const statusType = computed(() => {
  if (runtimeState.value === 'connected') return 'success'
  if (runtimeState.value === 'error') return 'error'
  if (runtimeState.value === 'reconnecting' || runtimeState.value === 'connecting') return 'warning'
  return 'default'
})
const statusText = computed(() => {
  if (!formData.value.enabled || runtimeState.value === 'disabled') return '未启用'
  if (runtimeState.value === 'connected') return t('dingtalkSettings.statusConnected')
  if (runtimeState.value === 'manually_disconnected') return '已断开'
  if (runtimeState.value === 'reconnecting') return '重连中'
  if (runtimeState.value === 'connecting') return '连接中'
  if (runtimeState.value === 'error') return '连接失败'
  return t('dingtalkSettings.statusDisconnected')
})

const canRunAction = computed(() =>
  !togglingEnabled.value && formData.value.enabled && formData.value.appKey && formData.value.appSecret
)
const canDisconnect = computed(() =>
  !togglingEnabled.value && formData.value.enabled && runtimeState.value === 'connected'
)
const primaryActionText = computed(() => {
  if (!formData.value.enabled || runtimeState.value === 'disabled') return t('dingtalkSettings.connect')
  if (runtimeState.value === 'connected') return t('dingtalkSettings.reconnect')
  if (runtimeState.value === 'connecting' || runtimeState.value === 'reconnecting') return t('dingtalkSettings.reconnect')
  return t('dingtalkSettings.connect')
})

const applyStatus = (status) => {
  if (!status) return
  connected.value = !!status.connected
  activeSessions.value = status.activeSessions || 0
  runtimeState.value = status.runtimeState || (status.connected ? 'connected' : 'disconnected')
  manualStopped.value = !!status.manualStopped
}

onMounted(async () => {
  await initTheme()
  await initLocale()
  await loadConfig()
  await refreshStatus()
  configLoaded.value = true

  // Listen for status changes
  if (window.electronAPI?.onDingTalkStatusChange) {
    const cleanup = window.electronAPI.onDingTalkStatusChange((data) => {
      applyStatus(data)
    })
    cleanups.push(cleanup)
  }
  if (window.electronAPI?.onDingTalkError) {
    const cleanup = window.electronAPI.onDingTalkError((data) => {
      message.error(data.error || 'DingTalk error')
    })
    cleanups.push(cleanup)
  }
})

onActivated(async () => {
  await loadConfig()
  await refreshStatus()
})

onUnmounted(() => {
  cleanups.forEach(fn => fn && fn())
})

const loadConfig = async () => {
  try {
    const config = await invoke('getConfig')
    const dt = config?.dingtalk || {}
    formData.value.enabled = dt.enabled || false
    formData.value.appKey = dt.appKey || ''
    formData.value.appSecret = dt.appSecret || ''
    formData.value.robotCode = dt.robotCode || ''
    formData.value.maxHistorySessions = dt.maxHistorySessions || 5
  } catch (err) {
    console.error('Failed to load DingTalk config:', err)
  }
}

const refreshStatus = async () => {
  try {
    const status = await invoke('getDingTalkStatus')
    applyStatus(status)
  } catch (err) {
    console.error('Failed to get DingTalk status:', err)
  }
}

const buildConfigPayload = (enabled = formData.value.enabled) => ({
  appKey: formData.value.appKey,
  appSecret: formData.value.appSecret,
  robotCode: formData.value.robotCode,
  enabled,
  maxHistorySessions: formData.value.maxHistorySessions,
})

const handleEnabledChange = async (nextEnabled) => {
  if (togglingEnabled.value || nextEnabled === formData.value.enabled) return
  togglingEnabled.value = true
  try {
    await invoke('updateDingTalkConfig', buildConfigPayload(nextEnabled))
    const status = await invoke('setDingTalkEnabled', nextEnabled)
    formData.value.enabled = !!nextEnabled
    applyStatus(status)
  } catch (err) {
    console.error('Failed to toggle DingTalk bridge:', err)
    message.error((nextEnabled ? t('dingtalkSettings.connectFailed') : t('dingtalkSettings.disconnected')) + ': ' + err.message)
  } finally {
    togglingEnabled.value = false
  }
}

const handleSave = async () => {
  try {
    await invoke('updateDingTalkConfig', buildConfigPayload())
    message.success(t('dingtalkSettings.saveSuccess'))
    await refreshStatus()
  } catch (err) {
    console.error('Failed to save DingTalk config:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleConnect = async () => {
  connecting.value = true
  try {
    await invoke('updateDingTalkConfig', buildConfigPayload())
    const result = await invoke(
      runtimeState.value === 'connected' ? 'restartDingTalk' : 'startDingTalk'
    )
    if (result) {
      message.success(t('dingtalkSettings.connectSuccess'))
    } else {
      message.warning(t('dingtalkSettings.connectFailed'))
    }
    await refreshStatus()
  } catch (err) {
    console.error('Failed to connect DingTalk:', err)
    message.error(t('dingtalkSettings.connectFailed') + ': ' + err.message)
  } finally {
    connecting.value = false
  }
}

const handleDisconnect = async () => {
  try {
    await invoke('stopDingTalk')
    message.success(t('dingtalkSettings.disconnected'))
    await refreshStatus()
  } catch (err) {
    console.error('Failed to disconnect DingTalk:', err)
    message.error(err.message)
  }
}


const openGuide = () => {
  window.electronAPI?.openExternal('https://github.com/hydroCoderClaud/cc-desktop/blob/master/docs/user-guide/DINGTALK-GUIDE.zh.md')
}

const handleClose = () => {
  if (props.embedded) return
  window.close()
}
</script>

<style scoped>
.embedded-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.embedded-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-color);
}

.embedded-subtitle {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color-2);
}

.session-info {
  margin-top: 12px;
  font-size: 13px;
  opacity: 0.7;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  color: var(--text-color-2);
  font-size: 14px;
}
</style>

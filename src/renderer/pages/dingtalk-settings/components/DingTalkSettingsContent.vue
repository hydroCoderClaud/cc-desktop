<template>
  <div class="settings-page" :style="cssVars">
    <!-- Header -->
    <div class="settings-header">
      <h1>{{ t('dingtalkSettings.title') }}</h1>
      <n-space>
        <n-tag :type="statusType" size="small" round>
          {{ statusText }}
        </n-tag>
      </n-space>
    </div>

    <!-- Description -->
    <n-alert type="info" :show-icon="true" style="margin-bottom: 16px;">
      {{ t('dingtalkSettings.description') }}
    </n-alert>

    <!-- Enable Switch -->
    <n-card :title="t('dingtalkSettings.basicConfig')" class="settings-section">
      <template #header-extra>
        <n-button text type="primary" size="small" @click="openGuide">
          {{ t('dingtalkSettings.viewGuide') }}
        </n-button>
      </template>
      <n-form-item :label="t('dingtalkSettings.enableBridge')">
        <n-switch v-model:value="formData.enabled" />
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

      <n-form-item :label="t('dingtalkSettings.defaultCwd')">
        <n-input-group>
          <n-input
            v-model:value="formData.defaultCwd"
            :placeholder="t('dingtalkSettings.defaultCwdPlaceholder')"
            :disabled="!formData.enabled"
            style="flex: 1"
          />
          <n-button
            :disabled="!formData.enabled"
            @click="handleSelectCwd"
          >
            {{ t('dingtalkSettings.browse') }}
          </n-button>
        </n-input-group>
        <template #feedback>{{ t('dingtalkSettings.defaultCwdHint') }}</template>
      </n-form-item>
    </n-card>

    <!-- Connection Control -->
    <n-card :title="t('dingtalkSettings.connectionControl')" class="settings-section">
      <n-space>
        <n-button
          type="primary"
          :disabled="!canConnect"
          :loading="connecting"
          @click="handleConnect"
        >
          {{ connected ? t('dingtalkSettings.reconnect') : t('dingtalkSettings.connect') }}
        </n-button>
        <n-button
          :disabled="!connected"
          @click="handleDisconnect"
        >
          {{ t('dingtalkSettings.disconnect') }}
        </n-button>
      </n-space>
      <div v-if="activeSessions > 0" class="session-info">
        {{ t('dingtalkSettings.activeSessions', { count: activeSessions }) }}
      </div>
    </n-card>

    <!-- Footer Buttons -->
    <div class="settings-footer">
      <n-space>
        <n-button @click="handleClose">{{ t('common.close') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { cssVars, initTheme } = useTheme()
const { t, initLocale } = useLocale()

const formData = ref({
  enabled: false,
  appKey: '',
  appSecret: '',
  defaultCwd: ''
})

const connected = ref(false)
const activeSessions = ref(0)
const connecting = ref(false)

// Cleanup listeners
const cleanups = []

const statusType = computed(() => connected.value ? 'success' : 'default')
const statusText = computed(() =>
  connected.value ? t('dingtalkSettings.statusConnected') : t('dingtalkSettings.statusDisconnected')
)

const canConnect = computed(() =>
  formData.value.enabled && formData.value.appKey && formData.value.appSecret
)

onMounted(async () => {
  await initTheme()
  await initLocale()
  await loadConfig()
  await refreshStatus()

  // Listen for status changes
  if (window.electronAPI?.onDingTalkStatusChange) {
    const cleanup = window.electronAPI.onDingTalkStatusChange((data) => {
      connected.value = data.connected
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
    formData.value.defaultCwd = dt.defaultCwd || ''
  } catch (err) {
    console.error('Failed to load DingTalk config:', err)
  }
}

const refreshStatus = async () => {
  try {
    const status = await invoke('getDingTalkStatus')
    if (status) {
      connected.value = status.connected
      activeSessions.value = status.activeSessions || 0
    }
  } catch (err) {
    console.error('Failed to get DingTalk status:', err)
  }
}

const handleSave = async () => {
  try {
    await invoke('updateDingTalkConfig', {
      appKey: formData.value.appKey,
      appSecret: formData.value.appSecret,
      enabled: formData.value.enabled,
      defaultCwd: formData.value.defaultCwd
    })
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
    // Save config first, then start
    await invoke('updateDingTalkConfig', {
      appKey: formData.value.appKey,
      appSecret: formData.value.appSecret,
      enabled: true,
      defaultCwd: formData.value.defaultCwd
    })
    formData.value.enabled = true
    const result = await invoke('startDingTalk')
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

const handleSelectCwd = async () => {
  try {
    const folderPath = await window.electronAPI.selectFolder()
    if (folderPath) {
      formData.value.defaultCwd = folderPath
    }
  } catch (err) {
    console.error('Failed to select folder:', err)
  }
}

const openGuide = () => {
  window.electronAPI?.openExternal('https://github.com/hydroCoderClaud/cc-desktop/blob/master/docs/user-guide/DINGTALK-GUIDE.zh.md')
}

const handleClose = () => {
  window.close()
}
</script>

<style scoped>
.session-info {
  margin-top: 12px;
  font-size: 13px;
  opacity: 0.7;
}
</style>

<template>
  <div class="settings-page" :style="cssVars">
    <!-- Header -->
    <div class="settings-header">
      <h1>{{ t('globalSettings.title') }}</h1>
      <n-space>
        <n-button @click="handleReset">{{ t('common.reset') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
      </n-space>
    </div>

    <!-- Timeout Settings Section -->
    <n-card :title="t('globalSettings.timeout')" class="settings-section">
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('common.testConnection')">
            <n-input-number
              v-model:value="formData.testTimeout"
              :min="5"
              :max="120"
              placeholder="30"
            />
            <template #feedback>{{ t('globalSettings.requestTimeoutHint') }}</template>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.requestTimeout')">
            <n-input-number
              v-model:value="formData.requestTimeout"
              :min="10"
              :max="3600"
              placeholder="120"
            />
            <template #feedback>{{ t('globalSettings.requestTimeoutHint') }}</template>
          </n-form-item>
        </n-grid-item>
      </n-grid>
    </n-card>

    <!-- Session Settings Section -->
    <n-card :title="t('globalSettings.sessionSettings')" class="settings-section">
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('globalSettings.maxActiveSessions')">
            <n-input-number
              v-model:value="formData.maxActiveSessions"
              :min="1"
              :max="20"
              placeholder="5"
            />
            <template #feedback>{{ t('globalSettings.maxActiveSessionsHint') }}</template>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.maxHistorySessions')">
            <n-input-number
              v-model:value="formData.maxHistorySessions"
              :min="1"
              :max="50"
              placeholder="10"
            />
            <template #feedback>{{ t('globalSettings.maxHistorySessionsHint') }}</template>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.autocompactPctOverride')">
            <n-input-number
              v-model:value="formData.autocompactPctOverride"
              :min="0"
              :max="100"
              :placeholder="t('globalSettings.autocompactDefault')"
              clearable
            />
            <template #feedback>{{ t('globalSettings.autocompactPctOverrideHint') }}</template>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.messageQueue')">
            <n-switch v-model:value="formData.messageQueue" @update:value="handleQueueToggle" />
            <template #feedback>{{ t('globalSettings.messageQueueHint') }}</template>
          </n-form-item>
        </n-grid-item>
      </n-grid>
    </n-card>

    <!-- Component Market Section -->
    <n-card :title="t('globalSettings.market')" class="settings-section">
      <n-form-item :label="t('globalSettings.marketUrl')">
        <n-input
          v-model:value="formData.skillsMarketUrl"
          :placeholder="t('globalSettings.marketUrlPlaceholder')"
          clearable
        />
        <template #feedback>{{ t('globalSettings.marketUrlHint') }}</template>
      </n-form-item>
    </n-card>

    <!-- Application Update Section -->
    <n-card :title="t('globalSettings.appUpdate')" class="settings-section">
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('globalSettings.currentVersion')">
            <n-text>{{ currentVersion }}</n-text>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.checkUpdate')">
            <n-button
              @click="handleCheckUpdate"
              :loading="checkingUpdate"
              :disabled="checkingUpdate"
            >
              {{ checkingUpdate ? t('globalSettings.checking') : t('globalSettings.checkNow') }}
            </n-button>
            <template #feedback>
              <span v-if="updateCheckMessage" :style="{ color: updateCheckMessageType === 'success' ? '#52c41a' : '#faad14' }">
                {{ updateCheckMessage }}
              </span>
            </template>
          </n-form-item>
        </n-grid-item>
      </n-grid>
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
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { cssVars, initTheme } = useTheme()
const { t, initLocale } = useLocale()

// Default values
const DEFAULTS = {
  testTimeout: 30,
  requestTimeout: 120,
  maxActiveSessions: 5,
  maxHistorySessions: 10,
  autocompactPctOverride: null,  // null 表示使用 Claude Code 默认值
  skillsMarketUrl: 'https://raw.githubusercontent.com/hydroCoderClaud/hydroSkills/main',
  messageQueue: true
}

const formData = ref({
  testTimeout: DEFAULTS.testTimeout,
  requestTimeout: DEFAULTS.requestTimeout,
  maxActiveSessions: DEFAULTS.maxActiveSessions,
  maxHistorySessions: DEFAULTS.maxHistorySessions,
  autocompactPctOverride: DEFAULTS.autocompactPctOverride,
  skillsMarketUrl: DEFAULTS.skillsMarketUrl,
  messageQueue: DEFAULTS.messageQueue
})

// Update check states
const currentVersion = ref('')
const checkingUpdate = ref(false)
const updateCheckMessage = ref('')
const updateCheckMessageType = ref('success') // 'success' or 'info'

onMounted(async () => {
  await initTheme()
  await initLocale()
  await loadSettings()
  await loadVersion()
})

const loadVersion = async () => {
  try {
    currentVersion.value = await invoke('getAppVersion')
  } catch (err) {
    console.error('Failed to get app version:', err)
    currentVersion.value = 'Unknown'
  }
}

const loadSettings = async () => {
  try {
    // Get timeout settings
    const timeout = await invoke('getTimeout')
    if (timeout) {
      formData.value.testTimeout = timeout.test ? timeout.test / 1000 : DEFAULTS.testTimeout
      formData.value.requestTimeout = timeout.request ? timeout.request / 1000 : DEFAULTS.requestTimeout
    }

    // Get max active sessions
    const maxActiveSessions = await invoke('getMaxActiveSessions')
    formData.value.maxActiveSessions = maxActiveSessions || DEFAULTS.maxActiveSessions

    // Get max history sessions
    const maxHistorySessions = await invoke('getMaxHistorySessions')
    formData.value.maxHistorySessions = maxHistorySessions || DEFAULTS.maxHistorySessions

    // Get autocompact pct override
    const autocompactPct = await invoke('getAutocompactPctOverride')
    formData.value.autocompactPctOverride = autocompactPct

    // Get skills market config
    const marketConfig = await invoke('getMarketConfig')
    formData.value.skillsMarketUrl = marketConfig?.registryUrl || DEFAULTS.skillsMarketUrl

    // Get message queue setting
    const config = await invoke('getConfig')
    if (config?.settings?.agent?.messageQueue !== undefined) {
      formData.value.messageQueue = config.settings.agent.messageQueue
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
    message.error(t('messages.loadFailed') + ': ' + err.message)
  }
}

// 队列开关实时生效（不依赖保存按钮）
const handleQueueToggle = async (enabled) => {
  try {
    const config = await invoke('getConfig')
    if (config?.settings?.agent) {
      config.settings.agent.messageQueue = enabled
      // 深拷贝避免 Vue Proxy 序列化问题
      await invoke('saveConfig', JSON.parse(JSON.stringify(config)))
    }
  } catch (err) {
    console.error('Failed to save queue setting:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleSave = async () => {
  try {
    // Save timeout (convert to ms)
    const timeout = {
      test: formData.value.testTimeout * 1000,
      request: formData.value.requestTimeout * 1000
    }
    await invoke('updateTimeout', timeout)

    // Save max active sessions
    await invoke('updateMaxActiveSessions', formData.value.maxActiveSessions)

    // Save max history sessions
    await invoke('updateMaxHistorySessions', formData.value.maxHistorySessions)

    // Save autocompact pct override
    await invoke('updateAutocompactPctOverride', formData.value.autocompactPctOverride)

    // Save skills market config
    await invoke('updateMarketConfig', { registryUrl: formData.value.skillsMarketUrl || '' })

    // 注意：消息队列设置已在 handleQueueToggle 中实时保存，这里不再重复保存

    message.success(t('globalSettings.saveSuccess'))
    await loadSettings()
  } catch (err) {
    console.error('Failed to save settings:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleReset = async () => {
  try {
    // Reset form to defaults
    formData.value.testTimeout = DEFAULTS.testTimeout
    formData.value.requestTimeout = DEFAULTS.requestTimeout
    formData.value.maxActiveSessions = DEFAULTS.maxActiveSessions
    formData.value.maxHistorySessions = DEFAULTS.maxHistorySessions
    formData.value.autocompactPctOverride = DEFAULTS.autocompactPctOverride
    formData.value.skillsMarketUrl = DEFAULTS.skillsMarketUrl
    formData.value.messageQueue = DEFAULTS.messageQueue

    // Save to backend
    await invoke('updateTimeout', {
      test: DEFAULTS.testTimeout * 1000,
      request: DEFAULTS.requestTimeout * 1000
    })
    await invoke('updateMaxActiveSessions', DEFAULTS.maxActiveSessions)
    await invoke('updateMaxHistorySessions', DEFAULTS.maxHistorySessions)
    await invoke('updateAutocompactPctOverride', DEFAULTS.autocompactPctOverride)
    await invoke('updateMarketConfig', { registryUrl: DEFAULTS.skillsMarketUrl })

    // 注意：消息队列设置已在 handleQueueToggle 中实时保存（通过 v-model 触发），这里不再重复保存

    message.success(t('messages.saveSuccess'))
  } catch (err) {
    console.error('Failed to reset settings:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleClose = () => {
  window.close()
}

// Check for updates manually
const handleCheckUpdate = async () => {
  checkingUpdate.value = true
  updateCheckMessage.value = ''

  try {
    // Call the update check API (silent = false to show notifications)
    await invoke('checkForUpdates', false)

    // Listen for update events
    const cleanup = []

    // Update available
    if (window.electronAPI?.onUpdateAvailable) {
      const cleanupAvailable = window.electronAPI.onUpdateAvailable((info) => {
        updateCheckMessage.value = t('globalSettings.updateAvailable', { version: info.version })
        updateCheckMessageType.value = 'info'
        message.info(t('globalSettings.updateAvailable', { version: info.version }))
        checkingUpdate.value = false
        cleanup.forEach(fn => fn())
      })
      cleanup.push(cleanupAvailable)
    }

    // No update available
    if (window.electronAPI?.onUpdateNotAvailable) {
      const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
        updateCheckMessage.value = t('globalSettings.alreadyLatest')
        updateCheckMessageType.value = 'success'
        message.success(t('globalSettings.alreadyLatest'))
        checkingUpdate.value = false
        cleanup.forEach(fn => fn())
      })
      cleanup.push(cleanupNotAvailable)
    }

    // Error
    if (window.electronAPI?.onUpdateError) {
      const cleanupError = window.electronAPI.onUpdateError((error) => {
        updateCheckMessage.value = t('globalSettings.checkFailed', { error: error.message })
        updateCheckMessageType.value = 'info'
        message.error(t('globalSettings.checkFailed', { error: error.message }))
        checkingUpdate.value = false
        cleanup.forEach(fn => fn())
      })
      cleanup.push(cleanupError)
    }

    // Fallback: if no event fires within 10 seconds, reset state
    setTimeout(() => {
      if (checkingUpdate.value) {
        checkingUpdate.value = false
        cleanup.forEach(fn => fn())
      }
    }, 10000)
  } catch (err) {
    console.error('Failed to check for updates:', err)
    message.error(t('globalSettings.checkFailed', { error: err.message }))
    updateCheckMessage.value = t('globalSettings.checkFailed', { error: err.message })
    updateCheckMessageType.value = 'info'
    checkingUpdate.value = false
  }
}
</script>

<style scoped>
/* 组件特有样式 - 公共样式由 settings-common.css 提供 */
</style>

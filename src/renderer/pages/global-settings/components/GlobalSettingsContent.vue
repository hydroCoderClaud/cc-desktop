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
  skillsMarketUrl: 'https://raw.githubusercontent.com/hydroCoderClaud/hydroSkills/main'
}

const formData = ref({
  testTimeout: DEFAULTS.testTimeout,
  requestTimeout: DEFAULTS.requestTimeout,
  maxActiveSessions: DEFAULTS.maxActiveSessions,
  maxHistorySessions: DEFAULTS.maxHistorySessions,
  autocompactPctOverride: DEFAULTS.autocompactPctOverride,
  skillsMarketUrl: DEFAULTS.skillsMarketUrl
})

onMounted(async () => {
  await initTheme()
  await initLocale()
  await loadSettings()
})

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
  } catch (err) {
    console.error('Failed to load settings:', err)
    message.error(t('messages.loadFailed') + ': ' + err.message)
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

    // Save to backend
    await invoke('updateTimeout', {
      test: DEFAULTS.testTimeout * 1000,
      request: DEFAULTS.requestTimeout * 1000
    })
    await invoke('updateMaxActiveSessions', DEFAULTS.maxActiveSessions)
    await invoke('updateMaxHistorySessions', DEFAULTS.maxHistorySessions)
    await invoke('updateAutocompactPctOverride', DEFAULTS.autocompactPctOverride)
    await invoke('updateMarketConfig', { registryUrl: DEFAULTS.skillsMarketUrl })

    message.success(t('messages.saveSuccess'))
  } catch (err) {
    console.error('Failed to reset settings:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleClose = () => {
  window.close()
}
</script>

<style scoped>
/* 组件特有样式 - 公共样式由 settings-common.css 提供 */
</style>

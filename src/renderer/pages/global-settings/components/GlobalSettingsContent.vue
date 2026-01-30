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

    <!-- Global Models Section -->
    <n-card :title="t('globalSettings.defaultModels')" class="settings-section">
      <p class="settings-section-desc">{{ t('globalSettings.defaultModelsHint') }}</p>
      <div class="model-inputs">
        <div class="model-row">
          <span class="label">{{ t('profileManager.opusModel') }}</span>
          <n-input
            v-model:value="formData.opus"
            :placeholder="t('common.default')"
            class="model-input"
          />
          <n-button size="small" @click="useDefault('opus')">{{ t('common.default') }}</n-button>
        </div>

        <div class="model-row">
          <span class="label">{{ t('profileManager.sonnetModel') }}</span>
          <n-input
            v-model:value="formData.sonnet"
            :placeholder="t('common.default')"
            class="model-input"
          />
          <n-button size="small" @click="useDefault('sonnet')">{{ t('common.default') }}</n-button>
        </div>

        <div class="model-row">
          <span class="label">{{ t('profileManager.haikuModel') }}</span>
          <n-input
            v-model:value="formData.haiku"
            :placeholder="t('common.default')"
            class="model-input"
          />
          <n-button size="small" @click="useDefault('haiku')">{{ t('common.default') }}</n-button>
        </div>
      </div>
    </n-card>

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
import Icon from '@components/icons/Icon.vue'

const message = useMessage()
const { invoke } = useIPC()
const { cssVars, initTheme } = useTheme()
const { t, initLocale } = useLocale()

// Default values
const DEFAULTS = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001',
  testTimeout: 30,
  requestTimeout: 120,
  maxActiveSessions: 5,
  maxHistorySessions: 10,
  autocompactPctOverride: null  // null 表示使用 Claude Code 默认值
}

const formData = ref({
  opus: '',
  sonnet: '',
  haiku: '',
  testTimeout: DEFAULTS.testTimeout,
  requestTimeout: DEFAULTS.requestTimeout,
  maxActiveSessions: DEFAULTS.maxActiveSessions,
  maxHistorySessions: DEFAULTS.maxHistorySessions,
  autocompactPctOverride: DEFAULTS.autocompactPctOverride
})

onMounted(async () => {
  await initTheme()
  await initLocale()
  await loadSettings()
})

const loadSettings = async () => {
  try {
    // Get global models
    const globalModels = await invoke('getGlobalModels')
    if (globalModels) {
      formData.value.opus = globalModels.opus || ''
      formData.value.sonnet = globalModels.sonnet || ''
      formData.value.haiku = globalModels.haiku || ''
    }

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
  } catch (err) {
    console.error('Failed to load settings:', err)
    message.error(t('messages.loadFailed') + ': ' + err.message)
  }
}

const handleSave = async () => {
  try {
    // Save global models (use defaults for empty fields)
    const globalModels = {
      opus: formData.value.opus.trim() || DEFAULTS.opus,
      sonnet: formData.value.sonnet.trim() || DEFAULTS.sonnet,
      haiku: formData.value.haiku.trim() || DEFAULTS.haiku
    }
    await invoke('updateGlobalModels', globalModels)

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
    formData.value.opus = DEFAULTS.opus
    formData.value.sonnet = DEFAULTS.sonnet
    formData.value.haiku = DEFAULTS.haiku
    formData.value.testTimeout = DEFAULTS.testTimeout
    formData.value.requestTimeout = DEFAULTS.requestTimeout
    formData.value.maxActiveSessions = DEFAULTS.maxActiveSessions
    formData.value.maxHistorySessions = DEFAULTS.maxHistorySessions
    formData.value.autocompactPctOverride = DEFAULTS.autocompactPctOverride

    // Save to backend
    await invoke('updateGlobalModels', {
      opus: DEFAULTS.opus,
      sonnet: DEFAULTS.sonnet,
      haiku: DEFAULTS.haiku
    })
    await invoke('updateTimeout', {
      test: DEFAULTS.testTimeout * 1000,
      request: DEFAULTS.requestTimeout * 1000
    })
    await invoke('updateMaxActiveSessions', DEFAULTS.maxActiveSessions)
    await invoke('updateMaxHistorySessions', DEFAULTS.maxHistorySessions)
    await invoke('updateAutocompactPctOverride', DEFAULTS.autocompactPctOverride)

    message.success(t('messages.saveSuccess'))
  } catch (err) {
    console.error('Failed to reset settings:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const useDefault = (field) => {
  formData.value[field] = DEFAULTS[field]
}

const handleClose = () => {
  window.close()
}
</script>

<style scoped>
/* 组件特有样式 - 公共样式由 settings-common.css 提供 */
.model-inputs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-row .icon {
  font-size: 20px;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}

.model-row .label {
  min-width: 100px;
  font-size: 14px;
  font-weight: 500;
}

.model-row .model-input {
  flex: 1;
}
</style>

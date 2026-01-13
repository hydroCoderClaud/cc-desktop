<template>
  <div class="global-settings">
    <!-- Header -->
    <div class="header">
      <h1>{{ t('globalSettings.title') }}</h1>
      <n-space>
        <n-button @click="handleReset">{{ t('common.reset') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
      </n-space>
    </div>

    <!-- Appearance Section -->
    <n-card :title="t('globalSettings.appearance')" class="section-card">
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('globalSettings.theme')">
            <n-select
              v-model:value="formData.theme"
              :options="themeOptions"
            />
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.language')">
            <n-select
              v-model:value="formData.locale"
              :options="localeOptions"
            />
          </n-form-item>
        </n-grid-item>
      </n-grid>
    </n-card>

    <!-- Global Models Section -->
    <n-card :title="t('globalSettings.defaultModels')" class="section-card">
      <p class="section-desc">{{ t('globalSettings.defaultModelsHint') }}</p>
      <div class="model-inputs">
        <div class="model-row">
          <span class="icon">🚀</span>
          <span class="label">{{ t('profileManager.opusModel') }}</span>
          <n-input
            v-model:value="formData.opus"
            :placeholder="t('common.default')"
            class="model-input"
          />
          <n-button size="small" @click="useDefault('opus')">{{ t('common.default') }}</n-button>
        </div>

        <div class="model-row">
          <span class="icon">⚡</span>
          <span class="label">{{ t('profileManager.sonnetModel') }}</span>
          <n-input
            v-model:value="formData.sonnet"
            :placeholder="t('common.default')"
            class="model-input"
          />
          <n-button size="small" @click="useDefault('sonnet')">{{ t('common.default') }}</n-button>
        </div>

        <div class="model-row">
          <span class="icon">💨</span>
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
    <n-card :title="t('globalSettings.timeout')" class="section-card">
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { isDark, setTheme } = useTheme()
const { t, locale, setLocale, availableLocales, initLocale } = useLocale()

// Default values
const DEFAULTS = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001',
  testTimeout: 30,
  requestTimeout: 120
}

const formData = ref({
  theme: 'light',
  locale: 'zh-CN',
  opus: '',
  sonnet: '',
  haiku: '',
  testTimeout: 30,
  requestTimeout: 120
})

// Theme options
const themeOptions = computed(() => [
  { label: t('globalSettings.themeLight'), value: 'light' },
  { label: t('globalSettings.themeDark'), value: 'dark' }
])

// Locale options
const localeOptions = computed(() =>
  availableLocales.value.map(l => ({
    label: l.label,
    value: l.value
  }))
)

onMounted(async () => {
  await initLocale()
  await loadSettings()
})

// Watch for theme changes
watch(() => formData.value.theme, async (newTheme) => {
  await setTheme(newTheme === 'dark')
})

// Watch for locale changes
watch(() => formData.value.locale, async (newLocale) => {
  await setLocale(newLocale)
})

const loadSettings = async () => {
  try {
    // Get current theme and locale
    formData.value.theme = isDark.value ? 'dark' : 'light'
    formData.value.locale = locale.value

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

    message.success(t('messages.saveSuccess'))
  } catch (err) {
    console.error('Failed to reset settings:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const useDefault = (field) => {
  formData.value[field] = DEFAULTS[field]
}
</script>

<style scoped>
.global-settings {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color, #f0f0f0);
  background: var(--bg-color-secondary, white);
  margin: -24px -24px 24px -24px;
  padding: 24px;
  border-radius: 12px 12px 0 0;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
}

.section-card {
  margin-bottom: 20px;
}

.section-desc {
  font-size: 13px;
  color: #888;
  margin-bottom: 16px;
  line-height: 1.5;
}

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

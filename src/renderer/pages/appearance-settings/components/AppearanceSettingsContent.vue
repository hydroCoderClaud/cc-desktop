<template>
  <div class="settings-page narrow" :style="cssVars">
    <!-- Header -->
    <div class="settings-header">
      <h1>{{ t('globalSettings.appearance') }}</h1>
      <n-space>
        <n-button @click="handleReset">{{ t('common.reset') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
      </n-space>
    </div>

    <!-- Theme & Language Section -->
    <n-card :title="t('globalSettings.themeAndLanguage')" class="settings-section">
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('globalSettings.theme')">
            <n-select
              v-model:value="formData.theme"
              :options="themeOptions"
              style="width: 100%"
            />
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.language')">
            <n-select
              v-model:value="formData.locale"
              :options="localeOptions"
              style="width: 100%"
            />
          </n-form-item>
        </n-grid-item>
      </n-grid>
    </n-card>

    <!-- Terminal Font Section -->
    <n-card :title="t('globalSettings.terminalSettings')" class="settings-section">
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('globalSettings.terminalFontSize')">
            <n-input-number
              v-model:value="formData.terminalFontSize"
              :min="10"
              :max="24"
              placeholder="14"
            />
            <template #feedback>{{ t('globalSettings.terminalFontSizeHint') }}</template>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('globalSettings.terminalFontFamily')">
            <n-select
              v-model:value="formData.terminalFontFamily"
              :options="fontFamilyOptions"
              style="width: 100%"
            />
            <template #feedback>{{ t('globalSettings.terminalFontFamilyHint') }}</template>
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
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { isDark, setTheme, cssVars, initTheme } = useTheme()
const { t, locale, setLocale, availableLocales, initLocale } = useLocale()

// 字体回退链
const FONT_FALLBACK = '"SF Mono", Monaco, "HarmonyOS Sans SC", DengXian, "Microsoft YaHei", "PingFang SC", monospace'

// Default values
const DEFAULTS = {
  terminalFontSize: 14,
  terminalFontFamily: `"Ubuntu Mono", ${FONT_FALLBACK}`
}

const formData = ref({
  theme: 'light',
  locale: 'zh-CN',
  terminalFontSize: DEFAULTS.terminalFontSize,
  terminalFontFamily: DEFAULTS.terminalFontFamily
})

// Terminal font family options
const fontFamilyOptions = [
  { label: 'Ubuntu Mono', value: `"Ubuntu Mono", ${FONT_FALLBACK}` },
  { label: 'Cascadia Code (连字)', value: `"Cascadia Code", ${FONT_FALLBACK}` },
  { label: 'Consolas', value: `Consolas, ${FONT_FALLBACK}` }
]

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
  await initTheme()
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
    formData.value.theme = isDark.value ? 'dark' : 'light'
    formData.value.locale = locale.value

    const terminalSettings = await invoke('getTerminalSettings')
    formData.value.terminalFontSize = terminalSettings?.fontSize || DEFAULTS.terminalFontSize
    formData.value.terminalFontFamily = terminalSettings?.fontFamily || DEFAULTS.terminalFontFamily
  } catch (err) {
    console.error('Failed to load settings:', err)
    message.error(t('messages.loadFailed') + ': ' + err.message)
  }
}

const handleSave = async () => {
  try {
    await invoke('updateTerminalSettings', {
      fontSize: formData.value.terminalFontSize,
      fontFamily: formData.value.terminalFontFamily
    })

    // Broadcast settings change to other windows
    if (window.electronAPI?.broadcastSettings) {
      window.electronAPI.broadcastSettings({
        terminalFontSize: formData.value.terminalFontSize,
        terminalFontFamily: formData.value.terminalFontFamily
      })
    }

    message.success(t('globalSettings.saveSuccess'))
  } catch (err) {
    console.error('Failed to save settings:', err)
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleReset = async () => {
  try {
    formData.value.terminalFontSize = DEFAULTS.terminalFontSize
    formData.value.terminalFontFamily = DEFAULTS.terminalFontFamily

    await invoke('updateTerminalSettings', {
      fontSize: DEFAULTS.terminalFontSize,
      fontFamily: DEFAULTS.terminalFontFamily
    })

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
/* 无额外样式 */
</style>

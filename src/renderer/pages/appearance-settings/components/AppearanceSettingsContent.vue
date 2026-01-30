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

      <!-- Color Scheme Selector -->
      <n-form-item :label="t('globalSettings.colorScheme')">
        <div class="color-scheme-selector">
          <div
            v-for="scheme in colorSchemeList"
            :key="scheme.key"
            class="color-scheme-item"
            :class="{ active: formData.colorScheme === scheme.key }"
            @click="formData.colorScheme = scheme.key"
          >
            <div
              class="color-preview"
              :style="{ background: isDark ? scheme.primaryDark : scheme.primaryLight }"
            ></div>
            <span class="color-name">{{ scheme.icon }} {{ scheme.name }}</span>
          </div>
        </div>
      </n-form-item>
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

      <n-form-item :label="t('globalSettings.terminalBackground')">
        <n-radio-group v-model:value="formData.terminalDarkBackground">
          <n-radio :value="true">{{ t('globalSettings.terminalBackgroundDark') }}</n-radio>
          <n-radio :value="false">{{ t('globalSettings.terminalBackgroundLight') }}</n-radio>
        </n-radio-group>
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
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage, NRadioGroup, NRadio } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { isDark, setTheme, cssVars, initTheme, colorScheme, setColorScheme, colorSchemeList } = useTheme()
const { t, locale, setLocale, availableLocales, initLocale } = useLocale()

// 字体回退链
const FONT_FALLBACK = '"SF Mono", Monaco, "HarmonyOS Sans SC", DengXian, "Microsoft YaHei", "PingFang SC", monospace'

// Default values
const DEFAULTS = {
  terminalFontSize: 14,
  terminalFontFamily: `"Ubuntu Mono", ${FONT_FALLBACK}`,
  terminalDarkBackground: true
}

const formData = ref({
  theme: 'light',
  locale: 'zh-CN',
  colorScheme: 'ember',
  terminalFontSize: DEFAULTS.terminalFontSize,
  terminalFontFamily: DEFAULTS.terminalFontFamily,
  terminalDarkBackground: DEFAULTS.terminalDarkBackground
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

// Watch for color scheme changes
watch(() => formData.value.colorScheme, async (newScheme) => {
  await setColorScheme(newScheme)
})

// Watch for terminal background changes (即时生效)
watch(() => formData.value.terminalDarkBackground, (newValue) => {
  if (window.electronAPI?.broadcastSettings) {
    window.electronAPI.broadcastSettings({
      terminalDarkBackground: newValue
    })
  }
})

// Watch for terminal font size changes (即时生效)
watch(() => formData.value.terminalFontSize, (newValue) => {
  if (window.electronAPI?.broadcastSettings) {
    window.electronAPI.broadcastSettings({
      terminalFontSize: newValue
    })
  }
})

const loadSettings = async () => {
  try {
    formData.value.theme = isDark.value ? 'dark' : 'light'
    formData.value.locale = locale.value
    formData.value.colorScheme = colorScheme.value

    const terminalSettings = await invoke('getTerminalSettings')
    formData.value.terminalFontSize = terminalSettings?.fontSize || DEFAULTS.terminalFontSize
    formData.value.terminalFontFamily = terminalSettings?.fontFamily || DEFAULTS.terminalFontFamily
    formData.value.terminalDarkBackground = terminalSettings?.darkBackground !== false
  } catch (err) {
    console.error('Failed to load settings:', err)
    message.error(t('messages.loadFailed') + ': ' + err.message)
  }
}

const handleSave = async () => {
  try {
    await invoke('updateTerminalSettings', {
      fontSize: formData.value.terminalFontSize,
      fontFamily: formData.value.terminalFontFamily,
      darkBackground: formData.value.terminalDarkBackground
    })

    // Broadcast settings change to other windows
    if (window.electronAPI?.broadcastSettings) {
      window.electronAPI.broadcastSettings({
        terminalFontSize: formData.value.terminalFontSize,
        terminalFontFamily: formData.value.terminalFontFamily,
        terminalDarkBackground: formData.value.terminalDarkBackground
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
    formData.value.terminalDarkBackground = DEFAULTS.terminalDarkBackground

    await invoke('updateTerminalSettings', {
      fontSize: DEFAULTS.terminalFontSize,
      fontFamily: DEFAULTS.terminalFontFamily,
      darkBackground: DEFAULTS.terminalDarkBackground
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
/* 配色方案选择器 */
.color-scheme-selector {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.color-scheme-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-color-secondary);
}

.color-scheme-item:hover {
  border-color: var(--border-color-light);
  background: var(--hover-bg);
}

.color-scheme-item.active {
  border-color: var(--primary-color);
  background: var(--primary-ghost);
}

.color-preview {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.color-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}
</style>

<template>
  <div class="settings-page narrow" :class="{ 'workspace-embedded': props.embedded }" :style="cssVars">
    <!-- Header -->
    <div class="settings-header appearance-settings-header">
      <h1>{{ t('globalSettings.appearance') }}</h1>
      <n-space class="appearance-settings-header-actions" :wrap="true">
        <n-button @click="handleClose">{{ t('common.close') }}</n-button>
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
            <span class="color-name">
              <span class="color-icon">{{ scheme.icon }}</span>
              <span class="color-label">{{ scheme.name }}</span>
            </span>
          </div>
        </div>
      </n-form-item>
    </n-card>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['close'])
const message = useMessage()
const { isDark, setTheme, cssVars, initTheme, colorScheme, setColorScheme, colorSchemeList } = useTheme()
const { t, locale, setLocale, availableLocales, initLocale } = useLocale()

const formData = ref({
  theme: 'light',
  locale: 'zh-CN',
  colorScheme: 'ember'
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

const loadSettings = async () => {
  try {
    formData.value.theme = isDark.value ? 'dark' : 'light'
    formData.value.locale = locale.value
    formData.value.colorScheme = colorScheme.value
  } catch (err) {
    console.error('Failed to load settings:', err)
    message.error(t('messages.loadFailed') + ': ' + err.message)
  }
}

const handleSave = () => {
  message.success(t('globalSettings.saveSuccess'))
}

const handleClose = () => {
  if (props.embedded) {
    emit('close')
    return
  }
  window.close()
}
</script>

<style scoped>
.appearance-settings-header {
  gap: 16px;
  margin: 0 0 24px;
  padding: 24px;
  border-radius: 12px 12px 0 0;
}

.appearance-settings-header-actions {
  justify-content: flex-end;
}

/* 配色方案选择器 */
.color-scheme-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.color-scheme-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  min-height: 44px;
  width: 100%;
  box-sizing: border-box;
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
  display: inline-grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  line-height: 1;
}

.color-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  font-size: 15px;
  line-height: 1;
}

.color-label {
  display: inline-block;
}

@media (max-width: 640px) {
  .appearance-settings-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .appearance-settings-header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

</style>

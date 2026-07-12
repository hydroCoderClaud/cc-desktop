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
      <div class="settings-subsection">
        <n-grid :cols="2" :x-gap="24">
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
      </div>

      <div class="settings-subsection settings-subsection-last">
        <div class="settings-subsection-title">{{ t('globalSettings.agentOutputGroup') }}</div>
        <n-form-item :label="t('globalSettings.outputBaseDir')">
          <div style="display: flex; gap: 8px; width: 100%">
            <n-input
              v-model:value="formData.outputBaseDir"
              :placeholder="defaultOutputBaseDir"
              clearable
              style="flex: 1"
            />
            <n-button @click="handleSelectOutputDir">{{ t('common.browse') }}</n-button>
          </div>
          <template #feedback>{{ t('globalSettings.outputBaseDirHint') }}</template>
        </n-form-item>

        <n-form-item :label="t('globalSettings.claudeConfigDir')">
          <div style="display: flex; gap: 8px; width: 100%">
            <n-input
              v-model:value="formData.claudeConfigDir"
              :placeholder="t('globalSettings.claudeConfigDirPlaceholder')"
              clearable
              style="flex: 1"
            />
            <n-button @click="handleSelectClaudeConfigDir">{{ t('common.browse') }}</n-button>
          </div>
          <template #feedback>{{ t('globalSettings.claudeConfigDirHint') }}</template>
        </n-form-item>
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
import { ref, computed, onMounted } from 'vue'
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
  autocompactPctOverride: null,  // null 表示使用 Claude Code 默认值
  messageQueue: true,
  outputBaseDir: '',             // 空字符串 = 使用默认 ~/cc-desktop-agent-output
  claudeConfigDir: ''
}

const formData = ref({
  testTimeout: DEFAULTS.testTimeout,
  requestTimeout: DEFAULTS.requestTimeout,
  autocompactPctOverride: DEFAULTS.autocompactPctOverride,
  messageQueue: DEFAULTS.messageQueue,
  outputBaseDir: DEFAULTS.outputBaseDir,
  claudeConfigDir: DEFAULTS.claudeConfigDir
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

    // Get autocompact pct override
    const autocompactPct = await invoke('getAutocompactPctOverride')
    formData.value.autocompactPctOverride = autocompactPct

    // Get message queue setting
    const config = await invoke('getConfig')
    if (config?.settings?.agent?.messageQueue !== undefined) {
      formData.value.messageQueue = config.settings.agent.messageQueue
    }
    formData.value.outputBaseDir = config?.settings?.agent?.outputBaseDir || defaultOutputBaseDir.value
    formData.value.claudeConfigDir = config?.settings?.agent?.claudeConfigDir || DEFAULTS.claudeConfigDir
  } catch (err) {
    console.error('Failed to load settings:', err)
    message.error(t('messages.loadFailed') + ': ' + err.message)
  }
}

// 默认输出目录（从系统 home 推算，仅用于 placeholder）
const defaultOutputBaseDir = computed(() => {
  const home = window.electronAPI?.getHomedir?.() || '~'
  return `${home}/cc-desktop-agent-output`
})

// 选择输出目录
const handleSelectOutputDir = async () => {
  const dir = await window.electronAPI?.selectDirectory({ title: t('globalSettings.outputBaseDir') })
  if (dir) formData.value.outputBaseDir = dir
}

const handleSelectClaudeConfigDir = async () => {
  const dir = await window.electronAPI?.selectDirectory({ title: t('globalSettings.claudeConfigDir') })
  if (dir) formData.value.claudeConfigDir = dir
}

const persistMessageQueueSetting = async (enabled) => {
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

// 队列开关实时生效（不依赖保存按钮）
const handleQueueToggle = async (enabled) => {
  await persistMessageQueueSetting(enabled)
}

const handleSave = async () => {
  try {
    // Save timeout (convert to ms)
    const timeout = {
      test: formData.value.testTimeout * 1000,
      request: formData.value.requestTimeout * 1000
    }
    await invoke('updateTimeout', timeout)

    // Save autocompact pct override
    await invoke('updateAutocompactPctOverride', formData.value.autocompactPctOverride)

    const settingsPayload = { appMode: 'agent' }
    await window.electronAPI.updateSettings(settingsPayload)
    window.electronAPI.broadcastSettings(settingsPayload)

    // 注意：消息队列设置已在 handleQueueToggle 中实时保存，这里不再重复保存

    // 保存 Agent 路径配置
    const config = await invoke('getConfig')
    if (config?.settings?.agent !== undefined) {
      // 若填的就是默认路径，存空字符串（等价于使用默认值）
      const outputDir = formData.value.outputBaseDir === defaultOutputBaseDir.value
        ? '' : (formData.value.outputBaseDir || '')
      config.settings.agent.outputBaseDir = outputDir
      config.settings.agent.claudeConfigDir = formData.value.claudeConfigDir || DEFAULTS.claudeConfigDir
      await invoke('saveConfig', JSON.parse(JSON.stringify(config)))
    }

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
    formData.value.autocompactPctOverride = DEFAULTS.autocompactPctOverride
    formData.value.messageQueue = DEFAULTS.messageQueue
    formData.value.outputBaseDir = defaultOutputBaseDir.value
    formData.value.claudeConfigDir = DEFAULTS.claudeConfigDir

    // Save to backend
    await invoke('updateTimeout', {
      test: DEFAULTS.testTimeout * 1000,
      request: DEFAULTS.requestTimeout * 1000
    })
    await invoke('updateAutocompactPctOverride', DEFAULTS.autocompactPctOverride)
    await window.electronAPI.updateSettings({ appMode: 'agent' })
    window.electronAPI.broadcastSettings({ appMode: 'agent' })

    // 重置 Agent 路径配置
    const config = await invoke('getConfig')
    if (config?.settings?.agent !== undefined) {
      config.settings.agent.outputBaseDir = ''
      config.settings.agent.claudeConfigDir = DEFAULTS.claudeConfigDir
      await invoke('saveConfig', JSON.parse(JSON.stringify(config)))
    }

    await persistMessageQueueSetting(DEFAULTS.messageQueue)

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
.settings-subsection {
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color, #e8e8e3);
}

.settings-subsection-last {
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: none;
}

.settings-subsection-title {
  margin-bottom: 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color-1, #222);
}

</style>

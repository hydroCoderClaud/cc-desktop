<template>
  <div class="common-settings">
    <div class="embedded-header">
      <div>
        <div class="embedded-title">{{ t('channelSettings.channels.common.label') }}</div>
        <div class="embedded-subtitle">{{ t('channelSettings.channels.common.description') }}</div>
      </div>
    </div>

    <n-alert type="info" :show-icon="true" style="margin-bottom: 16px;">
      {{ t('channelSettings.commonSettings.boundary') }}
    </n-alert>

    <n-card :title="t('channelSettings.commonSettings.imTextTitle')" class="settings-section">
      <n-form-item :label="t('channelSettings.commonSettings.desktopInterventionLabel')">
        <n-input
          v-model:value="formData.desktopInterventionLabel"
          :maxlength="30"
          :placeholder="defaultLabel"
          clearable
        />
        <template #feedback>{{ t('channelSettings.commonSettings.desktopInterventionLabelHint') }}</template>
      </n-form-item>

      <div class="preview-block">
        <div class="preview-title">{{ t('channelSettings.commonSettings.previewTitle') }}</div>
        <pre class="preview-text">{{ previewText }}</pre>
      </div>
    </n-card>

    <div class="settings-footer">
      <n-space>
        <n-button @click="handleReset">{{ t('common.reset') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useLocale } from '@composables/useLocale'

const DEFAULT_LABEL = '桌面端介入'

const message = useMessage()
const { invoke } = useIPC()
const { t } = useLocale()

const saving = ref(false)
const formData = ref({
  desktopInterventionLabel: DEFAULT_LABEL,
})

const defaultLabel = computed(() => DEFAULT_LABEL)

const normalizedLabel = computed(() => {
  const value = typeof formData.value.desktopInterventionLabel === 'string'
    ? formData.value.desktopInterventionLabel.trim().replace(/[\s:：>＞]+$/g, '')
    : ''
  return value || DEFAULT_LABEL
})

const previewText = computed(() => [
  `${normalizedLabel.value}：`,
  '> 请帮我确认今天的任务结果',
  '',
  '任务已经完成，结果如下……'
].join('\n'))

const loadConfig = async () => {
  const config = await invoke('getConfig')
  formData.value.desktopInterventionLabel = config?.imCommon?.desktopInterventionLabel || DEFAULT_LABEL
}

const handleSave = async () => {
  try {
    saving.value = true
    const config = await invoke('getConfig')
    config.imCommon = {
      ...(config.imCommon || {}),
      desktopInterventionLabel: normalizedLabel.value,
    }
    await invoke('saveConfig', JSON.parse(JSON.stringify(config)))
    formData.value.desktopInterventionLabel = normalizedLabel.value
    message.success(t('channelSettings.commonSettings.saveSuccess'))
  } catch (err) {
    console.error('[ChannelCommonSettings] Save error:', err)
    message.error(`${t('messages.saveFailed')}: ${err.message}`)
  } finally {
    saving.value = false
  }
}

const handleReset = () => {
  formData.value.desktopInterventionLabel = DEFAULT_LABEL
}

onMounted(async () => {
  await loadConfig()
})
</script>

<style scoped>
.embedded-header {
  margin-bottom: 16px;
}

.embedded-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color);
}

.embedded-subtitle {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color-2);
}

.settings-section {
  margin-bottom: 20px;
}

.preview-block {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--hover-color);
}

.preview-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-2);
}

.preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.6;
  font-family: var(--font-family-mono, "Ubuntu Mono", monospace);
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
}
</style>

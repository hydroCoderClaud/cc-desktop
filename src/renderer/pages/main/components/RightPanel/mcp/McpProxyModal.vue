<template>
  <n-modal v-model:show="visible" preset="card" :title="t('mcp.proxy.title')" style="width: 560px; max-width: 90vw;">
    <div class="proxy-config-content">
      <n-form label-placement="left" label-width="auto">
        <n-form-item :label="t('mcp.proxy.enable')">
          <n-switch v-model:value="proxyEnabled" :loading="saving" @update:value="handleToggle" />
        </n-form-item>

        <n-form-item :label="t('mcp.proxy.url')">
          <n-input
            v-model:value="proxyUrl"
            :placeholder="t('mcp.proxy.urlPlaceholder')"
            :disabled="!proxyEnabled"
            clearable
            @blur="handleUrlBlur"
          />
        </n-form-item>
      </n-form>

      <!-- 说明区域 -->
      <div class="proxy-info-section">
        <p class="proxy-hint">{{ t('mcp.proxy.hint') }}</p>
        <ul class="proxy-details">
          <li>{{ t('mcp.proxy.detailConfig') }}</li>
          <li>{{ t('mcp.proxy.detailRuntime') }}</li>
          <li>{{ t('mcp.proxy.detailApplyAll') }}</li>
        </ul>
      </div>

      <!-- 快捷链接 -->
      <div class="proxy-links">
        <n-button text size="small" @click="openConfigFile">
          <template #icon><Icon name="file" :size="14" /></template>
          {{ t('mcp.proxy.openConfig') }}
        </n-button>
        <n-button text size="small" :disabled="!proxySupportReady" @click="openProxySupportDir">
          <template #icon><Icon name="folder" :size="14" /></template>
          {{ t('mcp.proxy.openProxySupport') }}
        </n-button>
      </div>
    </div>

    <template #footer>
      <n-button
        :disabled="!proxyEnabled || !proxyUrl"
        :loading="applyingAll"
        @click="handleApplyAll"
      >
        {{ t('mcp.proxy.applyAll') }}
      </n-button>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NSwitch, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const visible = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['saved'])

const proxyEnabled = ref(false)
const proxyUrl = ref('')
const saving = ref(false)
const applyingAll = ref(false)
const proxySupportReady = ref(false)
const proxySupportPath = ref('')
// 记录初始 URL，blur 时比较是否有变化
let loadedUrl = ''

// 打开弹窗时加载配置
watch(visible, async (show) => {
  if (show) {
    try {
      const config = await window.electronAPI.getMcpProxyConfig()
      proxyEnabled.value = config.enabled || false
      proxyUrl.value = config.url || ''
      loadedUrl = proxyUrl.value
      proxySupportReady.value = config.proxySupportReady || false
      proxySupportPath.value = config.proxySupportPath || ''
    } catch (e) {
      console.error('Failed to load proxy config:', e)
    }
  }
})

// 开关切换 → 立即保存
const handleToggle = async (enabled) => {
  await saveConfig(enabled, proxyUrl.value)
}

// URL 输入框失焦 → 如果值有变化则保存
const handleUrlBlur = async () => {
  const url = proxyUrl.value.trim()
  if (url !== loadedUrl) {
    loadedUrl = url
    await saveConfig(proxyEnabled.value, url)
  }
}

const saveConfig = async (enabled, url) => {
  saving.value = true
  try {
    const config = { enabled, url }
    await window.electronAPI.updateMcpProxyConfig(config)

    if (enabled && url) {
      const result = await window.electronAPI.ensureProxySupport(url)
      if (!result.success) {
        message.warning(t('mcp.proxy.setupFailed', { error: result.error }))
      } else {
        proxySupportReady.value = true
      }
    }

    message.success(t('mcp.proxy.saved'))
    emit('saved')
  } catch (e) {
    console.error('Failed to save proxy config:', e)
    message.error(e.message)
  } finally {
    saving.value = false
  }
}

const handleApplyAll = async () => {
  applyingAll.value = true
  try {
    const config = {
      enabled: proxyEnabled.value,
      url: proxyUrl.value
    }

    if (config.enabled && config.url) {
      const setupResult = await window.electronAPI.ensureProxySupport(config.url)
      if (!setupResult.success) {
        message.warning(t('mcp.proxy.setupFailed', { error: setupResult.error }))
        return
      }
      proxySupportReady.value = true
    }

    const result = await window.electronAPI.applyProxyToAllMcps(config)
    if (result.success) {
      message.success(t('mcp.proxy.applyAllSuccess', { count: result.count }))
    } else {
      message.error(result.error)
    }
  } catch (e) {
    console.error('Failed to apply proxy to all:', e)
    message.error(e.message)
  } finally {
    applyingAll.value = false
  }
}

const openConfigFile = async () => {
  try {
    const configPath = await window.electronAPI.getConfigPath()
    await window.electronAPI.openPath(configPath)
  } catch (e) {
    console.error('Failed to open config file:', e)
  }
}

const openProxySupportDir = async () => {
  try {
    if (proxySupportPath.value) {
      await window.electronAPI.openPath(proxySupportPath.value)
    }
  } catch (e) {
    console.error('Failed to open proxy-support dir:', e)
  }
}
</script>

<style scoped>
.proxy-config-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.proxy-info-section {
  margin-top: 4px;
}

.proxy-hint {
  font-size: 12px;
  color: var(--text-color-secondary, #888);
  margin: 0;
  line-height: 1.6;
}

.proxy-details {
  font-size: 12px;
  color: var(--text-color-tertiary, #aaa);
  margin: 6px 0 0 0;
  padding-left: 18px;
  line-height: 1.8;
}

.proxy-links {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}
</style>

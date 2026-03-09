<template>
  <n-modal v-model:show="visible" preset="card" :title="t('market.envConfig.title', { name: mcpName })" style="width: 560px; max-width: 90vw;">
    <div class="env-config-content">
      <p class="env-hint">{{ t('market.envConfig.hint') }}</p>
      <n-form label-placement="left" label-width="auto">
        <div v-for="item in envList" :key="`${item.serverName}:${item.key}`" class="env-row">
          <n-form-item :label="item.key" class="env-form-item" :class="{ 'env-required': item.isPlaceholder }">
            <div class="env-input-wrapper">
              <n-input
                v-model:value="item.value"
                :placeholder="item.placeholder"
                :type="isSecretKey(item.key) ? 'password' : 'text'"
                :show-password-on="isSecretKey(item.key) ? 'click' : undefined"
                clearable
              />
              <n-button
                v-if="isDirKey(item.key)"
                size="small"
                quaternary
                class="folder-btn"
                @click="selectFolder(item)"
              >
                <template #icon>
                  <Icon name="folder" :size="14" />
                </template>
              </n-button>
              <n-tag v-if="item.isPlaceholder" size="small" type="warning" :bordered="false">
                {{ t('market.envConfig.hintRequired') }}
              </n-tag>
            </div>
            <template v-if="item.serverName && envList.filter(e => e.serverName !== envList[0]?.serverName).length > 0" #label>
              <span class="env-label">{{ item.key }} <span class="env-server-tag">({{ item.serverName }})</span></span>
            </template>
          </n-form-item>
        </div>
      </n-form>

      <!-- Proxy Config -->
      <div class="env-proxy-section">
        <n-divider />
        <div class="env-proxy-toggle">
          <n-switch v-model:value="useProxy" size="small" />
          <span class="env-proxy-label">{{ t('mcp.proxy.useProxy', { url: '' }).replace(/[（(].*[）)]/, '').trim() }}</span>
        </div>
        <div v-if="useProxy" class="env-proxy-url">
          <n-input
            v-model:value="proxyUrl"
            :placeholder="t('mcp.proxy.urlPlaceholder')"
            size="small"
            clearable
          />
        </div>
        <div class="env-proxy-toggle" style="margin-top: 8px;">
          <n-switch v-model:value="useNodeOptions" size="small" />
          <span class="env-proxy-label">{{ t('mcp.proxy.useNodeOptions') }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="env-footer-right">
        <n-button @click="handleCancel">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="confirming" @click="handleConfirm">{{ t('market.envConfig.confirm') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NSwitch, NTag, NDivider, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  mcpName: { type: String, default: '' },
  envVars: { type: Array, default: () => [] }
})

const visible = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['confirm', 'cancel'])

const envList = ref([])
const useProxy = ref(false)
const proxyUrl = ref('')
const useNodeOptions = ref(false)
const confirming = ref(false)

watch(() => props.envVars, (vars) => {
  envList.value = vars.map(v => ({ ...v }))
}, { immediate: true })

// 打开弹窗时加载代理配置
watch(visible, async (show) => {
  if (show) {
    confirming.value = false
    useNodeOptions.value = false
    try {
      const config = await window.electronAPI.getMcpProxyConfig()
      proxyUrl.value = config.url || ''
      useProxy.value = !!(config.enabled && config.url)
    } catch (e) {
      proxyUrl.value = ''
      useProxy.value = false
    }
  }
})

const isSecretKey = (key) => /key|secret|token|password|credential/i.test(key)
const isDirKey = (key) => /dir|path|folder|directory|output/i.test(key)

const selectFolder = async (item) => {
  try {
    const result = await window.electronAPI.selectFolder()
    if (result) {
      item.value = result.replace(/\\/g, '/')
    }
  } catch (e) {
    console.error('Failed to select folder:', e)
  }
}

const buildEnvOverrides = () => {
  const overrides = {}
  for (const item of envList.value) {
    if (item.value && item.value !== item.placeholder) {
      if (!overrides[item.serverName]) overrides[item.serverName] = {}
      overrides[item.serverName][item.key] = item.value
    }
  }
  return overrides
}

const handleConfirm = async () => {
  // 如果开启了代理，保存全局代理配置
  if (useProxy.value && proxyUrl.value) {
    try {
      await window.electronAPI.updateMcpProxyConfig({
        enabled: true,
        url: proxyUrl.value
      })
    } catch (e) {
      console.error('Failed to save proxy config:', e)
    }
  }

  // 如果开启了 NODE_OPTIONS，确保 proxy-support 环境就绪
  if (useNodeOptions.value) {
    confirming.value = true
    try {
      const result = await window.electronAPI.ensureProxySupport(proxyUrl.value || '')
      if (!result.success) {
        message.warning(t('mcp.proxy.setupFailed', { error: result.error }))
      }
    } catch (e) {
      console.error('Failed to setup proxy support:', e)
    } finally {
      confirming.value = false
    }
  }

  const overrides = buildEnvOverrides()
  visible.value = false
  emit('confirm', overrides, useProxy.value && !!proxyUrl.value, useNodeOptions.value)
}

const handleCancel = () => {
  visible.value = false
  emit('cancel')
}
</script>

<style scoped>
.env-config-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.env-hint {
  font-size: 13px;
  color: var(--text-color-secondary, #888);
  margin: 0 0 4px 0;
  line-height: 1.5;
}

.env-row {
  margin-bottom: 4px;
}

.env-form-item {
  margin-bottom: 0;
}

.env-form-item.env-required {
  border-left: 2px solid var(--warning-color, #f0a020);
  padding-left: 8px;
}

.env-input-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.env-input-wrapper .n-input {
  flex: 1;
}

.folder-btn {
  flex-shrink: 0;
}

.env-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.env-server-tag {
  font-size: 11px;
  color: var(--text-color-tertiary, #aaa);
}

.env-proxy-section {
  margin-top: 4px;
}

.env-proxy-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.env-proxy-label {
  font-size: 13px;
  color: var(--text-color);
}

.env-proxy-url {
  margin-top: 8px;
}

.env-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.env-footer-right {
  display: flex;
  gap: 8px;
}
</style>

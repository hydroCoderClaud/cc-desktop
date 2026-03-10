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
import { NModal, NForm, NFormItem, NInput, NButton, NTag, useMessage } from 'naive-ui'
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
const confirming = ref(false)

watch(() => props.envVars, (vars) => {
  envList.value = vars.map(v => ({ ...v }))
}, { immediate: true })

watch(visible, (show) => {
  if (show) confirming.value = false
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

const handleConfirm = () => {
  const overrides = buildEnvOverrides()
  visible.value = false
  emit('confirm', overrides)
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

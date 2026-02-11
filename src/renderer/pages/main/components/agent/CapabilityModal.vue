<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('agent.capabilityManagement')"
    style="width: 520px; max-height: 80vh;"
    @update:show="$emit('update:show', $event)"
  >
    <template #header-extra>
      <button
        class="refresh-btn"
        @click="loadCapabilities"
        :disabled="loading"
        :title="t('agent.refreshCapabilities')"
      >
        <Icon name="refresh" :size="16" :class="{ spinning: loading }" />
      </button>
    </template>

    <!-- Loading State -->
    <div v-if="loading && !capabilities.length" class="state-container">
      <n-spin size="medium" />
      <span class="state-text">{{ t('common.loading') }}</span>
    </div>

    <!-- Error State -->
    <div v-else-if="fetchError" class="state-container error">
      <Icon name="warning" :size="24" />
      <span class="state-text">{{ fetchError }}</span>
      <n-button size="small" @click="loadCapabilities">{{ t('common.refresh') }}</n-button>
    </div>

    <!-- Empty State -->
    <div v-else-if="!capabilities.length" class="state-container">
      <Icon name="info" :size="24" />
      <span class="state-text">{{ t('agent.noCapabilities') }}</span>
    </div>

    <!-- Capability List -->
    <div v-else class="capability-list">
      <div
        v-for="cap in capabilities"
        :key="cap.id"
        class="capability-item"
      >
        <div class="capability-header">
          <div class="capability-info">
            <Icon :name="cap.icon || 'lightning'" :size="18" class="capability-icon" />
            <span class="capability-name">{{ cap.name }}</span>
          </div>
          <n-switch
            :value="isEnabled(cap.id)"
            :loading="installingId === cap.id"
            :disabled="installingId !== null"
            @update:value="(val) => handleToggle(cap, val)"
          />
        </div>
        <div class="capability-desc">{{ cap.description }}</div>
        <div class="component-tags">
          <span
            v-for="comp in cap.components"
            :key="`${comp.type}-${comp.id}`"
            class="component-tag"
            :class="componentStatusClass(comp)"
          >
            {{ comp.type }}
            <span class="comp-status">{{ componentStatusIcon(comp) }}</span>
          </span>
          <span v-if="allInstalled(cap)" class="all-ready">
            {{ t('agent.allComponentsInstalled') }}
          </span>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { NModal, NSpin, NSwitch, NButton, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: { type: Boolean, default: false }
})

defineEmits(['update:show'])

const loading = ref(false)
const fetchError = ref('')
const capabilities = ref([])
const capabilityState = ref({})
const installingId = ref(null)

const isEnabled = (id) => {
  return capabilityState.value[id]?.enabled === true
}

const allInstalled = (cap) => {
  return cap.components && cap.components.length > 0 && cap.components.every(c => c.installed)
}

const componentStatusClass = (comp) => {
  if (installingId.value && !comp.installed) return 'installing'
  return comp.installed ? 'installed' : 'not-installed'
}

const componentStatusIcon = (comp) => {
  if (comp.installed) return '\u2713'
  return '\u2717'
}

const loadCapabilities = async () => {
  loading.value = true
  fetchError.value = ''

  try {
    const [fetchResult, stateResult] = await Promise.all([
      window.electronAPI.fetchCapabilities(),
      window.electronAPI.getCapabilityState()
    ])

    if (fetchResult.success) {
      capabilities.value = fetchResult.capabilities
    } else {
      fetchError.value = fetchResult.error || t('agent.capabilityFetchFailed')
    }

    capabilityState.value = stateResult || {}
  } catch (err) {
    console.error('[CapabilityModal] loadCapabilities error:', err)
    fetchError.value = t('agent.capabilityFetchFailed')
  } finally {
    loading.value = false
  }
}

const handleToggle = async (cap, enabled) => {
  if (enabled) {
    // 启用：安装缺失组件
    installingId.value = cap.id
    try {
      const plainCap = JSON.parse(JSON.stringify(cap))
      const result = await window.electronAPI.enableCapability(cap.id, plainCap)

      if (result.success) {
        capabilityState.value = {
          ...capabilityState.value,
          [cap.id]: { enabled: true }
        }
        // 更新组件安装状态
        updateComponentStatus(cap.id, result.results)
        message.success(t('agent.capabilityEnabled'))
      } else {
        capabilityState.value = {
          ...capabilityState.value,
          [cap.id]: { enabled: true }
        }
        updateComponentStatus(cap.id, result.results)
        message.warning(t('agent.capabilityInstallFailed'))
      }
    } catch (err) {
      console.error('[CapabilityModal] enable error:', err)
      message.error(err.message || t('agent.capabilityInstallFailed'))
    } finally {
      installingId.value = null
    }
  } else {
    // 禁用（仅标记状态）
    try {
      await window.electronAPI.disableCapability(cap.id)
      capabilityState.value = {
        ...capabilityState.value,
        [cap.id]: { enabled: false }
      }
      message.info(t('agent.capabilityDisabled'))
    } catch (err) {
      console.error('[CapabilityModal] disable error:', err)
    }
  }
}

const updateComponentStatus = (capId, results) => {
  if (!results) return
  const cap = capabilities.value.find(c => c.id === capId)
  if (!cap) return

  for (const r of results) {
    const comp = cap.components.find(c => c.type === r.type && c.id === r.id)
    if (comp) {
      comp.installed = r.status === 'installed' || r.status === 'skipped'
    }
  }
}

// 弹窗打开时加载
watch(() => props.show, (val) => {
  if (val) {
    loadCapabilities()
  }
})

onMounted(() => {
  if (props.show) {
    loadCapabilities()
  }
})
</script>

<style scoped>
.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  color: var(--text-color-muted);
}

.state-container.error {
  color: var(--error-color, #ff4d4f);
}

.state-text {
  font-size: 14px;
}

.refresh-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.capability-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 55vh;
  overflow-y: auto;
}

.capability-item {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.capability-item:hover {
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.capability-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.capability-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.capability-icon {
  color: var(--primary-color);
}

.capability-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.capability-desc {
  font-size: 12px;
  color: var(--text-color-muted);
  margin-top: 6px;
  line-height: 1.4;
}

.component-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.component-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.component-tag.installed {
  background: rgba(82, 196, 26, 0.1);
  color: #52c41a;
}

.component-tag.not-installed {
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}

.component-tag.installing {
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
}

.comp-status {
  font-size: 10px;
}

.all-ready {
  font-size: 11px;
  color: #52c41a;
  font-weight: 500;
}
</style>

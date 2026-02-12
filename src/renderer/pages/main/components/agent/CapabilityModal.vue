<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('agent.capabilityManagement')"
    style="width: 580px; max-height: 80vh;"
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

    <!-- Capability List (grouped by category) -->
    <div v-else class="capability-list">
      <div
        v-for="group in groupedCapabilities"
        :key="group.category"
        class="category-group"
      >
        <div class="category-header">
          <Icon :name="group.icon || 'lightning'" :size="16" class="category-icon" />
          <span class="category-name">{{ t('agent.category.' + group.category) || group.category }}</span>
          <span class="category-count">{{ group.items.length }}</span>
        </div>
        <div class="category-items">
          <div
            v-for="cap in group.items"
            :key="cap.id"
            class="capability-item"
          >
            <div class="capability-header">
              <div class="capability-info">
                <span class="type-badge" :class="'type-' + cap.type">{{ cap.type }}</span>
                <span class="capability-name">{{ cap.name }}</span>
                <span class="capability-id">{{ cap.id }}</span>
              </div>
              <div class="capability-actions">
                <!-- 未安装：下载按钮 -->
                <n-button
                  v-if="!cap.installed"
                  size="tiny"
                  type="primary"
                  :loading="installingId === cap.id"
                  :disabled="busyId !== null && busyId !== cap.id"
                  @click="handleInstall(cap)"
                >
                  {{ t('agent.capDownload') }}
                </n-button>
                <!-- 已安装：更新 + 卸载 + 启闭开关 -->
                <template v-else>
                  <n-button
                    size="tiny"
                    :loading="installingId === cap.id && installingAction === 'update'"
                    :disabled="busyId !== null && busyId !== cap.id"
                    @click="handleUpdate(cap)"
                  >
                    {{ t('agent.capUpdate') }}
                  </n-button>
                  <n-button
                    size="tiny"
                    type="error"
                    ghost
                    :loading="installingId === cap.id && installingAction === 'uninstall'"
                    :disabled="busyId !== null && busyId !== cap.id"
                    @click="handleUninstall(cap)"
                  >
                    {{ t('agent.capUninstall') }}
                  </n-button>
                  <n-switch
                    :value="!cap.disabled"
                    :loading="togglingId === cap.id"
                    :disabled="busyId !== null && busyId !== cap.id"
                    @update:value="(val) => handleToggle(cap, val)"
                  />
                </template>
              </div>
            </div>
            <div class="capability-desc">{{ cap.description }}</div>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
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
const installingId = ref(null)
const installingAction = ref(null) // 'install' | 'update' | 'uninstall'
const togglingId = ref(null)

// 任意操作进行中的 ID（下载或启闭）
const busyId = computed(() => installingId.value || togglingId.value)

// 按 category 分组
const groupedCapabilities = computed(() => {
  const groups = {}
  for (const cap of capabilities.value) {
    const cat = cap.category || 'other'
    if (!groups[cat]) {
      groups[cat] = { category: cat, icon: cap.icon, items: [] }
    }
    groups[cat].items.push(cap)
  }
  return Object.values(groups)
})

const loadCapabilities = async () => {
  loading.value = true
  fetchError.value = ''

  try {
    const result = await window.electronAPI.fetchCapabilities()

    if (result.success) {
      capabilities.value = result.capabilities
    } else {
      fetchError.value = result.error || t('agent.capabilityFetchFailed')
    }
  } catch (err) {
    console.error('[CapabilityModal] loadCapabilities error:', err)
    fetchError.value = t('agent.capabilityFetchFailed')
  } finally {
    loading.value = false
  }
}

// 下载安装（首次）
const handleInstall = async (cap) => {
  installingId.value = cap.id
  installingAction.value = 'install'
  try {
    const plainCap = JSON.parse(JSON.stringify(cap))
    const result = await window.electronAPI.installCapability(cap.id, plainCap)

    if (result.success) {
      cap.installed = true
      cap.disabled = false
      message.success(t('agent.capInstallSuccess'))
    } else {
      message.error(result.error || t('agent.capabilityInstallFailed'))
    }
  } catch (err) {
    console.error('[CapabilityModal] install error:', err)
    message.error(err.message || t('agent.capabilityInstallFailed'))
  } finally {
    installingId.value = null
    installingAction.value = null
  }
}

// 更新（重新下载覆盖）
const handleUpdate = async (cap) => {
  installingId.value = cap.id
  installingAction.value = 'update'
  try {
    const plainCap = JSON.parse(JSON.stringify(cap))
    const result = await window.electronAPI.installCapability(cap.id, plainCap)

    if (result.success) {
      cap.disabled = false
      message.success(t('agent.capUpdateSuccess'))
    } else {
      message.error(result.error || t('agent.capabilityInstallFailed'))
    }
  } catch (err) {
    console.error('[CapabilityModal] update error:', err)
    message.error(err.message || t('agent.capabilityInstallFailed'))
  } finally {
    installingId.value = null
    installingAction.value = null
  }
}

// 卸载
const handleUninstall = async (cap) => {
  installingId.value = cap.id
  installingAction.value = 'uninstall'
  try {
    const plainCap = JSON.parse(JSON.stringify(cap))
    const result = await window.electronAPI.uninstallCapability(cap.id, plainCap)

    if (result.success) {
      cap.installed = false
      cap.disabled = false
      message.success(t('agent.capUninstallSuccess'))
    } else {
      message.error(result.error || t('agent.capUninstallFailed'))
    }
  } catch (err) {
    console.error('[CapabilityModal] uninstall error:', err)
    message.error(err.message || t('agent.capUninstallFailed'))
  } finally {
    installingId.value = null
    installingAction.value = null
  }
}

// 启闭切换（仅对已安装组件有效）
const handleToggle = async (cap, enabled) => {
  togglingId.value = cap.id
  try {
    const plainCap = JSON.parse(JSON.stringify(cap))

    if (enabled) {
      const result = await window.electronAPI.enableCapability(cap.id, plainCap)
      if (result.success) {
        cap.disabled = false
        message.success(t('agent.capabilityEnabled'))
      } else {
        message.error(result.error || t('agent.capabilityInstallFailed'))
      }
    } else {
      const result = await window.electronAPI.disableCapability(cap.id, plainCap)
      if (result.success) {
        cap.disabled = true
        message.info(t('agent.capabilityDisabled'))
      } else {
        message.error(result.error || t('agent.capabilityInstallFailed'))
      }
    }
  } catch (err) {
    console.error('[CapabilityModal] toggle error:', err)
    message.error(err.message || t('agent.capabilityInstallFailed'))
  } finally {
    togglingId.value = null
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
  gap: 16px;
  max-height: 55vh;
  overflow-y: auto;
}

.category-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
}

.category-icon {
  color: var(--primary-color);
}

.category-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.category-count {
  font-size: 11px;
  color: var(--text-color-muted);
  background: var(--hover-bg);
  padding: 0 6px;
  border-radius: 8px;
  line-height: 18px;
}

.category-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.capability-item {
  padding: 10px 12px;
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
  min-width: 0;
  flex: 1;
}

.capability-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.type-badge.type-skill {
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
}

.type-badge.type-agent {
  background: rgba(114, 46, 209, 0.1);
  color: #722ed1;
}

.type-badge.type-plugin {
  background: rgba(82, 196, 26, 0.1);
  color: #52c41a;
}

.capability-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-id {
  font-size: 11px;
  color: var(--text-color-muted);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-desc {
  font-size: 12px;
  color: var(--text-color-muted);
  margin-top: 4px;
  line-height: 1.4;
  padding-left: 2px;
}
</style>

<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.plugins.marketTitle')" style="width: 640px; max-width: 90vw;">
    <div class="plugin-market-content">
      <!-- Error -->
      <div v-if="fetchError" class="fetch-error">
        <Icon name="warning" :size="14" />
        <span>{{ fetchError }}</span>
      </div>

      <!-- Toolbar -->
      <div class="market-toolbar">
        <n-input
          v-model:value="searchText"
          :placeholder="t('rightPanel.plugins.searchPlaceholder')"
          size="small"
          clearable
        >
          <template #prefix>
            <Icon name="search" :size="14" />
          </template>
        </n-input>
        <n-select
          v-model:value="selectedMarketplace"
          :options="marketplaceOptions"
          size="small"
          style="width: 200px; flex-shrink: 0;"
        />
        <button class="icon-btn" :title="t('rightPanel.plugins.manageMarketplaces')" @click="showMarketplaceManager = !showMarketplaceManager">
          <Icon name="settings" :size="14" />
        </button>
        <button class="icon-btn" :title="t('rightPanel.plugins.refresh')" @click="fetchData">
          <Icon name="refresh" :size="14" :class="{ spinning: loading }" />
        </button>
      </div>

      <!-- Marketplace Manager (collapsible) -->
      <div v-if="showMarketplaceManager" class="marketplace-manager">
        <div class="manager-header">
          <span class="manager-title">{{ t('rightPanel.plugins.manageMarketplaces') }}</span>
          <button
            class="icon-btn"
            :title="t('rightPanel.plugins.updateMarketplaceIndex')"
            :disabled="updatingIndex"
            @click="handleUpdateAllIndex"
          >
            <Icon name="refresh" :size="12" :class="{ spinning: updatingIndex }" />
          </button>
        </div>

        <!-- Add marketplace -->
        <div class="add-marketplace">
          <n-input
            v-model:value="newMarketplaceSource"
            :placeholder="t('rightPanel.plugins.addMarketplacePlaceholder')"
            size="small"
            :disabled="addingMarketplace"
            @keyup.enter="handleAddMarketplace"
          />
          <n-button
            size="small"
            type="primary"
            :loading="addingMarketplace"
            :disabled="!newMarketplaceSource.trim() || addingMarketplace"
            @click="handleAddMarketplace"
          >
            {{ addingMarketplace ? t('rightPanel.plugins.addingMarketplace') : t('rightPanel.plugins.addMarketplace') }}
          </n-button>
        </div>

        <!-- Marketplace list -->
        <div v-if="marketplaces.length > 0" class="marketplace-list">
          <div
            v-for="mp in marketplaces"
            :key="mp.name"
            class="marketplace-row"
          >
            <div class="mp-info">
              <span class="mp-name">{{ mp.name }}</span>
              <span class="mp-source">{{ mp.repo || mp.source }}</span>
            </div>
            <div class="mp-actions">
              <button
                class="icon-btn danger"
                :title="t('rightPanel.plugins.removeMarketplace')"
                :disabled="removingSet.has(mp.name)"
                @click="handleRemoveMarketplace(mp)"
              >
                <Icon v-if="removingSet.has(mp.name)" name="clock" :size="12" class="spinning" />
                <Icon v-else name="delete" :size="12" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="manager-empty">
          {{ t('rightPanel.plugins.noMarketplaces') }}
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="loading-state">
        <Icon name="clock" :size="16" class="spinning" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredPlugins.length === 0 && fetched" class="empty-state">
        <Icon name="plugin" :size="32" style="opacity: 0.4" />
        <span>{{ t('rightPanel.plugins.noPlugins') }}</span>
      </div>

      <!-- Plugin List -->
      <div v-else class="market-list">
        <div
          v-for="plugin in filteredPlugins"
          :key="plugin.pluginId"
          class="market-item"
        >
          <div class="item-icon"><Icon name="plugin" :size="18" /></div>
          <div class="item-info">
            <div class="item-name">{{ plugin.name }}</div>
            <div class="item-desc">{{ plugin.description || t('rightPanel.plugins.noDescription') }}</div>
            <div class="item-source">{{ plugin.marketplaceName }}</div>
          </div>
          <div class="item-meta">
            <span class="item-version">{{ plugin.version }}</span>
            <span v-if="plugin.installCount" class="item-downloads">{{ formatCount(plugin.installCount) }}</span>
          </div>
          <div class="item-action">
            <!-- Operating spinner -->
            <n-button
              v-if="operatingSet.has(plugin.pluginId)"
              size="tiny"
              disabled
              :loading="true"
            >
              {{ getOperatingText(plugin.pluginId) }}
            </n-button>
            <!-- Has update -->
            <n-button
              v-else-if="plugin._hasUpdate"
              size="tiny"
              type="warning"
              @click="handleUpdate(plugin)"
            >
              {{ t('rightPanel.plugins.update') }}
            </n-button>
            <!-- Installed -->
            <n-button
              v-else-if="plugin._installed"
              size="tiny"
              type="default"
              disabled
            >
              {{ t('rightPanel.plugins.installed') }}
            </n-button>
            <!-- Not installed -->
            <n-button
              v-else
              size="tiny"
              type="primary"
              @click="handleInstall(plugin)"
            >
              {{ t('rightPanel.plugins.install') }}
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NInput, NButton, NSelect, useMessage, useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()
const dialog = useDialog()

const visible = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['installed'])

// State
const loading = ref(false)
const fetched = ref(false)
const fetchError = ref('')
const searchText = ref('')
const selectedMarketplace = ref('__all__')
const allPlugins = ref([])
const operatingSet = ref(new Map()) // pluginId -> 'installing' | 'updating'

// Marketplace manager state
const showMarketplaceManager = ref(false)
const marketplaces = ref([])
const newMarketplaceSource = ref('')
const addingMarketplace = ref(false)
const updatingIndex = ref(false)
const removingSet = ref(new Set())

// Fetch data when modal opens
watch(visible, async (val) => {
  if (val) {
    searchText.value = ''
    selectedMarketplace.value = '__all__'
    fetchError.value = ''
    showMarketplaceManager.value = false
    await Promise.all([fetchData(), fetchMarketplaces()])
  }
})

/**
 * CLI 数据格式:
 * installed: [{ id: "name@marketplace", version, ... }]
 * available: [{ pluginId: "name@marketplace", name, description, marketplaceName, version, installCount }]
 *
 * 从 installed.id 中解析出 name 部分用于匹配
 */

// Marketplace dropdown options
const marketplaceOptions = computed(() => {
  const names = new Set()
  for (const p of allPlugins.value) {
    names.add(p.marketplaceName || 'other')
  }
  const opts = [{ label: t('rightPanel.plugins.allMarketplaces'), value: '__all__' }]
  for (const name of names) {
    opts.push({ label: name, value: name })
  }
  return opts
})

// Filtered list (by search + marketplace)
const filteredPlugins = computed(() => {
  let list = allPlugins.value

  // Filter by marketplace
  if (selectedMarketplace.value !== '__all__') {
    list = list.filter(p => (p.marketplaceName || 'other') === selectedMarketplace.value)
  }

  // Filter by search keyword
  if (searchText.value.trim()) {
    const kw = searchText.value.toLowerCase()
    list = list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      (p.description || '').toLowerCase().includes(kw)
    )
  }

  return list
})

const fetchData = async () => {
  loading.value = true
  fetchError.value = ''
  try {
    const result = await window.electronAPI.pluginCliListAvailable()

    if (result.success === false) {
      fetchError.value = result.error || t('rightPanel.plugins.fetchError')
      allPlugins.value = []
      fetched.value = true
      return
    }

    const installed = result.installed || []
    const available = result.available || []

    // Build installed map: pluginId (name@marketplace) -> installed item
    // Also build name-based map for matching
    const installedByPluginId = new Map()
    for (const p of installed) {
      installedByPluginId.set(p.id, p)
    }

    // Merge: mark available plugins with _installed / _hasUpdate
    const merged = []
    const matchedIds = new Set()

    for (const p of available) {
      const inst = installedByPluginId.get(p.pluginId)
      if (inst) {
        matchedIds.add(p.pluginId)
        merged.push({
          ...p,
          _installed: true,
          _hasUpdate: inst.version !== p.version && !!p.version
        })
      } else {
        merged.push({
          ...p,
          _installed: false,
          _hasUpdate: false
        })
      }
    }

    // Add installed plugins that aren't in available list
    for (const [id, inst] of installedByPluginId) {
      if (!matchedIds.has(id)) {
        // Parse "name@marketplace" from id
        const atIdx = id.indexOf('@')
        const name = atIdx > 0 ? id.substring(0, atIdx) : id
        const marketplace = atIdx > 0 ? id.substring(atIdx + 1) : 'other'
        merged.push({
          pluginId: id,
          name,
          marketplaceName: marketplace,
          version: inst.version,
          description: '',
          _installed: true,
          _hasUpdate: false
        })
      }
    }

    allPlugins.value = merged
    fetched.value = true
  } catch (err) {
    console.error('[PluginMarket] fetch error:', err)
    fetchError.value = t('rightPanel.plugins.fetchError')
    allPlugins.value = []
    fetched.value = true
  } finally {
    loading.value = false
  }
}

const fetchMarketplaces = async () => {
  try {
    const result = await window.electronAPI.pluginCliListMarketplaces()
    if (Array.isArray(result)) {
      marketplaces.value = result
    } else {
      marketplaces.value = []
    }
  } catch (err) {
    console.error('[PluginMarket] fetchMarketplaces error:', err)
    marketplaces.value = []
  }
}

const formatCount = (count) => {
  if (count >= 10000) return `${(count / 1000).toFixed(0)}k`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

const getOperatingText = (pluginId) => {
  const op = operatingSet.value.get(pluginId)
  if (op === 'installing') return t('rightPanel.plugins.installing')
  if (op === 'updating') return t('rightPanel.plugins.updating')
  return '...'
}

const setOperating = (pluginId, op) => {
  const newMap = new Map(operatingSet.value)
  if (op) {
    newMap.set(pluginId, op)
  } else {
    newMap.delete(pluginId)
  }
  operatingSet.value = newMap
}

const handleInstall = async (plugin) => {
  setOperating(plugin.pluginId, 'installing')
  try {
    const result = await window.electronAPI.pluginCliInstall(plugin.pluginId)
    if (result.success) {
      message.success(t('rightPanel.plugins.installSuccess', { name: plugin.name }))
      emit('installed')
      await fetchData()
    } else {
      message.error(result.error || t('rightPanel.plugins.installFailed'))
    }
  } catch (err) {
    console.error('[PluginMarket] install error:', err)
    message.error(t('rightPanel.plugins.installFailed'))
  } finally {
    setOperating(plugin.pluginId, null)
  }
}

const handleUpdate = async (plugin) => {
  setOperating(plugin.pluginId, 'updating')
  try {
    const result = await window.electronAPI.pluginCliUpdate(plugin.pluginId)
    if (result.success) {
      message.success(t('rightPanel.plugins.updateSuccess', { name: plugin.name }))
      emit('installed')
      await fetchData()
    } else {
      message.error(result.error || t('rightPanel.plugins.updateFailed'))
    }
  } catch (err) {
    console.error('[PluginMarket] update error:', err)
    message.error(t('rightPanel.plugins.updateFailed'))
  } finally {
    setOperating(plugin.pluginId, null)
  }
}

// ========================================
// Marketplace management
// ========================================

const handleAddMarketplace = async () => {
  const source = newMarketplaceSource.value.trim()
  if (!source) return

  addingMarketplace.value = true
  try {
    const result = await window.electronAPI.pluginCliAddMarketplace(source)
    if (result.success) {
      message.success(t('rightPanel.plugins.addMarketplaceSuccess', { name: source }))
      newMarketplaceSource.value = ''
      await fetchMarketplaces()
      await fetchData()
    } else {
      message.error(result.error || t('rightPanel.plugins.addMarketplaceFailed'))
    }
  } catch (err) {
    console.error('[PluginMarket] addMarketplace error:', err)
    message.error(t('rightPanel.plugins.addMarketplaceFailed'))
  } finally {
    addingMarketplace.value = false
  }
}

const handleRemoveMarketplace = (mp) => {
  dialog.warning({
    title: t('rightPanel.plugins.removeMarketplace'),
    content: t('rightPanel.plugins.removeMarketplaceConfirm', { name: mp.name }),
    positiveText: t('rightPanel.plugins.removeMarketplace'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      const newSet = new Set(removingSet.value)
      newSet.add(mp.name)
      removingSet.value = newSet

      try {
        const result = await window.electronAPI.pluginCliRemoveMarketplace(mp.name)
        if (result.success) {
          message.success(t('rightPanel.plugins.removeMarketplaceSuccess'))
          await fetchMarketplaces()
          await fetchData()
        } else {
          message.error(result.error || t('rightPanel.plugins.removeMarketplaceFailed'))
        }
      } catch (err) {
        console.error('[PluginMarket] removeMarketplace error:', err)
        message.error(t('rightPanel.plugins.removeMarketplaceFailed'))
      } finally {
        const updated = new Set(removingSet.value)
        updated.delete(mp.name)
        removingSet.value = updated
      }
    }
  })
}

const handleUpdateAllIndex = async () => {
  updatingIndex.value = true
  try {
    const result = await window.electronAPI.pluginCliUpdateMarketplace()
    if (result.success) {
      message.success(t('rightPanel.plugins.updateMarketplaceSuccess'))
      await fetchMarketplaces()
      await fetchData()
    } else {
      message.error(result.error || t('rightPanel.plugins.updateMarketplaceFailed'))
    }
  } catch (err) {
    console.error('[PluginMarket] updateMarketplace error:', err)
    message.error(t('rightPanel.plugins.updateMarketplaceFailed'))
  } finally {
    updatingIndex.value = false
  }
}
</script>

<style scoped>
.plugin-market-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 70vh;
}

.fetch-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--error-bg, rgba(255, 0, 0, 0.08));
  border-radius: 6px;
  color: var(--error-color, #e53935);
  font-size: 12px;
}

.market-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.market-toolbar .n-input {
  flex: 1;
}

/* Marketplace manager */
.marketplace-manager {
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.manager-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
}

.marketplace-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.marketplace-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.marketplace-row:hover {
  background: var(--hover-bg);
}

.mp-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.mp-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
}

.mp-source {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-actions {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}

.icon-btn.danger {
  color: var(--error-color, #e53935);
}

.icon-btn.danger:hover {
  background: var(--error-bg, rgba(255, 0, 0, 0.08));
}

.manager-empty {
  font-size: 12px;
  color: var(--text-color-muted);
  text-align: center;
  padding: 8px 0;
}

.add-marketplace {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-marketplace .n-input {
  flex: 1;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-color-muted);
  font-size: 13px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-color-muted);
  font-size: 13px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.market-list {
  overflow-y: auto;
  max-height: calc(70vh - 100px);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.market-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.market-item:hover {
  background: var(--hover-bg);
}

.item-icon {
  flex-shrink: 0;
  color: var(--text-color-muted);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.item-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}

.item-source {
  font-size: 9px;
  color: var(--text-color-muted);
  opacity: 0.5;
  margin-top: 2px;
}

.item-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.item-version {
  font-size: 10px;
  color: var(--text-color-muted);
  opacity: 0.7;
}

.item-downloads {
  font-size: 9px;
  color: var(--text-color-muted);
  opacity: 0.5;
}

.item-action {
  flex-shrink: 0;
}
</style>

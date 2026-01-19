<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.plugins') }}</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.plugins.openFolder')" @click="handleOpenFolder">
          📂
        </button>
        <button class="icon-btn" :title="t('rightPanel.plugins.refresh')" @click="handleRefresh">
          🔄
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.plugins.search')"
        size="small"
        clearable
      >
        <template #prefix>
          <span style="opacity: 0.5;">🔍</span>
        </template>
      </n-input>
    </div>

    <div class="tab-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <span class="loading-icon">⏳</span>
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredPlugins.length === 0" class="empty-state">
        <div class="empty-icon">🔌</div>
        <div class="empty-text">{{ t('rightPanel.plugins.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.plugins.emptyHint') }}</div>
      </div>

      <!-- Plugin List -->
      <div v-else class="plugin-list">
        <div
          v-for="plugin in filteredPlugins"
          :key="plugin.id"
          class="plugin-item"
        >
          <div class="plugin-icon">📦</div>
          <div class="plugin-info">
            <div class="plugin-name">{{ plugin.name }}</div>
            <div class="plugin-desc">{{ plugin.description || t('rightPanel.plugins.noDescription') }}</div>
          </div>
          <n-switch
            v-model:value="plugin.enabled"
            size="small"
            @update:value="(val) => handleToggle(plugin, val)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { NInput, NSwitch } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  currentProject: Object
})

// State
const loading = ref(false)
const searchText = ref('')
const plugins = ref([])

// Computed
const filteredPlugins = computed(() => {
  if (!searchText.value) return plugins.value
  const keyword = searchText.value.toLowerCase()
  return plugins.value.filter(p =>
    p.name.toLowerCase().includes(keyword) ||
    (p.description && p.description.toLowerCase().includes(keyword))
  )
})

// Methods
const handleOpenFolder = async () => {
  // TODO: Open plugins folder
  console.log('Open plugins folder')
}

const handleRefresh = async () => {
  await loadPlugins()
}

const handleToggle = async (plugin, enabled) => {
  // TODO: Toggle plugin enabled state
  console.log('Toggle plugin:', plugin.id, enabled)
}

const loadPlugins = async () => {
  loading.value = true
  try {
    // TODO: Load plugins from ~/.claude/plugins/
    // Mock data for now
    plugins.value = []
  } catch (err) {
    console.error('Failed to load plugins:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadPlugins()
})
</script>

<style scoped>
.tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.tab-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover-bg);
}

.tab-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-color-muted);
  font-size: 14px;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-muted);
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
}

/* Plugin List */
.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.plugin-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.plugin-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.plugin-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

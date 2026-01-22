<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.agents') }}</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.agents.refresh')" @click="handleRefresh">
          🔄
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.agents.search')"
        size="small"
        clearable
      >
        <template #prefix>
          <span>⌕</span>
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
      <div v-else-if="filteredAgents.length === 0" class="empty-state">
        <div class="empty-icon">🤖</div>
        <div class="empty-text">{{ t('rightPanel.agents.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.agents.emptyHint') }}</div>
      </div>

      <!-- Agents List -->
      <div v-else class="agents-list">
        <div
          v-for="agent in filteredAgents"
          :key="agent.name"
          class="agent-item"
          @click="handleInsertAgent(agent)"
        >
          <div class="agent-icon">🤖</div>
          <div class="agent-info">
            <div class="agent-name">{{ agent.name }}</div>
            <div class="agent-desc">{{ agent.description || t('rightPanel.agents.noDescription') }}</div>
          </div>
          <div class="agent-arrow">›</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { NInput } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  currentProject: Object
})

const emit = defineEmits(['insert-to-input'])

// State
const loading = ref(false)
const searchText = ref('')
const agents = ref([])

// Computed
const filteredAgents = computed(() => {
  if (!searchText.value) return agents.value
  const keyword = searchText.value.toLowerCase()
  return agents.value.filter(a =>
    a.name.toLowerCase().includes(keyword) ||
    (a.description && a.description.toLowerCase().includes(keyword))
  )
})

// Methods
const handleRefresh = async () => {
  await loadAgents()
}

const handleInsertAgent = (agent) => {
  emit('insert-to-input', `@${agent.name} `)
}

const loadAgents = async () => {
  loading.value = true
  try {
    // TODO: Load agents from Claude Code CLI
    // Mock data for now
    agents.value = []
  } catch (err) {
    console.error('Failed to load agents:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAgents()
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
  height: 40px;
  padding: 0 12px;
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
  margin-top: 12px;
  padding: 0 12px 12px 12px;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px 12px;
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

/* Agents List */
.agents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.agent-item:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

.agent-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.agent-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-arrow {
  font-size: 16px;
  color: var(--text-color-muted);
  flex-shrink: 0;
}
</style>

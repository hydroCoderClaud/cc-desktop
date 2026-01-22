<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.mcp') }}</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.mcp.refresh')" @click="handleRefresh">
          🔄
        </button>
      </div>
    </div>

    <div class="tab-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <span class="loading-icon">⏳</span>
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="servers.length === 0" class="empty-state">
        <div class="empty-icon">🔗</div>
        <div class="empty-text">{{ t('rightPanel.mcp.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.mcp.emptyHint') }}</div>
      </div>

      <!-- Server List -->
      <div v-else class="server-list">
        <!-- Global Servers -->
        <div class="server-group" v-if="globalServers.length > 0">
          <div class="group-header">
            <span class="group-icon">🌐</span>
            <span class="group-name">{{ t('rightPanel.mcp.global') }}</span>
          </div>
          <div class="group-items">
            <div
              v-for="server in globalServers"
              :key="server.name"
              class="server-item"
            >
              <span class="status-dot" :class="getStatusClass(server.status)"></span>
              <span class="server-name">{{ server.name }}</span>
              <span class="server-status">{{ getStatusText(server.status) }}</span>
            </div>
          </div>
        </div>

        <!-- Project Servers -->
        <div class="server-group" v-if="projectServers.length > 0">
          <div class="group-header">
            <span class="group-icon">📁</span>
            <span class="group-name">{{ t('rightPanel.mcp.project') }}</span>
          </div>
          <div class="group-items">
            <div
              v-for="server in projectServers"
              :key="server.name"
              class="server-item"
            >
              <span class="status-dot" :class="getStatusClass(server.status)"></span>
              <span class="server-name">{{ server.name }}</span>
              <span class="server-status">{{ getStatusText(server.status) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  currentProject: Object
})

// State
const loading = ref(false)
const globalServers = ref([])
const projectServers = ref([])

// Computed
const servers = computed(() => [...globalServers.value, ...projectServers.value])

// Methods
const handleRefresh = async () => {
  await loadServers()
}

const getStatusClass = (status) => {
  switch (status) {
    case 'connected': return 'connected'
    case 'connecting': return 'connecting'
    case 'error': return 'error'
    default: return 'disconnected'
  }
}

const getStatusText = (status) => {
  switch (status) {
    case 'connected': return t('rightPanel.mcp.connected')
    case 'connecting': return t('rightPanel.mcp.connecting')
    case 'error': return t('rightPanel.mcp.error')
    default: return t('rightPanel.mcp.disconnected')
  }
}

const loadServers = async () => {
  loading.value = true
  try {
    // TODO: Load MCP servers from config
    // Mock data for now
    globalServers.value = []
    projectServers.value = []
  } catch (err) {
    console.error('Failed to load MCP servers:', err)
  } finally {
    loading.value = false
  }
}

// Watch project change
watch(() => props.currentProject, () => {
  loadServers()
}, { immediate: true })

onMounted(() => {
  loadServers()
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

/* Server List */
.server-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.server-group {
  display: flex;
  flex-direction: column;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.server-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.connected {
  background: #52c41a;
}

.status-dot.connecting {
  background: #faad14;
  animation: pulse 1s ease-in-out infinite;
}

.status-dot.error {
  background: #ff4d4f;
}

.status-dot.disconnected {
  background: #8c8c8c;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.server-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.server-status {
  font-size: 11px;
  color: var(--text-color-muted);
}
</style>

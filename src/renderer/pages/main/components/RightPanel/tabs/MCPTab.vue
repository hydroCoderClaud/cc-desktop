<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.mcp') }} ({{ totalCount }})</span>
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
      <div v-else-if="totalCount === 0" class="empty-state">
        <div class="empty-icon">🔗</div>
        <div class="empty-text">{{ t('rightPanel.mcp.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.mcp.emptyHint') }}</div>
      </div>

      <!-- Server List -->
      <div v-else class="server-list">
        <!-- Project Servers -->
        <div class="server-group" v-if="currentProject">
          <div class="group-header" @click="toggleGroup('project')">
            <span class="group-icon">{{ expandedGroups.includes('project') ? '▼' : '▶' }}</span>
            <span class="group-title">{{ t('rightPanel.mcp.project') }}</span>
            <span class="group-count">({{ projectServers.length }})</span>
          </div>
          <div v-if="expandedGroups.includes('project')" class="group-items">
            <div v-if="projectServers.length === 0" class="empty-hint-inline">
              {{ t('rightPanel.mcp.noServersInGroup') }}
            </div>
            <div
              v-for="server in projectServers"
              :key="server.name"
              class="server-item"
            >
              <div class="server-main">
                <div class="server-header">
                  <span class="server-name">{{ server.name }}</span>
                </div>
                <div class="server-content">
                  <div class="server-command">
                    <span class="label">{{ t('rightPanel.mcp.command') }}:</span>
                    <code>{{ server.command }}</code>
                  </div>
                  <div v-if="server.args && server.args.length > 0" class="server-args">
                    <span class="label">{{ t('rightPanel.mcp.args') }}:</span>
                    <code>{{ server.args.join(' ') }}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Plugin Servers (Global) -->
        <div class="server-group">
          <div class="group-header" @click="toggleGroup('plugin')">
            <span class="group-icon">{{ expandedGroups.includes('plugin') ? '▼' : '▶' }}</span>
            <span class="group-title">{{ t('rightPanel.mcp.pluginServers') }}</span>
            <span class="group-count">({{ globalServers.length }})</span>
          </div>
          <div v-if="expandedGroups.includes('plugin')" class="group-items">
            <div v-if="globalServers.length === 0" class="empty-hint-inline">
              {{ t('rightPanel.mcp.noServersInGroup') }}
            </div>
            <div
              v-for="server in globalServers"
              :key="`${server.pluginId}-${server.name}`"
              class="server-item"
            >
              <div class="server-main">
                <div class="server-header">
                  <span class="server-name">{{ server.name }}</span>
                  <span class="plugin-badge">{{ server.pluginShortName || server.category }}</span>
                </div>
                <div class="server-content">
                  <div class="server-command">
                    <span class="label">{{ t('rightPanel.mcp.command') }}:</span>
                    <code>{{ server.command }}</code>
                  </div>
                  <div v-if="server.args && server.args.length > 0" class="server-args">
                    <span class="label">{{ t('rightPanel.mcp.args') }}:</span>
                    <code>{{ server.args.join(' ') }}</code>
                  </div>
                </div>
              </div>
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
const expandedGroups = ref(['project', 'plugin'])

// Computed
const totalCount = computed(() => globalServers.value.length + projectServers.value.length)

// Methods
const toggleGroup = (group) => {
  const index = expandedGroups.value.indexOf(group)
  if (index === -1) {
    expandedGroups.value.push(group)
  } else {
    expandedGroups.value.splice(index, 1)
  }
}

const handleRefresh = async () => {
  await loadServers()
}

const loadServers = async () => {
  loading.value = true
  try {
    // 加载全局 MCP（来自插件）
    const global = await window.electronAPI.listMcpGlobal()
    globalServers.value = global

    // 加载项目级 MCP
    if (props.currentProject?.path) {
      const project = await window.electronAPI.listMcpProject(props.currentProject.path)
      projectServers.value = project
    } else {
      projectServers.value = []
    }
  } catch (err) {
    console.error('Failed to load MCP servers:', err)
    globalServers.value = []
    projectServers.value = []
  } finally {
    loading.value = false
  }
}

// Watch project change
watch(() => props.currentProject, () => {
  loadServers()
})

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
  padding: 8px 0;
}

.server-group {
  margin-bottom: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.group-header:hover {
  background: var(--hover-bg);
}

.group-icon {
  font-size: 10px;
  width: 12px;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.group-count {
  font-size: 12px;
  color: var(--text-color-muted);
}

.group-items {
  padding: 4px 8px;
}

.empty-hint-inline {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-muted);
}

.server-item {
  display: flex;
  align-items: stretch;
  margin: 4px 0;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.server-main {
  flex: 1;
  padding: 10px 12px;
  min-width: 0;
}

.server-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.server-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.plugin-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--primary-color);
  color: white;
  border-radius: 3px;
}

.server-content {
  font-size: 11px;
  color: var(--text-color-muted);
}

.server-command,
.server-args {
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-command .label,
.server-args .label {
  color: var(--text-color-muted);
  margin-right: 4px;
}

.server-command code,
.server-args code {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-color);
}
</style>

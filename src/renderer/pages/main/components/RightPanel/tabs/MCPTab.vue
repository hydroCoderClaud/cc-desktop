<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.mcp') }} ({{ totalCount }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.mcp.refresh')" @click="handleRefresh">
          <Icon name="refresh" :size="14" />
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input v-model:value="searchText" :placeholder="t('rightPanel.mcp.search')" size="small" clearable>
        <template #prefix><Icon name="search" :size="14" /></template>
      </n-input>
    </div>

    <div class="tab-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <Icon name="clock" :size="16" class="loading-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="totalCount === 0" class="empty-state">
        <div class="empty-icon"><Icon name="link" :size="48" /></div>
        <div class="empty-text">{{ t('rightPanel.mcp.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.mcp.emptyHint') }}</div>
      </div>

      <!-- Server List -->
      <div v-else class="server-list">
        <!-- User Servers -->
        <MCPGroup
          :title="t('rightPanel.mcp.userScope')"
          :servers="filteredMcpData.user"
          :expanded="expandedGroups.includes('user')"
          :editable="true"
          @toggle="toggleGroup('user')"
          @create="handleCreate('user')"
          @edit="handleEdit"
          @delete="handleDelete"
          @copy="handleCopy"
          @click="handleClick"
          @openFile="handleOpenFile"
        />

        <!-- Local Servers -->
        <MCPGroup
          v-if="currentProject"
          :title="t('rightPanel.mcp.localScope')"
          :servers="filteredMcpData.local"
          :expanded="expandedGroups.includes('local')"
          :editable="true"
          @toggle="toggleGroup('local')"
          @create="handleCreate('local')"
          @edit="handleEdit"
          @delete="handleDelete"
          @copy="handleCopy"
          @click="handleClick"
          @openFile="handleOpenFile"
        />

        <!-- Project Servers -->
        <MCPGroup
          v-if="currentProject"
          :title="t('rightPanel.mcp.projectScope')"
          :servers="filteredMcpData.project"
          :expanded="expandedGroups.includes('project')"
          :editable="true"
          @toggle="toggleGroup('project')"
          @create="handleCreate('project')"
          @edit="handleEdit"
          @delete="handleDelete"
          @copy="handleCopy"
          @click="handleClick"
          @openFile="handleOpenFile"
        />

        <!-- Plugin Servers -->
        <MCPGroup
          :title="t('rightPanel.mcp.pluginScope')"
          :servers="filteredMcpData.plugin"
          :expanded="expandedGroups.includes('plugin')"
          :editable="false"
          :badge="t('rightPanel.mcp.plugin')"
          badge-class="plugin"
          @toggle="toggleGroup('plugin')"
          @edit="handleEdit"
          @copy="handleCopy"
          @click="handleClick"
          @openFile="handleOpenFile"
        />
      </div>
    </div>

    <!-- Edit Modal -->
    <MCPEditModal
      v-model:show="showEditModal"
      :mcp="editingMcp"
      :scope="editingScope"
      :project-path="currentProject?.path"
      :readonly="editingReadonly"
      @saved="handleRefresh"
    />

    <!-- Copy Modal -->
    <MCPCopyModal
      v-model:show="showCopyModal"
      :mcp="copyingMcp"
      :project-path="currentProject?.path"
      @copied="handleRefresh"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NInput, useDialog, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import MCPGroup from '../mcp/MCPGroup.vue'
import MCPEditModal from '../mcp/MCPEditModal.vue'
import MCPCopyModal from '../mcp/MCPCopyModal.vue'

const { t } = useLocale()
const dialog = useDialog()
const message = useMessage()

const props = defineProps({
  currentProject: Object
})

const emit = defineEmits(['send-command'])

// State
const loading = ref(false)
const searchText = ref('')
const mcpData = ref({ user: [], local: [], project: [], plugin: [] })
const expandedGroups = ref(['user', 'local', 'project', 'plugin'])

// Edit Modal
const showEditModal = ref(false)
const editingMcp = ref(null)
const editingScope = ref('')
const editingReadonly = ref(false)

// Copy Modal
const showCopyModal = ref(false)
const copyingMcp = ref(null)

// Computed
const totalCount = computed(() => {
  return mcpData.value.user.length +
         mcpData.value.local.length +
         mcpData.value.project.length +
         mcpData.value.plugin.length
})

const filterServerList = (list, keyword) => {
  if (!keyword) return list
  return list.filter(s => s.name.toLowerCase().includes(keyword))
}

const filteredMcpData = computed(() => {
  const kw = searchText.value.toLowerCase()
  return {
    user: filterServerList(mcpData.value.user, kw),
    local: filterServerList(mcpData.value.local, kw),
    project: filterServerList(mcpData.value.project, kw),
    plugin: filterServerList(mcpData.value.plugin, kw)
  }
})

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
    const result = await window.electronAPI.listMcpAll(props.currentProject?.path)
    mcpData.value = result
  } catch (err) {
    console.error('Failed to load MCP servers:', err)
    mcpData.value = { user: [], local: [], project: [], plugin: [] }
  } finally {
    loading.value = false
  }
}

const handleCreate = (scope) => {
  editingMcp.value = null
  editingScope.value = scope
  editingReadonly.value = false
  showEditModal.value = true
}

const handleEdit = (server) => {
  editingMcp.value = server
  editingScope.value = server.source
  editingReadonly.value = false
  showEditModal.value = true
}

const handleView = (server) => {
  editingMcp.value = server
  editingScope.value = server.source
  editingReadonly.value = true
  showEditModal.value = true
}

const handleDelete = (server) => {
  dialog.warning({
    title: t('rightPanel.mcp.confirmDelete'),
    content: t('rightPanel.mcp.confirmDeleteContent', { name: server.name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        const result = await window.electronAPI.deleteMcp({
          scope: server.source,
          projectPath: props.currentProject?.path,
          name: server.name
        })
        if (result.success) {
          message.success(t('rightPanel.mcp.deleteSuccess'))
          await loadServers()
        } else {
          message.error(result.error || t('common.deleteFailed'))
        }
      } catch (err) {
        console.error('Delete MCP failed:', err)
        message.error(t('common.deleteFailed'))
      }
    }
  })
}

const handleCopy = (server) => {
  copyingMcp.value = server
  showCopyModal.value = true
}

const handleClick = (server) => {
  emit('send-command', `/${server.name}`)
}

const handleOpenFile = async (server) => {
  if (!server.filePath) {
    message.warning(t('common.openFailed'))
    return
  }
  try {
    const result = await window.electronAPI.openFileInEditor(server.filePath)
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Failed to open file:', err)
    message.error(t('common.openFailed'))
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

.tab-content {
  flex: 1;
  overflow-y: auto;
}

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

.server-list {
  padding: 8px 0;
}
</style>

<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.agents') }} ({{ totalCount }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('market.title')" @click="showMarketModal"><Icon name="store" :size="14" /></button>
        <button class="icon-btn" :title="t('rightPanel.agents.refresh')" @click="loadAgents"><Icon name="refresh" :size="14" /></button>
      </div>
    </div>

    <div class="tab-toolbar">
      <div class="toolbar-row">
        <n-input v-model:value="searchText" :placeholder="t('rightPanel.agents.search')" size="small" clearable style="flex: 1;">
          <template #prefix><Icon name="search" :size="14" /></template>
        </n-input>
        <n-button-group size="small">
          <n-button @click="showImportModal" :title="t('rightPanel.agents.import')"><Icon name="import" :size="16" /></n-button>
          <n-button @click="showExportModal" :title="t('rightPanel.agents.export')"><Icon name="export" :size="16" /></n-button>
        </n-button-group>
      </div>
    </div>

    <div class="tab-content">
      <div v-if="loading" class="loading-state">
        <Icon name="clock" :size="16" class="loading-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="totalCount === 0" class="empty-state">
        <div class="empty-icon"><Icon name="robot" :size="48" /></div>
        <div class="empty-text">{{ t('rightPanel.agents.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.agents.emptyHint') }}</div>
      </div>

      <div v-else class="agents-list">
        <!-- 工程级别 Agents -->
        <AgentGroup v-if="currentProject" group-key="project" :agents="filteredAgents.project"
          :title="t('rightPanel.agents.projectAgents')" icon="folder" :editable="true"
          :expanded="expandedGroups.includes('project')" @toggle="toggleGroup('project')"
          @create="showCreateModal('project')" @open-folder="openAgentsFolder('project')"
          @click-agent="handleAgentClick" @edit="showEditModal" @delete="showDeleteModal"
          @openFile="handleOpenFile"
          :copy="showCopyModal" :copy-title="t('rightPanel.agents.copyAgent')"
          :empty-text="t('rightPanel.agents.noProjectAgents')" />

        <!-- 自定义全局 Agents -->
        <AgentGroup group-key="user" :agents="filteredAgents.user"
          :title="t('rightPanel.agents.userAgents')" icon="user" :editable="true"
          :expanded="expandedGroups.includes('user')" @toggle="toggleGroup('user')"
          @create="showCreateModal('user')" @open-folder="openAgentsFolder('user')"
          @click-agent="handleAgentClick" @edit="showEditModal" @delete="showDeleteModal"
          @openFile="handleOpenFile"
          :copy="showCopyModal" :copy-title="t('rightPanel.agents.copyAgent')"
          :empty-text="t('rightPanel.agents.noUserAgents')" />

        <!-- 插件级 Agents -->
        <div v-if="filteredAgents.plugin.length > 0" class="agent-group">
          <div class="group-header clickable" @click="toggleGroup('plugin')">
            <span class="group-toggle"><Icon :name="expandedGroups.includes('plugin') ? 'chevronDown' : 'chevronRight'" :size="10" /></span>
            <span class="group-icon"><Icon name="puzzle" :size="14" /></span>
            <span class="group-name">{{ t('rightPanel.agents.pluginAgents') }}</span>
            <span class="group-count">({{ filteredAgents.plugin.length }})</span>
          </div>
          <div v-if="expandedGroups.includes('plugin')" class="group-items">
            <div v-for="cat in groupedPluginAgents" :key="cat.name" class="agent-category">
              <div class="category-header" @click="toggleCategory(cat.name)">
                <span class="category-icon"><Icon :name="expandedCategories.includes(cat.name) ? 'chevronDown' : 'chevronRight'" :size="10" /></span>
                <span class="category-name">{{ cat.name }}</span>
                <span class="category-count">({{ cat.agents.length }})</span>
              </div>
              <div v-if="expandedCategories.includes(cat.name)" class="category-items">
                <div v-for="agent in cat.agents" :key="agent.fullName" class="agent-item" @click="handleAgentClick(agent)">
                  <div class="agent-row">
                    <span class="agent-color" :style="{ background: getAgentColor(agent.color) }"></span>
                    <span class="agent-name">
                      {{ agent.id }}
                      <span v-if="agent.name && agent.name !== agent.id" class="agent-name-suffix">(/{{ agent.name }})</span>
                    </span>
                    <span class="agent-actions-inline">
                      <button class="icon-btn inline" :title="t('rightPanel.agents.copyAgent')" @click.stop="showCopyModal(agent)"><Icon name="copy" :size="14" /></button>
                      <button class="icon-btn inline" :title="t('rightPanel.agents.edit')" @click.stop="showEditModal(agent)"><Icon name="edit" :size="14" /></button>
                      <button v-if="agent.agentPath" class="icon-btn inline" :title="t('rightPanel.agents.openFile')" @click.stop="handleOpenFile(agent)"><Icon name="externalLink" :size="14" /></button>
                    </span>
                  </div>
                  <span class="agent-desc">{{ agent.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建/编辑 Modal -->
    <AgentEditModal
      v-model="editModalVisible"
      :agent="editAgent"
      :scope="editSource"
      :agents="agents"
      :project-path="currentProject?.path"
      @saved="loadAgents"
    />

    <!-- 删除确认 Modal -->
    <n-modal v-model:show="deleteModalVisible" preset="dialog" :title="t('rightPanel.agents.deleteConfirmTitle')">
      <p>{{ t('rightPanel.agents.deleteConfirmMsg') }} <strong>{{ deleteTarget?.name }}</strong> ?</p>
      <p class="delete-warning">{{ t('rightPanel.agents.deleteWarning') }}</p>
      <template #action>
        <n-button @click="deleteModalVisible = false">{{ t('rightPanel.agents.cancel') }}</n-button>
        <n-button type="error" @click="handleConfirmDelete" :loading="deleting">{{ t('rightPanel.agents.delete') }}</n-button>
      </template>
    </n-modal>

    <!-- 复制 Modal -->
    <AgentCopyModal
      v-model="copyModalVisible"
      :agent="copyAgent"
      :agents="agents"
      :project-path="currentProject?.path"
      @copied="loadAgents"
    />

    <!-- 导入 Modal -->
    <AgentImportModal
      v-model="importModalVisible"
      :current-project="currentProject"
      @imported="loadAgents"
    />

    <!-- 导出 Modal -->
    <AgentExportModal
      v-model="exportModalVisible"
      :agents="agents"
      :current-project="currentProject"
    />

    <!-- 市场 Modal -->
    <ComponentMarketModal v-model="marketModalVisible" default-tab="agents" @installed="loadAgents" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NInput, NModal, NButton, NButtonGroup, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { AGENT_COLORS, getAgentColor } from '@composables/constants'
import Icon from '@components/icons/Icon.vue'
import AgentGroup from './agents/AgentGroup.vue'
import AgentEditModal from './agents/AgentEditModal.vue'
import AgentCopyModal from './agents/AgentCopyModal.vue'
import AgentExportModal from './agents/AgentExportModal.vue'
import AgentImportModal from './agents/AgentImportModal.vue'
import ComponentMarketModal from './skills/ComponentMarketModal.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({ currentProject: Object })
const emit = defineEmits(['send-command', 'insert-to-input'])

// State
const loading = ref(false)
const searchText = ref('')
const agents = ref({ user: [], project: [], plugin: [] })
const expandedCategories = ref([])
const expandedGroups = ref(['project', 'user', 'plugin'])

// Edit Modal States
const editModalVisible = ref(false)
const editAgent = ref(null)  // null = 新建, object = 编辑
const editSource = ref('user')  // 新建时的来源

const deleteModalVisible = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)

// Copy Modal States
const copyModalVisible = ref(false)
const copyAgent = ref(null)

// Import Modal State
const importModalVisible = ref(false)

// Export Modal State
const exportModalVisible = ref(false)

// Market Modal State
const marketModalVisible = ref(false)

// Computed
const totalCount = computed(() => agents.value.user.length + agents.value.project.length + agents.value.plugin.length)

const filterAgentList = (list, keyword) => keyword ? list.filter(a =>
  a.name.toLowerCase().includes(keyword) || a.fullName.toLowerCase().includes(keyword) || (a.description?.toLowerCase().includes(keyword))
) : list

const filteredAgents = computed(() => {
  const kw = searchText.value.toLowerCase()
  return {
    user: filterAgentList(agents.value.user, kw),
    project: filterAgentList(agents.value.project, kw),
    plugin: filterAgentList(agents.value.plugin, kw)
  }
})

const groupedPluginAgents = computed(() => {
  const groups = {}
  filteredAgents.value.plugin.forEach(agent => {
    const cat = agent.category || agent.pluginShortName || t('rightPanel.agents.uncategorized')
    ;(groups[cat] ||= []).push(agent)
  })
  return Object.keys(groups).sort().map(name => ({ name, agents: groups[name] }))
})

// Methods
const toggleGroup = (name) => {
  const idx = expandedGroups.value.indexOf(name)
  idx === -1 ? expandedGroups.value.push(name) : expandedGroups.value.splice(idx, 1)
}

const toggleCategory = (name) => {
  const idx = expandedCategories.value.indexOf(name)
  idx === -1 ? expandedCategories.value.push(name) : expandedCategories.value.splice(idx, 1)
}

// Agent click: 发送 @agent-id 到终端
const handleAgentClick = (agent) => {
  emit('send-command', `@${agent.id}`)
}

const handleOpenFile = async (agent) => {
  if (!agent.agentPath) {
    message.warning(t('common.openFailed'))
    return
  }
  try {
    const result = await window.electronAPI.openFileInEditor(agent.agentPath)
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Failed to open file:', err)
    message.error(t('common.openFailed'))
  }
}

const openAgentsFolder = async (source) => {
  const params = source === 'user' ? { source: 'user' } : { source: 'project', projectPath: props.currentProject?.path }
  try {
    const result = await window.electronAPI.openAgentsFolder(params)
    if (!result.success) message.error(result.error)
  } catch (err) { message.error(err.message) }
}

// Create/Edit Modal
const showCreateModal = (source) => {
  editAgent.value = null  // null 表示新建模式
  editSource.value = source
  editModalVisible.value = true
}

const showEditModal = (agent) => {
  editAgent.value = agent  // 传递 agent 对象，组件会自动加载内容
  editSource.value = agent.source
  editModalVisible.value = true
}

// 查看插件代理（只读模式）
const showViewModal = (agent) => {
  editAgent.value = agent
  editSource.value = agent.source
  editModalVisible.value = true
}

// Delete Modal
const showDeleteModal = (agent) => { deleteTarget.value = agent; deleteModalVisible.value = true }

const handleConfirmDelete = async () => {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const result = await window.electronAPI.deleteAgent({ source: deleteTarget.value.source, agentId: deleteTarget.value.id, projectPath: props.currentProject?.path })
    if (result.success) {
      message.success(t('rightPanel.agents.deleteSuccess'))
      deleteModalVisible.value = false
      deleteTarget.value = null
      await loadAgents()
    } else { message.error(result.error || t('rightPanel.agents.deleteError')) }
  } catch (err) { message.error(`${t('rightPanel.agents.deleteError')}: ${err.message}`) }
  finally { deleting.value = false }
}

// Copy Modal
const showCopyModal = (agent) => {
  copyAgent.value = agent
  copyModalVisible.value = true
}

// Import Modal
const showImportModal = () => {
  importModalVisible.value = true
}

// Export Modal
const showExportModal = () => {
  exportModalVisible.value = true
}

// Market Modal
const showMarketModal = () => {
  marketModalVisible.value = true
}

// Load Agents
const loadAgents = async () => {
  loading.value = true
  try {
    const result = await window.electronAPI.listAgentsAll(props.currentProject?.path || null)
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      agents.value = { user: result.user || [], project: result.project || [], plugin: result.plugin || [] }
    } else {
      const arr = result || []
      agents.value = {
        user: arr.filter(a => a.source === 'user'),
        project: arr.filter(a => a.source === 'project'),
        plugin: arr.filter(a => a.source === 'plugin')
      }
    }
  } catch (err) {
    console.error('Failed to load agents:', err)
    agents.value = { user: [], project: [], plugin: [] }
  } finally { loading.value = false }
}

watch(() => props.currentProject, loadAgents)
onMounted(loadAgents)
</script>

<style scoped>
.tab-container { display: flex; flex-direction: column; height: 100%; }
.tab-header { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 12px; }
.tab-title { font-size: 14px; font-weight: 600; color: var(--text-color); }
.tab-toolbar { margin-top: 12px; padding: 0 12px 12px 12px; }
.tab-content { flex: 1; overflow-y: auto; }

.loading-state { display: flex; align-items: center; justify-content: center; gap: 8px; height: 100%; color: var(--text-color-muted); font-size: 14px; }
.loading-icon { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: var(--text-color-muted); padding: 24px; }
.empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
.empty-hint { font-size: 12px; opacity: 0.7; }

.agents-list { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }

/* Plugin agents group styles */
.agent-group { display: flex; flex-direction: column; }
.group-header { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); }
.group-header.clickable { cursor: pointer; transition: background 0.15s ease; }
.group-header.clickable:hover { background: var(--hover-bg); }
.group-toggle { font-size: 10px; width: 12px; }
.group-icon { font-size: 14px; }
.group-name { flex: 1; }
.group-count { font-weight: 400; opacity: 0.7; }
.group-items { padding: 4px 0; }

.agent-category { margin-bottom: 4px; }
.category-header { display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); cursor: pointer; transition: background 0.15s ease; }
.category-header:hover { background: var(--hover-bg); }
.category-icon { font-size: 10px; width: 12px; }
.category-count { font-weight: 400; opacity: 0.7; }
.category-items { padding: 0 8px; }

/* Plugin agents item styles */
.agent-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; margin: 2px 0; border-radius: 4px; cursor: pointer; transition: background 0.15s ease; }
.agent-item:hover { background: var(--hover-bg); }
.agent-row { display: flex; align-items: center; gap: 8px; }
.agent-color { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.agent-name { font-size: 13px; font-weight: 500; color: var(--text-color); flex: 1; }
.agent-name-suffix { font-weight: 400; color: var(--text-color-muted); margin-left: 4px; }
.agent-desc { font-size: 11px; color: var(--text-color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 16px; }

/* View button for plugin agents */
.agent-actions-inline { display: none; gap: 4px; }
.agent-item:hover .agent-actions-inline { display: flex; }
.agent-item:hover .icon-btn.inline { opacity: 0.7; }

.delete-warning { color: #e74c3c; font-size: 12px; margin-top: 8px; }

/* Toolbar */
.toolbar-row { display: flex; gap: 8px; align-items: center; }
</style>

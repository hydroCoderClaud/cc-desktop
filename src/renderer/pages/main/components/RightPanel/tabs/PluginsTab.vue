<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.plugins') }} ({{ plugins.length }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.plugins.openInstalledJson')" @click="handleOpenInstalledJson">
          📋
        </button>
        <button class="icon-btn" :title="t('rightPanel.plugins.openFolder')" @click="handleOpenFolder">
          📂
        </button>
        <button class="icon-btn" :title="t('rightPanel.plugins.openSettingsJson')" @click="handleOpenSettingsJson">
          ⚙️
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
          :class="{ expanded: expandedPlugins.has(plugin.id) }"
        >
          <!-- Plugin Header -->
          <div class="plugin-header" @click="toggleExpand(plugin)">
            <div class="plugin-icon">📦</div>
            <div class="plugin-info">
              <div class="plugin-name">{{ plugin.name }}</div>
              <div class="plugin-desc">{{ plugin.description || t('rightPanel.plugins.noDescription') }}</div>
              <div class="plugin-meta">
                <span class="plugin-version">v{{ plugin.version }}</span>
                <span class="plugin-source">{{ plugin.marketplace }}</span>
              </div>
            </div>
            <n-switch
              :value="plugin.enabled"
              size="small"
              @click.stop
              @update:value="(val) => handleToggle(plugin, val)"
            />
            <span class="expand-arrow">{{ expandedPlugins.has(plugin.id) ? '▼' : '▶' }}</span>
          </div>

          <!-- Plugin Details (展开后显示) -->
          <div v-if="expandedPlugins.has(plugin.id)" class="plugin-details">
            <div v-if="loadingDetails[plugin.id]" class="loading-details">
              <span>{{ t('common.loading') }}...</span>
            </div>
            <template v-else-if="pluginDetails[plugin.id]">
              <!-- Commands -->
              <div class="component-section" v-if="pluginDetails[plugin.id].components.commands.length > 0">
                <div class="section-header" @click="toggleSection(plugin.id, 'commands')">
                  <span class="section-arrow">{{ expandedSections[plugin.id]?.commands ? '▼' : '▶' }}</span>
                  <span class="section-title">Commands ({{ pluginDetails[plugin.id].components.commands.length }})</span>
                </div>
                <div v-if="expandedSections[plugin.id]?.commands" class="section-content">
                  <div
                    v-for="cmd in pluginDetails[plugin.id].components.commands"
                    :key="cmd.name"
                    class="component-item clickable"
                  >
                    <span class="component-name" @click="handleInsertCommand(cmd)">/{{ cmd.name }}</span>
                    <span class="component-desc" @click="handleInsertCommand(cmd)">{{ cmd.description }}</span>
                    <div class="component-actions">
                      <button class="action-btn" :title="t('common.edit')" @click.stop="handleEditCommand(cmd)">✏️</button>
                      <button class="action-btn" :title="t('common.openFile')" @click.stop="handleOpenFile(cmd.filePath)">↗️</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Agents -->
              <div class="component-section" v-if="pluginDetails[plugin.id].components.agents.length > 0">
                <div class="section-header" @click="toggleSection(plugin.id, 'agents')">
                  <span class="section-arrow">{{ expandedSections[plugin.id]?.agents ? '▼' : '▶' }}</span>
                  <span class="section-title">Agents ({{ pluginDetails[plugin.id].components.agents.length }})</span>
                </div>
                <div v-if="expandedSections[plugin.id]?.agents" class="section-content">
                  <div
                    v-for="agent in pluginDetails[plugin.id].components.agents"
                    :key="agent.name"
                    class="component-item clickable"
                  >
                    <span class="component-name" @click="handleInsertAgent(agent)">@{{ agent.name }}</span>
                    <span class="component-desc" @click="handleInsertAgent(agent)">{{ agent.description }}</span>
                    <div class="component-actions">
                      <button class="action-btn" :title="t('common.edit')" @click.stop="handleEditAgent(agent)">✏️</button>
                      <button class="action-btn" :title="t('common.openFile')" @click.stop="handleOpenFile(agent.filePath)">↗️</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Skills -->
              <div class="component-section" v-if="pluginDetails[plugin.id].components.skills.length > 0">
                <div class="section-header" @click="toggleSection(plugin.id, 'skills')">
                  <span class="section-arrow">{{ expandedSections[plugin.id]?.skills ? '▼' : '▶' }}</span>
                  <span class="section-title">Skills ({{ pluginDetails[plugin.id].components.skills.length }})</span>
                </div>
                <div v-if="expandedSections[plugin.id]?.skills" class="section-content">
                  <div
                    v-for="skill in pluginDetails[plugin.id].components.skills"
                    :key="skill.name"
                    class="component-item clickable"
                  >
                    <span class="component-name" @click="handleInsertSkill(skill)">/{{ skill.name }}</span>
                    <span class="component-desc" @click="handleInsertSkill(skill)">{{ skill.description }}</span>
                    <div class="component-actions">
                      <button class="action-btn" :title="t('common.edit')" @click.stop="handleEditSkill(skill)">✏️</button>
                      <button class="action-btn" :title="t('common.openFile')" @click.stop="handleOpenFile(skill.filePath)">↗️</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Hooks -->
              <div class="component-section" v-if="pluginDetails[plugin.id].components.hooks.length > 0">
                <div class="section-header" @click="toggleSection(plugin.id, 'hooks')">
                  <span class="section-arrow">{{ expandedSections[plugin.id]?.hooks ? '▼' : '▶' }}</span>
                  <span class="section-title">Hooks ({{ pluginDetails[plugin.id].components.hooks.length }})</span>
                </div>
                <div v-if="expandedSections[plugin.id]?.hooks" class="section-content">
                  <div
                    v-for="(hook, idx) in pluginDetails[plugin.id].components.hooks"
                    :key="idx"
                    class="component-item clickable"
                  >
                    <span class="component-name">{{ hook.event }}</span>
                    <span class="component-desc">{{ hook.matcher ? `matcher: ${hook.matcher}` : hook.type }}</span>
                    <div class="component-actions">
                      <button class="action-btn" :title="t('common.edit')" @click.stop="handleEditHook(hook)">✏️</button>
                      <button class="action-btn" :title="t('common.openFile')" @click.stop="handleOpenFile(hook.filePath)">↗️</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- MCP -->
              <div class="component-section" v-if="pluginDetails[plugin.id].components.mcp.length > 0">
                <div class="section-header" @click="toggleSection(plugin.id, 'mcp')">
                  <span class="section-arrow">{{ expandedSections[plugin.id]?.mcp ? '▼' : '▶' }}</span>
                  <span class="section-title">MCP ({{ pluginDetails[plugin.id].components.mcp.length }})</span>
                </div>
                <div v-if="expandedSections[plugin.id]?.mcp" class="section-content">
                  <div
                    v-for="mcp in pluginDetails[plugin.id].components.mcp"
                    :key="mcp.name"
                    class="component-item clickable"
                  >
                    <span class="component-name" @click="handleInsertMcp(mcp)">{{ mcp.name }}</span>
                    <span class="component-desc" @click="handleInsertMcp(mcp)">{{ mcp.type === 'http' ? mcp.url : mcp.command }}</span>
                    <div class="component-actions">
                      <button class="action-btn" :title="t('common.edit')" @click.stop="handleEditMcp(mcp)">✏️</button>
                      <button class="action-btn" :title="t('common.openFile')" @click.stop="handleOpenFile(mcp.filePath)">↗️</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 没有任何组件 -->
              <div
                v-if="
                  pluginDetails[plugin.id].components.commands.length === 0 &&
                  pluginDetails[plugin.id].components.agents.length === 0 &&
                  pluginDetails[plugin.id].components.skills.length === 0 &&
                  pluginDetails[plugin.id].components.hooks.length === 0 &&
                  pluginDetails[plugin.id].components.mcp.length === 0
                "
                class="no-components"
              >
                {{ t('rightPanel.plugins.noComponents') }}
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modals -->
    <SkillEditModal
      v-model="showSkillModal"
      :skill="editingSkill"
      :scope="'plugin'"
      :skills="{ user: [], project: [] }"
      @saved="handleRefresh"
    />

    <AgentEditModal
      v-model="showAgentModal"
      :agent="editingAgent"
      :scope="'plugin'"
      :agents="{ user: [], project: [] }"
      @saved="handleRefresh"
    />

    <HookEditModal
      v-model:show="showHookModal"
      :hook="editingHook"
      :scope="'plugin'"
      @saved="handleRefresh"
    />

    <MCPEditModal
      v-model:show="showMcpModal"
      :mcp="editingMcp"
      :scope="'plugin'"
      :readonly="false"
      @saved="handleRefresh"
    />

    <CommandEditModal
      v-model="showCommandModal"
      :command="editingCommand"
      @saved="handleRefresh"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { NInput, NSwitch, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useIPC } from '@composables/useIPC'
import SkillEditModal from './skills/SkillEditModal.vue'
import AgentEditModal from './agents/AgentEditModal.vue'
import HookEditModal from '../hooks/HookEditModal.vue'
import MCPEditModal from '../mcp/MCPEditModal.vue'
import CommandEditModal from './commands/CommandEditModal.vue'

const { t } = useLocale()
const { invoke } = useIPC()
const message = useMessage()

const emit = defineEmits(['insert-to-input', 'send-command'])

// State
const loading = ref(false)
const searchText = ref('')
const plugins = ref([])
const expandedPlugins = ref(new Set())
const pluginDetails = reactive({})
const loadingDetails = reactive({})
const expandedSections = reactive({})

// Edit Modal States
const showSkillModal = ref(false)
const editingSkill = ref(null)
const showAgentModal = ref(false)
const editingAgent = ref(null)
const showHookModal = ref(false)
const editingHook = ref(null)
const showMcpModal = ref(false)
const editingMcp = ref(null)
const showCommandModal = ref(false)
const editingCommand = ref(null)

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
const handleOpenInstalledJson = async () => {
  try {
    const result = await window.electronAPI.openInstalledPluginsJson()
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Failed to open installed_plugins.json:', err)
    message.error(t('common.openFailed'))
  }
}

const handleOpenSettingsJson = async () => {
  try {
    const result = await window.electronAPI.openSettingsJson()
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Failed to open settings.json:', err)
    message.error(t('common.openFailed'))
  }
}

const handleOpenFolder = async () => {
  try {
    await invoke('openPluginsFolder')
  } catch (err) {
    console.error('Failed to open plugins folder:', err)
  }
}

const handleRefresh = async () => {
  await loadPlugins()
}

const handleToggle = async (plugin, enabled) => {
  const previousState = plugin.enabled
  plugin.enabled = enabled // 乐观更新
  try {
    const success = await invoke('setPluginEnabled', plugin.id, enabled)
    if (!success) {
      plugin.enabled = previousState // 回滚
    }
  } catch (err) {
    console.error('Failed to toggle plugin:', err)
    plugin.enabled = previousState // 回滚
  }
}

const toggleExpand = async (plugin) => {
  const pluginId = plugin.id
  if (expandedPlugins.value.has(pluginId)) {
    expandedPlugins.value.delete(pluginId)
  } else {
    expandedPlugins.value.add(pluginId)
    // 加载详情
    if (!pluginDetails[pluginId]) {
      await loadPluginDetails(pluginId)
    }
  }
}

const toggleSection = (pluginId, section) => {
  if (!expandedSections[pluginId]) {
    expandedSections[pluginId] = {}
  }
  expandedSections[pluginId][section] = !expandedSections[pluginId][section]
}

const loadPlugins = async () => {
  loading.value = true
  try {
    const result = await invoke('listPlugins')
    plugins.value = result || []
  } catch (err) {
    console.error('Failed to load plugins:', err)
    plugins.value = []
  } finally {
    loading.value = false
  }
}

const loadPluginDetails = async (pluginId) => {
  loadingDetails[pluginId] = true
  try {
    const details = await invoke('getPluginDetails', pluginId)
    if (details) {
      pluginDetails[pluginId] = details
      // 默认展开第一个有内容的分类
      expandedSections[pluginId] = {
        commands: details.components.commands.length > 0,
        agents: false,
        skills: false,
        hooks: false,
        mcp: false
      }
    }
  } catch (err) {
    console.error('Failed to load plugin details:', err)
  } finally {
    loadingDetails[pluginId] = false
  }
}

const handleInsertCommand = (cmd) => {
  emit('send-command', `/${cmd.name}`)
}

const handleInsertAgent = (agent) => {
  emit('send-command', `@${agent.name}`)
}

const handleInsertSkill = (skill) => {
  emit('send-command', `/${skill.name}`)
}

const handleInsertMcp = (mcp) => {
  emit('send-command', `/${mcp.name}`)
}

// Edit handlers
const handleEditSkill = (skill) => {
  editingSkill.value = {
    ...skill,
    source: 'plugin',
    skillPath: skill.filePath ? skill.filePath.replace(/[/\\][^/\\]+\.md$/, '') : ''
  }
  showSkillModal.value = true
}

const handleEditAgent = (agent) => {
  editingAgent.value = {
    ...agent,
    source: 'plugin',
    agentPath: agent.filePath
  }
  showAgentModal.value = true
}

const handleEditHook = (hook) => {
  editingHook.value = {
    ...hook,
    source: 'plugin',
    hookPath: hook.filePath
  }
  showHookModal.value = true
}

const handleEditMcp = (mcp) => {
  editingMcp.value = {
    ...mcp,
    source: 'plugin',
    mcpPath: mcp.filePath
  }
  showMcpModal.value = true
}

const handleEditCommand = (cmd) => {
  editingCommand.value = {
    ...cmd,
    name: cmd.name,
    filePath: cmd.filePath
  }
  showCommandModal.value = true
}

// Open file in external editor
const handleOpenFile = async (filePath) => {
  if (!filePath) {
    message.warning(t('common.openFailed'))
    return
  }
  try {
    const result = await window.electronAPI.openFileInEditor(filePath)
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Failed to open file:', err)
    message.error(t('common.openFailed'))
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

/* Plugin List */
.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-item {
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.plugin-item.expanded {
  border-color: var(--primary-color);
}

.plugin-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.plugin-header:hover {
  background: var(--hover-bg);
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
  margin-top: 2px;
}

.plugin-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.plugin-version {
  font-size: 10px;
  color: var(--text-color-muted);
  opacity: 0.7;
}

.plugin-source {
  font-size: 9px;
  color: var(--text-color-muted);
  opacity: 0.5;
  padding: 1px 4px;
  background: var(--bg-color-tertiary);
  border-radius: 3px;
}

.expand-arrow {
  font-size: 10px;
  color: var(--text-color-muted);
  margin-left: 4px;
}

/* Plugin Details */
.plugin-details {
  border-top: 1px solid var(--border-color);
  padding: 8px 12px;
  background: var(--bg-color-secondary);
}

.loading-details {
  text-align: center;
  color: var(--text-color-muted);
  font-size: 12px;
  padding: 8px;
}

/* Component Section */
.component-section {
  margin-bottom: 4px;
}

.component-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.section-header:hover {
  background: var(--hover-bg);
}

.section-arrow {
  font-size: 10px;
  color: var(--text-color-muted);
  width: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
}

.section-content {
  padding-left: 18px;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.component-item.clickable {
  cursor: pointer;
}

.component-item.clickable:hover {
  background: var(--hover-bg);
}

.component-item.clickable:hover .component-actions {
  opacity: 1;
}

.component-name {
  color: var(--primary-color);
  font-weight: 500;
  flex-shrink: 0;
}

.component-desc {
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.component-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.action-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.action-btn:hover {
  background: var(--hover-bg);
}

.no-components {
  text-align: center;
  color: var(--text-color-muted);
  font-size: 12px;
  padding: 12px;
}
</style>

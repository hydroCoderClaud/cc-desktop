<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.plugins') }} ({{ plugins.length }})</span>
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
                    @click="handleInsertCommand(cmd)"
                  >
                    <span class="component-name">/{{ cmd.name }}</span>
                    <span class="component-desc">{{ cmd.description }}</span>
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
                    @click="handleInsertAgent(agent)"
                  >
                    <span class="component-name">@{{ agent.name }}</span>
                    <span class="component-desc">{{ agent.description }}</span>
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
                    @click="handleInsertSkill(skill)"
                  >
                    <span class="component-name">/{{ skill.name }}</span>
                    <span class="component-desc">{{ skill.description }}</span>
                  </div>
                </div>
              </div>

              <!-- Hooks (只展示) -->
              <div class="component-section" v-if="pluginDetails[plugin.id].components.hooks.length > 0">
                <div class="section-header" @click="toggleSection(plugin.id, 'hooks')">
                  <span class="section-arrow">{{ expandedSections[plugin.id]?.hooks ? '▼' : '▶' }}</span>
                  <span class="section-title">Hooks ({{ pluginDetails[plugin.id].components.hooks.length }})</span>
                </div>
                <div v-if="expandedSections[plugin.id]?.hooks" class="section-content">
                  <div
                    v-for="(hook, idx) in pluginDetails[plugin.id].components.hooks"
                    :key="idx"
                    class="component-item"
                  >
                    <span class="component-name">{{ hook.event }}</span>
                    <span class="component-desc">{{ hook.matcher ? `matcher: ${hook.matcher}` : hook.type }}</span>
                  </div>
                </div>
              </div>

              <!-- MCP (只展示) -->
              <div class="component-section" v-if="pluginDetails[plugin.id].components.mcp.length > 0">
                <div class="section-header" @click="toggleSection(plugin.id, 'mcp')">
                  <span class="section-arrow">{{ expandedSections[plugin.id]?.mcp ? '▼' : '▶' }}</span>
                  <span class="section-title">MCP ({{ pluginDetails[plugin.id].components.mcp.length }})</span>
                </div>
                <div v-if="expandedSections[plugin.id]?.mcp" class="section-content">
                  <div
                    v-for="mcp in pluginDetails[plugin.id].components.mcp"
                    :key="mcp.name"
                    class="component-item"
                  >
                    <span class="component-name">{{ mcp.name }}</span>
                    <span class="component-desc">{{ mcp.command }}</span>
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

              <!-- 删除按钮 -->
              <div class="plugin-actions">
                <button class="delete-btn" @click="handleDelete(plugin)">
                  {{ t('rightPanel.plugins.uninstall') }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { NInput, NSwitch, useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useIPC } from '@composables/useIPC'

const { t } = useLocale()
const { invoke } = useIPC()
const dialog = useDialog()

const emit = defineEmits(['insert-to-input'])

// State
const loading = ref(false)
const searchText = ref('')
const plugins = ref([])
const expandedPlugins = ref(new Set())
const pluginDetails = reactive({})
const loadingDetails = reactive({})
const expandedSections = reactive({})

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

const handleDelete = (plugin) => {
  dialog.warning({
    title: t('rightPanel.plugins.deleteConfirm'),
    content: t('rightPanel.plugins.deleteWarning', { name: plugin.name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        const result = await invoke('deletePlugin', plugin.id, true)
        if (result.success) {
          // 从列表中移除
          const idx = plugins.value.findIndex(p => p.id === plugin.id)
          if (idx !== -1) {
            plugins.value.splice(idx, 1)
          }
          // 清理相关状态
          expandedPlugins.value.delete(plugin.id)
          delete pluginDetails[plugin.id]
          delete loadingDetails[plugin.id]
          delete expandedSections[plugin.id]
        } else {
          console.error('Failed to delete plugin:', result.error)
        }
      } catch (err) {
        console.error('Failed to delete plugin:', err)
      }
    }
  })
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
  emit('insert-to-input', `/${cmd.name} `)
}

const handleInsertAgent = (agent) => {
  emit('insert-to-input', `@${agent.name} `)
}

const handleInsertSkill = (skill) => {
  // Skills 使用插件名:技能名 格式
  emit('insert-to-input', `/${skill.name} `)
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
}

.no-components {
  text-align: center;
  color: var(--text-color-muted);
  font-size: 12px;
  padding: 12px;
}

.plugin-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

.delete-btn {
  padding: 4px 12px;
  font-size: 11px;
  color: #dc2626;
  background: transparent;
  border: 1px solid #dc2626;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-btn:hover {
  background: #dc2626;
  color: white;
}
</style>

<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.commands') }} ({{ totalCount }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.commands.refresh')" @click="loadCommands">🔄</button>
      </div>
    </div>

    <div class="tab-toolbar">
      <div class="toolbar-row">
        <n-input v-model:value="searchText" :placeholder="t('rightPanel.commands.search')" size="small" clearable style="flex: 1;">
          <template #prefix><span>⌕</span></template>
        </n-input>
        <n-button-group size="small">
          <n-button @click="showImportModal" :title="t('rightPanel.commands.import')">📥</n-button>
          <n-button @click="showExportModal" :title="t('rightPanel.commands.export')">📤</n-button>
        </n-button-group>
      </div>
    </div>

    <div class="tab-content">
      <div v-if="loading" class="loading-state">
        <span class="loading-icon">⏳</span>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="totalCount === 0" class="empty-state">
        <div class="empty-icon">⌨️</div>
        <div class="empty-text">{{ t('rightPanel.commands.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.commands.emptyHint') }}</div>
      </div>

      <div v-else class="commands-list">
        <!-- 工程级别 Commands -->
        <CommandGroup v-if="currentProject" group-key="project" :commands="filteredCommands.project"
          :title="t('rightPanel.commands.projectCommands')" icon="📁" :editable="true"
          :expanded="expandedGroups.includes('project')" @toggle="toggleGroup('project')"
          @create="showCreateModal('project')" @open-folder="openCommandsFolder('project')"
          @click-command="handleCommandClick" @edit="showEditModal" @delete="showDeleteModal"
          :copy="cmd => showCopyModal(cmd, 'promote')" copy-icon="⬆️" :copy-title="t('rightPanel.commands.promoteToGlobal')"
          :empty-text="t('rightPanel.commands.noProjectCommands')" />

        <!-- 自定义全局 Commands -->
        <CommandGroup group-key="user" :commands="filteredCommands.user"
          :title="t('rightPanel.commands.userCommands')" icon="👤" :editable="true"
          :expanded="expandedGroups.includes('user')" @toggle="toggleGroup('user')"
          @create="showCreateModal('user')" @open-folder="openCommandsFolder('user')"
          @click-command="handleCommandClick" @edit="showEditModal" @delete="showDeleteModal"
          :copy="currentProject ? (cmd => showCopyModal(cmd, 'copy')) : null"
          copy-icon="⬇️" :copy-title="t('rightPanel.commands.copyToProject')"
          :empty-text="t('rightPanel.commands.noUserCommands')" />

        <!-- 插件 Commands -->
        <div v-if="filteredCommands.plugin.length > 0" class="command-group">
          <div class="group-header clickable" @click="toggleGroup('plugin')">
            <span class="group-toggle">{{ expandedGroups.includes('plugin') ? '▼' : '▶' }}</span>
            <span class="group-icon">🔌</span>
            <span class="group-name">{{ t('rightPanel.commands.pluginCommands') }}</span>
            <span class="group-count">({{ filteredCommands.plugin.length }})</span>
            <span class="group-badge readonly">{{ t('rightPanel.commands.readonly') }}</span>
          </div>
          <div v-if="expandedGroups.includes('plugin')" class="group-items">
            <div v-for="cat in groupedPluginCommands" :key="cat.name" class="command-category">
              <div class="category-header" @click="toggleCategory(cat.name)">
                <span class="category-icon">{{ expandedCategories.includes(cat.name) ? '▼' : '▶' }}</span>
                <span class="category-name">{{ cat.name }}</span>
                <span class="category-count">({{ cat.commands.length }})</span>
              </div>
              <div v-if="expandedCategories.includes(cat.name)" class="category-items">
                <div v-for="cmd in cat.commands" :key="cmd.fullName" class="command-item" @click="handleCommandClick(cmd)">
                  <div class="command-row"><span class="command-name">/{{ cmd.fullName }}</span></div>
                  <span class="command-desc">{{ cmd.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建/编辑 Modal -->
    <CommandEditModal
      v-model="editModalVisible"
      :command="editCommand"
      :source="editSource"
      :project-path="currentProject?.path"
      @saved="loadCommands"
    />

    <!-- 删除确认 Modal -->
    <n-modal v-model:show="deleteModalVisible" preset="dialog" :title="t('rightPanel.commands.deleteConfirmTitle')">
      <p>{{ t('rightPanel.commands.deleteConfirmMsg') }} <strong>{{ deleteTarget?.name }}</strong> ?</p>
      <p class="delete-warning">{{ t('rightPanel.commands.deleteWarning') }}</p>
      <template #action>
        <n-button @click="deleteModalVisible = false">{{ t('rightPanel.commands.cancel') }}</n-button>
        <n-button type="error" @click="handleConfirmDelete" :loading="deleting">{{ t('rightPanel.commands.delete') }}</n-button>
      </template>
    </n-modal>

    <!-- 复制/改名 Modal -->
    <CommandCopyModal
      v-model="copyModalVisible"
      :command="copyCommand"
      :direction="copyDirection"
      :commands="commands"
      :project-path="currentProject?.path"
      @copied="loadCommands"
    />

    <!-- 导入 Modal -->
    <CommandImportModal
      v-model="importModalVisible"
      :current-project="currentProject"
      @imported="loadCommands"
    />

    <!-- 导出 Modal -->
    <CommandExportModal
      v-model="exportModalVisible"
      :commands="commands"
      :current-project="currentProject"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NInput, NModal, NButton, NButtonGroup, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import CommandGroup from './commands/CommandGroup.vue'
import CommandEditModal from './commands/CommandEditModal.vue'
import CommandCopyModal from './commands/CommandCopyModal.vue'
import CommandExportModal from './commands/CommandExportModal.vue'
import CommandImportModal from './commands/CommandImportModal.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({ currentProject: Object })
const emit = defineEmits(['send-command', 'insert-to-input'])

// State
const loading = ref(false)
const searchText = ref('')
const commands = ref({ plugin: [], user: [], project: [] })
const expandedCategories = ref([])
const expandedGroups = ref(['project', 'user', 'plugin'])

// Edit Modal States
const editModalVisible = ref(false)
const editCommand = ref(null)  // null = 新建, object = 编辑
const editSource = ref('user')  // 新建时的来源

const deleteModalVisible = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)

// Copy Modal States
const copyModalVisible = ref(false)
const copyCommand = ref(null)
const copyDirection = ref('copy')  // 'promote' | 'copy'

// Import Modal State
const importModalVisible = ref(false)

// Export Modal State
const exportModalVisible = ref(false)

// Computed
const totalCount = computed(() => commands.value.plugin.length + commands.value.user.length + commands.value.project.length)

const filterCommandList = (list, keyword) => keyword ? list.filter(c =>
  c.name.toLowerCase().includes(keyword) || c.fullName.toLowerCase().includes(keyword) || (c.description?.toLowerCase().includes(keyword))
) : list

const filteredCommands = computed(() => {
  const kw = searchText.value.toLowerCase()
  return {
    plugin: filterCommandList(commands.value.plugin, kw),
    user: filterCommandList(commands.value.user, kw),
    project: filterCommandList(commands.value.project, kw)
  }
})

const groupedPluginCommands = computed(() => {
  const groups = {}
  filteredCommands.value.plugin.forEach(cmd => {
    const cat = cmd.category || cmd.pluginShortName || t('rightPanel.commands.uncategorized')
    ;(groups[cat] ||= []).push(cmd)
  })
  return Object.keys(groups).sort().map(name => ({ name, commands: groups[name] }))
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

const handleCommandClick = (cmd) => emit('send-command', `/${cmd.fullName}`)

const openCommandsFolder = async (source) => {
  const params = source === 'user' ? { source: 'user' } : { source: 'project', projectPath: props.currentProject?.path }
  try {
    const result = await window.electronAPI.openCommandsFolder(params)
    if (!result.success) message.error(result.error)
  } catch (err) { message.error(err.message) }
}

// Create/Edit Modal
const showCreateModal = (source) => {
  editCommand.value = null  // null 表示新建模式
  editSource.value = source
  editModalVisible.value = true
}

const showEditModal = (cmd) => {
  editCommand.value = cmd  // 传递 command 对象，组件会自动加载内容
  editSource.value = cmd.source
  editModalVisible.value = true
}

// Delete Modal
const showDeleteModal = (cmd) => { deleteTarget.value = cmd; deleteModalVisible.value = true }

const handleConfirmDelete = async () => {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const result = await window.electronAPI.deleteCommand({ source: deleteTarget.value.source, commandId: deleteTarget.value.id, projectPath: props.currentProject?.path })
    if (result.success) {
      message.success(t('rightPanel.commands.deleteSuccess'))
      deleteModalVisible.value = false
      deleteTarget.value = null
      await loadCommands()
    } else { message.error(result.error || t('rightPanel.commands.deleteError')) }
  } catch (err) { message.error(`${t('rightPanel.commands.deleteError')}: ${err.message}`) }
  finally { deleting.value = false }
}

// Copy Modal
const showCopyModal = (cmd, direction) => {
  if (direction === 'copy' && !props.currentProject?.path) {
    message.warning(t('rightPanel.commands.noProjectSelected'))
    return
  }
  copyCommand.value = cmd
  copyDirection.value = direction
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

// Load Commands
const loadCommands = async () => {
  loading.value = true
  try {
    const projectPath = props.currentProject?.path || null

    // 并行加载三个来源的命令
    const [pluginResult, userResult, projectResult] = await Promise.all([
      window.electronAPI.listCommandsPlugin(),
      window.electronAPI.listCommandsUser(),
      projectPath ? window.electronAPI.listCommandsProject(projectPath) : Promise.resolve([])
    ])

    commands.value = {
      plugin: pluginResult || [],
      user: userResult || [],
      project: projectResult || []
    }
  } catch (err) {
    console.error('Failed to load commands:', err)
    commands.value = { plugin: [], user: [], project: [] }
  } finally { loading.value = false }
}

watch(() => props.currentProject, loadCommands)
onMounted(loadCommands)
</script>

<style scoped>
.tab-container { display: flex; flex-direction: column; height: 100%; }
.tab-header { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 12px; border-bottom: 1px solid var(--border-color); }
.tab-title { font-size: 14px; font-weight: 600; color: var(--text-color); }
.tab-actions { display: flex; gap: 4px; }
.icon-btn { width: 28px; height: 28px; border-radius: 4px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.15s ease; }
.icon-btn:hover { background: var(--hover-bg); }
.tab-toolbar { margin-top: 12px; padding: 0 12px 12px 12px; }
.tab-content { flex: 1; overflow-y: auto; }

.loading-state { display: flex; align-items: center; justify-content: center; gap: 8px; height: 100%; color: var(--text-color-muted); font-size: 14px; }
.loading-icon { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: var(--text-color-muted); padding: 24px; }
.empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
.empty-hint { font-size: 12px; opacity: 0.7; }

.commands-list { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }

/* Plugin commands group styles */
.command-group { display: flex; flex-direction: column; }
.group-header { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); border-bottom: 1px solid var(--border-color); }
.group-header.clickable { cursor: pointer; transition: background 0.15s ease; }
.group-header.clickable:hover { background: var(--hover-bg); }
.group-toggle { font-size: 10px; width: 12px; }
.group-icon { font-size: 14px; }
.group-name { flex: 1; }
.group-count { font-weight: 400; opacity: 0.7; }
.group-items { padding: 4px 0; }

.command-category { margin-bottom: 4px; }
.category-header { display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); cursor: pointer; transition: background 0.15s ease; }
.category-header:hover { background: var(--hover-bg); }
.category-icon { font-size: 10px; width: 12px; }
.category-count { font-weight: 400; opacity: 0.7; }
.category-items { padding: 0 8px; }

/* Plugin commands item styles (not in CommandGroup) */
.command-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; margin: 2px 0; border-radius: 4px; cursor: pointer; transition: background 0.15s ease; }
.command-item:hover { background: var(--hover-bg); }
.command-row { display: flex; align-items: center; gap: 8px; }
.command-name { font-size: 13px; font-weight: 500; color: var(--primary-color); flex: 1; }
.command-desc { font-size: 11px; color: var(--text-color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Group badge for plugin commands */
.group-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
.group-badge.readonly { background: rgba(114, 132, 154, 0.15); color: var(--text-color-muted); }

.delete-warning { color: #e74c3c; font-size: 12px; margin-top: 8px; }

/* Toolbar */
.toolbar-row { display: flex; gap: 8px; align-items: center; }
</style>

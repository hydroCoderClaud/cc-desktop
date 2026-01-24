<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.hooks') }} ({{ totalCount }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.hooks.refresh')" @click="handleRefresh">
          🔄
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.hooks.search')"
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
      <div v-else-if="totalCount === 0 && !searchText" class="empty-state">
        <div class="empty-icon">🪝</div>
        <div class="empty-text">{{ t('rightPanel.hooks.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.hooks.emptyHint') }}</div>
        <n-button size="small" type="primary" @click="handleCreate('global')">
          {{ t('rightPanel.hooks.createHook') }}
        </n-button>
      </div>

      <!-- Hooks List (三级分类) -->
      <div v-else class="hooks-list">
        <!-- 项目级 Hooks -->
        <HookGroup
          v-if="currentProject"
          :title="t('rightPanel.hooks.projectHooks')"
          :hooks="filteredProjectHooks"
          :expanded="expandedGroups.includes('project')"
          :editable="true"
          :file-path="projectHooksFilePath"
          @toggle="toggleGroup('project')"
          @create="handleCreate('project')"
          @edit="handleEdit($event, 'project')"
          @delete="handleDelete($event, 'project')"
          @open-folder="handleOpenFolder('project')"
          @open-file="handleOpenFile"
          @copy="handleCopy"
        />

        <!-- 全局 Hooks -->
        <HookGroup
          :title="t('rightPanel.hooks.globalHooks')"
          :hooks="filteredGlobalHooks"
          :expanded="expandedGroups.includes('global')"
          :editable="true"
          :file-path="globalHooksFilePath"
          @toggle="toggleGroup('global')"
          @create="handleCreate('global')"
          @edit="handleEdit($event, 'global')"
          @delete="handleDelete($event, 'global')"
          @open-folder="handleOpenFolder('global')"
          @open-file="handleOpenFile"
          @copy="handleCopy"
        />

        <!-- 插件 Hooks (可编辑但不可删除) -->
        <HookGroup
          :title="t('rightPanel.hooks.pluginHooks')"
          :hooks="filteredPluginHooks"
          :expanded="expandedGroups.includes('plugin')"
          :editable="false"
          @toggle="toggleGroup('plugin')"
          @edit="handleEdit($event, 'plugin')"
          @open-file="handleOpenFile"
          @copy="handleCopy"
        />
      </div>
    </div>

    <!-- Edit/Create Modal -->
    <HookEditModal
      v-model:show="showEditModal"
      :hook="editingHook"
      :scope="editScope"
      :project-path="currentProject?.path"
      :schema="hooksSchema"
      @saved="handleSaved"
    />

    <!-- Delete Confirm -->
    <n-modal
      v-model:show="showDeleteConfirm"
      preset="dialog"
      type="warning"
      :title="t('common.confirm')"
      :content="t('rightPanel.hooks.confirmDelete')"
      :positive-text="t('common.delete')"
      :negative-text="t('common.cancel')"
      @positive-click="confirmDelete"
    />

    <!-- Copy Modal -->
    <n-modal
      v-model:show="showCopyModal"
      preset="card"
      :title="t('rightPanel.hooks.copyHook')"
      style="width: 400px;"
    >
      <div class="copy-form">
        <div class="copy-info">
          <span class="label">{{ t('rightPanel.hooks.event') }}:</span>
          <span class="value">{{ copyingHook?.event }}</span>
        </div>
        <div class="copy-info">
          <span class="label">{{ t('rightPanel.hooks.type') }}:</span>
          <span class="value">{{ copyingHook?.type }}</span>
        </div>
        <n-divider style="margin: 12px 0;" />
        <n-form-item :label="t('rightPanel.hooks.copyTarget')">
          <n-radio-group v-model:value="copyTargetScope">
            <n-space>
              <n-radio value="global">{{ t('rightPanel.hooks.globalHooks') }}</n-radio>
              <n-radio v-if="currentProject" value="project">{{ t('rightPanel.hooks.projectHooks') }}</n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>
      </div>
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showCopyModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="copying" @click="confirmCopy">{{ t('common.copy') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- Duplicate Confirm -->
    <n-modal
      v-model:show="showDuplicateConfirm"
      preset="dialog"
      type="warning"
      :title="t('rightPanel.hooks.duplicateFound')"
      :content="t('rightPanel.hooks.duplicateConfirm')"
      :positive-text="t('rightPanel.hooks.overwrite')"
      :negative-text="t('common.cancel')"
      @positive-click="confirmOverwrite"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NInput, NButton, NModal, NRadio, NRadioGroup, NSpace, NDivider, NFormItem, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import HookGroup from '../hooks/HookGroup.vue'
import HookEditModal from '../hooks/HookEditModal.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  currentProject: Object
})

// State
const loading = ref(false)
const searchText = ref('')
const hooksSchema = ref({ events: [], types: [], typeFields: {} })

// Hooks 数据 (按来源分类)
const projectHooks = ref([])
const globalHooks = ref([])
const pluginHooks = ref([])

// UI State
const expandedGroups = ref(['project', 'global', 'plugin'])
const showEditModal = ref(false)
const editingHook = ref(null)
const editScope = ref('global')
const showDeleteConfirm = ref(false)
const deletingHook = ref(null)
const deleteScope = ref('global')

// Copy State
const showCopyModal = ref(false)
const copyingHook = ref(null)
const copyTargetScope = ref('global')
const copying = ref(false)
const showDuplicateConfirm = ref(false)
const duplicateHandlerIndex = ref(null)

// Computed
const totalCount = computed(() => {
  return projectHooks.value.length + globalHooks.value.length + pluginHooks.value.length
})

const filterHooks = (hooks) => {
  if (!searchText.value) return hooks
  const keyword = searchText.value.toLowerCase()
  return hooks.filter(h =>
    h.event.toLowerCase().includes(keyword) ||
    h.type.toLowerCase().includes(keyword) ||
    (h.matcher && h.matcher.toLowerCase().includes(keyword)) ||
    (h.command && h.command.toLowerCase().includes(keyword)) ||
    (h.prompt && h.prompt.toLowerCase().includes(keyword))
  )
}

const filteredProjectHooks = computed(() => filterHooks(projectHooks.value))
const filteredGlobalHooks = computed(() => filterHooks(globalHooks.value))
const filteredPluginHooks = computed(() => filterHooks(pluginHooks.value))

// 获取各分组的配置文件路径
const projectHooksFilePath = computed(() => projectHooks.value[0]?.filePath || null)
const globalHooksFilePath = computed(() => globalHooks.value[0]?.filePath || null)

// Methods
const toggleGroup = (group) => {
  const index = expandedGroups.value.indexOf(group)
  if (index === -1) {
    expandedGroups.value.push(group)
  } else {
    expandedGroups.value.splice(index, 1)
  }
}

const loadHooks = async () => {
  loading.value = true
  try {
    // 加载 schema
    const schema = await window.electronAPI.getHooksSchema()
    hooksSchema.value = schema

    // 加载所有 hooks
    const allHooks = await window.electronAPI.listHooksAll(props.currentProject?.path || null)

    // 按来源分类
    projectHooks.value = allHooks.filter(h => h.source === 'project')
    globalHooks.value = allHooks.filter(h => h.source === 'settings')
    pluginHooks.value = allHooks.filter(h => h.source === 'plugin')
  } catch (err) {
    console.error('Failed to load hooks:', err)
    projectHooks.value = []
    globalHooks.value = []
    pluginHooks.value = []
  } finally {
    loading.value = false
  }
}

const handleRefresh = () => {
  loadHooks()
}

const handleCreate = (scope) => {
  editingHook.value = null
  editScope.value = scope
  showEditModal.value = true
}

const handleEdit = (hook, scope) => {
  editingHook.value = hook
  editScope.value = scope
  showEditModal.value = true
}

const handleDelete = (hook, scope) => {
  deletingHook.value = hook
  deleteScope.value = scope
  showDeleteConfirm.value = true
}

const handleOpenFolder = async (scope) => {
  let filePath = null
  if (scope === 'project') {
    filePath = projectHooksFilePath.value
  } else if (scope === 'global') {
    filePath = globalHooksFilePath.value
  }

  if (!filePath) {
    message.warning(t('rightPanel.hooks.noConfigFile'))
    return
  }

  try {
    const result = await window.electronAPI.openFileInEditor(filePath)
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Open folder failed:', err)
    message.error(t('common.openFailed'))
  }
}

// 打开单个 hook 的配置文件
const handleOpenFile = async (hook) => {
  if (!hook.filePath) {
    message.warning(t('rightPanel.hooks.noConfigFile'))
    return
  }

  try {
    const result = await window.electronAPI.openFileInEditor(hook.filePath)
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Open file failed:', err)
    message.error(t('common.openFailed'))
  }
}

const confirmDelete = async () => {
  if (!deletingHook.value) return

  try {
    const result = await window.electronAPI.deleteHook({
      scope: deleteScope.value,
      projectPath: props.currentProject?.path,
      event: deletingHook.value.event,
      handlerIndex: deletingHook.value.handlerIndex
    })

    if (result.success) {
      message.success(t('rightPanel.hooks.deleteSuccess'))
      await loadHooks()
    } else {
      message.error(result.error || t('common.deleteFailed'))
    }
  } catch (err) {
    console.error('Delete hook failed:', err)
    message.error(t('common.deleteFailed'))
  }

  deletingHook.value = null
  showDeleteConfirm.value = false
}

const handleSaved = () => {
  loadHooks()
}

// 复制 Hook
const handleCopy = (hook) => {
  copyingHook.value = hook
  copyTargetScope.value = 'global'
  showCopyModal.value = true
}

// 构建复制用的 hook 对象
const buildCopyHookObject = () => {
  const hook = {
    type: copyingHook.value.type,
    command: copyingHook.value.command || undefined,
    prompt: copyingHook.value.prompt || undefined,
    timeout: copyingHook.value.timeout || undefined,
    model: copyingHook.value.model || undefined,
    async: copyingHook.value.async || undefined
  }
  // 移除 undefined 字段
  Object.keys(hook).forEach(key => hook[key] === undefined && delete hook[key])
  return hook
}

const confirmCopy = async () => {
  if (!copyingHook.value) return

  copying.value = true
  try {
    const result = await window.electronAPI.copyHook({
      targetScope: copyTargetScope.value,
      projectPath: props.currentProject?.path,
      event: copyingHook.value.event,
      matcher: copyingHook.value.matcher || '',
      hook: buildCopyHookObject()
    })

    if (result.success) {
      message.success(t('rightPanel.hooks.copySuccess'))
      showCopyModal.value = false
      copyingHook.value = null
      await loadHooks()
    } else if (result.duplicate) {
      // 发现重复，提示覆盖
      duplicateHandlerIndex.value = result.handlerIndex
      showDuplicateConfirm.value = true
    } else {
      message.error(result.error || t('common.copyFailed'))
    }
  } catch (err) {
    console.error('Copy hook failed:', err)
    message.error(t('common.copyFailed'))
  } finally {
    copying.value = false
  }
}

const confirmOverwrite = async () => {
  if (!copyingHook.value) return

  copying.value = true
  try {
    const result = await window.electronAPI.copyHook({
      targetScope: copyTargetScope.value,
      projectPath: props.currentProject?.path,
      event: copyingHook.value.event,
      matcher: copyingHook.value.matcher || '',
      hook: buildCopyHookObject(),
      overwrite: true,
      overwriteIndex: duplicateHandlerIndex.value
    })

    if (result.success) {
      message.success(t('rightPanel.hooks.copySuccess'))
      showCopyModal.value = false
      showDuplicateConfirm.value = false
      copyingHook.value = null
      duplicateHandlerIndex.value = null
      await loadHooks()
    } else {
      message.error(result.error || t('common.copyFailed'))
    }
  } catch (err) {
    console.error('Overwrite hook failed:', err)
    message.error(t('common.copyFailed'))
  } finally {
    copying.value = false
  }
}

// Watch project change
watch(() => props.currentProject, () => {
  loadHooks()
})

onMounted(() => {
  loadHooks()
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
  gap: 8px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 12px;
}

/* Hooks List */
.hooks-list {
  padding: 8px 0;
}

/* Copy Modal */
.copy-form {
  padding: 4px 0;
}

.copy-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.copy-info .label {
  font-size: 13px;
  color: var(--text-color-muted);
  min-width: 60px;
}

.copy-info .value {
  font-size: 13px;
  color: var(--text-color);
  font-family: monospace;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

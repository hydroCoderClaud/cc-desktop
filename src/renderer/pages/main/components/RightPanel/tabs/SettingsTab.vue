<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.settings') }} ({{ totalCount }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.settings.refresh')" @click="handleRefresh">
          <Icon name="refresh" :size="14" />
        </button>
        <button class="icon-btn" :title="t('rightPanel.settings.docs')" @click="openDocs">
          <Icon name="externalLink" :size="14" />
        </button>
        <button class="icon-btn" :title="t('rightPanel.settings.rawJsonEditor.title')" @click="showRawJsonModal = true">
          <Icon name="fileText" :size="14" />
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.settings.search')"
        size="small"
        clearable
      >
        <template #prefix>
          <Icon name="search" :size="14" />
        </template>
      </n-input>
    </div>

    <div class="tab-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <Icon name="clock" :size="16" class="loading-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="totalCount === 0 && !searchText" class="empty-state">
        <div class="empty-icon"><Icon name="settings" :size="48" /></div>
        <div class="empty-text">{{ t('rightPanel.settings.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.settings.emptyHint') }}</div>
      </div>

      <!-- Settings List -->
      <div v-else class="settings-list">
        <!-- 项目权限 -->
        <PermissionsGroup
          v-if="currentProject"
          :title="t('rightPanel.settings.permissions.projectTitle')"
          :permissions="filteredProjectPermissions"
          :expanded="expandedGroups.includes('projectPermissions')"
          :editable="true"
          :file-path="projectFilePath"
          @toggle="toggleGroup('projectPermissions')"
          @create="handleCreatePermission('project')"
          @edit="handleEditPermission($event, 'project')"
          @delete="handleDeletePermission($event, 'project')"
          @open-file="handleOpenFile(projectFilePath)"
        />

        <!-- 全局权限 -->
        <PermissionsGroup
          :title="t('rightPanel.settings.permissions.globalTitle')"
          :permissions="filteredGlobalPermissions"
          :expanded="expandedGroups.includes('globalPermissions')"
          :editable="true"
          :file-path="globalFilePath"
          @toggle="toggleGroup('globalPermissions')"
          @create="handleCreatePermission('global')"
          @edit="handleEditPermission($event, 'global')"
          @delete="handleDeletePermission($event, 'global')"
          @open-file="handleOpenFile(globalFilePath)"
        />

        <!-- 项目环境变量 -->
        <EnvGroup
          v-if="currentProject"
          :title="t('rightPanel.settings.env.projectTitle')"
          :env="filteredProjectEnv"
          :expanded="expandedGroups.includes('projectEnv')"
          :editable="true"
          :file-path="projectFilePath"
          @toggle="toggleGroup('projectEnv')"
          @create="handleCreateEnv('project')"
          @edit="handleEditEnv($event, 'project')"
          @delete="handleDeleteEnv($event, 'project')"
          @open-file="handleOpenFile(projectFilePath)"
        />

        <!-- 全局环境变量 -->
        <EnvGroup
          :title="t('rightPanel.settings.env.globalTitle')"
          :env="filteredGlobalEnv"
          :expanded="expandedGroups.includes('globalEnv')"
          :editable="true"
          :file-path="globalFilePath"
          @toggle="toggleGroup('globalEnv')"
          @create="handleCreateEnv('global')"
          @edit="handleEditEnv($event, 'global')"
          @delete="handleDeleteEnv($event, 'global')"
          @open-file="handleOpenFile(globalFilePath)"
        />
      </div>
    </div>

    <!-- Permission Edit Modal -->
    <PermissionEditModal
      v-model:show="showPermissionEditModal"
      :rule="editingPermissionRule"
      :scope="editScope"
      :project-path="currentProject?.path"
      @saved="handleSaved"
    />

    <!-- Env Edit Modal -->
    <EnvEditModal
      v-model:show="showEnvEditModal"
      :env-var="editingEnvVar"
      :scope="editScope"
      :project-path="currentProject?.path"
      @saved="handleSaved"
    />

    <!-- Raw JSON Modal -->
    <RawJsonModal
      v-model:show="showRawJsonModal"
      :scope="'global'"
      :project-path="currentProject?.path"
      @saved="handleSaved"
    />

    <!-- Delete Confirm -->
    <n-modal
      v-model:show="showDeleteConfirm"
      preset="dialog"
      type="warning"
      :title="t('common.confirm')"
      :content="deleteConfirmContent"
      :positive-text="t('common.delete')"
      :negative-text="t('common.cancel')"
      @positive-click="confirmDelete"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { NInput, NModal, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import PermissionsGroup from '../settings/PermissionsGroup.vue'
import EnvGroup from '../settings/EnvGroup.vue'
import PermissionEditModal from '../settings/PermissionEditModal.vue'
import EnvEditModal from '../settings/EnvEditModal.vue'
import RawJsonModal from '../settings/RawJsonModal.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  currentProject: Object
})

// State
const loading = ref(false)
const searchText = ref('')

// Settings Data
const globalPermissions = ref({ allow: [], deny: [] })
const projectPermissions = ref({ allow: [], deny: [] })
const globalEnv = ref({})
const projectEnv = ref({})
const globalFilePath = ref('')
const projectFilePath = ref('')

// UI State
const expandedGroups = ref(['projectPermissions', 'globalPermissions', 'projectEnv', 'globalEnv'])

// Permission Edit State
const showPermissionEditModal = ref(false)
const editingPermissionRule = ref(null)
const editScope = ref('global')

// Env Edit State
const showEnvEditModal = ref(false)
const editingEnvVar = ref(null)

// Raw JSON Modal
const showRawJsonModal = ref(false)

// Delete State
const showDeleteConfirm = ref(false)
const deleteType = ref('') // 'permission' or 'env'
const deletingItem = ref(null)
const deleteScope = ref('global')

// Computed
const permissionsCount = computed(() => {
  const global = (globalPermissions.value.allow?.length || 0) + (globalPermissions.value.deny?.length || 0)
  const project = (projectPermissions.value.allow?.length || 0) + (projectPermissions.value.deny?.length || 0)
  return global + project
})

const envCount = computed(() => {
  return Object.keys(globalEnv.value).length + Object.keys(projectEnv.value).length
})

const totalCount = computed(() => permissionsCount.value + envCount.value)

const deleteConfirmContent = computed(() => {
  if (deleteType.value === 'permission') {
    return t('rightPanel.settings.permissions.confirmDelete')
  }
  return t('rightPanel.settings.env.confirmDelete')
})

// Search filter for permissions
const filterPermissions = (permissions) => {
  if (!searchText.value) return permissions
  const keyword = searchText.value.toLowerCase()
  return {
    allow: (permissions.allow || []).filter(p => p.toLowerCase().includes(keyword)),
    deny: (permissions.deny || []).filter(p => p.toLowerCase().includes(keyword))
  }
}

// Search filter for env
const filterEnv = (env) => {
  if (!searchText.value) return env
  const keyword = searchText.value.toLowerCase()
  const filtered = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase().includes(keyword) || String(value).toLowerCase().includes(keyword)) {
      filtered[key] = value
    }
  }
  return filtered
}

const filteredGlobalPermissions = computed(() => filterPermissions(globalPermissions.value))
const filteredProjectPermissions = computed(() => filterPermissions(projectPermissions.value))
const filteredGlobalEnv = computed(() => filterEnv(globalEnv.value))
const filteredProjectEnv = computed(() => filterEnv(projectEnv.value))

// Methods
const toggleGroup = (group) => {
  const index = expandedGroups.value.indexOf(group)
  if (index === -1) {
    expandedGroups.value.push(group)
  } else {
    expandedGroups.value.splice(index, 1)
  }
}

const loadSettings = async () => {
  loading.value = true
  try {
    const result = await window.electronAPI.getClaudeSettings(props.currentProject?.path || null)

    if (result.global) {
      globalPermissions.value = result.global.permissions || { allow: [], deny: [] }
      globalEnv.value = result.global.env || {}
      globalFilePath.value = result.global.filePath || ''
    }

    if (result.project) {
      projectPermissions.value = result.project.permissions || { allow: [], deny: [] }
      projectEnv.value = result.project.env || {}
      projectFilePath.value = result.project.filePath || ''
    } else {
      projectPermissions.value = { allow: [], deny: [] }
      projectEnv.value = {}
      projectFilePath.value = ''
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
    globalPermissions.value = { allow: [], deny: [] }
    globalEnv.value = {}
    projectPermissions.value = { allow: [], deny: [] }
    projectEnv.value = {}
  } finally {
    loading.value = false
  }
}

const handleRefresh = () => {
  loadSettings()
}

const openDocs = () => {
  window.electronAPI.openExternal('https://code.claude.com/docs/en/settings')
}

// Permission handlers
const handleCreatePermission = (scope) => {
  editingPermissionRule.value = null
  editScope.value = scope
  showPermissionEditModal.value = true
}

const handleEditPermission = (rule, scope) => {
  editingPermissionRule.value = rule
  editScope.value = scope
  showPermissionEditModal.value = true
}

const handleDeletePermission = (rule, scope) => {
  deleteType.value = 'permission'
  deletingItem.value = rule
  deleteScope.value = scope
  showDeleteConfirm.value = true
}

// Env handlers
const handleCreateEnv = (scope) => {
  editingEnvVar.value = null
  editScope.value = scope
  showEnvEditModal.value = true
}

const handleEditEnv = (entry, scope) => {
  editingEnvVar.value = entry
  editScope.value = scope
  showEnvEditModal.value = true
}

const handleDeleteEnv = (entry, scope) => {
  deleteType.value = 'env'
  deletingItem.value = entry
  deleteScope.value = scope
  showDeleteConfirm.value = true
}

// Delete confirm
const confirmDelete = async () => {
  if (!deletingItem.value) return

  try {
    let result
    if (deleteType.value === 'permission') {
      result = await window.electronAPI.removeClaudePermission({
        scope: deleteScope.value,
        projectPath: props.currentProject?.path,
        type: deletingItem.value.type,
        index: deletingItem.value.index
      })
    } else {
      result = await window.electronAPI.removeClaudeEnv({
        scope: deleteScope.value,
        projectPath: props.currentProject?.path,
        key: deletingItem.value.key
      })
    }

    if (result.success) {
      message.success(t('common.deleteSuccess'))
      await loadSettings()
    } else {
      message.error(result.error || t('common.deleteFailed'))
    }
  } catch (err) {
    console.error('Delete failed:', err)
    message.error(t('common.deleteFailed'))
  }

  deletingItem.value = null
  showDeleteConfirm.value = false
}

// Open file in editor
const handleOpenFile = async (filePath) => {
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
    console.error('Open file failed:', err)
    message.error(t('common.openFailed'))
  }
}

// Saved callback
const handleSaved = () => {
  loadSettings()
}

// Watch project change
watch(() => props.currentProject, () => {
  loadSettings()
})

onMounted(() => {
  loadSettings()
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

/* Settings List */
.settings-list {
  padding: 8px 0;
}
</style>

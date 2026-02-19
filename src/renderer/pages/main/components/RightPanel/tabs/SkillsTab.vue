<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.skills') }} ({{ totalCount }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('market.title')" @click="showMarketModal"><Icon name="store" :size="14" /></button>
        <button class="icon-btn" :title="t('rightPanel.skills.refresh')" @click="loadSkills"><Icon name="refresh" :size="14" /></button>
      </div>
    </div>

    <div class="tab-toolbar">
      <div class="toolbar-row">
        <n-input v-model:value="searchText" :placeholder="t('rightPanel.skills.search')" size="small" clearable style="flex: 1;">
          <template #prefix><Icon name="search" :size="14" /></template>
        </n-input>
        <n-button-group size="small">
          <n-button @click="showImportModal" :title="t('rightPanel.skills.import')"><Icon name="import" :size="16" /></n-button>
          <n-button @click="showExportModal" :title="t('rightPanel.skills.export')"><Icon name="export" :size="16" /></n-button>
        </n-button-group>
      </div>
    </div>

    <div class="tab-content">
      <div v-if="loading" class="loading-state">
        <Icon name="clock" :size="16" class="loading-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="totalCount === 0" class="empty-state">
        <div class="empty-icon"><Icon name="zap" :size="48" /></div>
        <div class="empty-text">{{ t('rightPanel.skills.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.skills.emptyHint') }}</div>
      </div>

      <div v-else class="skills-list">
        <!-- 工程级别 Skills -->
        <SkillGroup v-if="currentProject" group-key="project" :skills="filteredSkills.project"
          :title="t('rightPanel.skills.projectSkills')" icon="folder" :editable="true"
          :expanded="expandedGroups.includes('project')" @toggle="toggleGroup('project')"
          @create="showCreateModal('project')" @open-folder="openSkillsFolder('project')"
          @click-skill="handleSkillClick" @edit="showEditModal" @delete="showDeleteModal"
          @openFile="handleOpenFile"
          :copy="showCopyModal" :copy-title="t('rightPanel.skills.copySkill')"
          :empty-text="t('rightPanel.skills.noProjectSkills')" />

        <!-- 自定义全局 Skills -->
        <SkillGroup group-key="user" :skills="filteredSkills.user"
          :title="t('rightPanel.skills.userSkills')" icon="user" :editable="true" :toggleable="true"
          :expanded="expandedGroups.includes('user')" @toggle="toggleGroup('user')"
          @create="showCreateModal('user')" @open-folder="openSkillsFolder('user')"
          @click-skill="handleSkillClick" @edit="showEditModal" @delete="showDeleteModal"
          @openFile="handleOpenFile" @toggle-disabled="handleToggleDisabled"
          :copy="showCopyModal" :copy-title="t('rightPanel.skills.copySkill')"
          :empty-text="t('rightPanel.skills.noUserSkills')" />

        <!-- 官方全局 Skills -->
        <div v-if="filteredSkills.official.length > 0" class="skill-group">
          <div class="group-header clickable" @click="toggleGroup('official')">
            <span class="group-toggle"><Icon :name="expandedGroups.includes('official') ? 'chevronDown' : 'chevronRight'" :size="10" /></span>
            <span class="group-icon"><Icon name="building" :size="14" /></span>
            <span class="group-name">{{ t('rightPanel.skills.officialSkills') }}</span>
            <span class="group-count">({{ filteredSkills.official.length }})</span>
          </div>
          <div v-if="expandedGroups.includes('official')" class="group-items">
            <div v-for="cat in groupedOfficialSkills" :key="cat.name" class="skill-category">
              <div class="category-header" @click="toggleCategory(cat.name)">
                <span class="category-icon"><Icon :name="expandedCategories.includes(cat.name) ? 'chevronDown' : 'chevronRight'" :size="10" /></span>
                <span class="category-name">{{ cat.name }}</span>
                <span class="category-count">({{ cat.skills.length }})</span>
              </div>
              <div v-if="expandedCategories.includes(cat.name)" class="category-items">
                <div v-for="skill in cat.skills" :key="skill.fullName" class="skill-item" @click="handleSkillClick(skill)">
                  <div class="skill-row">
                    <span class="skill-name">{{ skill.id || skill.fullName }} <span class="skill-invoke">(/{{ skill.name || skill.fullName }})</span></span>
                    <span class="skill-actions-inline">
                      <button class="icon-btn inline" :title="t('rightPanel.skills.copySkill')" @click.stop="showCopyModal(skill)"><Icon name="copy" :size="14" /></button>
                      <button class="icon-btn inline" :title="t('rightPanel.skills.edit')" @click.stop="showEditModal(skill)"><Icon name="edit" :size="14" /></button>
                      <button v-if="skill.filePath" class="icon-btn inline" :title="t('rightPanel.skills.openFile')" @click.stop="handleOpenFile(skill)"><Icon name="externalLink" :size="14" /></button>
                    </span>
                  </div>
                  <span class="skill-desc">{{ skill.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建/编辑 Modal -->
    <SkillEditModal
      v-model="editModalVisible"
      :skill="editSkill"
      :scope="editSource"
      :skills="skills"
      :project-path="currentProject?.path"
      @saved="loadSkills"
    />

    <!-- 删除确认 Modal -->
    <n-modal v-model:show="deleteModalVisible" preset="dialog" :title="t('rightPanel.skills.deleteConfirmTitle')">
      <p>{{ t('rightPanel.skills.deleteConfirmMsg') }} <strong>{{ deleteTarget?.name }}</strong> ?</p>
      <p class="delete-warning">{{ t('rightPanel.skills.deleteWarning') }}</p>
      <template #action>
        <n-button @click="deleteModalVisible = false">{{ t('rightPanel.skills.cancel') }}</n-button>
        <n-button type="error" @click="handleConfirmDelete" :loading="deleting">{{ t('rightPanel.skills.delete') }}</n-button>
      </template>
    </n-modal>

    <!-- 复制 Modal -->
    <SkillCopyModal
      v-model="copyModalVisible"
      :skill="copySkill"
      :skills="skills"
      :project-path="currentProject?.path"
      @copied="loadSkills"
    />

    <!-- 导入 Modal -->
    <SkillImportModal
      v-model="importModalVisible"
      :current-project="currentProject"
      @imported="loadSkills"
    />

    <!-- 市场 Modal -->
    <ComponentMarketModal v-model="marketModalVisible" default-tab="skills" @installed="loadSkills" />

    <!-- 导出 Modal -->
    <SkillExportModal
      v-model="exportModalVisible"
      :skills="skills"
      :current-project="currentProject"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppMode } from '@composables/useAppMode'
import { NInput, NModal, NButton, NButtonGroup, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import SkillGroup from './skills/SkillGroup.vue'
import SkillEditModal from './skills/SkillEditModal.vue'
import SkillCopyModal from './skills/SkillCopyModal.vue'
import SkillExportModal from './skills/SkillExportModal.vue'
import SkillImportModal from './skills/SkillImportModal.vue'
import ComponentMarketModal from './skills/ComponentMarketModal.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({ currentProject: Object })
const emit = defineEmits(['send-command', 'insert-to-input'])

// State
const loading = ref(false)
const searchText = ref('')
const skills = ref({ official: [], user: [], project: [] })
const expandedCategories = ref([])
const expandedGroups = ref(['project', 'user', 'official'])

// Edit Modal States
const editModalVisible = ref(false)
const editSkill = ref(null)  // null = 新建, object = 编辑
const editSource = ref('user')  // 新建时的来源

const deleteModalVisible = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)

// Copy Modal States
const copyModalVisible = ref(false)
const copySkill = ref(null)

// Import Modal State
const importModalVisible = ref(false)

// Export Modal State
const exportModalVisible = ref(false)

// Market Modal State
const marketModalVisible = ref(false)

// Computed
const totalCount = computed(() => skills.value.official.length + skills.value.user.length + skills.value.project.length)

const filterSkillList = (list, keyword) => keyword ? list.filter(s =>
  s.name.toLowerCase().includes(keyword) || s.fullName.toLowerCase().includes(keyword) || (s.description?.toLowerCase().includes(keyword))
) : list

const filteredSkills = computed(() => {
  const kw = searchText.value.toLowerCase()
  return {
    official: filterSkillList(skills.value.official, kw),
    user: filterSkillList(skills.value.user, kw),
    project: filterSkillList(skills.value.project, kw)
  }
})

const groupedOfficialSkills = computed(() => {
  const groups = {}
  filteredSkills.value.official.forEach(skill => {
    const cat = skill.category || skill.pluginShortName || t('rightPanel.skills.uncategorized')
    ;(groups[cat] ||= []).push(skill)
  })
  return Object.keys(groups).sort().map(name => ({ name, skills: groups[name] }))
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

const handleSkillClick = (skill) => emit('send-command', `/${skill.name || skill.fullName}`)

const handleOpenFile = async (skill) => {
  if (!skill.filePath) {
    message.warning(t('common.openFailed'))
    return
  }
  try {
    const result = await window.electronAPI.openFileInEditor(skill.filePath)
    if (!result.success) {
      message.error(result.error || t('common.openFailed'))
    }
  } catch (err) {
    console.error('Failed to open file:', err)
    message.error(t('common.openFailed'))
  }
}

const openSkillsFolder = async (source) => {
  const params = source === 'user' ? { source: 'user' } : { source: 'project', projectPath: props.currentProject?.path }
  try {
    const result = await window.electronAPI.openSkillsFolder(params)
    if (!result.success) message.error(result.error)
  } catch (err) { message.error(err.message) }
}

// Create/Edit Modal
const showCreateModal = (source) => {
  editSkill.value = null  // null 表示新建模式
  editSource.value = source
  editModalVisible.value = true
}

const showEditModal = (skill) => {
  editSkill.value = skill  // 传递 skill 对象，组件会自动加载内容
  editSource.value = skill.source
  editModalVisible.value = true
}

// Delete Modal
const showDeleteModal = (skill) => { deleteTarget.value = skill; deleteModalVisible.value = true }

const handleConfirmDelete = async () => {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const result = await window.electronAPI.deleteSkill({ source: deleteTarget.value.source, skillId: deleteTarget.value.id, projectPath: props.currentProject?.path })
    if (result.success) {
      message.success(t('rightPanel.skills.deleteSuccess'))
      deleteModalVisible.value = false
      deleteTarget.value = null
      await loadSkills()
    } else { message.error(result.error || t('rightPanel.skills.deleteError')) }
  } catch (err) { message.error(`${t('rightPanel.skills.deleteError')}: ${err.message}`) }
  finally { deleting.value = false }
}

// Copy Modal
const showCopyModal = (skill) => {
  copySkill.value = skill
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

// Toggle Disabled
const handleToggleDisabled = async (skill, disabled) => {
  try {
    const result = await window.electronAPI.toggleComponentDisabled('skill', skill.id, disabled)
    if (result.success) {
      await loadSkills()
    } else {
      message.error(result.error || t('common.operationFailed'))
    }
  } catch (err) {
    console.error('Failed to toggle skill disabled:', err)
    message.error(err.message)
  }
}

// Load Skills
const loadSkills = async () => {
  loading.value = true
  try {
    const result = await window.electronAPI.listSkillsAll(props.currentProject?.path || null)
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      skills.value = { official: result.official || [], user: result.user || [], project: result.project || [] }
    } else {
      const arr = result || []
      skills.value = {
        official: arr.filter(s => s.source === 'official' || s.source === 'plugin'),
        user: arr.filter(s => s.source === 'user'),
        project: arr.filter(s => s.source === 'project')
      }
    }
  } catch (err) {
    console.error('Failed to load skills:', err)
    skills.value = { official: [], user: [], project: [] }
  } finally { loading.value = false }
}

const { isDeveloperMode } = useAppMode()

watch(() => props.currentProject, loadSkills)
onMounted(loadSkills)

// 从 Agent 模式切回开发者模式时刷新列表
watch(isDeveloperMode, (val) => {
  if (val) loadSkills()
})
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

.skills-list { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }

/* Official skills group styles */
.skill-group { display: flex; flex-direction: column; }
.group-header { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); }
.group-header.clickable { cursor: pointer; transition: background 0.15s ease; }
.group-header.clickable:hover { background: var(--hover-bg); }
.group-toggle { font-size: 10px; width: 12px; }
.group-icon { font-size: 14px; }
.group-name { flex: 1; }
.group-count { font-weight: 400; opacity: 0.7; }
.group-items { padding: 4px 0; }

.skill-category { margin-bottom: 4px; }
.category-header { display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); cursor: pointer; transition: background 0.15s ease; }
.category-header:hover { background: var(--hover-bg); }
.category-icon { font-size: 10px; width: 12px; }
.category-count { font-weight: 400; opacity: 0.7; }
.category-items { padding: 0 8px; }

/* Official skills item styles (not in SkillGroup) */
.skill-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; margin: 2px 0; border-radius: 4px; cursor: pointer; transition: background 0.15s ease; }
.skill-item:hover { background: var(--hover-bg); }
.skill-row { display: flex; align-items: center; gap: 8px; }
.skill-name { font-size: 13px; font-weight: 500; color: var(--text-color); flex: 1; }
.skill-name .skill-invoke { color: var(--primary-color); font-weight: 400; }
.skill-desc { font-size: 11px; color: var(--text-color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* View button for official skills */
.skill-actions-inline { display: none; gap: 4px; }
.skill-item:hover .skill-actions-inline { display: flex; }
.skill-item:hover .icon-btn.inline { opacity: 0.7; }

.delete-warning { color: #e74c3c; font-size: 12px; margin-top: 8px; }

/* Toolbar */
.toolbar-row { display: flex; gap: 8px; align-items: center; }
</style>

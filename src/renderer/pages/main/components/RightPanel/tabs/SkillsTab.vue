<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.skills') }} ({{ totalCount }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.skills.refresh')" @click="loadSkills">🔄</button>
      </div>
    </div>

    <div class="tab-toolbar">
      <div class="toolbar-row">
        <n-input v-model:value="searchText" :placeholder="t('rightPanel.skills.search')" size="small" clearable style="flex: 1;">
          <template #prefix><span>⌕</span></template>
        </n-input>
        <n-button-group size="small">
          <n-button @click="showImportModal" :title="t('rightPanel.skills.import')">📥</n-button>
          <n-button @click="showExportModal" :title="t('rightPanel.skills.export')">📤</n-button>
        </n-button-group>
      </div>
    </div>

    <div class="tab-content">
      <div v-if="loading" class="loading-state">
        <span class="loading-icon">⏳</span>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="totalCount === 0" class="empty-state">
        <div class="empty-icon">⚡</div>
        <div class="empty-text">{{ t('rightPanel.skills.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.skills.emptyHint') }}</div>
      </div>

      <div v-else class="skills-list">
        <!-- 工程级别 Skills -->
        <SkillGroup v-if="currentProject" group-key="project" :skills="filteredSkills.project"
          :title="t('rightPanel.skills.projectSkills')" icon="📁" :editable="true"
          :expanded="expandedGroups.includes('project')" @toggle="toggleGroup('project')"
          @create="showCreateModal('project')" @open-folder="openSkillsFolder('project')"
          @click-skill="handleSkillClick" @edit="showEditModal" @delete="showDeleteModal"
          :copy="skill => showCopyModal(skill, 'promote')" copy-icon="⬆️" :copy-title="t('rightPanel.skills.promoteToGlobal')"
          :empty-text="t('rightPanel.skills.noProjectSkills')" />

        <!-- 自定义全局 Skills -->
        <SkillGroup group-key="user" :skills="filteredSkills.user"
          :title="t('rightPanel.skills.userSkills')" icon="👤" :editable="true"
          :expanded="expandedGroups.includes('user')" @toggle="toggleGroup('user')"
          @create="showCreateModal('user')" @open-folder="openSkillsFolder('user')"
          @click-skill="handleSkillClick" @edit="showEditModal" @delete="showDeleteModal"
          :copy="currentProject ? (skill => showCopyModal(skill, 'copy')) : null"
          copy-icon="⬇️" :copy-title="t('rightPanel.skills.copyToProject')"
          :empty-text="t('rightPanel.skills.noUserSkills')" />

        <!-- 官方全局 Skills -->
        <div v-if="filteredSkills.official.length > 0" class="skill-group">
          <div class="group-header clickable" @click="toggleGroup('official')">
            <span class="group-toggle">{{ expandedGroups.includes('official') ? '▼' : '▶' }}</span>
            <span class="group-icon">🏢</span>
            <span class="group-name">{{ t('rightPanel.skills.officialSkills') }}</span>
            <span class="group-count">({{ filteredSkills.official.length }})</span>
            <span class="group-badge readonly">{{ t('rightPanel.skills.readonly') }}</span>
          </div>
          <div v-if="expandedGroups.includes('official')" class="group-items">
            <div v-for="cat in groupedOfficialSkills" :key="cat.name" class="skill-category">
              <div class="category-header" @click="toggleCategory(cat.name)">
                <span class="category-icon">{{ expandedCategories.includes(cat.name) ? '▼' : '▶' }}</span>
                <span class="category-name">{{ cat.name }}</span>
                <span class="category-count">({{ cat.skills.length }})</span>
              </div>
              <div v-if="expandedCategories.includes(cat.name)" class="category-items">
                <div v-for="skill in cat.skills" :key="skill.fullName" class="skill-item" @click="handleSkillClick(skill)">
                  <div class="skill-row"><span class="skill-name">/{{ skill.fullName }}</span></div>
                  <span class="skill-desc">{{ skill.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建/编辑 Modal -->
    <n-modal v-model:show="editModalVisible" preset="card" :title="editModalTitle" style="width: 700px; max-width: 90vw;">
      <n-form :model="editForm" label-placement="top">
        <n-form-item v-if="!editForm.isEdit" :label="t('rightPanel.skills.skillId')">
          <n-input v-model:value="editForm.skillId" :placeholder="t('rightPanel.skills.skillIdPlaceholder')" />
        </n-form-item>
        <n-form-item :label="t('rightPanel.skills.name')">
          <n-input v-model:value="editForm.name" :placeholder="t('rightPanel.skills.namePlaceholder')" />
        </n-form-item>
        <n-form-item :label="t('rightPanel.skills.description')">
          <n-input v-model:value="editForm.description" type="textarea" :placeholder="t('rightPanel.skills.descriptionPlaceholder')" :rows="3" />
        </n-form-item>
        <n-form-item :label="t('rightPanel.skills.content')">
          <n-input v-model:value="editForm.content" type="textarea" :placeholder="t('rightPanel.skills.contentPlaceholder')" :rows="16" style="font-family: monospace;" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <n-button @click="editModalVisible = false">{{ t('rightPanel.skills.cancel') }}</n-button>
          <n-button type="primary" @click="handleSaveSkill" :loading="saving">{{ t('rightPanel.skills.save') }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 删除确认 Modal -->
    <n-modal v-model:show="deleteModalVisible" preset="dialog" :title="t('rightPanel.skills.deleteConfirmTitle')">
      <p>{{ t('rightPanel.skills.deleteConfirmMsg') }} <strong>{{ deleteTarget?.name }}</strong> ?</p>
      <p class="delete-warning">{{ t('rightPanel.skills.deleteWarning') }}</p>
      <template #action>
        <n-button @click="deleteModalVisible = false">{{ t('rightPanel.skills.cancel') }}</n-button>
        <n-button type="error" @click="handleConfirmDelete" :loading="deleting">{{ t('rightPanel.skills.delete') }}</n-button>
      </template>
    </n-modal>

    <!-- 复制/改名 Modal -->
    <n-modal v-model:show="copyModalVisible" preset="card" :title="copyModalTitle" style="width: 450px; max-width: 90vw;">
      <div class="copy-modal-content">
        <p class="copy-note">📋 {{ t('rightPanel.skills.copyFromNote', { skillId: copyForm.skillId }) }}</p>
        <n-form :model="copyForm" label-placement="top">
          <n-form-item :label="t('rightPanel.skills.newSkillId')">
            <n-input v-model:value="copyForm.newSkillId" :placeholder="t('rightPanel.skills.newSkillIdPlaceholder')"
              @input="copyForm.existsInTarget = false; copyForm.confirmOverwrite = false" />
          </n-form-item>
        </n-form>
        <p class="copy-hint">{{ t('rightPanel.skills.mustRenameHint') }}</p>
        <p v-if="copyForm.existsInTarget" class="overwrite-warning">
          ⚠️ {{ t('rightPanel.skills.overwriteWarning', { skillId: copyForm.newSkillId }) }}
        </p>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <n-button @click="copyModalVisible = false">{{ t('rightPanel.skills.cancel') }}</n-button>
          <n-button v-if="copyForm.existsInTarget" type="warning" @click="handleConfirmCopy(true)" :loading="copying">
            {{ t('rightPanel.skills.confirmOverwrite') }}
          </n-button>
          <n-button v-else type="primary" @click="handleConfirmCopy(false)" :loading="copying">
            {{ t('rightPanel.skills.confirmCopy') }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- 导入 Modal -->
    <n-modal v-model:show="importModalVisible" preset="card" :title="t('rightPanel.skills.importTitle')" style="width: 600px; max-width: 90vw;">
      <div class="import-modal-content">
        <!-- Step 1: 选择源 -->
        <div v-if="importStep === 1" class="import-step">
          <p class="step-title">{{ t('rightPanel.skills.importStep1') }}</p>
          <div class="source-buttons">
            <n-button size="large" @click="selectImportSource('folder')">
              📁 {{ t('rightPanel.skills.importFromFolder') }}
            </n-button>
            <n-button size="large" @click="selectImportSource('zip')">
              📦 {{ t('rightPanel.skills.importFromZip') }}
            </n-button>
          </div>
          <p v-if="importForm.sourcePath" class="selected-source">
            {{ t('rightPanel.skills.selectedSource') }}: {{ importForm.sourcePath }}
          </p>
        </div>

        <!-- Step 2: 校验结果 -->
        <div v-if="importStep === 2" class="import-step">
          <p class="step-title">{{ t('rightPanel.skills.importStep2') }}</p>
          <div v-if="importValidating" class="validating">
            <span class="loading-icon">⏳</span> {{ t('rightPanel.skills.validating') }}
          </div>
          <div v-else-if="importValidation">
            <div v-if="importValidation.errors?.length" class="validation-errors">
              <p class="validation-label error">❌ {{ t('rightPanel.skills.validationErrors') }}:</p>
              <ul><li v-for="(err, i) in importValidation.errors" :key="i">{{ err }}</li></ul>
            </div>
            <div v-if="importValidation.warnings?.length" class="validation-warnings">
              <p class="validation-label warning">⚠️ {{ t('rightPanel.skills.validationWarnings') }}:</p>
              <ul><li v-for="(warn, i) in importValidation.warnings" :key="i">{{ warn }}</li></ul>
            </div>
            <div v-if="importValidation.valid && importValidation.skills?.length" class="validation-skills">
              <p class="validation-label success">✅ {{ t('rightPanel.skills.foundSkills', { count: importValidation.skills.length }) }}:</p>
              <div class="skill-checkboxes">
                <n-checkbox-group v-model:value="importForm.selectedSkillIds">
                  <div v-for="skill in importValidation.skills" :key="skill.skillId" class="skill-checkbox-item">
                    <n-checkbox :value="skill.skillId">
                      <span class="checkbox-skill-name">{{ skill.skillId }}</span>
                      <span v-if="skill.name" class="checkbox-skill-label">({{ skill.name }})</span>
                      <span v-if="!skill.nameMatch" class="checkbox-skill-warn">⚠️</span>
                    </n-checkbox>
                  </div>
                </n-checkbox-group>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: 选择目标 -->
        <div v-if="importStep === 3" class="import-step">
          <p class="step-title">{{ t('rightPanel.skills.importStep3') }}</p>
          <n-radio-group v-model:value="importForm.targetSource" class="target-radio-group">
            <n-radio value="user">{{ t('rightPanel.skills.importToUser') }}</n-radio>
            <n-radio v-if="currentProject" value="project">{{ t('rightPanel.skills.importToProject') }}</n-radio>
          </n-radio-group>
        </div>

        <!-- Step 4: 冲突处理 -->
        <div v-if="importStep === 4" class="import-step">
          <p class="step-title">{{ t('rightPanel.skills.conflictStep') }}</p>

          <!-- 跨作用域警告：导入到项目时，全局有同名 -->
          <div v-if="shadowedByGlobal.length > 0" class="cross-scope-warning shadowed">
            <p class="warning-title">⚠️ {{ t('rightPanel.skills.shadowedByGlobalTitle') }}</p>
            <p class="warning-desc">{{ t('rightPanel.skills.shadowedByGlobalDesc') }}</p>
            <ul class="warning-list">
              <li v-for="skillId in shadowedByGlobal" :key="'shadowed-' + skillId">{{ skillId }}</li>
            </ul>
          </div>

          <!-- 跨作用域警告：导入到全局时，项目有同名 -->
          <div v-if="willShadowProject.length > 0" class="cross-scope-warning will-shadow">
            <p class="warning-title">⚠️ {{ t('rightPanel.skills.willShadowProjectTitle') }}</p>
            <p class="warning-desc">{{ t('rightPanel.skills.willShadowProjectDesc') }}</p>
            <ul class="warning-list">
              <li v-for="skillId in willShadowProject" :key="'shadow-' + skillId">{{ skillId }}</li>
            </ul>
          </div>

          <div v-if="importConflicts.length > 0" class="conflict-list">
            <p class="conflict-hint">{{ t('rightPanel.skills.conflictHint') }}</p>
            <div v-for="skillId in importConflicts" :key="skillId" class="conflict-item">
              <span class="conflict-name">⚠️ {{ skillId }}</span>
              <div class="conflict-actions">
                <n-radio-group v-model:value="importForm.conflictActions[skillId]" size="small">
                  <n-radio value="skip">{{ t('rightPanel.skills.conflictSkip') }}</n-radio>
                  <n-radio value="rename">{{ t('rightPanel.skills.conflictRename') }}</n-radio>
                  <n-radio value="overwrite">{{ t('rightPanel.skills.conflictOverwrite') }}</n-radio>
                </n-radio-group>
                <n-input v-if="importForm.conflictActions[skillId] === 'rename'"
                  v-model:value="importForm.renamedSkills[skillId]"
                  :placeholder="t('rightPanel.skills.newSkillIdPlaceholder')"
                  size="small" style="width: 180px; margin-top: 4px;" />
              </div>
            </div>
          </div>
          <div v-else-if="shadowedByGlobal.length === 0 && willShadowProject.length === 0" class="no-conflicts">
            <p class="validation-label success">✅ {{ t('rightPanel.skills.noConflicts') }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: space-between;">
          <n-button v-if="importStep > 1" @click="importStep--">{{ t('common.previous') }}</n-button>
          <span v-else></span>
          <div style="display: flex; gap: 12px;">
            <n-button @click="importModalVisible = false">{{ t('common.cancel') }}</n-button>
            <n-button v-if="importStep === 2 && importValidation?.valid" type="primary" @click="importStep = 3">
              {{ t('common.next') }}
            </n-button>
            <n-button v-if="importStep === 3" type="primary" @click="goToConflictStep" :loading="checkingConflicts">
              {{ t('common.next') }}
            </n-button>
            <n-button v-if="importStep === 4" type="primary" @click="handleImport" :loading="importing" :disabled="!canImport">
              {{ t('rightPanel.skills.confirmImport') }}
            </n-button>
          </div>
        </div>
      </template>
    </n-modal>

    <!-- 导出 Modal -->
    <n-modal v-model:show="exportModalVisible" preset="card" :title="t('rightPanel.skills.exportTitle')" style="width: 500px; max-width: 90vw;">
      <div class="export-modal-content">
        <n-form label-placement="top">
          <n-form-item :label="t('rightPanel.skills.exportSource')">
            <n-radio-group v-model:value="exportForm.source">
              <n-radio value="user">{{ t('rightPanel.skills.userSkills') }} ({{ skills.user.length }})</n-radio>
              <n-radio v-if="currentProject" value="project">{{ t('rightPanel.skills.projectSkills') }} ({{ skills.project.length }})</n-radio>
            </n-radio-group>
          </n-form-item>
          <!-- 无可导出技能提示 -->
          <div v-if="exportableSkills.length === 0" class="export-empty-hint">
            ⚠️ {{ t('rightPanel.skills.noExportableSkills') }}
          </div>
          <template v-else>
            <n-form-item :label="t('rightPanel.skills.exportScope')">
              <n-radio-group v-model:value="exportForm.scope">
                <n-radio value="single">{{ t('rightPanel.skills.exportSingle') }}</n-radio>
                <n-radio value="batch">{{ t('rightPanel.skills.exportBatch') }}</n-radio>
              </n-radio-group>
            </n-form-item>
            <n-form-item v-if="exportForm.scope === 'single'" :label="t('rightPanel.skills.selectSkill')">
              <n-select v-model:value="exportForm.skillId" :options="exportSkillOptions" :placeholder="t('rightPanel.skills.selectSkillPlaceholder')" />
            </n-form-item>
            <n-form-item v-else :label="t('rightPanel.skills.selectSkills')">
              <n-checkbox-group v-model:value="exportForm.skillIds">
                <div v-for="skill in exportableSkills" :key="skill.id" class="skill-checkbox-item">
                  <n-checkbox :value="skill.id">{{ skill.id }} ({{ skill.name }})</n-checkbox>
                </div>
              </n-checkbox-group>
            </n-form-item>
            <n-form-item :label="t('rightPanel.skills.exportFormat')">
              <n-radio-group v-model:value="exportForm.format">
                <n-radio value="folder">📁 {{ t('rightPanel.skills.exportAsFolder') }}</n-radio>
                <n-radio value="zip">📦 {{ t('rightPanel.skills.exportAsZip') }}</n-radio>
              </n-radio-group>
            </n-form-item>
          </template>
        </n-form>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <n-button @click="exportModalVisible = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="handleExport" :loading="exporting" :disabled="!canExport">
            {{ t('rightPanel.skills.confirmExport') }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from 'vue'
import { NInput, NModal, NForm, NFormItem, NButton, NButtonGroup, NCheckbox, NCheckboxGroup, NRadio, NRadioGroup, NSelect, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

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

// Modal States
const editModalVisible = ref(false)
const editModalTitle = ref('')
const editForm = ref({ isEdit: false, source: 'user', skillId: '', name: '', description: '', content: '' })
const saving = ref(false)

const deleteModalVisible = ref(false)
const deleteTarget = ref(null)
const deleting = ref(false)

const copyModalVisible = ref(false)
const copyModalTitle = ref('')
const copyForm = ref({ fromSource: '', toSource: '', skillId: '', newSkillId: '', existsInTarget: false, confirmOverwrite: false })
const copying = ref(false)

// Import Modal States
const importModalVisible = ref(false)
const importStep = ref(1)
const importForm = ref({ sourcePath: '', sourceType: '', targetSource: 'user', selectedSkillIds: [], conflictActions: {}, renamedSkills: {} })
const importValidating = ref(false)
const importValidation = ref(null)
const importing = ref(false)
const checkingConflicts = ref(false)
const importConflicts = ref([])
const shadowedByGlobal = ref([])  // 导入到项目时，全局有同名（导入后不起作用）
const willShadowProject = ref([])  // 导入到全局时，项目有同名（导入后项目失效）

// Import computed
const canImport = computed(() => {
  // 检查所有冲突是否已处理
  for (const skillId of importConflicts.value) {
    const action = importForm.value.conflictActions[skillId]
    if (!action) return false
    if (action === 'rename') {
      const newId = importForm.value.renamedSkills[skillId]
      if (!newId || !/^[a-zA-Z0-9-]+$/.test(newId)) return false
    }
  }
  return true
})

// Export Modal States
const exportModalVisible = ref(false)
const exportForm = ref({ source: 'user', scope: 'single', skillId: '', skillIds: [], format: 'zip' })
const exporting = ref(false)

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

const handleSkillClick = (skill) => emit('send-command', `/${skill.fullName}`)

const openSkillsFolder = async (source) => {
  const params = source === 'user' ? { source: 'user' } : { source: 'project', projectPath: props.currentProject?.path }
  try {
    const result = await window.electronAPI.openSkillsFolder(params)
    if (!result.success) message.error(result.error)
  } catch (err) { message.error(err.message) }
}

// Create/Edit Modal
const showCreateModal = (source) => {
  editModalTitle.value = source === 'project' ? t('rightPanel.skills.createProject') : t('rightPanel.skills.createUser')
  editForm.value = { isEdit: false, source, skillId: '', name: '', description: '', content: '' }
  editModalVisible.value = true
}

const showEditModal = async (skill) => {
  editModalTitle.value = t('rightPanel.skills.edit')
  const result = await window.electronAPI.getSkillContent({ source: skill.source, skillId: skill.id, projectPath: props.currentProject?.path })
  if (result.success) {
    editForm.value = { isEdit: true, source: skill.source, skillId: skill.id, name: result.skill.name, description: result.skill.description, content: result.skill.content }
    editModalVisible.value = true
  } else {
    message.error(`${t('rightPanel.skills.loadError')}: ${result.error}`)
  }
}

const handleSaveSkill = async () => {
  const form = editForm.value
  if (!form.isEdit && !form.skillId) { message.warning(t('rightPanel.skills.skillIdRequired')); return }
  saving.value = true
  try {
    const params = { source: form.source, skillId: form.skillId, name: form.name || form.skillId, description: form.description, content: form.content, projectPath: props.currentProject?.path }
    const result = form.isEdit ? await window.electronAPI.updateSkill(params) : await window.electronAPI.createSkill(params)
    if (result.success) {
      message.success(form.isEdit ? t('rightPanel.skills.updateSuccess') : t('rightPanel.skills.createSuccess'))
      editModalVisible.value = false
      await loadSkills()
    } else { message.error(result.error || t('rightPanel.skills.saveError')) }
  } catch (err) { message.error(`${t('rightPanel.skills.saveError')}: ${err.message}`) }
  finally { saving.value = false }
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

// Copy Modal (合并 promote 和 copy)
const showCopyModal = (skill, direction) => {
  const isPromote = direction === 'promote'
  if (!isPromote && !props.currentProject?.path) { message.warning(t('rightPanel.skills.noProjectSelected')); return }
  copyModalTitle.value = t(isPromote ? 'rightPanel.skills.promoteToGlobal' : 'rightPanel.skills.copyToProject')
  copyForm.value = { fromSource: isPromote ? 'project' : 'user', toSource: isPromote ? 'user' : 'project', skillId: skill.id, newSkillId: '', existsInTarget: false, confirmOverwrite: false }
  copyModalVisible.value = true
}

const handleConfirmCopy = async (overwrite = false) => {
  const form = copyForm.value
  if (!form.newSkillId) { message.warning(t('rightPanel.skills.skillIdRequired')); return }
  if (!/^[a-zA-Z0-9-]+$/.test(form.newSkillId)) { message.warning(t('rightPanel.skills.invalidSkillId')); return }
  if (form.newSkillId === form.skillId) { message.error(t('rightPanel.skills.cannotSameName')); return }

  const targetSkills = form.toSource === 'user' ? skills.value.user : skills.value.project
  const existsInTarget = targetSkills.some(s => s.id === form.newSkillId)

  if (existsInTarget && !overwrite) { copyForm.value.existsInTarget = true; return }

  copying.value = true
  try {
    if (existsInTarget) {
      await window.electronAPI.deleteSkill({ source: form.toSource, skillId: form.newSkillId, projectPath: props.currentProject?.path })
    }
    const result = await window.electronAPI.copySkill({ fromSource: form.fromSource, skillId: form.skillId, toSource: form.toSource, newSkillId: form.newSkillId, projectPath: props.currentProject?.path })
    if (result.success) {
      message.success(t(form.fromSource === 'project' ? 'rightPanel.skills.promoteSuccess' : 'rightPanel.skills.copySuccess'))
      copyModalVisible.value = false
      await loadSkills()
    } else { message.error(result.error || t('rightPanel.skills.copyFailed')) }
  } catch (err) { message.error(`${t('rightPanel.skills.copyFailed')}: ${err.message}`) }
  finally { copying.value = false }
}

// Export computed
const exportableSkills = computed(() => {
  const source = exportForm.value.source
  return source === 'user' ? skills.value.user : skills.value.project
})

const exportSkillOptions = computed(() =>
  exportableSkills.value.map(s => ({ label: `${s.id} (${s.name})`, value: s.id }))
)

const canExport = computed(() => {
  if (exportForm.value.scope === 'single') return !!exportForm.value.skillId
  return exportForm.value.skillIds.length > 0
})

// Import Methods
const showImportModal = () => {
  importStep.value = 1
  importForm.value = { sourcePath: '', sourceType: '', targetSource: 'user', selectedSkillIds: [], conflictActions: {}, renamedSkills: {} }
  importValidation.value = null
  importConflicts.value = []
  importModalVisible.value = true
}

const goToConflictStep = async () => {
  checkingConflicts.value = true
  try {
    const result = await window.electronAPI.checkSkillConflicts({
      skillIds: [...importForm.value.selectedSkillIds],
      targetSource: importForm.value.targetSource,
      projectPath: props.currentProject?.path
    })
    importConflicts.value = result.conflicts || []
    shadowedByGlobal.value = result.shadowedByGlobal || []
    willShadowProject.value = result.willShadowProject || []
    // 初始化冲突处理选项
    importForm.value.conflictActions = {}
    importForm.value.renamedSkills = {}
    for (const skillId of importConflicts.value) {
      importForm.value.conflictActions[skillId] = 'skip'  // 默认跳过
      importForm.value.renamedSkills[skillId] = ''
    }
    importStep.value = 4
  } catch (err) {
    message.error(err.message)
  } finally {
    checkingConflicts.value = false
  }
}

const selectImportSource = async (type) => {
  try {
    let sourcePath
    if (type === 'folder') {
      sourcePath = await window.electronAPI.selectFolder()
    } else {
      // ZIP 文件选择
      sourcePath = await window.electronAPI.selectFile({
        title: t('rightPanel.skills.importFromZip'),
        filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
      })
    }
    if (!sourcePath) return

    importForm.value.sourcePath = sourcePath
    importForm.value.sourceType = type

    // 开始校验
    importStep.value = 2
    importValidating.value = true
    try {
      const validation = await window.electronAPI.validateSkillImport(importForm.value.sourcePath)
      importValidation.value = validation
      if (validation.valid && validation.skills) {
        importForm.value.selectedSkillIds = validation.skills.map(s => s.skillId)
      }
    } catch (err) {
      importValidation.value = { valid: false, errors: [err.message] }
    } finally {
      importValidating.value = false
    }
  } catch (err) {
    message.error(err.message)
  }
}

const handleImport = async () => {
  if (!importForm.value.selectedSkillIds.length) {
    message.warning(t('rightPanel.skills.noSkillsSelected'))
    return
  }
  importing.value = true
  try {
    // 构建最终要导入的 skill 列表，排除选择跳过的
    const finalSkillIds = []
    const renamedSkills = {}
    const overwriteSkillIds = []
    let skippedCount = 0

    for (const skillId of importForm.value.selectedSkillIds) {
      const action = importForm.value.conflictActions[skillId]
      if (action === 'skip') {
        // 跳过此 skill
        skippedCount++
        continue
      } else if (action === 'rename') {
        // 重命名：记录新名称
        const newId = importForm.value.renamedSkills[skillId]
        if (newId) {
          finalSkillIds.push(skillId)
          renamedSkills[skillId] = newId
        }
      } else if (action === 'overwrite') {
        // 覆盖：正常导入
        finalSkillIds.push(skillId)
        overwriteSkillIds.push(skillId)
      } else {
        // 无冲突，正常导入
        finalSkillIds.push(skillId)
      }
    }

    // 如果全部被跳过，显示提示并关闭
    if (finalSkillIds.length === 0) {
      if (skippedCount > 0) {
        message.info(t('rightPanel.skills.allSkipped', { count: skippedCount }))
        importModalVisible.value = false
      } else {
        message.warning(t('rightPanel.skills.noSkillsSelected'))
      }
      importing.value = false
      return
    }

    const result = await window.electronAPI.importSkills({
      sourcePath: importForm.value.sourcePath,
      targetSource: importForm.value.targetSource,
      projectPath: props.currentProject?.path,
      selectedSkillIds: [...finalSkillIds],
      renamedSkills,
      overwriteSkillIds: [...overwriteSkillIds]
    })
    if (result.success) {
      const msg = skippedCount > 0
        ? t('rightPanel.skills.importSuccessWithSkipped', { count: result.imported || finalSkillIds.length, skipped: skippedCount })
        : t('rightPanel.skills.importSuccess', { count: result.imported || finalSkillIds.length })
      message.success(msg)
      importModalVisible.value = false
      await loadSkills()
    } else {
      message.error(result.errors?.join(', ') || t('rightPanel.skills.importFailed'))
    }
  } catch (err) {
    message.error(`${t('rightPanel.skills.importFailed')}: ${err.message}`)
  } finally {
    importing.value = false
  }
}

// Export Methods
const showExportModal = () => {
  exportForm.value = { source: 'user', scope: 'single', skillId: '', skillIds: [], format: 'zip' }
  exportModalVisible.value = true
}

const handleExport = async () => {
  // 选择导出位置
  const exportPath = await window.electronAPI.selectFolder()
  if (!exportPath) return

  exporting.value = true

  try {
    let exportResult
    if (exportForm.value.scope === 'single') {
      exportResult = await window.electronAPI.exportSkill({
        source: exportForm.value.source,
        skillId: exportForm.value.skillId,
        projectPath: props.currentProject?.path,
        exportPath,
        format: exportForm.value.format
      })
    } else {
      exportResult = await window.electronAPI.exportSkillsBatch({
        source: exportForm.value.source,
        skillIds: [...exportForm.value.skillIds],  // 转换为普通数组
        projectPath: props.currentProject?.path,
        exportPath,
        format: exportForm.value.format
      })
    }

    if (exportResult.success) {
      message.success(`${t('rightPanel.skills.exportSuccess')}: ${exportResult.path}`, { duration: 5000 })
      exportModalVisible.value = false
    } else {
      message.error(exportResult.error || t('rightPanel.skills.exportFailed'), { duration: 5000 })
    }
  } catch (err) {
    message.error(`${t('rightPanel.skills.exportFailed')}: ${err.message}`)
  } finally {
    exporting.value = false
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

watch(() => props.currentProject, loadSkills)
onMounted(loadSkills)

// ========== SkillGroup 子组件 (内联) ==========
const SkillGroup = (props, { emit }) => {
  const { groupKey, skills, title, icon, editable, expanded, emptyText, copyIcon, copyTitle } = props
  const onCopy = props.copy

  return h('div', { class: 'skill-group' }, [
    h('div', { class: 'group-header clickable' }, [
      h('span', { class: 'group-toggle', onClick: () => emit('toggle') }, expanded ? '▼' : '▶'),
      h('span', { class: 'group-icon', onClick: () => emit('toggle') }, icon),
      h('span', { class: 'group-name', onClick: () => emit('toggle') }, title),
      h('span', { class: 'group-count', onClick: () => emit('toggle') }, `(${skills.length})`),
      editable && h('span', { class: 'group-badge editable' }, t('rightPanel.skills.editable')),
      editable && h('button', { class: 'group-add-btn', title: t('rightPanel.skills.create' + (groupKey === 'project' ? 'Project' : 'User')), onClick: (e) => { e.stopPropagation(); emit('create') } }, '＋'),
      editable && h('button', { class: 'group-add-btn', title: t('rightPanel.skills.openFolder'), onClick: (e) => { e.stopPropagation(); emit('open-folder') } }, '📂')
    ]),
    expanded && h('div', { class: 'group-items' }, [
      skills.length > 0
        ? skills.map(skill => h('div', { key: `${groupKey}-${skill.id}`, class: 'skill-item', onClick: () => emit('click-skill', skill) }, [
            h('div', { class: 'skill-row' }, [
              h('span', { class: 'skill-name' }, `/${skill.fullName}`),
              h('span', { class: 'skill-actions' }, [
                onCopy && h('button', { class: `skill-action-btn ${groupKey === 'project' ? 'promote' : 'copy'}`, title: copyTitle, onClick: (e) => { e.stopPropagation(); onCopy(skill) } }, copyIcon),
                h('button', { class: 'skill-action-btn', title: t('rightPanel.skills.edit'), onClick: (e) => { e.stopPropagation(); emit('edit', skill) } }, '✏️'),
                h('button', { class: 'skill-action-btn delete', title: t('rightPanel.skills.delete'), onClick: (e) => { e.stopPropagation(); emit('delete', skill) } }, '🗑️')
              ])
            ]),
            h('span', { class: 'skill-desc' }, skill.description)
          ]))
        : h('div', { class: 'empty-hint-inline' }, emptyText)
    ])
  ])
}
SkillGroup.props = ['groupKey', 'skills', 'title', 'icon', 'editable', 'expanded', 'emptyText', 'copy', 'copyIcon', 'copyTitle']
SkillGroup.emits = ['toggle', 'create', 'open-folder', 'click-skill', 'edit', 'delete']
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
:deep(.empty-hint-inline) { padding: 12px; text-align: center; font-size: 12px; color: var(--text-color-muted); opacity: 0.7; }

.skills-list { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }
:deep(.skill-group) { display: flex; flex-direction: column; }
:deep(.group-header) { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); border-bottom: 1px solid var(--border-color); }
:deep(.group-header.clickable) { cursor: pointer; transition: background 0.15s ease; }
:deep(.group-header.clickable:hover) { background: var(--hover-bg); }
:deep(.group-toggle) { font-size: 10px; width: 12px; }
:deep(.group-icon) { font-size: 14px; }
:deep(.group-name) { flex: 1; }
:deep(.group-count) { font-weight: 400; opacity: 0.7; }
:deep(.group-badge) { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
:deep(.group-badge.editable) { background: rgba(82, 196, 26, 0.15); color: #52c41a; }
:deep(.group-badge.readonly) { background: rgba(114, 132, 154, 0.15); color: var(--text-color-muted); }
:deep(.group-add-btn) { width: 20px; height: 20px; border-radius: 4px; background: transparent; border: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--text-color-muted); transition: all 0.15s ease; margin-left: 4px; }
:deep(.group-add-btn:hover) { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
:deep(.group-items) { padding: 4px 0; }

.skill-category { margin-bottom: 4px; }
.category-header { display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 12px; font-weight: 600; color: var(--text-color-muted); cursor: pointer; transition: background 0.15s ease; }
.category-header:hover { background: var(--hover-bg); }
.category-icon { font-size: 10px; width: 12px; }
.category-count { font-weight: 400; opacity: 0.7; }
.category-items { padding: 0 8px; }

:deep(.skill-item) { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; margin: 2px 0; border-radius: 4px; cursor: pointer; transition: background 0.15s ease; }
:deep(.skill-item:hover) { background: var(--hover-bg); }
:deep(.skill-row) { display: flex; align-items: center; gap: 8px; }
:deep(.skill-name) { font-size: 13px; font-weight: 500; color: var(--primary-color); flex: 1; }
:deep(.skill-actions) { display: none; gap: 4px; }
:deep(.skill-item:hover .skill-actions) { display: flex; }
:deep(.skill-action-btn) { width: 22px; height: 22px; border-radius: 4px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; opacity: 0.6; transition: all 0.15s ease; }
:deep(.skill-action-btn:hover) { opacity: 1; background: var(--hover-bg); }
:deep(.skill-action-btn.delete:hover) { background: rgba(231, 76, 60, 0.15); }
:deep(.skill-action-btn.promote:hover) { background: rgba(82, 196, 26, 0.15); }
:deep(.skill-action-btn.copy:hover) { background: rgba(24, 144, 255, 0.15); }
:deep(.skill-desc) { font-size: 11px; color: var(--text-color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.delete-warning { color: #e74c3c; font-size: 12px; margin-top: 8px; }
.copy-modal-content { padding: 4px 0; }
.copy-note { background: rgba(24, 144, 255, 0.1); border: 1px solid rgba(24, 144, 255, 0.2); border-radius: 4px; padding: 10px 12px; margin-bottom: 16px; font-size: 13px; color: var(--text-color); }
.copy-hint { font-size: 12px; color: var(--text-color-muted); margin-top: 4px; }
.overwrite-warning { background: rgba(250, 173, 20, 0.15); border: 1px solid rgba(250, 173, 20, 0.3); border-radius: 4px; padding: 10px 12px; margin-top: 12px; font-size: 13px; color: #d48806; }

/* Toolbar */
.toolbar-row { display: flex; gap: 8px; align-items: center; }

/* Import/Export Modal */
.import-modal-content, .export-modal-content { padding: 4px 0; }
.import-step { padding: 8px 0; }
.step-title { font-size: 14px; font-weight: 600; color: var(--text-color); margin-bottom: 12px; }
.source-buttons { display: flex; gap: 12px; margin-bottom: 12px; }
.source-buttons .n-button { flex: 1; height: 60px; font-size: 14px; }
.selected-source { font-size: 12px; color: var(--text-color-muted); background: var(--hover-bg); padding: 8px 12px; border-radius: 4px; word-break: break-all; }
.validating { display: flex; align-items: center; gap: 8px; padding: 20px; justify-content: center; color: var(--text-color-muted); }
.validation-errors, .validation-warnings, .validation-skills { margin-bottom: 12px; }
.validation-label { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.validation-label.error { color: #e74c3c; }
.validation-label.warning { color: #faad14; }
.validation-label.success { color: #52c41a; }
.validation-errors ul, .validation-warnings ul { margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-color-muted); }
.skill-checkboxes { max-height: 200px; overflow-y: auto; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; }
.skill-checkbox-item { padding: 4px 0; }
.checkbox-skill-name { font-weight: 500; }
.checkbox-skill-label { color: var(--text-color-muted); margin-left: 4px; }
.checkbox-skill-warn { color: #faad14; margin-left: 4px; }
.target-radio-group { display: flex; flex-direction: column; gap: 8px; }

/* Export empty hint */
.export-empty-hint { background: rgba(250, 173, 20, 0.15); border: 1px solid rgba(250, 173, 20, 0.3); border-radius: 4px; padding: 12px 16px; margin-bottom: 12px; font-size: 13px; color: #d48806; text-align: center; }

/* Conflict handling */
.conflict-list { display: flex; flex-direction: column; gap: 12px; }
.conflict-hint { font-size: 12px; color: var(--text-color-muted); margin-bottom: 8px; }
.conflict-item { background: rgba(250, 173, 20, 0.1); border: 1px solid rgba(250, 173, 20, 0.2); border-radius: 6px; padding: 12px; }
.conflict-name { font-size: 13px; font-weight: 600; color: #d48806; display: block; margin-bottom: 8px; }
.conflict-actions { display: flex; flex-direction: column; gap: 6px; }
.conflict-actions .n-radio-group { display: flex; gap: 16px; }
.no-conflicts { padding: 20px; text-align: center; }

/* Cross-scope warnings */
.cross-scope-warning { border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.cross-scope-warning.shadowed { background: rgba(231, 76, 60, 0.1); border: 1px solid rgba(231, 76, 60, 0.3); }
.cross-scope-warning.will-shadow { background: rgba(250, 173, 20, 0.1); border: 1px solid rgba(250, 173, 20, 0.3); }
.cross-scope-warning .warning-title { font-size: 13px; font-weight: 600; margin: 0 0 4px 0; }
.cross-scope-warning.shadowed .warning-title { color: #e74c3c; }
.cross-scope-warning.will-shadow .warning-title { color: #d48806; }
.cross-scope-warning .warning-desc { font-size: 12px; color: var(--text-color-muted); margin: 0 0 8px 0; }
.cross-scope-warning .warning-list { margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-color); }
</style>

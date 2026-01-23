<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.skills.importTitle')" style="width: 600px; max-width: 90vw;">
    <div class="import-modal-content">
      <!-- Step 1: 选择源 -->
      <div v-if="step === 1" class="import-step">
        <p class="step-title">{{ t('rightPanel.skills.importStep1') }}</p>
        <div class="source-buttons">
          <n-button size="large" @click="selectSource('folder')">
            {{ t('rightPanel.skills.importFromFolder') }}
          </n-button>
          <n-button size="large" @click="selectSource('zip')">
            {{ t('rightPanel.skills.importFromZip') }}
          </n-button>
        </div>
        <p v-if="form.sourcePath" class="selected-source">
          {{ t('rightPanel.skills.selectedSource') }}: {{ form.sourcePath }}
        </p>
      </div>

      <!-- Step 2: 校验结果 -->
      <div v-if="step === 2" class="import-step">
        <p class="step-title">{{ t('rightPanel.skills.importStep2') }}</p>
        <div v-if="validating" class="validating">
          <span class="loading-icon">⏳</span> {{ t('rightPanel.skills.validating') }}
        </div>
        <div v-else-if="validation">
          <div v-if="validation.errors?.length" class="validation-errors">
            <p class="validation-label error">{{ t('rightPanel.skills.validationErrors') }}:</p>
            <ul><li v-for="(err, i) in validation.errors" :key="i">{{ err }}</li></ul>
          </div>
          <div v-if="validation.warnings?.length" class="validation-warnings">
            <p class="validation-label warning">{{ t('rightPanel.skills.validationWarnings') }}:</p>
            <ul><li v-for="(warn, i) in validation.warnings" :key="i">{{ warn }}</li></ul>
          </div>
          <div v-if="validation.valid && validation.skills?.length" class="validation-skills">
            <p class="validation-label success">{{ t('rightPanel.skills.foundSkills', { count: validation.skills.length }) }}:</p>
            <div class="skill-checkboxes">
              <n-checkbox-group v-model:value="form.selectedSkillIds">
                <div v-for="skill in validation.skills" :key="skill.skillId" class="skill-checkbox-item">
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
      <div v-if="step === 3" class="import-step">
        <p class="step-title">{{ t('rightPanel.skills.importStep3') }}</p>
        <n-radio-group v-model:value="form.targetSource" class="target-radio-group">
          <n-radio value="user">{{ t('rightPanel.skills.importToUser') }}</n-radio>
          <n-radio v-if="currentProject" value="project">{{ t('rightPanel.skills.importToProject') }}</n-radio>
        </n-radio-group>
      </div>

      <!-- Step 4: 冲突处理 -->
      <div v-if="step === 4" class="import-step">
        <p class="step-title">{{ t('rightPanel.skills.conflictStep') }}</p>

        <!-- 跨作用域警告：导入到项目时，全局有同名 -->
        <div v-if="shadowedByGlobal.length > 0" class="cross-scope-warning shadowed">
          <p class="warning-title">{{ t('rightPanel.skills.shadowedByGlobalTitle') }}</p>
          <p class="warning-desc">{{ t('rightPanel.skills.shadowedByGlobalDesc') }}</p>
          <ul class="warning-list">
            <li v-for="skillId in shadowedByGlobal" :key="'shadowed-' + skillId">{{ skillId }}</li>
          </ul>
        </div>

        <!-- 跨作用域警告：导入到全局时，项目有同名 -->
        <div v-if="willShadowProject.length > 0" class="cross-scope-warning will-shadow">
          <p class="warning-title">{{ t('rightPanel.skills.willShadowProjectTitle') }}</p>
          <p class="warning-desc">{{ t('rightPanel.skills.willShadowProjectDesc') }}</p>
          <ul class="warning-list">
            <li v-for="skillId in willShadowProject" :key="'shadow-' + skillId">{{ skillId }}</li>
          </ul>
        </div>

        <div v-if="conflicts.length > 0" class="conflict-list">
          <p class="conflict-hint">{{ t('rightPanel.skills.conflictHint') }}</p>
          <div v-for="skillId in conflicts" :key="skillId" class="conflict-item">
            <span class="conflict-name">{{ skillId }}</span>
            <div class="conflict-actions">
              <n-radio-group v-model:value="form.conflictActions[skillId]" size="small">
                <n-radio value="skip">{{ t('rightPanel.skills.conflictSkip') }}</n-radio>
                <n-radio value="rename">{{ t('rightPanel.skills.conflictRename') }}</n-radio>
                <n-radio value="overwrite">{{ t('rightPanel.skills.conflictOverwrite') }}</n-radio>
              </n-radio-group>
              <n-input
                v-if="form.conflictActions[skillId] === 'rename'"
                v-model:value="form.renamedSkills[skillId]"
                :placeholder="t('rightPanel.skills.newSkillIdPlaceholder')"
                size="small"
                style="width: 180px; margin-top: 4px;"
              />
            </div>
          </div>
        </div>
        <div v-else-if="shadowedByGlobal.length === 0 && willShadowProject.length === 0" class="no-conflicts">
          <p class="validation-label success">{{ t('rightPanel.skills.noConflicts') }}</p>
        </div>
      </div>
    </div>
    <template #footer>
      <div style="display: flex; justify-content: space-between;">
        <n-button v-if="step > 1" @click="step--">{{ t('common.previous') }}</n-button>
        <span v-else></span>
        <div style="display: flex; gap: 12px;">
          <n-button @click="visible = false">{{ t('common.cancel') }}</n-button>
          <n-button v-if="step === 2 && validation?.valid" type="primary" @click="step = 3">
            {{ t('common.next') }}
          </n-button>
          <n-button v-if="step === 3" type="primary" @click="goToConflictStep" :loading="checkingConflicts">
            {{ t('common.next') }}
          </n-button>
          <n-button v-if="step === 4" type="primary" @click="handleImport" :loading="importing" :disabled="!canImport">
            {{ t('rightPanel.skills.confirmImport') }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NButton, NRadio, NRadioGroup, NCheckbox, NCheckboxGroup, NInput, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  currentProject: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'imported'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// State
const step = ref(1)
const form = ref({
  sourcePath: '',
  sourceType: '',
  targetSource: 'user',
  selectedSkillIds: [],
  conflictActions: {},
  renamedSkills: {}
})
const validating = ref(false)
const validation = ref(null)
const importing = ref(false)
const checkingConflicts = ref(false)
const conflicts = ref([])
const shadowedByGlobal = ref([])
const willShadowProject = ref([])

// 重置表单当打开
watch(visible, (val) => {
  if (val) {
    step.value = 1
    form.value = {
      sourcePath: '',
      sourceType: '',
      targetSource: 'user',
      selectedSkillIds: [],
      conflictActions: {},
      renamedSkills: {}
    }
    validation.value = null
    conflicts.value = []
    shadowedByGlobal.value = []
    willShadowProject.value = []
  }
})

const canImport = computed(() => {
  for (const skillId of conflicts.value) {
    const action = form.value.conflictActions[skillId]
    if (!action) return false
    if (action === 'rename') {
      const newId = form.value.renamedSkills[skillId]
      if (!newId || !/^[a-zA-Z0-9-]+$/.test(newId)) return false
    }
  }
  return true
})

const selectSource = async (type) => {
  try {
    let sourcePath
    if (type === 'folder') {
      sourcePath = await window.electronAPI.selectFolder()
    } else {
      sourcePath = await window.electronAPI.selectFile({
        title: t('rightPanel.skills.importFromZip'),
        filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
      })
    }
    if (!sourcePath) return

    form.value.sourcePath = sourcePath
    form.value.sourceType = type

    // 开始校验
    step.value = 2
    validating.value = true
    try {
      const result = await window.electronAPI.validateSkillImport(sourcePath)
      validation.value = result
      if (result.valid && result.skills) {
        form.value.selectedSkillIds = result.skills.map(s => s.skillId)
      }
    } catch (err) {
      validation.value = { valid: false, errors: [err.message] }
    } finally {
      validating.value = false
    }
  } catch (err) {
    message.error(err.message)
  }
}

const goToConflictStep = async () => {
  checkingConflicts.value = true
  try {
    const result = await window.electronAPI.checkSkillConflicts({
      skillIds: [...form.value.selectedSkillIds],
      targetSource: form.value.targetSource,
      projectPath: props.currentProject?.path
    })
    conflicts.value = result.conflicts || []
    shadowedByGlobal.value = result.shadowedByGlobal || []
    willShadowProject.value = result.willShadowProject || []

    // 初始化冲突处理选项
    form.value.conflictActions = {}
    form.value.renamedSkills = {}
    for (const skillId of conflicts.value) {
      form.value.conflictActions[skillId] = 'skip'
      form.value.renamedSkills[skillId] = ''
    }
    step.value = 4
  } catch (err) {
    message.error(err.message)
  } finally {
    checkingConflicts.value = false
  }
}

const handleImport = async () => {
  if (!form.value.selectedSkillIds.length) {
    message.warning(t('rightPanel.skills.noSkillsSelected'))
    return
  }

  importing.value = true
  try {
    const finalSkillIds = []
    const renamedSkills = {}
    const overwriteSkillIds = []
    let skippedCount = 0

    for (const skillId of form.value.selectedSkillIds) {
      const action = form.value.conflictActions[skillId]
      if (action === 'skip') {
        skippedCount++
        continue
      } else if (action === 'rename') {
        const newId = form.value.renamedSkills[skillId]
        if (newId) {
          finalSkillIds.push(skillId)
          renamedSkills[skillId] = newId
        }
      } else if (action === 'overwrite') {
        finalSkillIds.push(skillId)
        overwriteSkillIds.push(skillId)
      } else {
        finalSkillIds.push(skillId)
      }
    }

    if (finalSkillIds.length === 0) {
      if (skippedCount > 0) {
        message.info(t('rightPanel.skills.allSkipped', { count: skippedCount }))
        visible.value = false
      } else {
        message.warning(t('rightPanel.skills.noSkillsSelected'))
      }
      importing.value = false
      return
    }

    const result = await window.electronAPI.importSkills({
      sourcePath: form.value.sourcePath,
      targetSource: form.value.targetSource,
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
      visible.value = false
      emit('imported')
    } else {
      message.error(result.errors?.join(', ') || t('rightPanel.skills.importFailed'))
    }
  } catch (err) {
    message.error(`${t('rightPanel.skills.importFailed')}: ${err.message}`)
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.import-modal-content {
  padding: 4px 0;
}

.import-step {
  padding: 8px 0;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 12px;
}

.source-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.source-buttons .n-button {
  flex: 1;
  height: 60px;
  font-size: 14px;
}

.selected-source {
  font-size: 12px;
  color: var(--text-color-muted);
  background: var(--hover-bg);
  padding: 8px 12px;
  border-radius: 4px;
  word-break: break-all;
}

.validating {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px;
  justify-content: center;
  color: var(--text-color-muted);
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.validation-errors,
.validation-warnings,
.validation-skills {
  margin-bottom: 12px;
}

.validation-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.validation-label.error { color: #e74c3c; }
.validation-label.warning { color: #faad14; }
.validation-label.success { color: #52c41a; }

.validation-errors ul,
.validation-warnings ul {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: var(--text-color-muted);
}

.skill-checkboxes {
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.skill-checkbox-item {
  padding: 4px 0;
}

.checkbox-skill-name {
  font-weight: 500;
}

.checkbox-skill-label {
  color: var(--text-color-muted);
  margin-left: 4px;
}

.checkbox-skill-warn {
  color: #faad14;
  margin-left: 4px;
}

.target-radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Conflict handling */
.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.conflict-hint {
  font-size: 12px;
  color: var(--text-color-muted);
  margin-bottom: 8px;
}

.conflict-item {
  background: rgba(250, 173, 20, 0.1);
  border: 1px solid rgba(250, 173, 20, 0.2);
  border-radius: 6px;
  padding: 12px;
}

.conflict-name {
  font-size: 13px;
  font-weight: 600;
  color: #d48806;
  display: block;
  margin-bottom: 8px;
}

.conflict-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conflict-actions .n-radio-group {
  display: flex;
  gap: 16px;
}

.no-conflicts {
  padding: 20px;
  text-align: center;
}

/* Cross-scope warnings */
.cross-scope-warning {
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.cross-scope-warning.shadowed {
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.cross-scope-warning.will-shadow {
  background: rgba(250, 173, 20, 0.1);
  border: 1px solid rgba(250, 173, 20, 0.3);
}

.cross-scope-warning .warning-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.cross-scope-warning.shadowed .warning-title { color: #e74c3c; }
.cross-scope-warning.will-shadow .warning-title { color: #d48806; }

.cross-scope-warning .warning-desc {
  font-size: 12px;
  color: var(--text-color-muted);
  margin: 0 0 8px 0;
}

.cross-scope-warning .warning-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: var(--text-color);
}
</style>

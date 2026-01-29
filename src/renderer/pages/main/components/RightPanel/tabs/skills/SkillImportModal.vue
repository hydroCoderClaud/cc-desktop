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

      <!-- Step 2: 校验结果 + 选择目标 -->
      <div v-if="step === 2" class="import-step">
        <p class="step-title">{{ t('rightPanel.skills.importStep2') }}</p>
        <div v-if="validating" class="validating">
          <Icon name="clock" :size="16" class="loading-icon" /> {{ t('rightPanel.skills.validating') }}
        </div>
        <div v-else-if="validation">
          <div v-if="validation.errors?.length" class="validation-errors">
            <p class="validation-label error">{{ t('rightPanel.skills.validationErrors') }}:</p>
            <ul><li v-for="(err, i) in validation.errors" :key="i">{{ err }}</li></ul>
          </div>
          <div v-if="validation.valid && validation.skills?.length" class="validation-skills">
            <p class="validation-label success">{{ t('rightPanel.skills.foundSkills', { count: validation.skills.length }) }}:</p>
            <div class="skill-list-preview">
              <div v-for="skill in validation.skills" :key="skill.skillId" class="skill-preview-item">
                <span class="skill-id">{{ skill.skillId }}</span>
                <span v-if="skill.name && skill.name !== skill.skillId" class="skill-name">({{ skill.name }})</span>
              </div>
            </div>

            <!-- 选择目标 -->
            <div class="target-section">
              <p class="section-label">{{ t('rightPanel.skills.importStep3') }}</p>
              <n-radio-group v-model:value="form.targetSource" class="target-radio-group">
                <n-radio value="user">{{ t('rightPanel.skills.importToUser') }}</n-radio>
                <n-radio v-if="currentProject" value="project">{{ t('rightPanel.skills.importToProject') }}</n-radio>
              </n-radio-group>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: 导入结果 -->
      <div v-if="step === 3" class="import-step">
        <p class="step-title">{{ t('rightPanel.skills.importResult') }}</p>

        <!-- 成功导入 -->
        <div v-if="importResult.imported?.length" class="result-section success">
          <p class="result-label">{{ t('rightPanel.skills.importedCount', { count: importResult.imported.length }) }}</p>
          <ul class="result-list">
            <li v-for="skill in importResult.imported" :key="skill.skillId">
              {{ skill.skillId }}
              <span v-if="skill.name && skill.name !== skill.skillId" class="skill-name">({{ skill.name }})</span>
            </li>
          </ul>
        </div>

        <!-- 跳过的 -->
        <div v-if="importResult.skipped?.length" class="result-section warning">
          <p class="result-label">{{ t('rightPanel.skills.skippedCount', { count: importResult.skipped.length }) }}</p>
          <ul class="result-list">
            <li v-for="skill in importResult.skipped" :key="skill.skillId">
              <span class="skip-id">{{ skill.skillId }}</span>
              <span class="skip-reason">{{ skill.reason }}</span>
            </li>
          </ul>
        </div>

        <!-- 错误 -->
        <div v-if="importResult.errors?.length" class="result-section error">
          <p class="result-label">{{ t('rightPanel.skills.errorCount', { count: importResult.errors.length }) }}</p>
          <ul class="result-list">
            <li v-for="(err, i) in importResult.errors" :key="i">
              {{ err.skillId }}: {{ err.error }}
            </li>
          </ul>
        </div>

        <!-- 无结果时的兜底提示 -->
        <div v-if="!importResult.imported?.length && !importResult.skipped?.length && !importResult.errors?.length" class="result-section info">
          <p class="result-label">{{ t('rightPanel.skills.noImportResult') }}</p>
        </div>
      </div>
    </div>
    <template #footer>
      <div style="display: flex; justify-content: space-between;">
        <n-button v-if="step === 2" @click="step = 1">{{ t('common.previous') }}</n-button>
        <span v-else></span>
        <div style="display: flex; gap: 12px;">
          <n-button @click="visible = false">{{ step === 3 ? t('common.close') : t('common.cancel') }}</n-button>
          <n-button v-if="step === 2 && validation?.valid" type="primary" @click="handleImport" :loading="importing">
            {{ t('rightPanel.skills.confirmImport') }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NButton, NRadio, NRadioGroup, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

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
  targetSource: 'user'
})
const validating = ref(false)
const validation = ref(null)
const importing = ref(false)
const importResult = ref({})

// 重置表单当打开
watch(visible, (val) => {
  if (val) {
    step.value = 1
    form.value = {
      sourcePath: '',
      sourceType: '',
      targetSource: 'user'
    }
    validation.value = null
    importResult.value = {}
  }
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
    } catch (err) {
      validation.value = { valid: false, errors: [err.message] }
    } finally {
      validating.value = false
    }
  } catch (err) {
    message.error(err.message)
  }
}

const handleImport = async () => {
  if (!validation.value?.skills?.length) {
    message.warning(t('rightPanel.skills.noSkillsSelected'))
    return
  }

  importing.value = true
  try {
    const result = await window.electronAPI.importSkills({
      sourcePath: form.value.sourcePath,
      targetSource: form.value.targetSource,
      projectPath: props.currentProject?.path,
      selectedSkillIds: validation.value.skills.map(s => s.skillId)
    })

    importResult.value = result
    step.value = 3

    if (result.imported?.length > 0) {
      emit('imported')
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
.validation-skills {
  margin-bottom: 12px;
}

.validation-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.validation-label.error { color: #e74c3c; }
.validation-label.success { color: #52c41a; }

.validation-errors ul {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: var(--text-color-muted);
}

.skill-list-preview {
  max-height: 150px;
  overflow-y: auto;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 16px;
}

.skill-preview-item {
  padding: 4px 0;
  font-size: 13px;
}

.skill-id {
  font-weight: 500;
  color: var(--text-color);
}

.skill-name {
  color: var(--text-color-muted);
  margin-left: 4px;
}

.target-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.target-radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Import Result */
.result-section {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 6px;
}

.result-section.success {
  background: rgba(82, 196, 26, 0.1);
  border: 1px solid rgba(82, 196, 26, 0.3);
}

.result-section.warning {
  background: rgba(250, 173, 20, 0.1);
  border: 1px solid rgba(250, 173, 20, 0.3);
}

.result-section.error {
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.result-section.info {
  background: rgba(114, 132, 154, 0.1);
  border: 1px solid rgba(114, 132, 154, 0.3);
}

.result-label {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.result-section.success .result-label { color: #52c41a; }
.result-section.warning .result-label { color: #d48806; }
.result-section.error .result-label { color: #e74c3c; }
.result-section.info .result-label { color: var(--text-color-muted); }

.result-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
}

.result-list li {
  padding: 2px 0;
}

.skip-id {
  font-weight: 500;
}

.skip-reason {
  color: var(--text-color-muted);
  margin-left: 8px;
}

.skip-reason::before {
  content: '— ';
}
</style>

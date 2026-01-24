<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.skills.exportTitle')" style="width: 500px; max-width: 90vw;">
    <div class="export-modal-content">
      <n-form label-placement="top">
        <n-form-item :label="t('rightPanel.skills.exportSource')">
          <n-radio-group v-model:value="form.source">
            <n-radio value="user">{{ t('rightPanel.skills.userSkills') }} ({{ skills.user.length }})</n-radio>
            <n-radio v-if="currentProject" value="project">{{ t('rightPanel.skills.projectSkills') }} ({{ skills.project.length }})</n-radio>
          </n-radio-group>
        </n-form-item>

        <!-- 无可导出技能提示 -->
        <div v-if="exportableSkills.length === 0" class="export-empty-hint">
          {{ t('rightPanel.skills.noExportableSkills') }}
        </div>

        <template v-else>
          <n-form-item :label="t('rightPanel.skills.exportScope')">
            <n-radio-group v-model:value="form.scope">
              <n-radio value="single">{{ t('rightPanel.skills.exportSingle') }}</n-radio>
              <n-radio value="batch">{{ t('rightPanel.skills.exportBatch') }}</n-radio>
            </n-radio-group>
          </n-form-item>

          <n-form-item v-if="form.scope === 'single'" :label="t('rightPanel.skills.selectSkill')">
            <n-select
              v-model:value="form.skillId"
              :options="skillOptions"
              :placeholder="t('rightPanel.skills.selectSkillPlaceholder')"
            />
          </n-form-item>

          <n-form-item v-else :label="t('rightPanel.skills.selectSkills')">
            <n-checkbox-group v-model:value="form.skillIds">
              <div v-for="skill in exportableSkills" :key="skill.id" class="skill-checkbox-item">
                <n-checkbox :value="skill.id">{{ skill.id }} ({{ skill.name }})</n-checkbox>
              </div>
            </n-checkbox-group>
          </n-form-item>

          <n-form-item :label="t('rightPanel.skills.exportFormat')">
            <n-radio-group v-model:value="form.format">
              <n-radio value="folder">{{ t('rightPanel.skills.exportAsFolder') }}</n-radio>
              <n-radio value="zip">{{ t('rightPanel.skills.exportAsZip') }}</n-radio>
            </n-radio-group>
          </n-form-item>
        </template>
      </n-form>
    </div>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" @click="handleExport" :loading="exporting" :disabled="!canExport">
          {{ t('rightPanel.skills.confirmExport') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NRadio, NRadioGroup, NSelect, NCheckbox, NCheckboxGroup, NButton, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  skills: { type: Object, default: () => ({ user: [], project: [] }) },
  currentProject: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'exported'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = ref({
  source: 'user',
  scope: 'single',
  skillId: '',
  skillIds: [],
  format: 'zip'
})

const exporting = ref(false)

// 重置表单当打开
watch(visible, (val) => {
  if (val) {
    // 默认选中第一个 skill
    const defaultSkillId = props.skills.user?.[0]?.id || ''
    form.value = {
      source: 'user',
      scope: 'single',
      skillId: defaultSkillId,
      skillIds: [],
      format: 'zip'
    }
  }
})

// 切换 source 时更新默认选中
watch(() => form.value.source, (source) => {
  const skills = source === 'user' ? props.skills.user : props.skills.project
  form.value.skillId = skills?.[0]?.id || ''
  form.value.skillIds = []
})

const exportableSkills = computed(() => {
  return form.value.source === 'user' ? props.skills.user : props.skills.project
})

const skillOptions = computed(() =>
  exportableSkills.value.map(s => ({ label: `${s.id} (${s.name})`, value: s.id }))
)

const canExport = computed(() => {
  if (exportableSkills.value.length === 0) return false
  if (form.value.scope === 'single') return !!form.value.skillId
  return form.value.skillIds.length > 0
})

const handleExport = async () => {
  // 选择导出位置
  const exportPath = await window.electronAPI.selectFolder()
  if (!exportPath) return

  exporting.value = true
  try {
    let result
    if (form.value.scope === 'single') {
      result = await window.electronAPI.exportSkill({
        source: form.value.source,
        skillId: form.value.skillId,
        projectPath: props.currentProject?.path,
        exportPath,
        format: form.value.format
      })
    } else {
      result = await window.electronAPI.exportSkillsBatch({
        source: form.value.source,
        skillIds: [...form.value.skillIds],
        projectPath: props.currentProject?.path,
        exportPath,
        format: form.value.format
      })
    }

    if (result.success) {
      message.success(`${t('rightPanel.skills.exportSuccess')}: ${result.path}`, { duration: 5000 })
      visible.value = false
      emit('exported')
    } else {
      message.error(result.error || t('rightPanel.skills.exportFailed'), { duration: 5000 })
    }
  } catch (err) {
    message.error(`${t('rightPanel.skills.exportFailed')}: ${err.message}`)
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.export-modal-content {
  padding: 4px 0;
}

.export-empty-hint {
  background: rgba(250, 173, 20, 0.15);
  border: 1px solid rgba(250, 173, 20, 0.3);
  border-radius: 4px;
  padding: 12px 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #d48806;
  text-align: center;
}

.skill-checkbox-item {
  padding: 4px 0;
}
</style>

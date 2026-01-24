<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.commands.exportTitle')" style="width: 500px; max-width: 90vw;">
    <div class="export-modal-content">
      <n-form label-placement="top">
        <n-form-item :label="t('rightPanel.commands.exportSource')">
          <n-radio-group v-model:value="form.source">
            <n-radio value="user">{{ t('rightPanel.commands.userCommands') }} ({{ commands.user.length }})</n-radio>
            <n-radio v-if="currentProject" value="project">{{ t('rightPanel.commands.projectCommands') }} ({{ commands.project.length }})</n-radio>
          </n-radio-group>
        </n-form-item>

        <!-- 无可导出命令提示 -->
        <div v-if="exportableCommands.length === 0" class="export-empty-hint">
          {{ t('rightPanel.commands.noExportableCommands') }}
        </div>

        <template v-else>
          <n-form-item :label="t('rightPanel.commands.exportScope')">
            <n-radio-group v-model:value="form.scope">
              <n-radio value="single">{{ t('rightPanel.commands.exportSingle') }}</n-radio>
              <n-radio value="batch">{{ t('rightPanel.commands.exportBatch') }}</n-radio>
            </n-radio-group>
          </n-form-item>

          <n-form-item v-if="form.scope === 'single'" :label="t('rightPanel.commands.selectCommand')">
            <n-select
              v-model:value="form.commandId"
              :options="commandOptions"
              :placeholder="t('rightPanel.commands.selectCommandPlaceholder')"
            />
          </n-form-item>

          <n-form-item v-else :label="t('rightPanel.commands.selectCommands')">
            <n-checkbox-group v-model:value="form.commandIds">
              <div v-for="cmd in exportableCommands" :key="cmd.id" class="command-checkbox-item">
                <n-checkbox :value="cmd.id">{{ cmd.id }} ({{ cmd.name }})</n-checkbox>
              </div>
            </n-checkbox-group>
          </n-form-item>

          <n-form-item v-if="form.scope === 'batch'" :label="t('rightPanel.commands.exportFormat')">
            <n-radio-group v-model:value="form.format">
              <n-radio value="folder">{{ t('rightPanel.commands.exportAsFolder') }}</n-radio>
              <n-radio value="zip">{{ t('rightPanel.commands.exportAsZip') }}</n-radio>
            </n-radio-group>
          </n-form-item>
        </template>
      </n-form>
    </div>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" @click="handleExport" :loading="exporting" :disabled="!canExport">
          {{ t('rightPanel.commands.confirmExport') }}
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
  commands: { type: Object, default: () => ({ user: [], project: [] }) },
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
  commandId: '',
  commandIds: [],
  format: 'zip'
})

const exporting = ref(false)

// 重置表单当打开
watch(visible, (val) => {
  if (val) {
    form.value = {
      source: 'user',
      scope: 'single',
      commandId: '',
      commandIds: [],
      format: 'zip'
    }
  }
})

const exportableCommands = computed(() => {
  return form.value.source === 'user' ? props.commands.user : props.commands.project
})

const commandOptions = computed(() =>
  exportableCommands.value.map(c => ({ label: `${c.id} (${c.name})`, value: c.id }))
)

const canExport = computed(() => {
  if (exportableCommands.value.length === 0) return false
  if (form.value.scope === 'single') return !!form.value.commandId
  return form.value.commandIds.length > 0
})

const handleExport = async () => {
  // 选择导出位置
  const exportPath = await window.electronAPI.selectFolder()
  if (!exportPath) return

  exporting.value = true
  try {
    let result
    if (form.value.scope === 'single') {
      result = await window.electronAPI.exportCommand({
        source: form.value.source,
        commandId: form.value.commandId,
        projectPath: props.currentProject?.path,
        exportPath
      })
    } else {
      result = await window.electronAPI.exportCommandsBatch({
        source: form.value.source,
        commandIds: [...form.value.commandIds],
        projectPath: props.currentProject?.path,
        exportPath,
        format: form.value.format
      })
    }

    if (result.success) {
      message.success(`${t('rightPanel.commands.exportSuccess')}: ${result.path}`, { duration: 5000 })
      visible.value = false
      emit('exported')
    } else {
      message.error(result.error || t('rightPanel.commands.exportFailed'), { duration: 5000 })
    }
  } catch (err) {
    message.error(`${t('rightPanel.commands.exportFailed')}: ${err.message}`)
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

.command-checkbox-item {
  padding: 4px 0;
}
</style>

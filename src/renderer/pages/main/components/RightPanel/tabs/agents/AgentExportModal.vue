<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.agents.exportTitle')" style="width: 500px; max-width: 90vw;">
    <div class="export-modal-content">
      <n-form label-placement="top">
        <n-form-item :label="t('rightPanel.agents.exportSource')">
          <n-radio-group v-model:value="form.source">
            <n-radio value="user">{{ t('rightPanel.agents.userAgents') }} ({{ agents.user.length }})</n-radio>
            <n-radio v-if="currentProject" value="project">{{ t('rightPanel.agents.projectAgents') }} ({{ agents.project.length }})</n-radio>
          </n-radio-group>
        </n-form-item>

        <!-- 无可导出代理提示 -->
        <div v-if="exportableAgents.length === 0" class="export-empty-hint">
          {{ t('rightPanel.agents.noExportableAgents') }}
        </div>

        <template v-else>
          <n-form-item :label="t('rightPanel.agents.exportScope')">
            <n-radio-group v-model:value="form.scope">
              <n-radio value="single">{{ t('rightPanel.agents.exportSingle') }}</n-radio>
              <n-radio value="batch">{{ t('rightPanel.agents.exportBatch') }}</n-radio>
            </n-radio-group>
          </n-form-item>

          <n-form-item v-if="form.scope === 'single'" :label="t('rightPanel.agents.selectAgent')">
            <n-select
              v-model:value="form.agentId"
              :options="agentOptions"
              :placeholder="t('rightPanel.agents.selectAgentPlaceholder')"
            />
          </n-form-item>

          <template v-else>
            <n-form-item :label="t('rightPanel.agents.selectAgents')">
              <n-checkbox-group v-model:value="form.agentIds">
                <div v-for="agent in exportableAgents" :key="agent.id || agent.name" class="agent-checkbox-item">
                  <n-checkbox :value="agent.id || agent.name">
                    <span class="agent-color" :style="{ background: getAgentColor(agent.color) }"></span>
                    {{ agent.name }}
                  </n-checkbox>
                </div>
              </n-checkbox-group>
            </n-form-item>

            <n-form-item :label="t('rightPanel.agents.exportFormat')">
              <n-radio-group v-model:value="form.format">
                <n-radio value="folder">{{ t('rightPanel.agents.exportAsFolder') }}</n-radio>
                <n-radio value="zip">{{ t('rightPanel.agents.exportAsZip') }}</n-radio>
              </n-radio-group>
            </n-form-item>
          </template>
        </template>
      </n-form>
    </div>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" @click="handleExport" :loading="exporting" :disabled="!canExport">
          {{ t('rightPanel.agents.confirmExport') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NRadio, NRadioGroup, NSelect, NCheckbox, NCheckboxGroup, NButton, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { getAgentColor } from '@composables/constants'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  agents: { type: Object, default: () => ({ user: [], project: [] }) },
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
  agentId: '',
  agentIds: [],
  format: 'zip'
})

const exporting = ref(false)

// 重置表单当打开
watch(visible, (val) => {
  if (val) {
    // 默认选中第一个 agent
    const defaultAgentId = props.agents.user?.[0]?.id || props.agents.user?.[0]?.name || ''
    form.value = {
      source: 'user',
      scope: 'single',
      agentId: defaultAgentId,
      agentIds: [],
      format: 'zip'
    }
  }
})

// 切换 source 时更新默认选中
watch(() => form.value.source, (source) => {
  const agents = source === 'user' ? props.agents.user : props.agents.project
  form.value.agentId = agents?.[0]?.id || agents?.[0]?.name || ''
  form.value.agentIds = []
})

const exportableAgents = computed(() => {
  return form.value.source === 'user' ? props.agents.user : props.agents.project
})

const agentOptions = computed(() =>
  exportableAgents.value.map(a => ({ label: a.name, value: a.id || a.name }))
)

const canExport = computed(() => {
  if (exportableAgents.value.length === 0) return false
  if (form.value.scope === 'single') return !!form.value.agentId
  return form.value.agentIds.length > 0
})

const handleExport = async () => {
  // 选择导出位置
  const exportPath = await window.electronAPI.selectFolder()
  if (!exportPath) return

  exporting.value = true
  try {
    let result
    if (form.value.scope === 'single') {
      // 单个 Agent 直接导出为 .md 文件
      result = await window.electronAPI.exportAgent({
        source: form.value.source,
        agentId: form.value.agentId,
        projectPath: props.currentProject?.path,
        exportPath,
        format: 'md'  // 单个 Agent 固定为 .md 格式
      })
    } else {
      // 批量导出可选格式
      result = await window.electronAPI.exportAgentsBatch({
        source: form.value.source,
        agentIds: [...form.value.agentIds],
        projectPath: props.currentProject?.path,
        exportPath,
        format: form.value.format
      })
    }

    if (result.success) {
      message.success(`${t('rightPanel.agents.exportSuccess')}: ${result.path}`, { duration: 5000 })
      visible.value = false
      emit('exported')
    } else {
      message.error(result.error || t('rightPanel.agents.exportFailed'), { duration: 5000 })
    }
  } catch (err) {
    message.error(`${t('rightPanel.agents.exportFailed')}: ${err.message}`)
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

.agent-checkbox-item {
  padding: 4px 0;
  display: flex;
  align-items: center;
}

.agent-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
}
</style>

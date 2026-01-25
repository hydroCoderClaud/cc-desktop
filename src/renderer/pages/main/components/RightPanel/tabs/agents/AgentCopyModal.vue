<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.agents.copyAgent')" style="width: 450px; max-width: 90vw;">
    <div class="copy-modal-content">
      <p class="copy-note">{{ t('rightPanel.agents.copyFromNote', { agentId: form.agentId }) }}</p>
      <n-form :model="form" label-placement="top">
        <!-- 目标位置选择 -->
        <n-form-item :label="t('rightPanel.agents.copyTarget')">
          <n-radio-group v-model:value="form.toSource" name="target">
            <n-space>
              <n-radio value="user">
                {{ t('rightPanel.agents.userAgents') }}
              </n-radio>
              <n-radio value="project" :disabled="!projectPath">
                {{ t('rightPanel.agents.projectAgents') }}
                <span v-if="!projectPath" class="radio-hint">({{ t('rightPanel.agents.noProjectSelected') }})</span>
              </n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>

        <!-- 新 Agent ID -->
        <n-form-item :label="t('rightPanel.agents.newAgentId')">
          <n-input
            v-model:value="form.newAgentId"
            :placeholder="t('rightPanel.agents.newAgentIdPlaceholder')"
            @input="form.existsInTarget = false"
          />
        </n-form-item>
      </n-form>
      <p class="copy-hint">{{ t('rightPanel.agents.mustRenameHint') }}</p>
      <p v-if="form.existsInTarget" class="overwrite-warning">
        {{ t('rightPanel.agents.overwriteWarning', { agentId: form.newAgentId }) }}
      </p>
    </div>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('common.cancel') }}</n-button>
        <n-button
          v-if="form.existsInTarget"
          type="warning"
          @click="handleCopy(true)"
          :loading="copying"
        >{{ t('rightPanel.agents.confirmOverwrite') }}</n-button>
        <n-button
          v-else
          type="primary"
          @click="handleCopy(false)"
          :loading="copying"
        >{{ t('rightPanel.agents.confirmCopy') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NRadioGroup, NRadio, NSpace, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  agent: { type: Object, default: null },
  agents: { type: Object, default: () => ({ user: [], project: [] }) },
  projectPath: { type: String, default: null }
})

const emit = defineEmits(['update:modelValue', 'copied'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = ref({
  fromSource: '',
  toSource: '',
  agentId: '',
  newAgentId: '',
  existsInTarget: false
})

const copying = ref(false)

// 初始化表单函数
const initForm = (agent, projectPath) => {
  if (!agent) return

  const fromSource = agent.source
  // 默认目标：如果来自项目则默认到全局，如果来自全局则默认到项目（如果有项目的话）
  let defaultTarget = fromSource === 'project' ? 'user' : 'project'
  if (defaultTarget === 'project' && !projectPath) {
    defaultTarget = 'user'  // 没有项目时默认到全局
  }

  form.value = {
    fromSource,
    toSource: defaultTarget,
    agentId: agent.id || agent.name,
    newAgentId: '',
    existsInTarget: false
  }
}

// 监听模态框打开，初始化表单
watch(() => props.modelValue, (newVal) => {
  if (newVal && props.agent) {
    initForm(props.agent, props.projectPath)
  }
})

const handleCopy = async (overwrite = false) => {
  const { newAgentId, agentId, fromSource, toSource } = form.value

  // 验证
  if (!newAgentId) {
    message.warning(t('rightPanel.agents.agentIdRequired'))
    return
  }
  if (!/^[a-zA-Z0-9-]+$/.test(newAgentId)) {
    message.warning(t('rightPanel.agents.invalidAgentId'))
    return
  }
  if (newAgentId === agentId) {
    message.error(t('rightPanel.agents.cannotSameName'))
    return
  }

  // 检查目标是否已存在（只检查 ID，不检查 name）
  const targetAgents = toSource === 'user' ? props.agents.user : props.agents.project
  const existsInTarget = targetAgents.some(a => a.id === newAgentId)

  if (existsInTarget && !overwrite) {
    form.value.existsInTarget = true
    return
  }

  copying.value = true
  try {
    // 如果需要覆盖，先删除目标
    if (existsInTarget) {
      await window.electronAPI.deleteAgent({
        source: toSource,
        agentId: newAgentId,
        projectPath: props.projectPath
      })
    }

    const result = await window.electronAPI.copyAgent({
      fromSource,
      agentId,
      toSource,
      newAgentId,
      projectPath: props.projectPath,
      fromPath: props.agent?.agentPath  // 插件代理需要完整路径
    })

    if (result.success) {
      message.success(t('rightPanel.agents.copySuccess'))
      visible.value = false
      emit('copied')
    } else {
      message.error(result.error || t('rightPanel.agents.copyFailed'))
    }
  } catch (err) {
    message.error(`${t('rightPanel.agents.copyFailed')}: ${err.message}`)
  } finally {
    copying.value = false
  }
}
</script>

<style scoped>
.copy-modal-content {
  padding: 4px 0;
}

.copy-note {
  background: rgba(24, 144, 255, 0.1);
  border: 1px solid rgba(24, 144, 255, 0.2);
  border-radius: 4px;
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-color);
}

.copy-hint {
  font-size: 12px;
  color: var(--text-color-muted);
  margin-top: 4px;
}

.overwrite-warning {
  background: rgba(250, 173, 20, 0.15);
  border: 1px solid rgba(250, 173, 20, 0.3);
  border-radius: 4px;
  padding: 10px 12px;
  margin-top: 12px;
  font-size: 13px;
  color: #d48806;
}

.radio-hint {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-left: 4px;
}
</style>

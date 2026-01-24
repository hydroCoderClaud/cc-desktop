<template>
  <n-modal
    :show="show"
    preset="card"
    :title="isEdit ? t('rightPanel.hooks.editHook') : t('rightPanel.hooks.createHook')"
    style="width: 650px; max-height: 85vh;"
    :mask-closable="false"
    @update:show="$emit('update:show', $event)"
  >
    <!-- Tab 切换：表单 / JSON -->
    <n-tabs v-model:value="editMode" type="segment" size="small" style="margin-bottom: 16px;">
      <n-tab name="form">{{ t('rightPanel.hooks.formMode') }}</n-tab>
      <n-tab name="json">JSON</n-tab>
    </n-tabs>

    <n-scrollbar style="max-height: calc(85vh - 180px);">
      <!-- 表单模式 -->
      <n-form v-show="editMode === 'form'" ref="formRef" :model="formData" :rules="rules" label-placement="left" label-width="100">
        <!-- 事件选择 -->
        <n-form-item :label="t('rightPanel.hooks.event')" path="event">
          <n-select
            v-model:value="formData.event"
            :options="eventOptions"
            :disabled="isEdit"
            :placeholder="t('rightPanel.hooks.selectEvent')"
            filterable
          />
        </n-form-item>

        <!-- Matcher -->
        <n-form-item :label="t('rightPanel.hooks.matcher')" path="matcher">
          <n-input
            v-model:value="formData.matcher"
            :placeholder="t('rightPanel.hooks.matcherPlaceholder')"
          />
        </n-form-item>
        <div class="field-hint">{{ t('rightPanel.hooks.matcherHint') }}</div>

        <!-- Hook 类型 -->
        <n-form-item :label="t('rightPanel.hooks.type')" path="type">
          <n-radio-group v-model:value="formData.type">
            <n-radio-button value="command">Command</n-radio-button>
            <n-radio-button value="prompt">Prompt</n-radio-button>
            <n-radio-button value="agent">Agent</n-radio-button>
          </n-radio-group>
        </n-form-item>

        <!-- Command 类型字段 -->
        <template v-if="formData.type === 'command'">
          <n-form-item :label="t('rightPanel.hooks.command')" path="command">
            <n-input
              v-model:value="formData.command"
              type="textarea"
              :rows="3"
              :placeholder="t('rightPanel.hooks.commandPlaceholder')"
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.hooks.async')">
            <n-switch v-model:value="formData.async" />
            <span class="switch-label">{{ t('rightPanel.hooks.asyncHint') }}</span>
          </n-form-item>
        </template>

        <!-- Prompt/Agent 类型字段 -->
        <template v-if="formData.type === 'prompt' || formData.type === 'agent'">
          <n-form-item :label="t('rightPanel.hooks.prompt')" path="prompt">
            <n-input
              v-model:value="formData.prompt"
              type="textarea"
              :rows="4"
              :placeholder="t('rightPanel.hooks.promptPlaceholder')"
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.hooks.model')">
            <n-input
              v-model:value="formData.model"
              :placeholder="t('rightPanel.hooks.modelPlaceholder')"
            />
          </n-form-item>
        </template>

        <!-- 通用可选字段 -->
        <n-collapse>
          <n-collapse-item :title="t('rightPanel.hooks.advancedOptions')" name="advanced">
            <n-form-item :label="t('rightPanel.hooks.timeout')">
              <n-input-number
                v-model:value="formData.timeout"
                :min="1"
                :max="600"
                :placeholder="t('rightPanel.hooks.timeoutPlaceholder')"
                style="width: 150px;"
              />
              <span class="field-unit">{{ t('rightPanel.hooks.seconds') }}</span>
            </n-form-item>
          </n-collapse-item>
        </n-collapse>
      </n-form>

      <!-- JSON 模式 -->
      <div v-show="editMode === 'json'" class="json-editor">
        <div class="json-toolbar">
          <n-button size="tiny" @click="formatJson">{{ t('rightPanel.hooks.formatJson') }}</n-button>
          <span v-if="jsonError" class="json-error">{{ jsonError }}</span>
        </div>
        <n-input
          v-model:value="jsonText"
          type="textarea"
          :rows="18"
          :placeholder="t('rightPanel.hooks.jsonPlaceholder')"
          font-family="monospace"
          :status="jsonError ? 'error' : undefined"
        />
        <div class="json-hint">{{ t('rightPanel.hooks.jsonHint') }}</div>
      </div>
    </n-scrollbar>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  NModal, NForm, NFormItem, NInput, NInputNumber, NSelect,
  NRadioGroup, NRadioButton, NSwitch, NButton, NCollapse, NCollapseItem,
  NScrollbar, NTabs, NTab, useMessage
} from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  hook: Object,        // 编辑时传入
  scope: String,       // 'global' | 'project'
  projectPath: String,
  schema: Object       // { events, types, typeFields }
})

const emit = defineEmits(['update:show', 'saved'])

const isEdit = computed(() => !!props.hook)
const formRef = ref(null)
const saving = ref(false)

// 编辑模式：form 或 json
const editMode = ref('form')
const jsonText = ref('')
const jsonError = ref('')

// 表单数据
const formData = ref({
  event: '',
  matcher: '',
  type: 'command',
  command: '',
  prompt: '',
  model: '',
  timeout: null,
  async: false
})

// 事件选项
const eventOptions = computed(() => {
  return (props.schema?.events || []).map(e => ({ label: e, value: e }))
})

// 表单验证规则
const rules = {
  event: { required: true, message: t('rightPanel.hooks.eventRequired'), trigger: 'change' },
  command: {
    trigger: 'blur',
    validator: (rule, value) => {
      if (formData.value.type === 'command' && !value) {
        return new Error(t('rightPanel.hooks.commandRequired'))
      }
      return true
    }
  },
  prompt: {
    trigger: 'blur',
    validator: (rule, value) => {
      if ((formData.value.type === 'prompt' || formData.value.type === 'agent') && !value) {
        return new Error(t('rightPanel.hooks.promptRequired'))
      }
      return true
    }
  }
}

// 从 formData 构建 JSON 对象
const buildJsonFromForm = () => {
  const obj = {
    event: formData.value.event,
    matcher: formData.value.matcher || undefined,
    type: formData.value.type
  }

  if (formData.value.type === 'command') {
    obj.command = formData.value.command
    if (formData.value.async) obj.async = true
  } else {
    obj.prompt = formData.value.prompt
    if (formData.value.model) obj.model = formData.value.model
  }

  if (formData.value.timeout) obj.timeout = formData.value.timeout

  // 移除 undefined 字段
  Object.keys(obj).forEach(key => {
    if (obj[key] === undefined || obj[key] === '') delete obj[key]
  })

  return obj
}

// 从 JSON 解析到 formData
const parseJsonToForm = (json) => {
  formData.value = {
    event: json.event || '',
    matcher: json.matcher || '',
    type: json.type || 'command',
    command: json.command || '',
    prompt: json.prompt || '',
    model: json.model || '',
    timeout: json.timeout || null,
    async: json.async || false
  }
}

// 监听模式切换，同步数据
watch(editMode, (newMode, oldMode) => {
  if (newMode === 'json' && oldMode === 'form') {
    // 从表单切换到 JSON：将表单数据转为 JSON
    const obj = buildJsonFromForm()
    jsonText.value = JSON.stringify(obj, null, 2)
    jsonError.value = ''
  } else if (newMode === 'form' && oldMode === 'json') {
    // 从 JSON 切换到表单：解析 JSON 到表单
    try {
      const obj = JSON.parse(jsonText.value)
      parseJsonToForm(obj)
      jsonError.value = ''
    } catch (e) {
      jsonError.value = t('rightPanel.hooks.invalidJson')
      // 切换失败，保持在 JSON 模式
      editMode.value = 'json'
      message.warning(t('rightPanel.hooks.invalidJson'))
    }
  }
})

// 格式化 JSON
const formatJson = () => {
  try {
    const obj = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(obj, null, 2)
    jsonError.value = ''
  } catch (e) {
    jsonError.value = t('rightPanel.hooks.invalidJson')
  }
}

// 监听 hook 变化，填充表单
watch(() => props.hook, (hook) => {
  if (hook) {
    formData.value = {
      event: hook.event || '',
      matcher: hook.matcher || '',
      type: hook.type || 'command',
      command: hook.command || '',
      prompt: hook.prompt || '',
      model: hook.model || '',
      timeout: hook.timeout || null,
      async: hook.async || false
    }
    // 同步更新 JSON
    const obj = buildJsonFromForm()
    jsonText.value = JSON.stringify(obj, null, 2)
  } else {
    // 重置表单
    formData.value = {
      event: '',
      matcher: '',
      type: 'command',
      command: '',
      prompt: '',
      model: '',
      timeout: null,
      async: false
    }
    jsonText.value = '{}'
  }
  jsonError.value = ''
}, { immediate: true })

// 监听 show 变化，重置
watch(() => props.show, (show) => {
  if (show) {
    editMode.value = 'form'  // 默认表单模式
    jsonError.value = ''
    if (!props.hook) {
      // 新建时重置
      formData.value = {
        event: '',
        matcher: '',
        type: 'command',
        command: '',
        prompt: '',
        model: '',
        timeout: null,
        async: false
      }
      jsonText.value = '{}'
    }
  }
})

// 构建 hook 对象（用于保存）
const buildHookObject = () => {
  const hook = { type: formData.value.type }

  if (formData.value.type === 'command') {
    hook.command = formData.value.command
    if (formData.value.async) hook.async = true
  } else {
    hook.prompt = formData.value.prompt
    if (formData.value.model) hook.model = formData.value.model
  }

  // 通用可选字段
  if (formData.value.timeout) hook.timeout = formData.value.timeout

  return hook
}

// 保存
const handleSave = async () => {
  // 如果在 JSON 模式，先解析 JSON 到表单
  if (editMode.value === 'json') {
    try {
      const obj = JSON.parse(jsonText.value)
      parseJsonToForm(obj)
      jsonError.value = ''
    } catch (e) {
      jsonError.value = t('rightPanel.hooks.invalidJson')
      message.error(t('rightPanel.hooks.invalidJson'))
      return
    }
  }

  // 验证表单（仅在表单模式时）
  if (editMode.value === 'form') {
    try {
      await formRef.value?.validate()
    } catch {
      return
    }
  }

  // 基本验证
  if (!formData.value.event) {
    message.error(t('rightPanel.hooks.eventRequired'))
    return
  }
  if (formData.value.type === 'command' && !formData.value.command) {
    message.error(t('rightPanel.hooks.commandRequired'))
    return
  }
  if ((formData.value.type === 'prompt' || formData.value.type === 'agent') && !formData.value.prompt) {
    message.error(t('rightPanel.hooks.promptRequired'))
    return
  }

  saving.value = true
  try {
    const hookObj = buildHookObject()
    const params = {
      scope: props.scope,
      projectPath: props.projectPath,
      event: formData.value.event,
      matcher: formData.value.matcher,
      hook: hookObj
    }

    // 插件 scope 需要传递 filePath
    if (props.scope === 'plugin' && props.hook?.filePath) {
      params.pluginFilePath = props.hook.filePath
    }

    let result
    if (isEdit.value) {
      params.handlerIndex = props.hook.handlerIndex
      result = await window.electronAPI.updateHook(params)
    } else {
      result = await window.electronAPI.createHook(params)
    }

    if (result.success) {
      message.success(t('common.saved'))
      emit('saved')
      emit('update:show', false)
    } else {
      message.error(result.error || t('common.saveFailed'))
    }
  } catch (err) {
    console.error('Save hook failed:', err)
    message.error(t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.field-hint {
  font-size: 11px;
  color: var(--text-color-muted);
  margin: -12px 0 16px 100px;
}

.field-unit {
  margin-left: 8px;
  color: var(--text-color-muted);
}

.switch-label {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-color-muted);
}

/* JSON 编辑器 */
.json-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.json-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.json-error {
  font-size: 12px;
  color: #ff4d4f;
}

.json-hint {
  font-size: 11px;
  color: var(--text-color-muted);
}
</style>

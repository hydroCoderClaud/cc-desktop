<template>
  <n-modal
    :show="show"
    preset="card"
    :title="modalTitle"
    style="width: 600px; max-height: 85vh;"
    :mask-closable="false"
    @update:show="$emit('update:show', $event)"
  >
    <n-scrollbar style="max-height: calc(85vh - 160px);">
      <div class="json-editor">
        <div class="json-toolbar" v-if="!readonly">
          <n-button size="tiny" @click="formatJson">{{ t('rightPanel.mcp.formatJson') }}</n-button>
          <span v-if="jsonError" class="json-error">{{ jsonError }}</span>
        </div>
        <n-input
          v-model:value="jsonText"
          type="textarea"
          :rows="16"
          font-family="monospace"
          :placeholder="jsonPlaceholder"
          :status="jsonError ? 'error' : undefined"
          :readonly="readonly"
        />
        <div class="json-hint" v-if="!readonly">{{ t('rightPanel.mcp.jsonHint') }}</div>
      </div>
    </n-scrollbar>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ readonly ? t('common.close') : t('common.cancel') }}</n-button>
        <n-button v-if="!readonly" type="primary" :loading="saving" @click="handleSave">
          {{ t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  NModal, NInput, NButton, NScrollbar, useMessage
} from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  mcp: Object,           // 编辑时传入 { name, config, source }
  scope: String,         // 新建/编辑时的 scope（由发起的分组决定）
  projectPath: String,
  readonly: Boolean      // 只读模式（查看）
})

const emit = defineEmits(['update:show', 'saved'])

const isEdit = computed(() => !!props.mcp)
const modalTitle = computed(() => {
  if (props.readonly) return t('rightPanel.mcp.viewMcp')
  return isEdit.value ? t('rightPanel.mcp.editMcp') : t('rightPanel.mcp.createMcp')
})
const saving = ref(false)
const jsonText = ref('')
const jsonError = ref('')

const jsonPlaceholder = computed(() => {
  return `{
  "mcp-server-name": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@xxx/mcp-package"]
  }
}`
})

// 监听 mcp 变化，填充 JSON
watch(() => props.mcp, (mcp) => {
  if (mcp) {
    const config = mcp.config || {}
    const obj = { [mcp.name]: config }
    jsonText.value = JSON.stringify(obj, null, 2)
  } else {
    jsonText.value = ''
  }
  jsonError.value = ''
}, { immediate: true })

// 监听 show，重新加载内容（修复打开时数据未更新的问题）
watch(() => props.show, (show) => {
  if (show) {
    if (props.mcp) {
      const config = props.mcp.config || {}
      const obj = { [props.mcp.name]: config }
      jsonText.value = JSON.stringify(obj, null, 2)
    } else {
      jsonText.value = ''
    }
    jsonError.value = ''
  }
})

// 格式化 JSON
const formatJson = () => {
  try {
    const obj = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(obj, null, 2)
    jsonError.value = ''
  } catch (e) {
    jsonError.value = t('rightPanel.mcp.invalidJson')
  }
}

// 解析 JSON 获取 name 和 config
const parseJson = () => {
  try {
    const obj = JSON.parse(jsonText.value)
    const keys = Object.keys(obj)
    if (keys.length !== 1) {
      return { error: t('rightPanel.mcp.singleMcpRequired') }
    }
    const name = keys[0]
    const config = obj[name]
    if (!config || typeof config !== 'object') {
      return { error: t('rightPanel.mcp.invalidConfig') }
    }
    return { name, config }
  } catch (e) {
    return { error: t('rightPanel.mcp.invalidJson') }
  }
}

// 保存
const handleSave = async () => {
  const parsed = parseJson()
  if (parsed.error) {
    jsonError.value = parsed.error
    message.error(parsed.error)
    return
  }

  const { name, config } = parsed
  jsonError.value = ''
  saving.value = true

  try {
    const params = {
      scope: props.scope,
      projectPath: props.projectPath,
      name,
      config,
      filePath: props.mcp?.filePath  // 插件级需要 filePath
    }

    let result
    if (isEdit.value) {
      params.oldName = props.mcp.name
      result = await window.electronAPI.updateMcp(params)
    } else {
      result = await window.electronAPI.createMcp(params)
    }

    if (result.success) {
      message.success(t('common.saved'))
      emit('saved')
      emit('update:show', false)
    } else {
      message.error(result.error || t('common.saveFailed'))
    }
  } catch (err) {
    console.error('Save MCP failed:', err)
    message.error(t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
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

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

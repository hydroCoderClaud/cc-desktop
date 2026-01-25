<template>
  <n-modal v-model:show="visible" preset="card" :title="modalTitle" style="width: 700px; max-width: 90vw;">
    <n-form :model="form" label-placement="top">
      <!-- 第一行：Agent Name + YAML 字段管理 -->
      <div class="form-row">
        <n-form-item :label="t('rightPanel.agents.agentId')" class="form-item-id">
          <n-input v-model:value="form.agentId" :placeholder="t('rightPanel.agents.agentNamePlaceholder')" :disabled="isReadonly" />
        </n-form-item>

        <n-form-item :label="t('rightPanel.agents.yamlFields')" class="form-item-yaml">
          <n-popover v-model:show="showFieldsPopover" trigger="click" placement="bottom-start" :width="420">
            <template #trigger>
              <n-button :disabled="isReadonly" class="field-select-btn" size="medium">
                {{ t('rightPanel.agents.selectField') }}
                <template #icon>
                  <span style="font-size: 10px;">▼</span>
                </template>
              </n-button>
            </template>
            <div class="yaml-fields-dropdown">
              <div v-for="field in yamlFieldsWithStatus" :key="field.value" class="yaml-field-item">
                <n-button
                  size="tiny"
                  :type="field.exists ? 'error' : 'primary'"
                  circle
                  @click="toggleField(field)"
                >
                  {{ field.exists ? '−' : '+' }}
                </n-button>
                <span class="field-info">
                  <span class="field-name">{{ field.value }}</span>
                  <span class="field-desc">{{ field.desc }}</span>
                </span>
              </div>
            </div>
          </n-popover>
        </n-form-item>
      </div>

      <!-- 第二行：内容编辑区 -->
      <n-form-item>
        <template #label>
          <div class="content-label-row">
            <span>
              {{ t('rightPanel.agents.content') }}
              <span class="content-hint">（Claude 根据 description 自动选择使用。调用方式：<span class="invoke-cmd">@{{ form.agentId || 'agent-name' }}</span>）</span>
            </span>
            <n-button v-if="!isReadonly" size="tiny" @click="formatContent" :title="t('rightPanel.agents.format')">
              {{ t('rightPanel.agents.format') }}
            </n-button>
          </div>
        </template>
        <n-input
          v-model:value="form.rawContent"
          type="textarea"
          :placeholder="t('rightPanel.agents.rawContentPlaceholder')"
          :rows="16"
          style="font-family: monospace;"
          :disabled="isReadonly"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ isReadonly ? t('common.close') : t('common.cancel') }}</n-button>
        <n-button v-if="!isReadonly" type="primary" @click="handleSave" :loading="saving">{{ t('rightPanel.agents.save') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NPopover, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  agent: { type: Object, default: null },
  source: { type: String, default: 'user' },
  agents: { type: Object, default: () => ({ user: [], project: [] }) },
  projectPath: { type: String, default: null }
})

const emit = defineEmits(['update:modelValue', 'saved'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = ref({
  isEdit: false,
  source: 'user',
  agentId: '',
  originalAgentId: '',  // 记录原始 ID，用于检测改名
  rawContent: ''
})

const saving = ref(false)
const showFieldsPopover = ref(false)

// YAML 字段定义（Agent 专用）
const yamlFieldDefs = [
  { value: 'name', desc: '代理的唯一标识名称' },
  { value: 'description', desc: '告诉 Claude 何时应该使用此代理' },
  { value: 'model', desc: '指定此代理使用的模型（sonnet/opus/haiku）' },
  { value: 'color', desc: '代理颜色（blue/green/red/yellow/purple/cyan/magenta/orange/gray）', defaultValue: 'blue' },
  { value: 'tools', desc: '允许使用的工具列表', defaultValue: '[Read, Write, Edit, Bash]' },
  { value: 'disallowedTools', desc: '禁止使用的工具列表', defaultValue: '[]' },
  { value: 'permissionMode', desc: '权限模式（default/permissive/restrictive）', defaultValue: 'default' },
  { value: 'skills', desc: '此代理可使用的技能列表', defaultValue: '[]' },
  { value: 'hooks', desc: '此代理关联的 hooks', defaultValue: '[]' }
]

// 检查字段是否存在于内容中
const fieldExists = (fieldName) => {
  const regex = new RegExp(`^${fieldName}:`, 'm')
  return regex.test(form.value.rawContent)
}

// 带状态的字段列表
const yamlFieldsWithStatus = computed(() => {
  return yamlFieldDefs.map(f => ({
    ...f,
    exists: fieldExists(f.value)
  }))
})

// 添加字段
const addField = (fieldName) => {
  const fieldDef = yamlFieldDefs.find(f => f.value === fieldName)
  if (!fieldDef) return

  let defaultValue = fieldDef.defaultValue || ''
  if (fieldName === 'name') {
    defaultValue = form.value.agentId || ''
  }

  const fieldLine = `${fieldName}: ${defaultValue}`
  const content = form.value.rawContent

  // 在 frontmatter 的第二个 --- 之前插入
  const match = content.match(/^(---[ \t]*\r?\n)([\s\S]*?)(---[ \t]*\r?\n)/m)
  if (match) {
    form.value.rawContent = match[1] + match[2] + fieldLine + '\n' + match[3] + content.slice(match[0].length)
  } else {
    form.value.rawContent = `---\n${fieldLine}\n---\n\n${content}`
  }
}

// 删除字段
const removeField = (fieldName) => {
  const content = form.value.rawContent
  const regex = new RegExp(`^${fieldName}:.*\\r?\\n`, 'm')
  form.value.rawContent = content.replace(regex, '')
}

// 切换字段（添加或删除）并关闭下拉
const toggleField = (field) => {
  if (field.exists) {
    removeField(field.value)
  } else {
    addField(field.value)
  }
  showFieldsPopover.value = false
}

// 格式化内容
const formatContent = () => {
  const content = form.value.rawContent.trim()

  // 检查是否以 --- 开头（允许前导空格）
  if (!/^[ \t]*---/.test(content)) {
    message.warning(t('rightPanel.agents.noFrontmatter'))
    return
  }

  // 找到第一个换行符后的位置
  const firstNewline = content.indexOf('\n')
  if (firstNewline === -1) {
    message.warning(t('rightPanel.agents.noFrontmatter'))
    return
  }

  // 找到第二个 --- 的位置（在第一行之后，允许前导空格）
  const restContent = content.substring(firstNewline + 1)
  const secondDashMatch = restContent.match(/^([\s\S]*?)\n[ \t]*---[ \t]*(?:\n|$)/)

  if (!secondDashMatch) {
    message.warning(t('rightPanel.agents.noFrontmatter'))
    return
  }

  const yamlContent = secondDashMatch[1]
  const secondDashEnd = firstNewline + 1 + secondDashMatch[0].length
  const body = content.substring(secondDashEnd)

  // 解析 YAML 字段
  const fields = []
  const lines = yamlContent.split('\n')
  let currentKey = null
  let currentValue = null
  let isArray = false
  let arrayItems = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 检查是否是数组项
    if (trimmed.startsWith('- ')) {
      if (isArray) {
        arrayItems.push(trimmed.substring(2))
      }
      continue
    }

    // 检查是否是新的 key
    const keyMatch = trimmed.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (keyMatch) {
      // 保存之前的字段
      if (currentKey !== null) {
        fields.push({ key: currentKey, value: isArray ? arrayItems : currentValue, isArray })
      }

      currentKey = keyMatch[1]
      const value = keyMatch[2].trim()

      if (value === '' || value === '[]') {
        isArray = true
        arrayItems = []
        currentValue = null
      } else {
        isArray = false
        arrayItems = []
        currentValue = value
      }
    }
  }

  // 保存最后一个字段
  if (currentKey !== null) {
    fields.push({ key: currentKey, value: isArray ? arrayItems : currentValue, isArray })
  }

  // 按照标准顺序排列
  const orderedKeys = ['name', 'description', 'model', 'color', 'tools', 'disallowedTools', 'permissionMode', 'skills', 'hooks']
  const sortedFields = []

  for (const key of orderedKeys) {
    const field = fields.find(f => f.key === key)
    if (field) sortedFields.push(field)
  }

  // 添加其他未在标准顺序中的字段
  for (const field of fields) {
    if (!orderedKeys.includes(field.key)) {
      sortedFields.push(field)
    }
  }

  // 生成格式化后的 YAML
  const formattedLines = ['---']
  for (const field of sortedFields) {
    if (field.isArray && Array.isArray(field.value)) {
      // 数组字段：空数组输出为 []，非空数组展开
      if (field.value.length === 0) {
        formattedLines.push(`${field.key}: []`)
      } else {
        formattedLines.push(`${field.key}:`)
        for (const item of field.value) {
          formattedLines.push(`  - ${item}`)
        }
      }
    } else if (field.value !== null && field.value !== '') {
      formattedLines.push(`${field.key}: ${field.value}`)
    }
  }
  formattedLines.push('---')
  formattedLines.push('')

  form.value.rawContent = formattedLines.join('\n') + body.trim()
  message.success(t('rightPanel.agents.formatSuccess'))
}

// 是否为只读模式（插件代理）
const isReadonly = computed(() => {
  return form.value.source === 'plugin'
})

const modalTitle = computed(() => {
  if (isReadonly.value) {
    return t('rightPanel.agents.viewPlugin')
  }
  if (form.value.isEdit) {
    return t('rightPanel.agents.edit')
  }
  return form.value.source === 'project'
    ? t('rightPanel.agents.createProject')
    : t('rightPanel.agents.createUser')
})

// 监听 agent prop 变化，加载内容
const loadAgentContent = async (agent) => {
  if (agent) {
    // 编辑模式：加载完整的原始内容
    const agentId = agent.id || agent.name
    form.value.isEdit = true
    form.value.source = agent.source
    form.value.agentId = agentId
    form.value.originalAgentId = agentId  // 记录原始 ID

    try {
      const result = await window.electronAPI.getAgentRawContent({
        source: agent.source,
        agentId: agentId,
        projectPath: props.projectPath,
        agentPath: agent.agentPath || agent.filePath
      })
      if (result.success) {
        form.value.rawContent = result.content
      } else {
        message.error(`${t('rightPanel.agents.loadError')}: ${result.error}`)
        visible.value = false
      }
    } catch (err) {
      message.error(`${t('rightPanel.agents.loadError')}: ${err.message}`)
      visible.value = false
    }
  } else {
    // 新建模式：提供默认模板
    form.value.isEdit = false
    form.value.source = props.source
    form.value.agentId = 'my-agent'
    form.value.originalAgentId = ''  // 新建模式无原始 ID
    form.value.rawContent = `---
name: my-agent
description: 描述此代理的用途，Claude 会根据此描述自动选择使用
color: blue
---

# 系统提示

这里是代理的系统提示内容...
`
  }
}

watch(() => props.agent, loadAgentContent, { immediate: true })

// 监听模态框打开，重新加载内容
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    loadAgentContent(props.agent)
  }
})

// 监听 source prop 变化
watch(() => props.source, (source) => {
  if (!form.value.isEdit) {
    form.value.source = source
  }
})

// agentId 变化时同步更新 rawContent 中的 name 字段
watch(() => form.value.agentId, (newId) => {
  if (!newId) return

  const content = form.value.rawContent
  const nameRegex = /^(name:\s*)(.*)$/m

  if (nameRegex.test(content)) {
    form.value.rawContent = content.replace(nameRegex, `$1${newId}`)
  }
})

const handleSave = async () => {
  if (!form.value.agentId) {
    message.warning(t('rightPanel.agents.agentIdRequired'))
    return
  }

  // 验证 ID 格式
  if (!/^[a-zA-Z0-9-]+$/.test(form.value.agentId)) {
    message.warning(t('rightPanel.agents.invalidAgentId'))
    return
  }

  // 检测是否改名
  const isRename = form.value.isEdit && form.value.agentId !== form.value.originalAgentId

  // 检查 name 是否和现有 agent 重名
  const currentName = form.value.agentId
  const allAgents = [...(props.agents.user || []), ...(props.agents.project || [])]
  const duplicateAgent = allAgents.find(a => {
    // 编辑模式下排除自己（用原始 ID 判断）
    if (form.value.isEdit && (a.id === form.value.originalAgentId) && a.source === form.value.source) {
      return false
    }
    return a.name === currentName || a.id === currentName
  })

  if (duplicateAgent) {
    const sourceText = duplicateAgent.source === 'user' ? t('rightPanel.agents.userAgents') : t('rightPanel.agents.projectAgents')
    message.error(t('rightPanel.agents.nameDuplicate', { name: currentName, source: sourceText }))
    return
  }

  saving.value = true
  try {
    let result

    // 如果改名，同步更新 rawContent 中的 name 字段
    if (isRename) {
      const nameRegex = /^(name:\s*)(.*)$/m
      if (nameRegex.test(form.value.rawContent)) {
        form.value.rawContent = form.value.rawContent.replace(nameRegex, `$1${form.value.agentId}`)
      }
    }

    if (form.value.isEdit) {
      if (isRename) {
        // 先重命名文件
        result = await window.electronAPI.renameAgent({
          source: form.value.source,
          oldAgentId: form.value.originalAgentId,
          newAgentId: form.value.agentId,
          projectPath: props.projectPath
        })
        if (!result.success) {
          message.error(result.error || t('rightPanel.agents.renameError'))
          return
        }
      }
      // 更新内容（包含已同步的 name 字段）
      result = await window.electronAPI.updateAgentRaw({
        source: form.value.source,
        agentId: form.value.agentId,
        rawContent: form.value.rawContent,
        projectPath: props.projectPath
      })
    } else {
      // 新建
      result = await window.electronAPI.createAgentRaw({
        source: form.value.source,
        agentId: form.value.agentId,
        rawContent: form.value.rawContent,
        projectPath: props.projectPath
      })
    }

    if (result.success) {
      message.success(
        form.value.isEdit
          ? t('rightPanel.agents.updateSuccess')
          : t('rightPanel.agents.createSuccess')
      )
      visible.value = false
      emit('saved')
    } else {
      message.error(result.error || t('rightPanel.agents.saveError'))
    }
  } catch (err) {
    message.error(`${t('rightPanel.agents.saveError')}: ${err.message}`)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.content-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.content-hint {
  font-size: 12px;
  font-weight: normal;
  color: var(--text-color-muted);
  margin-left: 8px;
}

.invoke-cmd {
  color: #f90;
  font-weight: 500;
}

.form-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.form-item-id {
  flex: 6;
}

.form-item-yaml {
  flex: 4;
}

.form-item-id :deep(.n-input) {
  height: 38px;
}

.form-item-yaml :deep(.n-button) {
  height: 38px;
  width: 100%;
}

.yaml-fields-dropdown {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.yaml-field-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 4px;
  border-radius: 4px;
  transition: background 0.2s;
}

.yaml-field-item:hover {
  background: var(--n-color-hover);
}

.field-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.field-name {
  font-size: 13px;
  font-weight: 500;
}

.field-desc {
  font-size: 12px;
  color: var(--text-color-muted);
  line-height: 1.4;
}
</style>

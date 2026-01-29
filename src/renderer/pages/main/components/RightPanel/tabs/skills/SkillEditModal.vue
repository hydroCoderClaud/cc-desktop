<template>
  <n-modal v-model:show="visible" preset="card" :title="modalTitle" style="width: 700px; max-width: 90vw;">
    <n-form :model="form" label-placement="top">
      <!-- 第一行：Skill ID + YAML 字段管理 -->
      <div class="form-row">
        <n-form-item :label="t('rightPanel.skills.skillId')" class="form-item-id">
          <n-input v-model:value="form.skillId" :placeholder="t('rightPanel.skills.skillIdPlaceholder')" :disabled="isReadonly || form.isEdit" />
        </n-form-item>

        <n-form-item :label="t('rightPanel.skills.yamlFields')" class="form-item-yaml">
          <n-popover v-model:show="showFieldsPopover" trigger="click" placement="bottom-start" :width="420">
            <template #trigger>
              <n-button :disabled="isReadonly" class="field-select-btn" size="medium">
                {{ t('rightPanel.skills.selectField') }}
                <template #icon>
                  <Icon name="chevronDown" :size="10" />
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
          {{ t('rightPanel.skills.content') }}
          <span class="content-hint">（手动调用命令：<span class="invoke-cmd">/{{ invocationName }}</span>。请通过正文 name 字段修改）</span>
        </template>
        <n-input
          v-model:value="form.rawContent"
          type="textarea"
          :placeholder="t('rightPanel.skills.rawContentPlaceholder')"
          :rows="16"
          :style="{ fontFamily: 'var(--font-mono)' }"
          :disabled="isReadonly"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ isReadonly ? t('common.close') : t('common.cancel') }}</n-button>
        <n-button v-if="!isReadonly" type="primary" @click="handleSave" :loading="saving">{{ t('rightPanel.skills.save') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NPopover, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  skill: { type: Object, default: null },
  scope: { type: String, default: 'user' },
  skills: { type: Object, default: () => ({ user: [], project: [] }) },
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
  skillId: '',
  skillPath: '',
  rawContent: ''
})

const saving = ref(false)
const showFieldsPopover = ref(false)

// YAML 字段定义
const yamlFieldDefs = [
  { value: 'name', desc: '用户调用时输入的名称，如 /my-skill' },
  { value: 'description', desc: '告诉 Claude 何时应该使用此技能' },
  { value: 'argument-hint', desc: '调用时显示的参数输入提示' },
  { value: 'user-invocable', desc: '设为 false 则用户无法通过 / 调用', defaultValue: 'true' },
  { value: 'disable-model-invocation', desc: '设为 true 则 Claude 不会自动调用', defaultValue: 'false' },
  { value: 'allowed-tools', desc: '限制此技能可使用的工具', defaultValue: '[Read, Grep, Glob]' },
  { value: 'model', desc: '指定执行此技能时使用的模型' }
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
    defaultValue = form.value.skillId || ''
  }

  // 确保冒号后有空格
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

// 是否为只读模式（已废弃，现在所有来源都可编辑）
const isReadonly = computed(() => {
  return false
})

const modalTitle = computed(() => {
  if (form.value.isEdit) {
    return t('rightPanel.skills.edit')
  }
  return form.value.source === 'project'
    ? t('rightPanel.skills.createProject')
    : t('rightPanel.skills.createUser')
})

// 调用名称（从内容中解析 name 字段，如果没有则使用 skillId）
const invocationName = computed(() => {
  const content = form.value.rawContent
  // 匹配 name: 后面的值（同一行，不含冒号）
  const nameMatch = content.match(/^name:\s*([^\n\r]*)$/m)
  const nameValue = nameMatch ? nameMatch[1].trim() : ''
  // 如果 name 值为空或包含冒号（说明匹配错误），则使用 skillId
  if (!nameValue || nameValue.includes(':')) {
    return form.value.skillId || 'my-skill'
  }
  return nameValue
})

// 监听 skill prop 变化，加载内容
const loadSkillContent = async (skill) => {
  if (skill) {
    // 编辑模式：加载完整的原始内容
    form.value.isEdit = true
    form.value.source = skill.source
    form.value.skillId = skill.id
    form.value.skillPath = skill.skillPath || ''

    try {
      const result = await window.electronAPI.getSkillRawContent({
        source: skill.source,
        skillId: skill.id,
        projectPath: props.projectPath,
        skillPath: skill.skillPath
      })
      if (result.success) {
        form.value.rawContent = result.content
      } else {
        message.error(`${t('rightPanel.skills.loadError')}: ${result.error}`)
        visible.value = false
      }
    } catch (err) {
      message.error(`${t('rightPanel.skills.loadError')}: ${err.message}`)
      visible.value = false
    }
  } else {
    // 新建模式：提供默认模板
    form.value.isEdit = false
    form.value.source = props.scope
    form.value.skillId = 'my-skill'
    form.value.rawContent = `---
name: my-skill
description: 描述
---

# 技能标题

技能内容...
`
  }
}

watch(() => props.skill, loadSkillContent, { immediate: true })

// 监听模态框打开，重新加载内容（修复取消后再次打开仍保留改动的问题）
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    loadSkillContent(props.skill)
  }
})

// 监听 scope prop 变化
watch(() => props.scope, (scope) => {
  if (!form.value.isEdit) {
    form.value.source = scope
  }
})

// 新建模式下，skillId 变化时同步更新 name 字段
watch(() => form.value.skillId, (newId) => {
  if (!newId || form.value.isEdit) return  // 编辑模式不自动更新

  const content = form.value.rawContent
  const nameRegex = /^(name:\s*)(.*)$/m

  if (nameRegex.test(content)) {
    form.value.rawContent = content.replace(nameRegex, `$1${newId}`)
  }
})

const handleSave = async () => {
  if (!form.value.isEdit && !form.value.skillId) {
    message.warning(t('rightPanel.skills.skillIdRequired'))
    return
  }

  // 检查 name 是否和现有 skill 重名
  const currentName = invocationName.value
  const allSkills = [...(props.skills.user || []), ...(props.skills.project || [])]
  const duplicateSkill = allSkills.find(s => {
    // 编辑模式下排除自己
    if (form.value.isEdit && s.id === form.value.skillId && s.source === form.value.source) {
      return false
    }
    return s.name === currentName
  })

  if (duplicateSkill) {
    const sourceText = duplicateSkill.source === 'user' ? t('rightPanel.skills.userSkills') : t('rightPanel.skills.projectSkills')
    message.error(t('rightPanel.skills.nameDuplicate', { name: currentName, source: sourceText }))
    return
  }

  saving.value = true
  try {
    const params = {
      source: form.value.source,
      skillId: form.value.skillId,
      skillPath: form.value.skillPath,
      rawContent: form.value.rawContent,
      projectPath: props.projectPath
    }

    const result = form.value.isEdit
      ? await window.electronAPI.updateSkillRaw(params)
      : await window.electronAPI.createSkillRaw(params)

    if (result.success) {
      message.success(
        form.value.isEdit
          ? t('rightPanel.skills.updateSuccess')
          : t('rightPanel.skills.createSuccess')
      )
      visible.value = false
      emit('saved')
    } else {
      message.error(result.error || t('rightPanel.skills.saveError'))
    }
  } catch (err) {
    message.error(`${t('rightPanel.skills.saveError')}: ${err.message}`)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.content-hint {
  font-size: 12px;
  font-weight: normal;
  color: var(--text-color-muted);
  margin-left: 8px;
}

.invoke-cmd {
  color: var(--primary-color);
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

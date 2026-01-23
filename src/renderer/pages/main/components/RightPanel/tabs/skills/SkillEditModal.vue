<template>
  <n-modal v-model:show="visible" preset="card" :title="modalTitle" style="width: 700px; max-width: 90vw;">
    <n-form :model="form" label-placement="top">
      <n-form-item v-if="!form.isEdit" :label="t('rightPanel.skills.skillId')">
        <n-input v-model:value="form.skillId" :placeholder="t('rightPanel.skills.skillIdPlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('rightPanel.skills.name')">
        <n-input v-model:value="form.name" :placeholder="t('rightPanel.skills.namePlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('rightPanel.skills.description')">
        <n-input
          v-model:value="form.description"
          type="textarea"
          :placeholder="t('rightPanel.skills.descriptionPlaceholder')"
          :rows="3"
        />
      </n-form-item>
      <n-form-item :label="t('rightPanel.skills.content')">
        <n-input
          v-model:value="form.content"
          type="textarea"
          :placeholder="t('rightPanel.skills.contentPlaceholder')"
          :rows="16"
          style="font-family: monospace;"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('rightPanel.skills.cancel') }}</n-button>
        <n-button type="primary" @click="handleSave" :loading="saving">{{ t('rightPanel.skills.save') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  skill: { type: Object, default: null },
  source: { type: String, default: 'user' },
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
  name: '',
  description: '',
  content: ''
})

const saving = ref(false)

const modalTitle = computed(() => {
  if (form.value.isEdit) {
    return t('rightPanel.skills.edit')
  }
  return form.value.source === 'project'
    ? t('rightPanel.skills.createProject')
    : t('rightPanel.skills.createUser')
})

// 监听 skill prop 变化，加载内容
watch(() => props.skill, async (skill) => {
  if (skill) {
    // 编辑模式：加载现有内容
    form.value.isEdit = true
    form.value.source = skill.source
    form.value.skillId = skill.id

    try {
      const result = await window.electronAPI.getSkillContent({
        source: skill.source,
        skillId: skill.id,
        projectPath: props.projectPath
      })
      if (result.success) {
        form.value.name = result.skill.name
        form.value.description = result.skill.description
        form.value.content = result.skill.content
      } else {
        message.error(`${t('rightPanel.skills.loadError')}: ${result.error}`)
        visible.value = false
      }
    } catch (err) {
      message.error(`${t('rightPanel.skills.loadError')}: ${err.message}`)
      visible.value = false
    }
  } else {
    // 新建模式
    form.value.isEdit = false
    form.value.source = props.source
    form.value.skillId = ''
    form.value.name = ''
    form.value.description = ''
    form.value.content = ''
  }
}, { immediate: true })

// 监听 source prop 变化
watch(() => props.source, (source) => {
  if (!form.value.isEdit) {
    form.value.source = source
  }
})

const handleSave = async () => {
  if (!form.value.isEdit && !form.value.skillId) {
    message.warning(t('rightPanel.skills.skillIdRequired'))
    return
  }

  saving.value = true
  try {
    const params = {
      source: form.value.source,
      skillId: form.value.skillId,
      name: form.value.name || form.value.skillId,
      description: form.value.description,
      content: form.value.content,
      projectPath: props.projectPath
    }

    const result = form.value.isEdit
      ? await window.electronAPI.updateSkill(params)
      : await window.electronAPI.createSkill(params)

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

<template>
  <n-modal v-model:show="visible" preset="card" :title="modalTitle" style="width: 700px; max-width: 90vw;">
    <n-form :model="form" label-placement="top">
      <n-form-item v-if="!form.isEdit" :label="t('rightPanel.commands.commandId')">
        <n-input v-model:value="form.commandId" :placeholder="t('rightPanel.commands.commandIdPlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('rightPanel.commands.name')">
        <n-input v-model:value="form.name" :placeholder="t('rightPanel.commands.namePlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('rightPanel.commands.description')">
        <n-input
          v-model:value="form.description"
          type="textarea"
          :placeholder="t('rightPanel.commands.descriptionPlaceholder')"
          :rows="3"
        />
      </n-form-item>
      <n-form-item :label="t('rightPanel.commands.content')">
        <n-input
          v-model:value="form.content"
          type="textarea"
          :placeholder="t('rightPanel.commands.contentPlaceholder')"
          :rows="16"
          style="font-family: monospace;"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('rightPanel.commands.cancel') }}</n-button>
        <n-button type="primary" @click="handleSave" :loading="saving">{{ t('rightPanel.commands.save') }}</n-button>
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
  command: { type: Object, default: null },
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
  commandId: '',
  name: '',
  description: '',
  content: ''
})

const saving = ref(false)

const modalTitle = computed(() => {
  if (form.value.isEdit) {
    return t('rightPanel.commands.edit')
  }
  return form.value.source === 'project'
    ? t('rightPanel.commands.createProject')
    : t('rightPanel.commands.createUser')
})

// 监听 command prop 变化，加载内容
watch(() => props.command, async (command) => {
  if (command) {
    // 编辑模式：加载现有内容
    form.value.isEdit = true
    form.value.source = command.source
    form.value.commandId = command.id

    try {
      const result = await window.electronAPI.getCommandContent({
        source: command.source,
        commandId: command.id,
        projectPath: props.projectPath
      })
      if (result.success) {
        form.value.name = result.command.name
        form.value.description = result.command.description
        form.value.content = result.command.content
      } else {
        message.error(`${t('rightPanel.commands.loadError')}: ${result.error}`)
        visible.value = false
      }
    } catch (err) {
      message.error(`${t('rightPanel.commands.loadError')}: ${err.message}`)
      visible.value = false
    }
  } else {
    // 新建模式
    form.value.isEdit = false
    form.value.source = props.source
    form.value.commandId = ''
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
  if (!form.value.isEdit && !form.value.commandId) {
    message.warning(t('rightPanel.commands.commandIdRequired'))
    return
  }

  saving.value = true
  try {
    const params = {
      source: form.value.source,
      commandId: form.value.commandId,
      name: form.value.name || form.value.commandId,
      description: form.value.description,
      content: form.value.content,
      projectPath: props.projectPath
    }

    const result = form.value.isEdit
      ? await window.electronAPI.updateCommand(params)
      : await window.electronAPI.createCommand(params)

    if (result.success) {
      message.success(
        form.value.isEdit
          ? t('rightPanel.commands.updateSuccess')
          : t('rightPanel.commands.createSuccess')
      )
      visible.value = false
      emit('saved')
    } else {
      message.error(result.error || t('rightPanel.commands.saveError'))
    }
  } catch (err) {
    message.error(`${t('rightPanel.commands.saveError')}: ${err.message}`)
  } finally {
    saving.value = false
  }
}
</script>

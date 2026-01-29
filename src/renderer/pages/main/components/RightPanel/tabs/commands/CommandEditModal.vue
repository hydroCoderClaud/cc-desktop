<template>
  <n-modal v-model:show="visible" preset="card" :title="t('rightPanel.commands.edit')" style="width: 600px; max-width: 90vw;">
    <n-form :model="form" label-placement="top">
      <!-- Command Name (只读) -->
      <n-form-item :label="t('rightPanel.commands.name')">
        <n-input :value="form.commandName" disabled />
      </n-form-item>

      <!-- 内容编辑区 -->
      <n-form-item :label="t('rightPanel.commands.content')">
        <n-input
          v-model:value="form.rawContent"
          type="textarea"
          :placeholder="t('rightPanel.commands.contentPlaceholder')"
          :rows="14"
          :style="{ fontFamily: 'var(--font-mono)' }"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <n-button @click="visible = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" @click="handleSave" :loading="saving">{{ t('common.save') }}</n-button>
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
  command: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'saved'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = ref({
  commandName: '',
  commandPath: '',
  rawContent: ''
})

const saving = ref(false)

// 加载 Command 内容
const loadCommandContent = async (command) => {
  if (command) {
    form.value.commandName = command.name
    form.value.commandPath = command.filePath

    try {
      const result = await window.electronAPI.readFile(command.filePath)
      if (result.success) {
        form.value.rawContent = result.content
      } else {
        message.error(`${t('rightPanel.commands.loadError')}: ${result.error}`)
        visible.value = false
      }
    } catch (err) {
      message.error(`${t('rightPanel.commands.loadError')}: ${err.message}`)
      visible.value = false
    }
  } else {
    form.value.commandName = ''
    form.value.commandPath = ''
    form.value.rawContent = ''
  }
}

watch(() => props.command, loadCommandContent, { immediate: true })

// 监听模态框打开，重新加载内容
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    loadCommandContent(props.command)
  }
})

const handleSave = async () => {
  if (!form.value.commandPath) {
    message.warning(t('rightPanel.commands.noPath'))
    return
  }

  saving.value = true
  try {
    const result = await window.electronAPI.writeFile(form.value.commandPath, form.value.rawContent)

    if (result.success) {
      message.success(t('rightPanel.commands.saveSuccess'))
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

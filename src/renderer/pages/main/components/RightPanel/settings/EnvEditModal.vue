<template>
  <n-modal
    :show="show"
    preset="card"
    :title="isEdit ? t('rightPanel.settings.env.editVar') : t('rightPanel.settings.env.addVar')"
    style="width: 400px;"
    @update:show="$emit('update:show', $event)"
  >
    <div class="edit-form">
      <n-form-item :label="t('rightPanel.settings.env.key')">
        <n-input
          v-model:value="formData.key"
          :placeholder="t('rightPanel.settings.env.keyPlaceholder')"
          :disabled="isEdit"
        />
      </n-form-item>

      <n-form-item :label="t('rightPanel.settings.env.value')">
        <n-input
          v-model:value="formData.value"
          type="textarea"
          :placeholder="t('rightPanel.settings.env.valuePlaceholder')"
          :autosize="{ minRows: 1, maxRows: 5 }"
        />
      </n-form-item>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" :disabled="!formData.key.trim()" @click="handleSave">
          {{ t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { NModal, NFormItem, NInput, NButton, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  envVar: { type: Object, default: null }, // { key, value } 或 null (创建)
  scope: { type: String, default: 'global' },
  projectPath: String
})

const emit = defineEmits(['update:show', 'saved'])

const isEdit = ref(false)
const saving = ref(false)
const formData = reactive({
  key: '',
  value: ''
})

watch(() => props.show, (val) => {
  if (val) {
    if (props.envVar) {
      isEdit.value = true
      formData.key = props.envVar.key
      formData.value = props.envVar.value
    } else {
      isEdit.value = false
      formData.key = ''
      formData.value = ''
    }
  }
})

const handleSave = async () => {
  const key = formData.key.trim()
  if (!key) return

  saving.value = true
  try {
    const result = await window.electronAPI.setClaudeEnv({
      scope: props.scope,
      projectPath: props.projectPath,
      key,
      value: formData.value
    })

    if (result.success) {
      message.success(t('rightPanel.settings.env.saveSuccess'))
      emit('update:show', false)
      emit('saved')
    } else {
      message.error(result.error || t('common.saveFailed'))
    }
  } catch (err) {
    console.error('Save env variable failed:', err)
    message.error(t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.edit-form {
  padding: 4px 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

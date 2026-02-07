<template>
  <n-modal
    :show="show"
    preset="card"
    :title="isEdit ? t('rightPanel.settings.permissions.editRule') : t('rightPanel.settings.permissions.addRule')"
    style="width: 400px;"
    @update:show="$emit('update:show', $event)"
  >
    <div class="edit-form">
      <n-form-item :label="t('rightPanel.settings.permissions.type')">
        <n-radio-group v-model:value="formData.type">
          <n-space>
            <n-radio value="allow">{{ t('rightPanel.settings.permissions.allow') }}</n-radio>
            <n-radio value="deny">{{ t('rightPanel.settings.permissions.deny') }}</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>

      <n-form-item :label="t('rightPanel.settings.permissions.pattern')">
        <n-input
          v-model:value="formData.pattern"
          :placeholder="t('rightPanel.settings.permissions.patternPlaceholder')"
        />
      </n-form-item>

      <div class="hint-text">
        {{ t('rightPanel.settings.permissions.patternHint') }}
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" :disabled="!formData.pattern.trim()" @click="handleSave">
          {{ t('common.save') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { NModal, NFormItem, NInput, NButton, NRadio, NRadioGroup, NSpace, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  rule: { type: Object, default: null }, // { type, index, pattern } 或 null (创建)
  scope: { type: String, default: 'global' },
  projectPath: String
})

const emit = defineEmits(['update:show', 'saved'])

const isEdit = ref(false)
const saving = ref(false)
const formData = reactive({
  type: 'allow',
  pattern: ''
})

watch(() => props.show, (val) => {
  if (val) {
    if (props.rule) {
      isEdit.value = true
      formData.type = props.rule.type
      formData.pattern = props.rule.pattern
    } else {
      isEdit.value = false
      formData.type = 'allow'
      formData.pattern = ''
    }
  }
})

const handleSave = async () => {
  const pattern = formData.pattern.trim()
  if (!pattern) return

  saving.value = true
  try {
    let result
    if (isEdit.value && props.rule) {
      // 如果类型变了，需要先删旧的再加新的
      if (props.rule.type !== formData.type) {
        await window.electronAPI.removeClaudePermission({
          scope: props.scope,
          projectPath: props.projectPath,
          type: props.rule.type,
          index: props.rule.index
        })
        result = await window.electronAPI.addClaudePermission({
          scope: props.scope,
          projectPath: props.projectPath,
          type: formData.type,
          pattern
        })
      } else {
        result = await window.electronAPI.updateClaudePermission({
          scope: props.scope,
          projectPath: props.projectPath,
          type: formData.type,
          index: props.rule.index,
          pattern
        })
      }
    } else {
      result = await window.electronAPI.addClaudePermission({
        scope: props.scope,
        projectPath: props.projectPath,
        type: formData.type,
        pattern
      })
    }

    if (result.success) {
      message.success(t('rightPanel.settings.permissions.saveSuccess'))
      emit('update:show', false)
      emit('saved')
    } else {
      message.error(result.error || t('common.saveFailed'))
    }
  } catch (err) {
    console.error('Save permission rule failed:', err)
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

.hint-text {
  font-size: 12px;
  color: var(--text-color-muted);
  margin-top: -8px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

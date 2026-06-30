<template>
  <div class="session-app-card st-card">
    <div class="card-header">
      <div class="header-left">
        <Icon name="sessionApp" :size="14" class="card-icon" />
        <span class="card-title">{{ titleText }}</span>
      </div>
      <span class="card-status" :class="statusClass">{{ statusText }}</span>
    </div>

    <div class="card-description" v-if="descriptionText">{{ descriptionText }}</div>

    <div v-if="isFinalized && outputStatus === 'answered'" class="result-summary">
      <div>{{ t('agent.sessionAppDraftConfirmed', { name: finalizedAppName }) }}</div>
      <div v-if="props.message?.output?.launchedSessionTitle">{{ t('agent.sessionAppDraftLaunchCreated', { title: props.message.output.launchedSessionTitle }) }}</div>
    </div>
    <div v-else-if="isFinalized" class="result-summary">
      {{ t('agent.interaction.statusCancelled') }}
    </div>

    <n-form v-else label-placement="top" class="task-form">
      <n-form-item :label="t('sessionApps.form.name')" :feedback="nameError || ''" :validation-status="nameError ? 'error' : undefined">
        <n-input v-model:value="form.name" :placeholder="t('sessionApps.form.namePlaceholder')" />
      </n-form-item>

      <n-form-item :label="t('sessionApps.form.description')">
        <n-input v-model:value="form.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" :placeholder="t('sessionApps.form.descriptionPlaceholder')" />
      </n-form-item>

      <n-form-item :label="t('sessionApps.form.startupMessage')">
        <n-input v-model:value="form.startupMessageTemplate" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" :placeholder="t('sessionApps.form.startupPlaceholder')" />
      </n-form-item>

      <n-form-item :label="t('sessionApps.form.systemPrompt')">
        <n-input v-model:value="form.systemPrompt" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" :placeholder="t('sessionApps.form.systemPromptPlaceholder')" />
      </n-form-item>

      <n-form-item :label="t('agent.sessionAppDraftWorkingDirectory')">
        <div class="cwd-field st-cwd-field">
          <n-input v-model:value="form.defaultContext.cwd" :placeholder="t('rightPanel.scheduledTasks.defaultWorkspace')" />
          <n-button @click="pickFolder">{{ t('rightPanel.scheduledTasks.browse') }}</n-button>
        </div>
      </n-form-item>

      <n-form-item :label="t('agent.sessionAppDraftAfterPublish')">
        <n-radio-group v-model:value="form.afterCreateAction">
          <n-space>
            <n-radio value="save">{{ t('agent.sessionAppDraftAfterPublishSave') }}</n-radio>
            <n-radio value="launch">{{ t('agent.sessionAppDraftAfterPublishLaunch') }}</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
    </n-form>

    <div class="actions" v-if="!isFinalized">
      <button class="action-btn cancel" :disabled="submitting" @click="$emit('cancel', { messageId: message?.id })">
        {{ t('common.cancel') }}
      </button>
      <button class="action-btn confirm" :disabled="submitting || !canSubmit" @click="handleSubmit">
        {{ submitting ? t('agent.interaction.submitting') : t('agent.sessionAppDraftPublishAction') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NForm, NFormItem, NInput, NRadio, NRadioGroup, NSpace } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  submitting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['submit', 'cancel'])
const { t } = useLocale()

const createDefaultForm = () => ({
  appId: null,
  sourceSessionId: null,
  creationMode: 'chat',
  name: '',
  description: '',
  icon: 'robot',
  systemPrompt: '',
  startupMessageTemplate: '',
  inputSchema: [],
  allowedCapabilities: [],
  defaultContext: {
    cwd: ''
  },
  workflowHints: [],
  outputHints: [],
  historyPolicy: null,
  afterCreateAction: 'launch'
})

const form = ref(createDefaultForm())

const applyDraft = (draft, behavior = {}) => {
  const next = draft && typeof draft === 'object' ? draft : {}
  const defaultContext = next.defaultContext && typeof next.defaultContext === 'object'
      ? next.defaultContext
      : {}

  form.value = {
    ...createDefaultForm(),
    ...next,
    defaultContext: {
      cwd: typeof defaultContext.cwd === 'string' ? defaultContext.cwd : ''
    },
    afterCreateAction: behavior?.afterCreateAction === 'save' ? 'save' : 'launch'
  }
}

watch(() => props.message?.input, (input) => {
  applyDraft(input?.draft, input?.behavior)
}, { immediate: true, deep: true })

const titleText = computed(() => props.message?.input?.title || t('agent.sessionAppDraftTitle'))
const descriptionText = computed(() => {
  if (isFinalized.value) return ''
  return props.message?.input?.description || ''
})
const outputStatus = computed(() => props.message?.output?.status || 'pending')
const isFinalized = computed(() => outputStatus.value === 'answered' || outputStatus.value === 'cancelled')
const statusClass = computed(() => {
  if (outputStatus.value === 'answered') return 'confirmed'
  return outputStatus.value
})
const statusText = computed(() => {
  if (outputStatus.value === 'answered') return t('agent.sessionAppDraftStatusConfirmed')
  if (outputStatus.value === 'cancelled') return t('agent.interaction.statusCancelled')
  return t('agent.interaction.statusPending')
})

const finalizedAppName = computed(() => props.message?.output?.appName || form.value.name || t('sessionApps.defaultDraftName'))
const nameError = computed(() => form.value.name.trim() ? '' : t('agent.sessionAppDraftNameRequired'))
const canSubmit = computed(() => !nameError.value)

const pickFolder = async () => {
  const folder = await window.electronAPI?.selectFolder?.()
  if (folder) {
    form.value.defaultContext.cwd = folder
  }
}

const handleSubmit = () => {
  if (!canSubmit.value) return

  emit('submit', {
    messageId: props.message?.id,
    draft: {
      ...form.value,
      name: form.value.name.trim(),
      description: form.value.description?.trim() || '',
      systemPrompt: form.value.systemPrompt?.trim() || '',
      startupMessageTemplate: form.value.startupMessageTemplate?.trim() || '',
      defaultContext: {
        cwd: form.value.defaultContext?.cwd?.trim() || ''
      }
    },
    behavior: {
      afterCreateAction: form.value.afterCreateAction === 'save' ? 'save' : 'launch'
    }
  })
}
</script>

<style src="@/styles/scheduled-task-common.css"></style>

<style scoped>
.session-app-card {
  margin: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header,
.header-left,
.cwd-field,
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header {
  justify-content: space-between;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
}

.card-status {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.card-status.confirmed {
  color: var(--success-color, #16a34a);
}

.card-status.cancelled {
  color: var(--text-color-secondary);
}

.card-description,
.result-summary {
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.result-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-form :deep(.n-form-item) {
  margin-bottom: 10px;
}

.actions {
  justify-content: flex-end;
}

.action-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.action-btn.cancel {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.action-btn.confirm {
  background: var(--primary-color);
  color: #fff;
}
</style>

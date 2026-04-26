<template>
  <div class="scheduled-task-card st-card">
    <div class="card-header">
      <div class="header-left">
        <Icon name="clock" :size="14" class="card-icon" />
        <span class="card-title">{{ titleText }}</span>
      </div>
      <span class="card-status" :class="statusClass">{{ statusText }}</span>
    </div>

    <div class="card-description" v-if="descriptionText">{{ descriptionText }}</div>

    <div v-if="isFinalized && outputStatus === 'answered'" class="result-summary">
      <div>{{ t('agent.scheduleDraftConfirmed', { name: finalizedTaskName }) }}</div>
      <div v-if="finalizedEnabled && finalizedNextRunText">{{ t('agent.scheduleDraftFirstRunAt', { time: finalizedNextRunText }) }}</div>
      <div v-else>{{ t('agent.scheduleDraftDisabledAfterCreate') }}</div>
    </div>
    <div v-else-if="isFinalized" class="result-summary">
      {{ t('agent.interaction.statusCancelled') }}
    </div>

    <n-form v-else label-placement="top" class="task-form">
      <n-form-item :label="t('rightPanel.scheduledTasks.taskName')" :feedback="nameError || ''" :validation-status="nameError ? 'error' : undefined">
        <n-input v-model:value="form.name" />
      </n-form-item>

      <n-form-item :label="t('rightPanel.scheduledTasks.prompt')" :feedback="promptError || ''" :validation-status="promptError ? 'error' : undefined">
        <n-input v-model:value="form.prompt" type="textarea" :autosize="{ minRows: 5, maxRows: 10 }" />
      </n-form-item>

      <n-form-item :label="t('rightPanel.scheduledTasks.workingDirectory')">
        <div class="cwd-field st-cwd-field">
          <n-input v-model:value="form.cwd" :placeholder="t('rightPanel.scheduledTasks.defaultWorkspace')" />
          <n-button @click="pickFolder">{{ t('rightPanel.scheduledTasks.browse') }}</n-button>
        </div>
      </n-form-item>

      <div class="task-grid st-form-grid">
        <n-form-item :label="t('rightPanel.scheduledTasks.apiProfile')">
        <n-select v-model:value="form.apiProfileId" :options="apiProfileOptions" clearable />
        </n-form-item>
        <n-form-item :label="t('rightPanel.scheduledTasks.modelId')">
          <n-select v-model:value="form.modelId" :options="modelOptions" :placeholder="t('rightPanel.scheduledTasks.modelIdPlaceholder')" />
        </n-form-item>
        <n-form-item :label="t('rightPanel.scheduledTasks.maxTurns')">
          <n-input-number v-model:value="form.maxTurns" :min="1" style="width: 100%;" />
        </n-form-item>
        <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')">
          <n-select v-model:value="form.scheduleType" :options="scheduleTypeOptions" />
        </n-form-item>
      </div>

      <div class="task-grid st-form-grid" v-if="form.scheduleType === 'interval'">
        <n-form-item :label="t('rightPanel.scheduledTasks.intervalMinutes')">
          <n-input-number v-model:value="form.intervalMinutes" :min="1" style="width: 100%;" />
        </n-form-item>
      </div>

      <div class="task-grid st-form-grid" v-else-if="form.scheduleType === 'daily'">
        <n-form-item :label="t('rightPanel.scheduledTasks.runTime')" :feedback="timeError || ''" :validation-status="timeError ? 'error' : undefined">
          <n-input v-model:value="form.dailyTime" placeholder="09:00" />
        </n-form-item>
      </div>

      <div class="task-grid st-form-grid" v-else-if="form.scheduleType === 'weekly'">
        <n-form-item :label="t('rightPanel.scheduledTasks.runTime')" :feedback="timeError || ''" :validation-status="timeError ? 'error' : undefined">
          <n-input v-model:value="form.dailyTime" placeholder="09:00" />
        </n-form-item>
        <n-form-item :label="t('rightPanel.scheduledTasks.weeklyDays')" :feedback="weeklyDaysError || ''" :validation-status="weeklyDaysError ? 'error' : undefined">
          <n-select v-model:value="form.weeklyDays" :options="weeklyDayOptions" multiple clearable />
        </n-form-item>
      </div>
      <div class="task-grid st-form-grid" v-else-if="form.scheduleType === 'monthly'">
        <n-form-item :label="t('rightPanel.scheduledTasks.runTime')" :feedback="timeError || ''" :validation-status="timeError ? 'error' : undefined">
          <n-input v-model:value="form.dailyTime" placeholder="09:00" />
        </n-form-item>
        <n-form-item :label="t('rightPanel.scheduledTasks.monthlyMode')">
          <n-select v-model:value="form.monthlyMode" :options="monthlyModeOptions" />
        </n-form-item>
        <n-form-item v-if="form.monthlyMode !== 'last_day'" :label="t('rightPanel.scheduledTasks.monthlyDay')" :feedback="monthlyDayError || ''" :validation-status="monthlyDayError ? 'error' : undefined">
          <n-input-number v-model:value="form.monthlyDay" :min="1" :max="31" style="width: 100%;" />
        </n-form-item>
      </div>
      <div class="task-grid st-form-grid" v-else-if="form.scheduleType === 'workdays'">
        <n-form-item :label="t('rightPanel.scheduledTasks.runTime')" :feedback="timeError || ''" :validation-status="timeError ? 'error' : undefined">
          <n-input v-model:value="form.dailyTime" placeholder="09:00" />
        </n-form-item>
      </div>
      <div class="task-grid st-form-grid" v-else-if="form.scheduleType === 'once'">
        <n-form-item :label="t('rightPanel.scheduledTasks.runDateTime')" :feedback="firstRunAtError || ''" :validation-status="firstRunAtError ? 'error' : undefined">
          <n-date-picker v-model:value="form.firstRunAt" type="datetime" clearable style="width: 100%;" :placeholder="t('rightPanel.scheduledTasks.firstRunAtPlaceholder')" />
        </n-form-item>
      </div>

      <div class="task-grid st-form-grid" v-if="form.scheduleType !== 'once'">
        <n-form-item :label="t('rightPanel.scheduledTasks.firstRunMode')">
          <n-select v-model:value="form.firstRunMode" :options="firstRunModeOptions" />
        </n-form-item>
        <n-form-item v-if="form.firstRunMode === 'custom'" :label="t('rightPanel.scheduledTasks.firstRunAt')" :feedback="firstRunAtError || ''" :validation-status="firstRunAtError ? 'error' : undefined">
          <n-date-picker v-model:value="form.firstRunAt" type="datetime" clearable style="width: 100%;" :placeholder="t('rightPanel.scheduledTasks.firstRunAtPlaceholder')" />
        </n-form-item>
      </div>

      <div class="task-grid switches st-form-grid st-form-grid--switches">
        <n-form-item :label="t('rightPanel.scheduledTasks.enabled')">
          <n-switch v-model:value="form.enabled" />
        </n-form-item>
      </div>
    </n-form>

    <div class="actions" v-if="!isFinalized">
      <button class="action-btn cancel" :disabled="submitting" @click="$emit('cancel', { messageId: message?.id })">
        {{ t('common.cancel') }}
      </button>
      <button class="action-btn confirm" :disabled="submitting || !canSubmit" @click="handleSubmit">
        {{ submitting ? t('agent.interaction.submitting') : t('common.create') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { NButton, NDatePicker, NForm, NFormItem, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import {
  buildFirstRunModeOptions,
  buildMonthlyModeOptions,
  buildScheduledTaskModelOptions,
  buildScheduleTypeOptions,
  buildWeeklyDayOptions,
  createScheduledTaskFormDefaults,
  resolveScheduledTaskModelId
} from '@utils/scheduled-task-meta'

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

const apiProfiles = ref([])
const defaultProfileId = ref(null)
const serviceProviderDefinitions = ref([])
const form = ref(createDefaultForm())

function createDefaultForm() {
  return {
    ...createScheduledTaskFormDefaults(''),
    apiProfileId: null,
  }
}

const applyDraft = (draft) => {
  const next = draft && typeof draft === 'object' ? draft : {}
  form.value = {
    ...createDefaultForm(),
    ...next,
    cwd: next.cwd || '',
    weeklyDays: Array.isArray(next.weeklyDays) && next.weeklyDays.length > 0 ? [...next.weeklyDays] : [1],
    monthlyMode: next.monthlyMode === 'last_day' ? 'last_day' : 'day_of_month',
    monthlyDay: next.monthlyDay == null ? 1 : (Number.isInteger(Number(next.monthlyDay)) ? Number(next.monthlyDay) : 1)
  }
}

watch(() => props.message?.input?.draft, (draft) => {
  applyDraft(draft)
}, { immediate: true, deep: true })

const titleText = computed(() => props.message?.input?.title || t('agent.scheduleDraftTitle'))
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
  if (outputStatus.value === 'answered') return t('agent.scheduleDraftStatusConfirmed')
  if (outputStatus.value === 'cancelled') return t('agent.interaction.statusCancelled')
  return t('agent.interaction.statusPending')
})

const finalizedTaskName = computed(() => props.message?.output?.taskName || form.value.name || t('agent.scheduleDraftDefaultName'))
const finalizedEnabled = computed(() => props.message?.output?.enabled !== false)
const finalizedNextRunText = computed(() => {
  const value = props.message?.output?.nextRunAt
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
})

const scheduleTypeOptions = computed(() => buildScheduleTypeOptions(t))
const firstRunModeOptions = computed(() => buildFirstRunModeOptions(t))
const monthlyModeOptions = computed(() => buildMonthlyModeOptions(t))
const weeklyDayOptions = computed(() => buildWeeklyDayOptions(t))
const modelOptions = computed(() => buildScheduledTaskModelOptions({
  apiProfiles: apiProfiles.value,
  serviceProviderDefinitions: serviceProviderDefinitions.value,
  defaultProfileId: defaultProfileId.value,
  apiProfileId: form.value.apiProfileId || null
}))

const apiProfileOptions = computed(() => [
  {
    label: apiProfiles.value.find(profile => profile.id === defaultProfileId.value)?.name
      ? t('rightPanel.scheduledTasks.defaultProfileResolved', {
          name: apiProfiles.value.find(profile => profile.id === defaultProfileId.value)?.name
        })
      : t('rightPanel.scheduledTasks.defaultProfile'),
    value: null
  },
  ...apiProfiles.value.map(profile => ({ label: profile.name, value: profile.id }))
])

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/
const nameError = computed(() => form.value.name.trim() ? '' : t('agent.scheduleDraftNameRequired'))
const promptError = computed(() => form.value.prompt.trim() ? '' : t('agent.scheduleDraftPromptRequired'))
const timeError = computed(() => {
  if (form.value.scheduleType === 'interval' || form.value.scheduleType === 'once') return ''
  return timePattern.test(String(form.value.dailyTime || '').trim()) ? '' : t('agent.scheduleDraftTimeInvalid')
})
const weeklyDaysError = computed(() => {
  if (form.value.scheduleType !== 'weekly') return ''
  return Array.isArray(form.value.weeklyDays) && form.value.weeklyDays.length > 0
    ? ''
    : t('agent.scheduleDraftWeeklyDaysRequired')
})
const monthlyDayError = computed(() => {
  if (form.value.scheduleType !== 'monthly' || form.value.monthlyMode === 'last_day') return ''
  const day = Number(form.value.monthlyDay)
  return Number.isInteger(day) && day >= 1 && day <= 31 ? '' : t('rightPanel.scheduledTasks.monthlyDayRequired')
})
const firstRunAtError = computed(() => {
  const requiresFirstRunAt = form.value.scheduleType === 'once' || form.value.firstRunMode === 'custom'
  if (!requiresFirstRunAt) return ''
  return form.value.firstRunAt ? '' : t('rightPanel.scheduledTasks.firstRunAtRequired')
})

const canSubmit = computed(() => !nameError.value && !promptError.value && !timeError.value && !weeklyDaysError.value && !monthlyDayError.value && !firstRunAtError.value)

const loadProfiles = async () => {
  try {
    const config = await window.electronAPI?.getConfig?.()
    if (config) {
      apiProfiles.value = Array.isArray(config.apiProfiles) ? config.apiProfiles : []
      defaultProfileId.value = config.defaultProfileId || null
      serviceProviderDefinitions.value = Array.isArray(config.serviceProviderDefinitions) ? config.serviceProviderDefinitions : []
      return
    }

    const profiles = await window.electronAPI?.listAPIProfiles?.()
    apiProfiles.value = Array.isArray(profiles) ? profiles : []
    defaultProfileId.value = null
    serviceProviderDefinitions.value = []
  } catch (err) {
    console.error('[ScheduledTaskDraftCard] Failed to load API profiles:', err)
    apiProfiles.value = []
    defaultProfileId.value = null
    serviceProviderDefinitions.value = []
  }
}

onMounted(() => {
  loadProfiles()
})

const pickFolder = async () => {
  const folder = await window.electronAPI?.selectFolder?.()
  if (folder) {
    form.value.cwd = folder
  }
}

const handleSubmit = () => {
  if (!canSubmit.value) return
  emit('submit', {
    messageId: props.message?.id,
    draft: {
      ...form.value,
      name: form.value.name.trim(),
      prompt: form.value.prompt.trim(),
      cwd: form.value.cwd?.trim() || null,
      modelId: form.value.modelId || null,
      monthlyMode: form.value.monthlyMode,
      monthlyDay: form.value.monthlyMode === 'last_day' ? null : (form.value.monthlyDay ?? null),
      firstRunMode: form.value.scheduleType === 'once' ? 'custom' : form.value.firstRunMode,
      firstRunAt: form.value.firstRunAt ?? null
    }
  })
}

watch([apiProfiles, serviceProviderDefinitions, defaultProfileId, () => form.value.apiProfileId], () => {
  const nextModelId = resolveScheduledTaskModelId({
    apiProfiles: apiProfiles.value,
    serviceProviderDefinitions: serviceProviderDefinitions.value,
    defaultProfileId: defaultProfileId.value,
    apiProfileId: form.value.apiProfileId || null
  }, form.value.modelId)

  if (form.value.modelId !== nextModelId) {
    form.value.modelId = nextModelId
  }
}, { deep: true })
</script>

<style src="@/styles/scheduled-task-common.css"></style>

<style scoped>
.scheduled-task-card {
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

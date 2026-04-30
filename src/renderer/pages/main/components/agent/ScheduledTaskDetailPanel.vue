<template>
  <div class="task-detail">
    <div v-if="loading && !task" class="state-box">
      <Icon name="clock" :size="18" class="spin" />
      <span>{{ t('common.loading') }}</span>
    </div>
    <div v-else-if="!task" class="state-box">
      <Icon name="warning" :size="18" />
      <strong>{{ t('rightPanel.scheduledTasks.taskNotFound') }}</strong>
      <span>{{ t('rightPanel.scheduledTasks.taskNotFoundHint') }}</span>
      <n-button size="small" @click="$emit('close')">{{ t('common.close') }}</n-button>
    </div>
    <template v-else>
      <div class="header">
        <div class="header-main">
          <div class="title-row">
            <div class="icon-wrap"><Icon name="clock" :size="16" /></div>
            <div class="title-copy">
              <div class="title-line">
                <h3>{{ task.name }}</h3>
                <n-tag size="small" :type="task.enabled ? 'success' : 'default'">
                  {{ task.enabled ? t('rightPanel.scheduledTasks.enabled') : t('rightPanel.scheduledTasks.disabled') }}
                </n-tag>
              </div>
              <div class="title-meta">
                <span>{{ describeSchedule(task) }}</span>
                <span>{{ t('rightPanel.scheduledTasks.modelId') }}: {{ getTaskModelLabel(task) }}</span>
                <span>{{ task.cwd || t('rightPanel.scheduledTasks.defaultWorkspace') }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-btn" :title="t('common.refresh')" @click="loadData"><Icon name="refresh" :size="14" /></button>
          <n-button secondary @click="runNow"><template #icon><Icon name="play" :size="14" /></template>{{ t('rightPanel.scheduledTasks.runNow') }}</n-button>
          <n-button type="primary" :loading="saving" @click="saveTask">{{ t('common.save') }}</n-button>
          <n-button type="error" ghost @click="showDeleteConfirm = true">{{ t('common.delete') }}</n-button>
          <n-button @click="$emit('close')">{{ t('common.close') }}</n-button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card"><span>{{ t('rightPanel.scheduledTasks.scheduleType') }}</span><strong>{{ describeSchedule(task) }}</strong></div>
        <div class="summary-card"><span>{{ t('rightPanel.scheduledTasks.nextRun') }}</span><strong>{{ formatTimestamp(task.nextRunAt) }}</strong></div>
        <div class="summary-card"><span>{{ t('rightPanel.scheduledTasks.lastStartedAt') }}</span><strong>{{ formatTimestamp(task.lastStartedAt) }}</strong></div>
        <div class="summary-card"><span>{{ t('rightPanel.scheduledTasks.lastCompletedAt') }}</span><strong>{{ formatTimestamp(task.lastRunAt) }}</strong></div>
        <div class="summary-card"><span>{{ t('rightPanel.scheduledTasks.runCount') }}</span><strong>{{ task.runCount || 0 }}{{ task.maxRuns ? ` / ${task.maxRuns}` : '' }}</strong></div>
        <div class="summary-card"><span>{{ t('rightPanel.scheduledTasks.failureCount') }}</span><strong>{{ task.failureCount || 0 }}</strong></div>
      </div>

      <div class="layout">
        <div class="main-col">
          <section class="panel st-panel">
            <div class="panel-title st-panel-title">{{ t('rightPanel.scheduledTasks.basicInfo') }}</div>
            <div class="grid basic-grid st-form-grid st-form-grid--primary">
              <n-form-item :label="t('rightPanel.scheduledTasks.taskName')"><n-input v-model:value="form.name" :placeholder="t('rightPanel.scheduledTasks.taskNamePlaceholder')" /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.workingDirectory')">
                <div class="cwd-field st-cwd-field">
                  <n-input v-model:value="form.cwd" :placeholder="t('rightPanel.scheduledTasks.defaultWorkspace')" />
                  <n-button @click="pickFolder">{{ t('rightPanel.scheduledTasks.browse') }}</n-button>
                </div>
              </n-form-item>
            </div>
          </section>

          <section class="panel st-panel prompt-panel">
            <div class="panel-title st-panel-title">{{ t('rightPanel.scheduledTasks.promptEditor') }}</div>
            <n-form-item class="prompt-form-item" :label="t('rightPanel.scheduledTasks.prompt')">
              <n-input class="prompt-input" v-model:value="form.prompt" type="textarea" :placeholder="t('rightPanel.scheduledTasks.promptPlaceholder')" :autosize="{ minRows: 8, maxRows: 16 }" />
            </n-form-item>
          </section>
        </div>

        <div class="side-col">
          <section class="panel st-panel">
            <div class="panel-title st-panel-title">{{ t('rightPanel.scheduledTasks.executionSettings') }}</div>
            <div class="grid compact-grid st-form-grid st-form-grid--three">
              <n-form-item :label="t('rightPanel.scheduledTasks.apiProfile')"><n-select v-model:value="form.apiProfileId" :options="apiProfileOptions" clearable /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.modelId')"><n-select v-model:value="form.modelId" :options="modelOptions" :placeholder="t('rightPanel.scheduledTasks.modelIdPlaceholder')" /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.maxRuns')"><n-input-number v-model:value="form.maxRuns" :min="1" style="width: 100%;" /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.resetCountOnEnable')"><n-switch v-model:value="form.resetCountOnEnable" /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.enabled')"><n-switch v-model:value="form.enabled" /></n-form-item>
            </div>
          </section>

          <section class="panel st-panel">
            <div class="panel-title st-panel-title">{{ t('rightPanel.scheduledTasks.scheduleSettings') }}</div>
            <template v-if="form.scheduleType === 'interval'">
              <div class="grid st-form-grid st-form-grid--schedule-pair">
                <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')"><n-select v-model:value="form.scheduleType" :options="scheduleTypeOptions" /></n-form-item>
                <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')"><n-date-picker v-model:value="form.firstRunAt" type="datetime" clearable style="width: 100%;" :placeholder="t('rightPanel.scheduledTasks.firstRunAtPlaceholder')" /></n-form-item>
              </div>
              <div class="grid st-form-grid st-form-grid--schedule-pair">
                <n-form-item :label="t('rightPanel.scheduledTasks.intervalMinutes')"><n-input-number v-model:value="form.intervalMinutes" :min="1" style="width: 100%;" /></n-form-item>
                <n-form-item :label="t('rightPanel.scheduledTasks.intervalAnchorMode')"><n-select v-model:value="form.intervalAnchorMode" :options="intervalAnchorOptions" /></n-form-item>
              </div>
            </template>
            <div class="grid st-form-grid st-form-grid--schedule-pair" v-else-if="form.scheduleType === 'daily'">
              <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')"><n-select v-model:value="form.scheduleType" :options="scheduleTypeOptions" /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')"><n-time-picker v-model:value="form.firstRunAt" format="HH:mm" clearable style="width: 100%;" :placeholder="executionTimePlaceholder" /></n-form-item>
            </div>
            <template v-else-if="form.scheduleType === 'monthly'">
              <div class="grid st-form-grid st-form-grid--schedule-pair">
                <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')"><n-select v-model:value="form.scheduleType" :options="scheduleTypeOptions" /></n-form-item>
                <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')"><n-time-picker v-model:value="form.firstRunAt" format="HH:mm" clearable style="width: 100%;" :placeholder="executionTimePlaceholder" /></n-form-item>
              </div>
              <div class="grid st-form-grid st-form-grid--schedule-pair">
                <n-form-item :label="t('rightPanel.scheduledTasks.monthlyMode')"><n-select v-model:value="form.monthlyMode" :options="monthlyModeOptions" /></n-form-item>
                <n-form-item v-if="form.monthlyMode !== 'last_day'" :label="t('rightPanel.scheduledTasks.monthlyDay')"><n-input-number v-model:value="form.monthlyDay" :min="1" :max="31" style="width: 100%;" /></n-form-item>
              </div>
            </template>
            <template v-else-if="form.scheduleType === 'weekly'">
              <div class="grid st-form-grid st-form-grid--schedule-pair">
                <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')"><n-select v-model:value="form.scheduleType" :options="scheduleTypeOptions" /></n-form-item>
                <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')"><n-time-picker v-model:value="form.firstRunAt" format="HH:mm" clearable style="width: 100%;" :placeholder="executionTimePlaceholder" /></n-form-item>
              </div>
              <div class="grid st-form-grid st-form-grid--schedule-single">
                <n-form-item :label="t('rightPanel.scheduledTasks.weeklyDays')"><n-select v-model:value="form.weeklyDays" :options="weeklyDayOptions" multiple clearable /></n-form-item>
              </div>
            </template>
            <div class="grid st-form-grid st-form-grid--schedule-pair" v-else-if="form.scheduleType === 'workdays'">
              <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')"><n-select v-model:value="form.scheduleType" :options="scheduleTypeOptions" /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')"><n-time-picker v-model:value="form.firstRunAt" format="HH:mm" clearable style="width: 100%;" :placeholder="executionTimePlaceholder" /></n-form-item>
            </div>
            <div class="grid st-form-grid st-form-grid--schedule-pair" v-else-if="form.scheduleType === 'once'">
              <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')"><n-select v-model:value="form.scheduleType" :options="scheduleTypeOptions" /></n-form-item>
              <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')"><n-date-picker v-model:value="form.firstRunAt" type="datetime" clearable style="width: 100%;" :placeholder="t('rightPanel.scheduledTasks.firstRunAtPlaceholder')" /></n-form-item>
            </div>
          </section>

          <section class="panel st-panel">
            <div class="panel-title st-panel-title row-title">
              <span>{{ t('rightPanel.scheduledTasks.historyTitle') }}</span>
              <div class="history-actions">
                <button class="icon-btn" :title="showHistory ? t('common.collapse') : t('common.expand')" @click="toggleHistory">
                  <Icon :name="showHistory ? 'chevronDown' : 'chevronRight'" :size="14" />
                </button>
                <button v-if="showHistory" class="icon-btn" :title="t('common.refresh')" @click="loadRuns"><Icon name="refresh" :size="14" /></button>
              </div>
            </div>
            <div v-if="!showHistory" class="history-collapsed">
              {{ t('common.expand') }}
            </div>
            <div v-else-if="runsLoading" class="state-box small"><Icon name="clock" :size="14" class="spin" /><span>{{ t('common.loading') }}</span></div>
            <div v-else-if="!runs.length" class="state-box small"><span>{{ t('rightPanel.scheduledTasks.noRuns') }}</span></div>
            <div v-else class="runs st-run-list">
              <div v-for="run in runs" :key="run.id" class="run-card st-run-card">
                <div class="run-top">
                  <n-tag size="small" :type="runTagType(run.status)">{{ runStatusLabel(run.status) }}</n-tag>
                  <span>{{ runReasonLabel(run.triggerReason) }}</span>
                  <span>{{ formatTimestamp(run.finishedAt || run.startedAt) }}</span>
                </div>
                <div class="run-meta">
                  <span>{{ t('rightPanel.scheduledTasks.scheduledAt') }}: {{ formatTimestamp(run.scheduledAt) }}</span>
                  <span>{{ t('rightPanel.scheduledTasks.startedAt') }}: {{ formatTimestamp(run.startedAt) }}</span>
                  <span>{{ t('rightPanel.scheduledTasks.finishedAt') }}: {{ formatTimestamp(run.finishedAt) }}</span>
                </div>
                <div v-if="run.sessionId" class="mono run-session">{{ run.sessionId }}</div>
                <div v-if="run.errorMessage" class="run-error">{{ run.errorMessage }}</div>
              </div>
            </div>
          </section>
        </div>
      </div>

    </template>

    <n-modal
      v-model:show="showDeleteConfirm"
      preset="dialog"
      type="warning"
      :title="t('rightPanel.scheduledTasks.deleteConfirmTitle')"
      :content="t('rightPanel.scheduledTasks.deleteConfirmContent', { name: task?.name || '' })"
      :positive-text="t('common.delete')"
      :negative-text="t('common.cancel')"
      @positive-click="deleteTask"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { NButton, NDatePicker, NFormItem, NInput, NInputNumber, NModal, NSelect, NSwitch, NTag, NTimePicker, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import {
  buildIntervalAnchorOptions,
  buildScheduledTaskModelOptions,
  buildMonthlyModeOptions,
  getScheduledTaskModelLabel,
  buildScheduleTypeOptions,
  buildWeeklyDayOptions,
  createScheduledTaskFormDefaults,
  describeScheduledTask,
  formatScheduledTaskDateTime,
  isClockOnlyScheduledTaskType,
  resolveScheduledTaskEffectiveModelId,
  resolveScheduledTaskExecutionAt,
  resolveScheduledTaskModelId
} from '@utils/scheduled-task-meta'

const props = defineProps({ taskId: { type: Number, default: null }, currentProject: { type: Object, default: null } })
const emit = defineEmits(['close', 'updated', 'deleted'])
const { t } = useLocale()
const message = useMessage()
const DEFAULT_PROFILE = '__scheduled_task_default_profile__'
const loading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)
const showDeleteConfirm = ref(false)
const task = ref(null)
const runs = ref([])
const apiProfiles = ref([])
const serviceProviderDefinitions = ref([])
const defaultProfileId = ref(null)
const cleanupTaskChanged = ref(null)
const showHistory = ref(false)
const form = ref({ ...createScheduledTaskFormDefaults(''), apiProfileId: DEFAULT_PROFILE })

const scheduleTypeOptions = computed(() => buildScheduleTypeOptions(t))
const intervalAnchorOptions = computed(() => buildIntervalAnchorOptions(t))
const weeklyDayOptions = computed(() => buildWeeklyDayOptions(t))
const monthlyModeOptions = computed(() => buildMonthlyModeOptions(t))
const executionTimePlaceholder = computed(() => (
  isClockOnlyScheduledTaskType(form.value.scheduleType)
    ? t('rightPanel.scheduledTasks.runTimePlaceholder')
    : t('rightPanel.scheduledTasks.firstRunAtPlaceholder')
))
const resolvedFormApiProfileId = computed(() => form.value.apiProfileId === DEFAULT_PROFILE ? null : form.value.apiProfileId)
const baseModelOptions = computed(() => buildScheduledTaskModelOptions({
  apiProfiles: apiProfiles.value,
  serviceProviderDefinitions: serviceProviderDefinitions.value,
  defaultProfileId: defaultProfileId.value,
  apiProfileId: resolvedFormApiProfileId.value
}))
const modelOptions = computed(() => [
  { label: t('rightPanel.scheduledTasks.defaultModelId'), value: '' },
  ...baseModelOptions.value
])

watch(() => form.value.scheduleType, (nextType, previousType) => {
  if (!previousType || nextType === previousType) return
  if (!isClockOnlyScheduledTaskType(previousType) || isClockOnlyScheduledTaskType(nextType)) return
  form.value.firstRunAt = null
})

const defaultProfileLabel = computed(() => {
  const profile = apiProfiles.value.find(item => item.id === defaultProfileId.value)
  return profile?.name ? t('rightPanel.scheduledTasks.defaultProfileResolved', { name: profile.name }) : t('rightPanel.scheduledTasks.defaultProfile')
})
const apiProfileOptions = computed(() => [{ label: defaultProfileLabel.value, value: DEFAULT_PROFILE }, ...apiProfiles.value.map(profile => ({ label: profile.name, value: profile.id }))])
const resolveTaskModelId = (value) => resolveScheduledTaskModelId({
  apiProfiles: apiProfiles.value,
  serviceProviderDefinitions: serviceProviderDefinitions.value,
  defaultProfileId: defaultProfileId.value,
  apiProfileId: value?.apiProfileId || null
}, value?.modelId || '')
const resolveTaskEffectiveModelId = (value) => resolveScheduledTaskEffectiveModelId({
  apiProfiles: apiProfiles.value,
  serviceProviderDefinitions: serviceProviderDefinitions.value,
  defaultProfileId: defaultProfileId.value,
  apiProfileId: value?.apiProfileId || null
}, value?.modelId || '')

const syncForm = (value) => {
  form.value = {
    name: value?.name || '',
    prompt: value?.prompt || '',
    cwd: value?.cwd || '',
    apiProfileId: value?.apiProfileId || DEFAULT_PROFILE,
    modelId: resolveTaskModelId(value),
    maxRuns: value?.maxRuns || null,
    resetCountOnEnable: !!value?.resetCountOnEnable,
    intervalAnchorMode: value?.intervalAnchorMode || 'started_at',
    enabled: !!value?.enabled,
    scheduleType: value?.scheduleType || 'interval',
    intervalMinutes: value?.intervalMinutes || 60,
    weeklyDays: Array.isArray(value?.weeklyDays) && value.weeklyDays.length ? [...value.weeklyDays] : [1],
    monthlyMode: value?.monthlyMode === 'last_day' ? 'last_day' : 'day_of_month',
    monthlyDay: value?.monthlyDay || 1,
    firstRunAt: resolveScheduledTaskExecutionAt(value)
  }
}

const loadRuns = async () => {
  if (!props.taskId) return
  runsLoading.value = true
  try {
    const data = await window.electronAPI.listScheduledTaskRuns({ taskId: props.taskId, limit: 20 })
    runs.value = Array.isArray(data) ? data : []
  } finally {
    runsLoading.value = false
  }
}

const loadData = async () => {
  if (!props.taskId) return
  loading.value = true
  try {
    const [taskList, profiles, config] = await Promise.all([window.electronAPI.listScheduledTasks(), window.electronAPI.listAPIProfiles?.() || Promise.resolve([]), window.electronAPI.getConfig?.() || Promise.resolve(null)])
    task.value = Array.isArray(taskList) ? taskList.find(item => item.id === props.taskId) || null : null
    apiProfiles.value = Array.isArray(profiles) ? profiles : []
    defaultProfileId.value = config?.defaultProfileId || null
    serviceProviderDefinitions.value = Array.isArray(config?.serviceProviderDefinitions) ? config.serviceProviderDefinitions : []
    syncForm(task.value)
    await loadRuns()
  } catch (err) {
    console.error('[ScheduledTaskDetailPanel] loadData failed:', err)
    message.error(err.message || t('agent.loadFailed'))
  } finally {
    loading.value = false
  }
}

const saveTask = async () => {
  if (!props.taskId) return
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      prompt: form.value.prompt.trim(),
      cwd: form.value.cwd?.trim() || null,
      apiProfileId: form.value.apiProfileId === DEFAULT_PROFILE ? null : form.value.apiProfileId,
      modelId: form.value.modelId || null,
      maxRuns: form.value.maxRuns ?? null,
      resetCountOnEnable: !!form.value.resetCountOnEnable,
      intervalAnchorMode: form.value.intervalAnchorMode || 'started_at',
      enabled: !!form.value.enabled,
      scheduleType: form.value.scheduleType,
      intervalMinutes: form.value.intervalMinutes ?? null,
      weeklyDays: Array.isArray(form.value.weeklyDays) ? [...form.value.weeklyDays] : [],
      monthlyMode: form.value.monthlyMode,
      monthlyDay: form.value.monthlyMode === 'last_day' ? null : (form.value.monthlyDay ?? null),
      firstRunAt: form.value.firstRunAt ?? null
    }
    const result = await window.electronAPI.updateScheduledTask({ taskId: props.taskId, updates: payload })
    if (result?.error) throw new Error(result.error)
    await loadData()
    emit('updated', props.taskId)
    message.success(t('globalSettings.saveSuccess'))
  } catch (err) {
    message.error(err.message || t('agent.saveFailed'))
  } finally {
    saving.value = false
  }
}

const runNow = async () => {
  if (!task.value) return
  try {
    const result = await window.electronAPI.runScheduledTaskNow(task.value.id)
    if (result?.error) throw new Error(result.error)
    message.success(t('rightPanel.scheduledTasks.runQueued'))
    await loadData()
  } catch (err) {
    message.error(err.message || t('rightPanel.scheduledTasks.runFailed'))
  }
}

const deleteTask = async () => {
  if (!task.value) return
  const result = await window.electronAPI.deleteScheduledTask(task.value.id)
  if (result?.error) {
    message.error(result.error)
    return
  }
  emit('deleted', task.value.id)
  message.success(t('common.deleteSuccess'))
}

const pickFolder = async () => {
  const folder = await window.electronAPI.selectFolder()
  if (folder) form.value.cwd = folder
}

const describeSchedule = (value) => describeScheduledTask(value, t, weeklyDayOptions.value)
const getTaskModelLabel = (value) => getScheduledTaskModelLabel(resolveTaskEffectiveModelId(value), t)
const formatTimestamp = (value) => formatScheduledTaskDateTime(value)
const runTagType = (status) => status === 'success' ? 'success' : status === 'failed' ? 'error' : status === 'skipped' ? 'warning' : 'default'
const runStatusLabel = (status) => status === 'success' ? t('rightPanel.scheduledTasks.runStatusSuccess') : status === 'failed' ? t('rightPanel.scheduledTasks.runStatusFailed') : status === 'skipped' ? t('rightPanel.scheduledTasks.runStatusSkipped') : status
const runReasonLabel = (reason) => reason === 'manual' ? t('rightPanel.scheduledTasks.runReasonManual') : reason === 'startup' ? t('rightPanel.scheduledTasks.runReasonStartup') : t('rightPanel.scheduledTasks.runReasonScheduled')
const toggleHistory = async () => {
  showHistory.value = !showHistory.value
  if (showHistory.value && !runs.value.length) {
    await loadRuns()
  }
}

watch(() => props.taskId, loadData, { immediate: true })
watch([resolvedFormApiProfileId, apiProfiles, serviceProviderDefinitions, defaultProfileId], () => {
  const nextModelId = resolveScheduledTaskModelId({
    apiProfiles: apiProfiles.value,
    serviceProviderDefinitions: serviceProviderDefinitions.value,
    defaultProfileId: defaultProfileId.value,
    apiProfileId: resolvedFormApiProfileId.value
  }, form.value.modelId)

  if (form.value.modelId !== nextModelId) {
    form.value.modelId = nextModelId
  }
}, { deep: true })

onMounted(() => {
  if (window.electronAPI?.onScheduledTaskChanged) {
    cleanupTaskChanged.value = window.electronAPI.onScheduledTaskChanged(async (payload) => {
      if (!props.taskId || (payload?.taskId && payload.taskId !== props.taskId)) return
      await loadData()
    })
  }
})

onUnmounted(() => {
  if (cleanupTaskChanged.value) cleanupTaskChanged.value()
})
</script>

<style src="@/styles/scheduled-task-common.css"></style>

<style scoped>
.task-detail{display:flex;flex-direction:column;gap:12px;padding:16px}.header,.title-row,.title-line,.header-actions,.title-meta,.run-top,.row-title,.history-actions{display:flex;align-items:center;gap:10px}.header{justify-content:space-between;align-items:flex-start}.icon-wrap{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primary-ghost,rgba(59,130,246,.12));color:var(--primary-color);flex-shrink:0}.title-copy{min-width:0}.title-line{flex-wrap:wrap}.title-line h3{margin:0;font-size:20px;font-weight:700}.title-meta{margin-top:4px;color:var(--text-color-secondary);font-size:13px;flex-wrap:wrap}.summary-grid,.grid,.layout{display:grid;gap:10px}.summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.summary-card{border:1px solid var(--border-color);background:var(--card-bg);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}.summary-card span,.run-top span,.run-error,.run-session,.state-box,.history-collapsed{color:var(--text-color-secondary);font-size:12px}.layout{grid-template-columns:minmax(0,1.1fr) minmax(420px,.9fr);align-items:stretch}.main-col,.side-col{display:flex;flex-direction:column;gap:12px}.main-col{height:100%}.basic-grid{grid-template-columns:minmax(220px,.9fr) minmax(320px,1.1fr)}.compact-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.schedule-top-grid{grid-template-columns:minmax(0,1.2fr) 110px minmax(0,1fr);align-items:start}.schedule-enabled-item :deep(.n-form-item-blank){min-height:40px;align-items:center}.schedule-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:2px;gap:8px 10px}.schedule-first-run-grid{margin-top:0}.prompt-panel{flex:1;display:flex;flex-direction:column}.prompt-form-item{flex:1}.prompt-panel :deep(.n-form-item-blank),.prompt-panel :deep(.n-input),.prompt-panel :deep(.n-input-wrapper),.prompt-panel :deep(.n-input__textarea){height:100%}.prompt-panel :deep(textarea){min-height:260px!important;resize:vertical}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}.run-top{justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.run-error{color:var(--warning-color,#d97706)}.history-collapsed{padding:2px 0 0}.icon-btn{width:32px;height:32px;border:1px solid var(--border-color);background:var(--card-bg);color:var(--text-color-secondary);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.2s}.icon-btn:hover{color:var(--primary-color);border-color:var(--primary-color)}.state-box{min-height:100px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px}.state-box.small{min-height:64px}.spin{animation:rotate .9s linear infinite}.panel :deep(.n-form-item){margin-bottom:6px}.panel :deep(.n-form-item:last-child){margin-bottom:0}@keyframes rotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}@media (max-width:900px){.summary-grid,.compact-grid,.schedule-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.schedule-top-grid{grid-template-columns:1fr}.layout{grid-template-columns:1fr}.main-col{height:auto}.prompt-panel :deep(textarea){min-height:220px!important}}@media (max-width:760px){.header,.header-actions,.title-row,.summary-grid,.basic-grid,.compact-grid,.schedule-detail-grid,.schedule-top-grid{display:grid;grid-template-columns:1fr}}
</style>

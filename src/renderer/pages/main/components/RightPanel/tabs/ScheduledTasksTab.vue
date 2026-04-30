<template>
  <div class="tab-container">
    <div class="tab-header" v-if="!props.embedded">
      <span class="tab-title">{{ t('rightPanel.tabs.scheduledTasks') }} ({{ filteredTasks.length }})</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.scheduledTasks.refresh')" @click="loadTasks">
          <Icon name="refresh" :size="14" />
        </button>
        <button class="icon-btn primary" :title="t('rightPanel.scheduledTasks.create')" @click="openCreateModal">
          <Icon name="plus" :size="14" />
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <div class="toolbar-row">
        <n-input v-model:value="searchText" :placeholder="t('rightPanel.scheduledTasks.search')" size="small" clearable style="flex: 1;">
          <template #prefix><Icon name="search" :size="14" /></template>
        </n-input>
        <n-select v-model:value="statusFilter" size="small" :options="statusOptions" class="status-select" />
      </div>
    </div>

    <div class="tab-content">
      <div v-if="loading" class="loading-state">
        <Icon name="clock" :size="16" class="loading-icon" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="!filteredTasks.length" class="empty-state">
        <div class="empty-icon"><Icon name="clock" :size="48" /></div>
        <div class="empty-text">{{ t('rightPanel.scheduledTasks.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.scheduledTasks.emptyHint') }}</div>
      </div>

      <div v-else class="tasks-layout">
        <div class="tasks-list">
          <div
            v-for="task in filteredTasks"
            :key="task.id"
            class="task-card"
            :class="{ active: selectedTaskId === task.id }"
            @click="selectedTaskId = task.id"
          >
            <div class="task-head">
              <div class="task-title-row">
                <span class="task-title">{{ task.name }}</span>
                <n-tag size="small" :type="task.enabled ? 'success' : 'default'">
                  {{ task.enabled ? t('rightPanel.scheduledTasks.enabled') : t('rightPanel.scheduledTasks.disabled') }}
                </n-tag>
              </div>
              <div class="task-meta">
                <span>{{ describeSchedule(task) }}</span>
              </div>
            </div>

            <div class="task-body">
              <div class="task-line">
                <Icon name="folder" :size="12" />
                <span>{{ task.cwd || t('rightPanel.scheduledTasks.defaultWorkspace') }}</span>
              </div>
              <div class="task-line">
                <Icon name="zap" :size="12" />
                <span>{{ t('rightPanel.scheduledTasks.modelId') }}: {{ getTaskModelLabel(task) }}</span>
              </div>
              <div class="task-line">
                <Icon name="clock" :size="12" />
                <span>{{ t('rightPanel.scheduledTasks.nextRun') }}: {{ formatTimestamp(task.nextRunAt) }}</span>
              </div>
              <div class="task-line" v-if="task.lastRunAt">
                <Icon name="history" :size="12" />
                <span>{{ t('rightPanel.scheduledTasks.lastCompletedAt') }}: {{ formatTimestamp(task.lastRunAt) }}</span>
              </div>
              <div class="task-line error" v-if="task.lastError">
                <Icon name="warning" :size="12" />
                <span>{{ task.lastError }}</span>
              </div>
            </div>

            <div class="task-actions-row">
              <button class="icon-btn inline" :title="t('rightPanel.scheduledTasks.runNow')" @click.stop="handleRunNow(task)">
                <Icon name="play" :size="14" />
              </button>
              <button class="icon-btn inline" :title="t('common.history')" @click.stop="openRunsModal(task)">
                <Icon name="history" :size="14" />
              </button>
              <button class="icon-btn inline" :title="t('common.edit')" @click.stop="openEditModal(task)">
                <Icon name="edit" :size="14" />
              </button>
              <button class="icon-btn inline" :title="task.enabled ? t('common.disabled') : t('common.enabled')" @click.stop="toggleEnabled(task)">
                <Icon :name="task.enabled ? 'pause' : 'play'" :size="14" />
              </button>
              <button class="icon-btn inline" :title="t('common.delete')" @click.stop="confirmDelete(task)">
                <Icon name="delete" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <n-modal
      v-model:show="showModal"
      preset="dialog"
      class="scheduled-task-modal"
      style="width: min(960px, calc(100vw - 32px));"
      :title="editingTaskId ? t('rightPanel.scheduledTasks.editTask') : t('rightPanel.scheduledTasks.createTask')"
    >
      <n-form label-placement="top" class="task-form">
        <div class="task-grid task-grid-primary st-form-grid st-form-grid--primary">
          <n-form-item :label="t('rightPanel.scheduledTasks.taskName')">
            <n-input v-model:value="form.name" :placeholder="t('rightPanel.scheduledTasks.taskNamePlaceholder')" />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.workingDirectory')">
            <div class="cwd-field st-cwd-field">
              <n-input v-model:value="form.cwd" :placeholder="t('rightPanel.scheduledTasks.defaultWorkspace')" />
              <n-button @click="pickFolder">{{ t('rightPanel.scheduledTasks.browse') }}</n-button>
            </div>
          </n-form-item>
        </div>
        <n-form-item :label="t('rightPanel.scheduledTasks.prompt')">
          <n-input
            v-model:value="form.prompt"
            type="textarea"
            :placeholder="t('rightPanel.scheduledTasks.promptPlaceholder')"
            :autosize="{ minRows: 5, maxRows: 10 }"
          />
        </n-form-item>
        <div class="task-grid task-grid-config st-form-grid st-form-grid--config">
          <n-form-item :label="t('rightPanel.scheduledTasks.apiProfile')">
            <n-select
              v-model:value="form.apiProfileId"
              :options="apiProfileOptions"
              :placeholder="t('rightPanel.scheduledTasks.apiProfilePlaceholder')"
              clearable
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.modelId')">
            <n-select
              v-model:value="form.modelId"
              :options="modelOptions"
              :placeholder="t('rightPanel.scheduledTasks.modelIdPlaceholder')"
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.maxRuns')">
            <n-input-number
              v-model:value="form.maxRuns"
              :min="1"
              :placeholder="t('rightPanel.scheduledTasks.maxRunsPlaceholder')"
              style="width: 100%;"
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.resetCountOnEnable')">
            <n-switch v-model:value="form.resetCountOnEnable" />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.enabled')">
            <n-switch v-model:value="form.enabled" />
          </n-form-item>
        </div>
        <template v-if="form.scheduleType === 'interval'">
          <div class="task-grid st-form-grid st-form-grid--schedule-pair">
            <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')">
              <n-select
                v-model:value="form.scheduleType"
                :options="scheduleTypeOptions"
                :placeholder="t('rightPanel.scheduledTasks.scheduleTypePlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')">
              <n-date-picker
                v-model:value="form.firstRunAt"
                type="datetime"
                placement="bottom-end"
                clearable
                style="width: 100%;"
                :placeholder="t('rightPanel.scheduledTasks.firstRunAtPlaceholder')"
              />
            </n-form-item>
          </div>
          <div class="task-grid st-form-grid st-form-grid--schedule-pair">
            <n-form-item :label="t('rightPanel.scheduledTasks.intervalMinutes')">
              <n-input-number
                v-model:value="form.intervalMinutes"
                :min="1"
                :placeholder="t('rightPanel.scheduledTasks.intervalMinutesPlaceholder')"
                style="width: 100%;"
              />
            </n-form-item>
            <n-form-item :label="t('rightPanel.scheduledTasks.intervalAnchorMode')">
              <n-select
                v-model:value="form.intervalAnchorMode"
                :options="intervalAnchorOptions"
                style="width: 100%;"
              />
            </n-form-item>
          </div>
        </template>
        <div class="task-grid st-form-grid st-form-grid--schedule-pair" v-else-if="form.scheduleType === 'daily'">
          <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')">
            <n-select
              v-model:value="form.scheduleType"
              :options="scheduleTypeOptions"
              :placeholder="t('rightPanel.scheduledTasks.scheduleTypePlaceholder')"
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')">
            <n-time-picker
              v-model:value="form.firstRunAt"
              format="HH:mm"
              placement="bottom-end"
              clearable
              style="width: 100%;"
              :placeholder="executionTimePlaceholder"
            />
          </n-form-item>
        </div>
        <template v-else-if="form.scheduleType === 'weekly'">
          <div class="task-grid st-form-grid st-form-grid--schedule-pair">
            <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')">
              <n-select
                v-model:value="form.scheduleType"
                :options="scheduleTypeOptions"
                :placeholder="t('rightPanel.scheduledTasks.scheduleTypePlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')">
              <n-time-picker
                v-model:value="form.firstRunAt"
                format="HH:mm"
                placement="bottom-end"
                clearable
                style="width: 100%;"
                :placeholder="executionTimePlaceholder"
              />
            </n-form-item>
          </div>
          <div class="task-grid st-form-grid st-form-grid--schedule-single">
            <n-form-item :label="t('rightPanel.scheduledTasks.weeklyDays')">
              <n-select
                v-model:value="form.weeklyDays"
                :options="weeklyDayOptions"
                :placeholder="t('rightPanel.scheduledTasks.weeklyDaysPlaceholder')"
                multiple
                clearable
              />
            </n-form-item>
          </div>
        </template>
        <template v-else-if="form.scheduleType === 'monthly'">
          <div class="task-grid st-form-grid st-form-grid--schedule-pair">
            <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')">
              <n-select
                v-model:value="form.scheduleType"
                :options="scheduleTypeOptions"
                :placeholder="t('rightPanel.scheduledTasks.scheduleTypePlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')">
              <n-time-picker
                v-model:value="form.firstRunAt"
                format="HH:mm"
                placement="bottom-end"
                clearable
                style="width: 100%;"
                :placeholder="executionTimePlaceholder"
              />
            </n-form-item>
          </div>
          <div class="task-grid st-form-grid st-form-grid--schedule-pair">
            <n-form-item :label="t('rightPanel.scheduledTasks.monthlyMode')">
              <n-select
                v-model:value="form.monthlyMode"
                :options="monthlyModeOptions"
                :placeholder="t('rightPanel.scheduledTasks.monthlyModePlaceholder')"
              />
            </n-form-item>
            <n-form-item v-if="form.monthlyMode !== 'last_day'" :label="t('rightPanel.scheduledTasks.monthlyDay')">
              <n-input-number
                v-model:value="form.monthlyDay"
                :min="1"
                :max="31"
                :placeholder="t('rightPanel.scheduledTasks.monthlyDayPlaceholder')"
                style="width: 100%;"
              />
            </n-form-item>
          </div>
        </template>
        <div class="task-grid st-form-grid st-form-grid--schedule-pair" v-else-if="form.scheduleType === 'workdays'">
          <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')">
            <n-select
              v-model:value="form.scheduleType"
              :options="scheduleTypeOptions"
              :placeholder="t('rightPanel.scheduledTasks.scheduleTypePlaceholder')"
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')">
            <n-time-picker
              v-model:value="form.firstRunAt"
              format="HH:mm"
              placement="bottom-end"
              clearable
              style="width: 100%;"
              :placeholder="executionTimePlaceholder"
            />
          </n-form-item>
        </div>
        <div class="task-grid st-form-grid st-form-grid--schedule-pair" v-else-if="form.scheduleType === 'once'">
          <n-form-item :label="t('rightPanel.scheduledTasks.scheduleType')">
            <n-select
              v-model:value="form.scheduleType"
              :options="scheduleTypeOptions"
              :placeholder="t('rightPanel.scheduledTasks.scheduleTypePlaceholder')"
            />
          </n-form-item>
          <n-form-item :label="t('rightPanel.scheduledTasks.firstRunAt')">
            <n-date-picker
              v-model:value="form.firstRunAt"
              type="datetime"
              placement="bottom-end"
              clearable
              style="width: 100%;"
              :placeholder="t('rightPanel.scheduledTasks.firstRunAtPlaceholder')"
            />
          </n-form-item>
        </div>
      </n-form>
      <template #action>
        <n-button @click="showModal = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="saveTask">{{ t('common.save') }}</n-button>
      </template>
    </n-modal>

    <n-modal
      v-model:show="showDeleteConfirm"
      preset="dialog"
      type="warning"
      :title="t('rightPanel.scheduledTasks.deleteConfirmTitle')"
      :content="t('rightPanel.scheduledTasks.deleteConfirmContent', { name: deleteTarget?.name || '' })"
      :positive-text="t('common.delete')"
      :negative-text="t('common.cancel')"
      @positive-click="handleDelete"
    />

    <n-modal
      v-model:show="showRunsModal"
      preset="dialog"
      class="scheduled-task-runs-modal"
      style="width: min(760px, calc(100vw - 32px));"
      :title="historyTarget ? `${historyTarget.name} · ${t('common.history')}` : t('common.history')"
    >
      <div v-if="historyTarget" class="history-modal">
        <div class="history-summary-grid st-history-grid">
          <div class="history-summary-item st-history-item">
            <span class="detail-label">{{ t('rightPanel.scheduledTasks.scheduleType') }}</span>
            <span>{{ describeSchedule(historyTarget) }}</span>
          </div>
          <div class="history-summary-item st-history-item">
            <span class="detail-label">{{ t('rightPanel.scheduledTasks.modelId') }}</span>
            <span>{{ getTaskModelLabel(historyTarget) }}</span>
          </div>
          <div class="history-summary-item st-history-item">
            <span class="detail-label">{{ t('rightPanel.scheduledTasks.workingDirectory') }}</span>
            <span>{{ historyTarget.cwd || t('rightPanel.scheduledTasks.defaultWorkspace') }}</span>
          </div>
          <div class="history-summary-item st-history-item">
            <span class="detail-label">{{ t('rightPanel.scheduledTasks.nextRun') }}</span>
            <span>{{ formatTimestamp(historyTarget.nextRunAt) }}</span>
          </div>
          <div class="history-summary-item st-history-item">
            <span class="detail-label">{{ t('rightPanel.scheduledTasks.lastStartedAt') }}</span>
            <span>{{ formatTimestamp(historyTarget.lastStartedAt) }}</span>
          </div>
          <div class="history-summary-item st-history-item">
            <span class="detail-label">{{ t('rightPanel.scheduledTasks.lastCompletedAt') }}</span>
            <span>{{ formatTimestamp(historyTarget.lastRunAt) }}</span>
          </div>
          <div class="history-summary-item st-history-item">
            <span class="detail-label">{{ t('rightPanel.scheduledTasks.runCount') }}</span>
            <span>{{ historyTarget.runCount || 0 }}{{ historyTarget.maxRuns ? ` / ${historyTarget.maxRuns}` : '' }}</span>
          </div>
        </div>

        <div class="detail-block">
          <div class="detail-label">{{ t('rightPanel.scheduledTasks.recentRuns') }}</div>
          <div v-if="runsLoading" class="detail-placeholder st-detail-placeholder">
            <Icon name="clock" :size="14" class="loading-icon" />
            <span>{{ t('common.loading') }}</span>
          </div>
          <div v-else-if="!selectedTaskRuns.length" class="detail-placeholder st-detail-placeholder">
            {{ t('rightPanel.scheduledTasks.noRuns') }}
          </div>
          <div v-else class="runs-list st-run-list">
            <div v-for="run in selectedTaskRuns" :key="run.id" class="run-item st-run-card">
              <div class="run-top">
                <n-tag size="small" :type="runTagType(run.status)">{{ runStatusLabel(run.status) }}</n-tag>
                <span class="run-reason">{{ runReasonLabel(run.triggerReason) }}</span>
                <span class="run-time">{{ formatTimestamp(run.finishedAt || run.startedAt) }}</span>
              </div>
              <div class="run-meta">
                <span>{{ t('rightPanel.scheduledTasks.scheduledAt') }}: {{ formatTimestamp(run.scheduledAt) }}</span>
                <span>{{ t('rightPanel.scheduledTasks.startedAt') }}: {{ formatTimestamp(run.startedAt) }}</span>
                <span>{{ t('rightPanel.scheduledTasks.finishedAt') }}: {{ formatTimestamp(run.finishedAt) }}</span>
              </div>
              <div v-if="run.errorMessage" class="run-error">{{ run.errorMessage }}</div>
            </div>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NInput, NSelect, NButton, NSwitch, NModal, NForm, NFormItem, NInputNumber, NTag, NDatePicker, NTimePicker, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import {
  buildIntervalAnchorOptions,
  buildMonthlyModeOptions,
  buildScheduledTaskModelOptions,
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

const props = defineProps({
  currentProject: Object,
  embedded: {
    type: Boolean,
    default: false
  },
  openRequest: {
    type: Object,
    default: null
  }
})

const { t } = useLocale()
const message = useMessage()
const DEFAULT_PROFILE_OPTION_VALUE = '__scheduled_task_default_profile__'

const loading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)
const searchText = ref('')
const statusFilter = ref('all')
const tasks = ref([])
const apiProfiles = ref([])
const serviceProviderDefinitions = ref([])
const defaultProfileId = ref(null)
const selectedTaskId = ref(null)
const selectedTaskRuns = ref([])
const showRunsModal = ref(false)
const historyTaskId = ref(null)
const showModal = ref(false)
const editingTaskId = ref(null)
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null)
let cleanupTaskChanged = null

const form = ref(createDefaultForm())

function createDefaultForm() {
  return {
    ...createScheduledTaskFormDefaults(props.currentProject?.path || ''),
    apiProfileId: DEFAULT_PROFILE_OPTION_VALUE,
  }
}

const statusOptions = computed(() => [
  { label: t('rightPanel.scheduledTasks.statusAll'), value: 'all' },
  { label: t('rightPanel.scheduledTasks.enabled'), value: 'enabled' },
  { label: t('rightPanel.scheduledTasks.disabled'), value: 'disabled' }
])

const scheduleTypeOptions = computed(() => buildScheduleTypeOptions(t))
const intervalAnchorOptions = computed(() => buildIntervalAnchorOptions(t))
const monthlyModeOptions = computed(() => buildMonthlyModeOptions(t))
const weeklyDayOptions = computed(() => buildWeeklyDayOptions(t))
const executionTimePlaceholder = computed(() => (
  isClockOnlyScheduledTaskType(form.value.scheduleType)
    ? t('rightPanel.scheduledTasks.runTimePlaceholder')
    : t('rightPanel.scheduledTasks.firstRunAtPlaceholder')
))
const resolvedFormApiProfileId = computed(() => form.value.apiProfileId === DEFAULT_PROFILE_OPTION_VALUE ? null : form.value.apiProfileId)
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
  if (profile?.name) {
    return t('rightPanel.scheduledTasks.defaultProfileResolved', { name: profile.name })
  }
  return t('rightPanel.scheduledTasks.defaultProfile')
})

const apiProfileOptions = computed(() => [
  { label: defaultProfileLabel.value, value: DEFAULT_PROFILE_OPTION_VALUE },
  ...apiProfiles.value.map(profile => ({ label: profile.name, value: profile.id }))
])

const resolveTaskModelId = (task) => resolveScheduledTaskModelId({
  apiProfiles: apiProfiles.value,
  serviceProviderDefinitions: serviceProviderDefinitions.value,
  defaultProfileId: defaultProfileId.value,
  apiProfileId: task?.apiProfileId || null
}, task?.modelId || '')
const resolveTaskEffectiveModelId = (task) => resolveScheduledTaskEffectiveModelId({
  apiProfiles: apiProfiles.value,
  serviceProviderDefinitions: serviceProviderDefinitions.value,
  defaultProfileId: defaultProfileId.value,
  apiProfileId: task?.apiProfileId || null
}, task?.modelId || '')

const filteredTasks = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  return tasks.value.filter(task => {
    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'enabled' && task.enabled)
      || (statusFilter.value === 'disabled' && !task.enabled)

    if (!matchesStatus) return false
    if (!keyword) return true
    return (task.name || '').toLowerCase().includes(keyword)
      || (task.prompt || '').toLowerCase().includes(keyword)
      || (task.cwd || '').toLowerCase().includes(keyword)
  })
})

const applyOpenRequest = async () => {
  const request = props.openRequest
  if (!request?.nonce) return

  if (request.taskId) {
    selectedTaskId.value = request.taskId
  }

  if (request.action === 'create') {
    openCreateModal()
    return
  }

  const task = request.taskId
    ? tasks.value.find(item => item.id === request.taskId)
    : null

  if (!task) return

  if (request.action === 'edit') {
    openEditModal(task)
    return
  }

  if (request.action === 'history') {
    await openRunsModal(task)
  }
}

const historyTarget = computed(() => tasks.value.find(task => task.id === historyTaskId.value) || null)

const loadTasks = async () => {
  loading.value = true
  try {
    const [taskList, profiles, config] = await Promise.all([
      window.electronAPI.listScheduledTasks(),
      window.electronAPI.listAPIProfiles?.() || Promise.resolve([]),
      window.electronAPI.getConfig?.() || Promise.resolve(null)
    ])
    tasks.value = Array.isArray(taskList) ? taskList : []
    apiProfiles.value = Array.isArray(profiles) ? profiles : []
    defaultProfileId.value = config?.defaultProfileId || null
    serviceProviderDefinitions.value = Array.isArray(config?.serviceProviderDefinitions) ? config.serviceProviderDefinitions : []

    if (!selectedTaskId.value && tasks.value.length > 0) {
      selectedTaskId.value = tasks.value[0].id
    } else if (selectedTaskId.value && !tasks.value.some(task => task.id === selectedTaskId.value)) {
      selectedTaskId.value = tasks.value[0]?.id || null
    }

    await applyOpenRequest()
  } catch (err) {
    console.error('[ScheduledTasksTab] loadTasks failed:', err)
    message.error(err.message || t('agent.loadFailed'))
  } finally {
    loading.value = false
  }
}

const loadTaskRuns = async (taskId) => {
  if (!taskId) {
    selectedTaskRuns.value = []
    return
  }

  runsLoading.value = true
  try {
    const runs = await window.electronAPI.listScheduledTaskRuns({ taskId, limit: 12 })
    selectedTaskRuns.value = Array.isArray(runs) ? runs : []
  } catch (err) {
    console.error('[ScheduledTasksTab] loadTaskRuns failed:', err)
    selectedTaskRuns.value = []
  } finally {
    runsLoading.value = false
  }
}

const openCreateModal = () => {
  editingTaskId.value = null
  form.value = createDefaultForm()
  showModal.value = true
}

const openEditModal = (task) => {
  selectedTaskId.value = task.id
  editingTaskId.value = task.id
  form.value = {
    name: task.name || '',
    prompt: task.prompt || '',
    cwd: task.cwd || '',
    apiProfileId: task.apiProfileId || DEFAULT_PROFILE_OPTION_VALUE,
    modelId: resolveTaskModelId(task),
    maxRuns: task.maxRuns || null,
    resetCountOnEnable: !!task.resetCountOnEnable,
    intervalAnchorMode: task.intervalAnchorMode || 'started_at',
    enabled: !!task.enabled,
    scheduleType: task.scheduleType || 'interval',
    intervalMinutes: task.intervalMinutes || 60,
    weeklyDays: Array.isArray(task.weeklyDays) ? [...task.weeklyDays] : [1],
    monthlyMode: task.monthlyMode === 'last_day' ? 'last_day' : 'day_of_month',
    monthlyDay: task.monthlyDay || 1,
    firstRunAt: resolveScheduledTaskExecutionAt(task)
  }
  showModal.value = true
}

const openRunsModal = async (task) => {
  selectedTaskId.value = task.id
  historyTaskId.value = task.id
  showRunsModal.value = true
  await loadTaskRuns(task.id)
}

const saveTask = async () => {
  saving.value = true
  try {
    const payload = {
      ...form.value,
      apiProfileId: form.value.apiProfileId === DEFAULT_PROFILE_OPTION_VALUE ? null : form.value.apiProfileId,
      cwd: form.value.cwd?.trim() || null,
      resetCountOnEnable: !!form.value.resetCountOnEnable,
      monthlyMode: form.value.monthlyMode,
      monthlyDay: form.value.monthlyMode === 'last_day' ? null : (form.value.monthlyDay ?? null),
      intervalAnchorMode: form.value.intervalAnchorMode || 'started_at',
      firstRunAt: form.value.firstRunAt ?? null
    }
    const result = editingTaskId.value
      ? await window.electronAPI.updateScheduledTask({ taskId: editingTaskId.value, updates: payload })
      : await window.electronAPI.createScheduledTask(payload)

    if (result?.error) throw new Error(result.error)

    showModal.value = false
    await loadTasks()
    if (result?.id) {
      selectedTaskId.value = result.id
    }
    if (showRunsModal.value && historyTaskId.value) {
      await loadTaskRuns(historyTaskId.value)
    }
    message.success(t('globalSettings.saveSuccess'))
  } catch (err) {
    message.error(err.message || t('agent.saveFailed'))
  } finally {
    saving.value = false
  }
}

const handleRunNow = async (task) => {
  try {
    const result = await window.electronAPI.runScheduledTaskNow(task.id)
    if (result?.error) throw new Error(result.error)
    message.success(t('rightPanel.scheduledTasks.runQueued'))
    await loadTasks()
    if (showRunsModal.value && historyTaskId.value === task.id) {
      await loadTaskRuns(task.id)
    }
  } catch (err) {
    message.error(err.message || t('rightPanel.scheduledTasks.runFailed'))
  }
}

const toggleEnabled = async (task) => {
  const result = await window.electronAPI.updateScheduledTask({
    taskId: task.id,
    updates: { enabled: !task.enabled }
  })
  if (result?.error) {
    message.error(result.error)
    return
  }
  await loadTasks()
  if (showRunsModal.value && historyTaskId.value === task.id) {
    await loadTaskRuns(task.id)
  }
}

const confirmDelete = (task) => {
  deleteTarget.value = task
  showDeleteConfirm.value = true
}

const handleDelete = async () => {
  if (!deleteTarget.value) return
  const result = await window.electronAPI.deleteScheduledTask(deleteTarget.value.id)
  if (result?.error) {
    message.error(result.error)
    return
  }
  showDeleteConfirm.value = false
  if (selectedTaskId.value === deleteTarget.value.id) {
    selectedTaskId.value = null
  }
  if (historyTaskId.value === deleteTarget.value.id) {
    historyTaskId.value = null
    showRunsModal.value = false
  }
  await loadTasks()
  if (showRunsModal.value && historyTaskId.value) {
    await loadTaskRuns(historyTaskId.value)
  } else {
    selectedTaskRuns.value = []
  }
}

const pickFolder = async () => {
  const folder = await window.electronAPI.selectFolder()
  if (folder) {
    form.value.cwd = folder
  }
}

const getProfileName = (profileId) => {
  if (!profileId) return defaultProfileLabel.value
  const profile = apiProfiles.value.find(item => item.id === profileId)
  return profile?.name || null
}

const getModelTierLabel = (tier) => {
  return getScheduledTaskModelLabel(tier, t)
}

const getTaskModelLabel = (task) => {
  return getModelTierLabel(resolveTaskEffectiveModelId(task))
}

const describeSchedule = (task) => {
  return describeScheduledTask(task, t, weeklyDayOptions.value)
}

const formatTimestamp = (value) => formatScheduledTaskDateTime(value)

const runTagType = (status) => {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'skipped') return 'warning'
  return 'default'
}

const runStatusLabel = (status) => {
  if (status === 'success') return t('rightPanel.scheduledTasks.runStatusSuccess')
  if (status === 'failed') return t('rightPanel.scheduledTasks.runStatusFailed')
  if (status === 'skipped') return t('rightPanel.scheduledTasks.runStatusSkipped')
  return status
}

const runReasonLabel = (reason) => {
  if (reason === 'manual') return t('rightPanel.scheduledTasks.runReasonManual')
  if (reason === 'startup') return t('rightPanel.scheduledTasks.runReasonStartup')
  return t('rightPanel.scheduledTasks.runReasonScheduled')
}

watch(() => props.currentProject?.path, (path) => {
  if (!showModal.value || editingTaskId.value || form.value.cwd) return
  form.value.cwd = path || ''
})

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

watch(() => props.openRequest?.nonce, async () => {
  await applyOpenRequest()
})

onMounted(() => {
  loadTasks()
  if (window.electronAPI?.onScheduledTaskChanged) {
    cleanupTaskChanged = window.electronAPI.onScheduledTaskChanged(async () => {
      await loadTasks()
      if (showRunsModal.value && historyTaskId.value) {
        await loadTaskRuns(historyTaskId.value)
      }
    })
  }
})

onUnmounted(() => {
  if (cleanupTaskChanged) cleanupTaskChanged()
})
</script>

<style src="@/styles/scheduled-task-common.css"></style>

<style scoped>
.tasks-layout {
  display: block;
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-card {
  width: 100%;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  border-radius: 12px;
  padding: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.task-card:hover,
.task-card.active {
  border-color: var(--primary-color);
  transform: translateY(-1px);
}

.task-head,
.task-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-title-row,
.task-meta,
.task-line,
.run-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-title-row {
  justify-content: space-between;
}

.task-title {
  font-weight: 600;
}

.task-meta,
.task-line,
.run-reason,
.run-time,
.detail-label {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.task-line.error,
.run-error {
  color: var(--warning-color, #d97706);
}

.task-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-form {
  width: 100%;
  min-width: 0;
}

.status-select {
  width: 140px;
}
</style>

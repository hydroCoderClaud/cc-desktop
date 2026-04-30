const DEFAULT_DAILY_TIME = '09:00'

function padClock(value) {
  return String(value).padStart(2, '0')
}

function parseClockTime(value) {
  const raw = String(value || '').trim()
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] == null ? 0 : Number(match[3])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null

  return { hours, minutes, seconds }
}

function applyClockToTimestamp(baseTs, clock) {
  const date = new Date(Number.isFinite(baseTs) ? baseTs : Date.now())
  date.setHours(clock.hours, clock.minutes, clock.seconds || 0, 0)
  return date.getTime()
}

function formatClockTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return DEFAULT_DAILY_TIME
  const hh = padClock(date.getHours())
  const mm = padClock(date.getMinutes())
  const ss = padClock(date.getSeconds())
  return date.getSeconds() > 0 ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`
}

function normalizeModelValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModelIds(values) {
  const normalized = []
  const seen = new Set()

  for (const value of Array.isArray(values) ? values : []) {
    const modelId = normalizeModelValue(value)
    if (!modelId || seen.has(modelId)) continue
    seen.add(modelId)
    normalized.push(modelId)
  }

  return normalized
}

function resolveScheduledTaskProfile({ apiProfiles = [], defaultProfileId = null, apiProfileId = null } = {}) {
  const normalizedApiProfileId = normalizeModelValue(apiProfileId)
  const normalizedDefaultProfileId = normalizeModelValue(defaultProfileId)
  const profiles = Array.isArray(apiProfiles) ? apiProfiles : []

  return profiles.find(profile => profile?.id === normalizedApiProfileId)
    || profiles.find(profile => profile?.id === normalizedDefaultProfileId)
    || profiles[0]
    || null
}

function getProviderModelIds(serviceProviderDefinitions = [], serviceProvider = '') {
  const normalizedProviderId = normalizeModelValue(serviceProvider)
  const providers = Array.isArray(serviceProviderDefinitions) ? serviceProviderDefinitions : []
  const provider = providers.find(item => item?.id === normalizedProviderId)
  return normalizeModelIds(provider?.defaultModels)
}

export function createScheduledTaskFormDefaults(defaultCwd = '') {
  return {
    name: '',
    prompt: '',
    cwd: defaultCwd,
    apiProfileId: null,
    modelId: '',
    maxRuns: null,
    resetCountOnEnable: false,
    intervalAnchorMode: 'started_at',
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 60,
    weeklyDays: [1],
    monthlyMode: 'day_of_month',
    monthlyDay: 1,
    firstRunAt: null
  }
}

export function isClockOnlyScheduledTaskType(scheduleType) {
  return ['daily', 'weekly', 'monthly', 'workdays'].includes(scheduleType)
}

export function buildScheduleTypeOptions(t) {
  return [
    { label: t('rightPanel.scheduledTasks.scheduleInterval'), value: 'interval' },
    { label: t('rightPanel.scheduledTasks.scheduleDaily'), value: 'daily' },
    { label: t('rightPanel.scheduledTasks.scheduleWeekly'), value: 'weekly' },
    { label: t('rightPanel.scheduledTasks.scheduleMonthly'), value: 'monthly' },
    { label: t('rightPanel.scheduledTasks.scheduleWorkdays'), value: 'workdays' },
    { label: t('rightPanel.scheduledTasks.scheduleOnce'), value: 'once' }
  ]
}

export function buildIntervalAnchorOptions(t) {
  return [
    { label: t('rightPanel.scheduledTasks.intervalAnchorStartedAt'), value: 'started_at' },
    { label: t('rightPanel.scheduledTasks.intervalAnchorFinishedAt'), value: 'finished_at' }
  ]
}

export function buildWeeklyDayOptions(t) {
  return [0, 1, 2, 3, 4, 5, 6].map(day => ({
    label: t(`rightPanel.scheduledTasks.weekday${day}`),
    value: day
  }))
}

export function buildMonthlyModeOptions(t) {
  return [
    { label: t('rightPanel.scheduledTasks.monthlyModeDayOfMonth'), value: 'day_of_month' },
    { label: t('rightPanel.scheduledTasks.monthlyModeLastDay'), value: 'last_day' }
  ]
}

export function getScheduledTaskProfileModelIds({
  apiProfiles = [],
  serviceProviderDefinitions = [],
  defaultProfileId = null,
  apiProfileId = null
} = {}) {
  const profile = resolveScheduledTaskProfile({ apiProfiles, defaultProfileId, apiProfileId })
  return normalizeModelIds([
    ...getProviderModelIds(serviceProviderDefinitions, profile?.serviceProvider),
    profile?.selectedModelId
  ])
}

export function buildScheduledTaskModelOptions(context = {}) {
  return getScheduledTaskProfileModelIds(context).map(modelId => ({
    label: modelId,
    value: modelId
  }))
}

export function resolveScheduledTaskModelId(context = {}, preferredModelId = '') {
  const normalizedPreferredModelId = normalizeModelValue(preferredModelId)
  if (!normalizedPreferredModelId) {
    return ''
  }

  const modelIds = getScheduledTaskProfileModelIds(context)
  return modelIds.includes(normalizedPreferredModelId) ? normalizedPreferredModelId : ''
}

export function resolveScheduledTaskEffectiveModelId(context = {}, preferredModelId = '') {
  const modelIds = getScheduledTaskProfileModelIds(context)
  const normalizedPreferredModelId = resolveScheduledTaskModelId(context, preferredModelId)

  if (normalizedPreferredModelId) {
    return normalizedPreferredModelId
  }

  const profile = resolveScheduledTaskProfile(context)
  const profileSelectedModelId = normalizeModelValue(profile?.selectedModelId)
  if (profileSelectedModelId && modelIds.includes(profileSelectedModelId)) {
    return profileSelectedModelId
  }

  return modelIds[0] || ''
}

export function getScheduledTaskModelLabel(modelId, t) {
  return normalizeModelValue(modelId) || t('rightPanel.scheduledTasks.defaultModelId')
}

export function formatScheduledTaskDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
}

export function resolveScheduledTaskExecutionAt(task, baseTs = Date.now()) {
  if (!task || typeof task !== 'object') return null

  const firstRunAt = Number(task.firstRunAt)
  if (Number.isFinite(firstRunAt) && firstRunAt > 0) {
    return Math.trunc(firstRunAt)
  }

  if (task.scheduleType === 'interval') {
    for (const candidate of [task.nextRunAt, task.lastScheduledAt, task.lastStartedAt, task.lastRunAt, task.createdAt, task.updatedAt]) {
      const timestamp = Number(candidate)
      if (Number.isFinite(timestamp) && timestamp > 0) {
        return Math.trunc(timestamp)
      }
    }
    return null
  }

  if (task.scheduleType === 'once') {
    return null
  }

  const clock = parseClockTime(task.dailyTime)
  if (!clock) return null
  return applyClockToTimestamp(baseTs, clock)
}

export function formatScheduledTaskExecutionTime(task) {
  const executionAt = resolveScheduledTaskExecutionAt(task)
  if (!executionAt) return DEFAULT_DAILY_TIME
  return formatClockTime(executionAt)
}

function describeRecurringSchedule(task, t, weeklyDayOptions) {
  if (task.scheduleType === 'daily') {
    return t('rightPanel.scheduledTasks.scheduleDailyDesc', { time: formatScheduledTaskExecutionTime(task) })
  }
  if (task.scheduleType === 'weekly') {
    const days = (task.weeklyDays || [])
      .map(day => weeklyDayOptions.find(item => item.value === day)?.label || day)
      .join(', ')
    return t('rightPanel.scheduledTasks.scheduleWeeklyDesc', {
      days: days || '-',
      time: formatScheduledTaskExecutionTime(task)
    })
  }
  if (task.scheduleType === 'monthly') {
    if (task.monthlyMode === 'last_day') {
      return t('rightPanel.scheduledTasks.scheduleMonthlyLastDayDesc', {
        time: formatScheduledTaskExecutionTime(task)
      })
    }
    return t('rightPanel.scheduledTasks.scheduleMonthlyDesc', {
      day: task.monthlyDay || 1,
      time: formatScheduledTaskExecutionTime(task)
    })
  }
  if (task.scheduleType === 'workdays') {
    return t('rightPanel.scheduledTasks.scheduleWorkdaysDesc', { time: formatScheduledTaskExecutionTime(task) })
  }
  return t('rightPanel.scheduledTasks.scheduleIntervalDesc', { minutes: task.intervalMinutes || 60 })
}

export function describeScheduledTask(task, t, weeklyDayOptions) {
  if (!task) return '-'

  if (task.scheduleType === 'once') {
    return t('rightPanel.scheduledTasks.scheduleOnceDesc', {
      time: formatScheduledTaskDateTime(resolveScheduledTaskExecutionAt(task))
    })
  }

  return describeRecurringSchedule(task, t, weeklyDayOptions)
}

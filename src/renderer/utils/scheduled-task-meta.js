const DEFAULT_DAILY_TIME = '09:00'

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
    maxTurns: null,
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 60,
    dailyTime: DEFAULT_DAILY_TIME,
    weeklyDays: [1],
    monthlyMode: 'day_of_month',
    monthlyDay: 1,
    firstRunMode: 'next_slot',
    firstRunAt: null
  }
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

export function buildFirstRunModeOptions(t) {
  return [
    { label: t('rightPanel.scheduledTasks.firstRunModeImmediate'), value: 'immediate' },
    { label: t('rightPanel.scheduledTasks.firstRunModeNextSlot'), value: 'next_slot' },
    { label: t('rightPanel.scheduledTasks.firstRunModeCustom'), value: 'custom' }
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
  const modelIds = getScheduledTaskProfileModelIds(context)
  const normalizedPreferredModelId = normalizeModelValue(preferredModelId)

  if (normalizedPreferredModelId && modelIds.includes(normalizedPreferredModelId)) {
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

function describeRecurringSchedule(task, t, weeklyDayOptions) {
  if (task.scheduleType === 'daily') {
    return t('rightPanel.scheduledTasks.scheduleDailyDesc', { time: task.dailyTime || DEFAULT_DAILY_TIME })
  }
  if (task.scheduleType === 'weekly') {
    const days = (task.weeklyDays || [])
      .map(day => weeklyDayOptions.find(item => item.value === day)?.label || day)
      .join(', ')
    return t('rightPanel.scheduledTasks.scheduleWeeklyDesc', {
      days: days || '-',
      time: task.dailyTime || DEFAULT_DAILY_TIME
    })
  }
  if (task.scheduleType === 'monthly') {
    if (task.monthlyMode === 'last_day') {
      return t('rightPanel.scheduledTasks.scheduleMonthlyLastDayDesc', {
        time: task.dailyTime || DEFAULT_DAILY_TIME
      })
    }
    return t('rightPanel.scheduledTasks.scheduleMonthlyDesc', {
      day: task.monthlyDay || 1,
      time: task.dailyTime || DEFAULT_DAILY_TIME
    })
  }
  if (task.scheduleType === 'workdays') {
    return t('rightPanel.scheduledTasks.scheduleWorkdaysDesc', { time: task.dailyTime || DEFAULT_DAILY_TIME })
  }
  return t('rightPanel.scheduledTasks.scheduleIntervalDesc', { minutes: task.intervalMinutes || 60 })
}

export function describeScheduledTask(task, t, weeklyDayOptions) {
  if (!task) return '-'

  if (task.scheduleType === 'once') {
    return t('rightPanel.scheduledTasks.scheduleOnceDesc', {
      time: formatScheduledTaskDateTime(task.firstRunAt)
    })
  }

  const recurring = describeRecurringSchedule(task, t, weeklyDayOptions)
  if (task.lastRunAt) {
    return recurring
  }
  if (task.firstRunMode === 'immediate') {
    return t('rightPanel.scheduledTasks.firstRunImmediateDesc', { schedule: recurring })
  }
  if (task.firstRunMode === 'custom' && task.firstRunAt) {
    return t('rightPanel.scheduledTasks.firstRunCustomDesc', {
      time: formatScheduledTaskDateTime(task.firstRunAt),
      schedule: recurring
    })
  }

  return recurring
}

const DEFAULT_DAILY_TIME = '09:00'

export function createScheduledTaskFormDefaults(defaultCwd = '') {
  return {
    name: '',
    prompt: '',
    cwd: defaultCwd,
    apiProfileId: null,
    modelTier: 'sonnet',
    maxTurns: null,
    enabled: true,
    scheduleType: 'interval',
    intervalMinutes: 60,
    dailyTime: DEFAULT_DAILY_TIME,
    weeklyDays: [1],
    firstRunMode: 'next_slot',
    firstRunAt: null
  }
}

export function buildScheduleTypeOptions(t) {
  return [
    { label: t('rightPanel.scheduledTasks.scheduleInterval'), value: 'interval' },
    { label: t('rightPanel.scheduledTasks.scheduleDaily'), value: 'daily' },
    { label: t('rightPanel.scheduledTasks.scheduleWeekly'), value: 'weekly' },
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

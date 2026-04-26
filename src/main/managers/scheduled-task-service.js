const { BrowserWindow } = require('electron')

const CHECK_INTERVAL_MS = 30 * 1000
const DEFAULT_INTERVAL_MINUTES = 60
const DEFAULT_DAILY_TIME = '09:00'

function normalizeScheduleType(type) {
  const normalized = String(type || '').trim().toLowerCase()
  const allowed = new Set(['interval', 'daily', 'weekly', 'monthly', 'workdays', 'once'])
  return allowed.has(normalized) ? normalized : 'interval'
}

function normalizeFirstRunMode(mode, scheduleType) {
  if (scheduleType === 'once') return 'custom'
  const normalized = String(mode || '').trim().toLowerCase()
  const allowed = new Set(['immediate', 'next_slot', 'custom'])
  return allowed.has(normalized) ? normalized : 'next_slot'
}

function normalizeTimestamp(value) {
  if (value == null || value === '') return null
  if (Number.isFinite(value)) return Math.trunc(Number(value))

  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeModelTier(tier) {
  if (!tier) return null

  const normalized = String(tier).trim().toLowerCase()
  if (!normalized) return null

  const aliases = {
    powerful: 'opus',
    balanced: 'sonnet',
    fast: 'haiku'
  }

  const resolved = aliases[normalized] || normalized
  return ['sonnet', 'opus', 'haiku'].includes(resolved) ? resolved : null
}

function normalizeWeeklyDays(days) {
  if (!Array.isArray(days)) return []
  return Array.from(new Set(days
    .map(day => Number(day))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
  )).sort((a, b) => a - b)
}

function normalizeMonthlyMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase()
  return normalized === 'last_day' ? 'last_day' : 'day_of_month'
}

function normalizeMonthlyDay(day) {
  const normalized = Number(day)
  if (!Number.isInteger(normalized)) return null
  if (normalized < 1 || normalized > 31) return null
  return normalized
}

function getMonthDays(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function formatDateParts(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return { year, month, day }
}

function parseClockTime(value) {
  const raw = String(value || '').trim()
  const match = /^(\d{2}):(\d{2})$/.exec(raw)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return { hours, minutes }
}

const PROMPT_I18N = {
  'zh-CN': {
    triggerReasons: {
      manual: '手动触发',
      startup: '启动触发',
      scheduled: '定时触发'
    },
    continuedTitle: (name) => `继续执行定时任务“${name}”。`,
    triggerReason: (value) => `触发原因：${value}`,
    triggerTime: (value) => `触发时间：${value}`,
    runtimeState: (value) => `运行态：\n${value}`,
    taskPromptTitle: '任务内容：',
    bootstrapTitle: '# 定时智能体任务',
    bootstrapTaskName: (value) => `任务名称：${value}`,
    bootstrapTriggerReason: (value) => `触发原因：${value}`,
    bootstrapTriggerTime: (value) => `触发时间：${value}`,
    bootstrapStartedByScheduler: '本次执行由桌面端定时调度自动触发。',
    bootstrapRuntimeState: (value) => `\n\n# 运行态\n${value}`,
    bootstrapTaskPromptTitle: '# 任务内容'
  },
  'en-US': {
    triggerReasons: {
      manual: 'Manual',
      startup: 'Startup',
      scheduled: 'Scheduled'
    },
    continuedTitle: (name) => `Continue scheduled task "${name}".`,
    triggerReason: (value) => `Trigger Reason: ${value}`,
    triggerTime: (value) => `Trigger Time: ${value}`,
    runtimeState: (value) => `Runtime State:\n${value}`,
    taskPromptTitle: 'Task Content:',
    bootstrapTitle: '# Scheduled Agent Task',
    bootstrapTaskName: (value) => `Task Name: ${value}`,
    bootstrapTriggerReason: (value) => `Trigger Reason: ${value}`,
    bootstrapTriggerTime: (value) => `Trigger Time: ${value}`,
    bootstrapStartedByScheduler: 'This run was started automatically by the desktop scheduler.',
    bootstrapRuntimeState: (value) => `\n\n# Runtime State\n${value}`,
    bootstrapTaskPromptTitle: '# Task Content'
  }
}

class ScheduledTaskService {
  constructor(configManager, agentSessionManager) {
    this.configManager = configManager
    this.agentSessionManager = agentSessionManager
    this.sessionDatabase = null
    this.timer = null
    this.started = false
    this.runningTasks = new Set()
    this.activeRuns = new Map()

    this._onAgentResult = this._handleAgentResult.bind(this)
    this._onAgentError = this._handleAgentError.bind(this)
    this._onAgentDeleted = this._handleAgentDeleted.bind(this)
    this._onAgentInterrupted = this._handleAgentInterrupted.bind(this)

    if (this.agentSessionManager?.on) {
      this.agentSessionManager.on('agentResult', this._onAgentResult)
      this.agentSessionManager.on('agentError', this._onAgentError)
      this.agentSessionManager.on('agentDeleted', this._onAgentDeleted)
      this.agentSessionManager.on('agentInterrupted', this._onAgentInterrupted)
    }
  }

  setSessionDatabase(db) {
    this.sessionDatabase = db
  }

  start() {
    if (this.started || !this.sessionDatabase) return
    this.started = true
    this.timer = setInterval(() => {
      this._checkDueTasks().catch(err => {
        console.error('[ScheduledTask] Due task check failed:', err)
      })
    }, CHECK_INTERVAL_MS)

    setTimeout(() => {
      this._checkDueTasks().catch(err => {
        console.error('[ScheduledTask] Initial due task check failed:', err)
      })
    }, 2500)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.started = false
  }

  destroy() {
    this.stop()
    this.runningTasks.clear()
    this.activeRuns.clear()
    if (this.agentSessionManager?.off) {
      this.agentSessionManager.off('agentResult', this._onAgentResult)
      this.agentSessionManager.off('agentError', this._onAgentError)
      this.agentSessionManager.off('agentDeleted', this._onAgentDeleted)
      this.agentSessionManager.off('agentInterrupted', this._onAgentInterrupted)
    } else if (this.agentSessionManager?.removeListener) {
      this.agentSessionManager.removeListener('agentResult', this._onAgentResult)
      this.agentSessionManager.removeListener('agentError', this._onAgentError)
      this.agentSessionManager.removeListener('agentDeleted', this._onAgentDeleted)
      this.agentSessionManager.removeListener('agentInterrupted', this._onAgentInterrupted)
    }
  }

  listTasks() {
    if (!this.sessionDatabase) return []
    return this.sessionDatabase.listScheduledTasks()
  }

  getTaskRuns(taskId, limit = 20) {
    if (!this.sessionDatabase) return []
    return this.sessionDatabase.listScheduledTaskRuns(taskId, { limit })
  }

  async createTask(input) {
    this._assertReady()
    const normalized = this._normalizeTaskInput(input)
    const created = this.sessionDatabase.createScheduledTask(normalized)
    const nextRunAt = normalized.enabled ? this._computeNextRunAt(created, Date.now()) : null
    let task = this.sessionDatabase.updateScheduledTaskState(created.id, { nextRunAt })

    if (task.enabled && task.firstRunMode === 'immediate' && task.scheduleType !== 'once') {
      await this._executeTask(task, 'startup', { allowDisabled: true })
      task = this.sessionDatabase.getScheduledTask(task.id)
    } else {
      this._broadcastChange(task.id, 'created')
    }

    return task
  }

  async updateTask(taskId, updates) {
    this._assertReady()
    const current = this.sessionDatabase.getScheduledTask(taskId)
    if (!current) {
      throw new Error(`Scheduled task ${taskId} not found`)
    }

    const normalized = this._normalizeTaskInput({ ...current, ...updates }, { partial: true })
    const updated = this.sessionDatabase.updateScheduledTask(taskId, normalized)
    const cwdChanged = normalized.cwd !== current.cwd
    const shouldRunImmediatelyOnEnable = !current.enabled
      && updated.enabled
      && updated.firstRunMode === 'immediate'
      && updated.scheduleType !== 'once'
    const shouldRearmOnceTask = updated.scheduleType === 'once' && (
      updated.scheduleType !== current.scheduleType ||
      normalizeTimestamp(updated.firstRunAt) !== normalizeTimestamp(current.firstRunAt)
    )
    const stateUpdates = {}

    if (cwdChanged) {
      if (this.runningTasks.has(taskId)) {
        stateUpdates.runtimeState = this._markSessionResetPending(current.runtimeState, 'cwd-changed')
      } else {
        stateUpdates.sessionId = null
        stateUpdates.runtimeState = this._clearSessionResetPending(current.runtimeState)
      }
    }

    if (shouldRearmOnceTask) {
      stateUpdates.lastRunAt = null
    }

    const nextRunAt = updated.enabled
      ? this._computeNextRunAt(
          shouldRearmOnceTask ? { ...updated, lastRunAt: null } : updated,
          Date.now()
        )
      : null
    stateUpdates.nextRunAt = nextRunAt
    let task = this.sessionDatabase.updateScheduledTaskState(taskId, stateUpdates)
    this._syncTaskSessionTitle(current, updated)

    if (shouldRunImmediatelyOnEnable) {
      await this._executeTask(task, 'startup', { allowDisabled: true })
      task = this.sessionDatabase.getScheduledTask(task.id)
    } else {
      this._broadcastChange(taskId, 'updated')
    }

    return task
  }

  deleteTask(taskId) {
    this._assertReady()
    const current = this.sessionDatabase.getScheduledTask(taskId)
    if (!current) return { success: true }
    this.runningTasks.delete(taskId)
    if (current.sessionId) {
      this.activeRuns.delete(current.sessionId)
      this._detachTaskSession(current)
    }
    const result = this.sessionDatabase.deleteScheduledTask(taskId)
    this._broadcastChange(taskId, 'deleted')
    return result
  }

  async runTaskNow(taskId) {
    this._assertReady()
    const task = this.sessionDatabase.getScheduledTask(taskId)
    if (!task) {
      throw new Error(`Scheduled task ${taskId} not found`)
    }
    await this._executeTask(task, 'manual', { allowDisabled: true })
    return this.sessionDatabase.getScheduledTask(taskId)
  }

  async onSystemResume() {
    if (!this.started) return
    await this._checkDueTasks()
  }

  async _checkDueTasks() {
    if (!this.sessionDatabase) return
    const now = Date.now()
    const tasks = this.sessionDatabase.listScheduledTasks()
      .filter(task => task.enabled && task.nextRunAt && task.nextRunAt <= now)

    for (const task of tasks) {
      await this._executeTask(task, 'scheduled')
    }
  }

  async _executeTask(task, triggerReason, { allowDisabled = false } = {}) {
    if (!allowDisabled && !task.enabled) return
    if (this.runningTasks.has(task.id)) return

    this.runningTasks.add(task.id)
    const startedAt = Date.now()
    let awaitingCompletion = false
    let activeSessionId = task.sessionId || null

    try {
      const sessionId = this._ensureTaskSession(task)
      activeSessionId = sessionId
      const liveSession = this.agentSessionManager.get(sessionId) || this.agentSessionManager.reopen(sessionId)
      const isBootstrapRun = !this._hasConversationHistory(sessionId)

      if (liveSession?.status === 'streaming') {
        this.sessionDatabase.createScheduledTaskRun({
          taskId: task.id,
          sessionId,
          triggerReason,
          status: 'skipped',
          errorMessage: 'Agent session is busy',
          startedAt,
          finishedAt: Date.now()
        })
        const nextRunAt = task.enabled
          ? this._computeNextRunAt({ ...task, lastRunAt: startedAt }, Date.now())
          : task.nextRunAt
        this.sessionDatabase.updateScheduledTaskState(task.id, { nextRunAt })
        this._broadcastChange(task.id, 'skipped')
        this.runningTasks.delete(task.id)
        return
      }

      this.activeRuns.set(sessionId, {
        taskId: task.id,
        sessionId,
        triggerReason,
        startedAt
      })

      await this.agentSessionManager.sendMessage(
        sessionId,
        this._buildTaskPrompt(task, triggerReason, startedAt, { bootstrap: isBootstrapRun }),
        {
          modelTier: task.modelTier || undefined,
          maxTurns: task.maxTurns || undefined,
          meta: { source: 'scheduled' }
        }
      )

      const latestSession = this.agentSessionManager.get(sessionId)
      if (latestSession?.status === 'error') {
        throw new Error('Scheduled task session failed to start')
      }

      awaitingCompletion = true
      this._broadcastChange(task.id, 'started')
    } catch (err) {
      console.error(`[ScheduledTask] Run failed for task ${task.id}:`, err)
      const nextRunAt = task.enabled
        ? this._computeNextRunAt({ ...task, lastRunAt: startedAt }, Date.now())
        : task.nextRunAt
      this.sessionDatabase.updateScheduledTaskState(task.id, {
        lastRunAt: Date.now(),
        lastError: err.message || 'Unknown error',
        nextRunAt,
        failureCount: (task.failureCount || 0) + 1
      })
      this.sessionDatabase.createScheduledTaskRun({
        taskId: task.id,
        sessionId: activeSessionId,
        triggerReason,
        status: 'failed',
        errorMessage: err.message || 'Unknown error',
        startedAt,
        finishedAt: Date.now()
      })
      this._broadcastChange(task.id, 'failed')
      if (activeSessionId) {
        this.activeRuns.delete(activeSessionId)
      }
      this.runningTasks.delete(task.id)
    } finally {
      if (!awaitingCompletion) {
        this.runningTasks.delete(task.id)
      }
    }
  }

  _ensureTaskSession(task) {
    let sessionId = task.sessionId

    if (sessionId) {
      const row = this.sessionDatabase.getAgentConversation(sessionId)
      if (!row) {
        sessionId = null
      }
    }

    if (!sessionId) {
      const session = this.agentSessionManager.create({
        type: 'chat',
        title: task.name,
        cwd: task.cwd || undefined,
        cwdSubDir: task.cwd ? undefined : 'scheduled',
        apiProfileId: task.apiProfileId || undefined,
        source: 'scheduled',
        taskId: task.id,
        meta: { scheduledTaskId: task.id }
      })
      sessionId = session.id
      this.sessionDatabase.updateScheduledTaskState(task.id, { sessionId })
    }

    return sessionId
  }

  _hasConversationHistory(sessionId) {
    if (!sessionId || !this.sessionDatabase) return false

    const conversation = this.sessionDatabase.getAgentConversation(sessionId)
    if (!conversation?.id) return false

    const messages = this.sessionDatabase.getAgentMessagesByConversationId(conversation.id)
    return Array.isArray(messages) && messages.length > 0
  }

  _syncTaskSessionTitle(previousTask, nextTask) {
    if (!previousTask?.sessionId) return

    const previousName = String(previousTask.name || '').trim()
    const nextName = String(nextTask?.name || '').trim()
    if (!nextName || previousName === nextName) return

    try {
      this.agentSessionManager?.rename?.(previousTask.sessionId, nextName)
    } catch (err) {
      console.error(`[ScheduledTask] Failed to sync session title for task ${previousTask.id}:`, err)
    }
  }

  _detachTaskSession(task) {
    if (!task?.sessionId || !this.sessionDatabase?.updateAgentConversation) return

    try {
      this.sessionDatabase.updateAgentConversation(task.sessionId, {
        source: 'manual',
        taskId: null
      })
    } catch (err) {
      console.error(`[ScheduledTask] Failed to detach session for task ${task.id}:`, err)
      return
    }

    const liveSession = this.agentSessionManager?.sessions?.get?.(task.sessionId)
    if (liveSession) {
      liveSession.source = 'manual'
      liveSession.taskId = null
      if (liveSession.meta?.scheduledTaskId === task.id) {
        delete liveSession.meta.scheduledTaskId
      }
    }
  }

  _handleAgentResult(sessionId) {
    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun || !this.sessionDatabase) return

    this.activeRuns.delete(sessionId)
    this.runningTasks.delete(activeRun.taskId)
    const task = this.sessionDatabase.getScheduledTask(activeRun.taskId)
    const finishedAt = Date.now()
    const nextRunAt = task?.enabled ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt) : null
    const shouldResetSession = this._shouldResetSessionBinding(task?.runtimeState)
    const runtimeState = this._clearSessionResetPending(task?.runtimeState)

    this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId: shouldResetSession ? null : sessionId,
      runtimeState,
      lastRunAt: finishedAt,
      nextRunAt,
      lastError: null,
      failureCount: 0
    })

    this.sessionDatabase.createScheduledTaskRun({
      taskId: activeRun.taskId,
      sessionId,
      triggerReason: activeRun.triggerReason,
      status: 'success',
      startedAt: activeRun.startedAt,
      finishedAt
    })

    this._broadcastChange(activeRun.taskId, 'completed')
  }

  _handleAgentError(sessionId, errorMessage) {
    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun || !this.sessionDatabase) return

    this.activeRuns.delete(sessionId)
    this.runningTasks.delete(activeRun.taskId)
    const task = this.sessionDatabase.getScheduledTask(activeRun.taskId)
    const finishedAt = Date.now()
    const nextRunAt = task?.enabled ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt) : null
    const shouldResetSession = this._shouldResetSessionBinding(task?.runtimeState)
    const runtimeState = this._clearSessionResetPending(task?.runtimeState)

    this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId: shouldResetSession ? null : sessionId,
      runtimeState,
      lastRunAt: finishedAt,
      nextRunAt,
      lastError: errorMessage || 'Unknown error',
      failureCount: (task?.failureCount || 0) + 1
    })

    this.sessionDatabase.createScheduledTaskRun({
      taskId: activeRun.taskId,
      sessionId,
      triggerReason: activeRun.triggerReason,
      status: 'failed',
      errorMessage: errorMessage || 'Unknown error',
      startedAt: activeRun.startedAt,
      finishedAt
    })

    this._broadcastChange(activeRun.taskId, 'failed')
  }

  _handleAgentDeleted(sessionId) {
    if (!sessionId || !this.sessionDatabase) return

    const tasks = this.sessionDatabase.listScheduledTasks()
      .filter(task => task.sessionId === sessionId)
    if (!tasks.length) return

    const activeRun = this.activeRuns.get(sessionId)
    const finishedAt = Date.now()

    if (activeRun) {
      this.activeRuns.delete(sessionId)
      this.runningTasks.delete(activeRun.taskId)
    }

    for (const task of tasks) {
      const stateUpdates = { sessionId: null }

      if (activeRun?.taskId === task.id) {
        stateUpdates.nextRunAt = task.enabled
          ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt)
          : null
        this.sessionDatabase.createScheduledTaskRun({
          taskId: task.id,
          sessionId,
          triggerReason: activeRun.triggerReason,
          status: 'skipped',
          errorMessage: 'Agent session deleted by user',
          startedAt: activeRun.startedAt,
          finishedAt
        })
      }

      this.sessionDatabase.updateScheduledTaskState(task.id, stateUpdates)
      this._broadcastChange(task.id, 'session-unlinked')
    }
  }

  _handleAgentInterrupted(sessionId, details = {}) {
    if (!sessionId || !this.sessionDatabase) return

    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun) return

    this.activeRuns.delete(sessionId)
    this.runningTasks.delete(activeRun.taskId)

    const task = this.sessionDatabase.getScheduledTask(activeRun.taskId)
    if (!task) return

    const finishedAt = Date.now()
    const reason = details?.reason || 'host-cleanup'
    const message = reason === 'host-cleanup'
      ? 'Agent session interrupted by host cleanup'
      : 'Agent session interrupted'
    const nextRunAt = task.enabled
      ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt)
      : null
    const shouldResetSession = this._shouldResetSessionBinding(task.runtimeState)
    const runtimeState = this._clearSessionResetPending(task.runtimeState)

    this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId: shouldResetSession ? null : sessionId,
      runtimeState,
      lastRunAt: finishedAt,
      nextRunAt,
      lastError: message
    })

    this.sessionDatabase.createScheduledTaskRun({
      taskId: activeRun.taskId,
      sessionId,
      triggerReason: activeRun.triggerReason,
      status: 'skipped',
      errorMessage: message,
      startedAt: activeRun.startedAt,
      finishedAt
    })

    this._broadcastChange(activeRun.taskId, 'interrupted')
  }

  _normalizeTaskInput(input, { partial = false } = {}) {
    const scheduleType = input.scheduleType === undefined && partial
      ? undefined
      : normalizeScheduleType(input.scheduleType)
    const intervalMinutes = input.intervalMinutes == null || input.intervalMinutes === ''
      ? null
      : Math.max(1, Number(input.intervalMinutes))
    const maxTurns = input.maxTurns == null || input.maxTurns === ''
      ? null
      : Math.max(1, Number(input.maxTurns))
    const weeklyDays = normalizeWeeklyDays(input.weeklyDays)
    const monthlyMode = input.monthlyMode === undefined && partial
      ? undefined
      : normalizeMonthlyMode(input.monthlyMode)
    const rawMonthlyDay = input.monthlyDay === undefined && partial
      ? undefined
      : normalizeMonthlyDay(input.monthlyDay)
    const monthlyDay = monthlyMode === 'last_day' ? null : rawMonthlyDay
    const normalizedFirstRunAt = normalizeTimestamp(input.firstRunAt)
    const firstRunMode = input.firstRunMode === undefined && partial
      ? undefined
      : normalizeFirstRunMode(input.firstRunMode, scheduleType)

    if (!partial || Object.prototype.hasOwnProperty.call(input, 'name')) {
      if (!String(input.name || '').trim()) throw new Error('Task name is required')
    }
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'prompt')) {
      if (!String(input.prompt || '').trim()) throw new Error('Task prompt is required')
    }

    if (scheduleType === 'interval' && (!intervalMinutes || !Number.isFinite(intervalMinutes))) {
      throw new Error('Interval minutes must be greater than 0')
    }
    if (scheduleType === 'daily' && !parseClockTime(input.dailyTime)) {
      throw new Error('Daily schedule requires HH:mm time')
    }
    if (scheduleType === 'weekly') {
      if (!weeklyDays.length) throw new Error('Weekly schedule requires at least one day')
      if (!parseClockTime(input.dailyTime)) {
        throw new Error('Weekly schedule requires HH:mm time')
      }
    }
    if (scheduleType === 'monthly') {
      if (!parseClockTime(input.dailyTime)) {
        throw new Error('Monthly schedule requires HH:mm time')
      }
      if (monthlyMode !== 'last_day' && !monthlyDay) {
        throw new Error('Monthly schedule requires a valid day of month')
      }
    }
    if (scheduleType === 'workdays' && !parseClockTime(input.dailyTime)) {
      throw new Error('Workday schedule requires HH:mm time')
    }
    if (scheduleType === 'once' && !normalizedFirstRunAt) {
      throw new Error('One-time schedule requires valid first run time')
    }
    if (scheduleType !== 'once' && firstRunMode === 'custom' && !normalizedFirstRunAt) {
      throw new Error('Custom first run requires valid datetime')
    }

    return {
      name: Object.prototype.hasOwnProperty.call(input, 'name') ? String(input.name || '').trim() : undefined,
      prompt: Object.prototype.hasOwnProperty.call(input, 'prompt') ? String(input.prompt || '').trim() : undefined,
      cwd: Object.prototype.hasOwnProperty.call(input, 'cwd') ? (String(input.cwd || '').trim() || null) : undefined,
      apiProfileId: Object.prototype.hasOwnProperty.call(input, 'apiProfileId') ? (input.apiProfileId || null) : undefined,
      modelTier: Object.prototype.hasOwnProperty.call(input, 'modelTier') ? normalizeModelTier(input.modelTier) : undefined,
      maxTurns,
      enabled: Object.prototype.hasOwnProperty.call(input, 'enabled') ? !!input.enabled : undefined,
      scheduleType,
      intervalMinutes,
      dailyTime: Object.prototype.hasOwnProperty.call(input, 'dailyTime') ? String(input.dailyTime || '') : undefined,
      weeklyDays,
      monthlyMode,
      monthlyDay,
      firstRunMode,
      firstRunAt: Object.prototype.hasOwnProperty.call(input, 'firstRunAt') || !partial ? normalizedFirstRunAt : undefined
    }
  }

  _computeNextRunAt(task, nowTs) {
    if (!task?.enabled) return null
    const now = new Date(nowTs)
    const firstRunPending = !task.lastRunAt
    const firstRunAt = normalizeTimestamp(task.firstRunAt)

    if (task.scheduleType === 'once') {
      return firstRunPending ? firstRunAt : null
    }

    if (firstRunPending) {
      if (task.firstRunMode === 'immediate') {
        return nowTs
      }
      if (task.firstRunMode === 'custom' && firstRunAt) {
        return firstRunAt
      }
    }

    return this._computeRecurringNextRunAt(task, now, nowTs)
  }

  _computeRecurringNextRunAt(task, now, nowTs) {
    switch (task.scheduleType) {
      case 'daily':
        return this._computeNextDailyTime(task.dailyTime, now).getTime()
      case 'weekly':
        return this._computeNextWeeklyTime(task.dailyTime, task.weeklyDays, now).getTime()
      case 'monthly':
        return this._computeNextMonthlyTime(task.dailyTime, task.monthlyDay, task.monthlyMode, now).getTime()
      case 'workdays':
        return this._computeNextWorkdayTime(task.dailyTime, now).getTime()
      case 'interval':
      default: {
        const minutes = Number(task.intervalMinutes) || DEFAULT_INTERVAL_MINUTES
        return nowTs + minutes * 60 * 1000
      }
    }
  }

  _getPromptLocale() {
    const locale = this.configManager?.getConfig?.()?.settings?.locale
    return PROMPT_I18N[locale] ? locale : 'zh-CN'
  }

  _computeNextDailyTime(time, now) {
    const parsed = parseClockTime(time) || parseClockTime(DEFAULT_DAILY_TIME)
    const { hours, minutes } = parsed
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target
  }

  _computeNextWeeklyTime(time, weeklyDays, now) {
    const days = normalizeWeeklyDays(weeklyDays)
    const parsed = parseClockTime(time) || parseClockTime(DEFAULT_DAILY_TIME)
    const { hours, minutes } = parsed
    const base = new Date(now)
    base.setSeconds(0, 0)

    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(base)
      candidate.setDate(base.getDate() + offset)
      candidate.setHours(hours, minutes, 0, 0)
      if (!days.includes(candidate.getDay())) continue
      if (candidate.getTime() > now.getTime()) return candidate
    }

    const fallback = new Date(base)
    fallback.setDate(base.getDate() + 7)
    fallback.setHours(hours, minutes, 0, 0)
    return fallback
  }

  _computeNextWorkdayTime(time, now) {
    const parsed = parseClockTime(time) || parseClockTime(DEFAULT_DAILY_TIME)
    const { hours, minutes } = parsed
    const base = new Date(now)
    base.setSeconds(0, 0)

    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(base)
      candidate.setDate(base.getDate() + offset)
      candidate.setHours(hours, minutes, 0, 0)
      const day = candidate.getDay()
      if (day === 0 || day === 6) continue
      if (candidate.getTime() > now.getTime()) return candidate
    }

    const fallback = new Date(base)
    fallback.setDate(base.getDate() + 1)
    fallback.setHours(hours, minutes, 0, 0)
    while (fallback.getDay() === 0 || fallback.getDay() === 6) {
      fallback.setDate(fallback.getDate() + 1)
    }
    return fallback
  }

  _computeNextMonthlyTime(time, monthlyDay, monthlyMode, now) {
    const parsed = parseClockTime(time) || parseClockTime(DEFAULT_DAILY_TIME)
    const { hours, minutes } = parsed
    const base = new Date(now)
    base.setSeconds(0, 0)

    const buildCandidate = (year, monthIndex) => {
      const candidate = new Date(year, monthIndex, 1, hours, minutes, 0, 0)
      const maxDay = getMonthDays(year, monthIndex)
      const day = monthlyMode === 'last_day'
        ? maxDay
        : Math.min(normalizeMonthlyDay(monthlyDay) || 1, maxDay)
      candidate.setDate(day)
      return candidate
    }

    const currentMonthCandidate = buildCandidate(base.getFullYear(), base.getMonth())
    if (currentMonthCandidate.getTime() > now.getTime()) {
      return currentMonthCandidate
    }

    const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1, hours, minutes, 0, 0)
    return buildCandidate(nextMonth.getFullYear(), nextMonth.getMonth())
  }

  _buildTaskPrompt(task, triggerReason, timestamp, { bootstrap = false } = {}) {
    const locale = this._getPromptLocale()
    const promptText = PROMPT_I18N[locale] || PROMPT_I18N['zh-CN']
    const { year, month, day } = formatDateParts(timestamp)
    const runtimeStateForPrompt = this._publicRuntimeState(task.runtimeState)
    const runtimeState = runtimeStateForPrompt
      ? JSON.stringify(runtimeStateForPrompt, null, 2)
      : ''
    const localizedTriggerReason = promptText.triggerReasons[triggerReason] || triggerReason
    const triggerTime = `${year}-${month}-${day} ${new Date(timestamp).toLocaleTimeString(locale, { hour12: false })}`

    if (!bootstrap) {
      return [
        promptText.continuedTitle(task.name),
        promptText.triggerReason(localizedTriggerReason),
        promptText.triggerTime(triggerTime),
        runtimeState ? promptText.runtimeState(runtimeState) : '',
        '',
        promptText.taskPromptTitle,
        task.prompt
      ].filter(Boolean).join('\n')
    }

    return [
      promptText.bootstrapTitle,
      promptText.bootstrapTaskName(task.name),
      promptText.bootstrapTriggerReason(localizedTriggerReason),
      promptText.bootstrapTriggerTime(triggerTime),
      promptText.bootstrapStartedByScheduler,
      runtimeState ? promptText.bootstrapRuntimeState(runtimeState) : '',
      '',
      promptText.bootstrapTaskPromptTitle,
      task.prompt
    ].join('\n')
  }

  _broadcastChange(taskId, reason) {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('scheduled-task:changed', { taskId, reason })
      }
    })
  }

  _markSessionResetPending(runtimeState, reason) {
    const base = runtimeState && typeof runtimeState === 'object' ? { ...runtimeState } : {}
    base._scheduler = {
      ...(base._scheduler || {}),
      resetSessionAfterRun: true,
      reason: reason || 'config-changed'
    }
    return base
  }

  _shouldResetSessionBinding(runtimeState) {
    return !!runtimeState?._scheduler?.resetSessionAfterRun
  }

  _clearSessionResetPending(runtimeState) {
    if (!runtimeState || typeof runtimeState !== 'object') return null

    const next = { ...runtimeState }
    if (next._scheduler && typeof next._scheduler === 'object') {
      const schedulerState = { ...next._scheduler }
      delete schedulerState.resetSessionAfterRun
      delete schedulerState.reason
      if (Object.keys(schedulerState).length > 0) {
        next._scheduler = schedulerState
      } else {
        delete next._scheduler
      }
    }

    return Object.keys(next).length > 0 ? next : null
  }

  _publicRuntimeState(runtimeState) {
    return this._clearSessionResetPending(runtimeState)
  }

  _assertReady() {
    if (!this.sessionDatabase) {
      throw new Error('ScheduledTaskService is not initialized')
    }
  }
}

module.exports = {
  ScheduledTaskService
}

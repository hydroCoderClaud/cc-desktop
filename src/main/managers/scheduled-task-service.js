const { BrowserWindow } = require('electron')

const DEFAULT_INTERVAL_MINUTES = 60
const DEFAULT_DAILY_TIME = '09:00'
const MAX_TIMER_DELAY_MS = 60 * 60 * 1000

function normalizeScheduleType(type) {
  const normalized = String(type || '').trim().toLowerCase()
  const allowed = new Set(['interval', 'daily', 'weekly', 'monthly', 'workdays', 'once'])
  return allowed.has(normalized) ? normalized : 'interval'
}

function normalizeTimestamp(value) {
  if (value == null || value === '') return null
  if (Number.isFinite(value)) return Math.trunc(Number(value))

  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeModelId(modelId) {
  if (typeof modelId !== 'string') return null

  const normalized = modelId.trim()
  return normalized || null
}

function normalizePositiveInteger(value) {
  if (value == null || value === '') return null

  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return Number.NaN
  }

  return normalized
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

function normalizeIntervalAnchorMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase()
  return normalized === 'finished_at' ? 'finished_at' : 'started_at'
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
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] == null ? 0 : Number(match[3])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null

  return { hours, minutes, seconds }
}

function formatClockTime({ hours, minutes, seconds = 0 }) {
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return seconds > 0 ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`
}

function getClockTimeFromTimestamp(timestamp) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return {
    hours: date.getHours(),
    minutes: date.getMinutes(),
    seconds: date.getSeconds()
  }
}

function applyClockTimeToTimestamp(baseTimestamp, clock) {
  const date = new Date(Number.isFinite(baseTimestamp) ? baseTimestamp : Date.now())
  date.setHours(clock.hours, clock.minutes, clock.seconds || 0, 0)
  return date.getTime()
}

function resolveExecutionAt(input, scheduleType) {
  const explicit = normalizeTimestamp(input?.firstRunAt)
  if (explicit) return explicit

  if (scheduleType === 'interval') {
    return normalizeTimestamp(input?.nextRunAt)
      || normalizeTimestamp(input?.lastScheduledAt)
      || normalizeTimestamp(input?.lastStartedAt)
      || normalizeTimestamp(input?.lastRunAt)
      || normalizeTimestamp(input?.createdAt)
      || normalizeTimestamp(input?.updatedAt)
      || null
  }

  if (scheduleType === 'once') {
    return null
  }

  const legacyClock = parseClockTime(input?.dailyTime)
  if (!legacyClock) return null

  return applyClockTimeToTimestamp(
    normalizeTimestamp(input?.createdAt) || normalizeTimestamp(input?.updatedAt) || Date.now(),
    legacyClock
  )
}

function resolveTaskClockTime(task) {
  const executionAt = normalizeTimestamp(task?.firstRunAt)
  if (executionAt) {
    return getClockTimeFromTimestamp(executionAt) || parseClockTime(DEFAULT_DAILY_TIME)
  }
  return parseClockTime(task?.dailyTime) || parseClockTime(DEFAULT_DAILY_TIME)
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
    triggerTimeNote: '以上触发时间由桌面调度器提供。除非任务内容明确要求，否则不要再次查询系统当前时间。',
    runtimeState: (value) => `运行态：\n${value}`,
    taskPromptTitle: '任务内容：',
    bootstrapTitle: '# 定时智能体任务',
    bootstrapTaskName: (value) => `任务名称：${value}`,
    bootstrapTriggerReason: (value) => `触发原因：${value}`,
    bootstrapTriggerTime: (value) => `触发时间：${value}`,
    bootstrapTriggerTimeNote: '以上触发时间由桌面调度器提供。除非任务内容明确要求，否则不要再次查询系统当前时间。',
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
    triggerTimeNote: 'The trigger time above is provided by the desktop scheduler. Do not query the current system time again unless the task content explicitly requires it.',
    runtimeState: (value) => `Runtime State:\n${value}`,
    taskPromptTitle: 'Task Content:',
    bootstrapTitle: '# Scheduled Agent Task',
    bootstrapTaskName: (value) => `Task Name: ${value}`,
    bootstrapTriggerReason: (value) => `Trigger Reason: ${value}`,
    bootstrapTriggerTime: (value) => `Trigger Time: ${value}`,
    bootstrapTriggerTimeNote: 'The trigger time above is provided by the desktop scheduler. Do not query the current system time again unless the task content explicitly requires it.',
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
    this._rearmScheduler()
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
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
    const nextRunAt = normalized.enabled && !this._hasReachedRunLimit(created)
      ? this._computeNextRunAt(created, Date.now())
      : null
    let task = this.sessionDatabase.updateScheduledTaskState(created.id, { nextRunAt })
    task = this._applyRunLimit(task)
    this._broadcastChange(task.id, 'created')

    this._rearmScheduler()

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
    const shouldResetOnEnable = !current.enabled && updated.enabled && !!updated.resetCountOnEnable
    const cwdChanged = normalized.cwd !== current.cwd
    const apiProfileChanged = normalized.apiProfileId !== current.apiProfileId
    const sessionBindingChanged = cwdChanged || apiProfileChanged
    const shouldRearmOnceTask = updated.scheduleType === 'once' && (
      updated.scheduleType !== current.scheduleType ||
      normalizeTimestamp(updated.firstRunAt) !== normalizeTimestamp(current.firstRunAt)
    )
    const stateUpdates = {}

    if (sessionBindingChanged) {
      if (this.runningTasks.has(taskId)) {
        stateUpdates.runtimeState = this._markSessionResetPending(
          current.runtimeState,
          cwdChanged ? 'cwd-changed' : 'api-profile-changed'
        )
      } else {
        stateUpdates.sessionId = null
        stateUpdates.runtimeState = this._clearSessionResetPending(current.runtimeState)
        this._detachTaskSession(current)
      }
    }

    if (shouldRearmOnceTask) {
      stateUpdates.lastStartedAt = null
      stateUpdates.lastScheduledAt = null
      stateUpdates.lastRunAt = null
    }

    if (shouldResetOnEnable) {
      stateUpdates.lastStartedAt = null
      stateUpdates.lastScheduledAt = null
      stateUpdates.lastRunAt = null
      stateUpdates.runCount = 0
      stateUpdates.failureCount = 0
      stateUpdates.lastError = null
      stateUpdates.runtimeState = this._clearSessionResetPending(stateUpdates.runtimeState ?? current.runtimeState)
    }

    const nextRunTask = shouldResetOnEnable || shouldRearmOnceTask
      ? {
          ...updated,
          lastRunAt: null,
          runCount: shouldResetOnEnable ? 0 : (updated.runCount || 0)
        }
      : updated
    const nextRunAt = updated.enabled && !this._hasReachedRunLimit(nextRunTask)
      ? this._computeNextRunAt(
          nextRunTask,
          Date.now()
        )
      : null
    stateUpdates.nextRunAt = nextRunAt
    let task = this.sessionDatabase.updateScheduledTaskState(taskId, stateUpdates)
    task = this._applyRunLimit(task)
    if (!sessionBindingChanged) {
      this._syncTaskSessionTitle(current, task)
    }
    this._broadcastChange(taskId, 'updated')

    this._rearmScheduler()

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
    this._rearmScheduler()
    return result
  }

  async runTaskNow(taskId) {
    this._assertReady()
    const task = this.sessionDatabase.getScheduledTask(taskId)
    if (!task) {
      throw new Error(`Scheduled task ${taskId} not found`)
    }
    if (this.runningTasks.has(taskId)) {
      throw new Error('Scheduled task is already running')
    }
    if (this._hasReachedRunLimit(task)) {
      this._applyRunLimit(task)
      this._broadcastChange(taskId, 'limit-reached')
      this._rearmScheduler()
      throw new Error('Scheduled task run limit reached')
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
    try {
      const now = Date.now()
      const tasks = this.sessionDatabase.listScheduledTasks()
        .filter(task => task.enabled && task.nextRunAt && task.nextRunAt <= now && !this.runningTasks.has(task.id))
        .sort((left, right) => {
          if (left.nextRunAt !== right.nextRunAt) {
            return left.nextRunAt - right.nextRunAt
          }
          return left.id - right.id
        })

      for (const task of tasks) {
        await this._executeTask(task, 'scheduled')
      }
    } finally {
      this._rearmScheduler()
    }
  }

  async _executeTask(task, triggerReason, { allowDisabled = false } = {}) {
    if (!allowDisabled && !task.enabled) return
    if (this._hasReachedRunLimit(task)) {
      this._applyRunLimit(task)
      this._broadcastChange(task.id, 'limit-reached')
      this._rearmScheduler()
      if (triggerReason === 'manual') {
        throw new Error('Scheduled task run limit reached')
      }
      return
    }
    if (this.runningTasks.has(task.id)) return

    this.runningTasks.add(task.id)
    let awaitingCompletion = false
    let activeSessionId = task.sessionId || null
    const scheduledAt = this._resolveScheduledAt(task, triggerReason)
    let startedAt = null

    try {
      const sessionId = this._ensureTaskSession(task)
      activeSessionId = sessionId
      const liveSession = this.agentSessionManager.get(sessionId) || this.agentSessionManager.reopen(sessionId)
      const isBootstrapRun = !this._hasConversationHistory(sessionId)

      if (liveSession?.status === 'streaming') {
        const skippedAt = Date.now()
        const intervalAnchorTs = this._resolveIntervalAnchorTs(task, {
          startedAt: null,
          scheduledAt,
          finishedAt: skippedAt,
          fallbackTs: skippedAt
        })
        this.sessionDatabase.createScheduledTaskRun({
          taskId: task.id,
          sessionId,
          triggerReason,
          status: 'skipped',
          errorMessage: 'Agent session is busy',
          scheduledAt,
          startedAt: null,
          finishedAt: skippedAt
        })
        const nextRunAt = task.enabled
          ? this._computeNextRunAt({ ...task, lastRunAt: intervalAnchorTs }, skippedAt, { intervalAnchorTs })
          : task.nextRunAt
        this.sessionDatabase.updateScheduledTaskState(task.id, {
          lastScheduledAt: scheduledAt ?? undefined,
          lastError: 'Agent session is busy',
          nextRunAt
        })
        this._broadcastChange(task.id, 'skipped')
        this.runningTasks.delete(task.id)
        this._rearmScheduler()
        return
      }

      startedAt = Date.now()
      this.activeRuns.set(sessionId, {
        taskId: task.id,
        sessionId,
        triggerReason,
        scheduledAt,
        startedAt
      })
      this.sessionDatabase.updateScheduledTaskState(task.id, {
        lastStartedAt: startedAt,
        lastScheduledAt: scheduledAt ?? undefined
      })

      await this.agentSessionManager.sendMessage(
        sessionId,
        this._buildTaskPrompt(task, triggerReason, startedAt, { bootstrap: isBootstrapRun }),
        {
          model: task.modelId || undefined,
          meta: { source: 'scheduled' }
        }
      )

      this.sessionDatabase.updateScheduledTaskState(task.id, {
        runCount: (task.runCount || 0) + 1
      })
      task = {
        ...task,
        runCount: (task.runCount || 0) + 1
      }

      const latestSession = this.agentSessionManager.get(sessionId)
      if (latestSession?.status === 'error') {
        throw new Error('Scheduled task session failed to start')
      }

      awaitingCompletion = true
      this._broadcastChange(task.id, 'started')
    } catch (err) {
      console.error(`[ScheduledTask] Run failed for task ${task.id}:`, err)
      const reachedRunLimit = this._hasReachedRunLimit(task)
      const finishedAt = Date.now()
      const effectiveStartedAt = Number.isFinite(startedAt) ? startedAt : null
      const intervalAnchorTs = this._resolveIntervalAnchorTs(task, {
        startedAt: effectiveStartedAt,
        scheduledAt,
        finishedAt,
        fallbackTs: finishedAt
      })
      const nextRunAt = task.enabled && !reachedRunLimit
        ? this._computeNextRunAt({ ...task, lastRunAt: intervalAnchorTs }, finishedAt, { intervalAnchorTs })
        : task.nextRunAt
      let updatedTask = this.sessionDatabase.updateScheduledTaskState(task.id, {
        lastScheduledAt: scheduledAt ?? undefined,
        lastStartedAt: effectiveStartedAt ?? undefined,
        lastRunAt: finishedAt,
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
        scheduledAt,
        startedAt: effectiveStartedAt,
        finishedAt
      })
      updatedTask = this._applyRunLimit(updatedTask)
      this._broadcastChange(task.id, 'failed')
      this._rearmScheduler()
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
    const reachedRunLimit = this._hasReachedRunLimit(task)
    const intervalAnchorTs = this._resolveIntervalAnchorTs(task, {
      startedAt: activeRun.startedAt,
      scheduledAt: activeRun.scheduledAt,
      finishedAt,
      fallbackTs: finishedAt
    })
    const nextRunAt = task?.enabled && !reachedRunLimit
      ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt, { intervalAnchorTs })
      : null
    const shouldResetSession = this._shouldResetSessionBinding(task?.runtimeState)
    const runtimeState = this._clearSessionResetPending(task?.runtimeState)
    if (shouldResetSession && task) {
      this._detachTaskSession(task)
    }

    let updatedTask = this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId: shouldResetSession ? null : sessionId,
      runtimeState,
      lastScheduledAt: activeRun.scheduledAt ?? undefined,
      lastStartedAt: activeRun.startedAt,
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
      scheduledAt: activeRun.scheduledAt,
      startedAt: activeRun.startedAt,
      finishedAt
    })

    updatedTask = this._applyRunLimit(updatedTask)

    this._broadcastChange(activeRun.taskId, 'completed')
    this._rearmScheduler()
  }

  _handleAgentError(sessionId, errorMessage) {
    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun || !this.sessionDatabase) return

    this.activeRuns.delete(sessionId)
    this.runningTasks.delete(activeRun.taskId)
    const task = this.sessionDatabase.getScheduledTask(activeRun.taskId)
    const finishedAt = Date.now()
    const reachedRunLimit = this._hasReachedRunLimit(task)
    const intervalAnchorTs = this._resolveIntervalAnchorTs(task, {
      startedAt: activeRun.startedAt,
      scheduledAt: activeRun.scheduledAt,
      finishedAt,
      fallbackTs: finishedAt
    })
    const nextRunAt = task?.enabled && !reachedRunLimit
      ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt, { intervalAnchorTs })
      : null
    const shouldResetSession = this._shouldResetSessionBinding(task?.runtimeState)
    const runtimeState = this._clearSessionResetPending(task?.runtimeState)
    if (shouldResetSession && task) {
      this._detachTaskSession(task)
    }

    let updatedTask = this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId: shouldResetSession ? null : sessionId,
      runtimeState,
      lastScheduledAt: activeRun.scheduledAt ?? undefined,
      lastStartedAt: activeRun.startedAt,
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
      scheduledAt: activeRun.scheduledAt,
      startedAt: activeRun.startedAt,
      finishedAt
    })

    updatedTask = this._applyRunLimit(updatedTask)

    this._broadcastChange(activeRun.taskId, 'failed')
    this._rearmScheduler()
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
      const stateUpdates = {
        sessionId: null,
        runtimeState: this._clearSessionResetPending(task.runtimeState)
      }

      if (activeRun?.taskId === task.id) {
        const reachedRunLimit = this._hasReachedRunLimit(task)
        const intervalAnchorTs = this._resolveIntervalAnchorTs(task, {
          startedAt: activeRun.startedAt,
          scheduledAt: activeRun.scheduledAt,
          finishedAt,
          fallbackTs: finishedAt
        })
        stateUpdates.lastScheduledAt = activeRun.scheduledAt ?? undefined
        stateUpdates.lastStartedAt = activeRun.startedAt ?? undefined
        stateUpdates.lastRunAt = finishedAt
        stateUpdates.lastError = 'Agent session deleted by user'
        stateUpdates.nextRunAt = task.enabled && !reachedRunLimit
          ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt, { intervalAnchorTs })
          : null
        this.sessionDatabase.createScheduledTaskRun({
          taskId: task.id,
          sessionId,
          triggerReason: activeRun.triggerReason,
          status: 'skipped',
          errorMessage: 'Agent session deleted by user',
          scheduledAt: activeRun.scheduledAt,
          startedAt: activeRun.startedAt,
          finishedAt
        })
      }

      const updatedTask = this.sessionDatabase.updateScheduledTaskState(task.id, stateUpdates)
      this._applyRunLimit(updatedTask)
      this._broadcastChange(task.id, 'session-unlinked')
    }
    this._rearmScheduler()
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
    const reachedRunLimit = this._hasReachedRunLimit(task)
    const intervalAnchorTs = this._resolveIntervalAnchorTs(task, {
      startedAt: activeRun.startedAt,
      scheduledAt: activeRun.scheduledAt,
      finishedAt,
      fallbackTs: finishedAt
    })
    const nextRunAt = task.enabled && !reachedRunLimit
      ? this._computeNextRunAt({ ...task, lastRunAt: finishedAt }, finishedAt, { intervalAnchorTs })
      : null
    const shouldResetSession = this._shouldResetSessionBinding(task.runtimeState)
    const runtimeState = this._clearSessionResetPending(task.runtimeState)
    if (shouldResetSession && task) {
      this._detachTaskSession(task)
    }

    let updatedTask = this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId: shouldResetSession ? null : sessionId,
      runtimeState,
      lastScheduledAt: activeRun.scheduledAt ?? undefined,
      lastStartedAt: activeRun.startedAt,
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
      scheduledAt: activeRun.scheduledAt,
      startedAt: activeRun.startedAt,
      finishedAt
    })

    updatedTask = this._applyRunLimit(updatedTask)

    this._broadcastChange(activeRun.taskId, 'interrupted')
    this._rearmScheduler()
  }

  _normalizeTaskInput(input, { partial = false } = {}) {
    const scheduleType = input.scheduleType === undefined && partial
      ? undefined
      : normalizeScheduleType(input.scheduleType)
    const intervalMinutes = normalizePositiveInteger(input.intervalMinutes)
    // Scheduled-task domain uses maxRuns as a lifecycle cap.
    // Per-conversation maxTurns remains a generic agent capability and is intentionally not exposed here.
    const maxRuns = normalizePositiveInteger(input.maxRuns)
    const resetCountOnEnable = Object.prototype.hasOwnProperty.call(input, 'resetCountOnEnable')
      ? !!input.resetCountOnEnable
      : undefined
    const weeklyDays = normalizeWeeklyDays(input.weeklyDays)
    const monthlyMode = input.monthlyMode === undefined && partial
      ? undefined
      : normalizeMonthlyMode(input.monthlyMode)
    const rawMonthlyDay = input.monthlyDay === undefined && partial
      ? undefined
      : normalizeMonthlyDay(input.monthlyDay)
    const monthlyDay = monthlyMode === 'last_day' ? null : rawMonthlyDay
    const normalizedFirstRunAt = resolveExecutionAt(input, scheduleType)

    if (!partial || Object.prototype.hasOwnProperty.call(input, 'name')) {
      if (!String(input.name || '').trim()) throw new Error('Task name is required')
    }
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'prompt')) {
      if (!String(input.prompt || '').trim()) throw new Error('Task prompt is required')
    }

    if (Object.prototype.hasOwnProperty.call(input, 'maxRuns') && Number.isNaN(maxRuns)) {
      throw new Error('Max runs must be a positive integer')
    }
    if (scheduleType === 'interval' && Number.isNaN(intervalMinutes)) {
      throw new Error('Interval minutes must be a positive integer')
    }
    if (scheduleType === 'interval' && !intervalMinutes) {
      throw new Error('Interval minutes must be greater than 0')
    }
    if (scheduleType === 'interval' && !normalizedFirstRunAt) {
      throw new Error('Interval schedule requires execution time')
    }
    if (scheduleType === 'daily' && !normalizedFirstRunAt) {
      throw new Error('Daily schedule requires execution time')
    }
    if (scheduleType === 'weekly') {
      if (!weeklyDays.length) throw new Error('Weekly schedule requires at least one day')
      if (!normalizedFirstRunAt) {
        throw new Error('Weekly schedule requires execution time')
      }
    }
    if (scheduleType === 'monthly') {
      if (!normalizedFirstRunAt) {
        throw new Error('Monthly schedule requires execution time')
      }
      if (monthlyMode !== 'last_day' && !monthlyDay) {
        throw new Error('Monthly schedule requires a valid day of month')
      }
    }
    if (scheduleType === 'workdays' && !normalizedFirstRunAt) {
      throw new Error('Workday schedule requires execution time')
    }
    if (scheduleType === 'once' && !normalizedFirstRunAt) {
      throw new Error('One-time schedule requires execution time')
    }

    return {
      name: Object.prototype.hasOwnProperty.call(input, 'name') ? String(input.name || '').trim() : undefined,
      prompt: Object.prototype.hasOwnProperty.call(input, 'prompt') ? String(input.prompt || '').trim() : undefined,
      cwd: Object.prototype.hasOwnProperty.call(input, 'cwd') ? (String(input.cwd || '').trim() || null) : undefined,
      apiProfileId: Object.prototype.hasOwnProperty.call(input, 'apiProfileId') ? (input.apiProfileId || null) : undefined,
      modelId: Object.prototype.hasOwnProperty.call(input, 'modelId') ? normalizeModelId(input.modelId) : undefined,
      maxRuns,
      resetCountOnEnable: resetCountOnEnable ?? false,
      intervalAnchorMode: Object.prototype.hasOwnProperty.call(input, 'intervalAnchorMode') || !partial
        ? normalizeIntervalAnchorMode(input.intervalAnchorMode)
        : undefined,
      enabled: Object.prototype.hasOwnProperty.call(input, 'enabled') ? !!input.enabled : undefined,
      scheduleType,
      intervalMinutes,
      dailyTime: scheduleType && scheduleType !== 'interval' && scheduleType !== 'once' && normalizedFirstRunAt
        ? formatClockTime(getClockTimeFromTimestamp(normalizedFirstRunAt) || parseClockTime(DEFAULT_DAILY_TIME))
        : (Object.prototype.hasOwnProperty.call(input, 'dailyTime') ? String(input.dailyTime || '') : undefined),
      weeklyDays,
      monthlyMode,
      monthlyDay,
      firstRunAt: normalizedFirstRunAt
    }
  }

  _computeNextRunAt(task, nowTs, options = {}) {
    if (!task?.enabled) return null
    const now = new Date(nowTs)
    const firstRunPending = !task.lastRunAt
    const firstRunAt = normalizeTimestamp(task.firstRunAt)

    if (task.scheduleType === 'once') {
      return firstRunPending ? firstRunAt : null
    }

    if (task.scheduleType === 'interval') {
      const intervalAnchorMode = normalizeIntervalAnchorMode(task.intervalAnchorMode)
      if (firstRunPending && firstRunAt) {
        return this._computeAnchoredIntervalSlot(task, nowTs, firstRunAt)
      }
      if (intervalAnchorMode === 'started_at' && firstRunAt) {
        return this._computeAnchoredIntervalSlot(task, nowTs, firstRunAt)
      }
    }

    return this._computeRecurringNextRunAt(task, now, nowTs, options)
  }

  _computeRecurringNextRunAt(task, now, nowTs, { intervalAnchorTs } = {}) {
    switch (task.scheduleType) {
      case 'daily':
        return this._computeNextDailyTime(task, now).getTime()
      case 'weekly':
        return this._computeNextWeeklyTime(task, now).getTime()
      case 'monthly':
        return this._computeNextMonthlyTime(task, now).getTime()
      case 'workdays':
        return this._computeNextWorkdayTime(task, now).getTime()
      case 'interval':
      default: {
        const minutes = Number(task.intervalMinutes) || DEFAULT_INTERVAL_MINUTES
        const anchorTs = Number.isFinite(intervalAnchorTs) ? intervalAnchorTs : nowTs
        return anchorTs + minutes * 60 * 1000
      }
    }
  }

  _computeAnchoredIntervalSlot(task, nowTs, anchorTs) {
    const minutes = Number(task?.intervalMinutes) || DEFAULT_INTERVAL_MINUTES
    const intervalMs = minutes * 60 * 1000
    if (!Number.isFinite(anchorTs)) {
      return nowTs + intervalMs
    }
    if (nowTs <= anchorTs) {
      return anchorTs
    }

    const elapsed = nowTs - anchorTs
    const steps = Math.ceil(elapsed / intervalMs)
    return anchorTs + steps * intervalMs
  }

  _resolveScheduledAt(task, triggerReason) {
    if (triggerReason !== 'scheduled') return null
    return Number.isFinite(task?.nextRunAt) ? task.nextRunAt : null
  }

  _rearmScheduler() {
    if (!this.started || !this.sessionDatabase) return

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const tasks = this.sessionDatabase.listScheduledTasks()
      .filter(task => task.enabled && task.nextRunAt && !this.runningTasks.has(task.id))

    if (!tasks.length) return

    const nextRunAt = tasks.reduce((earliest, task) => (
      earliest == null || task.nextRunAt < earliest ? task.nextRunAt : earliest
    ), null)

    if (!Number.isFinite(nextRunAt)) return

    const delayMs = Math.min(Math.max(0, nextRunAt - Date.now()), MAX_TIMER_DELAY_MS)
    this.timer = setTimeout(() => {
      this.timer = null
      this._checkDueTasks().catch(err => {
        console.error('[ScheduledTask] Due task check failed:', err)
        this._rearmScheduler()
      })
    }, delayMs)
  }

  _resolveIntervalAnchorTs(task, { startedAt, scheduledAt, finishedAt, fallbackTs }) {
    if (task?.scheduleType !== 'interval') {
      return Number.isFinite(fallbackTs) ? fallbackTs : finishedAt
    }

    const mode = normalizeIntervalAnchorMode(task.intervalAnchorMode)
    if (mode === 'finished_at' && Number.isFinite(finishedAt)) {
      return finishedAt
    }
    if (Number.isFinite(startedAt)) {
      return startedAt
    }
    if (Number.isFinite(scheduledAt)) {
      return scheduledAt
    }
    if (Number.isFinite(finishedAt)) {
      return finishedAt
    }
    return fallbackTs
  }

  _getPromptLocale() {
    const locale = this.configManager?.getConfig?.()?.settings?.locale
    return PROMPT_I18N[locale] ? locale : 'zh-CN'
  }

  _computeNextDailyTime(task, now) {
    const parsed = resolveTaskClockTime(task)
    const { hours, minutes, seconds } = parsed
    const target = new Date(now)
    target.setHours(hours, minutes, seconds || 0, 0)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target
  }

  _computeNextWeeklyTime(taskOrTime, weeklyDaysOrNow, maybeNow) {
    const task = taskOrTime && typeof taskOrTime === 'object' && !Array.isArray(taskOrTime)
      ? taskOrTime
      : null
    const now = task ? weeklyDaysOrNow : maybeNow
    const days = task ? normalizeWeeklyDays(task.weeklyDays) : normalizeWeeklyDays(weeklyDaysOrNow)
    const parsed = task ? resolveTaskClockTime(task) : (parseClockTime(taskOrTime) || parseClockTime(DEFAULT_DAILY_TIME))
    const { hours, minutes, seconds } = parsed
    const base = new Date(now)
    base.setSeconds(0, 0)

    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(base)
      candidate.setDate(base.getDate() + offset)
      candidate.setHours(hours, minutes, seconds || 0, 0)
      if (!days.includes(candidate.getDay())) continue
      if (candidate.getTime() > now.getTime()) return candidate
    }

    const fallback = new Date(base)
    fallback.setDate(base.getDate() + 7)
    fallback.setHours(hours, minutes, seconds || 0, 0)
    return fallback
  }

  _computeNextWorkdayTime(taskOrTime, now) {
    const task = taskOrTime && typeof taskOrTime === 'object' && !Array.isArray(taskOrTime)
      ? taskOrTime
      : null
    const parsed = task ? resolveTaskClockTime(task) : (parseClockTime(taskOrTime) || parseClockTime(DEFAULT_DAILY_TIME))
    const { hours, minutes, seconds } = parsed
    const base = new Date(now)
    base.setSeconds(0, 0)

    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(base)
      candidate.setDate(base.getDate() + offset)
      candidate.setHours(hours, minutes, seconds || 0, 0)
      const day = candidate.getDay()
      if (day === 0 || day === 6) continue
      if (candidate.getTime() > now.getTime()) return candidate
    }

    const fallback = new Date(base)
    fallback.setDate(base.getDate() + 1)
    fallback.setHours(hours, minutes, seconds || 0, 0)
    while (fallback.getDay() === 0 || fallback.getDay() === 6) {
      fallback.setDate(fallback.getDate() + 1)
    }
    return fallback
  }

  _computeNextMonthlyTime(taskOrTime, monthlyDayOrNow, monthlyModeOrUndefined, maybeNow) {
    const task = taskOrTime && typeof taskOrTime === 'object' && !Array.isArray(taskOrTime)
      ? taskOrTime
      : null
    const now = task ? monthlyDayOrNow : maybeNow
    const monthlyMode = task ? task.monthlyMode : monthlyModeOrUndefined
    const monthlyDay = task ? task.monthlyDay : monthlyDayOrNow
    const parsed = task ? resolveTaskClockTime(task) : (parseClockTime(taskOrTime) || parseClockTime(DEFAULT_DAILY_TIME))
    const { hours, minutes, seconds } = parsed
    const base = new Date(now)
    base.setSeconds(0, 0)

    const buildCandidate = (year, monthIndex) => {
      const candidate = new Date(year, monthIndex, 1, hours, minutes, seconds || 0, 0)
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

    const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1, hours, minutes, seconds || 0, 0)
    return buildCandidate(nextMonth.getFullYear(), nextMonth.getMonth())
  }

  _buildTaskPrompt(task, triggerReason, timestamp, { bootstrap = false } = {}) {
    return String(task?.prompt || '').trim()
  }

  _hasReachedRunLimit(task) {
    const maxRuns = Number(task?.maxRuns)
    if (!Number.isInteger(maxRuns) || maxRuns <= 0) return false
    return (task?.runCount || 0) >= maxRuns
  }

  _applyRunLimit(task) {
    if (!task || !this._hasReachedRunLimit(task)) return task

    if (task.enabled) {
      this.sessionDatabase.updateScheduledTask(task.id, { enabled: false })
    }

    return this.sessionDatabase.updateScheduledTaskState(task.id, { nextRunAt: null })
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

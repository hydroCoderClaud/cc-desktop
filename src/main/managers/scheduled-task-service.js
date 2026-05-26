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

function normalizeSessionBindingMode(value) {
  return value === 'current' ? 'current' : 'new'
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

function parseClientMeta(value) {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
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
    this.sessionTaskQueues = new Map()
    this.queuedTaskIds = new Set()
    this.drainingSessions = new Set()

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
    this.sessionTaskQueues.clear()
    this.queuedTaskIds.clear()
    this.drainingSessions.clear()
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
    const boundSessionId = this._resolveCreateBoundSessionId(input)
    const nextRunAt = normalized.enabled && !this._hasReachedRunLimit(created)
      ? this._computeNextRunAt(created, Date.now())
      : null
    const stateUpdates = {
      nextRunAt,
      runtimeState: this._buildEmbeddedCurrentSessionRuntimeState(input, null)
    }
    if (boundSessionId) {
      stateUpdates.sessionId = boundSessionId
    }
    let task = this.sessionDatabase.updateScheduledTaskState(created.id, stateUpdates)
    if (boundSessionId) {
      this._attachExistingSessionToTask(boundSessionId, created.id)
      task = {
        ...task,
        sessionId: boundSessionId
      }
    }
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
    const sessionBindingChanged = cwdChanged
    const shouldRearmOnceTask = updated.scheduleType === 'once' && (
      updated.scheduleType !== current.scheduleType ||
      normalizeTimestamp(updated.firstRunAt) !== normalizeTimestamp(current.firstRunAt)
    )
    const stateUpdates = {}
    const nextEmbeddedRuntimeState = this._buildEmbeddedCurrentSessionRuntimeState({ ...current, ...updates }, current.runtimeState)

    if (sessionBindingChanged) {
      if (this.runningTasks.has(taskId)) {
        stateUpdates.runtimeState = this._markSessionResetPending(
          nextEmbeddedRuntimeState,
          'cwd-changed'
        )
      } else {
        stateUpdates.sessionId = null
        stateUpdates.runtimeState = this._clearSessionResetPending(nextEmbeddedRuntimeState)
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
      stateUpdates.runtimeState = this._clearSessionResetPending(stateUpdates.runtimeState ?? nextEmbeddedRuntimeState)
    }

    if (!Object.prototype.hasOwnProperty.call(stateUpdates, 'runtimeState') && nextEmbeddedRuntimeState !== current.runtimeState) {
      stateUpdates.runtimeState = nextEmbeddedRuntimeState
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
    this._removeQueuedTask(taskId)
    if (current.sessionId) {
      this._clearTaskActiveRun(current)
      this._detachTaskSession(current)
    }
    const result = this.sessionDatabase.deleteScheduledTask(taskId)
    this._broadcastChange(taskId, 'deleted')
    this._rearmScheduler()
    this._scheduleDrainQueuedSessionTasks(current.sessionId)
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
    this._assertTaskModelId(task)
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
        .filter(task => task.enabled && task.nextRunAt && task.nextRunAt <= now && !this.runningTasks.has(task.id) && !this.queuedTaskIds.has(task.id))
        .sort((left, right) => {
          if (left.nextRunAt !== right.nextRunAt) {
            return left.nextRunAt - right.nextRunAt
          }
          return left.id - right.id
        })

      for (const task of tasks) {
        this._assertTaskModelId(task)
        await this._executeTask(task, 'scheduled')
      }
    } finally {
      this._rearmScheduler()
    }
  }

  async _executeTask(task, triggerReason, { allowDisabled = false, scheduledAtOverride } = {}) {
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
    if (this.runningTasks.has(task.id) || this.queuedTaskIds.has(task.id)) return

    let awaitingCompletion = false
    let activeSessionId = task.sessionId || null
    const scheduledAt = this._resolveScheduledAt(task, triggerReason, scheduledAtOverride)
    let startedAt = null

    try {
      const sessionId = this._ensureTaskSession(task)
      if (!sessionId) {
        const reason = this._getEmbeddedCurrentSessionMissingReason(task)
        if (reason) {
          const skippedAt = Date.now()
          const intervalAnchorTs = this._resolveIntervalAnchorTs(task, {
            startedAt: null,
            scheduledAt,
            finishedAt: skippedAt,
            fallbackTs: skippedAt
          })
          this.sessionDatabase.createScheduledTaskRun({
            taskId: task.id,
            sessionId: null,
            triggerReason,
            status: 'skipped',
            errorMessage: reason,
            scheduledAt,
            startedAt: null,
            finishedAt: skippedAt
          })
          const nextRunAt = task.enabled
            ? this._computeNextRunAt({ ...task, lastRunAt: intervalAnchorTs }, skippedAt, { intervalAnchorTs })
            : task.nextRunAt
          this.sessionDatabase.updateScheduledTaskState(task.id, {
            lastScheduledAt: scheduledAt ?? undefined,
            lastError: reason,
            nextRunAt
          })
          this._broadcastChange(task.id, 'skipped')
          this._rearmScheduler()
          return
        }
      }
      activeSessionId = sessionId
      const liveSession = this.agentSessionManager.get(sessionId) || this.agentSessionManager.reopen(sessionId)
      const isBootstrapRun = !this._hasConversationHistory(sessionId)
      const embeddedUnavailableReason = this._getEmbeddedAppUnavailableReason(sessionId, liveSession)

      if (embeddedUnavailableReason) {
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
          errorMessage: embeddedUnavailableReason,
          scheduledAt,
          startedAt: null,
          finishedAt: skippedAt
        })
        const nextRunAt = task.enabled
          ? this._computeNextRunAt({ ...task, lastRunAt: intervalAnchorTs }, skippedAt, { intervalAnchorTs })
          : task.nextRunAt
        this.sessionDatabase.updateScheduledTaskState(task.id, {
          lastScheduledAt: scheduledAt ?? undefined,
          lastError: embeddedUnavailableReason,
          nextRunAt
        })
        this._broadcastChange(task.id, 'skipped')
        this._rearmScheduler()
        return
      }

      if (liveSession?.status === 'streaming') {
        this._enqueueTaskForSession(sessionId, task, {
          triggerReason,
          allowDisabled,
          scheduledAt
        })
        this._rearmScheduler()
        return
      }

      this.runningTasks.add(task.id)
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
        { meta: { source: 'scheduled' } }
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
      this._scheduleDrainQueuedSessionTasks(activeSessionId)
    } finally {
      if (!awaitingCompletion) {
        this.runningTasks.delete(task.id)
      }
    }
  }

  _ensureTaskSession(task) {
    const embeddedCurrentBinding = this._resolveEmbeddedCurrentSessionBinding(task)
    if (embeddedCurrentBinding) {
      const currentSessionId = this._resolveEmbeddedCurrentSessionId(embeddedCurrentBinding.appId)
      if (currentSessionId) {
        const row = this.sessionDatabase.getAgentConversation(currentSessionId)
        if (row?.session_id) {
          if (task.sessionId !== currentSessionId) {
            this.sessionDatabase.updateScheduledTaskState(task.id, { sessionId: currentSessionId })
          }
          this._attachExistingSessionToTask(currentSessionId, task.id)
          return currentSessionId
        }
      }
      return null
    }

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
        taskId: task.id,
        meta: { scheduledTaskId: task.id }
      })
      sessionId = session.id
      this.sessionDatabase.updateScheduledTaskState(task.id, { sessionId })
    } else {
      this._attachExistingSessionToTask(sessionId, task.id)
    }

    return sessionId
  }

  _resolveCreateBoundSessionId(input) {
    if (!this.sessionDatabase || !input || input.sessionBindingMode !== 'current') {
      return null
    }

    const sessionId = typeof input.boundSessionId === 'string' ? input.boundSessionId.trim() : ''
    if (!sessionId) return null

    const existing = this.sessionDatabase.getAgentConversation(sessionId)
    return existing?.session_id ? sessionId : null
  }

  _buildEmbeddedCurrentSessionRuntimeState(input, fallbackRuntimeState) {
    const base = fallbackRuntimeState && typeof fallbackRuntimeState === 'object'
      ? { ...fallbackRuntimeState }
      : {}
    const baseScheduler = base._scheduler && typeof base._scheduler === 'object'
      ? { ...base._scheduler }
      : {}
    delete baseScheduler.followEmbeddedCurrentSession
    delete baseScheduler.embeddedAppId

    const binding = this._resolveEmbeddedCurrentSessionBinding({
      runtimeState: fallbackRuntimeState,
      sessionBindingMode: input?.sessionBindingMode,
      boundSessionId: input?.boundSessionId,
      sessionId: input?.boundSessionId || input?.sessionId
    })
    if (binding?.appId) {
      baseScheduler.followEmbeddedCurrentSession = true
      baseScheduler.embeddedAppId = binding.appId
    }

    if (Object.keys(baseScheduler).length > 0) {
      base._scheduler = baseScheduler
    } else {
      delete base._scheduler
    }

    return Object.keys(base).length > 0 ? base : null
  }

  _resolveEmbeddedCurrentSessionBinding(taskLike) {
    if ((taskLike?.sessionBindingMode || 'new') !== 'current') {
      return null
    }

    const runtimeState = taskLike?.runtimeState
    const schedulerState = runtimeState?._scheduler
    const runtimeAppId = typeof schedulerState?.embeddedAppId === 'string' ? schedulerState.embeddedAppId.trim() : ''
    if (schedulerState?.followEmbeddedCurrentSession && runtimeAppId) {
      return { appId: runtimeAppId }
    }

    const sessionId = typeof taskLike?.boundSessionId === 'string' && taskLike.boundSessionId.trim()
      ? taskLike.boundSessionId.trim()
      : (typeof taskLike?.sessionId === 'string' ? taskLike.sessionId.trim() : '')
    if (!sessionId) return null

    const binding = this._resolveEmbeddedAppBinding(sessionId)
    return binding?.appId ? { appId: binding.appId } : null
  }

  _resolveEmbeddedCurrentSessionId(appId) {
    const runtimeManager = this.agentSessionManager?.embeddedAppRuntimeManager
    if (!runtimeManager || !appId || typeof runtimeManager.getCurrentSession !== 'function') {
      return null
    }
    const sessionId = runtimeManager.getCurrentSession(appId)
    return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null
  }

  _getEmbeddedCurrentSessionMissingReason(task) {
    const binding = this._resolveEmbeddedCurrentSessionBinding(task)
    if (!binding?.appId) return null
    return `Embedded app "${binding.appId}" has no current session to follow`
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

    const reboundTaskId = this._resolveRemainingBoundTaskId(task.sessionId, task.id)

    try {
      this.sessionDatabase.updateAgentConversation(task.sessionId, {
        taskId: reboundTaskId || null
      })
    } catch (err) {
      console.error(`[ScheduledTask] Failed to detach session for task ${task.id}:`, err)
      return
    }

    const liveSession = this._getLiveSession(task.sessionId)
    if (liveSession) {
      liveSession.taskId = reboundTaskId || null
      if (reboundTaskId) {
        liveSession.meta = {
          ...(liveSession.meta || {}),
          scheduledTaskId: reboundTaskId
        }
      } else if (liveSession.meta?.scheduledTaskId === task.id) {
        delete liveSession.meta.scheduledTaskId
      }
    }
  }

  _attachExistingSessionToTask(sessionId, taskId) {
    if (!sessionId || !taskId) return

    const liveSession = this._getLiveSession(sessionId)
    if (liveSession) {
      liveSession.taskId = taskId
      liveSession.meta = {
        ...(liveSession.meta || {}),
        scheduledTaskId: taskId
      }
    }

    if (!this.sessionDatabase?.updateAgentConversation) return

    const persistedUpdates = {
      taskId
    }
    if (liveSession?.ownerClientId) {
      persistedUpdates.ownerClientId = liveSession.ownerClientId
    }
    if (liveSession?.clientType) {
      persistedUpdates.clientType = liveSession.clientType
    }
    if (liveSession?.clientMeta && typeof liveSession.clientMeta === 'object' && !Array.isArray(liveSession.clientMeta)) {
      persistedUpdates.clientMeta = liveSession.clientMeta
    }

    try {
      this.sessionDatabase.updateAgentConversation(sessionId, persistedUpdates)
    } catch (err) {
      console.error(`[ScheduledTask] Failed to attach existing session ${sessionId} to task ${taskId}:`, err)
    }
  }

  _getLiveSession(sessionId) {
    if (!sessionId) return null
    return this.agentSessionManager?.sessions?.get?.(sessionId) || null
  }

  _resolveRemainingBoundTaskId(sessionId, excludingTaskId) {
    if (!sessionId || !this.sessionDatabase?.listScheduledTasks) return null

    const remainingTask = this.sessionDatabase.listScheduledTasks()
      .find(task => task?.sessionId === sessionId && task?.id !== excludingTaskId)

    return remainingTask?.id || null
  }

  _clearTaskActiveRun(task) {
    const sessionId = task?.sessionId
    if (!sessionId) return

    const activeRun = this.activeRuns.get(sessionId)
    if (activeRun?.taskId !== task.id) return

    this.activeRuns.delete(sessionId)
  }

  _handleAgentResult(sessionId) {
    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun || !this.sessionDatabase) {
      this._scheduleDrainQueuedSessionTasks(sessionId)
      return
    }

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
    this._scheduleDrainQueuedSessionTasks(sessionId)
  }

  _handleAgentError(sessionId, errorMessage) {
    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun || !this.sessionDatabase) {
      this._scheduleDrainQueuedSessionTasks(sessionId)
      return
    }

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
    this._scheduleDrainQueuedSessionTasks(sessionId)
  }

  _handleAgentDeleted(sessionId) {
    if (!sessionId || !this.sessionDatabase) return

    const tasks = this.sessionDatabase.listScheduledTasks()
      .filter(task => task.sessionId === sessionId)
    if (!tasks.length) {
      this._scheduleDrainQueuedSessionTasks(sessionId)
      return
    }

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
    this._scheduleDrainQueuedSessionTasks(sessionId)
  }

  _handleAgentInterrupted(sessionId, details = {}) {
    if (!sessionId || !this.sessionDatabase) return

    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun) {
      this._scheduleDrainQueuedSessionTasks(sessionId)
      return
    }

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
    this._scheduleDrainQueuedSessionTasks(sessionId)
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
    const sessionBindingMode = normalizeSessionBindingMode(input.sessionBindingMode)

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
      apiProfileId: null,
      sessionBindingMode,
      modelId: null,
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

  _assertTaskModelId(task) {
    return task
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

  _resolveScheduledAt(task, triggerReason, override) {
    if (Number.isFinite(override)) return override
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
      .filter(task => task.enabled && task.nextRunAt && !this.runningTasks.has(task.id) && !this.queuedTaskIds.has(task.id))

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

  _getEmbeddedAppUnavailableReason(sessionId, liveSession = null) {
    const binding = this._resolveEmbeddedAppBinding(sessionId, liveSession)
    if (!binding?.appId) return null
    return this._isEmbeddedAppCommandBridgeAvailable(binding.appId)
      ? null
      : `Embedded app "${binding.appId}" is not active`
  }

  _resolveEmbeddedAppBinding(sessionId, liveSession = null) {
    const session = liveSession || this._getLiveSession(sessionId) || this.agentSessionManager?.get?.(sessionId) || null
    const sessionClientType = typeof session?.clientType === 'string' ? session.clientType.trim() : ''
    const sessionClientMeta = parseClientMeta(session?.clientMeta)
    const sessionAppId = sessionClientMeta?.appId || sessionClientMeta?.embeddedAppId || null
    if (sessionClientType === 'embedded' && sessionAppId) {
      return {
        appId: sessionAppId,
        clientType: sessionClientType
      }
    }

    const row = this.sessionDatabase?.getAgentConversation?.(sessionId)
    const rowClientType = typeof row?.client_type === 'string' ? row.client_type.trim() : ''
    const rowClientMeta = parseClientMeta(row?.client_meta)
    const rowAppId = rowClientMeta?.appId || rowClientMeta?.embeddedAppId || null
    if (rowClientType === 'embedded' && rowAppId) {
      return {
        appId: rowAppId,
        clientType: rowClientType
      }
    }

    return null
  }

  _isEmbeddedAppCommandBridgeAvailable(appId) {
    const runtimeManager = this.agentSessionManager?.embeddedAppRuntimeManager
    if (!runtimeManager || !appId) return false

    const normalizedAppId = typeof runtimeManager._normalizeAppId === 'function'
      ? runtimeManager._normalizeAppId(appId)
      : String(appId).trim()
    const appState = runtimeManager.appStates?.get?.(normalizedAppId)
    return Boolean(appState && appState.commands instanceof Map && appState.commands.size > 0)
  }

  _enqueueTaskForSession(sessionId, task, { triggerReason, allowDisabled = false, scheduledAt } = {}) {
    if (!sessionId || !task?.id) return false
    if (this.queuedTaskIds.has(task.id)) return false

    const queue = this.sessionTaskQueues.get(sessionId) || []
    queue.push({
      taskId: task.id,
      triggerReason,
      allowDisabled,
      scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : null
    })
    this.sessionTaskQueues.set(sessionId, queue)
    this.queuedTaskIds.add(task.id)

    if (Number.isFinite(scheduledAt)) {
      this.sessionDatabase?.updateScheduledTaskState?.(task.id, {
        lastScheduledAt: scheduledAt
      })
    }

    this._broadcastChange(task.id, 'queued')
    return true
  }

  _removeQueuedTask(taskId) {
    if (!this.queuedTaskIds.has(taskId)) return false

    let removed = false
    for (const [sessionId, queue] of this.sessionTaskQueues.entries()) {
      const nextQueue = queue.filter(entry => entry.taskId !== taskId)
      if (nextQueue.length !== queue.length) {
        removed = true
        if (nextQueue.length) {
          this.sessionTaskQueues.set(sessionId, nextQueue)
        } else {
          this.sessionTaskQueues.delete(sessionId)
        }
      }
    }

    this.queuedTaskIds.delete(taskId)
    return removed
  }

  _shiftQueuedTask(sessionId) {
    const queue = this.sessionTaskQueues.get(sessionId)
    if (!queue?.length) return null

    const next = queue.shift()
    if (queue.length) {
      this.sessionTaskQueues.set(sessionId, queue)
    } else {
      this.sessionTaskQueues.delete(sessionId)
    }

    if (next?.taskId) {
      this.queuedTaskIds.delete(next.taskId)
    }

    return next
  }

  _scheduleDrainQueuedSessionTasks(sessionId) {
    if (!sessionId) return
    this._drainQueuedSessionTasks(sessionId).catch(err => {
      console.error(`[ScheduledTask] Failed to drain queued tasks for session ${sessionId}:`, err)
    })
  }

  async _drainQueuedSessionTasks(sessionId) {
    if (!sessionId || !this.sessionDatabase) return
    if (this.drainingSessions.has(sessionId)) return

    this.drainingSessions.add(sessionId)
    try {
      while (true) {
        const queue = this.sessionTaskQueues.get(sessionId)
        if (!queue?.length) break

        const liveSession = this.agentSessionManager.get?.(sessionId) || this._getLiveSession(sessionId)
        if (this.activeRuns.has(sessionId) || liveSession?.status === 'streaming') {
          break
        }

        const queued = this._shiftQueuedTask(sessionId)
        if (!queued) break

        const task = this.sessionDatabase.getScheduledTask(queued.taskId)
        if (!task) continue
        if (!queued.allowDisabled && !task.enabled) continue

        await this._executeTask(task, queued.triggerReason, {
          allowDisabled: queued.allowDisabled,
          scheduledAtOverride: queued.scheduledAt
        })

        if (this.activeRuns.has(sessionId)) {
          break
        }
      }
    } finally {
      this.drainingSessions.delete(sessionId)
      this._rearmScheduler()
    }
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

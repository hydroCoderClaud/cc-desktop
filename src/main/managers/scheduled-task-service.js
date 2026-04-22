const { BrowserWindow } = require('electron')

const CHECK_INTERVAL_MS = 30 * 1000
const DEFAULT_INTERVAL_MINUTES = 60

function normalizeModelTier(tier) {
  if (!tier) return null

  const normalized = String(tier).trim().toLowerCase()
  if (!normalized) return null

  const aliases = {
    powerful: 'opus',
    balanced: 'sonnet',
    fast: 'haiku'
  }

  return aliases[normalized] || normalized
}

function normalizeWeeklyDays(days) {
  if (!Array.isArray(days)) return []
  return Array.from(new Set(days
    .map(day => Number(day))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
  )).sort((a, b) => a - b)
}

function formatDateParts(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return { year, month, day }
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
    this.startupTriggeredTaskIds = new Set()

    this._onAgentResult = this._handleAgentResult.bind(this)
    this._onAgentError = this._handleAgentError.bind(this)

    if (this.agentSessionManager?.on) {
      this.agentSessionManager.on('agentResult', this._onAgentResult)
      this.agentSessionManager.on('agentError', this._onAgentError)
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
      this._runStartupTasks().catch(err => {
        console.error('[ScheduledTask] Startup tasks failed:', err)
      })
    }, 1500)

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
    } else if (this.agentSessionManager?.removeListener) {
      this.agentSessionManager.removeListener('agentResult', this._onAgentResult)
      this.agentSessionManager.removeListener('agentError', this._onAgentError)
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

  createTask(input) {
    this._assertReady()
    const normalized = this._normalizeTaskInput(input)
    const created = this.sessionDatabase.createScheduledTask(normalized)
    const nextRunAt = normalized.enabled ? this._computeNextRunAt(created, Date.now()) : null
    const task = this.sessionDatabase.updateScheduledTaskState(created.id, { nextRunAt })
    this._broadcastChange(task.id, 'created')
    return task
  }

  updateTask(taskId, updates) {
    this._assertReady()
    const current = this.sessionDatabase.getScheduledTask(taskId)
    if (!current) {
      throw new Error(`Scheduled task ${taskId} not found`)
    }

    const normalized = this._normalizeTaskInput({ ...current, ...updates }, { partial: true })
    const updated = this.sessionDatabase.updateScheduledTask(taskId, normalized)
    const nextRunAt = updated.enabled ? this._computeNextRunAt(updated, Date.now()) : null
    const task = this.sessionDatabase.updateScheduledTaskState(taskId, { nextRunAt })
    this._syncTaskSessionTitle(current, updated)
    this._broadcastChange(taskId, 'updated')
    return task
  }

  deleteTask(taskId) {
    this._assertReady()
    const current = this.sessionDatabase.getScheduledTask(taskId)
    if (!current) return { success: true }
    this.runningTasks.delete(taskId)
    if (current.sessionId) {
      this.activeRuns.delete(current.sessionId)
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

  async _runStartupTasks() {
    if (!this.sessionDatabase) return
    const tasks = this.sessionDatabase.listScheduledTasks()
      .filter(task => task.enabled && task.runOnStartup)

    for (const task of tasks) {
      if (this.startupTriggeredTaskIds.has(task.id)) continue
      this.startupTriggeredTaskIds.add(task.id)
      await this._executeTask(task, 'startup')
    }
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
        const nextRunAt = task.enabled ? this._computeNextRunAt(task, Date.now()) : task.nextRunAt
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
        this._buildTaskPrompt(task, triggerReason, startedAt),
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
      const nextRunAt = task.enabled ? this._computeNextRunAt(task, Date.now()) : task.nextRunAt
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

  _handleAgentResult(sessionId) {
    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun || !this.sessionDatabase) return

    this.activeRuns.delete(sessionId)
    this.runningTasks.delete(activeRun.taskId)
    const task = this.sessionDatabase.getScheduledTask(activeRun.taskId)
    const finishedAt = Date.now()
    const nextRunAt = task?.enabled ? this._computeNextRunAt(task, finishedAt) : null

    this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId,
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
    const nextRunAt = task?.enabled ? this._computeNextRunAt(task, finishedAt) : null

    this.sessionDatabase.updateScheduledTaskState(activeRun.taskId, {
      sessionId,
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

  _normalizeTaskInput(input, { partial = false } = {}) {
    const scheduleType = input.scheduleType || (partial ? undefined : 'interval')
    const intervalMinutes = input.intervalMinutes == null || input.intervalMinutes === ''
      ? null
      : Math.max(1, Number(input.intervalMinutes))
    const maxTurns = input.maxTurns == null || input.maxTurns === ''
      ? null
      : Math.max(1, Number(input.maxTurns))
    const weeklyDays = normalizeWeeklyDays(input.weeklyDays)

    if (!partial || Object.prototype.hasOwnProperty.call(input, 'name')) {
      if (!String(input.name || '').trim()) throw new Error('Task name is required')
    }
    if (!partial || Object.prototype.hasOwnProperty.call(input, 'prompt')) {
      if (!String(input.prompt || '').trim()) throw new Error('Task prompt is required')
    }

    if (scheduleType === 'interval' && (!intervalMinutes || !Number.isFinite(intervalMinutes))) {
      throw new Error('Interval minutes must be greater than 0')
    }
    if (scheduleType === 'daily' && !/^\d{2}:\d{2}$/.test(String(input.dailyTime || ''))) {
      throw new Error('Daily schedule requires HH:mm time')
    }
    if (scheduleType === 'weekly') {
      if (!weeklyDays.length) throw new Error('Weekly schedule requires at least one day')
      if (!/^\d{2}:\d{2}$/.test(String(input.dailyTime || ''))) {
        throw new Error('Weekly schedule requires HH:mm time')
      }
    }

    return {
      name: Object.prototype.hasOwnProperty.call(input, 'name') ? String(input.name || '').trim() : undefined,
      prompt: Object.prototype.hasOwnProperty.call(input, 'prompt') ? String(input.prompt || '').trim() : undefined,
      cwd: Object.prototype.hasOwnProperty.call(input, 'cwd') ? (String(input.cwd || '').trim() || null) : undefined,
      apiProfileId: Object.prototype.hasOwnProperty.call(input, 'apiProfileId') ? (input.apiProfileId || null) : undefined,
      modelTier: Object.prototype.hasOwnProperty.call(input, 'modelTier') ? normalizeModelTier(input.modelTier) : undefined,
      maxTurns,
      enabled: Object.prototype.hasOwnProperty.call(input, 'enabled') ? !!input.enabled : undefined,
      runOnStartup: Object.prototype.hasOwnProperty.call(input, 'runOnStartup') ? !!input.runOnStartup : undefined,
      scheduleType,
      intervalMinutes,
      dailyTime: Object.prototype.hasOwnProperty.call(input, 'dailyTime') ? String(input.dailyTime || '') : undefined,
      weeklyDays
    }
  }

  _computeNextRunAt(task, nowTs) {
    if (!task?.enabled) return null
    const now = new Date(nowTs)

    switch (task.scheduleType) {
      case 'daily':
        return this._computeNextDailyTime(task.dailyTime, now).getTime()
      case 'weekly':
        return this._computeNextWeeklyTime(task.dailyTime, task.weeklyDays, now).getTime()
      case 'interval':
      default: {
        const minutes = Number(task.intervalMinutes) || DEFAULT_INTERVAL_MINUTES
        return nowTs + minutes * 60 * 1000
      }
    }
  }

  _computeNextDailyTime(time, now) {
    const [hours, minutes] = String(time || '09:00').split(':').map(Number)
    const target = new Date(now)
    target.setHours(hours || 0, minutes || 0, 0, 0)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    return target
  }

  _computeNextWeeklyTime(time, weeklyDays, now) {
    const days = normalizeWeeklyDays(weeklyDays)
    const [hours, minutes] = String(time || '09:00').split(':').map(Number)
    const base = new Date(now)
    base.setSeconds(0, 0)

    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(base)
      candidate.setDate(base.getDate() + offset)
      candidate.setHours(hours || 0, minutes || 0, 0, 0)
      if (!days.includes(candidate.getDay())) continue
      if (candidate.getTime() > now.getTime()) return candidate
    }

    const fallback = new Date(base)
    fallback.setDate(base.getDate() + 7)
    fallback.setHours(hours || 0, minutes || 0, 0, 0)
    return fallback
  }

  _buildTaskPrompt(task, triggerReason, timestamp) {
    const { year, month, day } = formatDateParts(timestamp)
    const runtimeState = task.runtimeState
      ? `\n\n# Runtime State\n${JSON.stringify(task.runtimeState, null, 2)}`
      : ''

    return [
      '# Scheduled Agent Task',
      `Task Name: ${task.name}`,
      `Trigger Reason: ${triggerReason}`,
      `Trigger Time: ${year}-${month}-${day} ${new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })}`,
      'This run was started automatically by the desktop scheduler.',
      runtimeState,
      '',
      '# Task Prompt',
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

  _assertReady() {
    if (!this.sessionDatabase) {
      throw new Error('ScheduledTaskService is not initialized')
    }
  }
}

module.exports = {
  ScheduledTaskService
}

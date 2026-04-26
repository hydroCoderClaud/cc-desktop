/**
 * Scheduled Task Database Operations Mixin
 *
 * 定时任务定义、运行态与历史的数据库操作方法
 */

function parseJSON(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeModelId(modelId) {
  if (typeof modelId !== 'string') return null

  const normalized = modelId.trim()
  return normalized || null
}

function mapScheduledTaskRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name || '',
    prompt: row.prompt || '',
    cwd: row.cwd || null,
    apiProfileId: row.api_profile_id || null,
    modelId: normalizeModelId(row.model_id),
    maxTurns: row.max_turns || null,
    enabled: !!row.enabled,
    scheduleType: row.schedule_type || 'interval',
    intervalMinutes: row.interval_minutes || null,
    dailyTime: row.daily_time || '',
    weeklyDays: parseJSON(row.weekly_days, []),
    monthlyMode: row.monthly_mode || 'day_of_month',
    monthlyDay: row.monthly_day ?? null,
    firstRunMode: row.first_run_mode || (row.schedule_type === 'once' ? 'custom' : 'next_slot'),
    firstRunAt: row.first_run_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    sessionId: row.session_id || null,
    runtimeState: parseJSON(row.runtime_state, null),
    lastRunAt: row.last_run_at || null,
    nextRunAt: row.next_run_at || null,
    lastError: row.last_error || null,
    failureCount: row.failure_count || 0
  }
}

function mapScheduledTaskRunRow(row) {
  if (!row) return null
  return {
    id: row.id,
    taskId: row.task_id,
    sessionId: row.session_id || null,
    triggerReason: row.trigger_reason || 'scheduled',
    status: row.status || 'success',
    errorMessage: row.error_message || null,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    createdAt: row.created_at || null
  }
}

function withScheduledTaskOperations(BaseClass) {
  return class extends BaseClass {
    listScheduledTasks() {
      const rows = this.db.prepare(`
        SELECT
          t.*,
          s.session_id,
          s.runtime_state,
          s.last_run_at,
          s.next_run_at,
          s.last_error,
          s.failure_count
        FROM scheduled_tasks t
        LEFT JOIN scheduled_task_state s ON s.task_id = t.id
        ORDER BY t.updated_at DESC, t.id DESC
      `).all()

      return rows.map(mapScheduledTaskRow)
    }

    getScheduledTask(taskId) {
      const row = this.db.prepare(`
        SELECT
          t.*,
          s.session_id,
          s.runtime_state,
          s.last_run_at,
          s.next_run_at,
          s.last_error,
          s.failure_count
        FROM scheduled_tasks t
        LEFT JOIN scheduled_task_state s ON s.task_id = t.id
        WHERE t.id = ?
      `).get(taskId)

      return mapScheduledTaskRow(row)
    }

    createScheduledTask(task) {
      const now = Date.now()
      const result = this.db.prepare(`
        INSERT INTO scheduled_tasks (
          name, prompt, cwd, api_profile_id, model_id, max_turns,
          enabled, run_on_startup, schedule_type, interval_minutes, daily_time, weekly_days, first_run_mode, first_run_at,
          monthly_mode, monthly_day,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.name || '',
        task.prompt || '',
        task.cwd || null,
        task.apiProfileId || null,
        task.modelId || null,
        task.maxTurns || null,
        task.enabled ? 1 : 0,
        0,
        task.scheduleType || 'interval',
        task.intervalMinutes || null,
        task.dailyTime || '',
        JSON.stringify(task.weeklyDays || []),
        task.firstRunMode || 'next_slot',
        task.firstRunAt || null,
        task.monthlyMode || 'day_of_month',
        task.monthlyMode === 'last_day' ? null : (task.monthlyDay || 1),
        now,
        now
      )

      const taskId = Number(result.lastInsertRowid)
      this.ensureScheduledTaskState(taskId)
      return this.getScheduledTask(taskId)
    }

    updateScheduledTask(taskId, updates) {
      const fields = []
      const values = []
      const mapping = {
        name: 'name',
        prompt: 'prompt',
        cwd: 'cwd',
        apiProfileId: 'api_profile_id',
        modelId: 'model_id',
        maxTurns: 'max_turns',
        enabled: 'enabled',
        scheduleType: 'schedule_type',
        intervalMinutes: 'interval_minutes',
        dailyTime: 'daily_time',
        weeklyDays: 'weekly_days',
        monthlyMode: 'monthly_mode',
        monthlyDay: 'monthly_day',
        firstRunMode: 'first_run_mode',
        firstRunAt: 'first_run_at'
      }

      for (const [key, value] of Object.entries(updates)) {
        const column = mapping[key]
        if (!column) continue
        if (value === undefined) continue
        fields.push(`${column} = ?`)
        if (key === 'weeklyDays') {
          values.push(JSON.stringify(value || []))
        } else if (key === 'enabled') {
          values.push(value ? 1 : 0)
        } else {
          values.push(value ?? null)
        }
      }

      if (!fields.length) return this.getScheduledTask(taskId)

      fields.push('updated_at = ?')
      values.push(Date.now(), taskId)

      this.db.prepare(`
        UPDATE scheduled_tasks
        SET ${fields.join(', ')}
        WHERE id = ?
      `).run(...values)

      return this.getScheduledTask(taskId)
    }

    deleteScheduledTask(taskId) {
      this.db.prepare('DELETE FROM scheduled_task_runs WHERE task_id = ?').run(taskId)
      this.db.prepare('DELETE FROM scheduled_task_state WHERE task_id = ?').run(taskId)
      this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(taskId)
      return { success: true }
    }

    ensureScheduledTaskState(taskId) {
      const now = Date.now()
      this.db.prepare(`
        INSERT OR IGNORE INTO scheduled_task_state (
          task_id, runtime_state, failure_count, created_at, updated_at
        )
        VALUES (?, ?, 0, ?, ?)
      `).run(taskId, null, now, now)

      return this.getScheduledTask(taskId)
    }

    updateScheduledTaskState(taskId, updates = {}) {
      this.ensureScheduledTaskState(taskId)

      const fields = []
      const values = []
      const mapping = {
        sessionId: 'session_id',
        runtimeState: 'runtime_state',
        lastRunAt: 'last_run_at',
        nextRunAt: 'next_run_at',
        lastError: 'last_error',
        failureCount: 'failure_count'
      }

      for (const [key, value] of Object.entries(updates)) {
        const column = mapping[key]
        if (!column) continue
        if (value === undefined) continue
        fields.push(`${column} = ?`)
        if (key === 'runtimeState') {
          values.push(value == null ? null : JSON.stringify(value))
        } else {
          values.push(value ?? null)
        }
      }

      if (!fields.length) return this.getScheduledTask(taskId)

      fields.push('updated_at = ?')
      values.push(Date.now(), taskId)

      this.db.prepare(`
        UPDATE scheduled_task_state
        SET ${fields.join(', ')}
        WHERE task_id = ?
      `).run(...values)

      return this.getScheduledTask(taskId)
    }

    createScheduledTaskRun(run) {
      const now = Date.now()
      const result = this.db.prepare(`
        INSERT INTO scheduled_task_runs (
          task_id, session_id, trigger_reason, status, error_message, started_at, finished_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        run.taskId,
        run.sessionId || null,
        run.triggerReason || 'scheduled',
        run.status || 'success',
        run.errorMessage || null,
        run.startedAt || now,
        run.finishedAt || now,
        now
      )

      return this.getScheduledTaskRun(Number(result.lastInsertRowid))
    }

    getScheduledTaskRun(runId) {
      const row = this.db.prepare(`
        SELECT * FROM scheduled_task_runs WHERE id = ?
      `).get(runId)
      return mapScheduledTaskRunRow(row)
    }

    listScheduledTaskRuns(taskId, { limit = 20 } = {}) {
      const rows = this.db.prepare(`
        SELECT * FROM scheduled_task_runs
        WHERE task_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(taskId, limit)

      return rows.map(mapScheduledTaskRunRow)
    }
  }
}

module.exports = {
  withScheduledTaskOperations
}

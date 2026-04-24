import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

describe('ScheduledTaskService', () => {
  it('normalizes legacy model tier aliases to agent-supported tiers', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'balanced' }).modelTier).toBe('sonnet')
    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'powerful' }).modelTier).toBe('opus')
    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'fast' }).modelTier).toBe('haiku')
    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'sonnet' }).modelTier).toBe('sonnet')
  })

  it('rejects invalid daily and weekly clock times', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'daily',
      dailyTime: '99:99'
    })).toThrow('Daily schedule requires HH:mm time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'weekly',
      dailyTime: '24:00',
      weeklyDays: [1]
    })).toThrow('Weekly schedule requires HH:mm time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'workdays',
      dailyTime: '24:00'
    })).toThrow('Workday schedule requires HH:mm time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'monthly',
      dailyTime: '24:00',
      monthlyMode: 'day_of_month',
      monthlyDay: 15
    })).toThrow('Monthly schedule requires HH:mm time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'monthly',
      dailyTime: '09:00',
      monthlyMode: 'day_of_month',
      monthlyDay: 32
    })).toThrow('Monthly schedule requires a valid day of month')
  })

  it('validates first-run options for custom and one-time schedules', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'daily',
      dailyTime: '09:00',
      firstRunMode: 'custom'
    })).toThrow('Custom first run requires valid datetime')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'once'
    })).toThrow('One-time schedule requires valid first run time')
  })

  it('falls back to default time for legacy invalid stored clock values', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })
    const now = new Date('2026-04-23T08:30:00')

    const daily = service._computeNextDailyTime('99:99', now)
    expect(daily.getHours()).toBe(9)
    expect(daily.getMinutes()).toBe(0)
    expect(daily.getDate()).toBe(23)

    const weekly = service._computeNextWeeklyTime('24:61', [4], now)
    expect(weekly.getDay()).toBe(4)
    expect(weekly.getHours()).toBe(9)
    expect(weekly.getMinutes()).toBe(0)
  })

  it('computes next workday time and one-time schedules correctly', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    const fridayEvening = new Date('2026-04-24T18:30:00')
    const nextWorkday = service._computeNextWorkdayTime('09:00', fridayEvening)
    expect(nextWorkday.getDay()).toBe(1)
    expect(nextWorkday.getHours()).toBe(9)
    expect(nextWorkday.getMinutes()).toBe(0)

    const customFirstRun = Date.UTC(2026, 3, 25, 1, 0, 0)
    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'daily',
      dailyTime: '09:00',
      firstRunMode: 'custom',
      firstRunAt: customFirstRun,
      lastRunAt: null
    }, Date.UTC(2026, 3, 24, 0, 0, 0))).toBe(customFirstRun)

    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'once',
      firstRunAt: customFirstRun,
      lastRunAt: null
    }, Date.UTC(2026, 3, 24, 0, 0, 0))).toBe(customFirstRun)

    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'once',
      firstRunAt: customFirstRun,
      lastRunAt: Date.UTC(2026, 3, 25, 1, 0, 0)
    }, Date.UTC(2026, 3, 25, 2, 0, 0))).toBeNull()
  })

  it('computes monthly schedules for fixed day and last day modes', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    const beforeThisMonthRun = new Date('2026-04-10T08:00:00')
    const thisMonth = service._computeNextMonthlyTime('09:30', 15, 'day_of_month', beforeThisMonthRun)
    expect(thisMonth.getFullYear()).toBe(2026)
    expect(thisMonth.getMonth()).toBe(3)
    expect(thisMonth.getDate()).toBe(15)
    expect(thisMonth.getHours()).toBe(9)
    expect(thisMonth.getMinutes()).toBe(30)

    const afterThisMonthRun = new Date('2026-04-16T08:00:00')
    const nextMonth = service._computeNextMonthlyTime('09:30', 15, 'day_of_month', afterThisMonthRun)
    expect(nextMonth.getFullYear()).toBe(2026)
    expect(nextMonth.getMonth()).toBe(4)
    expect(nextMonth.getDate()).toBe(15)

    const februaryClamp = service._computeNextMonthlyTime('09:00', 31, 'day_of_month', new Date('2026-02-01T08:00:00'))
    expect(februaryClamp.getMonth()).toBe(1)
    expect(februaryClamp.getDate()).toBe(28)

    const lastDay = service._computeNextMonthlyTime('18:00', null, 'last_day', new Date('2026-04-10T08:00:00'))
    expect(lastDay.getMonth()).toBe(3)
    expect(lastDay.getDate()).toBe(30)
    expect(lastDay.getHours()).toBe(18)
  })

  it('builds localized scheduled task prompts based on current locale', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({
      getConfig: () => ({ settings: { locale: 'en-US' } })
    }, { on: vi.fn() })

    vi.spyOn(service, '_publicRuntimeState').mockReturnValue({ step: 1 })

    const prompt = service._buildTaskPrompt({
      name: 'Night Review',
      prompt: 'Check repo status',
      runtimeState: { step: 1 }
    }, 'scheduled', Date.UTC(2026, 3, 23, 1, 2, 3))

    expect(prompt).toContain('Continue scheduled task "Night Review".')
    expect(prompt).toContain('Trigger Reason: Scheduled')
    expect(prompt).toContain('Task Content:')
  })

  it('builds localized bootstrap prompts in Chinese by default', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({
      getConfig: () => ({ settings: { locale: 'zh-CN' } })
    }, { on: vi.fn() })

    vi.spyOn(service, '_publicRuntimeState').mockReturnValue(null)

    const prompt = service._buildTaskPrompt({
      name: '日报',
      prompt: '整理进展'
    }, 'scheduled', Date.UTC(2026, 3, 23, 1, 2, 3), { bootstrap: true })

    expect(prompt).toContain('# 定时智能体任务')
    expect(prompt).toContain('触发原因：定时触发')
    expect(prompt).toContain('# 任务内容')
  })

  it('does not execute enabled tasks immediately when the service starts', async () => {
    vi.useFakeTimers()

    try {
      const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
      const service = new ScheduledTaskService({}, { on: vi.fn() })
      service.setSessionDatabase({
        listScheduledTasks: vi.fn(() => [{
          id: 21,
          enabled: true,
          scheduleType: 'interval',
          intervalMinutes: 30
        }])
      })

      vi.spyOn(service, '_executeTask').mockResolvedValue()
      const checkDueTasks = vi.spyOn(service, '_checkDueTasks').mockResolvedValue()

      service.start()

      await vi.advanceTimersByTimeAsync(2000)

      expect(service._executeTask).not.toHaveBeenCalled()
      expect(checkDueTasks).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(500)

      expect(checkDueTasks).toHaveBeenCalledTimes(1)
      expect(service._executeTask).not.toHaveBeenCalled()

      service.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs immediate first-run tasks as soon as they are created', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 31,
      name: '即时巡检',
      prompt: '执行巡检',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunMode: 'immediate',
      firstRunAt: null,
      lastRunAt: null,
      sessionId: null
    }

    const sessionDatabase = {
      createScheduledTask: vi.fn(() => ({ ...taskState })),
      updateScheduledTaskState: vi.fn((_taskId, updates) => {
        Object.assign(taskState, updates)
        return { ...taskState }
      }),
      getAgentConversation: vi.fn(() => null),
      getScheduledTask: vi.fn(() => ({ ...taskState }))
    }

    const agentSessionManager = {
      on: vi.fn(),
      create: vi.fn(() => ({ id: 'agent-session-immediate' })),
      get: vi.fn(() => ({ status: 'idle' })),
      reopen: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue()
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    const created = await service.createTask({
      name: '即时巡检',
      prompt: '执行巡检',
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunMode: 'immediate'
    })

    expect(agentSessionManager.create).toHaveBeenCalled()
    expect(agentSessionManager.sendMessage).toHaveBeenCalled()
    expect(created.sessionId).toBe('agent-session-immediate')
  })

  it('rearms one-time tasks when schedule is changed to once or first run time changes', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')

    const onceRunAt = Date.UTC(2026, 3, 25, 8, 0, 0)
    const existingTask = {
      id: 52,
      name: '巡检任务',
      prompt: '执行巡检',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      dailyTime: '',
      weeklyDays: [],
      firstRunMode: 'next_slot',
      firstRunAt: null,
      lastRunAt: Date.UTC(2026, 3, 24, 8, 0, 0),
      nextRunAt: Date.UTC(2026, 3, 24, 8, 30, 0)
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...existingTask })),
      updateScheduledTask: vi.fn((_taskId, updates) => {
        Object.assign(existingTask, updates)
        return { ...existingTask }
      }),
      updateScheduledTaskState: vi.fn((_taskId, updates) => {
        Object.assign(existingTask, updates)
        return { ...existingTask }
      })
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    const switchedToOnce = await service.updateTask(existingTask.id, {
      scheduleType: 'once',
      firstRunAt: onceRunAt
    })

    expect(switchedToOnce.lastRunAt).toBeNull()
    expect(switchedToOnce.nextRunAt).toBe(onceRunAt)

    const rescheduledAt = Date.UTC(2026, 3, 26, 9, 30, 0)
    const rescheduled = await service.updateTask(existingTask.id, {
      firstRunAt: rescheduledAt
    })

    expect(rescheduled.lastRunAt).toBeNull()
    expect(rescheduled.nextRunAt).toBe(rescheduledAt)
  })

  it('runs immediate tasks as soon as they are re-enabled', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 61,
      name: '恢复后即时执行',
      prompt: '执行巡检',
      enabled: false,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunMode: 'immediate',
      firstRunAt: null,
      lastRunAt: Date.UTC(2026, 3, 24, 8, 0, 0),
      sessionId: null
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...taskState })),
      updateScheduledTask: vi.fn((_taskId, updates) => {
        Object.assign(taskState, updates)
        return { ...taskState }
      }),
      updateScheduledTaskState: vi.fn((_taskId, updates) => {
        Object.assign(taskState, updates)
        return { ...taskState }
      }),
      getAgentConversation: vi.fn(() => null)
    }

    const agentSessionManager = {
      on: vi.fn(),
      create: vi.fn(() => ({ id: 'agent-session-reenabled' })),
      get: vi.fn(() => ({ status: 'idle' })),
      reopen: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue()
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    const updated = await service.updateTask(taskState.id, { enabled: true })

    expect(agentSessionManager.create).toHaveBeenCalled()
    expect(agentSessionManager.sendMessage).toHaveBeenCalled()
    expect(updated.sessionId).toBe('agent-session-reenabled')
  })

  it('renames the bound agent session when the scheduled task name changes', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const rename = vi.fn()
    const currentTask = {
      id: 7,
      name: '日报任务',
      prompt: '生成日报',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'agent-session-1'
    }
    const updatedTask = {
      ...currentTask,
      name: '日报任务（新版）'
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => currentTask),
      updateScheduledTask: vi.fn(() => updatedTask),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ ...updatedTask, ...updates }))
    }

    const service = new ScheduledTaskService({}, { on: vi.fn(), rename })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(1234567890)

    await service.updateTask(currentTask.id, { name: updatedTask.name })

    expect(rename).toHaveBeenCalledWith(currentTask.sessionId, updatedTask.name)
  })

  it('does not rename the session when the task name is unchanged', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const rename = vi.fn()
    const currentTask = {
      id: 8,
      name: '巡检任务',
      prompt: '执行巡检',
      scheduleType: 'interval',
      intervalMinutes: 15,
      enabled: true,
      sessionId: 'agent-session-2'
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => currentTask),
      updateScheduledTask: vi.fn(() => currentTask),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ ...currentTask, ...updates }))
    }

    const service = new ScheduledTaskService({}, { on: vi.fn(), rename })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(1234567890)

    await service.updateTask(currentTask.id, { prompt: '执行巡检并汇总' })

    expect(rename).not.toHaveBeenCalled()
  })

  it('downgrades the linked agent session to manual when deleting a scheduled task', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 12,
      name: '夜间巡检',
      prompt: '执行巡检',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'agent-session-12'
    }

    const liveSession = {
      source: 'scheduled',
      taskId: 12,
      meta: { scheduledTaskId: 12 }
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => currentTask),
      updateAgentConversation: vi.fn(),
      deleteScheduledTask: vi.fn(() => ({ success: true }))
    }

    const service = new ScheduledTaskService({}, {
      on: vi.fn(),
      sessions: new Map([[currentTask.sessionId, liveSession]])
    })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    const result = service.deleteTask(currentTask.id)

    expect(result).toEqual({ success: true })
    expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(currentTask.sessionId, {
      source: 'manual',
      taskId: null
    })
    expect(sessionDatabase.deleteScheduledTask).toHaveBeenCalledWith(currentTask.id)
    expect(liveSession.source).toBe('manual')
    expect(liveSession.taskId).toBeNull()
    expect(liveSession.meta.scheduledTaskId).toBeUndefined()
  })

  it('unlinks a scheduled task when its agent session is deleted', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 13,
      name: '文件统计',
      prompt: '统计文件数量',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'agent-session-13'
    }

    const sessionDatabase = {
      listScheduledTasks: vi.fn(() => [currentTask]),
      updateScheduledTaskState: vi.fn()
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    service._handleAgentDeleted(currentTask.sessionId)

    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, {
      sessionId: null
    })
    expect(service._broadcastChange).toHaveBeenCalledWith(currentTask.id, 'session-unlinked')
  })

  it('releases a running scheduled task when its agent session is deleted', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 14,
      name: '定时问候',
      prompt: '发送你好',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'agent-session-14'
    }

    const sessionDatabase = {
      listScheduledTasks: vi.fn(() => [currentTask]),
      updateScheduledTaskState: vi.fn(),
      createScheduledTaskRun: vi.fn()
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    service.runningTasks.add(currentTask.id)
    service.activeRuns.set(currentTask.sessionId, {
      taskId: currentTask.id,
      sessionId: currentTask.sessionId,
      triggerReason: 'scheduled',
      startedAt: 1000
    })
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(2000)

    service._handleAgentDeleted(currentTask.sessionId)

    expect(service.runningTasks.has(currentTask.id)).toBe(false)
    expect(service.activeRuns.has(currentTask.sessionId)).toBe(false)
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, {
      sessionId: null,
      nextRunAt: 2000
    })
    expect(sessionDatabase.createScheduledTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskId: currentTask.id,
      sessionId: currentTask.sessionId,
      triggerReason: 'scheduled',
      status: 'skipped',
      errorMessage: 'Agent session deleted by user',
      startedAt: 1000
    }))
  })
})

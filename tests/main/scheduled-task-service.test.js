import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

const INTERVAL_FIRST_RUN_AT = Date.UTC(2026, 3, 24, 8, 0, 0)

describe('ScheduledTaskService', () => {
  it('normalizes scheduled task runtime ownership to the bound session', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: ' glm-5.1 ',
      apiProfileId: 'profile-1'
    })).toMatchObject({
      modelId: null,
      apiProfileId: null
    })
  })

  it('normalizes maxRuns as an optional positive integer', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1',
      maxRuns: 3
    }).maxRuns).toBe(3)

    expect(service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1',
      maxRuns: ''
    }).maxRuns).toBeNull()
  })

  it('rejects non-integer intervalMinutes and maxRuns', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 1.5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1'
    })).toThrow('Interval minutes must be a positive integer')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1',
      maxRuns: 2.5
    })).toThrow('Max runs must be a positive integer')
  })

  it('defaults interval anchor mode to started_at', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1'
    }).intervalAnchorMode).toBe('started_at')

    expect(service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1',
      intervalAnchorMode: 'finished_at'
    }).intervalAnchorMode).toBe('finished_at')
  })

  it('defaults resetCountOnEnable to false', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1'
    }).resetCountOnEnable).toBe(false)

    expect(service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'interval',
      intervalMinutes: 5,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      modelId: 'glm-5.1',
      resetCountOnEnable: true
    }).resetCountOnEnable).toBe(true)
  })

  it('requires resolvable execution time for recurring schedules', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'daily',
      dailyTime: '99:99',
      modelId: 'glm-5.1'
    })).toThrow('Daily schedule requires execution time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'weekly',
      dailyTime: '24:00',
      weeklyDays: [1],
      modelId: 'glm-5.1'
    })).toThrow('Weekly schedule requires execution time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'workdays',
      dailyTime: '24:00',
      modelId: 'glm-5.1'
    })).toThrow('Workday schedule requires execution time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'monthly',
      dailyTime: '24:00',
      monthlyMode: 'day_of_month',
      monthlyDay: 15,
      modelId: 'glm-5.1'
    })).toThrow('Monthly schedule requires execution time')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'monthly',
      firstRunAt: Date.UTC(2026, 3, 24, 9, 0, 0),
      monthlyMode: 'day_of_month',
      monthlyDay: 32,
      modelId: 'glm-5.1'
    })).toThrow('Monthly schedule requires a valid day of month')
  })

  it('normalizes recurring clock time from execution time and requires one-time execution time', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })
    const dailyFirstRunAt = new Date(2026, 3, 25, 1, 2, 3).getTime()

    const normalized = service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'daily',
      firstRunAt: dailyFirstRunAt,
      modelId: 'glm-5.1'
    })

    expect(normalized.firstRunAt).toBe(dailyFirstRunAt)
    expect(normalized.dailyTime).toBe('01:02:03')

    expect(() => service._normalizeTaskInput({
      name: 'a',
      prompt: 'b',
      scheduleType: 'once',
      modelId: 'glm-5.1'
    })).toThrow('One-time schedule requires execution time')
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
      firstRunAt: customFirstRun,
      lastRunAt: null
    }, Date.UTC(2026, 3, 24, 0, 0, 0))).toBe(Date.UTC(2026, 3, 24, 1, 0, 0))

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

  it('anchors interval schedules to unified execution time and defaults recurrence to started_at', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })
    const customFirstRun = Date.UTC(2026, 3, 25, 1, 0, 0)

    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: customFirstRun,
      lastRunAt: null
    }, Date.UTC(2026, 3, 24, 0, 0, 0))).toBe(customFirstRun)

    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: customFirstRun,
      lastRunAt: null
    }, Date.UTC(2026, 3, 25, 1, 20, 0))).toBe(Date.UTC(2026, 3, 25, 1, 30, 0))

    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      lastRunAt: Date.UTC(2026, 3, 24, 8, 20, 0)
    }, Date.UTC(2026, 3, 24, 8, 50, 0), {
      intervalAnchorTs: Date.UTC(2026, 3, 24, 8, 20, 0)
    })).toBe(Date.UTC(2026, 3, 24, 8, 50, 0))
  })

  it('keeps interval tasks aligned to custom firstRunAt slots after later runs', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })
    const customFirstRun = Date.UTC(2026, 3, 25, 1, 0, 0)

    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: customFirstRun,
      lastRunAt: Date.UTC(2026, 3, 25, 1, 31, 0)
    }, Date.UTC(2026, 3, 25, 1, 31, 0), {
      intervalAnchorTs: Date.UTC(2026, 3, 25, 1, 31, 0)
    })).toBe(Date.UTC(2026, 3, 25, 2, 0, 0))
  })

  it('uses finished_at mode for interval tasks after the first anchored slot', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })
    const customFirstRun = Date.UTC(2026, 3, 24, 8, 0, 0)

    expect(service._computeNextRunAt({
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      intervalAnchorMode: 'finished_at',
      firstRunAt: customFirstRun,
      lastRunAt: Date.UTC(2026, 3, 24, 8, 20, 0)
    }, Date.UTC(2026, 3, 24, 8, 50, 0), {
      intervalAnchorTs: Date.UTC(2026, 3, 24, 8, 50, 0)
    })).toBe(Date.UTC(2026, 3, 24, 9, 20, 0))
  })

  it('passes scheduled task prompt through without framework wrapper', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({
      getConfig: () => ({ settings: { locale: 'en-US' } })
    }, { on: vi.fn() })

    const prompt = service._buildTaskPrompt({
      name: 'Night Review',
      prompt: 'Check repo status',
      runtimeState: { step: 1 }
    }, 'scheduled', Date.UTC(2026, 3, 23, 1, 2, 3))

    expect(prompt).toBe('Check repo status')
  })

  it('passes bootstrap scheduled task prompt through without wrapper', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({
      getConfig: () => ({ settings: { locale: 'zh-CN' } })
    }, { on: vi.fn() })

    const prompt = service._buildTaskPrompt({
      name: '日报',
      prompt: '整理进展'
    }, 'scheduled', Date.UTC(2026, 3, 23, 1, 2, 3), { bootstrap: true })

    expect(prompt).toBe('整理进展')
  })

  it('arms a one-shot wake-up for the earliest scheduled task', async () => {
    vi.useFakeTimers()

    try {
      const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
      vi.setSystemTime(new Date('2026-04-30T00:00:00.000Z'))
      const service = new ScheduledTaskService({}, { on: vi.fn() })
      service.setSessionDatabase({
        listScheduledTasks: vi.fn(() => [{
          id: 21,
          enabled: true,
          scheduleType: 'interval',
          intervalMinutes: 30,
          nextRunAt: Date.now() + 5000
        }])
      })

      const checkDueTasks = vi.spyOn(service, '_checkDueTasks').mockResolvedValue()

      service.start()

      await vi.advanceTimersByTimeAsync(4999)
      expect(checkDueTasks).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(checkDueTasks).toHaveBeenCalledTimes(1)

      service.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('records scheduled and actual start timestamps separately for scheduled runs', async () => {
    vi.useFakeTimers()

    try {
      const startedAt = Date.UTC(2026, 3, 30, 9, 18, 15)
      const scheduledAt = Date.UTC(2026, 3, 30, 9, 18, 9)
      vi.setSystemTime(startedAt)

      const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
      const taskState = {
        id: 32,
        name: '精确调度任务',
        prompt: '输出当前状态',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 2,
        firstRunAt: Date.UTC(2026, 3, 30, 8, 0, 9),
        nextRunAt: scheduledAt,
        sessionId: 'agent-session-32',
        runCount: 0,
        failureCount: 0,
        runtimeState: null
      }

      const sessionDatabase = {
        getScheduledTask: vi.fn(() => ({ ...taskState })),
        updateScheduledTaskState: vi.fn((_taskId, updates) => {
          Object.assign(taskState, updates)
          return { ...taskState }
        }),
        createScheduledTaskRun: vi.fn(),
        getAgentConversation: vi.fn(() => ({ id: 1 }))
      }

      const agentSessionManager = {
        on: vi.fn(),
        get: vi.fn(() => ({ status: 'idle' })),
        reopen: vi.fn(() => ({ status: 'idle' })),
        sendMessage: vi.fn().mockResolvedValue()
      }

      const service = new ScheduledTaskService({}, agentSessionManager)
      service.setSessionDatabase(sessionDatabase)
      vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
      vi.spyOn(service, '_hasConversationHistory').mockReturnValue(false)
      vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

      await service._executeTask(taskState, 'scheduled')

      expect(sessionDatabase.updateScheduledTaskState.mock.calls).toEqual(expect.arrayContaining([
        [taskState.id, {
          lastStartedAt: startedAt,
          lastScheduledAt: scheduledAt
        }],
        [taskState.id, {
          runCount: 1
        }]
      ]))

      vi.advanceTimersByTime(7000)
      service._handleAgentResult(taskState.sessionId)

      expect(sessionDatabase.createScheduledTaskRun).toHaveBeenCalledWith(expect.objectContaining({
        taskId: taskState.id,
        scheduledAt,
        startedAt
      }))
      expect(taskState.lastStartedAt).toBe(startedAt)
      expect(taskState.lastScheduledAt).toBe(scheduledAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates interval tasks without auto-running and schedules the first slot', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const firstRunAt = Date.UTC(2026, 3, 25, 10, 0, 0)
    const taskState = {
      id: 31,
      name: '即时巡检',
      prompt: '执行巡检',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      modelId: 'glm-5.1',
      firstRunAt,
      lastRunAt: null,
      sessionId: null
    }

    const sessionDatabase = {
      createScheduledTask: vi.fn((task) => ({ ...taskState, ...task })),
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
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 3, 25, 9, 0, 0))

    const created = await service.createTask({
      name: '即时巡检',
      prompt: '执行巡检',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt,
      modelId: 'glm-5.1'
    })

    expect(agentSessionManager.create).not.toHaveBeenCalled()
    expect(agentSessionManager.sendMessage).not.toHaveBeenCalled()
    expect(created.sessionId).toBeNull()
    expect(created.nextRunAt).toBe(firstRunAt)
    vi.restoreAllMocks()
  })

  it('binds chat-created tasks to the current session at creation time', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const firstRunAt = Date.UTC(2026, 3, 25, 10, 0, 0)
    const taskState = {
      id: 41,
      name: '会话内定时任务',
      prompt: '继续当前对话',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt,
      lastRunAt: null,
      sessionId: null
    }

    const sessionDatabase = {
      createScheduledTask: vi.fn((task) => ({ ...taskState, ...task })),
      updateScheduledTaskState: vi.fn((_taskId, updates) => {
        Object.assign(taskState, updates)
        return { ...taskState }
      }),
      updateAgentConversation: vi.fn(),
      getAgentConversation: vi.fn((sessionId) => (
        sessionId === 'chat-session-1'
          ? { id: 99, session_id: sessionId, source: 'manual' }
          : null
      )),
      getScheduledTask: vi.fn(() => ({ ...taskState }))
    }

    const agentSessionManager = {
      on: vi.fn(),
      create: vi.fn(() => ({ id: 'agent-session-new' })),
      get: vi.fn(() => ({ status: 'idle' })),
      reopen: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(),
      sessions: new Map([['chat-session-1', {
        id: 'chat-session-1',
        source: 'manual',
        taskId: null,
        meta: {}
      }]])
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 3, 25, 9, 0, 0))

    const created = await service.createTask({
      name: '会话内定时任务',
      prompt: '继续当前对话',
      modelId: 'glm-5.1',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt,
      sessionBindingMode: 'current',
      boundSessionId: 'chat-session-1'
    })

    expect(agentSessionManager.create).not.toHaveBeenCalled()
    expect(created.sessionId).toBe('chat-session-1')
    expect(created.nextRunAt).toBe(firstRunAt)
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(taskState.id, expect.objectContaining({
      nextRunAt: firstRunAt,
      sessionId: 'chat-session-1'
    }))
    expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith('chat-session-1', {
      taskId: 41
    })
    expect(agentSessionManager.sessions.get('chat-session-1')).toMatchObject({
      taskId: 41,
      meta: {
        scheduledTaskId: 41
      }
    })
    vi.restoreAllMocks()
  })

  it('persists embedded session metadata when binding a newly created task to the current embedded session', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const firstRunAt = Date.UTC(2026, 3, 25, 10, 0, 0)
    const taskState = {
      id: 42,
      name: '水文工作台会话内任务',
      prompt: '继续当前工作台巡检',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt,
      lastRunAt: null,
      sessionId: null
    }

    const sessionDatabase = {
      createScheduledTask: vi.fn((task) => ({ ...taskState, ...task })),
      updateScheduledTaskState: vi.fn((_taskId, updates) => {
        Object.assign(taskState, updates)
        return { ...taskState }
      }),
      updateAgentConversation: vi.fn(),
      getAgentConversation: vi.fn((sessionId) => (
        sessionId === 'embedded-session-1'
          ? { id: 109, session_id: sessionId, source: 'manual', client_type: 'embedded' }
          : null
      )),
      getScheduledTask: vi.fn(() => ({ ...taskState }))
    }

    const liveSession = {
      id: 'embedded-session-1',
      source: 'manual',
      taskId: null,
      ownerClientId: 'embed:hydrology-workbench',
      clientType: 'embedded',
      clientMeta: {
        appId: 'hydrology-workbench',
        component: 'EmbeddedAgentPanel'
      },
      meta: {}
    }

    const agentSessionManager = {
      on: vi.fn(),
      create: vi.fn(() => ({ id: 'agent-session-new' })),
      get: vi.fn(() => ({ status: 'idle' })),
      reopen: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(),
      sessions: new Map([['embedded-session-1', liveSession]])
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 3, 25, 9, 0, 0))

    const created = await service.createTask({
      name: '水文工作台会话内任务',
      prompt: '继续当前工作台巡检',
      modelId: 'glm-5.1',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt,
      sessionBindingMode: 'current',
      boundSessionId: 'embedded-session-1'
    })

    expect(agentSessionManager.create).not.toHaveBeenCalled()
    expect(created.sessionId).toBe('embedded-session-1')
    expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith('embedded-session-1', {
      taskId: 42,
      ownerClientId: 'embed:hydrology-workbench',
      clientType: 'embedded',
      clientMeta: {
        appId: 'hydrology-workbench',
        component: 'EmbeddedAgentPanel'
      }
    })
    expect(liveSession.taskId).toBe(42)
    expect(liveSession.taskId).toBe(42)
    expect(liveSession.meta.scheduledTaskId).toBe(42)
    expect(taskState.runtimeState).toEqual({
      _scheduler: {
        followEmbeddedCurrentSession: true,
        embeddedAppId: 'hydrology-workbench'
      }
    })
    vi.restoreAllMocks()
  })

  it('rearms one-time tasks when schedule is changed to once or first run time changes', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')

    const onceRunAt = Date.UTC(2026, 3, 25, 8, 0, 0)
    const existingTask = {
      id: 52,
      name: '巡检任务',
      prompt: '执行巡检',
      modelId: 'glm-5.1',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      weeklyDays: [],
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

  it('reuses a bound current session when the scheduled task runs', async () => {
    vi.useFakeTimers()

    try {
      const startedAt = Date.UTC(2026, 3, 30, 11, 0, 0)
      vi.setSystemTime(startedAt)

      const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
      const taskState = {
        id: 77,
        name: '复用当前会话',
        prompt: '基于当前上下文继续',
        modelId: 'glm-5.1',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 15,
        firstRunAt: Date.UTC(2026, 3, 30, 10, 45, 0),
        sessionId: 'chat-session-2',
        runCount: 0,
        failureCount: 0,
        runtimeState: null
      }

      const sessionDatabase = {
        getScheduledTask: vi.fn(() => ({ ...taskState })),
        updateScheduledTaskState: vi.fn((_taskId, updates) => {
          Object.assign(taskState, updates)
          return { ...taskState }
        }),
        createScheduledTaskRun: vi.fn(),
        updateAgentConversation: vi.fn(),
        getAgentConversation: vi.fn((sessionId) => (
          sessionId === 'chat-session-2'
            ? { id: 102, session_id: sessionId, source: 'manual' }
            : null
        ))
      }

      const liveSession = { id: 'chat-session-2', status: 'idle', source: 'manual', taskId: null, meta: {} }
      const agentSessionManager = {
        on: vi.fn(),
        create: vi.fn(() => ({ id: 'agent-session-should-not-create' })),
        get: vi.fn(() => ({ ...liveSession })),
        reopen: vi.fn(() => ({ status: 'idle' })),
        sendMessage: vi.fn().mockResolvedValue(),
        sessions: new Map([['chat-session-2', liveSession]])
      }

      const service = new ScheduledTaskService({}, agentSessionManager)
      service.setSessionDatabase(sessionDatabase)
      vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
      vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)
      vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

      await service._executeTask(taskState, 'manual', { allowDisabled: true })

      expect(agentSessionManager.create).not.toHaveBeenCalled()
      expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith('chat-session-2', {
        taskId: taskState.id
      })
      expect(liveSession.taskId).toBe(taskState.id)
      expect(liveSession.taskId).toBe(taskState.id)
      expect(liveSession.meta.scheduledTaskId).toBe(taskState.id)
      expect(agentSessionManager.sendMessage).toHaveBeenCalledWith(
        'chat-session-2',
        '基于当前上下文继续',
        { meta: { origin: 'scheduled' } }
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('reuses a bound embedded session when the scheduled task runs and the app instance is active', async () => {
    vi.useFakeTimers()

    try {
      const startedAt = Date.UTC(2026, 3, 30, 11, 0, 0)
      vi.setSystemTime(startedAt)

      const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
      const taskState = {
        id: 177,
        name: '水文工作台复用当前会话',
        prompt: '基于当前工作台上下文继续巡检',
        modelId: 'glm-5.1',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 15,
        firstRunAt: Date.UTC(2026, 3, 30, 10, 45, 0),
        sessionId: 'embedded-session-77',
        runCount: 0,
        failureCount: 0,
        runtimeState: null
      }

      const sessionDatabase = {
        getScheduledTask: vi.fn(() => ({ ...taskState })),
        updateScheduledTaskState: vi.fn((_taskId, updates) => {
          Object.assign(taskState, updates)
          return { ...taskState }
        }),
        createScheduledTaskRun: vi.fn(),
        updateAgentConversation: vi.fn(),
        getAgentConversation: vi.fn((sessionId) => (
          sessionId === 'embedded-session-77'
            ? {
                id: 177,
                session_id: sessionId,
                source: 'manual',
                client_type: 'embedded',
                client_meta: JSON.stringify({ appId: 'hydrology-workbench' })
              }
            : null
        ))
      }

      const liveSession = {
        id: 'embedded-session-77',
        status: 'idle',
        source: 'manual',
        taskId: null,
        clientType: 'embedded',
        clientMeta: { appId: 'hydrology-workbench', component: 'EmbeddedAgentPanel' },
        meta: {}
      }
      const agentSessionManager = {
        on: vi.fn(),
        create: vi.fn(() => ({ id: 'agent-session-should-not-create' })),
        get: vi.fn(() => ({ ...liveSession })),
        reopen: vi.fn(() => ({ ...liveSession })),
        sendMessage: vi.fn().mockResolvedValue(),
        sessions: new Map([['embedded-session-77', liveSession]]),
        embeddedAppRuntimeManager: {
          appStates: new Map([['hydrology-workbench', {
            commands: new Map([['hydrology_context_get', { id: 'hydrology_context_get' }]])
          }]])
        }
      }

      const service = new ScheduledTaskService({}, agentSessionManager)
      service.setSessionDatabase(sessionDatabase)
      vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
      vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)
      vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

      await service._executeTask(taskState, 'manual', { allowDisabled: true })

      expect(agentSessionManager.create).not.toHaveBeenCalled()
      expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith('embedded-session-77', {
        taskId: taskState.id,
        clientType: 'embedded',
        clientMeta: {
          appId: 'hydrology-workbench',
          component: 'EmbeddedAgentPanel'
        }
      })
      expect(liveSession.taskId).toBe(taskState.id)
      expect(liveSession.taskId).toBe(taskState.id)
      expect(liveSession.meta.scheduledTaskId).toBe(taskState.id)
      expect(agentSessionManager.sendMessage).toHaveBeenCalledWith(
        'embedded-session-77',
        '基于当前工作台上下文继续巡检',
        { meta: { origin: 'scheduled' } }
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('recreates a default task session when the bound session is missing', async () => {
    vi.useFakeTimers()

    try {
      const startedAt = Date.UTC(2026, 3, 30, 11, 0, 0)
      vi.setSystemTime(startedAt)

      const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
      const taskState = {
        id: 178,
        name: '丢失会话后重建',
        prompt: '继续执行',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 15,
        firstRunAt: Date.UTC(2026, 3, 30, 10, 45, 0),
        sessionBindingMode: 'current',
        sessionId: 'missing-session',
        runCount: 0,
        failureCount: 0,
        runtimeState: null
      }

      const sessionDatabase = {
        getScheduledTask: vi.fn(() => ({ ...taskState })),
        updateScheduledTaskState: vi.fn((_taskId, updates) => {
          Object.assign(taskState, updates)
          return { ...taskState }
        }),
        createScheduledTaskRun: vi.fn(),
        updateAgentConversation: vi.fn(),
        getAgentConversation: vi.fn(() => null)
      }

      const agentSessionManager = {
        on: vi.fn(),
        create: vi.fn(() => ({ id: 'recreated-session-1' })),
        get: vi.fn(() => ({ status: 'idle' })),
        reopen: vi.fn(() => ({ status: 'idle' })),
        sendMessage: vi.fn().mockResolvedValue()
      }

      const service = new ScheduledTaskService({}, agentSessionManager)
      service.setSessionDatabase(sessionDatabase)
      vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
      vi.spyOn(service, '_hasConversationHistory').mockReturnValue(false)
      vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

      await service._executeTask(taskState, 'manual', { allowDisabled: true })

      expect(agentSessionManager.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'chat',
        title: '丢失会话后重建',
        cwdSubDir: 'scheduled',
        taskId: 178
      }))
      expect(taskState.sessionId).toBe('recreated-session-1')
      expect(agentSessionManager.sendMessage).toHaveBeenCalledWith(
        'recreated-session-1',
        '继续执行',
        { meta: { origin: 'scheduled' } }
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('follows the current embedded app session instead of reopening the originally bound session', async () => {
    vi.useFakeTimers()

    try {
      const startedAt = Date.UTC(2026, 3, 30, 11, 30, 0)
      vi.setSystemTime(startedAt)

      const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
      const taskState = {
        id: 179,
        name: '跟随当前水文工作台会话',
        prompt: '继续当前工作台任务',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 15,
        firstRunAt: Date.UTC(2026, 3, 30, 11, 0, 0),
        sessionBindingMode: 'current',
        sessionId: 'embedded-session-old',
        runCount: 0,
        failureCount: 0,
        runtimeState: {
          _scheduler: {
            followEmbeddedCurrentSession: true,
            embeddedAppId: 'hydrology-workbench'
          }
        }
      }

      const sessionDatabase = {
        getScheduledTask: vi.fn(() => ({ ...taskState })),
        updateScheduledTaskState: vi.fn((_taskId, updates) => {
          Object.assign(taskState, updates)
          return { ...taskState }
        }),
        createScheduledTaskRun: vi.fn(),
        updateAgentConversation: vi.fn(),
        getAgentConversation: vi.fn((sessionId) => {
          if (sessionId === 'embedded-session-current') {
            return {
              id: 301,
              session_id: sessionId,
              source: 'manual',
              client_type: 'embedded',
              client_meta: JSON.stringify({ appId: 'hydrology-workbench' })
            }
          }
          if (sessionId === 'embedded-session-old') {
            return {
              id: 300,
              session_id: sessionId,
              status: 'closed',
              source: 'manual',
              client_type: 'embedded',
              client_meta: JSON.stringify({ appId: 'hydrology-workbench' })
            }
          }
          return null
        })
      }

      const liveSession = {
        id: 'embedded-session-current',
        status: 'idle',
        source: 'manual',
        taskId: null,
        clientType: 'embedded',
        clientMeta: { appId: 'hydrology-workbench', component: 'EmbeddedAgentPanel' },
        meta: {}
      }
      const agentSessionManager = {
        on: vi.fn(),
        create: vi.fn(() => ({ id: 'should-not-create' })),
        get: vi.fn((sessionId) => sessionId === 'embedded-session-current' ? { ...liveSession } : null),
        reopen: vi.fn(() => {
          throw new Error('should not reopen old embedded session')
        }),
        sendMessage: vi.fn().mockResolvedValue(),
        sessions: new Map([['embedded-session-current', liveSession]]),
        embeddedAppRuntimeManager: {
          getCurrentSession: vi.fn(() => 'embedded-session-current'),
          appStates: new Map([['hydrology-workbench', {
            commands: new Map([['embed:hydrology-workbench', { clientId: 'embed:hydrology-workbench' }]])
          }]])
        }
      }

      const service = new ScheduledTaskService({}, agentSessionManager)
      service.setSessionDatabase(sessionDatabase)
      vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
      vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)
      vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

      await service._executeTask(taskState, 'manual', { allowDisabled: true })

      expect(agentSessionManager.create).not.toHaveBeenCalled()
      expect(agentSessionManager.reopen).not.toHaveBeenCalled()
      expect(taskState.sessionId).toBe('embedded-session-current')
      expect(agentSessionManager.sendMessage).toHaveBeenCalledWith(
        'embedded-session-current',
        '继续当前工作台任务',
        { meta: { origin: 'scheduled' } }
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips embedded current-bound tasks when the embedded app has no current session', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 162,
      name: '等待工作台当前会话',
      prompt: '继续读取当前站点',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      nextRunAt: 7000,
      sessionBindingMode: 'current',
      sessionId: 'agent-session-old',
      runCount: 0,
      runtimeState: {
        _scheduler: {
          followEmbeddedCurrentSession: true,
          embeddedAppId: 'hydrology-workbench'
        }
      }
    }

    const sessionDatabase = {
      getAgentConversation: vi.fn(() => null),
      createScheduledTaskRun: vi.fn(),
      updateScheduledTaskState: vi.fn()
    }

    const agentSessionManager = {
      on: vi.fn(),
      create: vi.fn(() => ({ id: 'should-not-create' })),
      get: vi.fn(() => null),
      reopen: vi.fn(() => {
        throw new Error('should not reopen old embedded session')
      }),
      embeddedAppRuntimeManager: {
        getCurrentSession: vi.fn(() => null),
        appStates: new Map([['hydrology-workbench', {
          commands: new Map([['embed:hydrology-workbench', { clientId: 'embed:hydrology-workbench' }]])
        }]])
      }
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(9000)
    vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

    await service._executeTask(currentTask, 'scheduled')

    expect(agentSessionManager.create).not.toHaveBeenCalled()
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, {
      lastScheduledAt: 7000,
      lastError: 'Embedded app "hydrology-workbench" has no current session to follow',
      nextRunAt: 9000
    })
    expect(sessionDatabase.createScheduledTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskId: currentTask.id,
      sessionId: null,
      triggerReason: 'scheduled',
      status: 'skipped',
      errorMessage: 'Embedded app "hydrology-workbench" has no current session to follow'
    }))
  })

  it('does not keep following a stale embedded session after the current-session pointer is cleared', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 163,
      name: '跟随当前工作台会话',
      prompt: '继续读取当前站点',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      nextRunAt: 7100,
      sessionBindingMode: 'current',
      sessionId: 'embedded-session-old',
      runCount: 0,
      runtimeState: {
        _scheduler: {
          followEmbeddedCurrentSession: true,
          embeddedAppId: 'hydrology-workbench'
        }
      }
    }

    const sessionDatabase = {
      getAgentConversation: vi.fn((sessionId) => {
        if (sessionId === 'embedded-session-old') {
          return {
            id: 1,
            session_id: 'embedded-session-old',
            client_type: 'embedded',
            client_meta: JSON.stringify({ appId: 'hydrology-workbench' })
          }
        }
        return null
      }),
      createScheduledTaskRun: vi.fn(),
      updateScheduledTaskState: vi.fn()
    }

    const agentSessionManager = {
      on: vi.fn(),
      create: vi.fn(() => ({ id: 'should-not-create' })),
      get: vi.fn(() => null),
      reopen: vi.fn(() => {
        throw new Error('should not reopen stale embedded session')
      }),
      embeddedAppRuntimeManager: {
        getCurrentSession: vi.fn(() => null),
        appStates: new Map()
      }
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(9100)
    vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

    await service._executeTask(currentTask, 'scheduled')

    expect(agentSessionManager.create).not.toHaveBeenCalled()
    expect(agentSessionManager.reopen).not.toHaveBeenCalled()
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, {
      lastScheduledAt: 7100,
      lastError: 'Embedded app "hydrology-workbench" has no current session to follow',
      nextRunAt: 9100
    })
    expect(sessionDatabase.createScheduledTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskId: currentTask.id,
      sessionId: null,
      triggerReason: 'scheduled',
      status: 'skipped',
      errorMessage: 'Embedded app "hydrology-workbench" has no current session to follow'
    }))
  })

  it('keeps task binding on a shared session when detaching one task but another task is still bound to the same session', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const liveSession = {
      id: 'shared-session-1',
      taskId: 81,
      meta: { scheduledTaskId: 81 }
    }
    const currentTask = {
      id: 81,
      sessionId: 'shared-session-1'
    }

    const sessionDatabase = {
      updateAgentConversation: vi.fn(),
      listScheduledTasks: vi.fn(() => [
        { id: 81, sessionId: 'shared-session-1' },
        { id: 82, sessionId: 'shared-session-1' }
      ])
    }

    const service = new ScheduledTaskService({}, {
      on: vi.fn(),
      sessions: new Map([['shared-session-1', liveSession]])
    })
    service.setSessionDatabase(sessionDatabase)

    service._detachTaskSession(currentTask)

    expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith('shared-session-1', {
      taskId: 82
    })
    expect(liveSession.taskId).toBe(82)
    expect(liveSession.meta.scheduledTaskId).toBe(82)
  })

  it('re-enabling interval tasks recomputes the next slot without auto-running', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const firstRunAt = Date.UTC(2026, 3, 24, 8, 0, 0)
    const taskState = {
      id: 61,
      name: '恢复后即时执行',
      prompt: '执行巡检',
      enabled: false,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt,
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
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 3, 24, 8, 50, 0))

    const updated = await service.updateTask(taskState.id, { enabled: true })

    expect(agentSessionManager.create).not.toHaveBeenCalled()
    expect(agentSessionManager.sendMessage).not.toHaveBeenCalled()
    expect(updated.sessionId).toBeNull()
    expect(updated.nextRunAt).toBe(Date.UTC(2026, 3, 24, 9, 0, 0))
    vi.restoreAllMocks()
  })

  it('auto-disables a task after reaching its max run count', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 71,
      name: '限次任务',
      prompt: '执行一次',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      sessionId: 'agent-session-71',
      runCount: 0,
      maxRuns: 1,
      runtimeState: null,
      failureCount: 0
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...taskState })),
      updateScheduledTaskState: vi.fn((_taskId, updates) => {
        Object.assign(taskState, updates)
        return { ...taskState }
      }),
      updateScheduledTask: vi.fn((_taskId, updates) => {
        Object.assign(taskState, updates)
        return { ...taskState }
      }),
      createScheduledTaskRun: vi.fn(),
      getAgentConversation: vi.fn(() => ({ id: 1 }))
    }

    const agentSessionManager = {
      on: vi.fn(),
      get: vi.fn(() => ({ status: 'idle' })),
      reopen: vi.fn(() => ({ status: 'idle' })),
      sendMessage: vi.fn().mockResolvedValue()
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(false)

    await service._executeTask(taskState, 'scheduled')

    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(taskState.id, {
      runCount: 1
    })

    service._handleAgentResult(taskState.sessionId)

    expect(sessionDatabase.updateScheduledTask).toHaveBeenCalledWith(taskState.id, { enabled: false })
    expect(taskState.enabled).toBe(false)
    expect(taskState.nextRunAt).toBeNull()
  })

  it('blocks manual runs after the max run count is reached', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 72,
      name: '已完成任务',
      prompt: '停止执行',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      runCount: 2,
      maxRuns: 2
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...taskState })),
      updateScheduledTask: vi.fn((_taskId, updates) => ({ ...taskState, ...updates })),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ ...taskState, ...updates }))
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    const broadcastSpy = vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    await expect(service.runTaskNow(taskState.id)).rejects.toThrow('Scheduled task run limit reached')
    expect(sessionDatabase.updateScheduledTask).toHaveBeenCalledWith(taskState.id, { enabled: false })
    expect(broadcastSpy).toHaveBeenCalledWith(taskState.id, 'limit-reached')
  })

  it('rejects manual runs when the task is already running', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 721,
      name: '运行中任务',
      prompt: '继续执行',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      runCount: 0,
      maxRuns: null
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...taskState }))
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    service.runningTasks.add(taskState.id)

    await expect(service.runTaskNow(taskState.id)).rejects.toThrow('Scheduled task is already running')
  })

  it('auto-disables re-enabled tasks that already reached their max run count', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 73,
      name: '上限任务',
      prompt: '不可继续',
      enabled: false,
      scheduleType: 'interval',
      intervalMinutes: 30,
      runCount: 2,
      maxRuns: 2,
      firstRunAt: INTERVAL_FIRST_RUN_AT
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
      })
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    const updated = await service.updateTask(taskState.id, { enabled: true })

    expect(sessionDatabase.updateScheduledTask).toHaveBeenCalledWith(taskState.id, { enabled: false })
    expect(updated.enabled).toBe(false)
    expect(updated.nextRunAt).toBeNull()
  })

  it('resets execution state when enabling with resetCountOnEnable', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 74,
      name: '重置恢复任务',
      prompt: '重新开始',
      enabled: false,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      runCount: 2,
      maxRuns: 2,
      lastRunAt: 1700000000000,
      lastError: 'old failure',
      failureCount: 3,
      runtimeState: { _scheduler: { resetSessionAfterRun: true, reason: 'cwd-changed' } }
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
      })
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_executeTask').mockResolvedValue()

    const updated = await service.updateTask(taskState.id, {
      enabled: true,
      resetCountOnEnable: true
    })

    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(taskState.id, expect.objectContaining({
      lastRunAt: null,
      runCount: 0,
      failureCount: 0,
      lastError: null
    }))
    expect(updated.runCount).toBe(0)
    expect(updated.failureCount).toBe(0)
  })

  it('uses custom firstRunAt as a fixed interval phase when resetting on enable', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const taskState = {
      id: 75,
      name: '固定相位任务',
      prompt: '按固定槽位恢复',
      enabled: false,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: Date.UTC(2026, 3, 30, 8, 24, 9),
      runCount: 5,
      maxRuns: 10,
      lastRunAt: Date.UTC(2026, 3, 30, 9, 0, 0)
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
      })
    }

    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 3, 30, 10, 5, 0))

    const updated = await service.updateTask(taskState.id, {
      enabled: true,
      resetCountOnEnable: true
    })

    expect(updated.nextRunAt).toBe(Date.UTC(2026, 3, 30, 10, 24, 9))
    vi.restoreAllMocks()
  })

  it('detaches the bound session after a reset-pending run completes', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 76,
      name: '重绑完成任务',
      prompt: '继续执行',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      sessionId: 'agent-session-76',
      runtimeState: { _scheduler: { resetSessionAfterRun: true, reason: 'cwd-changed' } }
    }
    const liveSession = {
      taskId: 76,
      meta: { scheduledTaskId: 76 }
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => currentTask),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ ...currentTask, ...updates })),
      updateAgentConversation: vi.fn(),
      createScheduledTaskRun: vi.fn()
    }

    const service = new ScheduledTaskService({}, { on: vi.fn(), sessions: new Map([[currentTask.sessionId, liveSession]]) })
    service.setSessionDatabase(sessionDatabase)
    service.activeRuns.set(currentTask.sessionId, {
      taskId: currentTask.id,
      sessionId: currentTask.sessionId,
      triggerReason: 'scheduled',
      scheduledAt: 1000,
      startedAt: 1100
    })
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(2000)

    service._handleAgentResult(currentTask.sessionId)

    expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(currentTask.sessionId, {
      taskId: null
    })
    expect(liveSession.taskId).toBeNull()
    expect(liveSession.meta.scheduledTaskId).toBeUndefined()
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, expect.objectContaining({
      sessionId: null
    }))
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
      firstRunAt: INTERVAL_FIRST_RUN_AT,
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
      firstRunAt: INTERVAL_FIRST_RUN_AT,
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

  it('detaches the old bound session when cwd changes outside a running task', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const rename = vi.fn()
    const currentTask = {
      id: 81,
      name: '目录切换任务',
      prompt: '执行巡检',
      scheduleType: 'interval',
      intervalMinutes: 15,
      enabled: true,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      cwd: 'C:/workspace/old',
      sessionId: 'agent-session-81'
    }
    const updatedTask = {
      ...currentTask,
      name: '目录切换任务（新）',
      cwd: 'C:/workspace/new'
    }
    const liveSession = {
      taskId: 81,
      meta: { scheduledTaskId: 81 }
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => currentTask),
      updateScheduledTask: vi.fn(() => updatedTask),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ ...updatedTask, ...updates })),
      updateAgentConversation: vi.fn()
    }

    const service = new ScheduledTaskService({}, { on: vi.fn(), rename, sessions: new Map([[currentTask.sessionId, liveSession]]) })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(1234567890)

    await service.updateTask(currentTask.id, {
      cwd: updatedTask.cwd,
      name: '目录切换任务（新）'
    })

    expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(currentTask.sessionId, {
      taskId: null
    })
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, expect.objectContaining({
      sessionId: null
    }))
    expect(liveSession.taskId).toBeNull()
    expect(liveSession.meta.scheduledTaskId).toBeUndefined()
    expect(rename).not.toHaveBeenCalled()
  })

  it('keeps the old bound session when legacy apiProfileId changes outside a running task', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const rename = vi.fn()
    const currentTask = {
      id: 82,
      name: '配置切换任务',
      prompt: '执行巡检',
      scheduleType: 'interval',
      intervalMinutes: 15,
      enabled: true,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      apiProfileId: 'profile-old',
      sessionId: 'agent-session-82'
    }
    const updatedTask = {
      ...currentTask,
      name: '配置切换任务（新）',
      apiProfileId: 'profile-new'
    }
    const liveSession = {
      taskId: 82,
      meta: { scheduledTaskId: 82 }
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => currentTask),
      updateScheduledTask: vi.fn(() => updatedTask),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ ...updatedTask, ...updates })),
      updateAgentConversation: vi.fn()
    }

    const service = new ScheduledTaskService({}, { on: vi.fn(), rename, sessions: new Map([[currentTask.sessionId, liveSession]]) })
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(1234567890)

    await service.updateTask(currentTask.id, {
      apiProfileId: updatedTask.apiProfileId,
      name: '配置切换任务（新）'
    })

    expect(sessionDatabase.updateAgentConversation).not.toHaveBeenCalled()
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, expect.objectContaining({
      nextRunAt: 1234567890
    }))
    expect(liveSession.taskId).toBe(82)
    expect(liveSession.meta.scheduledTaskId).toBe(82)
    expect(rename).toHaveBeenCalledWith(currentTask.sessionId, '配置切换任务（新）')
  })

  it('clears task binding on the linked agent session when deleting a scheduled task', async () => {
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
      taskId: null
    })
    expect(sessionDatabase.deleteScheduledTask).toHaveBeenCalledWith(currentTask.id)
    expect(liveSession.taskId).toBeNull()
    expect(liveSession.meta.scheduledTaskId).toBeUndefined()
  })

  it('does not clear another task active run when deleting a shared-session task', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const deletedTask = {
      id: 120,
      name: '共享会话任务 B',
      prompt: '删除这个',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'shared-session-120'
    }

    const liveSession = {
      taskId: 119,
      meta: { scheduledTaskId: 119 }
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => deletedTask),
      updateAgentConversation: vi.fn(),
      deleteScheduledTask: vi.fn(() => ({ success: true })),
      listScheduledTasks: vi.fn(() => [
        { id: 119, sessionId: 'shared-session-120' },
        deletedTask
      ])
    }

    const service = new ScheduledTaskService({}, {
      on: vi.fn(),
      sessions: new Map([[deletedTask.sessionId, liveSession]])
    })
    service.setSessionDatabase(sessionDatabase)
    service.activeRuns.set(deletedTask.sessionId, {
      taskId: 119,
      sessionId: deletedTask.sessionId,
      triggerReason: 'scheduled',
      scheduledAt: 1000,
      startedAt: 1100
    })
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})

    const result = service.deleteTask(deletedTask.id)

    expect(result).toEqual({ success: true })
    expect(service.activeRuns.get(deletedTask.sessionId)).toMatchObject({
      taskId: 119,
      sessionId: deletedTask.sessionId
    })
    expect(sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(deletedTask.sessionId, {
      taskId: 119
    })
    expect(liveSession.taskId).toBe(119)
    expect(liveSession.meta.scheduledTaskId).toBe(119)
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
      sessionId: 'agent-session-13',
      runtimeState: null
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
      sessionId: null,
      runtimeState: null
    })
    expect(service._broadcastChange).toHaveBeenCalledWith(currentTask.id, 'session-unlinked')
  })

  it('clears pending session-reset state when a bound agent session is deleted', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 131,
      name: '会话重绑任务',
      prompt: '继续执行',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'agent-session-131',
      runtimeState: { _scheduler: { resetSessionAfterRun: true, reason: 'cwd-changed' }, keep: 'value' }
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
      sessionId: null,
      runtimeState: { keep: 'value' }
    })
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
      runtimeState: null,
      lastScheduledAt: undefined,
      lastStartedAt: 1000,
      lastRunAt: expect.any(Number),
      lastError: 'Agent session deleted by user',
      nextRunAt: 2000,
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

  it('releases a running scheduled task when its agent session is interrupted by host cleanup', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 15,
      name: '后台巡检',
      prompt: '执行后台巡检',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'agent-session-15',
      runtimeState: null
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...currentTask })),
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
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(3000)

    service._handleAgentInterrupted(currentTask.sessionId, { reason: 'host-cleanup' })

    expect(service.runningTasks.has(currentTask.id)).toBe(false)
    expect(service.activeRuns.has(currentTask.sessionId)).toBe(false)
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, expect.objectContaining({
      sessionId: currentTask.sessionId,
      nextRunAt: 3000,
      lastError: 'Agent session interrupted by host cleanup'
    }))
    expect(sessionDatabase.createScheduledTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskId: currentTask.id,
      sessionId: currentTask.sessionId,
      triggerReason: 'scheduled',
      status: 'skipped',
      errorMessage: 'Agent session interrupted by host cleanup',
      startedAt: 1000
    }))
    expect(service._broadcastChange).toHaveBeenCalledWith(currentTask.id, 'interrupted')
  })

  it('releases a running scheduled task when its agent session is interrupted by user cancel and rearms the next run', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 151,
      name: '手动中断后继续',
      prompt: '执行后台巡检',
      scheduleType: 'interval',
      intervalMinutes: 30,
      enabled: true,
      sessionId: 'agent-session-151',
      runtimeState: null
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...currentTask })),
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
      scheduledAt: 5000,
      startedAt: 5100
    })
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(8000)

    service._handleAgentInterrupted(currentTask.sessionId, { reason: 'user-cancel' })

    expect(service.runningTasks.has(currentTask.id)).toBe(false)
    expect(service.activeRuns.has(currentTask.sessionId)).toBe(false)
    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, expect.objectContaining({
      sessionId: currentTask.sessionId,
      lastScheduledAt: 5000,
      lastStartedAt: 5100,
      nextRunAt: 8000,
      lastError: 'Agent session interrupted'
    }))
    expect(sessionDatabase.createScheduledTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskId: currentTask.id,
      sessionId: currentTask.sessionId,
      triggerReason: 'scheduled',
      status: 'skipped',
      errorMessage: 'Agent session interrupted',
      scheduledAt: 5000,
      startedAt: 5100
    }))
    expect(service._broadcastChange).toHaveBeenCalledWith(currentTask.id, 'interrupted')
  })

  it('queues a scheduled run when the bound agent session is busy', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 16,
      name: '忙碌跳过任务',
      prompt: '检查状态',
      modelId: 'glm-5.1',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      nextRunAt: 2000,
      sessionId: 'agent-session-16',
      runCount: 0
    }

    const sessionDatabase = {
      getAgentConversation: vi.fn(() => ({ id: 1 })),
      createScheduledTaskRun: vi.fn(),
      updateScheduledTaskState: vi.fn()
    }

    const agentSessionManager = {
      on: vi.fn(),
      get: vi.fn(() => ({ status: 'streaming' })),
      reopen: vi.fn(() => ({ status: 'streaming' }))
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_ensureTaskSession').mockReturnValue(currentTask.sessionId)
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)

    await service._executeTask(currentTask, 'scheduled')

    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, {
      lastScheduledAt: 2000
    })
    expect(sessionDatabase.createScheduledTaskRun).not.toHaveBeenCalled()
    expect(service._broadcastChange).toHaveBeenCalledWith(currentTask.id, 'queued')
    expect(service.queuedTaskIds.has(currentTask.id)).toBe(true)
    expect(service.sessionTaskQueues.get(currentTask.sessionId)).toEqual([{
      taskId: currentTask.id,
      triggerReason: 'scheduled',
      allowDisabled: false,
      scheduledAt: 2000
    }])
  })

  it('skips a bound embedded-app session task when the embedded app instance is not active', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 161,
      name: '水文工作台定时任务',
      prompt: '读取当前站点并执行巡检',
      modelId: 'glm-5.1',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: INTERVAL_FIRST_RUN_AT,
      nextRunAt: 7000,
      sessionId: 'agent-session-161',
      runCount: 0
    }

    const sessionDatabase = {
      getAgentConversation: vi.fn(() => ({
        id: 1,
        session_id: currentTask.sessionId,
        client_type: 'embedded',
        client_meta: JSON.stringify({ appId: 'hydrology-workbench' })
      })),
      createScheduledTaskRun: vi.fn(),
      updateScheduledTaskState: vi.fn()
    }

    const agentSessionManager = {
      on: vi.fn(),
      get: vi.fn(() => ({
        status: 'idle',
        clientType: 'embedded',
        clientMeta: { appId: 'hydrology-workbench' }
      })),
      reopen: vi.fn(() => ({
        status: 'idle',
        clientType: 'embedded',
        clientMeta: { appId: 'hydrology-workbench' }
      })),
      embeddedAppRuntimeManager: {
        appStates: new Map()
      }
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_ensureTaskSession').mockReturnValue(currentTask.sessionId)
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(9000)

    await service._executeTask(currentTask, 'scheduled')

    expect(sessionDatabase.updateScheduledTaskState).toHaveBeenCalledWith(currentTask.id, {
      lastScheduledAt: 7000,
      lastError: 'Embedded app "hydrology-workbench" is not active',
      nextRunAt: 9000
    })
    expect(sessionDatabase.createScheduledTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskId: currentTask.id,
      sessionId: currentTask.sessionId,
      triggerReason: 'scheduled',
      status: 'skipped',
      errorMessage: 'Embedded app "hydrology-workbench" is not active',
      scheduledAt: 7000,
      startedAt: null
    }))
    expect(service._broadcastChange).toHaveBeenCalledWith(currentTask.id, 'skipped')
  })

  it('drains queued tasks after an active scheduled run completes on the same session', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const sessionId = 'agent-session-17'
    const activeTask = {
      id: 17,
      name: '正在执行任务',
      prompt: '继续执行',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      sessionId,
      runtimeState: null
    }
    const queuedTask = {
      id: 18,
      name: '排队任务',
      prompt: '接续执行',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      nextRunAt: 3000,
      sessionId
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn((taskId) => {
        if (taskId === activeTask.id) return { ...activeTask }
        if (taskId === queuedTask.id) return { ...queuedTask }
        return null
      }),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ ...activeTask, ...updates })),
      createScheduledTaskRun: vi.fn()
    }

    const agentSessionManager = {
      on: vi.fn(),
      get: vi.fn(() => ({ status: 'idle' }))
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    service.activeRuns.set(sessionId, {
      taskId: activeTask.id,
      sessionId,
      triggerReason: 'scheduled',
      scheduledAt: 1000,
      startedAt: 1100
    })
    service.sessionTaskQueues.set(sessionId, [{
      taskId: queuedTask.id,
      triggerReason: 'scheduled',
      allowDisabled: false,
      scheduledAt: 3000
    }])
    service.queuedTaskIds.add(queuedTask.id)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_computeNextRunAt').mockReturnValue(2000)
    const executeSpy = vi.spyOn(service, '_executeTask').mockResolvedValue()

    service._handleAgentResult(sessionId)
    await Promise.resolve()
    await Promise.resolve()

    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: queuedTask.id }), 'scheduled', {
      allowDisabled: false,
      scheduledAtOverride: 3000
    })
    expect(service.queuedTaskIds.has(queuedTask.id)).toBe(false)
    expect(service.sessionTaskQueues.has(sessionId)).toBe(false)
  })

  it('drains queued tasks after a non-scheduled agent result frees the bound session', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const sessionId = 'agent-session-19'
    const queuedTask = {
      id: 19,
      name: '手动会话排队任务',
      prompt: '继续执行',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      nextRunAt: 5000,
      sessionId
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn((taskId) => taskId === queuedTask.id ? { ...queuedTask } : null)
    }

    const agentSessionManager = {
      on: vi.fn(),
      get: vi.fn(() => ({ status: 'idle' }))
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    service.sessionTaskQueues.set(sessionId, [{
      taskId: queuedTask.id,
      triggerReason: 'scheduled',
      allowDisabled: false,
      scheduledAt: 5000
    }])
    service.queuedTaskIds.add(queuedTask.id)
    const executeSpy = vi.spyOn(service, '_executeTask').mockResolvedValue()

    service._handleAgentResult(sessionId)
    await Promise.resolve()
    await Promise.resolve()

    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: queuedTask.id }), 'scheduled', {
      allowDisabled: false,
      scheduledAtOverride: 5000
    })
  })

  it('queues manual run-now requests when the bound agent session is busy', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 20,
      name: '手动排队任务',
      prompt: '检查状态',
      modelId: 'glm-5.1',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      nextRunAt: 6000,
      sessionId: 'agent-session-20',
      runCount: 0
    }

    const sessionDatabase = {
      getScheduledTask: vi.fn(() => ({ ...currentTask })),
      getAgentConversation: vi.fn(() => ({ id: 1 })),
      updateScheduledTaskState: vi.fn()
    }

    const agentSessionManager = {
      on: vi.fn(),
      get: vi.fn(() => ({ status: 'streaming' })),
      reopen: vi.fn(() => ({ status: 'streaming' }))
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_ensureTaskSession').mockReturnValue(currentTask.sessionId)
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)

    const result = await service.runTaskNow(currentTask.id)

    expect(result).toEqual(expect.objectContaining({ id: currentTask.id }))
    expect(service.queuedTaskIds.has(currentTask.id)).toBe(true)
    expect(service.sessionTaskQueues.get(currentTask.sessionId)).toEqual([{
      taskId: currentTask.id,
      triggerReason: 'manual',
      allowDisabled: true,
      scheduledAt: null
    }])
    expect(service._broadcastChange).toHaveBeenCalledWith(currentTask.id, 'queued')
  })

  it('does not enqueue the same due task twice across repeated due checks', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const currentTask = {
      id: 21,
      name: '去重排队任务',
      prompt: '检查状态',
      modelId: 'glm-5.1',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      nextRunAt: 1000,
      sessionId: 'agent-session-21',
      runCount: 0
    }

    const sessionDatabase = {
      listScheduledTasks: vi.fn(() => [{ ...currentTask }]),
      getAgentConversation: vi.fn(() => ({ id: 1 })),
      updateScheduledTaskState: vi.fn()
    }

    const agentSessionManager = {
      on: vi.fn(),
      get: vi.fn(() => ({ status: 'streaming' })),
      reopen: vi.fn(() => ({ status: 'streaming' }))
    }

    const service = new ScheduledTaskService({}, agentSessionManager)
    service.setSessionDatabase(sessionDatabase)
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_ensureTaskSession').mockReturnValue(currentTask.sessionId)
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(true)
    vi.spyOn(Date, 'now').mockReturnValue(2000)

    await service._checkDueTasks()
    await service._checkDueTasks()

    expect(service.sessionTaskQueues.get(currentTask.sessionId)).toEqual([{
      taskId: currentTask.id,
      triggerReason: 'scheduled',
      allowDisabled: false,
      scheduledAt: 1000
    }])
    expect(service._broadcastChange).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('allows creating a task without an explicit model id', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })
    service.setSessionDatabase({
      createScheduledTask: vi.fn(task => ({ id: 300, ...task })),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ id: 300, ...updates }))
    })
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

    await expect(service.createTask({
      name: '缺少模型',
      prompt: '执行任务',
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: Date.UTC(2026, 3, 25, 10, 0, 0)
    })).resolves.toBeTruthy()
  })

  it('allows running an existing task without an explicit model id', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, {
      on: vi.fn(),
      create: vi.fn(() => ({ id: 'scheduled-run-301' })),
      get: vi.fn(() => ({ status: 'idle' })),
      reopen: vi.fn(() => ({ status: 'idle' })),
      sendMessage: vi.fn().mockResolvedValue()
    })
    service.setSessionDatabase({
      getScheduledTask: vi.fn(() => ({
        id: 301,
        name: '旧任务',
        prompt: '执行',
        modelId: null,
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 30,
        firstRunAt: Date.UTC(2026, 3, 25, 10, 0, 0)
      })),
      getAgentConversation: vi.fn(() => null),
      updateScheduledTaskState: vi.fn((_taskId, updates) => ({ id: 301, ...updates })),
      createScheduledTaskRun: vi.fn()
    })
    vi.spyOn(service, '_broadcastChange').mockImplementation(() => {})
    vi.spyOn(service, '_hasConversationHistory').mockReturnValue(false)
    vi.spyOn(service, '_rearmScheduler').mockImplementation(() => {})

    await expect(service.runTaskNow(301)).resolves.toBeTruthy()
  })
})

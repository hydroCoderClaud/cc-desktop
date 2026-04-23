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
    }, 'startup', Date.UTC(2026, 3, 23, 1, 2, 3), { bootstrap: true })

    expect(prompt).toContain('# 定时智能体任务')
    expect(prompt).toContain('触发原因：启动触发')
    expect(prompt).toContain('# 任务内容')
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

    service.updateTask(currentTask.id, { name: updatedTask.name })

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

    service.updateTask(currentTask.id, { prompt: '执行巡检并汇总' })

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

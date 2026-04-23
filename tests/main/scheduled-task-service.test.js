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
})

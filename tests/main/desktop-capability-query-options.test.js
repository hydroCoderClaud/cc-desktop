import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: config => config,
  tool: (name, description, inputSchema, handler) => ({
    name,
    description,
    inputSchema,
    handler
  })
}))

const {
  buildDesktopCapabilityQueryOptions,
  DESKTOP_CAPABILITY_ALLOWED_TOOLS
} = await import('../../src/main/managers/desktop-capability-query-options.js')

describe('desktop capability query options', () => {
  function parseToolPayload(result) {
    expect(result?.content?.[0]?.type).toBe('text')
    return JSON.parse(result.content[0].text)
  }

  function buildTask(overrides = {}) {
    return {
      id: 7,
      name: '巡检任务',
      prompt: '检查今日告警',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 30,
      dailyTime: '',
      weeklyDays: [],
      monthlyMode: 'day_of_month',
      monthlyDay: 1,
      firstRunMode: 'immediate',
      firstRunAt: null,
      nextRunAt: 1710000000000,
      lastRunAt: 1709990000000,
      createdAt: 1709980000000,
      updatedAt: 1710005000000,
      sessionId: 'session-7',
      lastError: 'recent failure',
      failureCount: 2,
      apiProfileId: 'profile-1',
      modelTier: 'sonnet',
      maxTurns: 6,
      cwd: '/tmp/project',
      ...overrides
    }
  }

  function buildRun(overrides = {}) {
    return {
      id: 11,
      taskId: 7,
      sessionId: 'session-7',
      triggerReason: 'manual',
      status: 'failed',
      errorMessage: 'network timeout',
      startedAt: 1710000100000,
      finishedAt: 1710000200000,
      createdAt: 1710000205000,
      ...overrides
    }
  }

  async function createOptions(serviceOverrides = {}) {
    const task = buildTask()
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      },
      listTasks: vi.fn(() => [task]),
      getTaskRuns: vi.fn(() => [buildRun()]),
      createTask: vi.fn(async input => buildTask({ id: 8, ...input })),
      updateTask: vi.fn(async (taskId, updates) => buildTask({ id: Number(taskId), ...updates })),
      runTaskNow: vi.fn(async taskId => buildTask({ id: Number(taskId), lastRunAt: 1710000300000 })),
      deleteTask: vi.fn(taskId => ({ success: true, taskId: Number(taskId) })),
      ...serviceOverrides
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: { source: 'manual' }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    return { options, tools, scheduledTaskService, task }
  }

  it('exposes the extended scheduled-task toolset', async () => {
    const { options, tools } = await createOptions()

    expect(Object.keys(options.mcpServers)).toEqual(['hydrodesktop'])
    expect(Object.keys(tools)).toEqual([
      'schedule_list',
      'schedule_get',
      'schedule_runs',
      'schedule_create',
      'schedule_update',
      'schedule_enable',
      'schedule_disable',
      'schedule_run_now',
      'schedule_delete'
    ])
    expect(DESKTOP_CAPABILITY_ALLOWED_TOOLS).toEqual([
      'mcp__hydrodesktop__schedule_list',
      'mcp__hydrodesktop__schedule_get',
      'mcp__hydrodesktop__schedule_runs',
      'mcp__hydrodesktop__schedule_create',
      'mcp__hydrodesktop__schedule_update',
      'mcp__hydrodesktop__schedule_enable',
      'mcp__hydrodesktop__schedule_disable',
      'mcp__hydrodesktop__schedule_run_now',
      'mcp__hydrodesktop__schedule_delete'
    ])
    expect(options.appendSystemPrompt).toContain('定时任务')
    expect(options.appendSystemPrompt).toContain('schedule_run_now')
    expect(options.appendSystemPrompt).toContain('Do not claim there are no tasks')
    expect(options.appendSystemPrompt).toContain('You do have direct access to HydroDesktop scheduled tasks')
    expect(options.appendSystemPrompt).toContain('Do not say you cannot access HydroDesktop scheduled tasks')
    expect(options.appendSystemPrompt).toContain('Never append raw internal tier codes in parentheses')
  })

  it('serializes task diagnostics in list/get responses', async () => {
    const { tools } = await createOptions()

    const listPayload = parseToolPayload(await tools.schedule_list.handler())
    expect(listPayload.action).toBe('list')
    expect(listPayload.tasks[0]).toMatchObject({
      id: 7,
      sessionId: 'session-7',
      lastError: 'recent failure',
      failureCount: 2,
      modelTierLabel: '均衡'
    })
    expect(listPayload.tasks[0].updatedAtIso).toBeTypeOf('string')
    expect(listPayload.tasks[0]).not.toHaveProperty('modelTier')
    expect(listPayload.tasks[0].summary).not.toContain('sonnet')
    expect(listPayload.tasks[0].summary).not.toContain('opus')
    expect(listPayload.tasks[0].summary).not.toContain('haiku')

    const getPayload = parseToolPayload(await tools.schedule_get.handler({ taskId: 7 }))
    expect(getPayload.action).toBe('get')
    expect(getPayload.task).toMatchObject({
      id: 7,
      sessionId: 'session-7',
      lastError: 'recent failure',
      failureCount: 2,
      modelTierLabel: '均衡'
    })
    expect(getPayload.task).not.toHaveProperty('modelTier')
  })

  it('localizes model tier labels for english locale', async () => {
    const { tools } = await createOptions({
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'en-US'
          }
        })
      }
    })

    const payload = parseToolPayload(await tools.schedule_get.handler({ taskId: 7 }))

    expect(payload.task).toMatchObject({
      modelTierLabel: 'Balanced'
    })
    expect(payload.task.summary).toContain('Balanced')
    expect(payload.task.summary).not.toContain('sonnet')
    expect(payload.task.summary).not.toContain('opus')
    expect(payload.task.summary).not.toContain('haiku')
  })

  it('reads task runs and returns run metadata', async () => {
    const { tools, scheduledTaskService } = await createOptions()

    const payload = parseToolPayload(await tools.schedule_runs.handler({ taskName: '巡检', limit: 5 }))

    expect(scheduledTaskService.getTaskRuns).toHaveBeenCalledWith(7, 5)
    expect(payload.action).toBe('runs')
    expect(payload.count).toBe(1)
    expect(payload.runs[0]).toMatchObject({
      id: 11,
      taskId: 7,
      triggerReason: 'manual',
      status: 'failed',
      errorMessage: 'network timeout'
    })
    expect(payload.runs[0].startedAtIso).toBeTypeOf('string')
  })

  it('formats monthly schedules with localized monthly metadata', async () => {
    const { tools } = await createOptions({
      listTasks: vi.fn(() => [buildTask({
        scheduleType: 'monthly',
        dailyTime: '09:30',
        monthlyMode: 'last_day',
        monthlyDay: null
      })])
    })

    const payload = parseToolPayload(await tools.schedule_list.handler())

    expect(payload.tasks[0]).toMatchObject({
      scheduleType: 'monthly',
      monthlyMode: 'last_day',
      monthlyDay: null
    })
    expect(payload.tasks[0].summary).toContain('每月最后一天')
  })

  it('delegates run-now and delete operations to the scheduled task service', async () => {
    const { tools, scheduledTaskService } = await createOptions()

    const runNowPayload = parseToolPayload(await tools.schedule_run_now.handler({ taskId: 7 }))
    expect(scheduledTaskService.runTaskNow).toHaveBeenCalledWith(7)
    expect(runNowPayload.action).toBe('run_now')
    expect(runNowPayload.task.lastRunAt).toBe(1710000300000)

    const deletePayload = parseToolPayload(await tools.schedule_delete.handler({ taskId: 7 }))
    expect(scheduledTaskService.deleteTask).toHaveBeenCalledWith(7)
    expect(deletePayload).toMatchObject({
      action: 'delete',
      result: { success: true, taskId: 7 }
    })
    expect(deletePayload.deletedTask).toMatchObject({
      id: 7,
      name: '巡检任务'
    })
  })
})

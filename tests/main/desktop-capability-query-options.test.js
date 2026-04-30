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
      weeklyDays: [],
      monthlyMode: 'day_of_month',
      monthlyDay: 1,
      firstRunAt: 1710001800000,
      nextRunAt: 1710000000000,
      lastStartedAt: 1709995000000,
      lastScheduledAt: 1709994900000,
      lastRunAt: 1709990000000,
      createdAt: 1709980000000,
      updatedAt: 1710005000000,
      sessionId: 'session-7',
      lastError: 'recent failure',
      failureCount: 2,
      runCount: 4,
      apiProfileId: 'profile-1',
      modelId: 'glm-5.1',
      maxRuns: 6,
      resetCountOnEnable: true,
      intervalAnchorMode: 'started_at',
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
      scheduledAt: 1710000000000,
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

  async function createOptionsWithWeixin({ session = { source: 'manual' }, serviceOverrides = {} } = {}) {
    const weixinNotifyService = {
      listAccounts: vi.fn(() => [{ accountId: 'bot@im.bot', hasToken: true }]),
      listTargets: vi.fn(() => [{
        id: 'bot@im.bot:target@im.wechat',
        accountId: 'bot@im.bot',
        accountUserId: 'target@im.wechat',
        userId: 'target@im.wechat',
        displayName: '张三',
        targetSource: 'authorized_user',
        isAuthorizedAccountUser: true,
        hasContextToken: true
      }]),
      sendText: vi.fn(async input => ({
        success: true,
        messageId: 'msg-1',
        target: {
          id: 'bot@im.bot:target@im.wechat',
          accountId: input.accountId,
          accountUserId: 'target@im.wechat',
          userId: 'target@im.wechat',
          displayName: '张三',
          targetSource: 'authorized_user',
          isAuthorizedAccountUser: true,
          hasContextToken: true
        }
      })),
      ...serviceOverrides
    }
    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService: session.source === 'scheduled' ? null : {
        configManager: { getConfig: () => ({ settings: { locale: 'zh-CN' } }) },
        listTasks: vi.fn(() => [])
      },
      weixinNotifyService,
      session
    })
    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )
    return { options, tools, weixinNotifyService }
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
    expect(options.appendSystemPrompt).toContain('modelId')
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
      runCount: 4,
      lastStartedAt: 1709995000000,
      lastScheduledAt: 1709994900000,
      modelId: 'glm-5.1',
      maxRuns: 6,
      resetCountOnEnable: true,
      intervalAnchorMode: 'started_at'
    })
    expect(listPayload.tasks[0].updatedAtIso).toBeTypeOf('string')
    expect(listPayload.tasks[0]).not.toHaveProperty('modelTier')
    expect(listPayload.tasks[0]).not.toHaveProperty('modelTierLabel')
    expect(listPayload.tasks[0]).not.toHaveProperty('firstRunMode')
    expect(listPayload.tasks[0].summary).toContain('glm-5.1')

    const getPayload = parseToolPayload(await tools.schedule_get.handler({ taskId: 7 }))
    expect(getPayload.action).toBe('get')
    expect(getPayload.task).toMatchObject({
      id: 7,
      sessionId: 'session-7',
      lastError: 'recent failure',
      failureCount: 2,
      runCount: 4,
      lastStartedAt: 1709995000000,
      lastScheduledAt: 1709994900000,
      modelId: 'glm-5.1',
      maxRuns: 6,
      resetCountOnEnable: true,
      intervalAnchorMode: 'started_at'
    })
    expect(getPayload.task).not.toHaveProperty('modelTier')
    expect(getPayload.task).not.toHaveProperty('firstRunMode')
  })

  it('serializes model ids for english locale', async () => {
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
      modelId: 'glm-5.1'
    })
    expect(payload.task.summary).toContain('glm-5.1')
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
      scheduledAt: 1710000000000,
      errorMessage: 'network timeout'
    })
    expect(payload.runs[0].startedAtIso).toBeTypeOf('string')
  })

  it('formats monthly schedules with localized monthly metadata', async () => {
    const { tools } = await createOptions({
      listTasks: vi.fn(() => [buildTask({
        scheduleType: 'monthly',
        firstRunAt: Date.UTC(2026, 3, 1, 9, 30, 0),
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

  it('exposes weixin notification tools without leaking credentials', async () => {
    const { options, tools, weixinNotifyService } = await createOptionsWithWeixin()

    expect(Object.keys(tools)).toEqual(expect.arrayContaining([
      'schedule_list',
      'weixin_notify_list_targets',
      'weixin_notify_send'
    ]))
    expect(options.allowedTools).toEqual(expect.arrayContaining([
      'mcp__hydrodesktop__weixin_notify_list_targets',
      'mcp__hydrodesktop__weixin_notify_send'
    ]))
    expect(options.appendSystemPrompt).toContain('Weixin notification')

    const listPayload = parseToolPayload(await tools.weixin_notify_list_targets.handler())
    expect(listPayload.accounts[0]).not.toHaveProperty('token')
    expect(listPayload.targets[0]).toMatchObject({
      userId: 'target@im.wechat',
      displayName: '张三',
      targetKey: '张三',
      displayLabel: '张三',
      targetSource: 'authorized_user',
      isAuthorizedAccountUser: true,
      sendable: true,
      hasContextToken: true
    })
    expect(listPayload.targets[0].aliases).toEqual(expect.arrayContaining([
      '张三',
      'bot@im.bot:target@im.wechat',
      'target@im.wechat'
    ]))
    expect(listPayload.usage.sendWith).toContain('targetKey')

    const sendPayload = parseToolPayload(await tools.weixin_notify_send.handler({
      accountId: 'bot@im.bot',
      targetKey: '张三',
      text: 'hello'
    }))
    expect(weixinNotifyService.sendText).toHaveBeenCalledWith({
      accountId: 'bot@im.bot',
      targetId: '张三',
      text: 'hello'
    })
    expect(sendPayload.recipient).toMatchObject({
      displayName: '张三',
      targetKey: '张三',
      sendable: true
    })
    expect(sendPayload.result).toMatchObject({
      success: true,
      messageId: 'msg-1'
    })
  })

  it('passes current session id to weixin notification sends', async () => {
    const { tools, weixinNotifyService } = await createOptionsWithWeixin({
      session: { id: 'chat-session-1', source: 'manual' }
    })

    await tools.weixin_notify_send.handler({
      accountId: 'bot@im.bot',
      targetKey: '张三',
      text: 'hello'
    })

    expect(weixinNotifyService.sendText).toHaveBeenCalledWith({
      accountId: 'bot@im.bot',
      targetId: '张三',
      text: 'hello',
      sessionId: 'chat-session-1'
    })
  })

  it('uses full target id as targetKey when display names are ambiguous', async () => {
    const { tools } = await createOptionsWithWeixin({
      serviceOverrides: {
        listTargets: vi.fn(() => [{
          id: 'bot-a@im.bot:target@im.wechat',
          accountId: 'bot-a@im.bot',
          userId: 'target@im.wechat',
          displayName: '张三',
          hasContextToken: true
        }, {
          id: 'bot-b@im.bot:target@im.wechat',
          accountId: 'bot-b@im.bot',
          userId: 'target@im.wechat',
          displayName: '张三',
          hasContextToken: true
        }])
      }
    })

    const payload = parseToolPayload(await tools.weixin_notify_list_targets.handler())
    expect(payload.targets[0]).toMatchObject({
      targetKey: 'bot-a@im.bot:target@im.wechat',
      displayLabel: '张三 (bot-a@im.bot)'
    })
  })

  it('keeps scheduled source sessions limited to weixin notification tools', async () => {
    const { options, tools } = await createOptionsWithWeixin({
      session: { source: 'scheduled' }
    })

    expect(Object.keys(tools)).toEqual([
      'weixin_notify_list_targets',
      'weixin_notify_send'
    ])
    expect(options.allowedTools).toEqual([
      'mcp__hydrodesktop__weixin_notify_list_targets',
      'mcp__hydrodesktop__weixin_notify_send'
    ])
    expect(options.disallowedTools).toBeUndefined()
    expect(options.appendSystemPrompt).toContain('Weixin notification')
  })
})

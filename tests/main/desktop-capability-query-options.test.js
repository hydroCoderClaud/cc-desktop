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
      runtimeState: {
        keep: 'value',
        _scheduler: {
          resetSessionAfterRun: true,
          reason: 'cwd-changed'
        }
      },
      lastError: 'recent failure',
      failureCount: 2,
      runCount: 4,
      sessionBindingMode: 'current',
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
      scheduledTaskService: session.taskId ? null : {
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
    expect(options.appendSystemPrompt).toContain('reuse the currently bound session runtime')
    expect(options.appendSystemPrompt).toContain('default to binding the task to the current session')
    expect(options.appendSystemPrompt).toContain('Only set sessionBindingMode to new when the user explicitly asks for a separate')
    expect(options.appendSystemPrompt).toContain('follows that app\'s current session instead of reopening an old embedded session')
    expect(options.appendSystemPrompt).toContain('will be skipped instead of falling back to a fresh default scheduled session')
  })

  it('serializes task diagnostics in list/get responses', async () => {
    const { tools } = await createOptions()

    const listPayload = parseToolPayload(await tools.schedule_list.handler())
    expect(listPayload.action).toBe('list')
    expect(listPayload.tasks[0]).toMatchObject({
      id: 7,
      sessionId: 'session-7',
      runtimeState: { keep: 'value' },
      lastError: 'recent failure',
      failureCount: 2,
      runCount: 4,
      lastStartedAt: 1709995000000,
      lastScheduledAt: 1709994900000,
      sessionBindingMode: 'current',
      maxRuns: 6,
      resetCountOnEnable: true,
      intervalAnchorMode: 'started_at'
    })
    expect(listPayload.tasks[0].updatedAtIso).toBeTypeOf('string')
    expect(listPayload.tasks[0]).not.toHaveProperty('modelTier')
    expect(listPayload.tasks[0]).not.toHaveProperty('modelTierLabel')
    expect(listPayload.tasks[0]).not.toHaveProperty('firstRunMode')
    expect(listPayload.tasks[0].summary).toContain('session-7')
    expect(listPayload.tasks[0].runtimeState?._scheduler).toBeUndefined()

    const getPayload = parseToolPayload(await tools.schedule_get.handler({ taskId: 7 }))
    expect(getPayload.action).toBe('get')
    expect(getPayload.task).toMatchObject({
      id: 7,
      sessionId: 'session-7',
      runtimeState: { keep: 'value' },
      lastError: 'recent failure',
      failureCount: 2,
      runCount: 4,
      lastStartedAt: 1709995000000,
      lastScheduledAt: 1709994900000,
      sessionBindingMode: 'current',
      maxRuns: 6,
      resetCountOnEnable: true,
      intervalAnchorMode: 'started_at'
    })
    expect(getPayload.task).not.toHaveProperty('modelTier')
    expect(getPayload.task).not.toHaveProperty('firstRunMode')
    expect(getPayload.task.runtimeState?._scheduler).toBeUndefined()
  })

  it('aligns create/update schemas with the scheduled task service contract', async () => {
    const { tools } = await createOptions()

    expect(tools.schedule_create.inputSchema.cwd.safeParse('').success).toBe(true)
    expect(tools.schedule_create.inputSchema.maxRuns.safeParse('6').success).toBe(true)
    expect(tools.schedule_create.inputSchema.intervalMinutes.safeParse('30').success).toBe(true)
    expect(tools.schedule_create.inputSchema.monthlyDay.safeParse('12').success).toBe(true)
    expect(tools.schedule_create.inputSchema.weeklyDays.safeParse(['1', '3']).success).toBe(true)
    expect(tools.schedule_create.inputSchema.firstRunAt.safeParse('2026-05-01T09:30:00+08:00').success).toBe(true)
    expect(tools.schedule_create.inputSchema.sessionBindingMode.safeParse('current').success).toBe(true)
    expect(tools.schedule_create.inputSchema.sessionBindingMode.safeParse('new').success).toBe(true)
    expect(tools.schedule_create.description).toContain('创建一个新的 Hydro Desktop 定时任务')

    expect(tools.schedule_update.inputSchema.cwd.safeParse('').success).toBe(true)
    expect(tools.schedule_update.inputSchema.sessionBindingMode.safeParse('current').success).toBe(true)
    expect(tools.schedule_update.inputSchema.sessionBindingMode.safeParse('new').success).toBe(true)
    expect(tools.schedule_update.inputSchema.firstRunAt.safeParse('2026-05-01T09:30:00+08:00').success).toBe(true)
  })

  it('documents current-session binding as the default create behavior', async () => {
    const { tools } = await createOptions()

    expect(tools.schedule_create.inputSchema.sessionBindingMode.description).toContain('省略时默认 current')
    expect(tools.schedule_create.inputSchema.sessionBindingMode.description).toContain('只有用户明确要求独立/后台/新会话时才使用 new')
  })

  it('defaults MCP schedule_create in chat sessions to bind the current session', async () => {
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      },
      listTasks: vi.fn(() => []),
      createTask: vi.fn(async input => buildTask({ id: 8, ...input, sessionId: input.boundSessionId || null }))
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: { id: 'chat-session-mcp-1', source: 'manual' }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    await tools.schedule_create.handler({
      name: 'MCP 会话绑定任务',
      prompt: '继续当前会话',
      scheduleType: 'interval',
      intervalMinutes: 30,
      firstRunAt: '2026-05-01T09:30:00+08:00'
    })

    expect(scheduledTaskService.createTask).toHaveBeenCalledWith(expect.objectContaining({
      sessionBindingMode: 'current',
      boundSessionId: 'chat-session-mcp-1'
    }))
  })

  it('defaults MCP schedule_create in embedded sessions to bind the current session', async () => {
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      },
      listTasks: vi.fn(() => []),
      createTask: vi.fn(async input => buildTask({ id: 18, ...input, sessionId: input.boundSessionId || null }))
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: {
        id: 'embedded-session-mcp-1',
        source: 'manual',
        ownerClientId: 'embed:hydrology-workbench',
        clientType: 'embedded',
        clientMeta: { appId: 'hydrology-workbench' }
      }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    await tools.schedule_create.handler({
      name: '工作台当前会话任务',
      prompt: '继续当前水文工作台会话',
      scheduleType: 'interval',
      intervalMinutes: 20,
      firstRunAt: '2026-05-01T09:30:00+08:00'
    })

    expect(scheduledTaskService.createTask).toHaveBeenCalledWith(expect.objectContaining({
      sessionBindingMode: 'current',
      boundSessionId: 'embedded-session-mcp-1'
    }))
  })

  it('passes current session binding updates through MCP in embedded sessions', async () => {
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      },
      listTasks: vi.fn(() => [
        buildTask({
          id: 18,
          name: '工作台任务',
          sessionBindingMode: 'new',
          sessionId: 'scheduled-session-18'
        })
      ]),
      updateTask: vi.fn(async (taskId, updates) => buildTask({ id: Number(taskId), ...updates }))
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: {
        id: 'embedded-session-mcp-2',
        source: 'manual',
        ownerClientId: 'embed:hydrology-workbench',
        clientType: 'embedded',
        clientMeta: { appId: 'hydrology-workbench' }
      }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    await tools.schedule_update.handler({
      taskId: 18,
      sessionBindingMode: 'current'
    })

    expect(scheduledTaskService.updateTask).toHaveBeenCalledWith(18, expect.objectContaining({
      sessionBindingMode: 'current'
    }))
  })

  it('still injects scheduled-task tools into scheduled sessions when the global switch is enabled', async () => {
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN',
            agent: {
              allowScheduledSessionScheduleTools: true
            }
          }
        })
      },
      listTasks: vi.fn(() => [])
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: { id: 'scheduled-session-1', taskId: 1 }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    expect(Object.keys(tools)).toEqual(expect.arrayContaining([
      'schedule_list',
      'schedule_create'
    ]))
    expect(options.allowedTools).toEqual(expect.arrayContaining([
      'mcp__hydrodesktop__schedule_list',
      'mcp__hydrodesktop__schedule_create'
    ]))
  })

  it('binds the current scheduled session when reinjection is enabled and sessionBindingMode defaults to current', async () => {
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN',
            agent: {
              allowScheduledSessionScheduleTools: true
            }
          }
        })
      },
      listTasks: vi.fn(() => []),
      createTask: vi.fn(async input => buildTask({ id: 9, ...input, sessionId: input.boundSessionId || null }))
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: { id: 'scheduled-session-current-1', taskId: 1 }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    await tools.schedule_create.handler({
      name: '同会话追加任务',
      prompt: '继续当前定时任务会话',
      scheduleType: 'interval',
      intervalMinutes: 45,
      firstRunAt: '2026-05-01T10:00:00+08:00'
    })

    expect(scheduledTaskService.createTask).toHaveBeenCalledWith(expect.objectContaining({
      sessionBindingMode: 'current',
      boundSessionId: 'scheduled-session-current-1'
    }))
  })

  it('does not inject scheduled-task tools into scheduled sessions when the global switch is disabled', async () => {
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN',
            agent: {
              allowScheduledSessionScheduleTools: false
            }
          }
        })
      },
      listTasks: vi.fn(() => [])
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: { id: 'scheduled-session-2', taskId: 1 }
    })

    expect(options).toEqual({})
  })

  it('serializes linked session metadata for english locale', async () => {
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
      sessionId: 'session-7',
      sessionBindingMode: 'current'
    })
    expect(payload.task.summary).toContain('session-7')
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
      session: { taskId: 1 }
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

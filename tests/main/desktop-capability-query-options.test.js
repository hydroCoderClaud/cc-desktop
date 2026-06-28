import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  DESKTOP_CAPABILITY_ALLOWED_TOOLS,
  SESSION_ALLOWED_TOOLS
} = await import('../../src/main/managers/desktop-capability-query-options.js')

describe('desktop capability query options', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-desktop-capability-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function createImageFile(name = 'cover.png') {
    const filePath = path.join(tempDir, name)
    fs.writeFileSync(filePath, Buffer.from('fake-image'))
    return filePath
  }

  function createDocumentFile(name = 'report.pdf') {
    const filePath = path.join(tempDir, name)
    fs.writeFileSync(filePath, Buffer.from('fake-document'))
    return filePath
  }

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

  async function createOptionsWithWeixin({ session = { source: 'manual' }, serviceOverrides = {}, bridgeOverrides = {} } = {}) {
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
    const weixinBridge = {
      getBinding: vi.fn((sessionId) => sessionId === session.id ? null : null),
      ...bridgeOverrides
    }
    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService: {
        configManager: { getConfig: () => ({ settings: { locale: 'zh-CN' } }) },
        listTasks: vi.fn(() => [])
      },
      weixinNotifyService,
      weixinBridge,
      session
    })
    const hydroTools = options?.mcpServers?.hydrodesktop?.tools || []
    const tools = Object.fromEntries(
      hydroTools.map(tool => [tool.name, tool])
    )
    return { options, tools, weixinNotifyService, weixinBridge }
  }

  async function createOptionsWithBuiltinIm({
    session = { id: 'chat-im-1', source: 'manual' },
    dingtalkTargets = [{
      id: 'staff-1',
      staffId: 'staff-1',
      userId: 'staff-1',
      displayName: '钉钉张三',
      hasContextToken: true,
      targetType: 'user'
    }],
    feishuTargets = [{
      id: 'ou_123',
      openId: 'ou_123',
      userId: 'user_123',
      displayName: '飞书李四',
      hasContextToken: true,
      targetType: 'user'
    }],
    enterpriseWeixinTargets = [{
      id: 'wecom-user-1',
      userId: 'wecom-user-1',
      targetId: 'wecom-user-1',
      displayName: '企微王五',
      targetType: 'user'
    }],
    overrides = {}
  } = {}) {
    const dingtalkBridge = {
      _getConfig: () => ({ enabled: true }),
      getStatus: () => ({ runtimeState: 'connected' }),
      listTargets: vi.fn(async () => dingtalkTargets),
      getBinding: vi.fn((sessionId) => sessionId === session.id ? null : null),
      sendToTarget: vi.fn(async input => ({
        success: true,
        messageId: 'ding-msg-1',
        targetId: input.targetId || input.staffId
      })),
      ...overrides.dingtalkBridge
    }
    const feishuBridge = {
      _getConfig: () => ({ enabled: true }),
      getStatus: () => ({ runtimeState: 'connected' }),
      listSendableTargets: vi.fn(async () => feishuTargets),
      getBinding: vi.fn((sessionId) => sessionId === session.id ? null : null),
      sendToTarget: vi.fn(async input => ({
        success: true,
        messageId: 'feishu-msg-1',
        targetId: input.targetId || input.openId
      })),
      ...overrides.feishuBridge
    }
    const enterpriseWeixinBridge = {
      _getConfig: () => ({ enabled: true }),
      getStatus: () => ({ runtimeState: 'connected' }),
      _knownChats: new Map(),
      getBinding: vi.fn((sessionId) => sessionId === session.id ? null : null),
      sendToTarget: vi.fn(async input => ({
        success: true,
        targetId: input.targetId || input.userId
      })),
      ...overrides.enterpriseWeixinBridge
    }
    const wecomCliManager = {
      listContacts: vi.fn(async () => enterpriseWeixinTargets),
      ...overrides.wecomCliManager
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService: null,
      weixinNotifyService: null,
      dingtalkBridge,
      feishuBridge,
      enterpriseWeixinBridge,
      wecomCliManager,
      session
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    return {
      options,
      tools,
      dingtalkBridge,
      feishuBridge,
      enterpriseWeixinBridge,
      wecomCliManager
    }
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
    expect(SESSION_ALLOWED_TOOLS).toEqual([
      'mcp__hydrodesktop__session_get_current',
      'mcp__hydrodesktop__session_match_task'
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
    expect(options.appendSystemPrompt).toContain('will be skipped instead of falling back to a fresh default task session')
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

  it('returns current session context through session_get_current', async () => {
    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService: {
        configManager: {
          getConfig: () => ({
            settings: { locale: 'zh-CN' }
          })
        },
        listTasks: vi.fn(() => [buildTask()])
      },
      session: {
        id: 'chat-session-current-1',
        source: 'manual',
        taskId: 77,
        ownerClientId: 'main-window',
        clientType: 'window',
        clientMeta: { appId: 'chat' }
      }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )
    const payload = parseToolPayload(await tools.session_get_current.handler())

    expect(payload).toEqual({
      action: 'session_get_current',
      session: {
        sessionId: 'chat-session-current-1',
        taskId: 77,
        source: 'manual',
        imChannel: null,
        ownerClientId: 'main-window',
        clientType: 'window',
        appId: 'chat',
        currentTaskSession: true,
        embeddedSession: false,
        boundTarget: null
      }
    })
  })

  it('compares the current session against a scheduled task session through session_match_task', async () => {
    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService: {
        configManager: {
          getConfig: () => ({
            settings: { locale: 'zh-CN' }
          })
        },
        listTasks: vi.fn(() => [buildTask({ id: 9, sessionId: 'match-session-1' })])
      },
      session: {
        id: 'match-session-1',
        source: 'manual'
      }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )
    const payload = parseToolPayload(await tools.session_match_task.handler({ taskId: 9 }))

    expect(payload.matched).toBe(true)
    expect(payload.currentSessionId).toBe('match-session-1')
    expect(payload.taskSessionId).toBe('match-session-1')
    expect(payload.task).toMatchObject({
      id: 9,
      sessionId: 'match-session-1'
    })
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
          sessionId: 'task-session-18'
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

  it('binds the current task-linked session when sessionBindingMode defaults to current', async () => {
    const scheduledTaskService = {
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      },
      listTasks: vi.fn(() => []),
      createTask: vi.fn(async input => buildTask({ id: 9, ...input, sessionId: input.boundSessionId || null }))
    }

    const options = await buildDesktopCapabilityQueryOptions({
      scheduledTaskService,
      session: { id: 'task-linked-session-1', taskId: 1 }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrodesktop.tools.map(tool => [tool.name, tool])
    )

    await tools.schedule_create.handler({
      name: '同会话追加任务',
      prompt: '继续当前任务关联会话',
      scheduleType: 'interval',
      intervalMinutes: 45,
      firstRunAt: '2026-05-01T10:00:00+08:00'
    })

    expect(scheduledTaskService.createTask).toHaveBeenCalledWith(expect.objectContaining({
      sessionBindingMode: 'current',
      boundSessionId: 'task-linked-session-1'
    }))
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

  it('injects unified builtin IM tools for weixin-capable normal sessions', async () => {
    const { options, tools } = await createOptionsWithWeixin()

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
    expect(options.allowedTools).toEqual([
      ...DESKTOP_CAPABILITY_ALLOWED_TOOLS
    ])
    expect(options.appendSystemPrompt).not.toContain('built-in IM messages')
    expect(options.appendSystemPrompt).not.toContain('Weixin notification')
  })

  it('injects session tools only when a current session id exists', async () => {
    const { options, tools } = await createOptionsWithWeixin({
      session: { id: 'chat-im-2', taskId: 1 }
    })

    expect(Object.keys(tools)).toEqual([
      'schedule_list',
      'schedule_get',
      'schedule_runs',
      'schedule_create',
      'schedule_update',
      'schedule_enable',
      'schedule_disable',
      'schedule_run_now',
      'schedule_delete',
      'session_get_current',
      'session_match_task'
    ])
    expect(options.allowedTools).toEqual([
      ...DESKTOP_CAPABILITY_ALLOWED_TOOLS,
      ...SESSION_ALLOWED_TOOLS
    ])
  })

  it('injects unified builtin IM tools for non-weixin channels', async () => {
    const { options, tools } = await createOptionsWithBuiltinIm()

    expect(Object.keys(tools)).toEqual([
      'im_list_targets',
      'im_send',
      'im_unbind',
      'session_get_current',
      'session_match_task'
    ])
    expect(options.allowedTools).toEqual([
      'mcp__hydrodesktop__im_list_targets',
      'mcp__hydrodesktop__im_send',
      'mcp__hydrodesktop__im_unbind',
      'mcp__hydrodesktop__session_get_current',
      'mcp__hydrodesktop__session_match_task'
    ])
    expect(options.appendSystemPrompt).toContain('built-in IM messages')
  })

  it('unbinds the current session from its bound builtin IM target', async () => {
    const session = { id: 'chat-im-bound-1', source: 'manual', imChannel: 'feishu' }
    const boundBinding = {
      targetId: 'ou_123',
      displayName: '飞书李四',
      targetType: 'user'
    }
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id ? boundBinding : null),
          unbindTarget: vi.fn((sessionId) => ({ success: true, sessionId }))
        }
      }
    })

    const payload = parseToolPayload(await tools.im_unbind.handler({}))

    expect(feishuBridge.unbindTarget).toHaveBeenCalledWith('chat-im-bound-1')
    expect(payload.action).toBe('im_unbind')
    expect(payload.channel).toBe('feishu')
    expect(payload.recipient).toEqual(expect.objectContaining({
      channel: 'feishu',
      displayName: '飞书李四'
    }))
    expect(payload.result).toEqual({ success: true, sessionId: 'chat-im-bound-1' })
  })

  it('rejects im_unbind when the current session is not bound to a builtin IM channel', async () => {
    const { tools } = await createOptionsWithBuiltinIm({
      session: { id: 'chat-im-unbound-1', source: 'manual' }
    })

    await expect(tools.im_unbind.handler({})).rejects.toThrow('当前会话没有已绑定的 IM 渠道，无需解绑。')
  })

  it('tells the model to send directly to the bound IM target by default', async () => {
    const session = {
      id: 'chat-im-bound-prompt-1',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { options, tools } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null)
        }
      },
      feishuTargets: [{
        id: 'oc_group_a',
        openId: 'oc_group_a',
        displayName: 'agent群A',
        targetType: 'chat',
        hasContextToken: true
      }]
    })

    expect(options.appendSystemPrompt).toContain('call im_send directly and default to that bound target')
    expect(options.appendSystemPrompt).toContain('agent群A')
    expect(tools.im_send.description).toContain('可直接只传 text、imagePaths 或 filePaths 发送到该绑定目标')
    expect(tools.im_send.inputSchema.channel.safeParse(undefined).success).toBe(true)
  })

  it('tells the model not to proceed when the bound IM channel is currently unavailable', async () => {
    const session = {
      id: 'chat-im-bound-prompt-disabled-1',
      source: 'manual',
      imChannel: 'enterprise-weixin'
    }
    const { options } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        enterpriseWeixinBridge: {
          _getConfig: () => ({ enabled: false }),
          getStatus: () => ({ runtimeState: 'disabled' }),
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'zhangyuesheng', displayName: 'ZhangYueSheng', targetType: 'user' }
            : null)
        }
      }
    })

    expect(options.appendSystemPrompt).toContain('but that channel is currently unavailable')
    expect(options.appendSystemPrompt).toContain('Do not ask for message content')
    expect(options.appendSystemPrompt).toContain('you may call im_unbind')
    expect(options.appendSystemPrompt).toContain('ZhangYueSheng')
  })

  it('lists available builtin IM targets by channel', async () => {
    const { tools } = await createOptionsWithBuiltinIm()

    const payload = parseToolPayload(await tools.im_list_targets.handler())

    expect(payload.action).toBe('im_list_targets')
    expect(payload.channelCount).toBe(3)
    expect(payload.targetCount).toBe(3)
    expect(payload.channels[0]).toMatchObject({
      channel: 'dingtalk',
      channelLabel: '钉钉',
      targetCount: 1
    })
    expect(payload.channels[0].targets[0]).toMatchObject({
      targetKey: '钉钉张三',
      displayName: '钉钉张三',
      targetType: 'user'
    })
    expect(payload.channels[0].targets[0]).not.toHaveProperty('rawTargetId')
    expect(payload.channels[1].targets[0]).toMatchObject({
      channel: 'feishu',
      displayName: '飞书李四'
    })
    expect(payload.channels[2].targets[0]).toMatchObject({
      channel: 'enterprise-weixin',
      displayName: '企微王五'
    })
  })

  it('limits builtin IM target listing to the bound target for a bound session', async () => {
    const session = {
      id: 'chat-im-bound-list-1',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { tools, feishuBridge, dingtalkBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null)
        }
      },
      feishuTargets: [{
        id: 'oc_group_a',
        openId: 'oc_group_a',
        displayName: 'agent群A',
        targetType: 'chat',
        hasContextToken: true
      }, {
        id: 'ou_user_b',
        openId: 'ou_user_b',
        displayName: '飞书李四',
        targetType: 'user',
        hasContextToken: true
      }]
    })

    const payload = parseToolPayload(await tools.im_list_targets.handler())

    expect(payload.boundSession).toBe(true)
    expect(payload.channelCount).toBe(1)
    expect(payload.targetCount).toBe(1)
    expect(payload.channels).toHaveLength(1)
    expect(payload.channels[0]).toMatchObject({
      channel: 'feishu',
      channelLabel: '飞书',
      targetCount: 1
    })
    expect(payload.channels[0].targets).toEqual([expect.objectContaining({
      channel: 'feishu',
      targetKey: 'agent群A',
      displayName: 'agent群A',
      targetType: 'chat'
    })])
    expect(feishuBridge.listSendableTargets).toHaveBeenCalledTimes(1)
    expect(dingtalkBridge.listTargets).not.toHaveBeenCalled()
  })

  it('blocks builtin IM target listing when the bound channel is unavailable', async () => {
    const session = {
      id: 'chat-im-bound-list-disabled-1',
      source: 'manual',
      imChannel: 'enterprise-weixin'
    }
    const { tools } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        enterpriseWeixinBridge: {
          _getConfig: () => ({ enabled: false }),
          getStatus: () => ({ runtimeState: 'disabled' }),
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'zhangyuesheng', displayName: 'ZhangYueSheng', targetType: 'user' }
            : null)
        }
      }
    })

    await expect(tools.im_list_targets.handler()).rejects.toThrow(
      '当前会话已绑定企业微信联系人「ZhangYueSheng」，但该渠道当前不可用'
    )
  })

  it('dynamically re-resolves builtin IM providers after a channel is re-enabled', async () => {
    let feishuEnabled = false
    const feishuTargets = [{
      id: 'oc_group_a',
      openId: 'oc_group_a',
      displayName: 'agent群A',
      targetType: 'chat',
      hasContextToken: true
    }]
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm({
      overrides: {
        feishuBridge: {
          _getConfig: () => ({ enabled: feishuEnabled }),
          getStatus: () => ({ runtimeState: feishuEnabled ? 'connected' : 'disabled' }),
          listSendableTargets: vi.fn(async () => feishuTargets)
        }
      }
    })

    const beforePayload = parseToolPayload(await tools.im_list_targets.handler())
    expect(beforePayload.channels.some(channel => channel.channel === 'feishu')).toBe(false)

    feishuEnabled = true

    const afterPayload = parseToolPayload(await tools.im_list_targets.handler())
    const feishuChannel = afterPayload.channels.find(channel => channel.channel === 'feishu')
    expect(feishuChannel).toMatchObject({
      channel: 'feishu',
      targetCount: 1
    })
    expect(feishuChannel.targets[0]).toMatchObject({
      targetKey: 'agent群A',
      displayName: 'agent群A',
      targetType: 'chat'
    })

    await tools.im_send.handler({
      channel: 'feishu',
      targetKey: 'agent群A',
      text: 'hello restored feishu'
    })
    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'feishu',
      targetId: 'oc_group_a',
      openId: 'oc_group_a',
      displayName: 'agent群A',
      text: 'hello restored feishu'
    }))
  })

  it('passes current session id through unified builtin IM sends', async () => {
    const {
      tools,
      dingtalkBridge,
      feishuBridge,
      enterpriseWeixinBridge
    } = await createOptionsWithBuiltinIm()

    const dingPayload = parseToolPayload(await tools.im_send.handler({
      channel: 'dingtalk',
      targetKey: '钉钉张三',
      text: 'hello ding'
    }))
    expect(dingtalkBridge.sendToTarget).toHaveBeenCalledWith({
      channel: 'dingtalk',
      targetId: 'staff-1',
      staffId: 'staff-1',
      targetType: 'user',
      displayName: '钉钉张三',
      text: 'hello ding',
      sessionId: 'chat-im-1'
    })
    expect(dingPayload.channel).toBe('dingtalk')

    await tools.im_send.handler({
      channel: 'feishu',
      targetId: 'ou_123',
      targetType: 'user',
      text: 'hello feishu'
    })
    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith({
      channel: 'feishu',
      targetId: 'ou_123',
      targetType: 'user',
      displayName: '飞书李四',
      openId: 'ou_123',
      text: 'hello feishu',
      sessionId: 'chat-im-1'
    })

    await tools.im_send.handler({
      channel: 'enterprise-weixin',
      userId: 'wecom-user-1',
      text: 'hello wecom'
    })
    expect(enterpriseWeixinBridge.sendToTarget).toHaveBeenCalledWith({
      channel: 'enterprise-weixin',
      targetId: 'wecom-user-1',
      targetType: 'user',
      displayName: '企微王五',
      text: 'hello wecom',
      userId: 'wecom-user-1',
      sessionId: 'chat-im-1'
    })
  })

  it('passes image paths through unified builtin IM sends', async () => {
    const {
      tools,
      feishuBridge
    } = await createOptionsWithBuiltinIm()
    const imagePath = createImageFile()

    await tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      imagePaths: [imagePath]
    })

    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith({
      channel: 'feishu',
      targetId: 'ou_123',
      targetType: 'user',
      displayName: '飞书李四',
      openId: 'ou_123',
      text: '',
      imagePaths: [imagePath],
      sessionId: 'chat-im-1'
    })
  })

  it('passes document file paths through unified builtin IM sends', async () => {
    const {
      tools,
      dingtalkBridge,
      feishuBridge,
      enterpriseWeixinBridge
    } = await createOptionsWithBuiltinIm()
    const pdfPath = createDocumentFile('report.pdf')
    const docxPath = createDocumentFile('summary.docx')
    const pptxPath = createDocumentFile('slides.pptx')

    await tools.im_send.handler({
      channel: 'dingtalk',
      targetKey: '钉钉张三',
      filePaths: [pdfPath]
    })
    expect(dingtalkBridge.sendToTarget).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'dingtalk',
      targetId: 'staff-1',
      filePaths: [pdfPath],
      text: ''
    }))

    await tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      text: '请查收文档',
      filePaths: [docxPath]
    })
    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'feishu',
      targetId: 'ou_123',
      openId: 'ou_123',
      filePaths: [docxPath],
      text: '请查收文档'
    }))

    await tools.im_send.handler({
      channel: 'enterprise-weixin',
      targetKey: '企微王五',
      filePaths: [pptxPath]
    })
    expect(enterpriseWeixinBridge.sendToTarget).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'enterprise-weixin',
      targetId: 'wecom-user-1',
      userId: 'wecom-user-1',
      filePaths: [pptxPath],
      text: ''
    }))
  })

  it('accepts POSIX absolute image paths for builtin IM sends', async () => {
    const {
      tools,
      feishuBridge
    } = await createOptionsWithBuiltinIm()
    const posixImagePath = path.posix.join('/tmp', `hydro-im-${Date.now()}.png`)
    fs.mkdirSync(path.dirname(posixImagePath), { recursive: true })
    fs.writeFileSync(posixImagePath, Buffer.from('fake-image'))

    await tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      imagePaths: [posixImagePath]
    })

    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith(expect.objectContaining({
      imagePaths: [posixImagePath]
    }))

    fs.rmSync(posixImagePath, { force: true })
  })

  it('accepts POSIX absolute document file paths for builtin IM sends', async () => {
    const {
      tools,
      feishuBridge
    } = await createOptionsWithBuiltinIm()
    const posixDocumentPath = path.posix.join('/tmp', `hydro-im-${Date.now()}.pdf`)
    fs.mkdirSync(path.dirname(posixDocumentPath), { recursive: true })
    fs.writeFileSync(posixDocumentPath, Buffer.from('fake-pdf'))

    await tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      filePaths: [posixDocumentPath]
    })

    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith(expect.objectContaining({
      filePaths: [posixDocumentPath]
    }))

    fs.rmSync(posixDocumentPath, { force: true })
  })

  it('rejects im_send when text, imagePaths and filePaths are all empty', async () => {
    const { tools } = await createOptionsWithBuiltinIm()

    await expect(tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四'
    })).rejects.toThrow('text、imagePaths 与 filePaths 不能同时为空')
  })

  it('rejects relative image paths for builtin IM sends', async () => {
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm()

    await expect(tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      imagePaths: ['cover.png']
    })).rejects.toThrow('图片路径必须是本地绝对路径')

    expect(feishuBridge.sendToTarget).not.toHaveBeenCalled()
  })

  it('rejects non-image local files for builtin IM sends', async () => {
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm()
    const filePath = path.join(tempDir, 'notes.txt')
    fs.writeFileSync(filePath, 'hello')

    await expect(tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      imagePaths: [filePath]
    })).rejects.toThrow('图片路径必须是受支持的图片文件')

    expect(feishuBridge.sendToTarget).not.toHaveBeenCalled()
  })

  it('rejects relative document file paths for builtin IM sends', async () => {
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm()

    await expect(tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      filePaths: ['report.pdf']
    })).rejects.toThrow('文件路径必须是本地绝对路径')

    expect(feishuBridge.sendToTarget).not.toHaveBeenCalled()
  })

  it('rejects unsupported document file types for builtin IM sends', async () => {
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm()
    const filePath = path.join(tempDir, 'archive.zip')
    fs.writeFileSync(filePath, 'zip')

    await expect(tools.im_send.handler({
      channel: 'feishu',
      targetKey: '飞书李四',
      filePaths: [filePath]
    })).rejects.toThrow('暂不支持发送该文件类型')

    expect(feishuBridge.sendToTarget).not.toHaveBeenCalled()
  })

  it('uses bound target by default when im_send omits channel and target', async () => {
    const session = {
      id: 'chat-im-bound-1',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null)
        }
      },
      feishuTargets: [{
        id: 'oc_group_a',
        openId: 'oc_group_a',
        displayName: 'agent群A',
        targetType: 'chat',
        hasContextToken: true
      }]
    })

    await tools.im_send.handler({
      text: 'hello bound'
    })

    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith({
      channel: 'feishu',
      targetId: 'oc_group_a',
      targetType: 'chat',
      displayName: 'agent群A',
      openId: 'oc_group_a',
      text: 'hello bound',
      sessionId: 'chat-im-bound-1'
    })
  })

  it('uses bound target by default when sending only document file paths', async () => {
    const session = {
      id: 'chat-im-bound-file-1',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null)
        }
      },
      feishuTargets: [{
        id: 'oc_group_a',
        openId: 'oc_group_a',
        displayName: 'agent群A',
        targetType: 'chat',
        hasContextToken: true
      }]
    })
    const filePath = createDocumentFile('bound-report.xlsx')

    await tools.im_send.handler({
      filePaths: [filePath]
    })

    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith({
      channel: 'feishu',
      targetId: 'oc_group_a',
      targetType: 'chat',
      displayName: 'agent群A',
      openId: 'oc_group_a',
      text: '',
      filePaths: [filePath],
      sessionId: 'chat-im-bound-file-1'
    })
  })

  it('keeps Feishu persisted group bindings sending as chat targets after restore', async () => {
    const session = {
      id: 'chat-im-bound-restore-1',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null),
          sendToTarget: vi.fn(async input => ({
            success: true,
            messageId: 'feishu-msg-restored-group',
            targetId: input.targetId || input.openId
          }))
        }
      },
      feishuTargets: []
    })

    await tools.im_send.handler({
      text: 'hello restored bound group'
    })

    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith({
      channel: 'feishu',
      targetId: 'oc_group_a',
      targetType: 'chat',
      displayName: 'agent群A',
      openId: 'oc_group_a',
      text: 'hello restored bound group',
      sessionId: 'chat-im-bound-restore-1'
    })
  })

  it('accepts alias names for the currently bound target', async () => {
    const session = {
      id: 'chat-im-bound-2',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { tools, feishuBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null)
        }
      },
      feishuTargets: [{
        id: 'oc_group_a',
        openId: 'oc_group_a',
        displayName: 'agent群A',
        targetType: 'chat',
        hasContextToken: true
      }]
    })

    await tools.im_send.handler({
      channel: 'feishu',
      targetKey: 'agent群A',
      text: 'hello alias'
    })

    expect(feishuBridge.sendToTarget).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'oc_group_a',
      displayName: 'agent群A'
    }))
  })

  it('rejects switching a bound session to a different alias target', async () => {
    const session = {
      id: 'chat-im-bound-3',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { tools } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null)
        }
      },
      feishuTargets: [{
        id: 'oc_group_a',
        openId: 'oc_group_a',
        displayName: 'agent群A',
        targetType: 'chat',
        hasContextToken: true
      }, {
        id: 'oc_group_b',
        openId: 'oc_group_b',
        displayName: 'agent群B',
        targetType: 'chat',
        hasContextToken: true
      }]
    })

    await expect(tools.im_send.handler({
      channel: 'feishu',
      targetKey: 'agent群B',
      text: 'hello drift'
    })).rejects.toThrow(/当前会话已绑定飞书联系人/)
  })

  it('rejects switching a bound session to a different channel even when that channel is available', async () => {
    const session = {
      id: 'chat-im-bound-cross-channel-1',
      source: 'manual',
      imChannel: 'feishu'
    }
    const { tools, dingtalkBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        feishuBridge: {
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'oc_group_a', displayName: 'agent群A', targetType: 'chat' }
            : null)
        }
      },
      feishuTargets: [{
        id: 'oc_group_a',
        openId: 'oc_group_a',
        displayName: 'agent群A',
        targetType: 'chat',
        hasContextToken: true
      }]
    })

    await expect(tools.im_send.handler({
      channel: 'dingtalk',
      targetKey: '钉钉张三',
      text: 'hello cross channel drift'
    })).rejects.toThrow(/当前会话已绑定feishu渠道，不能再发送到dingtalk/)

    expect(dingtalkBridge.sendToTarget).not.toHaveBeenCalled()
  })

  it('fails with bound-channel-unavailable instead of drifting to another explicit channel', async () => {
    const session = {
      id: 'chat-im-bound-cross-channel-disabled-1',
      source: 'manual',
      imChannel: 'enterprise-weixin'
    }
    const { tools, dingtalkBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        enterpriseWeixinBridge: {
          _getConfig: () => ({ enabled: false }),
          getStatus: () => ({ runtimeState: 'disabled' }),
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'zhangyuesheng', displayName: 'ZhangYueSheng', targetType: 'user' }
            : null)
        }
      }
    })

    await expect(tools.im_send.handler({
      channel: 'dingtalk',
      targetKey: '钉钉张三',
      text: 'hello cross channel while bound disabled'
    })).rejects.toThrow(/当前会话已绑定企业微信联系人「ZhangYueSheng」，但该渠道当前不可用/)

    expect(dingtalkBridge.sendToTarget).not.toHaveBeenCalled()
  })

  it('fails early with a bound-channel-unavailable error for a bound session', async () => {
    const session = {
      id: 'chat-im-bound-disabled-1',
      source: 'manual',
      imChannel: 'enterprise-weixin'
    }
    const { tools, enterpriseWeixinBridge } = await createOptionsWithBuiltinIm({
      session,
      overrides: {
        enterpriseWeixinBridge: {
          _getConfig: () => ({ enabled: false }),
          getStatus: () => ({ runtimeState: 'disabled' }),
          getBinding: vi.fn((sessionId) => sessionId === session.id
            ? { targetId: 'zhangyuesheng', displayName: 'ZhangYueSheng', targetType: 'user' }
            : null),
          sendToTarget: vi.fn(async () => ({ success: true, targetId: 'zhangyuesheng' }))
        }
      }
    })

    await expect(tools.im_send.handler({
      text: 'hello disabled bound'
    })).rejects.toThrow(/当前会话已绑定企业微信联系人「ZhangYueSheng」，但该渠道当前不可用/)

    expect(enterpriseWeixinBridge.sendToTarget).not.toHaveBeenCalled()
  })
})

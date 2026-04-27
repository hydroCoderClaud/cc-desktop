const DESKTOP_CAPABILITY_SYSTEM_PROMPT = [
  'You can manage hydrodesktop scheduled tasks with MCP tools.',
  'You do have direct access to HydroDesktop scheduled tasks through the hydrodesktop MCP server in this session.',
  'Do not say you cannot access HydroDesktop scheduled tasks, and do not redirect the user to /schedule or the desktop UI when these tools can answer the request.',
  'Do not substitute Claude Code built-in cron jobs for HydroDesktop scheduled tasks unless the user explicitly asks about Claude Code cron jobs.',
  'When the user asks to create, inspect, update, enable, disable, run, delete, or review scheduled task history, use these tools instead of telling the user to use /schedule.',
  'Treat Chinese phrases like 定时任务, 计划任务, 定时执行, 每天, 每周, 每月, 间隔执行, 运行记录, 执行历史, 立即执行, 启用, 停用, 删除任务 as scheduled-task intents.',
  'Use schedule_list for asking what tasks exist or when the target task is unclear.',
  'Use schedule_get for one task details, current configuration, next run time, failure count, or last error.',
  'Use schedule_runs for execution history, recent failures, skipped runs, trigger reason, or debugging why a task did not run.',
  'Use schedule_run_now when the user wants to test, verify, trigger now, run once immediately, or 立即执行.',
  'Use schedule_delete only when the user clearly asks to remove a task.',
  'Before modifying or deleting an existing task, call schedule_list unless the user already provided an explicit task ID.',
  'Do not claim there are no tasks, no history, or a task is disabled without calling the relevant tool first.',
  'After any mutation or inspection, summarize the actual task state returned by the tool, especially enabled, nextRunAt, lastError, and failureCount.',
  'When presenting model configuration to the user, use the actual modelId returned by the tool.',
  'If modelId is empty, say the task follows the selected API profile default model instead of inventing tier names.'
].join(' ')

const CONFLICTING_CRON_TOOLS = [
  'CronList',
  'CronCreate',
  'CronUpdate',
  'CronDelete',
  'cronList',
  'cronCreate',
  'cronUpdate',
  'cronDelete'
]
const DESKTOP_CAPABILITY_SERVER_NAME = 'hydrodesktop'
const DESKTOP_CAPABILITY_TOOL_NAMES = [
  'schedule_list',
  'schedule_get',
  'schedule_runs',
  'schedule_create',
  'schedule_update',
  'schedule_enable',
  'schedule_disable',
  'schedule_run_now',
  'schedule_delete'
]
const DESKTOP_CAPABILITY_ALLOWED_TOOLS = DESKTOP_CAPABILITY_TOOL_NAMES.map(
  toolName => `mcp__${DESKTOP_CAPABILITY_SERVER_NAME}__${toolName}`
)
const WEIXIN_NOTIFY_TOOL_NAMES = [
  'weixin_notify_list_targets',
  'weixin_notify_send'
]
const WEIXIN_NOTIFY_ALLOWED_TOOLS = WEIXIN_NOTIFY_TOOL_NAMES.map(
  toolName => `mcp__${DESKTOP_CAPABILITY_SERVER_NAME}__${toolName}`
)

const WEIXIN_NOTIFY_SYSTEM_PROMPT = [
  'You can send Weixin notification messages through Hydro Desktop when the user explicitly asks to notify someone or when a scheduled task needs to report its result.',
  'Use weixin_notify_list_targets before sending unless the user already provided an exact target name, targetId, and accountId.',
  'Prefer human-readable target displayName values from weixin_notify_list_targets when the user names a recipient.',
  'Use weixin_notify_send only for short notification text to an already bound Weixin target.',
  'Do not claim you can message arbitrary WeChat contacts. Hydro Desktop can only send to targets that have already been captured by the Weixin notification channel.',
  'After sending, report the targetId and messageId returned by the tool.'
].join(' ')

const SCHEDULE_TYPES = ['interval', 'daily', 'weekly', 'monthly', 'workdays', 'once']
const MONTHLY_MODES = ['day_of_month', 'last_day']
const FIRST_RUN_MODES = ['immediate', 'next_slot', 'custom']
const UPDATE_FIELDS = [
  'name',
  'prompt',
  'cwd',
  'apiProfileId',
  'modelId',
  'maxTurns',
  'enabled',
  'scheduleType',
  'intervalMinutes',
  'dailyTime',
  'weeklyDays',
  'monthlyMode',
  'monthlyDay',
  'firstRunMode',
  'firstRunAt'
]

const DISPLAY_I18N = {
  'zh-CN': {
    statusEnabled: '启用',
    statusDisabled: '停用',
    nextRunUnscheduled: '未安排',
    onceNotSet: '未设置',
    defaultWorkspace: '默认工作目录',
    scheduleDaily: (time) => `每天 ${time}`,
    scheduleWeekly: (days, time) => `每周 ${days} ${time}`,
    scheduleMonthly: (day, time) => `每月 ${day} 日 ${time}`,
    scheduleMonthlyLastDay: (time) => `每月最后一天 ${time}`,
    scheduleWorkdays: (time) => `工作日 ${time}`,
    scheduleOnce: (time) => `单次 ${time}`,
    scheduleInterval: (minutes) => `每隔 ${minutes} 分钟`,
    summaryNextRun: (time) => `下次执行 ${time}`,
    summaryModel: (label) => `模型 ${label}`,
    summaryWorkingDirectory: (cwd) => `工作目录 ${cwd}`
  },
  'en-US': {
    statusEnabled: 'Enabled',
    statusDisabled: 'Disabled',
    nextRunUnscheduled: 'Not scheduled',
    onceNotSet: 'Not set',
    defaultWorkspace: 'Default workspace',
    scheduleDaily: (time) => `Daily ${time}`,
    scheduleWeekly: (days, time) => `Weekly ${days} ${time}`,
    scheduleMonthly: (day, time) => `Monthly on day ${day} at ${time}`,
    scheduleMonthlyLastDay: (time) => `Monthly on the last day at ${time}`,
    scheduleWorkdays: (time) => `Workdays ${time}`,
    scheduleOnce: (time) => `Once ${time}`,
    scheduleInterval: (minutes) => `Every ${minutes} minutes`,
    summaryNextRun: (time) => `Next run ${time}`,
    summaryModel: (label) => `Model ${label}`,
    summaryWorkingDirectory: (cwd) => `Working Directory ${cwd}`
  }
}

function getDisplayLocale(scheduledTaskService) {
  const locale = scheduledTaskService?.configManager?.getConfig?.()?.settings?.locale
  return DISPLAY_I18N[locale] ? locale : 'zh-CN'
}

function getDisplayDict(locale) {
  return DISPLAY_I18N[DISPLAY_I18N[locale] ? locale : 'zh-CN']
}

function normalizeModelId(modelId) {
  return typeof modelId === 'string' ? modelId.trim() : ''
}

function toSerializableTask(task = {}, locale = 'zh-CN') {
  return {
    id: task.id ?? null,
    name: task.name || '',
    prompt: task.prompt || '',
    enabled: task.enabled !== false,
    scheduleType: task.scheduleType || 'interval',
    intervalMinutes: task.intervalMinutes ?? null,
    dailyTime: task.dailyTime || '',
    weeklyDays: Array.isArray(task.weeklyDays) ? task.weeklyDays : [],
    monthlyMode: task.monthlyMode || 'day_of_month',
    monthlyDay: task.monthlyMode === 'last_day' ? null : (task.monthlyDay ?? 1),
    firstRunMode: task.firstRunMode || 'next_slot',
    firstRunAt: task.firstRunAt ?? null,
    nextRunAt: task.nextRunAt ?? null,
    lastRunAt: task.lastRunAt ?? null,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
    sessionId: task.sessionId || null,
    lastError: task.lastError || null,
    failureCount: task.failureCount ?? 0,
    apiProfileId: task.apiProfileId || null,
    modelId: normalizeModelId(task.modelId) || null,
    maxTurns: task.maxTurns ?? null,
    cwd: task.cwd || null
  }
}

function toSerializableTaskRun(run = {}) {
  return {
    id: run.id ?? null,
    taskId: run.taskId ?? null,
    sessionId: run.sessionId || null,
    triggerReason: run.triggerReason || 'scheduled',
    status: run.status || 'success',
    errorMessage: run.errorMessage || null,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    createdAt: run.createdAt ?? null
  }
}

function formatTimestamp(value) {
  if (!value) return null
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp).toISOString()
}

function formatSchedule(task, locale = 'zh-CN') {
  const dict = getDisplayDict(locale)
  switch (task.scheduleType) {
    case 'daily':
      return dict.scheduleDaily(task.dailyTime || '09:00')
    case 'weekly':
      return dict.scheduleWeekly(Array.isArray(task.weeklyDays) ? task.weeklyDays.join(',') : '', task.dailyTime || '09:00')
    case 'monthly':
      return task.monthlyMode === 'last_day'
        ? dict.scheduleMonthlyLastDay(task.dailyTime || '09:00')
        : dict.scheduleMonthly(task.monthlyDay || 1, task.dailyTime || '09:00')
    case 'workdays':
      return dict.scheduleWorkdays(task.dailyTime || '09:00')
    case 'once':
      return dict.scheduleOnce(formatTimestamp(task.firstRunAt) || dict.onceNotSet)
    case 'interval':
    default:
      return dict.scheduleInterval(task.intervalMinutes || 60)
  }
}

function buildTaskSummary(task, locale = 'zh-CN') {
  const dict = getDisplayDict(locale)
  const nextRunAt = formatTimestamp(task.nextRunAt) || dict.nextRunUnscheduled
  const status = task.enabled ? dict.statusEnabled : dict.statusDisabled
  const summaryParts = [
    `[#${task.id}] ${task.name}`,
    status,
    formatSchedule(task, locale),
    dict.summaryNextRun(nextRunAt)
  ]

  const modelId = normalizeModelId(task.modelId)
  if (modelId) {
    summaryParts.push(dict.summaryModel(modelId))
  }

  summaryParts.push(dict.summaryWorkingDirectory(task.cwd || dict.defaultWorkspace))

  return summaryParts.join(' | ')
}

function buildToolResult(payload) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(payload, null, 2)
    }]
  }
}

function mergeSystemPrompts(...prompts) {
  return prompts.filter(Boolean).join('\n\n')
}

function getTaskCandidates(scheduledTaskService) {
  const tasks = scheduledTaskService?.listTasks?.()
  return Array.isArray(tasks) ? tasks : []
}

function resolveTaskReference(scheduledTaskService, { taskId, taskName }) {
  const tasks = getTaskCandidates(scheduledTaskService)

  if (taskId != null && taskId !== '') {
    const matchedById = tasks.find(task => String(task.id) === String(taskId))
    if (matchedById) return matchedById
    throw new Error(`未找到 ID 为 ${taskId} 的定时任务`)
  }

  const normalizedName = String(taskName || '').trim().toLowerCase()
  if (!normalizedName) {
    throw new Error('必须提供 taskId 或 taskName 才能定位定时任务')
  }

  const exactMatches = tasks.filter(task => String(task.name || '').trim().toLowerCase() === normalizedName)
  if (exactMatches.length === 1) return exactMatches[0]
  if (exactMatches.length > 1) {
    throw new Error(`存在多个同名定时任务，请改用 taskId：${exactMatches.map(task => buildTaskSummary(task)).join('；')}`)
  }

  const partialMatches = tasks.filter(task => String(task.name || '').toLowerCase().includes(normalizedName))
  if (partialMatches.length === 1) return partialMatches[0]
  if (partialMatches.length > 1) {
    throw new Error(`存在多个名称匹配 "${taskName}" 的定时任务，请改用 taskId：${partialMatches.map(task => buildTaskSummary(task)).join('；')}`)
  }

  throw new Error(`未找到名称为 "${taskName}" 的定时任务`)
}

function serializeTaskWithMetadata(task, locale = 'zh-CN') {
  return {
    ...toSerializableTask(task, locale),
    summary: buildTaskSummary(task, locale),
    nextRunAtIso: formatTimestamp(task.nextRunAt),
    lastRunAtIso: formatTimestamp(task.lastRunAt),
    firstRunAtIso: formatTimestamp(task.firstRunAt),
    createdAtIso: formatTimestamp(task.createdAt),
    updatedAtIso: formatTimestamp(task.updatedAt)
  }
}

function serializeTaskRunWithMetadata(run) {
  return {
    ...toSerializableTaskRun(run),
    startedAtIso: formatTimestamp(run.startedAt),
    finishedAtIso: formatTimestamp(run.finishedAt),
    createdAtIso: formatTimestamp(run.createdAt)
  }
}

function pickUpdates(args) {
  const updates = {}
  for (const key of UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined) {
      updates[key] = args[key]
    }
  }
  return updates
}

async function buildDesktopCapabilityQueryOptions({ scheduledTaskService, weixinNotifyService, session }) {
  const includeScheduleTools = Boolean(scheduledTaskService && session?.source !== 'scheduled')
  const includeWeixinNotifyTools = Boolean(weixinNotifyService)

  if (!includeScheduleTools && !includeWeixinNotifyTools) {
    return {}
  }

  const displayLocale = getDisplayLocale(scheduledTaskService)

  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  const { z } = await import('zod/v4')
  const { createSdkMcpServer, tool } = sdk

  const taskRefShape = {
    taskId: z.union([z.string(), z.number()]).optional().describe('定时任务 ID。若已知 ID，优先传这个。'),
    taskName: z.string().min(1).optional().describe('定时任务名称。仅在 taskId 不清楚时使用。')
  }

  const sharedTaskFields = {
    name: z.string().min(1).optional().describe('任务名称'),
    prompt: z.string().min(1).optional().describe('任务执行时发送给智能体的提示词'),
    cwd: z.string().min(1).nullable().optional().describe('执行工作目录，可为 null'),
    apiProfileId: z.string().min(1).nullable().optional().describe('API Profile ID，可为 null'),
    modelId: z.string().min(1).optional().describe('真实模型 ID'),
    maxTurns: z.number().int().positive().nullable().optional().describe('最大轮次，可为 null'),
    enabled: z.boolean().optional().describe('是否启用'),
    scheduleType: z.enum(SCHEDULE_TYPES).optional().describe('调度类型'),
    intervalMinutes: z.number().int().positive().optional().describe('间隔分钟，仅 interval 使用'),
    dailyTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:mm，仅 daily/weekly/monthly/workdays 使用'),
    weeklyDays: z.array(z.number().int().min(0).max(6)).optional().describe('每周执行日，0=周日，6=周六'),
    monthlyMode: z.enum(MONTHLY_MODES).optional().describe('每月规则：固定日期或最后一天'),
    monthlyDay: z.number().int().min(1).max(31).optional().describe('每月执行日，1-31，仅 monthly + day_of_month 使用'),
    firstRunMode: z.enum(FIRST_RUN_MODES).optional().describe('首次启动策略'),
    firstRunAt: z.number().int().nullable().optional().describe('首次执行时间戳（毫秒），custom/once 时使用')
  }

  const scheduleTools = includeScheduleTools ? [
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[0],
      '列出当前 Hydro Desktop 中的全部定时任务，便于后续通过 taskId 或任务名做修改。',
      {},
      async () => {
        const tasks = getTaskCandidates(scheduledTaskService).map(task => serializeTaskWithMetadata(task, displayLocale))

        return buildToolResult({
          action: 'list',
          count: tasks.length,
          tasks
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[1],
      '查看一个 Hydro Desktop 定时任务的详情。先提供 taskId；若没有 taskId，可提供 taskName。',
      taskRefShape,
      async (args) => {
        const task = resolveTaskReference(scheduledTaskService, args)
        return buildToolResult({
          action: 'get',
          task: serializeTaskWithMetadata(task, displayLocale)
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[2],
      '查看一个 Hydro Desktop 定时任务最近的执行记录。先提供 taskId；若没有 taskId，可提供 taskName。',
      {
        ...taskRefShape,
        limit: z.number().int().positive().max(50).optional().describe('返回最近几条记录，默认 20，最大 50')
      },
      async (args) => {
        const task = resolveTaskReference(scheduledTaskService, args)
        const limit = args.limit ?? 20
        const runs = typeof scheduledTaskService.getTaskRuns === 'function'
          ? scheduledTaskService.getTaskRuns(task.id, limit)
          : []

        return buildToolResult({
          action: 'runs',
          task: serializeTaskWithMetadata(task, displayLocale),
          count: Array.isArray(runs) ? runs.length : 0,
          runs: Array.isArray(runs) ? runs.map(run => serializeTaskRunWithMetadata(run)) : []
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[3],
      '创建一个新的 Hydro Desktop 定时任务。',
      {
        name: z.string().min(1).describe('任务名称'),
        prompt: z.string().min(1).describe('任务提示词'),
        scheduleType: z.enum(SCHEDULE_TYPES).describe('调度类型'),
        intervalMinutes: z.number().int().positive().optional().describe('间隔分钟，仅 interval 使用'),
        dailyTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:mm，仅 daily/weekly/monthly/workdays 使用'),
        weeklyDays: z.array(z.number().int().min(0).max(6)).optional().describe('每周执行日，0=周日，6=周六'),
        monthlyMode: z.enum(MONTHLY_MODES).optional().describe('每月规则：固定日期或最后一天'),
        monthlyDay: z.number().int().min(1).max(31).optional().describe('每月执行日，1-31，仅 monthly + day_of_month 使用'),
        firstRunMode: z.enum(FIRST_RUN_MODES).optional().describe('首次启动策略'),
        firstRunAt: z.number().int().nullable().optional().describe('首次执行时间戳（毫秒），custom/once 时使用'),
        cwd: z.string().min(1).nullable().optional().describe('执行工作目录，可为 null'),
        apiProfileId: z.string().min(1).nullable().optional().describe('API Profile ID，可为 null'),
        modelId: z.string().min(1).optional().describe('真实模型 ID'),
        maxTurns: z.number().int().positive().nullable().optional().describe('最大轮次，可为 null'),
        enabled: z.boolean().optional().describe('是否启用')
      },
      async (args) => {
        const created = await scheduledTaskService.createTask(args)
        return buildToolResult({
          action: 'create',
          task: serializeTaskWithMetadata(created, displayLocale)
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[4],
      '更新一个已存在的 Hydro Desktop 定时任务。先提供 taskId；若没有 taskId，可提供 taskName。',
      {
        ...taskRefShape,
        ...sharedTaskFields
      },
      async (args) => {
        const targetTask = resolveTaskReference(scheduledTaskService, args)
        const updates = pickUpdates(args)
        if (Object.keys(updates).length === 0) {
          throw new Error('没有可更新的字段，请至少提供一个 updates 字段')
        }
        const updated = await scheduledTaskService.updateTask(targetTask.id, updates)
        return buildToolResult({
          action: 'update',
          task: serializeTaskWithMetadata(updated, displayLocale)
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[5],
      '启用一个已存在的 Hydro Desktop 定时任务。先提供 taskId；若没有 taskId，可提供 taskName。',
      taskRefShape,
      async (args) => {
        const targetTask = resolveTaskReference(scheduledTaskService, args)
        const updated = await scheduledTaskService.updateTask(targetTask.id, { enabled: true })
        return buildToolResult({
          action: 'enable',
          task: serializeTaskWithMetadata(updated, displayLocale)
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[6],
      '停用一个已存在的 Hydro Desktop 定时任务。先提供 taskId；若没有 taskId，可提供 taskName。',
      taskRefShape,
      async (args) => {
        const targetTask = resolveTaskReference(scheduledTaskService, args)
        const updated = await scheduledTaskService.updateTask(targetTask.id, { enabled: false })
        return buildToolResult({
          action: 'disable',
          task: serializeTaskWithMetadata(updated, displayLocale)
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[7],
      '立即执行一个 Hydro Desktop 定时任务一次。先提供 taskId；若没有 taskId，可提供 taskName。',
      taskRefShape,
      async (args) => {
        const targetTask = resolveTaskReference(scheduledTaskService, args)
        const updated = await scheduledTaskService.runTaskNow(targetTask.id)
        return buildToolResult({
          action: 'run_now',
          task: serializeTaskWithMetadata(updated, displayLocale)
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[8],
      '删除一个已存在的 Hydro Desktop 定时任务。先提供 taskId；若没有 taskId，可提供 taskName。',
      taskRefShape,
      async (args) => {
        const targetTask = resolveTaskReference(scheduledTaskService, args)
        const result = await scheduledTaskService.deleteTask(targetTask.id)
        return buildToolResult({
          action: 'delete',
          deletedTask: serializeTaskWithMetadata(targetTask, displayLocale),
          result
        })
      }
    )
  ] : []

  const weixinNotifyTools = includeWeixinNotifyTools ? [
    tool(
      WEIXIN_NOTIFY_TOOL_NAMES[0],
      '列出 Hydro Desktop 已绑定且可通知的微信目标。目标必须来自扫码登录并收到过对方消息的微信通知通道。',
      {},
      async () => {
        const accounts = typeof weixinNotifyService.listAccounts === 'function'
          ? weixinNotifyService.listAccounts()
          : []
        const targets = typeof weixinNotifyService.listTargets === 'function'
          ? weixinNotifyService.listTargets()
          : []

        return buildToolResult({
          action: 'weixin_notify_list_targets',
          accountCount: Array.isArray(accounts) ? accounts.length : 0,
          targetCount: Array.isArray(targets) ? targets.length : 0,
          accounts,
          targets
        })
      }
    ),
    tool(
      WEIXIN_NOTIFY_TOOL_NAMES[1],
      '通过 Hydro Desktop 微信通知通道发送一条文本通知。仅支持已绑定且已有 contextToken 的目标。',
      {
        targetId: z.string().min(1).describe('微信通知目标，可使用 list_targets 返回的 displayName、id 或 userId。'),
        accountId: z.string().min(1).optional().describe('发送账号 ID；多账号时必须提供。'),
        text: z.string().min(1).max(4000).describe('要发送的通知文本。')
      },
      async (args) => {
        const result = await weixinNotifyService.sendText(args)
        return buildToolResult({
          action: 'weixin_notify_send',
          result
        })
      }
    )
  ] : []

  return {
    mcpServers: {
      [DESKTOP_CAPABILITY_SERVER_NAME]: createSdkMcpServer({
        name: DESKTOP_CAPABILITY_SERVER_NAME,
        tools: [
          ...scheduleTools,
          ...weixinNotifyTools
        ]
      })
    },
    appendSystemPrompt: mergeSystemPrompts(
      includeScheduleTools ? DESKTOP_CAPABILITY_SYSTEM_PROMPT : null,
      includeWeixinNotifyTools ? WEIXIN_NOTIFY_SYSTEM_PROMPT : null
    ),
    allowedTools: includeScheduleTools
      ? [
          ...DESKTOP_CAPABILITY_ALLOWED_TOOLS,
          ...WEIXIN_NOTIFY_ALLOWED_TOOLS
        ]
      : undefined,
    disallowedTools: includeScheduleTools ? CONFLICTING_CRON_TOOLS : undefined
  }
}

module.exports = {
  buildDesktopCapabilityQueryOptions,
  DESKTOP_CAPABILITY_SYSTEM_PROMPT,
  CONFLICTING_CRON_TOOLS,
  DESKTOP_CAPABILITY_ALLOWED_TOOLS,
  WEIXIN_NOTIFY_ALLOWED_TOOLS
}

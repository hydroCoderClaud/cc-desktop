const DESKTOP_CAPABILITY_SYSTEM_PROMPT = [
  'You can manage cc-desktop scheduled tasks with MCP tools.',
  'When the user asks to create, inspect, update, enable, or disable scheduled tasks, use these tools instead of telling the user to use /schedule.',
  'Before modifying an existing task, call the list tool unless the user already provided an explicit task ID.',
  'After any mutation, summarize the actual task state returned by the tool, especially enabled and nextRunAt.'
].join(' ')

const CONFLICTING_CRON_TOOLS = [
  'CronList',
  'CronCreate',
  'CronUpdate',
  'CronDelete'
]
const DESKTOP_CAPABILITY_SERVER_NAME = 'cc-desktop'
const DESKTOP_CAPABILITY_TOOL_NAMES = [
  'cc_desktop_schedule_list',
  'cc_desktop_schedule_create',
  'cc_desktop_schedule_update',
  'cc_desktop_schedule_enable',
  'cc_desktop_schedule_disable'
]
const DESKTOP_CAPABILITY_ALLOWED_TOOLS = DESKTOP_CAPABILITY_TOOL_NAMES.map(
  toolName => `mcp__${DESKTOP_CAPABILITY_SERVER_NAME}__${toolName}`
)

const SCHEDULE_TYPES = ['interval', 'daily', 'weekly', 'workdays', 'once']
const FIRST_RUN_MODES = ['immediate', 'next_slot', 'custom']
const MODEL_TIERS = ['haiku', 'sonnet', 'opus']
const UPDATE_FIELDS = [
  'name',
  'prompt',
  'cwd',
  'apiProfileId',
  'modelTier',
  'maxTurns',
  'enabled',
  'scheduleType',
  'intervalMinutes',
  'dailyTime',
  'weeklyDays',
  'firstRunMode',
  'firstRunAt'
]

function toSerializableTask(task = {}) {
  return {
    id: task.id ?? null,
    name: task.name || '',
    prompt: task.prompt || '',
    enabled: task.enabled !== false,
    scheduleType: task.scheduleType || 'interval',
    intervalMinutes: task.intervalMinutes ?? null,
    dailyTime: task.dailyTime || '',
    weeklyDays: Array.isArray(task.weeklyDays) ? task.weeklyDays : [],
    firstRunMode: task.firstRunMode || 'next_slot',
    firstRunAt: task.firstRunAt ?? null,
    nextRunAt: task.nextRunAt ?? null,
    lastRunAt: task.lastRunAt ?? null,
    apiProfileId: task.apiProfileId || null,
    modelTier: task.modelTier || null,
    maxTurns: task.maxTurns ?? null,
    cwd: task.cwd || null
  }
}

function formatTimestamp(value) {
  if (!value) return null
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp).toISOString()
}

function formatSchedule(task) {
  switch (task.scheduleType) {
    case 'daily':
      return `每天 ${task.dailyTime || '09:00'}`
    case 'weekly':
      return `每周 ${Array.isArray(task.weeklyDays) ? task.weeklyDays.join(',') : ''} ${task.dailyTime || '09:00'}`
    case 'workdays':
      return `工作日 ${task.dailyTime || '09:00'}`
    case 'once':
      return `单次 ${formatTimestamp(task.firstRunAt) || '未设置'}`
    case 'interval':
    default:
      return `每隔 ${task.intervalMinutes || 60} 分钟`
  }
}

function buildTaskSummary(task) {
  const nextRunAt = formatTimestamp(task.nextRunAt) || '未安排'
  const status = task.enabled ? '启用' : '停用'
  return `[#${task.id}] ${task.name} | ${status} | ${formatSchedule(task)} | 下次执行 ${nextRunAt}`
}

function buildToolResult(payload) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(payload, null, 2)
    }]
  }
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

function pickUpdates(args) {
  const updates = {}
  for (const key of UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined) {
      updates[key] = args[key]
    }
  }
  return updates
}

async function buildDesktopCapabilityQueryOptions({ scheduledTaskService, session }) {
  if (!scheduledTaskService || session?.source === 'scheduled') {
    return {}
  }

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
    modelTier: z.enum(MODEL_TIERS).optional().describe('模型档位'),
    maxTurns: z.number().int().positive().nullable().optional().describe('最大轮次，可为 null'),
    enabled: z.boolean().optional().describe('是否启用'),
    scheduleType: z.enum(SCHEDULE_TYPES).optional().describe('调度类型'),
    intervalMinutes: z.number().int().positive().optional().describe('间隔分钟，仅 interval 使用'),
    dailyTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:mm，仅 daily/weekly/workdays 使用'),
    weeklyDays: z.array(z.number().int().min(0).max(6)).optional().describe('每周执行日，0=周日，6=周六'),
    firstRunMode: z.enum(FIRST_RUN_MODES).optional().describe('首次启动策略'),
    firstRunAt: z.number().int().nullable().optional().describe('首次执行时间戳（毫秒），custom/once 时使用')
  }

  const scheduleTools = [
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[0],
      '列出当前 cc-desktop 中的全部定时任务，便于后续通过 taskId 或任务名做修改。',
      {},
      async () => {
        const tasks = getTaskCandidates(scheduledTaskService).map(task => {
          const serialized = toSerializableTask(task)
          return {
            ...serialized,
            summary: buildTaskSummary(task),
            nextRunAtIso: formatTimestamp(task.nextRunAt),
            lastRunAtIso: formatTimestamp(task.lastRunAt),
            firstRunAtIso: formatTimestamp(task.firstRunAt)
          }
        })

        return buildToolResult({
          action: 'list',
          count: tasks.length,
          tasks
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[1],
      '创建一个新的 cc-desktop 定时任务。',
      {
        name: z.string().min(1).describe('任务名称'),
        prompt: z.string().min(1).describe('任务提示词'),
        scheduleType: z.enum(SCHEDULE_TYPES).describe('调度类型'),
        intervalMinutes: z.number().int().positive().optional().describe('间隔分钟，仅 interval 使用'),
        dailyTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('HH:mm，仅 daily/weekly/workdays 使用'),
        weeklyDays: z.array(z.number().int().min(0).max(6)).optional().describe('每周执行日，0=周日，6=周六'),
        firstRunMode: z.enum(FIRST_RUN_MODES).optional().describe('首次启动策略'),
        firstRunAt: z.number().int().nullable().optional().describe('首次执行时间戳（毫秒），custom/once 时使用'),
        cwd: z.string().min(1).nullable().optional().describe('执行工作目录，可为 null'),
        apiProfileId: z.string().min(1).nullable().optional().describe('API Profile ID，可为 null'),
        modelTier: z.enum(MODEL_TIERS).optional().describe('模型档位'),
        maxTurns: z.number().int().positive().nullable().optional().describe('最大轮次，可为 null'),
        enabled: z.boolean().optional().describe('是否启用')
      },
      async (args) => {
        const created = await scheduledTaskService.createTask(args)
        return buildToolResult({
          action: 'create',
          task: {
            ...toSerializableTask(created),
            summary: buildTaskSummary(created),
            nextRunAtIso: formatTimestamp(created.nextRunAt),
            lastRunAtIso: formatTimestamp(created.lastRunAt),
            firstRunAtIso: formatTimestamp(created.firstRunAt)
          }
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[2],
      '更新一个已存在的 cc-desktop 定时任务。先提供 taskId；若没有 taskId，可提供 taskName。',
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
          task: {
            ...toSerializableTask(updated),
            summary: buildTaskSummary(updated),
            nextRunAtIso: formatTimestamp(updated.nextRunAt),
            lastRunAtIso: formatTimestamp(updated.lastRunAt),
            firstRunAtIso: formatTimestamp(updated.firstRunAt)
          }
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[3],
      '启用一个已存在的 cc-desktop 定时任务。先提供 taskId；若没有 taskId，可提供 taskName。',
      taskRefShape,
      async (args) => {
        const targetTask = resolveTaskReference(scheduledTaskService, args)
        const updated = await scheduledTaskService.updateTask(targetTask.id, { enabled: true })
        return buildToolResult({
          action: 'enable',
          task: {
            ...toSerializableTask(updated),
            summary: buildTaskSummary(updated),
            nextRunAtIso: formatTimestamp(updated.nextRunAt),
            lastRunAtIso: formatTimestamp(updated.lastRunAt),
            firstRunAtIso: formatTimestamp(updated.firstRunAt)
          }
        })
      }
    ),
    tool(
      DESKTOP_CAPABILITY_TOOL_NAMES[4],
      '停用一个已存在的 cc-desktop 定时任务。先提供 taskId；若没有 taskId，可提供 taskName。',
      taskRefShape,
      async (args) => {
        const targetTask = resolveTaskReference(scheduledTaskService, args)
        const updated = await scheduledTaskService.updateTask(targetTask.id, { enabled: false })
        return buildToolResult({
          action: 'disable',
          task: {
            ...toSerializableTask(updated),
            summary: buildTaskSummary(updated),
            nextRunAtIso: formatTimestamp(updated.nextRunAt),
            lastRunAtIso: formatTimestamp(updated.lastRunAt),
            firstRunAtIso: formatTimestamp(updated.firstRunAt)
          }
        })
      }
    )
  ]

  return {
    mcpServers: {
      [DESKTOP_CAPABILITY_SERVER_NAME]: createSdkMcpServer({
        name: DESKTOP_CAPABILITY_SERVER_NAME,
        tools: scheduleTools
      })
    },
    appendSystemPrompt: DESKTOP_CAPABILITY_SYSTEM_PROMPT,
    allowedTools: DESKTOP_CAPABILITY_ALLOWED_TOOLS,
    disallowedTools: CONFLICTING_CRON_TOOLS
  }
}

module.exports = {
  buildDesktopCapabilityQueryOptions,
  DESKTOP_CAPABILITY_SYSTEM_PROMPT,
  CONFLICTING_CRON_TOOLS,
  DESKTOP_CAPABILITY_ALLOWED_TOOLS
}

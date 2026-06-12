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
  'Scheduled tasks no longer own an independent model or API profile configuration; they reuse the currently bound session runtime.',
  'For normal chat-bound tasks or tasks using sessionBindingMode=new, a missing bound session will be recreated as a fresh default task session on the next run.',
  'For embedded-app tasks bound to the current session, the task follows that app\'s current session instead of reopening an old embedded session.',
  'If an embedded-app current-session task has no current app session to follow, the run will be skipped instead of falling back to a fresh default task session.',
  'When creating a scheduled task from the current chat session, default to binding the task to the current session.',
  'Only set sessionBindingMode to new when the user explicitly asks for a separate, independent, or background session.',
  'If the user does not explicitly request a separate session, omit sessionBindingMode or use current instead of new.'
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
const IM_BUILTIN_TOOL_NAMES = [
  'im_list_targets',
  'im_send',
  'im_unbind'
]
const IM_BUILTIN_ALLOWED_TOOLS = IM_BUILTIN_TOOL_NAMES.map(
  toolName => `mcp__${DESKTOP_CAPABILITY_SERVER_NAME}__${toolName}`
)
const PERSONAL_WEIXIN_ENABLED = false

const WEIXIN_NOTIFY_SYSTEM_PROMPT = [
  'You can send Weixin notification messages through Hydro Desktop when the user explicitly asks to notify someone or when a scheduled task needs to report its result.',
  'Use weixin_notify_list_targets before sending unless the user already provided an exact targetKey from a previous weixin_notify_list_targets response.',
  'Prefer human-readable target displayName values from weixin_notify_list_targets when the user names a recipient, but send with targetKey when it is available.',
  'If a recipient name matches multiple targets or no target, ask the user to clarify instead of guessing.',
  'Use weixin_notify_send only for short notification text to an already bound Weixin target.',
  'Do not claim you can message arbitrary WeChat contacts. Hydro Desktop can only send to Weixin users who completed iLink QR authorization and have a captured sendable target.',
  'After sending, report the recipient displayName and messageId returned by the tool.'
].join(' ')

const IM_BUILTIN_SYSTEM_PROMPT = [
  'You can send built-in IM messages through Hydro Desktop for enabled channels such as DingTalk, Feishu, and Enterprise Weixin when those channels are available in this session.',
  'If the current session is already bound to an IM target and the user did not ask to change recipient, call im_send directly and default to that bound target.',
  'If the user explicitly asks to解除绑定, 解绑, unbind, disconnect, or clear the current IM recipient for this session, call im_unbind.',
  'Use im_list_targets before sending only when the current session is not already bound to a target, or when the user explicitly wants to choose or change the recipient.',
  'Prefer the channel and targetKey returned by im_list_targets.',
  'If the recipient name matches multiple targets or no target, ask the user to clarify instead of guessing.',
  'Use im_send only for short text messages to already available built-in IM targets.',
  'Do not claim you can message arbitrary contacts. Only use enabled Hydro Desktop IM channels and targets actually returned by im_list_targets.',
  'After sending, report the channel, recipient displayName, and returned message identifier when available.'
].join(' ')

const DEFAULT_DAILY_TIME = '09:00'
const SCHEDULE_TYPES = ['interval', 'daily', 'weekly', 'monthly', 'workdays', 'once']
const MONTHLY_MODES = ['day_of_month', 'last_day']
const INTERVAL_ANCHOR_MODES = ['started_at', 'finished_at']
const SESSION_BINDING_MODES = ['current', 'new']
const UPDATE_FIELDS = [
  'name',
  'prompt',
  'cwd',
  'sessionBindingMode',
  'maxRuns',
  'resetCountOnEnable',
  'intervalAnchorMode',
  'enabled',
  'scheduleType',
  'intervalMinutes',
  'weeklyDays',
  'monthlyMode',
  'monthlyDay',
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
    summarySession: (sessionId) => `会话 ${sessionId}`,
    summaryDetachedSession: '未绑定会话',
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
    summarySession: (sessionId) => `Session ${sessionId}`,
    summaryDetachedSession: 'Detached session',
    summaryWorkingDirectory: (cwd) => `Working Directory ${cwd}`
  }
}

function getDisplayLocale(scheduledTaskService) {
  const locale = scheduledTaskService?.configManager?.getConfig?.()?.settings?.locale
  return DISPLAY_I18N[locale] ? locale : 'zh-CN'
}

function shouldAllowScheduleToolsForSession(scheduledTaskService) {
  return !!scheduledTaskService
}

function getDisplayDict(locale) {
  return DISPLAY_I18N[DISPLAY_I18N[locale] ? locale : 'zh-CN']
}

function buildRequiredStringSchema(z, description) {
  return z.union([z.string(), z.number()])
    .transform(value => String(value ?? '').trim())
    .refine(value => value.length > 0, { message: '不能为空' })
    .describe(description)
}

function parseClockTime(value) {
  const raw = String(value || '').trim()
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] == null ? 0 : Number(match[3])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null

  return { hours, minutes, seconds }
}

function padClock(value) {
  return String(value).padStart(2, '0')
}

function formatClockTimestamp(timestamp) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return DEFAULT_DAILY_TIME
  const hh = padClock(date.getHours())
  const mm = padClock(date.getMinutes())
  const ss = padClock(date.getSeconds())
  return date.getSeconds() > 0 ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`
}

function applyClockToTimestamp(baseTimestamp, clock) {
  const date = new Date(Number.isFinite(baseTimestamp) ? baseTimestamp : Date.now())
  date.setHours(clock.hours, clock.minutes, clock.seconds || 0, 0)
  return date.getTime()
}

function resolveExecutionAt(task = {}) {
  const explicit = Number(task.firstRunAt)
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.trunc(explicit)
  }

  if (task.scheduleType === 'interval') {
    for (const candidate of [task.nextRunAt, task.lastScheduledAt, task.lastStartedAt, task.lastRunAt, task.createdAt, task.updatedAt]) {
      const timestamp = Number(candidate)
      if (Number.isFinite(timestamp) && timestamp > 0) {
        return Math.trunc(timestamp)
      }
    }
    return null
  }

  if (task.scheduleType === 'once') {
    return null
  }

  const clock = parseClockTime(task.dailyTime)
  if (!clock) return null
  return applyClockToTimestamp(Number(task.createdAt) || Number(task.updatedAt) || Date.now(), clock)
}

function toSerializableTask(task = {}, locale = 'zh-CN') {
  const executionAt = resolveExecutionAt(task)
  return {
    id: task.id ?? null,
    name: task.name || '',
    prompt: task.prompt || '',
    enabled: task.enabled !== false,
    scheduleType: task.scheduleType || 'interval',
    intervalMinutes: task.intervalMinutes ?? null,
    weeklyDays: Array.isArray(task.weeklyDays) ? task.weeklyDays : [],
    monthlyMode: task.monthlyMode || 'day_of_month',
    monthlyDay: task.monthlyMode === 'last_day' ? null : (task.monthlyDay ?? 1),
    firstRunAt: executionAt,
    nextRunAt: task.nextRunAt ?? null,
    lastStartedAt: task.lastStartedAt ?? null,
    lastScheduledAt: task.lastScheduledAt ?? null,
    lastRunAt: task.lastRunAt ?? null,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
    sessionId: task.sessionId || null,
    runtimeState: sanitizeRuntimeState(task.runtimeState),
    lastError: task.lastError || null,
    failureCount: task.failureCount ?? 0,
    runCount: task.runCount ?? 0,
    sessionBindingMode: task.sessionBindingMode === 'current' ? 'current' : 'new',
    maxRuns: task.maxRuns ?? null,
    resetCountOnEnable: !!task.resetCountOnEnable,
    intervalAnchorMode: task.intervalAnchorMode || 'started_at',
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
    scheduledAt: run.scheduledAt ?? null,
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

function sanitizeRuntimeState(runtimeState) {
  if (!runtimeState || typeof runtimeState !== 'object') return null

  const next = { ...runtimeState }
  if (next._scheduler && typeof next._scheduler === 'object') {
    const schedulerState = { ...next._scheduler }
    delete schedulerState.resetSessionAfterRun
    delete schedulerState.reason
    if (Object.keys(schedulerState).length > 0) {
      next._scheduler = schedulerState
    } else {
      delete next._scheduler
    }
  }

  return Object.keys(next).length > 0 ? next : null
}

function formatSchedule(task, locale = 'zh-CN') {
  const dict = getDisplayDict(locale)
  const executionAt = resolveExecutionAt(task)
  const executionTime = executionAt ? formatClockTimestamp(executionAt) : DEFAULT_DAILY_TIME
  switch (task.scheduleType) {
    case 'daily':
      return dict.scheduleDaily(executionTime)
    case 'weekly':
      return dict.scheduleWeekly(Array.isArray(task.weeklyDays) ? task.weeklyDays.join(',') : '', executionTime)
    case 'monthly':
      return task.monthlyMode === 'last_day'
        ? dict.scheduleMonthlyLastDay(executionTime)
        : dict.scheduleMonthly(task.monthlyDay || 1, executionTime)
    case 'workdays':
      return dict.scheduleWorkdays(executionTime)
    case 'once':
      return dict.scheduleOnce(formatTimestamp(executionAt) || dict.onceNotSet)
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

  summaryParts.push(task.sessionId ? dict.summarySession(task.sessionId) : dict.summaryDetachedSession)
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

function countBy(items, getKey) {
  const counts = new Map()
  for (const item of items) {
    const key = String(getKey(item) || '').trim()
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function serializeWeixinTargetForTool(target, displayNameCounts = new Map()) {
  const displayName = target.displayName || target.userId || target.id
  const displayNameIsUnique = displayNameCounts.get(displayName) === 1
  const targetKey = displayNameIsUnique ? displayName : target.id
  return {
    id: target.id,
    targetKey,
    displayLabel: displayNameIsUnique
      ? displayName
      : `${displayName} (${target.accountId})`,
    accountId: target.accountId,
    accountUserId: target.accountUserId || null,
    userId: target.userId,
    displayName,
    targetSource: target.targetSource || null,
    isAuthorizedAccountUser: Boolean(target.isAuthorizedAccountUser),
    aliases: [
      targetKey,
      displayName,
      target.id,
      target.userId
    ].filter(Boolean),
    sendable: Boolean(target.hasContextToken),
    hasContextToken: Boolean(target.hasContextToken),
    lastSeenAt: target.lastSeenAt || null,
    lastSentAt: target.lastSentAt || null,
    lastInboundText: target.lastInboundText || '',
    contextExpiredAt: target.contextExpiredAt || null,
    lastError: target.lastError || null
  }
}

function serializeWeixinTargetsForTool(targets) {
  const targetList = Array.isArray(targets) ? targets : []
  const displayNameCounts = countBy(targetList, target => target.displayName || target.userId || target.id)
  return targetList.map(target => serializeWeixinTargetForTool(target, displayNameCounts))
}

function buildWeixinSendArgs(args = {}) {
  const sendArgs = {
    accountId: args.accountId || undefined,
    targetId: args.targetKey || args.targetId || args.displayName,
    text: args.text
  }
  if (args.sessionId) sendArgs.sessionId = args.sessionId
  return sendArgs
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
  const executionAt = resolveExecutionAt(task)
  return {
    ...toSerializableTask(task, locale),
    summary: buildTaskSummary(task, locale),
    nextRunAtIso: formatTimestamp(task.nextRunAt),
    lastStartedAtIso: formatTimestamp(task.lastStartedAt),
    lastScheduledAtIso: formatTimestamp(task.lastScheduledAt),
    lastRunAtIso: formatTimestamp(task.lastRunAt),
    firstRunAtIso: formatTimestamp(executionAt),
    createdAtIso: formatTimestamp(task.createdAt),
    updatedAtIso: formatTimestamp(task.updatedAt)
  }
}

function serializeTaskRunWithMetadata(run) {
  return {
    ...toSerializableTaskRun(run),
    scheduledAtIso: formatTimestamp(run.scheduledAt),
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

function buildClearableStringSchema(z, description) {
  return z.union([z.string(), z.null()]).optional().describe(description)
}

function buildPositiveIntegerLikeSchema(z, description, { max = null, nullable = false } = {}) {
  let numberSchema = z.number().int().positive()
  if (Number.isInteger(max)) {
    numberSchema = numberSchema.max(max)
  }

  let schema = z.union([
    numberSchema,
    z.string()
      .regex(/^\d+$/)
      .refine(value => !Number.isInteger(max) || Number(value) <= max),
    z.literal('')
  ])

  if (nullable) {
    schema = schema.nullable()
  }

  return schema.optional().describe(description)
}

function buildExecutionTimeSchema(z, description) {
  return z.union([z.number().int(), z.string(), z.null()]).optional().describe(description)
}

function normalizeImText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildImTargetKey(_channel, target = {}) {
  const rawId = target.id ?? target.targetId ?? target.userId ?? target.openId ?? target.staffId ?? ''
  const displayName = normalizeImText(target.displayName)
  return displayName || String(rawId || '').trim()
}

function isBridgeConfiguredEnabled(bridge) {
  if (!bridge) return false
  try {
    if (typeof bridge._getConfig === 'function') {
      return bridge._getConfig()?.enabled !== false
    }
  } catch {
    return false
  }
  return true
}

function normalizeImTargetType(target = {}) {
  const rawType = String(target.targetType || target.chatType || '').trim().toLowerCase()
  if (rawType === 'chat' || rawType === 'group') return 'chat'
  return 'user'
}

function buildHumanReadableTargetKey(channel, target = {}, duplicateIndex = 0, duplicateCount = 1) {
  const displayName = normalizeImText(target.displayName)
  const accountId = normalizeImText(target.accountId)
  const targetType = normalizeImTargetType(target)
  const baseLabel = displayName || normalizeImText(target.id ?? target.targetId ?? target.userId ?? target.openId ?? target.staffId ?? '') || '未命名目标'

  if (duplicateCount <= 1) {
    return baseLabel
  }

  if (accountId) {
    return `${baseLabel} (${accountId})`
  }

  const channelLabelMap = {
    dingtalk: targetType === 'chat' ? '钉钉群' : '钉钉联系人',
    feishu: targetType === 'chat' ? '飞书群' : '飞书联系人',
    'enterprise-weixin': targetType === 'chat' ? '企微群' : '企微联系人',
    weixin: '微信联系人',
  }
  const suffixLabel = channelLabelMap[channel] || (targetType === 'chat' ? '群聊' : '联系人')
  const order = duplicateIndex > 0 ? ` ${duplicateIndex + 1}` : ''
  return `${baseLabel} (${suffixLabel}${order})`
}

function buildImTargetEntries(channel, targets = []) {
  const normalizedTargets = Array.isArray(targets) ? targets : []
  const counts = new Map()
  for (const target of normalizedTargets) {
    const key = buildImTargetKey(channel, target)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const duplicateIndexes = new Map()
  const channelLabelMap = {
    dingtalk: '钉钉',
    feishu: '飞书',
    'enterprise-weixin': '企业微信',
    weixin: '微信',
  }

  return normalizedTargets.map((target) => {
    const rawId = normalizeImText(target.id ?? target.targetId ?? target.userId ?? target.openId ?? target.staffId ?? '')
    const displayName = normalizeImText(target.displayName)
    const accountId = normalizeImText(target.accountId)
    const baseKey = buildImTargetKey(channel, target)
    const duplicateIndex = duplicateIndexes.get(baseKey) || 0
    duplicateIndexes.set(baseKey, duplicateIndex + 1)
    const duplicateCount = counts.get(baseKey) || 1
    const targetKey = buildHumanReadableTargetKey(channel, target, duplicateIndex, duplicateCount)
    const targetType = normalizeImTargetType(target)

    return {
      channel,
      channelLabel: channelLabelMap[channel] || channel,
      rawTargetId: rawId,
      targetKey,
      displayName: displayName || rawId,
      displayLabel: targetKey,
      targetType,
      accountId: accountId || undefined,
      userId: target.userId || target.openId || target.staffId || rawId,
      sendable: target.hasContextToken !== false,
      hasContextToken: target.hasContextToken !== false,
      aliases: Array.from(new Set([
        targetKey,
        displayName,
        normalizeImText(target.name),
        normalizeImText(target.chatName),
        normalizeImText(target.nickname),
        normalizeImText(target.userId),
        normalizeImText(target.openId),
        normalizeImText(target.staffId),
        displayName,
        rawId,
      ].map(value => normalizeImText(value)).filter(Boolean)))
    }
  })
}

function toPublicImTarget(entry = {}) {
  return {
    channel: entry.channel,
    channelLabel: entry.channelLabel,
    targetKey: entry.targetKey,
    displayName: entry.displayName,
    displayLabel: entry.displayLabel,
    targetType: entry.targetType,
    sendable: entry.sendable,
    hasContextToken: entry.hasContextToken,
  }
}

function resolveImTargetEntry(entries = [], input = '') {
  const normalizedInput = normalizeImText(input)
  if (!normalizedInput) return null

  const matches = entries.filter(entry => Array.isArray(entry.aliases) && entry.aliases.includes(normalizedInput))
  if (matches.length === 0) {
    return null
  }
  if (matches.length === 1) {
    return matches[0]
  }

  const uniqueIds = Array.from(new Set(matches.map(entry => entry.rawTargetId).filter(Boolean)))
  if (uniqueIds.length === 1) {
    return matches[0]
  }

  const labels = matches.map(entry => entry.displayLabel || entry.displayName || entry.rawTargetId).filter(Boolean)
  throw new Error(`目标名称「${normalizedInput}」匹配到多个对象：${labels.join('、')}，请使用列表中的完整名称。`)
}

function resolveImSendArgs(args = {}) {
  const channel = typeof args.channel === 'string' ? args.channel.trim() : ''
  const targetType = typeof args.targetType === 'string' ? args.targetType.trim() : ''
  const targetId = typeof (args.targetKey || args.targetId || args.userId || args.openId || args.staffId || args.displayName || '') === 'string'
    ? String(args.targetKey || args.targetId || args.userId || args.openId || args.staffId || args.displayName || '').trim()
    : ''
  const sendArgs = {
    channel,
    text: typeof args.text === 'string' ? args.text : '',
  }
  if (targetId) sendArgs.targetId = targetId
  if (targetType) sendArgs.targetType = targetType
  if (typeof args.displayName === 'string' && args.displayName.trim()) sendArgs.displayName = args.displayName.trim()
  if (typeof args.accountId === 'string' && args.accountId.trim()) sendArgs.accountId = args.accountId.trim()
  if (typeof args.userId === 'string' && args.userId.trim()) sendArgs.userId = args.userId.trim()
  if (typeof args.openId === 'string' && args.openId.trim()) sendArgs.openId = args.openId.trim()
  if (typeof args.staffId === 'string' && args.staffId.trim()) sendArgs.staffId = args.staffId.trim()
  return sendArgs
}

function getBoundImTargetFromSession(session = {}, provider = null) {
  if (!session || typeof session !== 'object') return null
  const channel = normalizeImText(session.imChannel)
  if (!channel) return null

  if (provider?.getBinding && session.id) {
    const binding = provider.getBinding(session.id)
    if (binding && typeof binding === 'object') {
      return {
        channel,
        targetId: normalizeImText(binding.targetId || binding.staffId || binding.userId),
        targetType: normalizeImText(binding.targetType) || 'user',
        displayName: normalizeImText(binding.displayName),
        accountId: normalizeImText(binding.accountId),
      }
    }
  }

  const meta = session.meta && typeof session.meta === 'object' ? session.meta : {}
  if (channel === 'dingtalk') {
    const targetId = normalizeImText(meta.dingtalkTargetStaffId)
    if (!targetId) return null
    return {
      channel,
      targetId,
      targetType: meta.dingtalkTargetType === 'chat' ? 'chat' : 'user',
      displayName: normalizeImText(meta.senderNick),
    }
  }
  if (channel === 'weixin') {
    const accountId = normalizeImText(meta.accountId)
    const targetId = normalizeImText(meta.targetId)
    if (!accountId || !targetId) return null
    return {
      channel,
      accountId,
      targetId,
      targetType: 'user',
      displayName: normalizeImText(meta.from),
    }
  }
  return null
}

function normalizeBoundImTargetEntry(bound = {}, provider = null) {
  if (!bound?.channel || !bound?.targetId) return null
  const rawTarget = {
    id: bound.targetId,
    targetId: bound.targetId,
    userId: bound.targetId,
    openId: bound.targetId,
    staffId: bound.targetId,
    displayName: bound.displayName || bound.targetId,
    accountId: bound.accountId || '',
    targetType: bound.targetType || 'user',
    hasContextToken: true,
  }
  const entry = buildImTargetEntries(bound.channel, [rawTarget])[0] || null
  if (!entry) return null
  if (provider?.channelLabel) {
    entry.channelLabel = provider.channelLabel
  }
  return entry
}

function isSameBoundTarget(bound = {}, entry = {}) {
  if (!bound?.targetId || !entry?.rawTargetId) return false
  if (normalizeImText(bound.targetId) !== normalizeImText(entry.rawTargetId)) return false
  const boundAccountId = normalizeImText(bound.accountId)
  const entryAccountId = normalizeImText(entry.accountId)
  if (boundAccountId || entryAccountId) {
    return boundAccountId === entryAccountId
  }
  return true
}

function buildBoundTargetMismatchError(bound = {}, attemptedEntry = {}, attemptedChannel = '') {
  const channel = attemptedChannel || bound.channel || attemptedEntry.channel || 'im'
  const labelMap = {
    dingtalk: '钉钉',
    feishu: '飞书',
    'enterprise-weixin': '企业微信',
    weixin: '微信',
  }
  const channelLabel = labelMap[channel] || channel
  const currentLabel = bound.displayName || bound.targetId || '当前目标'
  const nextLabel = attemptedEntry.displayLabel || attemptedEntry.displayName || attemptedEntry.rawTargetId || '新目标'
  return new Error(`当前会话已绑定${channelLabel}联系人「${currentLabel}」，不能再发送给「${nextLabel}」。请新建会话后再联系其他成员。`)
}

function buildBoundChannelUnavailableError(bound = {}, provider = null) {
  const channelLabel = provider?.channelLabel || ({
    dingtalk: '钉钉',
    feishu: '飞书',
    'enterprise-weixin': '企业微信',
    weixin: '微信',
  }[bound.channel] || bound.channel || 'IM')
  const targetLabel = bound.displayName || bound.targetId || '当前目标'
  return new Error(`当前会话已绑定${channelLabel}联系人「${targetLabel}」，但该渠道当前不可用，暂时不能发送，也不能改发到其他 IM 目标。请先恢复该渠道，或改用其他会话。`)
}

function buildBoundImPrompt(bound = {}, provider = null, { channelAvailable = true } = {}) {
  if (!bound?.channel || !bound?.targetId) return null
  const channelLabel = provider?.channelLabel || ({
    dingtalk: '钉钉',
    feishu: '飞书',
    'enterprise-weixin': '企业微信',
    weixin: '微信',
  }[bound.channel] || bound.channel)
  const targetLabel = bound.displayName || bound.targetId
  if (!channelAvailable) {
    return `The current session is already bound to ${channelLabel} target "${targetLabel}", but that channel is currently unavailable. Do not ask for message content, do not call im_send, and do not call im_list_targets to look for other IM channels for this same session. If the user explicitly asks to unbind or disconnect this current recipient, you may call im_unbind. Otherwise explain that this bound channel must be restored first, or the user must use another session.`
  }
  return `The current session is already bound to ${channelLabel} target "${targetLabel}". Unless the user explicitly asks to change recipient, call im_send directly and reuse this bound target.`
}

function filterImTargetsToBoundEntry(payload = {}, bound = {}, provider = null) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : []
  const resolvedEntry = entries.find(entry => isSameBoundTarget(bound, entry))
    || normalizeBoundImTargetEntry(bound, provider)
  const filteredEntries = resolvedEntry ? [resolvedEntry] : []
  const filteredTargets = filteredEntries.map(toPublicImTarget)

  return {
    ...payload,
    entries: filteredEntries,
    targets: filteredTargets,
    targetCount: filteredTargets.length,
  }
}

function normalizeBoundWeixinNotifyTarget(bound = {}, weixinNotifyService = null) {
  if (bound?.channel !== 'weixin' || !bound?.targetId) return null
  const restored = typeof weixinNotifyService?.getTargetById === 'function'
    ? weixinNotifyService.getTargetById(bound.targetId)
    : null
  return restored || {
    id: bound.targetId,
    accountId: bound.accountId || null,
    userId: bound.targetId,
    displayName: bound.displayName || bound.targetId,
    targetSource: 'bound_session',
    isAuthorizedAccountUser: false,
    hasContextToken: true,
  }
}

function filterWeixinNotifyTargetsToBoundTarget(targets = [], bound = {}, weixinNotifyService = null) {
  const normalizedTargets = Array.isArray(targets) ? targets : []
  const matched = normalizedTargets.find(target =>
    normalizeImText(target?.id) === normalizeImText(bound?.targetId)
    && normalizeImText(target?.accountId) === normalizeImText(bound?.accountId)
  )
  return matched ? [matched] : [normalizeBoundWeixinNotifyTarget(bound, weixinNotifyService)].filter(Boolean)
}

function collectEnabledImProviders({
  weixinNotifyService,
  weixinBridge,
  dingtalkBridge,
  feishuBridge,
  enterpriseWeixinBridge,
  wecomCliManager,
  includeDisabled = false
}) {
  const providers = []

  if (PERSONAL_WEIXIN_ENABLED && weixinNotifyService && (
    includeDisabled
      || typeof weixinNotifyService.isEnabled !== 'function'
      || weixinNotifyService.isEnabled()
  )) {
    providers.push({
      channel: 'weixin',
      channelLabel: '微信',
      listTargets: async () => {
        const accounts = typeof weixinNotifyService.listAccounts === 'function'
          ? weixinNotifyService.listAccounts()
          : []
        const targets = typeof weixinNotifyService.listTargets === 'function'
          ? weixinNotifyService.listTargets()
          : []
        const entries = buildImTargetEntries('weixin', targets)
        return {
          accountCount: Array.isArray(accounts) ? accounts.length : 0,
          entries,
          targets: entries.map(toPublicImTarget),
          usage: {
            sendWith: 'Use channel=weixin and targetKey from im_list_targets when calling im_send.'
          }
        }
      },
      getBinding: typeof weixinBridge?.getBinding === 'function'
        ? (sessionId) => weixinBridge.getBinding(sessionId)
        : null,
      send: async (args = {}) => {
        const sendArgs = buildWeixinSendArgs(args)
        const result = await weixinNotifyService.sendText(sendArgs)
        const recipient = result.target
          ? toPublicImTarget(buildImTargetEntries('weixin', [result.target])[0] || {})
          : null
        return { result, recipient }
      }
    })
  }

  if (dingtalkBridge && (includeDisabled || (
    isBridgeConfiguredEnabled(dingtalkBridge) && dingtalkBridge?.getStatus?.().runtimeState !== 'disabled'
  ))) {
    providers.push({
      channel: 'dingtalk',
      channelLabel: '钉钉',
      listTargets: async () => {
        const targets = typeof dingtalkBridge.listTargets === 'function'
          ? await dingtalkBridge.listTargets()
          : []
        const entries = buildImTargetEntries('dingtalk', targets)
        return {
          entries,
          targets: entries.map(toPublicImTarget),
          usage: {
            sendWith: 'Use channel=dingtalk and targetKey from im_list_targets when calling im_send.'
          }
        }
      },
      getBinding: typeof dingtalkBridge.getBinding === 'function'
        ? (sessionId) => dingtalkBridge.getBinding(sessionId)
        : null,
      send: async (args = {}) => {
        const result = await dingtalkBridge.sendToTarget(args)
        const recipient = toPublicImTarget(buildImTargetEntries('dingtalk', [{
          id: result?.targetId || args.targetId || args.staffId,
          staffId: result?.targetId || args.targetId || args.staffId,
          displayName: args.displayName || result?.targetId || args.targetId || args.staffId,
          targetType: args.targetType,
          hasContextToken: true,
        }])[0] || {}) || null
        return { result, recipient }
      },
      unbind: typeof dingtalkBridge.unbindTarget === 'function'
        ? (sessionId) => dingtalkBridge.unbindTarget(sessionId)
        : null,
    })
  }

  if (feishuBridge && (includeDisabled || (
    isBridgeConfiguredEnabled(feishuBridge) && feishuBridge?.getStatus?.().runtimeState !== 'disabled'
  ))) {
    providers.push({
      channel: 'feishu',
      channelLabel: '飞书',
      listTargets: async () => {
        const targets = typeof feishuBridge.listSendableTargets === 'function'
          ? await feishuBridge.listSendableTargets({})
          : []
        const entries = buildImTargetEntries('feishu', targets)
        return {
          entries,
          targets: entries.map(toPublicImTarget),
          usage: {
            sendWith: 'Use channel=feishu and targetKey from im_list_targets when calling im_send.'
          }
        }
      },
      getBinding: typeof feishuBridge.getBinding === 'function'
        ? (sessionId) => feishuBridge.getBinding(sessionId)
        : null,
      send: async (args = {}) => {
        const result = await feishuBridge.sendToTarget(args)
        const recipient = toPublicImTarget(buildImTargetEntries('feishu', [{
          id: result?.targetId || args.targetId || args.openId,
          openId: result?.targetId || args.targetId || args.openId,
          displayName: args.displayName || result?.targetId || args.targetId || args.openId,
          targetType: args.targetType,
          hasContextToken: true,
        }])[0] || {}) || null
        return { result, recipient }
      },
      unbind: typeof feishuBridge.unbindTarget === 'function'
        ? (sessionId) => feishuBridge.unbindTarget(sessionId)
        : null,
    })
  }

  if (enterpriseWeixinBridge && (includeDisabled || (
    isBridgeConfiguredEnabled(enterpriseWeixinBridge) && enterpriseWeixinBridge?.getStatus?.().runtimeState !== 'disabled'
  ))) {
    providers.push({
      channel: 'enterprise-weixin',
      channelLabel: '企业微信',
      listTargets: async () => {
        const targets = []
        if (wecomCliManager?.listContacts) {
          try {
            const contacts = await wecomCliManager.listContacts()
            if (Array.isArray(contacts)) targets.push(...contacts)
          } catch {
            // 忽略 CLI 读取失败，仍返回已知群聊
          }
        }
        for (const chat of (enterpriseWeixinBridge._knownChats || new Map()).values()) {
          targets.push({
            id: chat.chatId,
            userId: chat.chatId,
            targetId: chat.chatId,
            displayName: chat.name || chat.chatId || '',
            targetType: 'chat',
            hasContextToken: true,
          })
        }
        const entries = buildImTargetEntries('enterprise-weixin', targets)
        return {
          entries,
          targets: entries.map(toPublicImTarget),
          usage: {
            sendWith: 'Use channel=enterprise-weixin and targetKey from im_list_targets when calling im_send.'
          }
        }
      },
      getBinding: typeof enterpriseWeixinBridge.getBinding === 'function'
        ? (sessionId) => enterpriseWeixinBridge.getBinding(sessionId)
        : null,
      send: async (args = {}) => {
        const result = await enterpriseWeixinBridge.sendToTarget(args)
        const recipient = toPublicImTarget(buildImTargetEntries('enterprise-weixin', [{
          id: result?.targetId || args.targetId || args.userId,
          userId: result?.targetId || args.targetId || args.userId,
          displayName: args.displayName || result?.targetId || args.targetId || args.userId,
          targetType: args.targetType,
          hasContextToken: true,
        }])[0] || {}) || null
        return { result, recipient }
      },
      unbind: typeof enterpriseWeixinBridge.unbindTarget === 'function'
        ? (sessionId) => enterpriseWeixinBridge.unbindTarget(sessionId)
        : null,
    })
  }

  return providers
}

async function buildDesktopCapabilityQueryOptions({
  scheduledTaskService,
  weixinNotifyService,
  weixinBridge,
  dingtalkBridge,
  feishuBridge,
  enterpriseWeixinBridge,
  wecomCliManager,
  session
}) {
  const includeScheduleTools = shouldAllowScheduleToolsForSession(scheduledTaskService)
  const getImProviders = ({ includeDisabled = false } = {}) => collectEnabledImProviders({
    weixinNotifyService,
    weixinBridge,
    dingtalkBridge,
    feishuBridge,
    enterpriseWeixinBridge,
    wecomCliManager,
    includeDisabled
  })
  const includeWeixinNotifyTools = Boolean(
    PERSONAL_WEIXIN_ENABLED && weixinNotifyService && (
      typeof weixinNotifyService.isEnabled === 'function'
        ? weixinNotifyService.isEnabled()
        : true
    )
  )
  const includeImBuiltinTools = getImProviders({ includeDisabled: true }).length > 0
  const initialImProviders = includeImBuiltinTools ? getImProviders({ includeDisabled: true }) : []
  const initialAvailableImProviders = includeImBuiltinTools ? getImProviders() : []
  const initialSessionProvider = session?.imChannel
    ? initialImProviders.find(provider => provider.channel === session.imChannel) || null
    : null
  const initialBoundImTarget = session?.id
    ? getBoundImTargetFromSession(session, initialSessionProvider)
    : null
  const initialBoundChannelAvailable = initialBoundImTarget
    ? initialAvailableImProviders.some(provider => provider.channel === initialBoundImTarget.channel)
    : false
  const boundImPrompt = initialBoundImTarget
    ? buildBoundImPrompt(initialBoundImTarget, initialSessionProvider, {
      channelAvailable: initialBoundChannelAvailable
    })
    : null
  const initialWeixinProvider = getImProviders({ includeDisabled: true }).find(provider => provider.channel === 'weixin') || null
  const initialBoundWeixinTarget = session?.id
    ? getBoundImTargetFromSession(session, initialWeixinProvider)
    : null

  if (!includeScheduleTools && !includeWeixinNotifyTools && !includeImBuiltinTools) {
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
    cwd: buildClearableStringSchema(z, '执行工作目录；传 null 或空字符串表示清空并回退到默认工作目录'),
    sessionBindingMode: z.enum(SESSION_BINDING_MODES).optional().describe('会话绑定方式：current=绑定当前聊天会话，new=首次运行时新建独立会话。省略时默认 current；只有用户明确要求独立/后台/新会话时才使用 new'),
    maxRuns: buildPositiveIntegerLikeSchema(z, '任务生命周期内的累计执行次数上限，可为 null；这不是单次会话的 maxTurns', { nullable: true }),
    resetCountOnEnable: z.boolean().optional().describe('从停用重新启用时，是否重置已执行次数和运行态'),
    intervalAnchorMode: z.enum(INTERVAL_ANCHOR_MODES).optional().describe('间隔调度推进基准：按开始时间或结束时间'),
    enabled: z.boolean().optional().describe('是否启用'),
    scheduleType: z.enum(SCHEDULE_TYPES).optional().describe('调度类型'),
    intervalMinutes: buildPositiveIntegerLikeSchema(z, '间隔分钟，仅 interval 使用'),
    weeklyDays: z.array(z.union([z.number().int().min(0).max(6), z.string().regex(/^[0-6]$/)])).optional().describe('每周执行日，0=周日，6=周六'),
    monthlyMode: z.enum(MONTHLY_MODES).optional().describe('每月规则：固定日期或最后一天'),
    monthlyDay: buildPositiveIntegerLikeSchema(z, '每月执行日，1-31，仅 monthly + day_of_month 使用', { max: 31 }),
    firstRunAt: buildExecutionTimeSchema(z, '执行时间戳（毫秒）或可解析的日期时间字符串。interval 用作固定相位基准；once 为唯一触发时间；daily/weekly/monthly/workdays 仅使用其中的时分秒')
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
        limit: buildPositiveIntegerLikeSchema(z, '返回最近几条记录，默认 20，最大 50', { max: 50 })
      },
      async (args) => {
        const task = resolveTaskReference(scheduledTaskService, args)
        const limit = args.limit == null || args.limit === '' ? 20 : Number(args.limit)
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
        intervalMinutes: buildPositiveIntegerLikeSchema(z, '间隔分钟，仅 interval 使用'),
        weeklyDays: z.array(z.union([z.number().int().min(0).max(6), z.string().regex(/^[0-6]$/)])).optional().describe('每周执行日，0=周日，6=周六'),
        monthlyMode: z.enum(MONTHLY_MODES).optional().describe('每月规则：固定日期或最后一天'),
        monthlyDay: buildPositiveIntegerLikeSchema(z, '每月执行日，1-31，仅 monthly + day_of_month 使用', { max: 31 }),
        firstRunAt: buildExecutionTimeSchema(z, '执行时间戳（毫秒）或可解析的日期时间字符串。interval 用作固定相位基准；once 为唯一触发时间；daily/weekly/monthly/workdays 仅使用其中的时分秒'),
        cwd: buildClearableStringSchema(z, '执行工作目录；传 null 或空字符串表示清空并回退到默认工作目录'),
        maxRuns: buildPositiveIntegerLikeSchema(z, '任务生命周期内的累计执行次数上限，可为 null；这不是单次会话的 maxTurns', { nullable: true }),
        resetCountOnEnable: z.boolean().optional().describe('从停用重新启用时，是否重置已执行次数和运行态'),
        intervalAnchorMode: z.enum(INTERVAL_ANCHOR_MODES).optional().describe('间隔调度推进基准：按开始时间或结束时间'),
        enabled: z.boolean().optional().describe('是否启用'),
        sessionBindingMode: z.enum(SESSION_BINDING_MODES).optional().describe('会话绑定方式：current=绑定当前聊天会话，new=首次运行时新建独立会话。省略时默认 current；只有用户明确要求独立/后台/新会话时才使用 new')
      },
      async (args) => {
        const createArgs = { ...args }
        if (session?.id && includeScheduleTools) {
          const normalizedMode = args.sessionBindingMode === 'new' ? 'new' : 'current'
          createArgs.sessionBindingMode = normalizedMode
          if (normalizedMode === 'current') {
            createArgs.boundSessionId = session.id
          }
        }

        const created = await scheduledTaskService.createTask(createArgs)
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
      '列出 Hydro Desktop 已绑定且可通知的微信目标。目标来自用户完成 iLink 扫码授权后捕获到的可发送上下文。',
      {},
      async () => {
        const accounts = typeof weixinNotifyService.listAccounts === 'function'
          ? weixinNotifyService.listAccounts()
          : []
        const targets = typeof weixinNotifyService.listTargets === 'function'
          ? weixinNotifyService.listTargets()
          : []
        const filteredTargets = initialBoundWeixinTarget
          ? filterWeixinNotifyTargetsToBoundTarget(targets, initialBoundWeixinTarget, weixinNotifyService)
          : targets
        const serializedTargets = serializeWeixinTargetsForTool(filteredTargets)

        return buildToolResult({
          action: 'weixin_notify_list_targets',
          boundSession: Boolean(initialBoundWeixinTarget),
          accountCount: Array.isArray(accounts) ? accounts.length : 0,
          targetCount: serializedTargets.length,
          accounts,
          targets: serializedTargets,
          usage: {
            sendWith: 'Use targetKey as weixin_notify_send.targetKey. If sendable is false, ask that Weixin user to scan the authorization QR code again, then capture latest messages.'
          }
        })
      }
    ),
    tool(
      WEIXIN_NOTIFY_TOOL_NAMES[1],
      '通过 Hydro Desktop 微信通知通道发送一条文本通知。仅支持 weixin_notify_list_targets 返回且 sendable=true 的目标。',
      {
        targetKey: z.string().min(1).optional().describe('推荐使用 weixin_notify_list_targets 返回的 targetKey。'),
        targetId: z.string().min(1).optional().describe('兼容字段：可使用 list_targets 返回的 id、displayName 或 userId。'),
        displayName: z.string().min(1).optional().describe('兼容字段：目标备注名；若同名目标不唯一，需要同时提供 accountId。'),
        accountId: z.string().min(1).optional().describe('发送账号 ID；多账号时必须提供。'),
        text: z.string().min(1).max(4000).describe('要发送的通知文本。')
      },
      async (args) => {
        const sendArgs = buildWeixinSendArgs(args)
        if (initialBoundWeixinTarget) {
          const attemptedTarget = normalizeImText(sendArgs.targetId)
          if (attemptedTarget && attemptedTarget !== normalizeImText(initialBoundWeixinTarget.targetId)) {
            const attemptedEntry = serializeWeixinTargetsForTool([{
              id: attemptedTarget,
              accountId: sendArgs.accountId || '',
              userId: attemptedTarget,
              displayName: sendArgs.displayName || attemptedTarget,
              hasContextToken: true
            }])[0]
            throw buildBoundTargetMismatchError(initialBoundWeixinTarget, {
              channel: 'weixin',
              rawTargetId: attemptedTarget,
              accountId: sendArgs.accountId || '',
              displayLabel: attemptedEntry?.displayLabel || sendArgs.displayName || attemptedTarget,
              displayName: attemptedEntry?.displayName || sendArgs.displayName || attemptedTarget
            }, 'weixin')
          }

          sendArgs.targetId = initialBoundWeixinTarget.targetId
          sendArgs.accountId = initialBoundWeixinTarget.accountId || sendArgs.accountId
        } else if (!sendArgs.targetId) {
          throw new Error('必须提供 targetKey、targetId 或 displayName')
        }
        if (session?.id) {
          sendArgs.sessionId = session.id
        }
        const result = await weixinNotifyService.sendText(sendArgs)
        return buildToolResult({
          action: 'weixin_notify_send',
          recipient: result.target
            ? serializeWeixinTargetForTool(result.target, new Map([[result.target.displayName || result.target.userId || result.target.id, 1]]))
            : null,
          result
        })
      }
    )
  ] : []

  const imBuiltinTools = includeImBuiltinTools ? [
    tool(
      IM_BUILTIN_TOOL_NAMES[0],
      '列出当前会话可用的内置 IM 渠道目标，包括钉钉、飞书、企业微信。仅返回当前已启用且可发送的渠道目标。',
      {},
      async () => {
        const sessionBoundProvider = session?.imChannel
          ? getImProviders({ includeDisabled: true }).find(provider => provider.channel === session.imChannel)
          : null
        const boundTarget = session?.id
          ? getBoundImTargetFromSession(session, sessionBoundProvider)
          : null

        if (boundTarget) {
          const boundProvider = getImProviders().find(provider => provider.channel === boundTarget.channel)
          if (!boundProvider) {
            throw buildBoundChannelUnavailableError(boundTarget, sessionBoundProvider)
          }

          const payload = filterImTargetsToBoundEntry(
            await boundProvider.listTargets(),
            boundTarget,
            boundProvider
          )

          return buildToolResult({
            action: 'im_list_targets',
            boundSession: true,
            channelCount: 1,
            targetCount: Array.isArray(payload.targets) ? payload.targets.length : 0,
            channels: [{
              channel: boundProvider.channel,
              channelLabel: boundProvider.channelLabel,
              ...payload,
            }],
          })
        }

        const imProviders = getImProviders()
        const channels = []
        let totalTargetCount = 0

        for (const provider of imProviders) {
          const payload = await provider.listTargets()
          const targets = Array.isArray(payload?.targets) ? payload.targets : []
          totalTargetCount += targets.length
          channels.push({
            channel: provider.channel,
            channelLabel: provider.channelLabel,
            targetCount: targets.length,
            ...payload,
          })
        }

        return buildToolResult({
          action: 'im_list_targets',
          channelCount: channels.length,
          targetCount: totalTargetCount,
          channels,
        })
      }
    ),
    tool(
      IM_BUILTIN_TOOL_NAMES[1],
      '通过 Hydro Desktop 内置 IM 渠道发送一条短文本消息。若当前会话已绑定 IM 目标且用户未要求更换收件人，可直接只传 text 发送到该绑定目标；否则先用 im_list_targets 获取 channel 与 targetKey，再用本工具发送。',
      {
        channel: z.enum(['dingtalk', 'feishu', 'enterprise-weixin']).optional().describe('目标 IM 渠道。若当前会话已绑定 IM 目标且不更换收件人，可省略。'),
        targetKey: z.string().min(1).optional().describe('推荐使用 im_list_targets 返回的 targetKey。'),
        targetId: z.string().min(1).optional().describe('兼容字段：目标 ID。'),
        targetType: z.enum(['user', 'chat']).optional().describe('目标类型。群聊使用 chat，单聊使用 user。'),
        displayName: z.string().min(1).optional().describe('兼容字段：目标显示名。'),
        accountId: z.string().min(1).optional().describe('微信多账号场景可传 accountId。'),
        userId: z.string().min(1).optional().describe('企业微信兼容字段。'),
        openId: z.string().min(1).optional().describe('飞书兼容字段。'),
        staffId: z.string().min(1).optional().describe('钉钉兼容字段。'),
        text: z.string().min(1).max(4000).describe('要发送的文本内容。')
      },
      async (args) => {
        const sendArgs = resolveImSendArgs(args)
        const explicitChannel = normalizeImText(sendArgs.channel)
        const allImProviders = getImProviders({ includeDisabled: true })
        const currentImProviders = getImProviders()
        const sessionBoundProvider = session?.imChannel
          ? allImProviders.find(item => item.channel === session.imChannel)
          : null
        const selectedProvider = explicitChannel
          ? allImProviders.find(item => item.channel === explicitChannel)
          : sessionBoundProvider
        const boundTarget = session?.id
          ? getBoundImTargetFromSession(session, sessionBoundProvider)
          : null

        if (!explicitChannel && !boundTarget) {
          throw new Error('必须提供 channel，或先在当前会话绑定一个 IM 目标')
        }

        if (boundTarget && explicitChannel && explicitChannel !== boundTarget.channel) {
          const boundProvider = currentImProviders.find(item => item.channel === boundTarget.channel)
          if (!boundProvider) {
            throw buildBoundChannelUnavailableError(boundTarget, sessionBoundProvider)
          }
          throw new Error(`当前会话已绑定${boundTarget.channel}渠道，不能再发送到${explicitChannel}`)
        }

        const channel = explicitChannel || boundTarget?.channel || ''
        const provider = currentImProviders.find(item => item.channel === channel)
        if (session?.id) {
          sendArgs.sessionId = session.id
        }
        if (!provider) {
          if (boundTarget && channel === boundTarget.channel) {
            throw buildBoundChannelUnavailableError(boundTarget, selectedProvider)
          }
          throw new Error(`当前不可用的 IM 渠道: ${channel || explicitChannel}`)
        }

        if (boundTarget && channel !== boundTarget.channel) {
          throw new Error(`当前会话已绑定${boundTarget.channel}渠道，不能再发送到${channel}`)
        }

        const listPayload = await provider.listTargets()
        const entries = Array.isArray(listPayload?.entries) ? listPayload.entries : []

        let resolvedEntry = null
        if (sendArgs.targetId) {
          resolvedEntry = resolveImTargetEntry(entries, sendArgs.targetId)
          if (!resolvedEntry && boundTarget && normalizeImText(sendArgs.targetId) === normalizeImText(boundTarget.targetId)) {
            resolvedEntry = normalizeBoundImTargetEntry(boundTarget, provider)
          }
          if (!resolvedEntry) {
            throw new Error(`未找到目标「${sendArgs.targetId}」，请先调用 im_list_targets 并使用列表中的名称。`)
          }
        } else if (boundTarget) {
          resolvedEntry = entries.find(entry => isSameBoundTarget(boundTarget, entry))
            || normalizeBoundImTargetEntry(boundTarget, provider)
        } else {
          throw new Error('必须提供目标名称。未绑定会话请先调用 im_list_targets，再用列表中的名称发送。')
        }

        if (boundTarget && !isSameBoundTarget(boundTarget, resolvedEntry)) {
          throw buildBoundTargetMismatchError(boundTarget, resolvedEntry, channel)
        }

        const finalSendArgs = {
          ...sendArgs,
          channel,
          targetId: resolvedEntry.rawTargetId,
          targetType: resolvedEntry.targetType,
          displayName: resolvedEntry.displayName,
        }
        if (resolvedEntry.accountId) {
          finalSendArgs.accountId = resolvedEntry.accountId
        }
        if (channel === 'feishu') {
          finalSendArgs.openId = resolvedEntry.rawTargetId
        }
        if (channel === 'enterprise-weixin') {
          finalSendArgs.userId = resolvedEntry.rawTargetId
        }
        if (channel === 'dingtalk') {
          finalSendArgs.staffId = resolvedEntry.rawTargetId
        }

        const { result, recipient } = await provider.send(finalSendArgs)
        return buildToolResult({
          action: 'im_send',
          channel,
          channelLabel: provider.channelLabel,
          recipient,
          result,
        })
      }
    ),
    tool(
      IM_BUILTIN_TOOL_NAMES[2],
      '解除当前会话与已绑定内置 IM 目标的绑定。仅对当前会话生效，解绑后该会话不再默认发送给原绑定对象。',
      {},
      async () => {
        if (!session?.id || !session?.imChannel) {
          throw new Error('当前会话没有已绑定的 IM 渠道，无需解绑。')
        }

        const allImProviders = getImProviders({ includeDisabled: true })
        const sessionBoundProvider = allImProviders.find(item => item.channel === session.imChannel) || null
        const boundTarget = getBoundImTargetFromSession(session, sessionBoundProvider)

        if (!sessionBoundProvider?.unbind) {
          throw new Error(`当前会话绑定的 ${session.imChannel} 渠道不支持解绑。`)
        }

        const result = await sessionBoundProvider.unbind(session.id)
        return buildToolResult({
          action: 'im_unbind',
          channel: sessionBoundProvider.channel,
          channelLabel: sessionBoundProvider.channelLabel,
          recipient: boundTarget
            ? toPublicImTarget(normalizeBoundImTargetEntry(boundTarget, sessionBoundProvider) || {})
            : null,
          result,
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
          ...weixinNotifyTools,
          ...imBuiltinTools
        ]
      })
    },
    appendSystemPrompt: mergeSystemPrompts(
      includeScheduleTools ? DESKTOP_CAPABILITY_SYSTEM_PROMPT : null,
      includeWeixinNotifyTools ? WEIXIN_NOTIFY_SYSTEM_PROMPT : null,
      includeImBuiltinTools ? IM_BUILTIN_SYSTEM_PROMPT : null,
      boundImPrompt
    ),
    allowedTools: [
      ...(includeScheduleTools ? DESKTOP_CAPABILITY_ALLOWED_TOOLS : []),
      ...(includeWeixinNotifyTools ? WEIXIN_NOTIFY_ALLOWED_TOOLS : []),
      ...(includeImBuiltinTools ? IM_BUILTIN_ALLOWED_TOOLS : [])
    ],
    disallowedTools: includeScheduleTools ? CONFLICTING_CRON_TOOLS : undefined
  }
}

module.exports = {
  buildDesktopCapabilityQueryOptions,
  DESKTOP_CAPABILITY_SYSTEM_PROMPT,
  CONFLICTING_CRON_TOOLS,
  DESKTOP_CAPABILITY_ALLOWED_TOOLS,
  WEIXIN_NOTIFY_ALLOWED_TOOLS,
  IM_BUILTIN_ALLOWED_TOOLS
}

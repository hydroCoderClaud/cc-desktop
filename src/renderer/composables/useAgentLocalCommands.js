import { getSessionAppDefaultWorkspaceRoot } from '@/utils/im-working-directory'

export function useAgentLocalCommands({
  sessionId,
  t,
  options = {},
  messages,
  selectedModel,
  hasActiveSession,
  numTurns,
  totalCostUsd,
  contextTokens,
  slashCommandsReady,
  slashCommands,
  builtinSlashCommands,
  sdkSlashCommands,
  addAssistantMessage,
  compactConversation
}) {
  let sessionAppDefaultWorkspaceRootPromise = null

  const resolveSessionAppDefaultWorkspaceRoot = async () => {
    if (!sessionAppDefaultWorkspaceRootPromise) {
      sessionAppDefaultWorkspaceRootPromise = (async () => {
        try {
          const config = await window.electronAPI?.getConfig?.()
          return getSessionAppDefaultWorkspaceRoot(config || {})
        } catch (error) {
          console.warn('[useAgentLocalCommands] Failed to resolve session app default workspace root:', error)
          return getSessionAppDefaultWorkspaceRoot({})
        }
      })()
    }

    return sessionAppDefaultWorkspaceRootPromise
  }

  const normalizeScheduledTaskSessionBindingMode = (value) => {
    return value === 'new' ? 'new' : 'current'
  }

  const normalizeSessionAppAfterCreateAction = (value) => {
    return value === 'save' ? 'save' : 'launch'
  }

  const normalizeScheduledTaskModelId = (value) => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized || ''
  }

  const buildScheduledTaskName = (prompt) => {
    const firstLine = String(prompt || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean)

    if (!firstLine) return t('agent.scheduleDraftDefaultName')
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}...` : firstLine
  }

  const buildSessionAppName = (prompt) => {
    const firstLine = String(prompt || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean)

    if (!firstLine) return t('sessionApps.defaultDraftName')
    return firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine
  }

  const getLatestSchedulablePrompt = () => {
    for (let index = messages.value.length - 1; index >= 0; index -= 1) {
      const message = messages.value[index]
      if (message?.role !== 'user') continue

      const content = typeof message.content === 'string' ? message.content.trim() : ''
      if (!content || content.startsWith('/')) continue
      if (content === '[图片]') continue
      return content
    }
    return ''
  }

  const normalizeScheduledTaskDraft = (draft = {}) => {
    const scheduleType = ['interval', 'daily', 'weekly', 'monthly', 'workdays', 'once'].includes(draft.scheduleType)
      ? draft.scheduleType
      : 'interval'
    const intervalAnchorMode = ['started_at', 'finished_at'].includes(draft.intervalAnchorMode)
      ? draft.intervalAnchorMode
      : 'started_at'

    const weeklyDays = Array.isArray(draft.weeklyDays)
      ? Array.from(new Set(draft.weeklyDays
        .map(day => Number(day))
        .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)))
      : [1]
    const monthlyMode = draft.monthlyMode === 'last_day' ? 'last_day' : 'day_of_month'
    const monthlyDayValue = Number(draft.monthlyDay)
    const monthlyDay = Number.isInteger(monthlyDayValue)
      ? Math.min(31, Math.max(1, monthlyDayValue))
      : 1

    const intervalMinutes = Math.max(1, Number(draft.intervalMinutes) || 60)
    const maxRunsValue = Number(draft.maxRuns)
    const maxRuns = Number.isInteger(maxRunsValue) && maxRunsValue > 0 ? maxRunsValue : null

    return {
      name: String(draft.name || '').trim(),
      prompt: String(draft.prompt || '').trim(),
      cwd: typeof draft.cwd === 'string' && draft.cwd.trim() ? draft.cwd.trim() : null,
      sessionBindingMode: normalizeScheduledTaskSessionBindingMode(draft.sessionBindingMode),
      maxRuns,
      resetCountOnEnable: !!draft.resetCountOnEnable,
      intervalAnchorMode,
      enabled: draft.enabled !== false,
      scheduleType,
      intervalMinutes,
      weeklyDays: weeklyDays.length > 0 ? weeklyDays : [1],
      monthlyMode,
      monthlyDay,
      firstRunAt: draft.firstRunAt ?? null
    }
  }

  const normalizeSessionAppDraft = (draft = {}) => {
    const defaultContext = draft.defaultContext && typeof draft.defaultContext === 'object'
      ? draft.defaultContext
      : {}
    return {
      appId: typeof draft.appId === 'string' && draft.appId.trim() ? draft.appId.trim() : null,
      sourceSessionId: typeof draft.sourceSessionId === 'string' && draft.sourceSessionId.trim() ? draft.sourceSessionId.trim() : sessionId,
      creationMode: typeof draft.creationMode === 'string' && draft.creationMode.trim() ? draft.creationMode.trim() : 'chat',
      name: String(draft.name || '').trim(),
      description: String(draft.description || '').trim(),
      icon: typeof draft.icon === 'string' && draft.icon.trim() ? draft.icon.trim() : 'sessionApp',
      systemPrompt: String(draft.systemPrompt || '').trim(),
      startupMessageTemplate: String(draft.startupMessageTemplate || '').trim(),
      inputSchema: Array.isArray(draft.inputSchema) ? draft.inputSchema : [],
      allowedCapabilities: Array.isArray(draft.allowedCapabilities) ? draft.allowedCapabilities : [],
      defaultContext: {
        cwd: typeof defaultContext.cwd === 'string' && defaultContext.cwd.trim()
          ? defaultContext.cwd.trim()
          : '',
        apiProfileId: options.apiProfileId || null,
        modelId: typeof selectedModel?.value === 'string' && selectedModel.value.trim()
          ? selectedModel.value.trim()
          : null
      },
      workflowHints: Array.isArray(draft.workflowHints) ? draft.workflowHints : [],
      outputHints: Array.isArray(draft.outputHints) ? draft.outputHints : [],
      historyPolicy: draft.historyPolicy && typeof draft.historyPolicy === 'object' ? draft.historyPolicy : null
    }
  }

  const toPlainPayload = (value) => {
    if (value === undefined) return undefined
    return JSON.parse(JSON.stringify(value))
  }

  const getToolMessageById = (messageId) => messages.value.find(msg => msg.id === messageId && msg.role === 'tool')

  const createScheduledTaskDraft = (parsedCommand) => {
    const prompt = parsedCommand.args || getLatestSchedulablePrompt()
    const draftId = `scheduled-task-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const draft = normalizeScheduledTaskDraft({
      name: buildScheduledTaskName(prompt),
      prompt,
      cwd: options.sessionCwd || null,
      sessionBindingMode: 'current',
      maxRuns: null,
      resetCountOnEnable: false,
      intervalAnchorMode: 'started_at',
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 60,
      weeklyDays: [1],
      monthlyMode: 'day_of_month',
      monthlyDay: 1,
      firstRunAt: null
    })

    messages.value.push({
      id: draftId,
      role: 'tool',
      toolName: 'ScheduledTaskDraft',
      input: {
        draftId,
        kind: 'scheduled_task_draft',
        title: t('agent.scheduleDraftTitle'),
        description: prompt
          ? t('agent.scheduleDraftHintWithPrompt')
          : t('agent.scheduleDraftHintEmpty'),
        draft
      },
      output: null,
      timestamp: Date.now()
    })
  }

  const createSessionAppCard = async (parsedCommand) => {
    const prompt = parsedCommand.args || getLatestSchedulablePrompt()
    const draftId = `session-app-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const defaultWorkspaceRoot = await resolveSessionAppDefaultWorkspaceRoot()
    const draft = normalizeSessionAppDraft({
      name: buildSessionAppName(prompt),
      description: prompt,
      startupMessageTemplate: prompt,
      creationMode: 'chat',
      defaultContext: {
        cwd: defaultWorkspaceRoot
      }
    })

    messages.value.push({
      id: draftId,
      role: 'tool',
      toolName: 'SessionAppDraft',
      input: {
        draftId,
        kind: 'session_app_draft',
        title: t('agent.sessionAppDraftTitle'),
        description: prompt
          ? t('agent.sessionAppDraftHintWithPrompt')
          : t('agent.sessionAppDraftHintEmpty'),
        draft,
        behavior: {
          afterCreateAction: 'launch'
        }
      },
      output: null,
      timestamp: Date.now()
    })
  }

  const triggerScheduledTaskDraft = (prompt = '') => {
    createScheduledTaskDraft({
      args: typeof prompt === 'string' ? prompt.trim() : ''
    })
  }

  const triggerSessionAppDraft = (prompt = '') => {
    void createSessionAppCard({
      args: typeof prompt === 'string' ? prompt.trim() : ''
    })
  }

  const submitScheduledTaskDraft = async ({ messageId, draft }) => {
    if (!window.electronAPI?.createScheduledTask) {
      return { error: t('agent.scheduleDraftApiUnavailable') }
    }

    const message = getToolMessageById(messageId)
    if (!message) {
      return { error: t('agent.scheduleDraftNotFound') }
    }

    const payload = normalizeScheduledTaskDraft(draft)

    try {
      message.input = {
        ...(message.input || {}),
        draft: payload
      }

      const createPayload = payload.sessionBindingMode === 'current'
        ? {
            ...payload,
            boundSessionId: sessionId
          }
        : payload

      const result = await window.electronAPI.createScheduledTask(createPayload)
      if (result?.error) {
        throw new Error(result.error)
      }

      message.output = {
        status: 'answered',
        taskId: result?.id || null,
        taskName: result?.name || payload.name,
        enabled: result?.enabled ?? payload.enabled,
        nextRunAt: result?.nextRunAt ?? null
      }
      return { success: true, task: result || payload, runError: null }
    } catch (err) {
      console.error('[useAgentLocalCommands] submitScheduledTaskDraft error:', err)
      return { error: err.message || t('agent.scheduleDraftCreateFailed') }
    }
  }

  const submitSessionAppDraft = async ({ messageId, draft, behavior = {} }) => {
    if (!window.electronAPI?.createSessionApp || !window.electronAPI?.updateSessionApp) {
      return { error: t('agent.sessionAppDraftApiUnavailable') }
    }

    const message = getToolMessageById(messageId)
    if (!message) {
      return { error: t('agent.sessionAppDraftNotFound') }
    }

    const payload = toPlainPayload(normalizeSessionAppDraft(draft))
    const afterCreateAction = normalizeSessionAppAfterCreateAction(behavior.afterCreateAction)

    try {
      message.input = {
        ...(message.input || {}),
        draft: payload,
        behavior: {
          afterCreateAction
        }
      }

      let appRecord = null
      const existingAppId = typeof message.input?.persistedAppId === 'string' ? message.input.persistedAppId : ''

      if (existingAppId) {
        appRecord = await window.electronAPI.updateSessionApp(toPlainPayload({
          appId: existingAppId,
          updates: payload
        }))
      } else {
        appRecord = await window.electronAPI.createSessionApp(payload)
      }

      const persistedAppId = appRecord?.appId || existingAppId
      if (!persistedAppId) {
        throw new Error(t('agent.sessionAppDraftCreateFailed'))
      }

      message.input = {
        ...(message.input || {}),
        persistedAppId,
        draft: appRecord || payload
      }

      let launchedSession = null
      if (afterCreateAction === 'launch') {
        launchedSession = await window.electronAPI.launchSessionApp(toPlainPayload({
          appId: persistedAppId,
          input: null,
          sessionOptions: {
            cwd: payload.defaultContext?.cwd || null,
            apiProfileId: payload.defaultContext?.apiProfileId || null,
            modelId: payload.defaultContext?.modelId || null,
            title: payload.name || null
          }
        }))
        if (launchedSession?.error) {
          throw new Error(launchedSession.error)
        }
      }

      message.output = {
        status: 'answered',
        appId: persistedAppId,
        appName: appRecord?.name || payload.name,
        launchedSessionId: launchedSession?.id || null,
        launchedSessionTitle: launchedSession?.title || payload.name || null,
        afterCreateAction
      }

      return {
        success: true,
        app: appRecord,
        launchedSession: launchedSession || null
      }
    } catch (err) {
      console.error('[useAgentLocalCommands] submitSessionAppDraft error:', err)
      return { error: err.message || t('agent.sessionAppDraftCreateFailed') }
    }
  }

  const cancelScheduledTaskDraft = ({ messageId }) => {
    const message = getToolMessageById(messageId)
    if (!message) {
      return { error: t('agent.scheduleDraftNotFound') }
    }

    message.output = {
      status: 'cancelled'
    }
    return { success: true }
  }

  const cancelSessionAppDraft = ({ messageId }) => {
    const message = getToolMessageById(messageId)
    if (!message) {
      return { error: t('agent.sessionAppDraftNotFound') }
    }

    message.output = {
      status: 'cancelled'
    }
    return { success: true }
  }

  const handleLocalSlashCommand = async (parsedCommand) => {
    if (!slashCommandsReady.value) {
      return false
    }

    const lower = parsedCommand.lowerName

    if (lower === '/schedule') {
      createScheduledTaskDraft(parsedCommand)
      return true
    }

    if (lower === '/session-app') {
      await createSessionAppCard(parsedCommand)
      return true
    }

    if (lower === '/status') {
      const lines = [
        t('agent.statusSession', { id: sessionId.substring(0, 8) }),
        t('agent.statusCliSession', { status: hasActiveSession.value ? t('agent.statusCliActive') : t('agent.statusCliInactive') }),
        t('agent.statusModel', { model: selectedModel.value || t('agent.statusModelUnknown') }),
        t('agent.statusTurns', { count: numTurns.value }),
        t('agent.statusMessages', { count: messages.value.length }),
        t('agent.statusCost', { cost: totalCostUsd.value.toFixed(4) }),
        t('agent.statusSlashCommands', { count: slashCommands.value.length }),
        contextTokens.value > 0 ? t('agent.statusContextTokens', { count: contextTokens.value.toLocaleString() }) : ''
      ].filter(Boolean)
      addAssistantMessage(lines.join('\n'))
      return true
    }

    if (lower === '/cost') {
      addAssistantMessage(t('agent.costSummary', { cost: totalCostUsd.value.toFixed(4) }))
      return true
    }

    if (lower === '/help') {
      const localLines = builtinSlashCommands.value.map(command => {
        const suffix = command.argumentHint ? ` ${command.argumentHint}` : ''
        const description = command.description ? ` - ${command.description}` : ''
        return `  ${command.name}${suffix}${description}`
      })

      const sdkLines = sdkSlashCommands.value.map(command => {
        const suffix = command.argumentHint ? ` ${command.argumentHint}` : ''
        const description = command.description ? ` - ${command.description}` : ''
        return `  ${command.name}${suffix}${description}`
      })

      const sections = [
        t('agent.slashTitle'),
        ...localLines
      ]

      if (sdkLines.length > 0) {
        sections.push('', t('agent.slashSdkTitle'), ...sdkLines)
      }

      addAssistantMessage(sections.join('\n'))
      return true
    }

    if (lower === '/clear') {
      if (options.onClearRequested) {
        await options.onClearRequested()
      }
      return true
    }

    return false
  }

  return {
    triggerSessionAppDraft,
    submitSessionAppDraft,
    cancelSessionAppDraft,
    triggerScheduledTaskDraft,
    submitScheduledTaskDraft,
    cancelScheduledTaskDraft,
    handleLocalSlashCommand
  }
}

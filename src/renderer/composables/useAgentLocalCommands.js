export function useAgentLocalCommands({
  sessionId,
  t,
  options = {},
  messages,
  selectedModel,
  activeModel,
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
  const buildScheduledTaskName = (prompt) => {
    const firstLine = String(prompt || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean)

    if (!firstLine) return t('agent.scheduleDraftDefaultName')
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}...` : firstLine
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
    const scheduleType = ['interval', 'daily', 'weekly'].includes(draft.scheduleType)
      ? draft.scheduleType
      : 'interval'

    const weeklyDays = Array.isArray(draft.weeklyDays)
      ? Array.from(new Set(draft.weeklyDays
        .map(day => Number(day))
        .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)))
      : [1]

    const intervalMinutes = Math.max(1, Number(draft.intervalMinutes) || 60)
    const maxTurnsValue = Number(draft.maxTurns)
    const maxTurns = Number.isInteger(maxTurnsValue) && maxTurnsValue > 0 ? maxTurnsValue : null

    return {
      name: String(draft.name || '').trim(),
      prompt: String(draft.prompt || '').trim(),
      cwd: typeof draft.cwd === 'string' && draft.cwd.trim() ? draft.cwd.trim() : null,
      apiProfileId: draft.apiProfileId || null,
      modelTier: draft.modelTier || selectedModel.value || 'sonnet',
      maxTurns,
      enabled: draft.enabled !== false,
      scheduleType,
      intervalMinutes,
      dailyTime: String(draft.dailyTime || '09:00').trim() || '09:00',
      weeklyDays: weeklyDays.length > 0 ? weeklyDays : [1]
    }
  }

  const getToolMessageById = (messageId) => messages.value.find(msg => msg.id === messageId && msg.role === 'tool')

  const createScheduledTaskDraft = (parsedCommand) => {
    const prompt = parsedCommand.args || getLatestSchedulablePrompt()
    const draftId = `scheduled-task-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const draft = normalizeScheduledTaskDraft({
      name: buildScheduledTaskName(prompt),
      prompt,
      cwd: options.sessionCwd || null,
      apiProfileId: options.apiProfileId || null,
      modelTier: selectedModel.value || 'sonnet',
      maxTurns: null,
      enabled: true,
      scheduleType: 'interval',
      intervalMinutes: 60,
      dailyTime: '09:00',
      weeklyDays: [1]
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

  const triggerScheduledTaskDraft = (prompt = '') => {
    createScheduledTaskDraft({
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

      const result = await window.electronAPI.createScheduledTask(payload)
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

  const handleLocalSlashCommand = async (parsedCommand) => {
    if (!slashCommandsReady.value) {
      return false
    }

    const lower = parsedCommand.lowerName

    if (lower === '/compact') {
      await compactConversation()
      return true
    }

    if (lower === '/schedule') {
      createScheduledTaskDraft(parsedCommand)
      return true
    }

    if (lower === '/status') {
      const lines = [
        t('agent.statusSession', { id: sessionId.substring(0, 8) }),
        t('agent.statusCliSession', { status: hasActiveSession.value ? t('agent.statusCliActive') : t('agent.statusCliInactive') }),
        t('agent.statusModel', { model: activeModel.value || t('agent.statusModelUnknown') }),
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
    triggerScheduledTaskDraft,
    submitScheduledTaskDraft,
    cancelScheduledTaskDraft,
    handleLocalSlashCommand
  }
}

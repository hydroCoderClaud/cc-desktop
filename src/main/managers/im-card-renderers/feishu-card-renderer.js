const { formatRelativeTime } = require('../im-utils')

function chunkCardActions(actions, chunkSize = 5) {
  const chunks = []
  for (let index = 0; index < actions.length; index += chunkSize) {
    chunks.push({
      tag: 'action',
      actions: actions.slice(index, index + chunkSize)
    })
  }
  return chunks
}

function buildCommandButton(label, value, type = 'default') {
  return {
    tag: 'button',
    type,
    text: {
      tag: 'plain_text',
      content: label
    },
    value
  }
}

function buildCardContextValue(context = null, normalizeDisplayName = null) {
  if (!context || typeof context !== 'object') return {}
  const normalize = typeof normalizeDisplayName === 'function'
    ? normalizeDisplayName
    : (value) => value
  const senderName = normalize(context.senderName || context.nickname || null, context.senderId || context.userId || null)
  const chatName = normalize(context.chatName || null, context.chatId || null)
  return {
    senderId: context.senderId || context.userId || null,
    senderName: senderName || null,
    chatId: context.chatId || null,
    chatType: context.chatType || 'p2p',
    chatName: chatName || null,
  }
}

function attachCardContext(action, context = null, normalizeDisplayName = null) {
  if (!context || !action || typeof action !== 'object') return action
  const value = action.value && typeof action.value === 'object'
    ? { ...action.value, ...buildCardContextValue(context, normalizeDisplayName) }
    : action.value
  return {
    ...action,
    value,
  }
}

function buildResultCard({ title, summary, actions = [], context = null, normalizeDisplayName = null }) {
  const actionsWithContext = actions.map(action => attachCardContext(action, context, normalizeDisplayName))
  return {
    config: { wide_screen_mode: true },
    header: {
      title: {
        tag: 'plain_text',
        content: title
      }
    },
    elements: [
      {
        tag: 'markdown',
        content: summary
      },
      {
        tag: 'action',
        actions: actionsWithContext
      }
    ]
  }
}

function buildHistoryChoiceCard({
  sessions,
  currentSessionId = null,
  context = null,
  maxSessions = 10,
  getDirName,
  getProfileName,
  isSessionActivated,
  normalizeDisplayName = null,
  title = '历史会话',
  readOnly = false,
}) {
  const displaySessions = sessions.slice(0, maxSessions)
  const actionContext = context ? {
    senderId: context.senderId || context.userId || null,
    senderName: context.senderName || context.nickname || null,
    chatId: context.chatId || null,
    chatType: context.chatType || 'p2p',
    chatName: context.chatName || null,
  } : null
  const elements = [
    {
        tag: 'markdown',
        content: displaySessions.map((row, index) => {
        const timeStr = formatRelativeTime(row.updated_at)
        const dir = row.cwd ? getDirName(row.cwd) : '-'
        const profileName = getProfileName(row.api_profile_id)
        const marker = currentSessionId && row.session_id === currentSessionId
          ? '✅'
          : (isSessionActivated(row.session_id) ? '🔵' : '⭕')
        return `${index + 1}. ${marker} [${timeStr}] ${row.title || '(无标题)'} (${dir}) ${profileName}`
      }).join('\n')
    },
  ]

  if (!readOnly) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          type: 'primary',
          text: {
            tag: 'plain_text',
            content: '新建会话'
          },
          value: {
            intent: 'new',
            source: 'history-choice',
            ...(actionContext || {})
          }
        },
        {
          tag: 'button',
          type: 'default',
          text: {
            tag: 'plain_text',
            content: '查看活跃会话'
          },
          value: {
            intent: 'sessions'
          }
        }
      ]
    })

    const resumeActions = displaySessions.map((row, index) => ({
      tag: 'button',
      type: currentSessionId && row.session_id === currentSessionId ? 'primary' : 'default',
      text: {
        tag: 'plain_text',
        content: `恢复 ${index + 1}`
      },
      value: {
        intent: 'resume',
        index: index + 1,
        title: row.title || '',
        source: 'history-choice',
        ...(actionContext || {})
      }
    }))
    elements.splice(1, 0, ...chunkCardActions(resumeActions))
  } else {
    elements.push({
      tag: 'action',
      actions: [
        buildCommandButton('活跃会话', { intent: 'sessions' }, 'primary'),
        buildCommandButton('新建会话', { intent: 'new', ...(actionContext || {}) }),
        buildCommandButton('查看帮助', { intent: 'help' })
      ]
    })
  }

  if (sessions.length > displaySessions.length) {
    elements.splice(1, 0, {
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `仅显示最近 ${displaySessions.length} 条，共 ${sessions.length} 条`
        }
      ]
    })
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: {
        tag: 'plain_text',
        content: title
      }
    },
    elements
  }
}

function buildSessionsCard({
  activeSessions,
  currentSessionId = null,
  title = '活跃会话',
  summary = null,
  context = null,
  maxSessions = 10,
  getDirName,
  getProfileName,
  normalizeDisplayName = null,
}) {
  const displaySessions = activeSessions.slice(0, maxSessions)
  const elements = []

  if (summary) {
    elements.push({
      tag: 'markdown',
      content: summary
    })
  }

  elements.push(
    {
      tag: 'markdown',
      content: displaySessions.map((session, index) => {
        const dir = session.cwd ? getDirName(session.cwd) : '-'
        const profileName = getProfileName(session.apiProfileId)
        const marker = session.id === currentSessionId ? '✅' : '🔵'
        return `${index + 1}. ${marker} ${session.title || session.id.substring(0, 8)} (${dir}) ${profileName}`
      }).join('\n')
    },
    {
      tag: 'action',
      actions: [
        buildCommandButton('新建会话', { intent: 'new', ...(context || {}) }, 'primary'),
        buildCommandButton('查看状态', { intent: 'status' }),
        buildCommandButton('查看帮助', { intent: 'help' })
      ]
    }
  )

  const closeActions = displaySessions.map((session, index) => buildCommandButton(
    `关闭 ${index + 1}`,
    {
      intent: 'close',
      index: index + 1,
      title: session.title || ''
    },
    session.id === currentSessionId ? 'primary' : 'default'
  ))
  elements.splice(summary ? 2 : 1, 0, ...chunkCardActions(closeActions))

  if (activeSessions.length > displaySessions.length) {
    elements.splice(summary ? 2 : 1, 0, {
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `仅显示最近 ${displaySessions.length} 条，共 ${activeSessions.length} 条`
        }
      ]
    })
  }

  return {
    config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: title
        }
      },
      elements
  }
}

function buildHelpCard({ summary, context = null, normalizeDisplayName = null }) {
  return buildResultCard({
    title: '飞书命令帮助',
    summary,
    context,
    normalizeDisplayName,
    actions: [
      buildCommandButton('新建会话', { intent: 'new', ...(context || {}) }, 'primary'),
      buildCommandButton('活跃会话', { intent: 'sessions' }),
      buildCommandButton('查看状态', { intent: 'status' }),
      buildCommandButton('恢复历史会话', { command: 'resume' })
    ]
  })
}

function buildStatusCard({ summary, context = null, normalizeDisplayName = null }) {
  return buildResultCard({
    title: '系统状态',
    summary,
    context,
    normalizeDisplayName,
    actions: [
      buildCommandButton('活跃会话', { intent: 'sessions' }, 'primary'),
      buildCommandButton('新建会话', { intent: 'new', ...(context || {}) }),
      buildCommandButton('查看帮助', { intent: 'help' })
    ]
  })
}

module.exports = {
  buildHistoryChoiceCard,
  buildSessionsCard,
  buildHelpCard,
  buildStatusCard,
  buildResultCard,
  buildCommandButton,
  chunkCardActions,
  attachCardContext,
  buildCardContextValue,
}

const {
  buildActiveSessionsText,
  buildStatusText,
} = require('./im-command-presenter')

function buildSharedStatusText({
  bridgeLabel,
  connected,
  activeSessions,
  currentSession,
  getProfileName,
}) {
  return buildStatusText({
    bridgeLabel,
    connected,
    activeSessions,
    currentSession,
    getProfileName,
  })
}

function buildSharedSessionsText({
  activeSessions,
  currentSessionId,
  getDirName,
  getProfileName,
}) {
  return buildActiveSessionsText({
    activeSessions,
    currentSessionId,
    getDirName,
    getProfileName,
  })
}

function resolveCloseCommand({
  args,
  activeSessions,
  currentSessionId,
  getSessionById,
}) {
  const safeArgs = Array.isArray(args) ? args : []
  const safeSessions = Array.isArray(activeSessions) ? activeSessions : []
  const hasIndexArg = safeArgs.length > 0

  let selectedIndex = null
  let targetSessionId = currentSessionId || null
  let targetSession = targetSessionId && typeof getSessionById === 'function'
    ? getSessionById(targetSessionId)
    : null

  if (hasIndexArg) {
    selectedIndex = Number.parseInt(safeArgs[0], 10)
    if (Number.isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > safeSessions.length) {
      return {
        action: 'invalid_index',
        max: safeSessions.length,
      }
    }
    targetSession = safeSessions[selectedIndex - 1] || null
    targetSessionId = targetSession?.id || null
  }

  if (!targetSessionId) {
    return {
      action: 'missing_current',
    }
  }

  if (targetSession?.status === 'streaming') {
    return {
      action: 'streaming',
      targetedByIndex: hasIndexArg,
    }
  }

  return {
    action: 'close',
    targetSessionId,
    targetSession,
    selectedIndex,
    closeText: hasIndexArg
      ? `会话 ${selectedIndex} 已关闭：${targetSession?.title || targetSessionId.substring(0, 8)}`
      : '会话已关闭',
  }
}

function resolveRenameCommand({
  args,
  currentSessionId,
}) {
  if (!currentSessionId) {
    return {
      action: 'missing_current',
    }
  }

  const newTitle = Array.isArray(args) ? args.join(' ').trim() : ''
  if (!newTitle) {
    return {
      action: 'missing_title',
    }
  }

  return {
    action: 'rename',
    sessionId: currentSessionId,
    newTitle,
  }
}

module.exports = {
  buildSharedStatusText,
  buildSharedSessionsText,
  resolveCloseCommand,
  resolveRenameCommand,
}

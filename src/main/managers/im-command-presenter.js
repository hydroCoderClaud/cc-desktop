const { formatRelativeTime } = require('./im-utils')

function buildHistoryChoiceMenuText({
  sessions,
  currentSessionId = null,
  maxSessions = 10,
  getDirName,
  getProfileName,
  isSessionActivated,
  title = '您有以下历史会话，请回复数字选择：',
  includeActionHint = true,
  includeNewSessionHint = true,
}) {
  const displaySessions = Array.isArray(sessions) ? sessions.slice(0, maxSessions) : []
  const lines = [title, '']

  displaySessions.forEach((row, index) => {
    const timeStr = formatRelativeTime(row.updated_at)
    const dir = row.cwd ? getDirName(row.cwd) : '-'
    const profileName = getProfileName(row.api_profile_id)
    const marker = currentSessionId && row.session_id === currentSessionId
      ? '✅ '
      : (isSessionActivated(row.session_id) ? '🔵 ' : '⭕ ')
    lines.push(`${index + 1}. ${marker}[${timeStr}] ${row.title || '(无标题)'} (${dir}) ${profileName}`)
  })

  if (Array.isArray(sessions) && sessions.length > displaySessions.length) {
    lines.push('', `（仅显示最近 ${displaySessions.length} 条，共 ${sessions.length} 条）`)
  }

  if (includeActionHint && includeNewSessionHint) {
    lines.push('', '回复 0 开始全新会话')
  }
  return lines.join('\n')
}

function buildActiveSessionsText({
  activeSessions,
  currentSessionId,
  getDirName,
  getProfileName,
}) {
  if (!Array.isArray(activeSessions) || activeSessions.length === 0) {
    return '暂无活跃会话'
  }

  const lines = ['活跃会话：', '']
  activeSessions.forEach((session, index) => {
    const marker = session.id === currentSessionId ? '✅ ' : ''
    const dir = session.cwd ? getDirName(session.cwd) : '-'
    const profileName = getProfileName(session.apiProfileId)
    lines.push(`${index + 1}. ${marker}${session.title || session.id.substring(0, 8)} (${dir}) ${profileName}`)
  })
  lines.push('', '使用 /close 关闭当前会话')
  return lines.join('\n')
}

function buildStatusText({
  bridgeLabel,
  connected,
  activeSessions,
  currentSession,
  getProfileName,
}) {
  const safeSessions = Array.isArray(activeSessions) ? activeSessions : []
  const streaming = safeSessions.filter(session => session.status === 'streaming').length
  const idle = safeSessions.filter(session => session.status === 'idle').length
  const lines = ['系统状态', `├─ ${bridgeLabel}: ${connected ? '已连接' : '未连接'}`]

  if (currentSession?.queryGenerator) {
    const profileName = getProfileName(currentSession.apiProfileId)
    lines.push(`├─ 当前会话: ${currentSession.title} (${profileName})`)
  }

  lines.push(`├─ 执行中: ${streaming} 个 / 空闲: ${idle} 个`)
  lines.push(`└─ 总会话数: ${safeSessions.length} 个`)
  return lines.join('\n')
}

function buildCommandHelpText(lines) {
  return Array.isArray(lines) ? lines.join('\n') : ''
}

module.exports = {
  buildHistoryChoiceMenuText,
  buildActiveSessionsText,
  buildStatusText,
  buildCommandHelpText,
}

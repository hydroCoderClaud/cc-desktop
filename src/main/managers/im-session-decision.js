async function resolveStrictCurrentSessionId(sessionMapper, mapKey) {
  if (!sessionMapper || !mapKey) return null
  return sessionMapper.resolveActiveSessionId(mapKey)
}

async function ensureHistoryChoiceOrCurrent({
  sessionMapper,
  mapKey,
  identity,
  resolveBoundSessionId,
}) {
  const currentSessionId = await resolveStrictCurrentSessionId(sessionMapper, mapKey)
  if (currentSessionId) {
    return {
      action: 'use_current',
      sessionId: currentSessionId,
      mapKey,
    }
  }

  if (typeof resolveBoundSessionId === 'function') {
    const boundSessionId = await resolveBoundSessionId()
    if (boundSessionId) {
      sessionMapper.sessionMap.set(mapKey, boundSessionId)
      return {
        action: 'use_bound',
        sessionId: boundSessionId,
        mapKey,
      }
    }
  }

  const historySessions = await sessionMapper._queryHistorySessions(identity)
  if (Array.isArray(historySessions) && historySessions.length > 0) {
    return {
      action: 'show_choice',
      sessions: historySessions,
      mapKey,
    }
  }

  const sessionId = await sessionMapper.createSession(identity)
  if (sessionId) {
    sessionMapper.sessionMap.set(mapKey, sessionId)
  }
  return {
    action: 'create_new',
    sessionId,
    mapKey,
  }
}

module.exports = {
  resolveStrictCurrentSessionId,
  ensureHistoryChoiceOrCurrent,
}

export const getSessionHostKind = (session) => {
  if (!session || typeof session !== 'object') return 'agent'
  if (session.type === 'notebook') return 'notebook'
  if (session.clientType === 'embedded') return 'embedded'
  return 'agent'
}

const normalizeSessionId = (sessionId) => typeof sessionId === 'string' ? sessionId.trim() : ''

export function createImSessionHostRouter({
  getSessionRouting,
  getSession,
  restoreNotebookSession,
  restoreEmbeddedSession,
  onError = console.error
} = {}) {
  const restoresInFlight = new Map()

  const safelyResolve = async (loader, sessionId) => {
    if (typeof loader !== 'function') return null
    try {
      return await loader(sessionId)
    } catch {
      return null
    }
  }

  const resolveSession = async (sessionId) => {
    const routingSession = await safelyResolve(getSessionRouting, sessionId)
    const session = await safelyResolve(getSession, sessionId)
    return session || routingSession
  }

  const restoreSpecializedHost = (sessionId) => {
    const normalizedSessionId = normalizeSessionId(sessionId)
    if (!normalizedSessionId) {
      return Promise.resolve({ session: null, hostKind: 'agent', restored: false })
    }

    const existing = restoresInFlight.get(normalizedSessionId)
    if (existing) return existing

    const task = (async () => {
      try {
        const session = await resolveSession(normalizedSessionId)
        const hostKind = getSessionHostKind(session)

        if (hostKind === 'notebook') {
          return {
            session,
            hostKind,
            restored: Boolean(await restoreNotebookSession?.(session))
          }
        }
        if (hostKind === 'embedded') {
          return {
            session,
            hostKind,
            restored: Boolean(await restoreEmbeddedSession?.(session))
          }
        }
        return { session, hostKind, restored: false }
      } catch (err) {
        onError('[ImSessionHostRouter] Failed to restore specialized session host:', err)
        return { session: null, hostKind: 'agent', restored: false }
      }
    })()

    restoresInFlight.set(normalizedSessionId, task)
    void task.then(() => {
      if (restoresInFlight.get(normalizedSessionId) === task) {
        restoresInFlight.delete(normalizedSessionId)
      }
    })
    return task
  }

  return { restoreSpecializedHost }
}

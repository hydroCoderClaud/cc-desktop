const { safeSend } = require('../utils/safe-send')

function setupSessionAppHandlers(ipcMain, sessionAppManager, agentSessionManager = null, mainWindow = null) {
  if (!sessionAppManager) {
    console.warn('[IPC] SessionAppManager not available, skipping session app handlers')
    return
  }

  ipcMain.handle('session-app:list', async () => {
    return sessionAppManager.listApps()
  })

  ipcMain.handle('session-app:get', async (_event, appId) => {
    return sessionAppManager.getApp(appId)
  })

  ipcMain.handle('session-app:create', async (_event, input = {}) => {
    return sessionAppManager.createApp(input)
  })

  ipcMain.handle('session-app:update', async (_event, { appId, updates }) => {
    return sessionAppManager.updateApp(appId, updates || {})
  })

  ipcMain.handle('session-app:duplicate', async (_event, { appId, overrides }) => {
    return sessionAppManager.duplicateApp(appId, overrides || {})
  })

  ipcMain.handle('session-app:delete', async (_event, appId) => {
    return sessionAppManager.deleteApp(appId)
  })

  ipcMain.handle('session-app:launch', async (_event, { appId, input, sessionOptions = {} }) => {
    if (!agentSessionManager) {
      throw new Error('AgentSessionManager not available')
    }

    const { app, runtime, binding } = sessionAppManager.createLaunchPayload({ appId, input })

    const session = agentSessionManager.create({
      type: 'chat',
      title: sessionOptions.title || app.name,
      cwd: sessionOptions.cwd || runtime.defaultContext?.cwd || null,
      apiProfileId: sessionOptions.apiProfileId || runtime.defaultContext?.apiProfileId || null,
      modelId: sessionOptions.modelId || runtime.defaultContext?.modelId || null,
      sessionAppBinding: binding
    })

    if (runtime.startupMessageTemplate) {
      agentSessionManager.sendMessage(session.id, runtime.startupMessageTemplate, {
        model: sessionOptions.modelId || runtime.defaultContext?.modelId || null
      }).catch(err => {
        console.error('[IPC] session-app:launch startup sendMessage error:', err)
      })
    }

    return session
  })

  ipcMain.handle('session-app:openConversation', async (_event, sessionId) => {
    if (!agentSessionManager) {
      throw new Error('AgentSessionManager not available')
    }

    const session = agentSessionManager.get(sessionId)
    const historicalSession = agentSessionManager.sessionDatabase?.getAgentConversation?.(sessionId) || null
    if (!session?.id && !historicalSession) {
      throw new Error('Session not found')
    }

    const targetSessionId = session?.id || sessionId
    safeSend(mainWindow, 'session-app:openConversationRequested', { sessionId: targetSessionId })

    return session || {
      id: targetSessionId,
      status: historicalSession?.status || 'closed'
    }
  })
}

module.exports = {
  setupSessionAppHandlers
}

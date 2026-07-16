import { describe, expect, it, vi } from 'vitest'

function createMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn)
    }
  }
}

describe('session-app IPC handlers', () => {
  it('opens historical session-app conversations even when the session is currently closed', async () => {
    const { setupSessionAppHandlers } = await import('../../src/main/ipc-handlers/session-app-handlers.js')
    const ipcMain = createMockIpcMain()
    const sent = []
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => sent.push({ channel, payload })
      }
    }

    const sessionAppManager = {
      listApps: vi.fn(),
      getApp: vi.fn(),
      getAppDefinition: vi.fn(),
      listAppVersions: vi.fn(),
      getAppVersion: vi.fn(),
      listDrafts: vi.fn(),
      getDraft: vi.fn(),
      createDraft: vi.fn(),
      updateDraft: vi.fn(),
      deleteDraft: vi.fn(),
      deleteApp: vi.fn(),
      publishDraft: vi.fn(),
      createLaunchPayload: vi.fn()
    }

    const agentSessionManager = {
      get: vi.fn(() => null),
      reopen: vi.fn(() => null),
      sessionDatabase: {
        getAgentConversation: vi.fn((sessionId) => sessionId === 'closed-session-1'
          ? { session_id: 'closed-session-1', status: 'closed' }
          : null)
      }
    }

    setupSessionAppHandlers(ipcMain, sessionAppManager, agentSessionManager, mainWindow)
    const handler = ipcMain.handlers.get('session-app:openConversation')

    const result = await handler(null, 'closed-session-1')

    expect(agentSessionManager.get).toHaveBeenCalledWith('closed-session-1')
    expect(agentSessionManager.sessionDatabase.getAgentConversation).toHaveBeenCalledWith('closed-session-1')
    expect(result).toEqual({
      id: 'closed-session-1',
      status: 'closed'
    })
    expect(sent).toEqual([{
      channel: 'session-app:openConversationRequested',
      payload: { sessionId: 'closed-session-1' }
    }])
  })

  it('still throws when neither active session nor persisted history exists', async () => {
    const { setupSessionAppHandlers } = await import('../../src/main/ipc-handlers/session-app-handlers.js')
    const ipcMain = createMockIpcMain()

    setupSessionAppHandlers(
      ipcMain,
      {},
      {
        get: vi.fn(() => null),
        reopen: vi.fn(() => null),
        sessionDatabase: {
          getAgentConversation: vi.fn(() => null)
        }
      },
      null
    )

    const handler = ipcMain.handlers.get('session-app:openConversation')

    await expect(handler(null, 'missing-session')).rejects.toThrow('Session not found')
  })

  it('notifies the main renderer after deleting a session app', async () => {
    const { setupSessionAppHandlers } = await import('../../src/main/ipc-handlers/session-app-handlers.js')
    const ipcMain = createMockIpcMain()
    const sent = []
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => sent.push({ channel, payload })
      }
    }
    const sessionAppManager = {
      deleteApp: vi.fn(() => ({ success: true }))
    }

    setupSessionAppHandlers(ipcMain, sessionAppManager, null, mainWindow)
    const result = await ipcMain.handlers.get('session-app:delete')(null, 'sap-weekly')

    expect(result).toEqual({ success: true })
    expect(sessionAppManager.deleteApp).toHaveBeenCalledWith('sap-weekly')
    expect(sent).toEqual([{
      channel: 'session-app:changed',
      payload: { action: 'deleted', appId: 'sap-weekly' }
    }])
  })
})

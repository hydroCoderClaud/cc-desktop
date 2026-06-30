import { describe, expect, it, vi } from 'vitest'

const { AgentSession } = await import('../../src/main/agent-session.js')

const { SessionAppManager } = await import('../../src/main/managers/session-app-manager.js')

describe('SessionAppManager', () => {
  it('creates and updates a single current app definition', () => {
    const apps = new Map()
    const sessionDatabase = {
      listSessionApps: vi.fn(() => Array.from(apps.values())),
      getSessionApp: vi.fn((appId) => apps.get(appId) || null),
      createSessionApp: vi.fn((app) => {
        const record = { ...app, createdAt: Date.now(), updatedAt: Date.now() }
        apps.set(app.appId, record)
        return record
      }),
      updateSessionApp: vi.fn((appId, updates = {}) => {
        const record = { ...(apps.get(appId) || {}), ...updates, appId, updatedAt: Date.now() }
        apps.set(appId, record)
        return record
      }),
      duplicateSessionApp: vi.fn((sourceAppId, newAppId, overrides = {}) => {
        const source = apps.get(sourceAppId)
        const record = { ...source, ...overrides, appId: newAppId, updatedAt: Date.now() }
        apps.set(newAppId, record)
        return record
      }),
      deleteSessionApp: vi.fn((appId) => {
        apps.delete(appId)
        return { success: true }
      })
    }

    const manager = new SessionAppManager(sessionDatabase)
    const created = manager.createApp({
      name: 'Weekly Assistant',
      description: 'Build weekly reports',
      systemPrompt: 'You are weekly assistant',
      allowedCapabilities: ['mcp:weekly'],
      defaultContext: { cwd: 'C:/proj' },
      startupMessageTemplate: 'Generate this week report'
    })

    expect(created.appId).toMatch(/^sap-/)
    expect(created.name).toBe('Weekly Assistant')

    const updated = manager.updateApp(created.appId, {
      description: 'Build weekly reports in markdown'
    })
    expect(updated.description).toBe('Build weekly reports in markdown')
    expect(updated.allowedCapabilities).toEqual(['mcp:weekly'])
    expect(updated.inputSchema).toEqual([])
    expect(updated.outputHints).toEqual([])

    const launchPayload = manager.createLaunchPayload({ appId: created.appId })
    expect(launchPayload.binding).toEqual(expect.objectContaining({
      sessionAppId: created.appId,
      sessionAppInput: null
    }))
    expect(launchPayload.runtime).toEqual(expect.objectContaining({
      systemPrompt: 'You are weekly assistant',
      startupMessageTemplate: 'Generate this week report',
      defaultContext: { cwd: 'C:/proj' }
    }))
  })

  it('duplicates and deletes apps', () => {
    const apps = new Map([
      ['sap-weekly', {
        appId: 'sap-weekly',
        name: 'Weekly Assistant',
        description: 'Build weekly reports'
      }]
    ])

    const sessionDatabase = {
      getSessionApp: vi.fn((appId) => apps.get(appId) || null),
      duplicateSessionApp: vi.fn((sourceAppId, newAppId, overrides = {}) => {
        const source = apps.get(sourceAppId)
        const record = { ...source, ...overrides, appId: newAppId }
        apps.set(newAppId, record)
        return record
      }),
      deleteSessionApp: vi.fn((appId) => {
        apps.delete(appId)
        return { success: true }
      })
    }

    const agentSessionManager = {
      sessions: new Map()
    }
    const liveAppSession = new AgentSession({
      id: 'live-app-1',
      sessionAppId: 'sap-weekly',
      sessionAppInput: { range: 'this-week' }
    })
    const otherSession = new AgentSession({
      id: 'plain-1'
    })
    agentSessionManager.sessions.set(liveAppSession.id, liveAppSession)
    agentSessionManager.sessions.set(otherSession.id, otherSession)

    const manager = new SessionAppManager(sessionDatabase, agentSessionManager)
    const duplicate = manager.duplicateApp('sap-weekly', { name: 'Weekly Assistant Copy' })

    expect(duplicate.appId).toMatch(/^sap-/)
    expect(duplicate.name).toBe('Weekly Assistant Copy')
    expect(manager.deleteApp('sap-weekly')).toEqual({ success: true })
    expect(sessionDatabase.deleteSessionApp).toHaveBeenCalledWith('sap-weekly')
    expect(liveAppSession.sessionAppId).toBeNull()
    expect(liveAppSession.sessionAppInput).toBeNull()
    expect(otherSession.sessionAppId).toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'

const { AgentSession } = await import('../../src/main/agent-session.js')

const { SessionAppManager } = await import('../../src/main/managers/session-app-manager.js')

const normalizePath = (value) => String(value || '').replace(/\\/g, '/')

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

    const agentSessionManager = {
      configManager: {
        getConfig: () => ({
          settings: {
            agent: {
              outputBaseDir: 'C:/agent-output'
            }
          }
        })
      }
    }

    const manager = new SessionAppManager(sessionDatabase, agentSessionManager)
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

    const createdWithDefaultCwd = manager.createApp({
      name: 'Default Workspace App'
    })
    expect(normalizePath(createdWithDefaultCwd.defaultContext.cwd)).toBe('C:/agent-output/sessionapp')

    const updatedWithEmptyCwd = manager.updateApp(created.appId, {
      defaultContext: { cwd: '   ' }
    })
    expect(normalizePath(updatedWithEmptyCwd.defaultContext.cwd)).toBe('C:/agent-output/sessionapp')

    const createdWithRuntimeDefaults = manager.createApp({
      name: 'Runtime Defaults App',
      defaultContext: {
        cwd: 'C:/runtime-app',
        apiProfileId: 'profile-keep',
        modelId: 'sonnet-4'
      }
    })
    const updatedWithMergedContext = manager.updateApp(createdWithRuntimeDefaults.appId, {
      defaultContext: {
        cwd: 'C:/runtime-app-updated'
      }
    })
    expect(updatedWithMergedContext.defaultContext).toEqual({
      cwd: 'C:/runtime-app-updated'
    })
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
      sessions: new Map(),
      configManager: {
        getConfig: () => ({
          settings: {
            agent: {
              outputBaseDir: 'C:/agent-output'
            }
          }
        })
      }
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
    expect(normalizePath(duplicate.defaultContext.cwd)).toBe('C:/agent-output/sessionapp')
    expect(manager.deleteApp('sap-weekly')).toEqual({ success: true })
    expect(sessionDatabase.deleteSessionApp).toHaveBeenCalledWith('sap-weekly')
    expect(liveAppSession.sessionAppId).toBeNull()
    expect(liveAppSession.sessionAppInput).toBeNull()
    expect(otherSession.sessionAppId).toBeNull()
  })

  it('launches a session app by reusing AgentSessionManager.create and sendMessage', async () => {
    const apps = new Map([
      ['sap-weekly', {
        appId: 'sap-weekly',
        name: 'Weekly Assistant',
        systemPrompt: 'You are weekly assistant',
        startupMessageTemplate: 'Generate this week report',
        defaultContext: {
          cwd: 'C:/proj'
        },
        allowedCapabilities: ['mcp:hydrodesktop']
      }]
    ])

    const sessionDatabase = {
      getSessionApp: vi.fn((appId) => apps.get(appId) || null)
    }

    const createdSession = new AgentSession({
      id: 'session-app-run-1',
      title: 'Weekly Assistant',
      cwd: 'C:/custom-proj/conv-12345678',
      sessionAppId: 'sap-weekly',
      sessionAppInput: { range: 'this-week' }
    })

    const agentSessionManager = {
      create: vi.fn(() => createdSession),
      sendMessage: vi.fn(async () => ({ success: true })),
      configManager: {
        getConfig: () => ({
          settings: {
            agent: {
              outputBaseDir: 'C:/agent-output'
            }
          }
        })
      }
    }

    const manager = new SessionAppManager(sessionDatabase, agentSessionManager)
    const launched = manager.launchApp({
      appId: 'sap-weekly',
      input: { range: 'this-week' },
      sessionOptions: {
        title: 'Weekly Run',
        cwd: 'C:/custom-proj',
        apiProfileId: 'profile-1',
        modelId: 'sonnet-4'
      }
    })

    expect(launched).toBe(createdSession)
    const createArg = agentSessionManager.create.mock.calls[0][0]
    expect(createArg).toMatchObject({
      type: 'chat',
      title: 'Weekly Run',
      cwdSubDir: undefined,
      apiProfileId: 'profile-1',
      modelId: 'sonnet-4',
      sessionAppBinding: {
        sessionAppId: 'sap-weekly',
        sessionAppInput: { range: 'this-week' }
      }
    })
    expect(normalizePath(createArg.cwd)).toMatch(/^C:\/custom-proj\/conv-[a-z0-9]{8}$/)
    expect(normalizePath(createArg.cwd)).not.toBe('C:/custom-proj')
    expect(agentSessionManager.sendMessage).toHaveBeenCalledWith(
      'session-app-run-1',
      'Generate this week report',
      {
        model: 'sonnet-4'
      }
    )
  })

  it('falls back to the configured sessionapp workspace root when app base cwd is unavailable', () => {
    const apps = new Map([
      ['sap-empty', {
        appId: 'sap-empty',
        name: 'Empty Workspace App',
        startupMessageTemplate: '',
        defaultContext: null
      }]
    ])

    const sessionDatabase = {
      getSessionApp: vi.fn((appId) => apps.get(appId) || null)
    }

    const createdSession = new AgentSession({
      id: 'session-app-run-empty',
      title: 'Empty Workspace App',
      sessionAppId: 'sap-empty'
    })

    const agentSessionManager = {
      create: vi.fn(() => createdSession),
      sendMessage: vi.fn(async () => ({ success: true })),
      configManager: {
        getConfig: () => ({})
      }
    }

    const manager = new SessionAppManager(sessionDatabase, agentSessionManager)
    manager.launchApp({
      appId: 'sap-empty',
      sessionOptions: {
        cwd: null,
        title: 'Empty Workspace Run'
      }
    })

    const createArg = agentSessionManager.create.mock.calls[0][0]
    expect(createArg).toMatchObject({
      type: 'chat',
      title: 'Empty Workspace Run',
      cwdSubDir: undefined,
      apiProfileId: null,
      modelId: null,
      sessionAppBinding: {
        sessionAppId: 'sap-empty',
        sessionAppInput: null
      }
    })
    expect(normalizePath(createArg.cwd)).toMatch(/cc-desktop-agent-output\/sessionapp\/conv-[a-z0-9]{8}$/)
  })
})

const { v4: uuidv4 } = require('uuid')
const path = require('path')
const {
  getSessionAppDefaultWorkspaceRoot,
  SESSION_APP_WORKSPACE_SUBDIR
} = require('./im-working-directory')

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeObject(value, fallback = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function normalizeCapabilityList(values) {
  return Array.isArray(values)
    ? values
      .map(value => typeof value === 'string' ? value.trim() : '')
      .filter(Boolean)
    : []
}

function normalizeAppDefaultContext(defaultContext, config = {}) {
  const normalizedDefaultContext = normalizeObject(defaultContext, {}) || {}
  const cwd = typeof normalizedDefaultContext.cwd === 'string' && normalizedDefaultContext.cwd.trim()
    ? normalizedDefaultContext.cwd.trim()
    : getSessionAppDefaultWorkspaceRoot(config)

  return {
    ...normalizedDefaultContext,
    cwd
  }
}

function normalizeAppInput(input = {}) {
  return {
    name: normalizeString(input.name, 'Untitled Session App'),
    description: normalizeString(input.description),
    icon: normalizeString(input.icon, 'sessionApp'),
    systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt.trim() : '',
    inputSchema: normalizeArray(input.inputSchema),
    allowedCapabilities: normalizeCapabilityList(input.allowedCapabilities),
    defaultContext: normalizeObject(input.defaultContext, null),
    startupMessageTemplate: typeof input.startupMessageTemplate === 'string'
      ? input.startupMessageTemplate.trim()
      : '',
    workflowHints: normalizeArray(input.workflowHints),
    outputHints: normalizeArray(input.outputHints),
    createdFromSessionId: input.createdFromSessionId || input.sourceSessionId || null
  }
}

function normalizeAppUpdates(input = {}) {
  const updates = {}

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    updates.name = normalizeString(input.name, 'Untitled Session App')
  }
  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    updates.description = normalizeString(input.description)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'icon')) {
    updates.icon = normalizeString(input.icon, 'sessionApp')
  }
  if (Object.prototype.hasOwnProperty.call(input, 'systemPrompt')) {
    updates.systemPrompt = typeof input.systemPrompt === 'string' ? input.systemPrompt.trim() : ''
  }
  if (Object.prototype.hasOwnProperty.call(input, 'inputSchema')) {
    updates.inputSchema = normalizeArray(input.inputSchema)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'allowedCapabilities')) {
    updates.allowedCapabilities = normalizeCapabilityList(input.allowedCapabilities)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'defaultContext')) {
    updates.defaultContext = normalizeObject(input.defaultContext, null)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'startupMessageTemplate')) {
    updates.startupMessageTemplate = typeof input.startupMessageTemplate === 'string'
      ? input.startupMessageTemplate.trim()
      : ''
  }
  if (Object.prototype.hasOwnProperty.call(input, 'workflowHints')) {
    updates.workflowHints = normalizeArray(input.workflowHints)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'outputHints')) {
    updates.outputHints = normalizeArray(input.outputHints)
  }
  if (
    Object.prototype.hasOwnProperty.call(input, 'createdFromSessionId') ||
    Object.prototype.hasOwnProperty.call(input, 'sourceSessionId')
  ) {
    updates.createdFromSessionId = input.createdFromSessionId || input.sourceSessionId || null
  }

  return updates
}

class SessionAppManager {
  constructor(sessionDatabase, agentSessionManager = null) {
    this.sessionDatabase = sessionDatabase
    this.agentSessionManager = agentSessionManager
  }

  listApps() {
    return this.sessionDatabase.listSessionApps()
  }

  getApp(appId) {
    return this.sessionDatabase.getSessionApp(appId)
  }

  createApp(input = {}) {
    const appId = `sap-${uuidv4().replace(/-/g, '').slice(0, 10)}`
    const normalizedInput = normalizeAppInput(input)
    const config = this.agentSessionManager?.configManager?.getConfig?.() || {}
    return this.sessionDatabase.createSessionApp({
      appId,
      ...normalizedInput,
      defaultContext: normalizeAppDefaultContext(normalizedInput.defaultContext, config)
    })
  }

  updateApp(appId, updates = {}) {
    const app = this.getApp(appId)
    if (!app) {
      throw new Error('Session App not found')
    }
    const normalizedUpdates = normalizeAppUpdates(updates)
    const config = this.agentSessionManager?.configManager?.getConfig?.() || {}
    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'defaultContext')) {
      normalizedUpdates.defaultContext = normalizeAppDefaultContext(normalizedUpdates.defaultContext, config)
    }
    return this.sessionDatabase.updateSessionApp(appId, normalizedUpdates)
  }

  duplicateApp(appId, overrides = {}) {
    const app = this.getApp(appId)
    if (!app) {
      throw new Error('Session App not found')
    }
    const config = this.agentSessionManager?.configManager?.getConfig?.() || {}

    const duplicateAppId = `sap-${uuidv4().replace(/-/g, '').slice(0, 10)}`
    const duplicateName = normalizeString(
      overrides.name,
      normalizeString(app.name, 'Untitled Session App') + ' Copy'
    )

    return this.sessionDatabase.duplicateSessionApp(appId, duplicateAppId, {
      ...normalizeAppInput({
        ...app,
        ...overrides
      }),
      name: duplicateName,
      defaultContext: normalizeAppDefaultContext(overrides.defaultContext ?? app.defaultContext, config)
    })
  }

  deleteApp(appId) {
    const app = this.getApp(appId)
    if (!app) {
      throw new Error('Session App not found')
    }

    const result = this.sessionDatabase.deleteSessionApp(appId)

    const liveSessions = this.agentSessionManager?.sessions
    if (liveSessions instanceof Map) {
      for (const session of liveSessions.values()) {
        if (session?.sessionAppId !== appId) continue
        session.sessionAppId = null
        session.sessionAppInput = null
        if (typeof session.updatedAt?.getTime === 'function') {
          session.updatedAt = new Date()
        }
      }
    }

    return result
  }

  createLaunchPayload({ appId, input = null } = {}) {
    const app = this.getApp(appId)
    if (!app) {
      throw new Error('Session App not found')
    }

    return {
      app,
      binding: {
        sessionAppId: app.appId,
        sessionAppInput: normalizeObject(input, null)
      },
      runtime: {
        defaultContext: normalizeObject(app.defaultContext, null),
        allowedCapabilities: normalizeCapabilityList(app.allowedCapabilities),
        systemPrompt: typeof app.systemPrompt === 'string' ? app.systemPrompt.trim() : '',
        startupMessageTemplate: typeof app.startupMessageTemplate === 'string'
          ? app.startupMessageTemplate.trim()
          : ''
      }
    }
  }

  launchApp({ appId, input = null, sessionOptions = {} } = {}) {
    if (!this.agentSessionManager) {
      throw new Error('AgentSessionManager not available')
    }

    const { app, runtime, binding } = this.createLaunchPayload({ appId, input })
    const config = this.agentSessionManager?.configManager?.getConfig?.() || {}
    const baseCwd = sessionOptions.cwd || runtime.defaultContext?.cwd || getSessionAppDefaultWorkspaceRoot(config)
    const launchCwd = baseCwd
      ? path.join(baseCwd, `conv-${uuidv4().replace(/-/g, '').slice(0, 8)}`)
      : null
    const session = this.agentSessionManager.create({
      type: 'chat',
      title: sessionOptions.title || app.name,
      cwd: launchCwd,
      cwdSubDir: launchCwd ? undefined : SESSION_APP_WORKSPACE_SUBDIR,
      apiProfileId: sessionOptions.apiProfileId || runtime.defaultContext?.apiProfileId || null,
      modelId: sessionOptions.modelId || runtime.defaultContext?.modelId || null,
      sessionAppBinding: binding
    })

    if (runtime.startupMessageTemplate) {
      this.agentSessionManager.sendMessage(session.id, runtime.startupMessageTemplate, {
        model: sessionOptions.modelId || runtime.defaultContext?.modelId || null
      }).catch(err => {
        console.error('[SessionAppManager] launchApp startup sendMessage error:', err)
      })
    }

    return session
  }
}

module.exports = {
  SessionAppManager
}

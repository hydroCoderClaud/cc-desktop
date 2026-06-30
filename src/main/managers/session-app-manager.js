const { v4: uuidv4 } = require('uuid')

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
    return this.sessionDatabase.createSessionApp({
      appId,
      ...normalizeAppInput(input)
    })
  }

  updateApp(appId, updates = {}) {
    const app = this.getApp(appId)
    if (!app) {
      throw new Error('Session App not found')
    }
    return this.sessionDatabase.updateSessionApp(appId, normalizeAppUpdates(updates))
  }

  duplicateApp(appId, overrides = {}) {
    const app = this.getApp(appId)
    if (!app) {
      throw new Error('Session App not found')
    }

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
      name: duplicateName
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
}

module.exports = {
  SessionAppManager
}

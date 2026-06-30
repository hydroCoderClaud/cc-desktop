/**
 * Session App Database Operations Mixin
 *
 * Session App 使用单一定义模型：
 * - session_apps 保存当前可编辑定义
 * - 历史 draft/version 表仅用于迁移兼容，不再参与业务逻辑
 */

function parseJSON(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

function normalizeObject(value, fallback = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function serializeJSON(value, fallback = null) {
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

function mapSessionAppRow(row) {
  if (!row) return null
  return {
    appId: row.app_id,
    name: row.name || '',
    description: row.description || '',
    icon: row.icon || 'sessionApp',
    systemPrompt: row.system_prompt || '',
    inputSchema: parseJSON(row.input_schema, []),
    allowedCapabilities: parseJSON(row.allowed_capabilities, []),
    defaultContext: parseJSON(row.default_context, null),
    startupMessageTemplate: row.startup_message_template || '',
    workflowHints: parseJSON(row.workflow_hints, []),
    outputHints: parseJSON(row.output_hints, []),
    createdFromSessionId: row.created_from_session_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }
}

function buildWritableSessionApp(input = {}) {
  return {
    name: normalizeString(input.name, 'Untitled Session App'),
    description: normalizeString(input.description),
    icon: normalizeString(input.icon, 'sessionApp'),
    systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt.trim() : '',
    inputSchema: normalizeArray(input.inputSchema),
    allowedCapabilities: normalizeArray(input.allowedCapabilities),
    defaultContext: normalizeObject(input.defaultContext, null),
    startupMessageTemplate: typeof input.startupMessageTemplate === 'string'
      ? input.startupMessageTemplate.trim()
      : '',
    workflowHints: normalizeArray(input.workflowHints),
    outputHints: normalizeArray(input.outputHints),
    createdFromSessionId: input.createdFromSessionId || input.sourceSessionId || null
  }
}

function withSessionAppOperations(BaseClass) {
  return class extends BaseClass {
    listSessionApps() {
      const rows = this.db.prepare(`
        SELECT *
        FROM session_apps
        ORDER BY updated_at DESC, app_id DESC
      `).all()

      return rows.map(mapSessionAppRow)
    }

    getSessionApp(appId) {
      const row = this.db.prepare(`
        SELECT *
        FROM session_apps
        WHERE app_id = ?
      `).get(appId)
      return mapSessionAppRow(row)
    }

    createSessionApp(app) {
      const record = buildWritableSessionApp(app)
      const now = Date.now()
      this.db.prepare(`
        INSERT INTO session_apps (
          app_id, name, description, icon, system_prompt, input_schema,
          allowed_capabilities, default_context, startup_message_template,
          workflow_hints, output_hints, created_from_session_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        app.appId,
        record.name,
        record.description,
        record.icon,
        record.systemPrompt,
        serializeJSON(record.inputSchema, []),
        serializeJSON(record.allowedCapabilities, []),
        serializeJSON(record.defaultContext, null),
        record.startupMessageTemplate,
        serializeJSON(record.workflowHints, []),
        serializeJSON(record.outputHints, []),
        record.createdFromSessionId,
        now,
        now
      )
      return this.getSessionApp(app.appId)
    }

    updateSessionApp(appId, updates = {}) {
      const fields = []
      const values = []
      const mapping = {
        name: 'name',
        description: 'description',
        icon: 'icon',
        systemPrompt: 'system_prompt',
        inputSchema: 'input_schema',
        allowedCapabilities: 'allowed_capabilities',
        defaultContext: 'default_context',
        startupMessageTemplate: 'startup_message_template',
        workflowHints: 'workflow_hints',
        outputHints: 'output_hints',
        createdFromSessionId: 'created_from_session_id'
      }
      const jsonFields = new Set([
        'inputSchema',
        'allowedCapabilities',
        'defaultContext',
        'workflowHints',
        'outputHints'
      ])

      for (const [key, rawValue] of Object.entries(updates)) {
        const column = mapping[key]
        if (!column || rawValue === undefined) continue
        fields.push(`${column} = ?`)
        if (jsonFields.has(key)) {
          const fallback = key === 'defaultContext' ? null : []
          values.push(serializeJSON(rawValue, fallback))
        } else {
          values.push(rawValue ?? null)
        }
      }

      if (!fields.length) return this.getSessionApp(appId)

      fields.push('updated_at = ?')
      values.push(Date.now(), appId)
      this.db.prepare(`
        UPDATE session_apps
        SET ${fields.join(', ')}
        WHERE app_id = ?
      `).run(...values)
      return this.getSessionApp(appId)
    }

    duplicateSessionApp(sourceAppId, newAppId, overrides = {}) {
      const source = this.getSessionApp(sourceAppId)
      if (!source) return null

      return this.createSessionApp({
        ...source,
        ...overrides,
        appId: newAppId
      })
    }

    deleteSessionApp(appId) {
      this.db.prepare(`
        UPDATE agent_conversations
        SET session_app_id = NULL, updated_at = ?
        WHERE session_app_id = ?
      `).run(Date.now(), appId)
      this.db.prepare('DELETE FROM session_apps WHERE app_id = ?').run(appId)
      return { success: true }
    }
  }
}

module.exports = {
  withSessionAppOperations
}

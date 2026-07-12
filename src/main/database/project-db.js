/**
 * Project Database Operations Mixin
 *
 * 项目相关的数据库操作方法
 */

const {
  encodePath,
  normalizeProjectPath,
  buildProjectPathKey,
  getProjectName
} = require('../utils/path-utils')

const PROJECT_KIND_PRIORITY = {
  workspace: 0,
  'agent-output': 1,
  embedded: 2,
  notebook: 3
}

function normalizeProjectKind(projectKind) {
  return Object.prototype.hasOwnProperty.call(PROJECT_KIND_PRIORITY, projectKind)
    ? projectKind
    : 'workspace'
}

function shouldPromoteProjectKind(currentKind, nextKind) {
  return PROJECT_KIND_PRIORITY[normalizeProjectKind(nextKind)] > PROJECT_KIND_PRIORITY[normalizeProjectKind(currentKind)]
}

/**
 * 将 Project 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withProjectOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Project Operations
    // ========================================

    /**
     * Get or create a project for a real working directory.
     */
    getOrCreateProject(projectPath, encodedPathOrOptions, name) {
      const options = encodedPathOrOptions && typeof encodedPathOrOptions === 'object'
        ? encodedPathOrOptions
        : { encodedPath: encodedPathOrOptions, name }
      const normalizedPath = normalizeProjectPath(projectPath, options.platform)
      const pathKey = buildProjectPathKey(normalizedPath, options.platform)
      const encodedPath = options.encodedPath || encodePath(normalizedPath)
      const projectKind = normalizeProjectKind(options.projectKind || options.projectKindHint)
      const projectName = options.name || name || getProjectName(normalizedPath)

      const existing = this.db.prepare(
        'SELECT * FROM projects WHERE path_key = ?'
      ).get(pathKey)

      if (existing) {
        if (shouldPromoteProjectKind(existing.project_kind, projectKind)) {
          this.db.prepare(
            'UPDATE projects SET project_kind = ?, is_hidden = ?, updated_at = ? WHERE id = ?'
          ).run(projectKind, projectKind === 'workspace' ? existing.is_hidden : 1, Date.now(), existing.id)
          return this.getProjectById(existing.id)
        }
        return existing
      }

      const now = Date.now()
      const result = this.db.prepare(`
        INSERT INTO projects (
          path, path_key, encoded_path, project_kind, name, is_hidden, created_at, updated_at, last_opened_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path_key) DO NOTHING
      `).run(
        normalizedPath,
        pathKey,
        encodedPath,
        projectKind,
        projectName,
        projectKind === 'workspace' ? (options.isHidden ? 1 : 0) : 1,
        now,
        now,
        options.touch === false ? null : now
      )

      if (!result.changes) {
        return this.db.prepare('SELECT * FROM projects WHERE path_key = ?').get(pathKey)
      }

      return {
        id: result.lastInsertRowid,
        path: normalizedPath,
        path_key: pathKey,
        encoded_path: encodedPath,
        project_kind: projectKind,
        name: projectName,
        is_hidden: projectKind === 'workspace' ? (options.isHidden ? 1 : 0) : 1,
        created_at: now,
        updated_at: now,
        last_opened_at: options.touch === false ? null : now
      }
    }

    /**
     * Get all projects (excluding hidden by default)
     * @param {boolean} includeHidden - 是否包含隐藏项目
     */
    getAllProjects(includeHidden = false) {
      const conditions = []

      if (!includeHidden) {
        conditions.push("p.is_hidden = 0")
      }

      let sql = `
        SELECT p.*,
               COUNT(DISTINCT s.id) as session_count,
               MAX(s.last_message_at) as last_activity
        FROM projects p
        LEFT JOIN sessions s ON p.id = s.project_id
      `

      conditions.push("p.project_kind = 'workspace'")

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ')
      }

      sql += `
        GROUP BY p.id
        ORDER BY p.is_pinned DESC, p.last_opened_at DESC NULLS LAST
      `
      return this.db.prepare(sql).all()
    }

    /**
     * Projects that can act as capability-management context identities.
     * Workspace rows must be visible; notebook rows are intentionally hidden
     * from the normal project list but still valid capability scopes.
     */
    getCapabilityContextProjects() {
      return this.db.prepare(`
        SELECT p.*,
               COUNT(DISTINCT ac.id) as session_count,
               MAX(ac.updated_at) as last_activity
        FROM projects p
        LEFT JOIN agent_conversations ac ON p.id = ac.project_id
        WHERE (p.project_kind = 'workspace' AND p.is_hidden = 0)
           OR p.project_kind = 'notebook'
        GROUP BY p.id
        ORDER BY
          CASE p.project_kind
            WHEN 'workspace' THEN 0
            WHEN 'notebook' THEN 1
            ELSE 2
          END,
          p.is_pinned DESC,
          COALESCE(MAX(ac.updated_at), p.last_opened_at, p.updated_at, p.created_at) DESC,
          p.name ASC
      `).all()
    }

    /**
     * Get hidden projects
     */
    getHiddenProjects() {
      return this.db.prepare(`
        SELECT p.*,
               COUNT(DISTINCT s.id) as session_count
        FROM projects p
        LEFT JOIN sessions s ON p.id = s.project_id
        WHERE p.project_kind = 'workspace' AND p.is_hidden = 1
        GROUP BY p.id
        ORDER BY p.name ASC
      `).all()
    }

    /**
     * Get project by ID
     */
    getProjectById(projectId) {
      return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    }

    /**
     * Get project by path
     */
    getProjectByPath(projectPath) {
      const pathKey = buildProjectPathKey(projectPath)
      return this.db.prepare('SELECT * FROM projects WHERE path_key = ?').get(pathKey)
    }

    /**
     * Create a new project
     * @param {Object} projectData - 项目数据
     */
    createProject(projectData) {
      const {
        path: projectPath,
        name,
        description = '',
        icon = '📁',
        color = '#1890ff',
        api_profile_id = null
      } = projectData

      const normalizedPath = normalizeProjectPath(projectPath)
      const pathKey = buildProjectPathKey(normalizedPath)
      const existing = this.db.prepare('SELECT * FROM projects WHERE path_key = ?').get(pathKey)
      if (existing) {
        throw new Error('工程已存在')
      }

      // Keep Claude's directory encoding as a derived compatibility field.
      const encoded = encodePath(normalizedPath)
      const projectKind = normalizeProjectKind(projectData.project_kind || projectData.projectKind)

      const now = Date.now()
      const result = this.db.prepare(`
        INSERT INTO projects (
          path, path_key, encoded_path, project_kind, name, description, icon, color, api_profile_id,
          is_hidden, created_at, updated_at, last_opened_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalizedPath,
        pathKey,
        encoded,
        projectKind,
        name || getProjectName(normalizedPath),
        description,
        icon,
        color,
        api_profile_id,
        projectKind === 'workspace' ? 0 : 1,
        now,
        now,
        now
      )

      return {
        id: result.lastInsertRowid,
        path: normalizedPath,
        path_key: pathKey,
        encoded_path: encoded,
        project_kind: projectKind,
        name: name || getProjectName(normalizedPath),
        description,
        icon,
        color,
        api_profile_id,
        is_pinned: 0,
        is_hidden: projectKind === 'workspace' ? 0 : 1,
        created_at: now,
        updated_at: now,
        last_opened_at: now
      }
    }

    /**
     * Update project
     */
    updateProject(projectId, updates) {
      const allowedFields = ['name', 'description', 'icon', 'color', 'api_profile_id', 'is_pinned', 'is_hidden', 'last_opened_at']
      const fields = []
      const values = []

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`)
          values.push(value)
        }
      }

      if (fields.length === 0) return null

      fields.push('updated_at = ?')
      values.push(Date.now())
      values.push(projectId)

      this.db.prepare(
        `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values)

      return this.getProjectById(projectId)
    }

    /**
     * Delete project (and optionally its sessions)
     */
    deleteProject(projectId, deleteSessions = false) {
      const agentRefs = this.db.prepare(
        'SELECT COUNT(*) AS count FROM agent_conversations WHERE project_id = ?'
      ).get(projectId)
      if ((agentRefs?.count || 0) > 0) {
        throw new Error('工程已有 Agent 会话引用，不能删除')
      }

      if (deleteSessions) {
        // CASCADE will handle sessions and messages
        this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
      } else {
        // Just remove the project, keep sessions orphaned (they won't show anyway)
        this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
      }
      return { success: true }
    }

    /**
     * Toggle project pinned status
     */
    toggleProjectPinned(projectId) {
      const project = this.getProjectById(projectId)
      if (!project) return null

      const newStatus = project.is_pinned ? 0 : 1
      this.updateProject(projectId, { is_pinned: newStatus })
      return { ...project, is_pinned: newStatus }
    }

    /**
     * Hide project (remove from panel)
     */
    hideProject(projectId) {
      return this.updateProject(projectId, { is_hidden: 1 })
    }

    /**
     * Unhide project (restore to panel)
     */
    unhideProject(projectId) {
      return this.updateProject(projectId, { is_hidden: 0 })
    }

    /**
     * Update project's last_opened_at timestamp
     */
    touchProject(projectId) {
      const now = Date.now()
      this.db.prepare(
        'UPDATE projects SET last_opened_at = ?, updated_at = ? WHERE id = ?'
      ).run(now, now, projectId)
    }

    /**
     * Duplicate project config
     */
    duplicateProject(projectId, newPath, newName) {
      const source = this.getProjectById(projectId)
      if (!source) return null

      return this.createProject({
        path: newPath,
        name: newName || `${source.name} (副本)`,
        description: source.description,
        icon: source.icon,
        color: source.color,
        api_profile_id: source.api_profile_id
      })
    }
  }
}

module.exports = { withProjectOperations }

/**
 * Session Database Operations Mixin
 *
 * 会话相关的数据库操作方法
 */

/**
 * 将 Session 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withSessionOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Session Operations
    // ========================================

    /**
     * Get or create a session
     */
    getOrCreateSession(projectId, sessionUuid) {
      const existing = this.db.prepare(
        'SELECT * FROM sessions WHERE session_uuid = ?'
      ).get(sessionUuid)

      if (existing) {
        return existing
      }

      const result = this.db.prepare(
        'INSERT INTO sessions (project_id, session_uuid) VALUES (?, ?)'
      ).run(projectId, sessionUuid)

      return {
        id: result.lastInsertRowid,
        project_id: projectId,
        session_uuid: sessionUuid
      }
    }

    /**
     * Get session by UUID
     */
    getSessionByUuid(sessionUuid) {
      return this.db.prepare(
        'SELECT * FROM sessions WHERE session_uuid = ?'
      ).get(sessionUuid)
    }

    /**
     * Delete session and its messages
     */
    deleteSession(sessionId) {
      // Delete messages first
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
      // Delete session tags
      this.db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(sessionId)
      // Delete favorites
      this.db.prepare('DELETE FROM favorites WHERE session_id = ?').run(sessionId)
      // Delete session
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
      return { success: true }
    }

    /**
     * Get sessions for a project
     */
    getProjectSessions(projectId) {
      const sessions = this.db.prepare(`
        SELECT s.*,
               (SELECT COUNT(*) FROM favorites f WHERE f.session_id = s.id) as is_favorite
        FROM sessions s
        WHERE s.project_id = ?
        ORDER BY s.last_message_at DESC NULLS LAST
      `).all(projectId)

      // Load tags for each session (with full info)
      const getTagsStmt = this.db.prepare(`
        SELECT t.id, t.name, t.color FROM tags t
        JOIN session_tags st ON t.id = st.tag_id
        WHERE st.session_id = ?
      `)

      for (const session of sessions) {
        session.tags = getTagsStmt.all(session.id)
      }

      return sessions
    }

    /**
     * Update session metadata
     */
    updateSession(sessionId, updates) {
      const fields = []
      const values = []

      for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = ?`)
        values.push(value)
      }

      fields.push('updated_at = ?')
      values.push(Date.now())
      values.push(sessionId)

      this.db.prepare(
        `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values)
    }

    /**
     * Get first user message for session (for display)
     */
    getSessionFirstMessage(sessionId) {
      return this.db.prepare(`
        SELECT content FROM messages
        WHERE session_id = ? AND role = 'user' AND is_meta = 0 AND content != ''
        ORDER BY timestamp ASC
        LIMIT 1
      `).get(sessionId)
    }
  }
}

module.exports = { withSessionOperations }

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

    // ========================================
    // Pending Session Operations (新建会话时使用)
    // ========================================

    /**
     * Create a pending session (without uuid, waiting for file creation)
     * @param {number} projectId - 项目 ID
     * @param {string} title - 用户自定义标题
     * @param {string} activeSessionId - 活动会话 ID
     * @returns {Object} 创建的会话
     */
    createPendingSession(projectId, title, activeSessionId) {
      const now = Date.now()
      const result = this.db.prepare(`
        INSERT INTO sessions (project_id, title, active_session_id, created_at, updated_at, started_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectId, title || null, activeSessionId, now, now, now)

      return {
        id: result.lastInsertRowid,
        project_id: projectId,
        title,
        active_session_id: activeSessionId,
        session_uuid: null,
        created_at: now
      }
    }

    /**
     * Link uuid to a pending session
     * @param {string} activeSessionId - 活动会话 ID
     * @param {string} sessionUuid - Claude Code 会话 UUID
     * @param {string} firstUserMessage - 第一条用户消息
     * @returns {Object|null} 更新后的会话
     */
    linkSessionUuid(activeSessionId, sessionUuid, firstUserMessage = null) {
      // 先检查是否已存在该 uuid 的会话（避免重复）
      const existingByUuid = this.db.prepare(
        'SELECT * FROM sessions WHERE session_uuid = ?'
      ).get(sessionUuid)

      if (existingByUuid) {
        console.log(`[SessionDB] Session with uuid ${sessionUuid} already exists`)
        return existingByUuid
      }

      // 查找待定会话
      const pending = this.db.prepare(
        'SELECT * FROM sessions WHERE active_session_id = ? AND session_uuid IS NULL'
      ).get(activeSessionId)

      if (pending) {
        // 更新待定会话，添加 uuid
        this.db.prepare(`
          UPDATE sessions
          SET session_uuid = ?, first_user_message = ?, updated_at = ?
          WHERE id = ?
        `).run(sessionUuid, firstUserMessage, Date.now(), pending.id)

        console.log(`[SessionDB] Linked uuid ${sessionUuid} to pending session ${pending.id}`)
        return { ...pending, session_uuid: sessionUuid, first_user_message: firstUserMessage }
      }

      console.log(`[SessionDB] No pending session found for activeSessionId ${activeSessionId}`)
      return null
    }

    /**
     * Get pending session by active session ID
     */
    getPendingSession(activeSessionId) {
      return this.db.prepare(
        'SELECT * FROM sessions WHERE active_session_id = ? AND session_uuid IS NULL'
      ).get(activeSessionId)
    }

    /**
     * Update session title
     * @param {number} sessionId - 数据库会话 ID
     * @param {string} title - 新标题
     */
    updateSessionTitle(sessionId, title) {
      console.log('[SessionDB] updateSessionTitle:', { sessionId, title })
      const result = this.db.prepare(`
        UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?
      `).run(title, Date.now(), sessionId)
      console.log('[SessionDB] updateSessionTitle result:', result)
      return { success: true }
    }

    /**
     * Get project sessions from database (for left panel display)
     * @param {number} projectId - 项目 ID
     * @param {number} limit - 最大返回数量
     * @returns {Array} 会话列表
     */
    getProjectSessionsForPanel(projectId, limit = 20) {
      const sessions = this.db.prepare(`
        SELECT s.*,
               (SELECT COUNT(*) FROM favorites f WHERE f.session_id = s.id) as is_favorite
        FROM sessions s
        WHERE s.project_id = ?
          AND (s.session_uuid IS NOT NULL OR s.active_session_id IS NOT NULL)
          AND (s.message_count > 0 OR s.session_uuid IS NULL)
        ORDER BY
          CASE WHEN s.session_uuid IS NULL THEN 0 ELSE 1 END,
          COALESCE(s.last_message_at, s.started_at, s.created_at) DESC
        LIMIT ?
      `).all(projectId, limit)

      console.log('[SessionDB] getProjectSessionsForPanel:', projectId, '-> sessions:', sessions.map(s => ({ id: s.id, title: s.title, uuid: s.session_uuid?.slice(0, 8) })))
      return sessions
    }

    /**
     * Sync a session from file system to database
     * @param {number} projectId - 项目 ID
     * @param {Object} fileSession - 从文件系统读取的会话信息
     * @returns {Object} 数据库中的会话
     */
    syncSessionFromFile(projectId, fileSession) {
      const { id: sessionUuid, firstUserMessage, messageCount, startTime, lastMessageTime, model } = fileSession

      // 检查是否已存在
      let existing = this.db.prepare(
        'SELECT * FROM sessions WHERE session_uuid = ?'
      ).get(sessionUuid)

      if (existing) {
        // 更新现有记录
        this.db.prepare(`
          UPDATE sessions
          SET first_user_message = ?,
              message_count = ?,
              last_message_at = ?,
              model = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          firstUserMessage || existing.first_user_message,
          messageCount,
          lastMessageTime ? new Date(lastMessageTime).getTime() : null,
          model || existing.model,
          Date.now(),
          existing.id
        )
        return { ...existing, first_user_message: firstUserMessage, message_count: messageCount }
      }

      // 创建新记录
      const now = Date.now()
      const result = this.db.prepare(`
        INSERT INTO sessions (
          project_id, session_uuid, first_user_message, message_count,
          started_at, last_message_at, model, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        sessionUuid,
        firstUserMessage,
        messageCount,
        startTime ? new Date(startTime).getTime() : now,
        lastMessageTime ? new Date(lastMessageTime).getTime() : null,
        model,
        now,
        now
      )

      return {
        id: result.lastInsertRowid,
        project_id: projectId,
        session_uuid: sessionUuid,
        first_user_message: firstUserMessage,
        message_count: messageCount
      }
    }

    /**
     * Delete session by uuid (for file deletion sync)
     */
    deleteSessionByUuid(sessionUuid) {
      const session = this.getSessionByUuid(sessionUuid)
      if (session) {
        return this.deleteSession(session.id)
      }
      return { success: false, error: 'Session not found' }
    }
  }
}

module.exports = { withSessionOperations }

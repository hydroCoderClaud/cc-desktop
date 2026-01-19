/**
 * Message Database Operations Mixin
 *
 * 消息相关的数据库操作方法
 */

/**
 * 将 Message 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withMessageOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Message Operations
    // ========================================

    /**
     * Check if message exists
     */
    messageExists(uuid) {
      const result = this.db.prepare(
        'SELECT 1 FROM messages WHERE uuid = ?'
      ).get(uuid)
      return !!result
    }

    /**
     * Insert a message
     */
    insertMessage(message) {
      return this.db.prepare(`
        INSERT INTO messages (session_id, uuid, parent_uuid, role, content, timestamp, tokens_in, tokens_out, is_meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.session_id,
        message.uuid,
        message.parent_uuid || null,
        message.role,
        message.content || '',
        message.timestamp || null,
        message.tokens_in || null,
        message.tokens_out || null,
        message.is_meta ? 1 : 0
      )
    }

    /**
     * Batch insert messages (within transaction)
     */
    insertMessages(messages) {
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO messages (session_id, uuid, parent_uuid, role, content, timestamp, tokens_in, tokens_out, is_meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertMany = this.db.transaction((msgs) => {
        for (const msg of msgs) {
          insert.run(
            msg.session_id,
            msg.uuid,
            msg.parent_uuid || null,
            msg.role,
            msg.content || '',
            msg.timestamp || null,
            msg.tokens_in || null,
            msg.tokens_out || null,
            msg.is_meta ? 1 : 0
          )
        }
      })

      insertMany(messages)
    }

    /**
     * Get messages for a session
     */
    getSessionMessages(sessionId, options = {}) {
      const { limit = 1000, offset = 0, role = null } = options

      let sql = `
        SELECT * FROM messages
        WHERE session_id = ? AND is_meta = 0
      `
      const params = [sessionId]

      if (role) {
        sql += ' AND role = ?'
        params.push(role)
      }

      sql += ' ORDER BY timestamp ASC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      return this.db.prepare(sql).all(...params)
    }

    /**
     * Get message count for session
     */
    getSessionMessageCount(sessionId) {
      const result = this.db.prepare(
        'SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_meta = 0'
      ).get(sessionId)
      return result?.count || 0
    }

    // ========================================
    // Search Operations
    // ========================================

    /**
     * Full-text search across messages
     */
    searchMessages(query, options = {}) {
      const { projectId = null, sessionId = null, limit = 100 } = options

      let sql = `
        SELECT m.*, s.session_uuid, p.name as project_name, p.path as project_path,
               snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
        FROM messages m
        JOIN messages_fts fts ON m.id = fts.rowid
        JOIN sessions s ON m.session_id = s.id
        JOIN projects p ON s.project_id = p.id
        WHERE messages_fts MATCH ?
      `
      const params = [query]

      if (projectId) {
        sql += ' AND p.id = ?'
        params.push(projectId)
      }

      if (sessionId) {
        sql += ' AND s.id = ?'
        params.push(sessionId)
      }

      sql += ' ORDER BY rank LIMIT ?'
      params.push(limit)

      return this.db.prepare(sql).all(...params)
    }
  }
}

module.exports = { withMessageOperations }

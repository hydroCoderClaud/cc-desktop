/**
 * Tag Database Operations Mixin
 *
 * 标签相关的数据库操作方法（会话标签和消息标签）
 */

/**
 * 将 Tag 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withTagOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Tag Operations
    // ========================================

    /**
     * Create a tag
     */
    createTag(name, color = '#1890ff') {
      const result = this.db.prepare(
        'INSERT INTO tags (name, color) VALUES (?, ?)'
      ).run(name, color)
      return { id: result.lastInsertRowid, name, color }
    }

    /**
     * Get all tags with usage counts
     */
    getAllTags() {
      return this.db.prepare(`
        SELECT t.*,
               (SELECT COUNT(*) FROM session_tags st WHERE st.tag_id = t.id) as session_count,
               (SELECT COUNT(*) FROM message_tags mt WHERE mt.tag_id = t.id) as message_count
        FROM tags t
        ORDER BY (session_count + message_count) DESC
      `).all()
    }

    /**
     * Delete a tag
     */
    deleteTag(tagId) {
      this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId)
    }

    /**
     * Add tag to session
     */
    addTagToSession(sessionId, tagId) {
      this.db.prepare(
        'INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)'
      ).run(sessionId, tagId)
    }

    /**
     * Remove tag from session
     */
    removeTagFromSession(sessionId, tagId) {
      this.db.prepare(
        'DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?'
      ).run(sessionId, tagId)
    }

    /**
     * Get tags for a session
     */
    getSessionTags(sessionId) {
      return this.db.prepare(`
        SELECT t.* FROM tags t
        JOIN session_tags st ON t.id = st.tag_id
        WHERE st.session_id = ?
      `).all(sessionId)
    }

    /**
     * Get sessions by tag
     */
    getSessionsByTag(tagId) {
      return this.db.prepare(`
        SELECT s.*, p.name as project_name, p.path as project_path
        FROM sessions s
        JOIN session_tags st ON s.id = st.session_id
        JOIN projects p ON s.project_id = p.id
        WHERE st.tag_id = ?
        ORDER BY s.last_message_at DESC
      `).all(tagId)
    }

    // ========================================
    // Message Tag Operations
    // ========================================

    /**
     * Add tag to message
     */
    addTagToMessage(messageId, tagId) {
      this.db.prepare(
        'INSERT OR IGNORE INTO message_tags (message_id, tag_id) VALUES (?, ?)'
      ).run(messageId, tagId)
    }

    /**
     * Remove tag from message
     */
    removeTagFromMessage(messageId, tagId) {
      this.db.prepare(
        'DELETE FROM message_tags WHERE message_id = ? AND tag_id = ?'
      ).run(messageId, tagId)
    }

    /**
     * Get tags for a message
     */
    getMessageTags(messageId) {
      return this.db.prepare(`
        SELECT t.* FROM tags t
        JOIN message_tags mt ON t.id = mt.tag_id
        WHERE mt.message_id = ?
      `).all(messageId)
    }

    /**
     * Get messages by tag
     */
    getMessagesByTag(tagId) {
      return this.db.prepare(`
        SELECT m.*, s.session_uuid, s.id as session_id, p.name as project_name, p.path as project_path
        FROM messages m
        JOIN message_tags mt ON m.id = mt.message_id
        JOIN sessions s ON m.session_id = s.id
        JOIN projects p ON s.project_id = p.id
        WHERE mt.tag_id = ?
        ORDER BY m.timestamp DESC
      `).all(tagId)
    }

    /**
     * Get all tagged messages for a session
     */
    getSessionTaggedMessages(sessionId) {
      return this.db.prepare(`
        SELECT mt.message_id, t.id as tag_id, t.name as tag_name, t.color as tag_color
        FROM message_tags mt
        JOIN tags t ON mt.tag_id = t.id
        JOIN messages m ON mt.message_id = m.id
        WHERE m.session_id = ?
      `).all(sessionId)
    }
  }
}

module.exports = { withTagOperations }

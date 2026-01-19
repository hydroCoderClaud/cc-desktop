/**
 * Favorite Database Operations Mixin
 *
 * 收藏相关的数据库操作方法
 */

/**
 * 将 Favorite 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withFavoriteOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Favorite Operations
    // ========================================

    /**
     * Add session to favorites
     */
    addFavorite(sessionId, note = '') {
      this.db.prepare(
        'INSERT OR REPLACE INTO favorites (session_id, note) VALUES (?, ?)'
      ).run(sessionId, note)
    }

    /**
     * Remove session from favorites
     */
    removeFavorite(sessionId) {
      this.db.prepare('DELETE FROM favorites WHERE session_id = ?').run(sessionId)
    }

    /**
     * Check if session is favorite
     */
    isFavorite(sessionId) {
      const result = this.db.prepare(
        'SELECT 1 FROM favorites WHERE session_id = ?'
      ).get(sessionId)
      return !!result
    }

    /**
     * Get all favorites
     */
    getAllFavorites() {
      return this.db.prepare(`
        SELECT f.*, s.session_uuid, s.model, s.started_at, s.last_message_at, s.message_count,
               p.name as project_name, p.path as project_path
        FROM favorites f
        JOIN sessions s ON f.session_id = s.id
        JOIN projects p ON s.project_id = p.id
        ORDER BY f.created_at DESC
      `).all()
    }

    /**
     * Update favorite note
     */
    updateFavoriteNote(sessionId, note) {
      this.db.prepare(
        'UPDATE favorites SET note = ? WHERE session_id = ?'
      ).run(note, sessionId)
    }
  }
}

module.exports = { withFavoriteOperations }

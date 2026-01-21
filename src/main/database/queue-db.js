/**
 * Message Queue Database Operations Mixin
 *
 * 会话消息队列的数据库操作方法
 */

const { v4: uuidv4 } = require('uuid')

/**
 * 将 Queue 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withQueueOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Queue Operations
    // ========================================

    /**
     * 添加消息到队列
     * @param {string} sessionUuid - 会话 UUID
     * @param {string} content - 消息内容
     * @returns {Object} - 新创建的队列项
     */
    addToQueue(sessionUuid, content) {
      const id = uuidv4()
      const now = Date.now()
      this.db.prepare(`
        INSERT INTO session_message_queue (id, session_uuid, content, is_executed, created_at)
        VALUES (?, ?, ?, 0, ?)
      `).run(id, sessionUuid, content, now)
      return { id, session_uuid: sessionUuid, content, is_executed: 0, created_at: now }
    }

    /**
     * 获取会话的待执行队列
     * @param {string} sessionUuid - 会话 UUID
     * @returns {Array} - 队列项列表
     */
    getQueue(sessionUuid) {
      return this.db.prepare(`
        SELECT * FROM session_message_queue
        WHERE session_uuid = ? AND is_executed = 0
        ORDER BY created_at ASC
      `).all(sessionUuid)
    }

    /**
     * 更新队列项内容
     * @param {string} id - 队列项 ID
     * @param {string} content - 新内容
     * @returns {Object} - 更新结果
     */
    updateQueueItem(id, content) {
      const result = this.db.prepare(`
        UPDATE session_message_queue SET content = ? WHERE id = ?
      `).run(content, id)
      return { success: result.changes > 0 }
    }

    /**
     * 删除队列项
     * @param {string} id - 队列项 ID
     * @returns {Object} - 删除结果
     */
    deleteQueueItem(id) {
      const result = this.db.prepare(`
        DELETE FROM session_message_queue WHERE id = ?
      `).run(id)
      return { success: result.changes > 0 }
    }

    /**
     * 清空会话队列（标记所有为已执行）
     * @param {string} sessionUuid - 会话 UUID
     * @returns {Object} - 清空结果
     */
    clearQueue(sessionUuid) {
      const now = Date.now()
      const result = this.db.prepare(`
        UPDATE session_message_queue SET is_executed = 1, executed_at = ?
        WHERE session_uuid = ? AND is_executed = 0
      `).run(now, sessionUuid)
      return { success: true, cleared: result.changes }
    }

    /**
     * 交换两个队列项的顺序（通过交换 created_at）
     * @param {string} id1 - 第一个队列项 ID
     * @param {string} id2 - 第二个队列项 ID
     * @returns {Object} - 交换结果
     */
    swapQueueOrder(id1, id2) {
      const item1 = this.db.prepare('SELECT created_at FROM session_message_queue WHERE id = ?').get(id1)
      const item2 = this.db.prepare('SELECT created_at FROM session_message_queue WHERE id = ?').get(id2)

      if (!item1 || !item2) {
        return { success: false, error: 'Item not found' }
      }

      // 使用事务确保两个 UPDATE 操作原子执行
      const update = this.db.prepare('UPDATE session_message_queue SET created_at = ? WHERE id = ?')
      const swapTransaction = this.db.transaction(() => {
        update.run(item2.created_at, id1)
        update.run(item1.created_at, id2)
      })
      swapTransaction()

      return { success: true }
    }
  }
}

module.exports = { withQueueOperations }

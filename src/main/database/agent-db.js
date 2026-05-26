/**
 * Agent Database Operations Mixin
 *
 * Agent 对话和消息的数据库操作方法
 */

/**
 * 将 Agent 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function normalizeModelId(modelId) {
  if (typeof modelId !== 'string') return null
  const normalized = modelId.trim()
  return normalized || null
}

function serializeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function withAgentOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Agent Conversation Operations
    // ========================================

    /**
     * 创建 Agent 对话记录
     */
    createAgentConversation({
      sessionId,
      type,
      title,
      cwd,
      cwdAuto,
      apiProfileId,
      apiBaseUrl,
      modelId,
      source,
      taskId,
      ownerClientId,
      clientType,
      clientMeta
    }) {
      const now = Date.now()
      const result = this.db.prepare(`
        INSERT INTO agent_conversations (
          session_id, type, title, cwd, cwd_auto, api_profile_id, api_base_url, model_id, source, task_id,
          owner_client_id, client_type, client_meta, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        type || 'chat',
        title || '',
        cwd || null,
        cwdAuto ? 1 : 0,
        apiProfileId || null,
        apiBaseUrl || null,
        normalizeModelId(modelId),
        source || 'manual',
        taskId || null,
        ownerClientId || 'host-ui',
        clientType || 'host',
        serializeJsonObject(clientMeta),
        now,
        now
      )

      return {
        id: result.lastInsertRowid,
        sessionId,
        type: type || 'chat',
        status: 'idle',
        title: title || '',
        cwd,
        cwdAuto: !!cwdAuto,
        apiProfileId: apiProfileId || null,
        apiBaseUrl: apiBaseUrl || null,
        modelId: normalizeModelId(modelId),
        source: source || 'manual',
        taskId: taskId || null,
        ownerClientId: ownerClientId || 'host-ui',
        clientType: clientType || 'host',
        clientMeta: clientMeta || null,
        createdAt: now,
        updatedAt: now
      }
    }

    /**
     * 按 sessionId (UUID) 查询对话
     */
    getAgentConversation(sessionId) {
      return this.db.prepare(
        'SELECT * FROM agent_conversations WHERE session_id = ?'
      ).get(sessionId)
    }

    /**
     * 列出对话（排除 closed，按 updated_at DESC）
     */
    listAgentConversations({ limit = 50 } = {}) {
      return this.db.prepare(`
        SELECT * FROM agent_conversations
        WHERE status != 'closed'
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(limit)
    }

    /**
     * 列出所有对话（包括 closed，用于历史恢复）
     */
    listAllAgentConversations({ limit = 100 } = {}) {
      return this.db.prepare(`
        SELECT * FROM agent_conversations
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(limit)
    }

    /**
     * 更新对话标题
     */
    updateAgentConversationTitle(sessionId, title) {
      this.db.prepare(`
        UPDATE agent_conversations SET title = ?, updated_at = ? WHERE session_id = ?
      `).run(title, Date.now(), sessionId)
    }

    /**
     * 通用更新对话字段
     */
    updateAgentConversation(sessionId, updates) {
      const fields = []
      const values = []

      for (const [key, value] of Object.entries(updates)) {
        // 将 camelCase 转换为 snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        fields.push(`${snakeKey} = ?`)
        if (key === 'clientMeta' || key === 'lastBootstrappedRuntime') {
          values.push(serializeJsonObject(value))
        } else {
          values.push(value)
        }
      }

      fields.push('updated_at = ?')
      values.push(Date.now())
      values.push(sessionId)

      this.db.prepare(
        `UPDATE agent_conversations SET ${fields.join(', ')} WHERE session_id = ?`
      ).run(...values)
    }

    /**
     * 更新会话模型快照
     */
    updateAgentConversationModel(sessionId, modelId) {
      this.db.prepare(`
        UPDATE agent_conversations SET model_id = ?, updated_at = ? WHERE session_id = ?
      `).run(normalizeModelId(modelId), Date.now(), sessionId)
    }

    /**
     * 软关闭对话（status = 'closed'）
     */
    closeAgentConversation(sessionId) {
      this.db.prepare(`
        UPDATE agent_conversations SET status = 'closed', updated_at = ? WHERE session_id = ?
      `).run(Date.now(), sessionId)
    }

    /**
     * 物理删除对话（CASCADE 删消息）
     */
    deleteAgentConversation(sessionId) {
      const conv = this.getAgentConversation(sessionId)
      if (conv) {
        // 先删消息（如果没有 CASCADE 的话做兜底）
        this.db.prepare('DELETE FROM agent_messages WHERE conversation_id = ?').run(conv.id)
        this.db.prepare('DELETE FROM agent_conversations WHERE id = ?').run(conv.id)
      }
      return { success: true }
    }

    /**
     * 保存队列消息（持久化）
     * @param {string} sessionId - 会话 ID
     * @param {Array} queue - 队列消息数组 [{ id, text }, ...]
     */
    saveAgentQueue(sessionId, queue) {
      const queueJSON = JSON.stringify(queue || [])
      console.log('[AgentDB] 💾 Saving queue for session:', sessionId, 'items:', queue?.length || 0)
      const result = this.db.prepare(`
        UPDATE agent_conversations
        SET queued_messages = ?, updated_at = ?
        WHERE session_id = ?
      `).run(queueJSON, Date.now(), sessionId)
      console.log('[AgentDB] ✅ Queue saved, affected rows:', result.changes)
    }

    /**
     * 读取队列消息
     * @param {string} sessionId - 会话 ID
     * @returns {Array} 队列消息数组
     */
    getAgentQueue(sessionId) {
      console.log('[AgentDB] 📖 Loading queue for session:', sessionId)
      const row = this.db.prepare(
        'SELECT queued_messages FROM agent_conversations WHERE session_id = ?'
      ).get(sessionId)

      if (!row || !row.queued_messages) {
        console.log('[AgentDB] ⏭️ No queue data found')
        return []
      }

      try {
        const queue = JSON.parse(row.queued_messages)
        console.log('[AgentDB] ✅ Queue loaded:', queue.length, 'messages')
        return queue
      } catch (err) {
        console.error('[AgentDB] ❌ Failed to parse queue JSON:', err)
        return []
      }
    }

    /**
     * 查询钉钉特定用户+会话的最近一条 agent 对话
     */
    getDingTalkSession(staffId, conversationId) {
      return this.db.prepare(`
        SELECT * FROM agent_conversations
        WHERE staff_id = ? AND conversation_id = ?
        ORDER BY updated_at DESC LIMIT 1
      `).get(staffId, conversationId)
    }

    /**
     * 通用 IM 身份持久化写入
     * @param {string} sessionId
     * @param {string} userId — IM 用户标识（staffId / openId / targetId 等）
     * @param {string} channelId — IM 通道/群标识（conversationId / chatId / accountId 等）
     */
    updateImIdentity(sessionId, userId, channelId) {
      this.db.prepare(`
        UPDATE agent_conversations
        SET staff_id = ?, conversation_id = ?, im_user_id = ?, im_channel_id = ?, updated_at = ?
        WHERE session_id = ?
      `).run(userId, channelId, userId, channelId, Date.now(), sessionId)
    }

    /**
     * 按 IM 身份查询历史会话
     * @param {string} imType — IM 类型（dingtalk / weixin / feishu / enterprise-weixin）
     * @param {string} userId — IM 用户标识
     * @param {string} channelId — IM 通道标识
     * @param {number} [limit=5]
     * @returns {Array<object>}
     */
    getImSessionsByIdentity(imType, userId, channelId, limit = 5) {
      return this.db.prepare(`
        SELECT * FROM agent_conversations
        WHERE (type = ? OR source = ?)
          AND (im_user_id = ? OR staff_id = ?)
          AND (im_channel_id = ? OR conversation_id = ?)
        ORDER BY updated_at DESC LIMIT ?
      `).all(imType, imType, userId, userId, channelId, channelId, limit)
    }

    /**
     * 查询钉钉特定用户+会话的历史对话列表（供用户选择继续哪个会话）
     * @deprecated 请使用 getImSessionsByIdentity
     */
    getDingTalkSessions(staffId, conversationId, limit = 5) {
      return this.db.prepare(`
        SELECT * FROM agent_conversations
        WHERE staff_id = ? AND conversation_id = ?
        ORDER BY updated_at DESC LIMIT ?
      `).all(staffId, conversationId, limit)
    }

    /**
     * 查询指定 IM 渠道特定用户+会话的历史对话列表
     * 复用 staff_id / conversation_id 字段存储外部 IM 身份。
     * 为兼容“普通 chat 会话后绑定 IM 渠道”的场景，按 type 或 source 任一命中即返回。
     */
    getImSessionsByType(type, staffId, conversationId, limit = 5) {
      return this.db.prepare(`
        SELECT * FROM agent_conversations
        WHERE (type = ? OR source = ?)
          AND (im_user_id = ? OR staff_id = ?)
          AND (im_channel_id = ? OR conversation_id = ?)
        ORDER BY updated_at DESC LIMIT ?
      `).all(type, type, staffId, staffId, conversationId, conversationId, limit)
    }

    /**
     * 更新钉钉元数据（staffId、conversationId）到对话记录
     */
    updateDingTalkMetadata(sessionId, staffId, conversationId) {
      this.db.prepare(`
        UPDATE agent_conversations SET staff_id = ?, conversation_id = ?, updated_at = ?
        WHERE session_id = ?
      `).run(staffId, conversationId, Date.now(), sessionId)
    }

    /**
     * 标记所有非 closed 状态的对话为 closed（应用启动时清理）
     */
    closeAllActiveAgentConversations() {
      this.db.prepare(`
        UPDATE agent_conversations SET status = 'closed', updated_at = ?
        WHERE status != 'closed'
      `).run(Date.now())
    }

    // ========================================
    // Agent Message Operations
    // ========================================

    /**
     * 插入消息
     */
    insertAgentMessage(conversationId, { msgId, role, content, toolName, toolInput, toolOutput, timestamp }) {
      this.db.prepare(`
        INSERT INTO agent_messages (conversation_id, msg_id, role, content, tool_name, tool_input, tool_output, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        conversationId,
        msgId,
        role,
        content || null,
        toolName || null,
        toolInput ? JSON.stringify(toolInput) : null,
        toolOutput ? JSON.stringify(toolOutput) : null,
        timestamp
      )
    }

    /**
     * 更新消息的 tool_output
     */
    updateAgentMessageToolOutput(msgId, toolOutput) {
      this.db.prepare(`
        UPDATE agent_messages
        SET tool_output = ?
        WHERE msg_id = ?
      `).run(
        toolOutput ? JSON.stringify(toolOutput) : null,
        msgId
      )
    }

    /**
     * 获取对话的所有消息（按 timestamp ASC）
     */
    getAgentMessagesByConversationId(conversationId) {
      return this.db.prepare(`
        SELECT * FROM agent_messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `).all(conversationId)
    }
  }
}

module.exports = { withAgentOperations }

/**
 * IM 会话映射 helper
 *
 * 管理 IM 身份 → Agent 会话的映射、历史会话查询和会话选择菜单。
 * 各 IM bridge 使用此模块来统一会话管理逻辑。
 *
 * 使用方式：
 *   const mapper = new ImSessionMapper({
 *     agentSessionManager,
 *     sessionDatabase,
 *     imType: 'feishu',
 *     maxHistorySessions: 5,
 *     buildIdentityKey: (identity) => `${identity.userId}:${identity.chatId}`,
 *     buildSessionTitle: (identity) => `飞书 · ${identity.chatName} · ${identity.nickname}`,
 *   })
 */

class ImSessionMapper {
  /**
   * @param {object} opts
   * @param {object} opts.agentSessionManager - AgentSessionManager 实例
   * @param {object} opts.sessionDatabase - 会话数据库实例
   * @param {string} opts.imType - IM 渠道 id
   * @param {number} [opts.maxHistorySessions] - 最大历史会话数（默认 5）
   * @param {Function} opts.buildIdentityKey - (identity) => string，构建 IM 身份 key
   * @param {Function} opts.buildSessionTitle - (identity) => string，构建会话标题
   * @param {string} [opts.defaultCwd] - 默认工作目录
   * @param {Function} [opts.sendReplyFn] - 回复发送函数 (text) => Promise<void>
   */
  constructor(opts) {
    this._agentSessionManager = opts.agentSessionManager
    this._sessionDatabase = opts.sessionDatabase
    this._imType = opts.imType
    this._maxHistorySessions = opts.maxHistorySessions || 5
    this._buildIdentityKey = opts.buildIdentityKey
    this._buildSessionTitle = opts.buildSessionTitle
    this._defaultCwd = opts.defaultCwd || null
    this._sendReplyFn = opts.sendReplyFn || null

    /** @type {Map<string, string>} IM 身份 key → sessionId */
    this.sessionMap = new Map()
    /** @type {Map<string, { sessions: Array, resolve: Function, timer: NodeJS.Timeout }>} 待处理选择 */
    this._pendingChoices = new Map()
    /** @type {Map<string, string>} sessionId → webhook URL */
    this._sessionWebhooks = new Map()
  }

  // ─── 身份 key ───

  buildKey(identity) {
    return this._buildIdentityKey(identity)
  }

  // ─── Webhook ───

  setWebhook(sessionId, webhook) {
    if (webhook) {
      this._sessionWebhooks.set(sessionId, webhook)
    }
  }

  getWebhook(sessionId) {
    return this._sessionWebhooks.get(sessionId) || null
  }

  // ─── 会话映射 ───

  /**
   * 确保 IM 身份有对应的 Agent 会话
   * @param {object} identity - IM 身份对象
   * @param {Function} [onSendChoiceMenu] - 发送选择菜单的回调 (sessions) => Promise<void>
   * @param {Function} [onSendMenuTimeout] - 菜单超时回调 () => Promise<void>
   * @returns {Promise<{ sessionId: string|null, needsChoice?: boolean, sessions?: Array, mapKey?: string }>}
   */
  async ensureSession(identity, onSendChoiceMenu, onSendMenuTimeout) {
    const mapKey = this.buildKey(identity)

    // 1. 检查内存映射
    const existingSessionId = this.sessionMap.get(mapKey)
    if (existingSessionId) {
      const valid = await this._validateSession(existingSessionId)
      if (valid) return { sessionId: existingSessionId, mapKey }
      // 会话已失效，清除映射
      this.sessionMap.delete(mapKey)
    }

    // 2. 查询历史会话
    const historySessions = await this._queryHistorySessions(identity)
    if (historySessions && historySessions.length > 0) {
      return { needsChoice: true, sessions: historySessions, mapKey }
    }

    // 3. 创建新会话
    const sessionId = await this.createSession(identity)
    if (sessionId) {
      this.sessionMap.set(mapKey, sessionId)
    }
    return { sessionId, mapKey }
  }

  /** @private */
  async _validateSession(sessionId) {
    try {
      const sessions = this._agentSessionManager.sessions
      if (sessions?.has(sessionId)) return true
      // 不在内存中，检查 agent_conversations
      const session = await this._sessionDatabase?.getAgentConversation?.(sessionId)
      if (!session || session.status === 'closed') return false
      return true
    } catch {
      return false
    }
  }

  /** @private */
  async _queryHistorySessions(identity) {
    if (this._sessionDatabase?.getImSessionsByType) {
      try {
        const staffId = identity.staffId || identity.userId
        const conversationId = identity.conversationId || identity.chatId
        const isDirectMessage = (identity?.chatType || '').toLowerCase() === 'p2p'
        const exact = await this._sessionDatabase.getImSessionsByType(
          this._imType,
          staffId,
          conversationId,
          this._maxHistorySessions
        )
        if (Array.isArray(exact) && exact.length > 0) {
          return exact
        }
        if (typeof this._sessionDatabase.listAllAgentConversations === 'function') {
          const allRows = await this._sessionDatabase.listAllAgentConversations({
            limit: Math.max(this._maxHistorySessions * 5, 50)
          })
          if (Array.isArray(allRows) && allRows.length > 0) {
            const shortConversationId = typeof conversationId === 'string' ? conversationId.substring(0, 8) : ''
            const shortStaffId = typeof staffId === 'string' ? staffId.substring(0, 8) : ''
            return allRows
              .filter(row => row?.type === this._imType || row?.source === this._imType)
              .filter((row) => {
                if (row?.staff_id === staffId && row?.conversation_id === conversationId) return true
                if (isDirectMessage && row?.staff_id === staffId && !row?.conversation_id) return true
                if (conversationId && row?.conversation_id === conversationId) {
                  if (!isDirectMessage) return true
                  return !staffId || row?.staff_id === staffId
                }
                const title = typeof row?.title === 'string' ? row.title : ''
                const hasConversation = shortConversationId ? title.includes(shortConversationId) : false
                const hasStaff = shortStaffId ? title.includes(shortStaffId) : false
                if (!hasConversation) return false
                if (!shortStaffId) return true
                if (hasStaff) return true
                if (isDirectMessage) return false
                return !row?.staff_id
              })
              .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))
              .slice(0, this._maxHistorySessions)
          }
        }
        return []
      } catch {
        return []
      }
    }
    if (!this._sessionDatabase?.getDingTalkSessions) {
      // 不同 IM 类型有不同的 DB 查询方法
      // 尝试通用查询方式：按 type 和 identity 字段查
      try {
        const key = this.buildKey(identity)
        return await this._sessionDatabase.getSessionsByImIdentity?.(
          this._imType, key, this._maxHistorySessions
        )
      } catch {
        return []
      }
    }
    // 兼容钉钉的现有 DB 查询方法
    try {
      const staffId = identity.staffId || identity.userId
      const conversationId = identity.conversationId || identity.chatId
      return await this._sessionDatabase.getDingTalkSessions?.(
        staffId, conversationId, this._maxHistorySessions
      )
    } catch {
      return []
    }
  }

  // ─── 会话创建 ───

  /**
   * 创建新的 IM Agent 会话
   * @param {object} identity - IM 身份对象
   * @returns {Promise<string|null>} sessionId
   */
  async createSession(identity, opts = {}) {
    const title = this._buildSessionTitle(identity)
    const cwd = opts.cwd || this._defaultCwd || undefined
    const cwdSubDir = cwd ? undefined : this._imType
    try {
      const session = await this._agentSessionManager.create({
        type: this._imType,
        source: this._imType,
        title,
        cwd,
        cwdSubDir,
        meta: {
          imType: this._imType,
          identityKey: this.buildKey(identity),
        },
      })
      if (session?.id && this._sessionDatabase?.updateDingTalkMetadata) {
        // 复用钉钉的 staff_id/conversation_id 列存储 IM 身份
        // userId → staff_id, chatId → conversation_id
        const staffId = identity.staffId || identity.userId || ''
        const conversationId = identity.conversationId || identity.chatId || ''
        try {
          this._sessionDatabase.updateDingTalkMetadata(session.id, staffId, conversationId)
        } catch (e) {
          console.warn(`[ImSessionMapper] Failed to save IM identity metadata:`, e.message)
        }
      }
      return session?.id || null
    } catch (err) {
      console.error(`[ImSessionMapper] createSession failed for ${this._imType}:`, err)
      return null
    }
  }

  // ─── 历史会话选择 ───

  /**
   * 清除指定 key 的待处理选择
   * @param {string} mapKey
   */
  clearPendingChoice(mapKey) {
    const pending = this._pendingChoices.get(mapKey)
    if (pending) {
      clearTimeout(pending.timer)
      this._pendingChoices.delete(mapKey)
    }
  }

  /**
   * 初始化待处理选择（当有多个历史会话时）
   * @param {string} mapKey
   * @param {Array} sessions
   * @param {Function} onSendChoiceMenu - (menuText: string) => Promise<void>
   * @param {number} [timeoutMs] - 超时时间（默认 10 分钟）
   * @returns {Promise<{ sessionId: string|null }>} 用户选择后 resolve
   */
  initPendingChoice(mapKey, sessions, onSendChoiceMenu, optionsOrTimeout = 10 * 60 * 1000) {
    this.clearPendingChoice(mapKey)

    const options = typeof optionsOrTimeout === 'object' && optionsOrTimeout !== null
      ? optionsOrTimeout
      : {}
    const timeoutMs = typeof optionsOrTimeout === 'number'
      ? optionsOrTimeout
      : (typeof options.timeoutMs === 'number' ? options.timeoutMs : 10 * 60 * 1000)

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._pendingChoices.delete(mapKey)
        resolve({ sessionId: null })
      }, timeoutMs)

      this._pendingChoices.set(mapKey, { sessions, resolve, timer, options })

      // 发送选择菜单
      const menuText = this._buildChoiceMenuText(sessions, options)
      onSendChoiceMenu(menuText).catch(() => {
        clearTimeout(timer)
        this._pendingChoices.delete(mapKey)
        resolve({ sessionId: null })
      })
    })
  }

  /** @private */
  _buildChoiceMenuText(sessions, options = {}) {
    if (typeof options.menuBuilder === 'function') {
      return options.menuBuilder(sessions)
    }
    const lines = [
      `检测到 ${sessions.length} 个历史会话，请回复数字选择：`,
      '0 — 创建新会话',
    ]
    sessions.forEach((s, i) => {
      lines.push(`${i + 1} — ${s.title || '(无标题)'}`)
    })
    return lines.join('\n')
  }

  /**
   * 处理用户的选择回复
   * @param {string} mapKey
   * @param {string} inputText - 用户输入的数字
   * @param {object} identity
   * @returns {Promise<{ sessionId: string|null, originalMessage?: object|undefined }>}
   */
  async handleChoice(mapKey, inputText, identity) {
    const pending = this._pendingChoices.get(mapKey)
    if (!pending) return { sessionId: null }

    const { sessions, resolve, timer, options } = pending
    const choice = parseInt(inputText, 10)

    if (isNaN(choice) || choice < 0 || choice > sessions.length) {
      return {
        sessionId: null,
        invalidChoice: true,
        menuText: this._buildChoiceMenuText(sessions, options)
      }
    }

    clearTimeout(timer)
    this._pendingChoices.delete(mapKey)

    if (choice === 0) {
      // 创建新会话
      const sessionId = await this.createSession(identity)
      if (sessionId) {
        this.sessionMap.set(mapKey, sessionId)
      }
      const result = { sessionId, action: 'new', wasActivated: false }
      resolve(result)
      return result
    }

    if (choice >= 1 && choice <= sessions.length) {
      // 恢复历史会话
      const selected = sessions[choice - 1]
      let sessionId = selected.session_id || selected.sessionId || selected.id
      const existingSession = sessionId ? this._agentSessionManager.sessions?.get?.(sessionId) : null
      const wasActivated = !!existingSession?.queryGenerator
      if (sessionId) {
        try {
          await this._agentSessionManager.reopen(sessionId)
          this.sessionMap.set(mapKey, sessionId)
          if (this._sessionDatabase?.updateDingTalkMetadata) {
            const staffId = identity.staffId || identity.userId || ''
            const conversationId = identity.conversationId || identity.chatId || ''
            this._sessionDatabase.updateDingTalkMetadata(sessionId, staffId, conversationId)
          }
        } catch (err) {
          console.error(`[ImSessionMapper] reopen failed:`, err)
          sessionId = null
        }
      }
      const result = { sessionId, action: 'resume', selectedSession: selected, wasActivated }
      resolve(result)
      return result
    }

    // 无效选择
    resolve({ sessionId: null })
    return { sessionId: null }
  }

  // ─── 当前会话检测 ───

  /**
   * 检查 IM 身份当前对应的活跃会话
   * @param {string} mapKey
   * @returns {Promise<string|null>} sessionId 或 null
   */
  async resolveActiveSessionId(mapKey) {
    const sessionId = this.sessionMap.get(mapKey)
    if (!sessionId) return null

    // 检查内存中是否活跃
    try {
      const sessions = this._agentSessionManager.sessions
      if (sessions?.has(sessionId)) return sessionId

      const session = await this._sessionDatabase?.getAgentConversation?.(sessionId)
      if (!session || session.status === 'closed') {
        this.sessionMap.delete(mapKey)
        return null
      }
      return sessionId
    } catch {
      this.sessionMap.delete(mapKey)
      return null
    }
  }

  // ─── 状态清理 ───

  /**
   * 清理指定 mapKey 的会话状态
   * @param {string} mapKey
   */
  clearSessionState(mapKey) {
    this.sessionMap.delete(mapKey)
    this.clearPendingChoice(mapKey)
  }

  /** 清理所有状态 */
  clearAll() {
    this.sessionMap.clear()
    for (const [key, pending] of this._pendingChoices) {
      clearTimeout(pending.timer)
    }
    this._pendingChoices.clear()
    this._sessionWebhooks.clear()
  }
}

module.exports = { ImSessionMapper }

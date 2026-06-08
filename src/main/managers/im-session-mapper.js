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
 *     buildIdentityKey: (identity) => identity.userId,
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
    this._queryHistorySessionsOverride = typeof opts.queryHistorySessions === 'function'
      ? opts.queryHistorySessions
      : null

    /** @type {Map<string, string>} IM 身份 key → sessionId */
    this.sessionMap = new Map()
    /** @type {Map<string, { sessions: Array, resolve: Function, timer: NodeJS.Timeout }>} 待处理选择 */
    this._pendingChoices = new Map()
    /** @type {Map<string, string>} sessionId → webhook URL */
    this._sessionWebhooks = new Map()
  }

  // ─── 身份 key ───

  buildKey(identity) {
    // 群聊 key = chatId，同一群不同成员共享会话
    // p2p/single key = userId，与 agent_conversations.im_user_id / 空 im_chat_id 语义一致
    // Feishu 群聊 chatType='chat'，企业微信群聊 chatType='group'
    if ((identity.chatType === 'group' || identity.chatType === 'chat') && identity.chatId) {
      return identity.chatId
    }
    const userId = identity.staffId || identity.userId || identity.senderId || ''
    return userId || this._buildIdentityKey(identity)
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
    if (this._queryHistorySessionsOverride) {
      try {
        const result = await this._queryHistorySessionsOverride(identity)
        return Array.isArray(result) ? result : []
      } catch {
        return []
      }
    }
    if (!this._sessionDatabase?.getImSessionsByType) {
      return []
    }
    try {
      const isDirectChat = identity.chatType === 'p2p' || identity.chatType === 'single'
      // p2p/single: 按 im_user_id 过滤；群聊: im_user_id 固定为空串，仅按 im_chat_id 过滤
      const userId = isDirectChat ? (identity.staffId || identity.userId || '') : ''
      const chatId = isDirectChat
        ? ''
        : (identity.conversationId || identity.chatId || '')
      const exact = await this._sessionDatabase.getImSessionsByType(
        this._imType,
        userId,
        chatId,
        this._maxHistorySessions
      )
      if (Array.isArray(exact) && exact.length > 0) {
        return exact
      }
      return []
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
        type: 'chat',
        source: 'im-inbound',
        imChannel: this._imType,
        title,
        cwd,
        cwdSubDir,
        meta: {
          imType: this._imType,
          identityKey: this.buildKey(identity),
        },
      })
      if (session?.id && this._sessionDatabase?.updateImIdentity) {
        const staffId = identity.staffId || identity.userId || ''
        const conversationId = identity.conversationId || identity.chatId || ''
        // 群聊 im_user_id 固定为空，仅靠 im_chat_id 标识
        const isGroupChat = identity.chatType === 'group' || identity.chatType === 'chat'
        try {
          this._sessionDatabase.updateImIdentity(session.id, { userId: isGroupChat ? '' : staffId, chatId: isGroupChat ? conversationId : '', chatType: isGroupChat ? 'group' : 'p2p' })
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
    return new Promise((resolve) => {
      const { options } = this._setPendingChoiceEntry(mapKey, sessions, {
        optionsOrTimeout,
        resolve,
        timerFactory: () => {
          return setTimeout(() => {
            this._pendingChoices.delete(mapKey)
            resolve({ sessionId: null })
          }, this._resolvePendingChoiceTimeout(optionsOrTimeout))
        },
      })

      const pending = this._pendingChoices.get(mapKey)
      if (pending) {
        pending.resolve = resolve
      }

      // 发送选择菜单
      const menuText = this._buildChoiceMenuText(sessions, options)
      onSendChoiceMenu(menuText).catch(() => {
        const currentPending = this._pendingChoices.get(mapKey)
        if (currentPending?.timer) {
          clearTimeout(currentPending.timer)
        }
        this._pendingChoices.delete(mapKey)
        resolve({ sessionId: null })
      })
    })
  }

  async handleDirectChoice(mapKey, sessions, inputText, identity, optionsOrTimeout = 10 * 60 * 1000) {
    this._setPendingChoiceEntry(mapKey, sessions, {
      optionsOrTimeout,
      timerFactory: () => {
        return setTimeout(() => {
          this._pendingChoices.delete(mapKey)
        }, this._resolvePendingChoiceTimeout(optionsOrTimeout))
      },
    })

    return this.handleChoice(mapKey, inputText, identity)
  }

  _resolvePendingChoiceOptions(optionsOrTimeout) {
    return typeof optionsOrTimeout === 'object' && optionsOrTimeout !== null
      ? optionsOrTimeout
      : {}
  }

  _resolvePendingChoiceTimeout(optionsOrTimeout) {
    const options = this._resolvePendingChoiceOptions(optionsOrTimeout)
    if (typeof optionsOrTimeout === 'number') return optionsOrTimeout
    return typeof options.timeoutMs === 'number' ? options.timeoutMs : 10 * 60 * 1000
  }

  _setPendingChoiceEntry(mapKey, sessions, { optionsOrTimeout, resolve = () => {}, timerFactory }) {
    this.clearPendingChoice(mapKey)

    const options = this._resolvePendingChoiceOptions(optionsOrTimeout)
    const entry = {
      sessions,
      resolve,
      timer: null,
      options,
    }
    entry.timer = timerFactory()
    this._pendingChoices.set(mapKey, entry)
    return { options, entry }
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
    const safeResolve = typeof resolve === 'function' ? resolve : () => {}
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
      safeResolve(result)
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
          const reopened = await this._agentSessionManager.reopen(sessionId)
          if (!reopened) {
            sessionId = null
          } else {
            this.sessionMap.set(mapKey, sessionId)
            if (this._sessionDatabase?.updateImIdentity) {
              const staffId = identity.staffId || identity.userId || ''
              const conversationId = identity.conversationId || identity.chatId || ''
              const isGroupChat = identity.chatType === 'group' || identity.chatType === 'chat'
              this._sessionDatabase.updateImIdentity(sessionId, { userId: isGroupChat ? '' : staffId, chatId: isGroupChat ? conversationId : '', chatType: isGroupChat ? 'group' : 'p2p' })
            }
          }
        } catch (err) {
          console.error(`[ImSessionMapper] reopen failed:`, err)
          sessionId = null
        }
      }
      const result = { sessionId, action: 'resume', selectedSession: selected, wasActivated }
      safeResolve(result)
      return result
    }

    // 无效选择
    safeResolve({ sessionId: null })
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

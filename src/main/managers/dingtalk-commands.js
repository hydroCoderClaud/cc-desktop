/**
 * DingTalk Commands
 * 钉钉 / 前缀命令处理（从 dingtalk-bridge.js 提取，通过 mixin 混入）
 *
 * 所有方法的 this 指向 DingTalkBridge 实例
 */

const fs = require('fs')
const path = require('path')
const {
  buildSharedStatusText,
  buildSharedSessionsText,
  resolveCloseCommand,
  resolveRenameCommand,
} = require('./im-command-executor')
const {
  listChatSessions,
  createActivatedSessionMatcher,
} = require('./im-session-selectors')
const {
  buildImCommandHelpText,
  buildAlreadyConnectedText,
  buildSessionSwitchedText,
  buildSessionActivatingText,
  buildSessionCreatingText,
  buildNoHistoryText,
  buildRenameMissingSessionText,
  buildRenamePromptText,
  buildRenameSuccessText,
  buildUnknownCommandText,
  resolveCommandCwd,
} = require('./im-command-policy')

function buildDingTalkCommandContext(context = {}, webhook = null) {
  return {
    mapKey: context?.mapKey || '',
    senderStaffId: context?.senderStaffId || '',
    senderNick: context?.senderNick || '',
    conversationId: context?.conversationId || '',
    conversationTitle: context?.conversationTitle || '',
    conversationType: context?.conversationType || '',
    robotCode: context?.robotCode || '',
    sessionWebhook: webhook || null,
  }
}

module.exports = {
  // ============================================================
  // P0 命令层
  // 新增命令：在 _handleCommand 的 switch 里加 case，再写 _cmdXxx 方法
  // ============================================================

  /**
   * 命令分发器
   *
   * 原则：收到新命令时，清空所有历史状态（pending choice、原始消息等）
   * 命令是独立操作，不应受之前状态影响，也不应把历史消息发送给 Agent
   */
  async _handleCommand(text, webhook, context) {
    console.log('[DingTalk] _handleCommand called, text:', text, 'context:', context)
    const parts = text.substring(1).trim().split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)

    // 命令处理时清除待选择状态（命令是独立操作，不应被当作"选择"处理）
    // 这会清除 pending choice 及其保存的 originalMessage
    const { mapKey } = context
    if (mapKey && this._pendingChoices.has(mapKey)) {
      console.log('[DingTalk] _handleCommand: clearing pending choice for', mapKey)
      this._clearPendingChoice(mapKey)
    }

    console.log('[DingTalk] _handleCommand: executing command:', cmd, 'args:', args)
    const commandContext = buildDingTalkCommandContext(context, webhook)
    let reply
    switch (cmd) {
      case 'help':     reply = this._cmdHelp(commandContext); break
      case 'status':   reply = this._cmdStatus(commandContext); break
      case 'sessions': reply = this._cmdSessions(commandContext); break
      case 'close':    reply = await this._cmdClose(args, context); break
      case 'new':      reply = await this._cmdNew(args, context, webhook); break
      case 'resume':   reply = await this._cmdResume(args, context, webhook); break
      case 'rename':   reply = this._cmdRename(args, context); break
      default:         reply = `❓ ${buildUnknownCommandText(cmd)}`
    }

    if (reply != null) {
      console.log('[DingTalk] _handleCommand: sending reply, length:', reply.length)
      await this._replyToDingTalk(webhook, reply)
    }
  },

  _cmdHelp(_context = null) {
    return buildImCommandHelpText({
      title: '📋 可用命令：',
      includeDirectoryArg: true,
      includeHistoryHint: true,
    })
  },

  async _cmdResume(args, { mapKey, senderStaffId, senderNick, conversationId, conversationTitle, conversationType, robotCode }, webhook) {
    // 获取当前活跃会话（如果有）
    const currentSessionId = this._resolveActiveSessionId(mapKey)
    const currentSession = currentSessionId ? this.agentSessionManager.sessions.get(currentSessionId) : null

    // 如果正在 streaming，不允许操作
    if (currentSession?.status === 'streaming') {
      return '⏳ AI 正在响应中，请等待完成后再操作'
    }

    // 查询历史会话
    const db = this.agentSessionManager.sessionDatabase
    if (!db || !conversationId) return '📭 没有历史会话记录'
    const limit = this.configManager.getConfig()?.dingtalk?.maxHistorySessions || 5
    let sessions = db.getImSessionsByType
      ? db.getImSessionsByType('dingtalk', senderStaffId, conversationId, limit)
      : db.getDingTalkSessions(senderStaffId, conversationId, limit)
    if ((!Array.isArray(sessions) || sessions.length === 0) && typeof db.listAllAgentConversations === 'function') {
      const allRows = db.listAllAgentConversations({
        limit: Math.max(limit * 5, 50)
      })
      if (Array.isArray(allRows) && allRows.length > 0) {
        sessions = allRows
          .filter(row => row?.status !== 'closed')
          .filter(row => row?.im_channel === 'dingtalk')
          .filter(row => row?.staff_id === senderStaffId)
          .filter(row => row?.conversation_id === conversationId)
          .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))
          .slice(0, limit)
      }
    }

    if (currentSessionId) {
      const liveCurrent = this.agentSessionManager.sessions.get(currentSessionId)
      const currentRow = db.getAgentConversation?.(currentSessionId)
      const currentHistoryRow = currentRow || (liveCurrent
        ? {
            session_id: currentSessionId,
            title: liveCurrent.title || currentSessionId,
            cwd: liveCurrent.cwd || null,
            api_profile_id: liveCurrent.apiProfileId || null,
            updated_at: liveCurrent.updatedAt ? new Date(liveCurrent.updatedAt).getTime() : Date.now(),
            type: liveCurrent.type,
            source: liveCurrent.source,
            staff_id: senderStaffId,
            conversation_id: conversationId,
            status: liveCurrent.status || 'idle'
          }
        : null)

      if (currentHistoryRow) {
        const deduped = Array.isArray(sessions)
          ? sessions.filter(row => (row?.session_id || row?.sessionId || row?.id) !== currentSessionId)
          : []
        sessions = [currentHistoryRow, ...deduped]
      }
    }

    if (!sessions || sessions.length === 0) return `📭 ${buildNoHistoryText()}`

    // 直接指定编号 → 立即恢复
    const numArg = parseInt(args[0])
    if (!isNaN(numArg) && numArg >= 1 && numArg <= sessions.length) {
      const selectedRow = sessions[numArg - 1]

      // 如果选择的就是当前会话，提示无需切换
      if (currentSessionId === selectedRow.session_id) {
        return buildAlreadyConnectedText(selectedRow.title)
      }

      // 切换到目标会话（不关闭当前会话）
      // 原则：只更新连接映射，不关闭其他会话，避免误关闭桌面端激活的会话
      // 先检查目标会话是否已在内存中激活
      const existingSession = this.agentSessionManager.sessions.get(selectedRow.session_id)
      const isActivated = existingSession && existingSession.queryGenerator != null

      const session = this.agentSessionManager.reopen(selectedRow.session_id)
      if (session) {
        // 更新会话的 conversationId（确保会话属于当前钉钉对话）
        if (!session.meta) session.meta = {}
        session.meta.conversationId = conversationId

        this.sessionMap.set(mapKey, selectedRow.session_id)
        this._notifyFrontend('dingtalk:sessionCreated', {
          sessionId: selectedRow.session_id, staffId: senderStaffId, nickname: senderNick,
          conversationId, conversationTitle, title: selectedRow.title
        })

        if (isActivated) {
          // 已激活 → 直接可用
          return buildSessionSwitchedText(selectedRow.title)
        }

        // 未激活 → 自动发 hello 激活
        await this._replyToDingTalk(webhook, buildSessionActivatingText())
        this._notifyFrontend('dingtalk:messageReceived', {
          sessionId: selectedRow.session_id, senderNick, text: 'hello'
        })
        this._enqueueMessage(selectedRow.session_id, 'hello', webhook, senderNick, {
          robotCode, senderStaffId, conversationId, conversationType
        })
        return null  // 已由 _replyToDingTalk 回复
      } else {
        return `❌ 无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话`
      }
    }

    // 无参数 → 显示选择菜单（传入当前会话 ID 用于标记）
    this._setPendingChoice(mapKey, { sessions, originalMessage: null, robotCode: null, senderStaffId, source: 'resume-command' })
    await this._sendChoiceMenu(webhook, sessions, currentSessionId)
    return null  // 已由 _sendChoiceMenu 回复
  },

  _cmdRename(args, { mapKey }) {
    const renameDecision = resolveRenameCommand({
      args,
      currentSessionId: this._resolveActiveSessionId(mapKey),
    })
    if (renameDecision.action === 'missing_current') return buildRenameMissingSessionText()
    if (renameDecision.action === 'missing_title') return buildRenamePromptText()

    this.agentSessionManager.rename(renameDecision.sessionId, renameDecision.newTitle)
    return `✅ ${buildRenameSuccessText(renameDecision.newTitle)}`
  },

  /**
   * 获取当前钉钉对话的激活会话列表
   * @param {string} [conversationId] - 钉钉 conversationId，为空时返回所有钉钉激活会话
   * @returns {Object[]} 匹配的激活会话数组
   */
  _getActiveSessionsByConversation(conversationId) {
    const db = this.agentSessionManager.sessionDatabase
    const includeSession = createActivatedSessionMatcher({
      imType: 'dingtalk',
      getImChannel: (session) => session?.imChannel,
      getChatId: (session) => session?.meta?.conversationId || db?.getAgentConversation?.(session?.id)?.conversation_id || '',
      isActivated: (session) => !!session?.queryGenerator,
    })
    return listChatSessions({
      sessions: this.agentSessionManager.sessions.values(),
      chatId: conversationId,
      includeSession,
      // DingTalk historically kept insertion order; preserve that for menu numbering stability.
      sortSessions: (sessions) => [...sessions],
    })
  },

  _cmdStatus(context) {
    const activeSessions = this._getActiveSessionsByConversation(context?.conversationId)
    let currentSession = null
    if (context?.mapKey) {
      const sessionId = this.sessionMap.get(context.mapKey)
      console.log(`[DingTalk] /status: mapKey=${context.mapKey}, sessionId=${sessionId}`)
      if (sessionId) {
        currentSession = this.agentSessionManager.sessions.get(sessionId) || null
        console.log(`[DingTalk] /status: session found, title=${currentSession?.title}, hasQueryGenerator=${!!currentSession?.queryGenerator}`)
      }
    }
    return buildSharedStatusText({
      bridgeLabel: '钉钉桥接',
      connected: true,
      activeSessions,
      currentSession,
      getProfileName: (profileId) => profileId
        ? (this.configManager?.getAPIProfile(profileId)?.name || '未知配置')
        : '默认配置',
    })
  },

  _cmdSessions(context) {
    console.log('[DingTalk] _cmdSessions called, context:', context)
    const activeSessions = this._getActiveSessionsByConversation(context?.conversationId)

    console.log('[DingTalk] _cmdSessions: activeSessions count:', activeSessions.length)
    if (activeSessions.length === 0) {
      console.log('[DingTalk] _cmdSessions: returning "暂无活跃会话"')
      return '📭 暂无活跃会话'
    }

    // 获取当前会话 ID
    const currentSessionId = context?.mapKey ? this._resolveActiveSessionId(context.mapKey) : null
    return buildSharedSessionsText({
      activeSessions,
      currentSessionId,
      getDirName: (cwd) => path.basename(cwd),
      getProfileName: (profileId) => profileId
        ? (this.configManager?.getAPIProfile(profileId)?.name || '未知配置')
        : '默认配置',
    })
  },

  async _cmdClose(args, context) {
    const { mapKey, conversationId } = context
    const activeSessions = this._getActiveSessionsByConversation(conversationId)
    const closeDecision = resolveCloseCommand({
      args,
      activeSessions,
      currentSessionId: this._resolveActiveSessionId(mapKey),
      getSessionById: (sessionId) => this.agentSessionManager.sessions.get(sessionId) || null,
    })

    if (closeDecision.action === 'invalid_index') {
      return `❌ 编号错误：请输入 1-${closeDecision.max} 之间的数字\n\n使用 /sessions 查看会话列表`
    }
    if (closeDecision.action === 'missing_current') {
      return '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话'
    }
    if (closeDecision.action === 'streaming') {
      return closeDecision.targetedByIndex
        ? '⏳ 该会话 AI 正在响应中，请等待完成后再关闭'
        : '⏳ AI 正在响应中，请等待完成后再关闭'
    }

    await this.agentSessionManager.close(closeDecision.targetSessionId)

    for (const [key, sid] of this.sessionMap.entries()) {
      if (sid !== closeDecision.targetSessionId) continue
      this._clearSessionState(closeDecision.targetSessionId, key, { clearTargetBinding: true })
      this._clearPendingChoice(key)
      if (!args.length && key === mapKey) break
    }
    this._notifyFrontend('dingtalk:sessionClosed', { sessionId: closeDecision.targetSessionId })

    const sessionsList = await this._cmdSessions(buildDingTalkCommandContext(context, context?.sessionWebhook))
    const closeMsg = `✅ ${closeDecision.closeText}`
    return sessionsList ? `${closeMsg}\n\n${sessionsList}` : closeMsg
  },

  async _cmdNew(args, { mapKey, senderStaffId, senderNick, conversationId, conversationTitle, robotCode, conversationType }, webhook) {
    const currentSessionId = this._resolveActiveSessionId(mapKey)
    if (currentSessionId) {
      const session = this.agentSessionManager.sessions.get(currentSessionId)
      if (session?.status === 'streaming') {
        return '⏳ AI 正在响应中，请等待完成后再操作'
      }
    }

    this._clearPendingChoice(mapKey)

    let cwd
    try {
      cwd = resolveCommandCwd({
        args,
        outputBaseDir: this.agentSessionManager._getOutputBaseDir(),
        imSubdir: 'dingtalk',
      })
    } catch (err) {
      return `❌ ${err.message}`
    }

    const sessionId = await this._createNewSession(senderStaffId, senderNick, conversationId, conversationTitle, mapKey, { cwd })

    // 发送"会话创建中"提示
    await this._replyToDingTalk(webhook, buildSessionCreatingText())

    // 补发 dingtalk:messageReceived，让桌面端显示用户消息
    this._notifyFrontend('dingtalk:messageReceived', {
      sessionId,
      senderNick,
      text: 'hello'
    })

    // 自动发送 "hello" 激活会话
    this._enqueueMessage(sessionId, 'hello', webhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType })

    return null  // 已由 _replyToDingTalk 回复
  }
}

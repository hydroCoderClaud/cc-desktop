/**
 * DingTalk Commands
 * 钉钉 / 前缀命令处理（从 dingtalk-bridge.js 提取，通过 mixin 混入）
 *
 * 所有方法的 this 指向 DingTalkBridge 实例
 */

const fs = require('fs')
const path = require('path')
const {
  resolveRenameCommand,
  dispatchImCommand,
} = require('./im-command-executor')
const { activateNewSession, resolveResumeSelection } = require('./im-session-command-flow')
const { buildHistoryChoiceMenuText } = require('./im-command-presenter')
const {
  buildImCommandHelpText,
  buildAlreadyConnectedText,
  buildSessionSwitchedText,
  buildSessionReplyingText,
  buildSessionActivatingText,
  buildSessionCreatingText,
  buildNoHistoryText,
  buildRenameMissingSessionText,
  buildRenamePromptText,
  buildRenameSuccessText,
  buildUnknownCommandText,
  resolveCommandCwd,
  mergeCurrentSessionIntoHistory,
} = require('./im-command-policy')
const { runResumePostAction } = require('./im-resume-post-action')

function isDingTalkGroupIdentity(identity = {}) {
  const chatType = String(identity.chatType || '').trim().toLowerCase()
  const conversationType = String(identity.conversationType || '').trim()
  return chatType === 'chat' || chatType === 'group' || conversationType === '2'
}

function firstDingTalkString(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (normalized) return normalized
  }
  return ''
}

function buildDingTalkCommandIdentityFields(identity = {}) {
  const isGroupChat = isDingTalkGroupIdentity(identity)
  const userId = firstDingTalkString(identity.userId, identity.staffId)
  const chatId = firstDingTalkString(identity.chatId, identity.conversationId)
  return {
    userId,
    chatId,
    imChatType: isGroupChat ? 'group' : 'p2p',
    isGroupChat,
  }
}

function normalizeDingTalkCommandIdentity(bridge, context = {}) {
  const rawIdentity = context?.identity || {
    staffId: context?.senderStaffId || context?.staffId || context?.userId || '',
    userId: context?.senderStaffId || context?.staffId || context?.userId || '',
    conversationId: context?.conversationId || context?.chatId || '',
    chatId: context?.chatId || context?.conversationId || '',
    conversationType: context?.conversationType || '',
    chatType: context?.chatType || '',
    nickname: context?.senderNick || context?.nickname || '',
    chatName: context?.conversationTitle || context?.chatName || '',
    conversationTitle: context?.conversationTitle || context?.chatName || '',
  }

  if (typeof bridge?._normalizeDingTalkIdentity === 'function') {
    return bridge._normalizeDingTalkIdentity(rawIdentity)
  }

  const staffId = firstDingTalkString(rawIdentity.staffId, rawIdentity.userId)
  const conversationId = firstDingTalkString(rawIdentity.conversationId, rawIdentity.chatId)
  const rawChatType = String(rawIdentity.chatType || '').trim().toLowerCase()
  const conversationType = String(rawIdentity.conversationType || '').trim()
    || (rawChatType === 'chat' || rawChatType === 'group' ? '2' : '1')
  const isGroupChat = isDingTalkGroupIdentity({ ...rawIdentity, conversationType })
  const nickname = rawIdentity.nickname || rawIdentity.senderName || staffId || '未命名'
  const conversationTitle = rawIdentity.conversationTitle || rawIdentity.chatName || (isGroupChat ? conversationId : nickname)
  return {
    staffId,
    userId: staffId,
    conversationId,
    chatId: conversationId,
    conversationType,
    chatType: isGroupChat ? 'chat' : 'p2p',
    nickname,
    chatName: conversationTitle,
    conversationTitle,
  }
}

function buildDingTalkCommandContext(context = {}, webhook = null, bridge = null) {
  const identity = normalizeDingTalkCommandIdentity(bridge, context)
  const commandIdentity = buildDingTalkCommandIdentityFields(identity)
  const mapKey = context?.mapKey
    || bridge?._sessionMapper?.buildKey?.(identity)
    || (commandIdentity.isGroupChat
      ? commandIdentity.chatId
      : commandIdentity.userId)

  return {
    identity,
    mapKey,
    userId: commandIdentity.userId,
    chatId: commandIdentity.chatId,
    imChatType: commandIdentity.imChatType,
    isGroupChat: commandIdentity.isGroupChat,
    senderStaffId: identity.staffId || commandIdentity.userId || '',
    senderNick: identity.nickname || '',
    conversationId: identity.conversationId || commandIdentity.chatId || '',
    conversationTitle: identity.conversationTitle || '',
    conversationType: identity.conversationType || '',
    chatType: identity.chatType || '',
    robotCode: context?.robotCode || '',
    sessionWebhook: webhook || null,
  }
}

function mergeDingTalkHistoryRows(...groups) {
  const seen = new Set()
  return groups
    .flat()
    .filter((row) => {
      const sessionId = row?.session_id || row?.sessionId || row?.id || null
      if (!sessionId || seen.has(sessionId)) return false
      seen.add(sessionId)
      return true
    })
    .sort((a, b) => (b?.updated_at || 0) - (a?.updated_at || 0))
}

function getCurrentBoundHistoryRow(bridge, db, identity, options = {}) {
  const { userId } = buildDingTalkCommandIdentityFields(identity)
  const boundSessionId = typeof bridge?._findBoundSessionIdByStaffId === 'function'
    ? bridge._findBoundSessionIdByStaffId(userId, options)
    : null
  if (!boundSessionId) return null
  const row = db?.getAgentConversation?.(boundSessionId)
  if (
    row
    && row.status !== 'closed'
    && row.im_channel === 'dingtalk'
    && row.im_user_id === userId
  ) {
    return row
  }
  const liveSession = bridge?.agentSessionManager?.sessions?.get(boundSessionId)
  if (!liveSession) return null
  const chatId = firstDingTalkString(liveSession?.meta?.conversationId, identity?.chatId, identity?.conversationId)
  return {
    session_id: boundSessionId,
    title: liveSession.title || boundSessionId,
    cwd: liveSession.cwd || null,
    api_profile_id: liveSession.apiProfileId || null,
    updated_at: liveSession.updatedAt ? new Date(liveSession.updatedAt).getTime() : Date.now(),
    type: liveSession.type,
    source: liveSession.source,
    im_channel: 'dingtalk',
    im_user_id: userId,
    im_chat_id: chatId,
    im_chat_type: 'p2p',
    status: liveSession.status || 'idle'
  }
}

function buildCurrentHistoryRow(bridge, db, currentSessionId, identity = {}) {
  if (!currentSessionId) return null

  const liveCurrent = bridge?.agentSessionManager?.sessions?.get(currentSessionId) || null
  const dbRow = db?.getAgentConversation?.(currentSessionId) || null
  if (!liveCurrent && (!dbRow || dbRow.status === 'closed')) return null
  const { userId, chatId, imChatType, isGroupChat } = buildDingTalkCommandIdentityFields(identity)

  return {
    ...(dbRow || {}),
    session_id: dbRow?.session_id || liveCurrent?.id || currentSessionId,
    title: dbRow?.title || liveCurrent?.title || currentSessionId,
    cwd: dbRow?.cwd || liveCurrent?.cwd || null,
    api_profile_id: dbRow?.api_profile_id || liveCurrent?.apiProfileId || null,
    updated_at: dbRow?.updated_at || (liveCurrent?.updatedAt ? new Date(liveCurrent.updatedAt).getTime() : Date.now()),
    type: dbRow?.type || liveCurrent?.type || 'chat',
    source: dbRow?.source || liveCurrent?.source || 'im-inbound',
    im_channel: 'dingtalk',
    im_user_id: dbRow?.im_user_id || (isGroupChat ? '' : userId),
    im_chat_id: chatId || dbRow?.im_chat_id || '',
    im_chat_type: dbRow?.im_chat_type || imChatType,
    status: dbRow?.status || liveCurrent?.status || 'idle'
  }
}

function loadDingTalkHistorySessions(bridge, {
  currentSessionId,
  identity,
  mapKey,
}) {
  const db = bridge?.agentSessionManager?.sessionDatabase
  const limit = bridge?.configManager?.getConfig?.()?.dingtalk?.maxHistorySessions || 5
  const normalizedIdentity = normalizeDingTalkCommandIdentity(bridge, { identity })
  const commandIdentity = buildDingTalkCommandIdentityFields(normalizedIdentity)
  if (!db || (!commandIdentity.userId && !commandIdentity.chatId)) {
    return { db, limit, sessions: [] }
  }

  const lookup = typeof bridge?._resolveDingTalkHistoryLookup === 'function'
    ? bridge._resolveDingTalkHistoryLookup(normalizedIdentity)
    : {
        isGroupChat: commandIdentity.isGroupChat,
        queryUserId: commandIdentity.isGroupChat ? '' : commandIdentity.userId,
        queryChatId: commandIdentity.isGroupChat ? commandIdentity.chatId : '',
      }
  const exactSessions = db.getImSessionsByType('dingtalk', lookup.queryUserId, lookup.queryChatId, limit)
  const boundHistoryRow = lookup.isGroupChat
    ? null
    : getCurrentBoundHistoryRow(bridge, db, normalizedIdentity, {
        mapKey,
        allowSuppressed: true,
      })
  const mergedHistory = mergeDingTalkHistoryRows(exactSessions, boundHistoryRow ? [boundHistoryRow] : [])
  const currentRow = buildCurrentHistoryRow(bridge, db, currentSessionId, normalizedIdentity)
  const sessions = mergeCurrentSessionIntoHistory({
    history: mergedHistory,
    currentSessionId,
    currentRow,
  }).slice(0, limit)

  return { db, limit, sessions, identity: normalizedIdentity }
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
    const commandContext = buildDingTalkCommandContext(context, webhook, this)
    const dispatchResult = await dispatchImCommand({
      text,
      normalizeText: (rawText) => String(rawText || '').trim(),
      beforeExecute: ({ command, args }) => {
        const { mapKey } = commandContext
        if (mapKey && this._pendingChoices.has(mapKey)) {
          console.log('[DingTalk] _handleCommand: clearing pending choice for', mapKey)
          this._clearPendingChoice(mapKey)
        }
        console.log('[DingTalk] _handleCommand: executing command:', command, 'args:', args)
      },
      handlers: {
        help: () => this._cmdHelp(commandContext),
        status: () => this._cmdStatus(commandContext),
        close: ({ args }) => this._cmdClose(args, commandContext),
        new: ({ args }) => this._cmdNew(args, commandContext, webhook),
        resume: ({ args }) => this._cmdResume(args, commandContext, webhook),
        rename: ({ args }) => this._cmdRename(args, commandContext),
      },
      onUnknown: ({ command }) => `❓ ${buildUnknownCommandText(command)}`,
    })
    const reply = dispatchResult?.result

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

  async _cmdResume(args, context, webhook) {
    const commandContext = buildDingTalkCommandContext(context, webhook, this)
    const {
      mapKey,
      identity,
      userId,
      chatId,
      isGroupChat,
      senderStaffId,
      senderNick,
      conversationId,
      conversationType,
      robotCode,
    } = commandContext
    // 获取当前活跃会话（如果有）
    const currentSessionId = mapKey ? this._resolveActiveSessionId(mapKey) : null
    const resumeSessionId = currentSessionId || (
      !isGroupChat && userId
        ? this._findBoundSessionIdByStaffId?.(userId, {
            mapKey,
            allowDatabaseFallback: false,
          }) || null
        : null
    )
    const currentSession = resumeSessionId ? this.agentSessionManager.sessions.get(resumeSessionId) : null

    // 如果正在 streaming，不允许操作
    if (currentSession?.status === 'streaming') {
      return '⏳ AI 正在响应中，请等待完成后再操作'
    }

    // 查询历史会话
    const { db, limit, sessions } = loadDingTalkHistorySessions(this, {
      currentSessionId: resumeSessionId,
      identity,
      mapKey,
    })
    if (!db || (!userId && !chatId)) return '📭 没有历史会话记录'

    if (!sessions || sessions.length === 0) return `📭 ${buildNoHistoryText()}`

    // 直接指定编号 → 立即恢复
    const numArg = parseInt(args[0])
    if (!isNaN(numArg)) {
      const selection = resolveResumeSelection({
        history: sessions,
        selectedIndex: numArg,
        currentSessionId: resumeSessionId,
        currentSession,
      })
      if (selection.action === 'invalid_index') {
        return `❌ 编号错误：请输入 1-${selection.max} 之间的数字`
      }
      const selectedRow = selection.selected

      // 如果选择的就是当前会话，提示无需切换
      if (selection.action === 'already_connected') {
        return buildAlreadyConnectedText(selectedRow.title)
      }

      const result = await this._sessionMapper.handleDirectChoice(
        mapKey,
        sessions,
        String(selection.index),
        identity
      )
      const resumedSessionId = result?.sessionId || null
      if (!resumedSessionId) {
        return `❌ 无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话`
      }

      this._applyDingTalkSessionContext(resumedSessionId, identity, {
        mapKey,
        notify: true,
      })

      this._restoreSessionAfterExplicitChoice(mapKey, senderStaffId)

      const resumedSession = this.agentSessionManager.sessions.get(resumedSessionId) || null
      const shouldWaitForReply = resumedSession?.status === 'streaming'
      if (result.wasActivated) {
        return shouldWaitForReply
          ? buildSessionReplyingText(result?.selectedSession?.title || resumedSessionId)
          : buildSessionSwitchedText(result?.selectedSession?.title || resumedSessionId)
      }

      await this._replyToDingTalk(webhook, buildSessionActivatingText())
      await runResumePostAction({
        pendingMessage: null,
        clearPendingMessage: () => {},
        wasActivated: result.wasActivated,
        notifyMessageReceived: () => {
          this._notifyFrontend('dingtalk:messageReceived', {
            sessionId: resumedSessionId, senderNick, text: 'hello'
          })
        },
        enqueueHello: async () => {
          this._enqueueMessage(resumedSessionId, 'hello', webhook, senderNick, {
            robotCode, senderStaffId, conversationId, conversationType
          })
        },
      })
      return null  // 已由 _replyToDingTalk 回复
    }

    // 无参数 → 显示选择菜单（传入当前会话 ID 用于标记）
    this._setPendingChoice(mapKey, { sessions, originalMessage: null, robotCode: null, senderStaffId, source: 'resume-command' })
    await this._sendChoiceMenu(webhook, sessions, resumeSessionId)
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

  _cmdStatus(context) {
    const commandContext = buildDingTalkCommandContext(context, context?.sessionWebhook || null, this)
    const { mapKey, identity, userId, chatId, isGroupChat } = commandContext
    const currentSessionId = mapKey ? this._resolveActiveSessionId(mapKey) : null
    const historySessionId = currentSessionId || (
      !isGroupChat && userId
        ? this._findBoundSessionIdByStaffId?.(userId, {
            mapKey,
            allowSuppressed: true,
          }) || null
        : null
    )
    const statusCurrentSessionId = currentSessionId || (
      !isGroupChat && userId
        ? this._findBoundSessionIdByStaffId?.(userId, { mapKey }) || null
        : null
    )
    const { db, limit, sessions } = loadDingTalkHistorySessions(this, {
      currentSessionId: historySessionId,
      identity,
      mapKey,
    })
    if (!db || (!userId && !chatId)) return '📭 没有历史会话记录'
    if (!sessions || sessions.length === 0) return `📭 ${buildNoHistoryText()}`
    return buildHistoryChoiceMenuText({
      sessions,
      currentSessionId: statusCurrentSessionId,
      maxSessions: limit,
      getDirName: (cwd) => path.basename(cwd),
      getProfileName: (profileId) => profileId
        ? (this.configManager?.getAPIProfile(profileId)?.name || '未知配置')
        : '默认配置',
      isSessionActivated: (sessionId) => !!this.agentSessionManager.sessions.get(sessionId)?.queryGenerator,
      title: '当前会话状态：',
      includeActionHint: false,
      includeNewSessionHint: false,
    })
  },

  async _cmdClose(args, context) {
    if (Array.isArray(args) && args.length > 0) {
      return '❌ /close 不支持带编号或参数，请直接使用 /close'
    }

    const { mapKey } = context
    const currentSessionId = this._resolveActiveSessionId(mapKey)
    if (!currentSessionId) {
      return '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话'
    }

    const currentSession = this.agentSessionManager.sessions.get(currentSessionId) || null
    if (currentSession?.status === 'streaming') {
      return '⏳ AI 正在响应中，请等待完成后再关闭'
    }

    this._suppressProactiveRebind(currentSessionId)
    await this.agentSessionManager.close(currentSessionId)

    for (const [key, sid] of this.sessionMap.entries()) {
      if (sid !== currentSessionId) continue
      this._clearSessionState(currentSessionId, key, { clearTargetBinding: true })
      this._clearPendingChoice(key)
      if (key === mapKey) break
    }
    this._notifyFrontend('dingtalk:sessionClosed', { sessionId: currentSessionId })
    return '✅ 会话已关闭'
  },

  async _cmdNew(args, context, webhook) {
    const commandContext = buildDingTalkCommandContext(context, webhook, this)
    const { mapKey, identity, senderStaffId, senderNick, conversationId, conversationType, robotCode } = commandContext
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

    const sessionId = await this._createSessionFromIdentity(identity, {
      cwd,
      mapKey,
      notify: true,
    })
    if (!sessionId) {
      return '❌ 创建新会话失败'
    }
    this._restoreSessionAfterExplicitChoice(mapKey, senderStaffId)

    // 发送"会话创建中"提示
    await this._replyToDingTalk(webhook, buildSessionCreatingText())

    await activateNewSession({
      sessionId,
      notifyMessageReceived: () => {
        this._notifyFrontend('dingtalk:messageReceived', {
          sessionId,
          senderNick,
          text: 'hello'
        })
      },
      enqueueHello: async () => {
        this._enqueueMessage(sessionId, 'hello', webhook, senderNick, { robotCode, senderStaffId, conversationId, conversationType })
      },
    })

    return null  // 已由 _replyToDingTalk 回复
  }
}

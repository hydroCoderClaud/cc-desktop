/**
 * DingTalk Commands
 * 钉钉 / 前缀命令处理（从 dingtalk-bridge.js 提取，通过 mixin 混入）
 *
 * 所有方法的 this 指向 DingTalkBridge 实例
 */

const fs = require('fs')
const path = require('path')

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
    let reply
    switch (cmd) {
      case 'help':     reply = this._cmdHelp(); break
      case 'status':   reply = this._cmdStatus(context); break
      case 'sessions': reply = this._cmdSessions(context); break
      case 'close':    reply = await this._cmdClose(args, context); break
      case 'new':      reply = await this._cmdNew(args, context, webhook); break
      case 'resume':   reply = await this._cmdResume(args, context, webhook); break
      case 'rename':   reply = this._cmdRename(args, context); break
      default:         reply = `❓ 未知命令: /${cmd}\n\n输入 /help 查看可用命令`
    }

    if (reply != null) {
      console.log('[DingTalk] _handleCommand: sending reply, length:', reply.length)
      await this._replyToDingTalk(webhook, reply)
    }
  },

  _cmdHelp() {
    return [
      '📋 可用命令：',
      '',
      '/help — 显示此帮助',
      '/status — 系统状态',
      '/sessions — 已激活会话列表',
      '/new [目录] — 新建会话（可选：目录名或绝对路径）',
      '/resume [编号] — 恢复历史会话（不带编号显示列表）',
      '/rename <名称> — 修改当前会话名称',
      '/close [编号] — 关闭会话（不带编号关闭当前会话，带编号关闭指定会话）',
      '',
      '💬 不带 / 的消息直接发给 AI 助手'
    ].join('\n\n')
  },

  async _cmdResume(args, { mapKey, senderStaffId, senderNick, conversationId, conversationTitle, conversationType }, webhook) {
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
    const sessions = db.getDingTalkSessions(senderStaffId, conversationId)
    if (!sessions || sessions.length === 0) return '📭 没有历史会话记录\n\n发送任意消息可开始新会话'

    // 直接指定编号 → 立即恢复
    const numArg = parseInt(args[0])
    if (!isNaN(numArg) && numArg >= 1 && numArg <= sessions.length) {
      const selectedRow = sessions[numArg - 1]

      // 如果选择的就是当前会话，提示无需切换
      if (currentSessionId === selectedRow.session_id) {
        return `✅ 当前已连接该会话：${selectedRow.title}`
      }

      // 切换到目标会话（不关闭当前会话）
      // 原则：只更新连接映射，不关闭其他会话，避免误关闭桌面端激活的会话
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
        // 使用国际化提示文本
        return this._t('sessionSwitched').replace('{title}', selectedRow.title)
      } else {
        return `❌ 无法恢复该会话，可能已被删除\n\n发送任意消息可开始新会话`
      }
    }

    // 无参数 → 显示选择菜单（传入当前会话 ID 用于标记）
    this._setPendingChoice(mapKey, { sessions, originalMessage: null, robotCode: null, senderStaffId })
    await this._sendChoiceMenu(webhook, sessions, currentSessionId)
    return null  // 已由 _sendChoiceMenu 回复
  },

  _cmdRename(args, { mapKey }) {
    const sessionId = this._resolveActiveSessionId(mapKey)
    if (!sessionId) return '当前没有活跃会话，无法重命名'

    const newTitle = args.join(' ').trim()
    if (!newTitle) return '请提供新名称，例如：/rename 我的项目'

    this.agentSessionManager.rename(sessionId, newTitle)
    return `✅ 会话已重命名为：${newTitle}`
  },

  /**
   * 获取当前钉钉对话的激活会话列表
   * @param {string} [conversationId] - 钉钉 conversationId，为空时返回所有钉钉激活会话
   * @returns {Object[]} 匹配的激活会话数组
   */
  _getActiveSessionsByConversation(conversationId) {
    const allSessions = [...this.agentSessionManager.sessions.values()]
    const db = this.agentSessionManager.sessionDatabase

    return allSessions.filter(s => {
      if (s.type !== 'dingtalk' || !s.queryGenerator) return false
      if (!conversationId) return true

      // 优先使用内存中的 meta.conversationId，如果没有则从数据库查询
      if (s.meta?.conversationId) {
        return s.meta.conversationId === conversationId
      }

      // 从数据库查询会话的 conversationId
      if (db) {
        const row = db.getAgentConversation(s.id)
        return row?.conversation_id === conversationId
      }

      return true  // 无法判断时包含（兼容旧会话）
    })
  },

  _cmdStatus(context) {
    const activeSessions = this._getActiveSessionsByConversation(context?.conversationId)
    const streaming = activeSessions.filter(s => s.status === 'streaming').length
    const idle = activeSessions.filter(s => s.status === 'idle').length

    const lines = ['📊 系统状态', `├─ 钉钉桥接: ✅ 已连接`]

    // 获取当前用户连接的会话（必须有 queryGenerator 才算真正激活）
    if (context?.mapKey) {
      const sessionId = this.sessionMap.get(context.mapKey)
      console.log(`[DingTalk] /status: mapKey=${context.mapKey}, sessionId=${sessionId}`)
      if (sessionId) {
        const session = this.agentSessionManager.sessions.get(sessionId)
        console.log(`[DingTalk] /status: session found, title=${session?.title}, hasQueryGenerator=${!!session?.queryGenerator}`)
        if (session && session.queryGenerator) {
          const config = this.configManager.getConfig()
          const profiles = config?.apiProfiles || []
          const defaultId = config?.defaultProfileId
          const current = profiles.find(p => p.id === defaultId)
          const apiName = current?.name || '未配置'
          lines.push(`├─ 当前会话: ${session.title} (${apiName})`)
        }
      }
    }

    lines.push(`├─ 执行中: ${streaming} 个 / 空闲: ${idle} 个`)
    lines.push(`└─ 总会话数: ${activeSessions.length} 个`)

    return lines.join('\n\n')
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

    const lines = ['📋 活跃会话：', '']
    activeSessions.forEach((s, i) => {
      const dir = s.cwd ? path.basename(s.cwd) : '-'
      const profileName = s.apiProfileId
        ? (this.configManager?.getAPIProfile(s.apiProfileId)?.name || '未知配置')
        : '默认配置'
      // 标记当前连接的会话
      const marker = (currentSessionId && s.id === currentSessionId) ? '✅ ' : ''
      lines.push(`${i + 1}. ${marker}${s.title || s.id.substring(0, 8)} (${dir}) ${profileName}`)
    })
    lines.push('', '使用 /close 关闭当前会话')
    return lines.join('\n\n')
  },

  async _cmdClose(args, context) {
    const { mapKey, conversationId } = context
    const activeSessions = this._getActiveSessionsByConversation(conversationId)

    // 如果指定了编号
    if (args.length > 0) {
      const index = parseInt(args[0], 10)
      if (isNaN(index) || index < 1 || index > activeSessions.length) {
        return `❌ 编号错误：请输入 1-${activeSessions.length} 之间的数字\n\n使用 /sessions 查看会话列表`
      }

      const targetSession = activeSessions[index - 1]
      if (targetSession.status === 'streaming') {
        return '⏳ 该会话 AI 正在响应中，请等待完成后再关闭'
      }

      // 关闭指定会话
      await this.agentSessionManager.close(targetSession.id)

      // 清理相关映射（需要找到对应的 mapKey）
      for (const [key, sid] of this.sessionMap.entries()) {
        if (sid === targetSession.id) {
          this._clearSessionState(targetSession.id, key)
          this._clearPendingChoice(key)
          break
        }
      }
      this._notifyFrontend('dingtalk:sessionClosed', { sessionId: targetSession.id })

      // 关闭后自动显示剩余会话列表
      const closeMsg = `✅ 会话 ${index} 已关闭：${targetSession.title || targetSession.id.substring(0, 8)}`
      const sessionsList = this._cmdSessions(context)
      return `${closeMsg}\n\n${sessionsList}`
    }

    // 不带编号：关闭当前连接的会话
    const sessionId = this._resolveActiveSessionId(mapKey)
    if (!sessionId) return '当前没有连接会话，无需关闭\n\n发送任意消息可开始新会话'

    const session = this.agentSessionManager.sessions.get(sessionId)
    if (session?.status === 'streaming') {
      return '⏳ AI 正在响应中，请等待完成后再关闭'
    }

    await this.agentSessionManager.close(sessionId)
    this._clearSessionState(sessionId, mapKey)
    this._clearPendingChoice(mapKey)
    this._notifyFrontend('dingtalk:sessionClosed', { sessionId })

    // 关闭后自动显示剩余会话列表
    const closeMsg = '✅ 会话已关闭'
    const sessionsList = this._cmdSessions(context)
    return `${closeMsg}\n\n${sessionsList}`
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

    const dirArg = args.join(' ').trim()
    let cwd

    if (dirArg) {
      // 绝对路径直接使用，相对名称放在 dingtalk/ 子目录下
      if (path.isAbsolute(dirArg) || /^[A-Za-z]:[/\\]/.test(dirArg)) {
        cwd = dirArg
      } else {
        cwd = path.join(this.agentSessionManager._getOutputBaseDir(), 'dingtalk', dirArg)
      }
      try {
        fs.mkdirSync(cwd, { recursive: true })
      } catch (err) {
        return `❌ 无法创建目录: ${err.message}`
      }
    }

    const sessionId = await this._createNewSession(senderStaffId, senderNick, conversationId, conversationTitle, mapKey, { cwd })

    // 发送"会话创建中"提示
    await this._replyToDingTalk(webhook, this._t('sessionCreating'))

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

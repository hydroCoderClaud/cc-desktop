/**
 * 活动会话管理器
 * 管理多个运行中的终端会话
 *
 * 设计原则：
 * - 支持多个并发终端会话
 * - 会话可以在后台运行（无可见 Tab）
 * - 与历史会话（数据库）分离，仅管理运行时状态
 */

const { v4: uuidv4 } = require('uuid')
const pty = require('node-pty')
const os = require('os')
const { buildClaudeEnvVars } = require('./utils/env-builder')

/**
 * 活动会话状态
 */
const SessionStatus = {
  STARTING: 'starting',   // 正在启动
  RUNNING: 'running',     // 运行中
  EXITED: 'exited',       // 已退出
  ERROR: 'error'          // 出错
}

/**
 * 会话类型
 */
const SessionType = {
  SESSION: 'session',     // Claude 会话
  TERMINAL: 'terminal'    // 纯终端（不启动 claude）
}

/**
 * 单个活动会话
 */
class ActiveSession {
  constructor(options) {
    this.id = options.id || uuidv4()
    this.type = options.type || SessionType.SESSION  // 会话类型：session 或 terminal
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.projectName = options.projectName || ''
    this.title = options.title || ''  // 用户自定义会话标题
    this.apiProfileId = options.apiProfileId || null  // 关联的 API Profile
    this.resumeSessionId = options.resumeSessionId || null  // Claude Code 会话 UUID（用于恢复）
    this.dbSessionId = options.dbSessionId || null  // 数据库会话 ID
    this.status = SessionStatus.STARTING
    this.pty = null
    this.pid = null
    this.createdAt = new Date()
    this.exitCode = null
    this.error = null

    // 是否有可见的 Tab（后台会话 = visible false）
    this.visible = true
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,  // 会话类型：session 或 terminal
      projectId: this.projectId,
      projectPath: this.projectPath,
      projectName: this.projectName,
      title: this.title,
      status: this.status,
      pid: this.pid,
      createdAt: this.createdAt.toISOString(),
      exitCode: this.exitCode,
      visible: this.visible,
      resumeSessionId: this.resumeSessionId,  // 用于关联历史会话
      dbSessionId: this.dbSessionId  // 数据库会话 ID
    }
  }
}

class ActiveSessionManager {
  constructor(mainWindow, configManager, options = {}) {
    this.mainWindow = mainWindow
    this.configManager = configManager
    this.sessionDatabase = options.sessionDatabase || null

    // 活动会话映射: sessionId -> ActiveSession
    this.sessions = new Map()

    // 当前聚焦的会话 ID
    this.focusedSessionId = null
  }

  /**
   * 安全地发送消息到渲染进程
   * @param {string} channel - IPC 频道
   * @param {any} data - 数据
   * @returns {boolean} 是否发送成功
   */
  _safeSend(channel, data) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents && !this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data)
        return true
      }
      console.warn(`[ActiveSession] Cannot send to ${channel}: window or webContents destroyed`)
      return false
    } catch (error) {
      console.error(`[ActiveSession] Failed to send to ${channel}:`, error)
      return false
    }
  }

  /**
   * 设置会话数据库（延迟注入）
   */
  setSessionDatabase(sessionDatabase) {
    this.sessionDatabase = sessionDatabase
  }

  /**
   * 创建新会话
   * @param {Object} options - 会话配置
   * @param {string} options.type - 会话类型：'session' 或 'terminal'
   * @param {string} options.resumeSessionId - Claude Code 会话 UUID（用于恢复历史会话）
   * @returns {ActiveSession} 创建的会话
   */
  create(options) {
    const sessionType = options.type || SessionType.SESSION
    const session = new ActiveSession({
      type: sessionType,
      projectId: options.projectId,
      projectPath: options.projectPath,
      projectName: options.projectName,
      title: options.title,  // 用户自定义标题
      apiProfileId: options.apiProfileId,
      resumeSessionId: options.resumeSessionId  // 恢复会话时传入
    })

    this.sessions.set(session.id, session)
    const typeLabel = sessionType === SessionType.TERMINAL ? 'terminal' : 'session'
    console.log(`[ActiveSession] Created ${typeLabel} ${session.id} for project: ${options.projectPath}${options.resumeSessionId ? ` (resume: ${options.resumeSessionId})` : ''}`)

    // 纯终端不需要数据库记录；如果不是恢复会话，则在数据库创建待定会话记录
    if (sessionType === SessionType.SESSION && !options.resumeSessionId && this.sessionDatabase && options.projectPath) {
      try {
        // 通过 projectPath 获取或创建数据库中的项目
        const { encodePath } = require('./utils/path-utils')
        const encodedPath = encodePath(options.projectPath)
        const dbProject = this.sessionDatabase.getOrCreateProject(
          options.projectPath,
          encodedPath,
          options.projectName || require('path').basename(options.projectPath)
        )

        // 使用数据库项目的 INTEGER id 创建待定会话
        const dbSession = this.sessionDatabase.createPendingSession(
          dbProject.id,
          options.title,
          session.id
        )
        session.dbSessionId = dbSession.id
        console.log(`[ActiveSession] Created pending DB session: ${dbSession.id} for DB project: ${dbProject.id}`)
      } catch (err) {
        console.error('[ActiveSession] Failed to create pending DB session:', err)
      }
    }

    return session
  }

  /**
   * 启动会话的终端
   * @param {string} sessionId - 会话 ID
   * @returns {Object} 启动结果
   */
  start(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (session.pty) {
      console.log(`[ActiveSession] Session ${sessionId} already started`)
      return { success: true, session: session.toJSON() }
    }

    const isWin = os.platform() === 'win32'

    // 跨平台 shell 选择：优先使用系统默认 shell
    const shell = isWin
      ? (process.env.COMSPEC || 'cmd.exe')  // Windows: 使用 COMSPEC 或 cmd.exe
      : (process.env.SHELL || '/bin/sh')    // macOS/Linux: 使用 SHELL 或 /bin/sh

    // 根据 shell 类型设置参数
    let shellArgs = []
    if (isWin && shell.toLowerCase().includes('powershell')) {
      shellArgs = ['-NoLogo', '-NoProfile']  // PowerShell 抑制启动横幅
    }

    // 获取 API Profile 并设置环境变量
    let profile = null
    if (session.apiProfileId) {
      // 使用项目关联的 API Profile
      profile = this.configManager.getAPIProfile(session.apiProfileId)
      if (profile) {
        console.log(`[ActiveSession] Using API Profile: ${profile.name}`)
      }
    }
    if (!profile) {
      // 没有指定 Profile 或 Profile 无效，尝试使用默认 Profile
      profile = this.configManager.getDefaultProfile()
      if (profile) {
        console.log(`[ActiveSession] Using default API Profile: ${profile.name}`)
      }
    }

    // 构建子进程环境变量
    // 1. 复制系统环境，但先清除认证相关变量（避免继承冲突）
    const baseEnv = { ...process.env }
    delete baseEnv.ANTHROPIC_API_KEY
    delete baseEnv.ANTHROPIC_AUTH_TOKEN

    // 2. 构建我们的环境变量
    const claudeEnvVars = buildClaudeEnvVars(profile)

    // 3. 添加全局设置中的环境变量
    const autocompactPct = this.configManager.getAutocompactPctOverride()
    if (autocompactPct !== null && autocompactPct >= 0 && autocompactPct <= 100) {
      claudeEnvVars.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = String(autocompactPct)
    }

    // 4. 合并（我们的设置覆盖基础环境）
    const envVars = { ...baseEnv, TERM: 'xterm-256color', ...claudeEnvVars }

    // 5. 清理空字符串
    for (const key of Object.keys(envVars)) {
      if (envVars[key] === '') {
        delete envVars[key]
      }
    }

    // 调试日志
    console.log(`[ActiveSession] Auth vars: API_KEY=${envVars.ANTHROPIC_API_KEY ? 'SET' : 'UNSET'}, AUTH_TOKEN=${envVars.ANTHROPIC_AUTH_TOKEN ? 'SET' : 'UNSET'}`)

    // 打印设置的环境变量（不打印敏感值）
    if (Object.keys(claudeEnvVars).length > 0) {
      console.log(`[ActiveSession] Set env vars: ${Object.keys(claudeEnvVars).join(', ')}`)
    } else {
      console.log(`[ActiveSession] No API Profile configured`)
    }

    console.log(`[ActiveSession] Starting terminal for session ${sessionId} in: ${session.projectPath}`)

    try {
      // 创建 PTY 进程
      session.pty = pty.spawn(shell, shellArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: session.projectPath,
        env: envVars
      })

      session.pid = session.pty.pid
      session.status = SessionStatus.RUNNING

      // 监听数据输出
      session.pty.onData(data => {
        // 发送到渲染进程，带上 sessionId
        this._safeSend('session:data', {
          sessionId: session.id,
          data
        })
      })

      // 监听退出
      session.pty.onExit(({ exitCode, signal }) => {
        console.log(`[ActiveSession] Session ${sessionId} exited. Code: ${exitCode}, Signal: ${signal}`)
        session.status = SessionStatus.EXITED
        session.exitCode = exitCode
        session.pty = null

        this._safeSend('session:exit', {
          sessionId: session.id,
          exitCode,
          signal
        })
      })

      // 等待终端就绪后清屏
      setTimeout(() => {
        const isWin = os.platform() === 'win32'
        const clearCmd = isWin ? 'cls' : 'clear'
        // Windows cmd.exe 用 & 分隔命令，PowerShell/Unix shell 用 ;
        const cmdSep = isWin && shell.toLowerCase().includes('cmd') ? '&' : ';'

        if (session.type === SessionType.TERMINAL) {
          // 纯终端：只清屏，不启动 claude
          this.write(sessionId, `${clearCmd}\r`)
        } else {
          // Claude 会话：清屏并启动 claude
          const claudeCmd = session.resumeSessionId
            ? `claude --resume ${session.resumeSessionId}`
            : 'claude'
          this.write(sessionId, `${clearCmd} ${cmdSep} ${claudeCmd}\r`)
        }
      }, 100)

      // 通知创建成功
      this._safeSend('session:started', {
        sessionId: session.id,
        session: session.toJSON()
      })

      return { success: true, session: session.toJSON() }
    } catch (error) {
      console.error(`[ActiveSession] Failed to start session ${sessionId}:`, error)
      session.status = SessionStatus.ERROR
      session.error = error.message

      this._safeSend('session:error', {
        sessionId: session.id,
        error: error.message
      })

      return { success: false, error: error.message }
    }
  }

  /**
   * 写入数据到会话终端
   * @param {string} sessionId - 会话 ID
   * @param {string} data - 数据
   */
  write(sessionId, data) {
    const session = this.sessions.get(sessionId)
    if (session?.pty) {
      session.pty.write(data)
    }
  }

  /**
   * 写入一行（自动添加换行符）
   * @param {string} sessionId - 会话 ID
   * @param {string} text - 文本
   */
  writeLine(sessionId, text) {
    const session = this.sessions.get(sessionId)
    if (session?.pty) {
      session.pty.write(text + '\r\n')
    }
  }

  /**
   * 调整终端大小
   * @param {string} sessionId - 会话 ID
   * @param {number} cols - 列数
   * @param {number} rows - 行数
   */
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId)
    if (session?.pty) {
      try {
        session.pty.resize(cols, rows)
      } catch (error) {
        console.error(`[ActiveSession] Resize failed for session ${sessionId}:`, error)
      }
    }
  }

  /**
   * 关闭会话
   * @param {string} sessionId - 会话 ID
   * @param {boolean} graceful - 是否优雅关闭（先发送 Ctrl+C）
   * @returns {Promise<void>}
   */
  async close(sessionId, graceful = true) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.pty) {
      if (graceful) {
        // 优雅关闭：先发送 Ctrl+C，再强制关闭
        try {
          console.log(`[ActiveSession] Gracefully closing session ${sessionId}...`)

          // 发送第一次 Ctrl+C
          session.pty.write('\x03')
          console.log(`[ActiveSession] Sent first Ctrl+C`)

          // 等待 100ms
          await this._delay(100)

          // 检查是否已退出
          if (session.status === SessionStatus.EXITED) {
            console.log(`[ActiveSession] Session ${sessionId} exited after first Ctrl+C`)
          } else {
            // 发送第二次 Ctrl+C
            session.pty.write('\x03')
            console.log(`[ActiveSession] Sent second Ctrl+C`)

            // 再等待 200ms
            await this._delay(200)

            // 如果还没退出，强制 kill
            if (session.status !== SessionStatus.EXITED && session.pty) {
              console.log(`[ActiveSession] Force killing session ${sessionId}...`)
              session.pty.kill()
            }
          }
        } catch (error) {
          console.error(`[ActiveSession] Graceful close failed for session ${sessionId}:`, error)
          // 出错时尝试强制 kill
          this._forceKill(session)
        }
      } else {
        // 直接强制关闭
        this._forceKill(session)
      }
    }

    this.sessions.delete(sessionId)
    console.log(`[ActiveSession] Session ${sessionId} closed`)

    // 如果关闭的是聚焦会话，清空聚焦
    if (this.focusedSessionId === sessionId) {
      this.focusedSessionId = null
    }
  }

  /**
   * 强制杀死会话进程
   * @param {ActiveSession} session - 会话对象
   */
  _forceKill(session) {
    try {
      if (session.pty) {
        console.log(`[ActiveSession] Force killing session ${session.id}...`)
        session.pty.kill()
      }
    } catch (error) {
      console.error(`[ActiveSession] Force kill failed:`, error)
    }
  }

  /**
   * 延迟函数
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 设置会话可见性（Tab 可见/后台运行）
   * @param {string} sessionId - 会话 ID
   * @param {boolean} visible - 是否可见
   */
  setVisible(sessionId, visible) {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.visible = visible

      // 通知渲染进程会话可见性已更新
      this._safeSend('session:updated', {
        sessionId: session.id,
        session: session.toJSON()
      })
    }
  }

  /**
   * 设置聚焦的会话
   * @param {string} sessionId - 会话 ID
   */
  focus(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.focusedSessionId = sessionId
      this.setVisible(sessionId, true)
    }
  }

  /**
   * 获取会话
   * @param {string} sessionId - 会话 ID
   * @returns {ActiveSession|null}
   */
  get(sessionId) {
    return this.sessions.get(sessionId) || null
  }

  /**
   * 获取所有会话列表
   * @param {boolean} includeHidden - 是否包含后台会话
   * @returns {Object[]}
   */
  list(includeHidden = true) {
    const result = []
    for (const session of this.sessions.values()) {
      if (includeHidden || session.visible) {
        result.push(session.toJSON())
      }
    }
    return result
  }

  /**
   * 获取指定项目的活动会话
   * @param {number} projectId - 项目 ID
   * @returns {Object[]}
   */
  getByProject(projectId) {
    const result = []
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        result.push(session.toJSON())
      }
    }
    return result
  }

  /**
   * 获取运行中的会话数量
   * @returns {number}
   */
  getRunningCount() {
    let count = 0
    for (const session of this.sessions.values()) {
      if (session.status === SessionStatus.RUNNING) {
        count++
      }
    }
    return count
  }

  /**
   * 关闭所有会话
   * @param {boolean} graceful - 是否优雅关闭（用于用户主动关闭），应用退出时用 false
   */
  async closeAll(graceful = false) {
    console.log(`[ActiveSession] Closing all sessions (graceful=${graceful})...`)
    const sessionIds = [...this.sessions.keys()]
    if (graceful) {
      // 优雅关闭：依次等待每个会话关闭
      for (const sessionId of sessionIds) {
        await this.close(sessionId, true)
      }
    } else {
      // 强制关闭：立即杀死所有进程
      for (const sessionId of sessionIds) {
        this.close(sessionId, false)  // 不等待
      }
    }
  }

  /**
   * 获取当前聚焦的会话 ID
   * @returns {string|null}
   */
  getFocusedSessionId() {
    return this.focusedSessionId
  }

  /**
   * 重命名会话
   * 同时更新内存和数据库，前端无需单独调用数据库更新接口
   * @param {string} sessionId - 会话 ID
   * @param {string} newTitle - 新标题
   * @returns {Object} 更新后的会话信息
   */
  renameSession(sessionId, newTitle) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // 1. 更新内存
    session.title = newTitle
    console.log(`[ActiveSession] Renamed session ${sessionId} to: ${newTitle}`)

    // 2. 同步更新数据库（后端统一处理，前端无需关心用哪个 ID）
    if (this.sessionDatabase) {
      try {
        if (session.resumeSessionId) {
          // 有 Claude Code UUID：通过 UUID 更新（恢复会话或已关联的新建会话）
          this.sessionDatabase.updateSessionTitleByUuid(session.resumeSessionId, newTitle)
          console.log(`[ActiveSession] DB title updated by uuid: ${session.resumeSessionId}`)
        } else if (session.dbSessionId) {
          // 只有数据库 ID：通过 ID 更新（新建会话但还未关联）
          this.sessionDatabase.updateSessionTitle(session.dbSessionId, newTitle)
          console.log(`[ActiveSession] DB title updated by dbSessionId: ${session.dbSessionId}`)
        } else {
          console.warn(`[ActiveSession] No resumeSessionId or dbSessionId, title not saved to DB`)
        }
      } catch (err) {
        console.error(`[ActiveSession] Failed to update DB title:`, err)
        // 数据库更新失败不影响内存更新，但记录错误
      }
    }

    // 3. 通知渲染进程会话已更新
    this._safeSend('session:updated', {
      sessionId: session.id,
      session: session.toJSON()
    })

    return session.toJSON()
  }

  /**
   * 关联 Claude Code 会话 UUID 到活动会话
   * 用于新建会话时，文件监控检测到 .jsonl 文件后关联
   * @param {string} sessionId - 活动会话 ID
   * @param {string} sessionUuid - Claude Code 会话 UUID
   */
  linkSessionUuid(sessionId, sessionUuid) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.warn(`[ActiveSession] Cannot link uuid: session ${sessionId} not found`)
      return null
    }

    session.resumeSessionId = sessionUuid
    console.log(`[ActiveSession] Linked session ${sessionId} to uuid: ${sessionUuid}`)

    // 通知渲染进程会话已更新
    this._safeSend('session:updated', {
      sessionId: session.id,
      session: session.toJSON()
    })

    return session.toJSON()
  }
}

module.exports = {
  ActiveSessionManager,
  ActiveSession,
  SessionStatus
}

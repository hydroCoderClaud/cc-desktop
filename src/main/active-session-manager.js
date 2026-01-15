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
 * 单个活动会话
 */
class ActiveSession {
  constructor(options) {
    this.id = options.id || uuidv4()
    this.projectId = options.projectId
    this.projectPath = options.projectPath
    this.projectName = options.projectName || ''
    this.title = options.title || ''  // 用户自定义会话标题
    this.apiProfileId = options.apiProfileId || null  // 关联的 API Profile
    this.resumeSessionId = options.resumeSessionId || null  // Claude Code 会话 UUID（用于恢复）
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
      projectId: this.projectId,
      projectPath: this.projectPath,
      projectName: this.projectName,
      title: this.title,
      status: this.status,
      pid: this.pid,
      createdAt: this.createdAt.toISOString(),
      exitCode: this.exitCode,
      visible: this.visible,
      resumeSessionId: this.resumeSessionId  // 用于关联历史会话
    }
  }
}

class ActiveSessionManager {
  constructor(mainWindow, configManager) {
    this.mainWindow = mainWindow
    this.configManager = configManager

    // 活动会话映射: sessionId -> ActiveSession
    this.sessions = new Map()

    // 当前聚焦的会话 ID
    this.focusedSessionId = null
  }

  /**
   * 创建新会话
   * @param {Object} options - 会话配置
   * @param {string} options.resumeSessionId - Claude Code 会话 UUID（用于恢复历史会话）
   * @returns {ActiveSession} 创建的会话
   */
  create(options) {
    const session = new ActiveSession({
      projectId: options.projectId,
      projectPath: options.projectPath,
      projectName: options.projectName,
      title: options.title,  // 用户自定义标题
      apiProfileId: options.apiProfileId,
      resumeSessionId: options.resumeSessionId  // 恢复会话时传入
    })

    this.sessions.set(session.id, session)
    console.log(`[ActiveSession] Created session ${session.id} for project: ${options.projectPath}${options.resumeSessionId ? ` (resume: ${options.resumeSessionId})` : ''}`)

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
    const shell = isWin ? 'powershell.exe' : 'bash'
    const shellArgs = isWin ? ['-NoLogo', '-NoProfile'] : []  // 抑制 PowerShell 启动横幅

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

    // 3. 合并（我们的设置覆盖基础环境）
    const envVars = { ...baseEnv, TERM: 'xterm-256color', ...claudeEnvVars }

    // 4. 清理空字符串
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
        this.mainWindow.webContents.send('session:data', {
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

        this.mainWindow.webContents.send('session:exit', {
          sessionId: session.id,
          exitCode,
          signal
        })
      })

      // 等待终端就绪后清屏并启动 Claude CLI
      setTimeout(() => {
        // 根据是否有 resumeSessionId 决定启动命令
        const claudeCmd = session.resumeSessionId
          ? `claude --resume ${session.resumeSessionId}`
          : 'claude'
        this.write(sessionId, `cls; ${claudeCmd}\r`)
      }, 100)

      // 通知创建成功
      this.mainWindow.webContents.send('session:started', {
        sessionId: session.id,
        session: session.toJSON()
      })

      return { success: true, session: session.toJSON() }
    } catch (error) {
      console.error(`[ActiveSession] Failed to start session ${sessionId}:`, error)
      session.status = SessionStatus.ERROR
      session.error = error.message

      this.mainWindow.webContents.send('session:error', {
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

          // 等待 500ms
          await this._delay(500)

          // 检查是否已退出
          if (session.status === SessionStatus.EXITED) {
            console.log(`[ActiveSession] Session ${sessionId} exited after first Ctrl+C`)
          } else {
            // 发送第二次 Ctrl+C
            session.pty.write('\x03')
            console.log(`[ActiveSession] Sent second Ctrl+C`)

            // 再等待 1000ms
            await this._delay(1000)

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
   * @param {string} sessionId - 会话 ID
   * @param {string} newTitle - 新标题
   * @returns {Object} 更新后的会话信息
   */
  renameSession(sessionId, newTitle) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    session.title = newTitle
    console.log(`[ActiveSession] Renamed session ${sessionId} to: ${newTitle}`)

    // 通知渲染进程会话已更新
    this.mainWindow.webContents.send('session:updated', {
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

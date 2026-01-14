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
    this.apiProfileId = options.apiProfileId || null  // 关联的 API Profile
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
      status: this.status,
      pid: this.pid,
      createdAt: this.createdAt.toISOString(),
      exitCode: this.exitCode,
      visible: this.visible
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
   * @returns {ActiveSession} 创建的会话
   */
  create(options) {
    const session = new ActiveSession({
      projectId: options.projectId,
      projectPath: options.projectPath,
      projectName: options.projectName,
      apiProfileId: options.apiProfileId
    })

    this.sessions.set(session.id, session)
    console.log(`[ActiveSession] Created session ${session.id} for project: ${options.projectPath}`)

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

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'

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

    // 设置 Claude Code CLI 环境变量
    const claudeEnvVars = buildClaudeEnvVars(profile)
    const envVars = { ...process.env, TERM: 'xterm-256color', ...claudeEnvVars }

    // 打印设置的环境变量（不打印敏感值）
    if (Object.keys(claudeEnvVars).length > 0) {
      console.log(`[ActiveSession] Set env vars: ${Object.keys(claudeEnvVars).join(', ')}`)
    } else {
      console.log(`[ActiveSession] No API Profile configured`)
    }

    console.log(`[ActiveSession] Starting terminal for session ${sessionId} in: ${session.projectPath}`)

    try {
      // 创建 PTY 进程
      session.pty = pty.spawn(shell, [], {
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

      // 发送欢迎消息
      setTimeout(() => {
        this.writeLine(sessionId, '')
        this.writeLine(sessionId, '# Claude Code Desktop Terminal')
        this.writeLine(sessionId, `# Project: ${session.projectName || session.projectPath}`)
        this.writeLine(sessionId, `# Working Directory: ${session.projectPath}`)
        this.writeLine(sessionId, '')

        // 打印环境变量设置情况
        this.writeLine(sessionId, '# Environment Variables:')
        if (Object.keys(claudeEnvVars).length > 0) {
          for (const [key, value] of Object.entries(claudeEnvVars)) {
            // 敏感信息只显示前4位
            if (key.includes('KEY') || key.includes('TOKEN')) {
              const masked = value.substring(0, 4) + '****'
              this.writeLine(sessionId, `#   ${key}=${masked}`)
            } else {
              this.writeLine(sessionId, `#   ${key}=${value}`)
            }
          }
        } else {
          this.writeLine(sessionId, '#   (none)')
        }

        this.writeLine(sessionId, '')
        this.writeLine(sessionId, '# Starting Claude Code CLI...')
        this.writeLine(sessionId, '')

        // 自动启动 Claude Code CLI
        setTimeout(() => {
          this.write(sessionId, 'claude\r')
        }, 200)
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
   * @param {boolean} force - 是否强制关闭（杀死进程）
   */
  close(sessionId, force = true) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.pty && force) {
      try {
        console.log(`[ActiveSession] Killing session ${sessionId}...`)
        session.pty.kill()
      } catch (error) {
        console.error(`[ActiveSession] Kill failed for session ${sessionId}:`, error)
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
   */
  closeAll() {
    console.log(`[ActiveSession] Closing all sessions...`)
    for (const sessionId of this.sessions.keys()) {
      this.close(sessionId, true)
    }
  }

  /**
   * 获取当前聚焦的会话 ID
   * @returns {string|null}
   */
  getFocusedSessionId() {
    return this.focusedSessionId
  }
}

module.exports = {
  ActiveSessionManager,
  ActiveSession,
  SessionStatus
}

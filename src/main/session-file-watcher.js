/**
 * Session File Watcher
 * 监控 ~/.claude/projects/{encodedPath}/ 目录的文件变化
 * 当检测到新的 .jsonl 会话文件时：
 * 1. 解析文件获取 session uuid
 * 2. 关联到数据库中的待定会话
 * 3. 通知前端刷新
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')
const { encodePath } = require('./utils/path-utils')

class SessionFileWatcher {
  constructor(mainWindow, options = {}) {
    this.mainWindow = mainWindow
    this.sessionDatabase = options.sessionDatabase || null
    this.activeSessionManager = options.activeSessionManager || null

    this.watcher = null
    this.currentProjectPath = null
    this.currentProjectId = null
    this.debounceTimer = null
    this.debounceDelay = 1000  // 1秒防抖

    // 已知的文件列表（用于检测新文件）
    this.knownFiles = new Set()
  }

  /**
   * 设置依赖（用于延迟注入）
   */
  setDependencies({ sessionDatabase, activeSessionManager }) {
    this.sessionDatabase = sessionDatabase
    this.activeSessionManager = activeSessionManager
  }

  /**
   * 获取项目对应的 Claude 会话目录
   */
  getSessionDir(projectPath) {
    const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
    const encoded = encodePath(projectPath)
    return path.join(claudeProjectsDir, encoded)
  }

  /**
   * 开始监控指定项目的会话目录
   * @param {string} projectPath - 项目路径
   * @param {number} projectId - 项目 ID（数据库）
   */
  watch(projectPath, projectId = null) {
    console.log('[FileWatcher] watch() called with projectPath:', projectPath, 'projectId:', projectId)

    // 如果已经在监控同一个项目，不需要重新启动
    if (this.currentProjectPath === projectPath && this.watcher) {
      console.log('[FileWatcher] Already watching this project, skipping')
      return
    }

    // 停止之前的监控
    this.stop()

    this.currentProjectPath = projectPath
    this.currentProjectId = projectId
    const sessionDir = this.getSessionDir(projectPath)
    console.log('[FileWatcher] Session directory:', sessionDir)

    // 检查目录是否存在
    if (!fs.existsSync(sessionDir)) {
      console.log('[FileWatcher] Session directory does not exist:', sessionDir)
      // 目录不存在时，监控父目录等待它被创建
      this.watchForDirCreation(sessionDir)
      return
    }

    // 初始化已知文件列表
    this.initKnownFiles(sessionDir)

    this.startWatching(sessionDir)
  }

  /**
   * 初始化已知文件列表
   */
  initKnownFiles(sessionDir) {
    this.knownFiles.clear()
    try {
      const files = fs.readdirSync(sessionDir)
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          this.knownFiles.add(file)
        }
      }
      console.log('[FileWatcher] Known files:', this.knownFiles.size)
    } catch (err) {
      console.error('[FileWatcher] Failed to read session directory:', err)
    }
  }

  /**
   * 监控目录创建
   */
  watchForDirCreation(sessionDir) {
    const parentDir = path.dirname(sessionDir)

    if (!fs.existsSync(parentDir)) {
      console.log('[FileWatcher] Parent directory does not exist:', parentDir)
      return
    }

    console.log('[FileWatcher] Watching for directory creation:', sessionDir)

    try {
      this.watcher = fs.watch(parentDir, (eventType, filename) => {
        const targetDirName = path.basename(sessionDir)
        if (filename === targetDirName && fs.existsSync(sessionDir)) {
          console.log('[FileWatcher] Session directory created, switching to watch it')
          this.stop()
          this.initKnownFiles(sessionDir)
          this.startWatching(sessionDir)
        }
      })
    } catch (err) {
      console.error('[FileWatcher] Failed to watch parent directory:', err)
    }
  }

  /**
   * 开始监控会话目录
   */
  startWatching(sessionDir) {
    console.log('[FileWatcher] Starting to watch:', sessionDir)

    try {
      this.watcher = fs.watch(sessionDir, async (eventType, filename) => {
        // 只关注 .jsonl 文件
        if (filename && filename.endsWith('.jsonl')) {
          const isNewFile = !this.knownFiles.has(filename)
          const filePath = path.join(sessionDir, filename)

          if (isNewFile) {
            console.log('[FileWatcher] New session file detected:', filename)
            this.knownFiles.add(filename)
          }

          // 无论新文件还是更新，都尝试处理
          // handleNewSessionFile 内部会检查：warmup/空内容会跳过，已存在会跳过
          // 这样当用户输入第一条消息后，文件更新会触发关联
          await this.handleNewSessionFile(filePath, filename)

          this.notifyChange()
        }
      })

      this.watcher.on('error', (err) => {
        console.error('[FileWatcher] Watch error:', err)
      })

      console.log('[FileWatcher] Watcher started successfully')
    } catch (err) {
      console.error('[FileWatcher] Failed to start watching:', err)
    }
  }

  /**
   * 规范化路径用于比较（统一斜杠方向和大小写）
   */
  normalizePath(p) {
    if (!p) return ''
    // Windows 上统一使用小写并将反斜杠转为正斜杠
    return p.toLowerCase().replace(/\\/g, '/')
  }

  /**
   * 处理新会话文件
   * @param {string} filePath - 文件完整路径
   * @param {string} filename - 文件名
   */
  async handleNewSessionFile(filePath, filename) {
    if (!this.sessionDatabase || !this.activeSessionManager) {
      console.log('[FileWatcher] Dependencies not set, skipping file processing')
      return
    }

    try {
      // 等待文件写入完成
      await this.waitForFileStable(filePath)

      // 解析会话文件
      const sessionInfo = await this.parseSessionFile(filePath)
      if (!sessionInfo) {
        console.log('[FileWatcher] Failed to parse session file:', filename)
        return
      }

      console.log('[FileWatcher] Parsed session info:', sessionInfo.sessionId, 'firstMessage:', sessionInfo.firstUserMessage?.slice(0, 50), 'messageCount:', sessionInfo.messageCount)

      // 过滤 warmup 和空内容会话 - 只有有实际用户消息时才关联
      const isWarmup = sessionInfo.firstUserMessage?.toLowerCase().includes('warmup')
      const hasNoValidContent = !sessionInfo.firstUserMessage || sessionInfo.messageCount <= 1

      if (isWarmup) {
        console.log('[FileWatcher] Skipping warmup session:', filename)
        return
      }

      if (hasNoValidContent) {
        console.log('[FileWatcher] Skipping empty session (no user message yet):', filename)
        return
      }

      // 检查这个 uuid 是否已存在于数据库
      const existingSession = this.sessionDatabase.getSessionByUuid(sessionInfo.sessionId)
      if (existingSession) {
        console.log('[FileWatcher] Session already exists in DB:', sessionInfo.sessionId)
        return
      }

      // 通过 projectPath 获取数据库项目 ID
      const dbProject = this.sessionDatabase.getProjectByPath(this.currentProjectPath)
      if (!dbProject) {
        console.log('[FileWatcher] DB project not found for path:', this.currentProjectPath)
        return
      }
      console.log('[FileWatcher] DB project id:', dbProject.id)

      // 简化逻辑：查找当前项目最近创建的待定会话（没有 uuid 的）
      const pendingSession = this.sessionDatabase.getLatestPendingSession(dbProject.id)

      if (pendingSession) {
        console.log('[FileWatcher] Found pending session:', pendingSession.id, 'active_session_id:', pendingSession.active_session_id)

        // 更新待定会话，填充 uuid
        this.sessionDatabase.fillPendingSession(pendingSession.id, {
          sessionUuid: sessionInfo.sessionId,
          firstUserMessage: sessionInfo.firstUserMessage,
          messageCount: sessionInfo.messageCount,
          model: sessionInfo.model
        })

        console.log('[FileWatcher] Filled pending session with uuid:', sessionInfo.sessionId)

        // 同时更新对应的 ActiveSession 的 resumeSessionId
        if (pendingSession.active_session_id) {
          this.activeSessionManager.linkSessionUuid(
            pendingSession.active_session_id,
            sessionInfo.sessionId
          )
        }
      } else {
        console.log('[FileWatcher] No pending session found, this might be an external session')
        // 没有待定会话，可能是外部创建的会话，不处理
        // 让 syncProjectSessions 在下次同步时处理
      }
    } catch (err) {
      console.error('[FileWatcher] Error handling new session file:', err)
    }
  }

  /**
   * 等待文件稳定（写入完成）
   */
  async waitForFileStable(filePath, maxWait = 3000) {
    const startTime = Date.now()
    let lastSize = 0

    while (Date.now() - startTime < maxWait) {
      try {
        const stats = fs.statSync(filePath)
        if (stats.size === lastSize && stats.size > 0) {
          // 文件大小稳定
          return true
        }
        lastSize = stats.size
      } catch (err) {
        // 文件可能还在创建
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    return true
  }

  /**
   * 解析会话文件
   */
  async parseSessionFile(filePath) {
    return new Promise((resolve) => {
      try {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
        const rl = readline.createInterface({ input: stream })

        let sessionId = null
        let firstUserMessage = null
        let messageCount = 0
        let startTime = null
        let model = null

        rl.on('line', (line) => {
          try {
            const entry = JSON.parse(line)

            // 获取 session id
            if (entry.sessionId && !sessionId) {
              sessionId = entry.sessionId
            }

            // 获取第一条用户消息
            if (entry.type === 'user' && entry.message?.content && !firstUserMessage) {
              firstUserMessage = entry.message.content
            }

            // 获取模型
            if (entry.message?.model && !model) {
              model = entry.message.model
            }

            // 获取开始时间
            if (entry.timestamp && !startTime) {
              startTime = entry.timestamp
            }

            messageCount++
          } catch (e) {
            // 跳过解析失败的行
          }
        })

        rl.on('close', () => {
          if (sessionId) {
            resolve({
              sessionId,
              firstUserMessage,
              messageCount,
              startTime,
              model
            })
          } else {
            resolve(null)
          }
        })

        rl.on('error', () => {
          resolve(null)
        })
      } catch (err) {
        resolve(null)
      }
    })
  }

  /**
   * 通知前端文件变化（带防抖）
   */
  notifyChange() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      console.log('[FileWatcher] Notifying frontend of session file change')
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('session:fileChanged', {
          projectPath: this.currentProjectPath,
          projectId: this.currentProjectId
        })
      }
    }, this.debounceDelay)
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      console.log('[FileWatcher] Stopped watching')
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.currentProjectPath = null
    this.currentProjectId = null
    this.knownFiles.clear()
  }

  /**
   * 切换监控的项目
   */
  switchProject(projectPath, projectId = null) {
    if (projectPath) {
      this.watch(projectPath, projectId)
    } else {
      this.stop()
    }
  }
}

module.exports = { SessionFileWatcher }

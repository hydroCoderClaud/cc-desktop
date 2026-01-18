/**
 * Session File Watcher
 * 监控 ~/.claude/projects/{encodedPath}/ 目录的文件变化
 * 当检测到新的 .jsonl 会话文件时通知前端刷新
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { encodePath } = require('./utils/path-utils')

class SessionFileWatcher {
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.watcher = null
    this.currentProjectPath = null
    this.debounceTimer = null
    this.debounceDelay = 1000  // 1秒防抖
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
   */
  watch(projectPath) {
    console.log('[FileWatcher] watch() called with projectPath:', projectPath)

    // 如果已经在监控同一个项目，不需要重新启动
    if (this.currentProjectPath === projectPath && this.watcher) {
      console.log('[FileWatcher] Already watching this project, skipping')
      return
    }

    // 停止之前的监控
    this.stop()

    this.currentProjectPath = projectPath
    const sessionDir = this.getSessionDir(projectPath)
    console.log('[FileWatcher] Session directory:', sessionDir)

    // 检查目录是否存在
    if (!fs.existsSync(sessionDir)) {
      console.log('[FileWatcher] Session directory does not exist:', sessionDir)
      // 目录不存在时，监控父目录等待它被创建
      this.watchForDirCreation(sessionDir)
      return
    }

    this.startWatching(sessionDir)
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
      this.watcher = fs.watch(sessionDir, (eventType, filename) => {
        console.log('[FileWatcher] fs.watch event:', eventType, filename)
        // 只关注 .jsonl 文件
        if (filename && filename.endsWith('.jsonl')) {
          console.log('[FileWatcher] Session file changed:', eventType, filename)
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
          projectPath: this.currentProjectPath
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
  }

  /**
   * 切换监控的项目
   */
  switchProject(projectPath) {
    if (projectPath) {
      this.watch(projectPath)
    } else {
      this.stop()
    }
  }
}

module.exports = { SessionFileWatcher }

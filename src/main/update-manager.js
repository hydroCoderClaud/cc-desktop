/**
 * 应用自动更新管理器
 * 基于 electron-updater，支持从 GitHub Releases 自动检查和下载更新
 */

const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.updateCheckTimer = null
    this.setupAutoUpdater()
    this.setupEventListeners()
  }

  /**
   * 配置 autoUpdater
   */
  setupAutoUpdater() {
    // 使用 electron-log 记录更新日志
    autoUpdater.logger = log
    autoUpdater.logger.transports.file.level = 'info'

    // 不自动下载（让用户决定是否下载）
    autoUpdater.autoDownload = false

    // 应用退出时自动安装（如果已下载）
    autoUpdater.autoInstallOnAppQuit = true

    log.info('[UpdateManager] Initialized')
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 检查更新中
    autoUpdater.on('checking-for-update', () => {
      log.info('[UpdateManager] Checking for updates...')
      this.sendToRenderer('update-checking')
    })

    // 发现新版本
    autoUpdater.on('update-available', (info) => {
      log.info('[UpdateManager] Update available:', info.version)
      this.sendToRenderer('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: this.formatReleaseNotes(info.releaseNotes),
        files: info.files
      })
    })

    // 当前已是最新版本
    autoUpdater.on('update-not-available', (info) => {
      log.info('[UpdateManager] Update not available, current version:', info.version)
      this.sendToRenderer('update-not-available', {
        version: info.version
      })
    })

    // 下载进度
    autoUpdater.on('download-progress', (progressObj) => {
      log.info('[UpdateManager] Download progress:', Math.round(progressObj.percent) + '%')
      this.sendToRenderer('update-download-progress', {
        percent: Math.round(progressObj.percent),
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond
      })
    })

    // 下载完成
    autoUpdater.on('update-downloaded', (info) => {
      log.info('[UpdateManager] Update downloaded:', info.version)
      this.sendToRenderer('update-downloaded', {
        version: info.version
      })
    })

    // 错误处理
    autoUpdater.on('error', (error) => {
      log.error('[UpdateManager] Error:', error)
      this.sendToRenderer('update-error', {
        message: error.message || String(error)
      })
    })
  }

  /**
   * 格式化更新日志（从 GitHub Release Notes）
   */
  formatReleaseNotes(notes) {
    if (!notes) return ''
    // 支持 String 或 Array 格式
    if (Array.isArray(notes)) {
      return notes.map(item => item.note).join('\n\n')
    }
    return String(notes)
  }

  /**
   * 向渲染进程发送消息
   */
  sendToRenderer(channel, data = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * 检查更新
   * @param {boolean} silent - 静默检查（不显示"已是最新版本"提示）
   */
  async checkForUpdates(silent = false) {
    try {
      log.info('[UpdateManager] Manual check for updates, silent:', silent)
      const result = await autoUpdater.checkForUpdates()

      // 如果是手动检查且没有更新，发送提示
      if (!silent && result && !result.updateInfo) {
        this.sendToRenderer('update-not-available-manual')
      }

      return result
    } catch (error) {
      log.error('[UpdateManager] Check for updates failed:', error)
      this.sendToRenderer('update-error', {
        message: error.message || String(error)
      })
      throw error
    }
  }

  /**
   * 开始下载更新
   */
  async downloadUpdate() {
    try {
      log.info('[UpdateManager] Start downloading update...')
      return await autoUpdater.downloadUpdate()
    } catch (error) {
      log.error('[UpdateManager] Download update failed:', error)
      this.sendToRenderer('update-error', {
        message: error.message || String(error)
      })
      throw error
    }
  }

  /**
   * 退出并安装更新
   * @param {boolean} isSilent - 静默安装（不弹窗）
   * @param {boolean} isForceRunAfter - 安装后强制启动
   */
  quitAndInstall(isSilent = false, isForceRunAfter = true) {
    log.info('[UpdateManager] Quit and install update')
    autoUpdater.quitAndInstall(isSilent, isForceRunAfter)
  }

  /**
   * 启动时自动检查更新（延迟执行，避免影响启动性能）
   * @param {number} delay - 延迟时间（毫秒），默认 5000ms
   */
  scheduleUpdateCheck(delay = 5000) {
    log.info(`[UpdateManager] Schedule update check in ${delay}ms`)
    setTimeout(() => {
      this.checkForUpdates(true)
    }, delay)
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.updateCheckTimer) {
      clearTimeout(this.updateCheckTimer)
      this.updateCheckTimer = null
    }
    log.info('[UpdateManager] Cleanup')
  }
}

module.exports = UpdateManager

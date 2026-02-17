/**
 * 应用自动更新管理器
 * 基于 electron-updater，支持从 GitHub Releases 自动检查和下载更新
 */

const { app, BrowserWindow } = require('electron')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const path = require('path')
const os = require('os')
const fs = require('fs')

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.updateCheckTimer = null
    this.hasUpdateAvailable = false  // 是否有可用更新
    this.latestUpdateInfo = null     // 最新更新信息
    this.isDownloaded = false        // 是否已下载完成
    this.downloadedVersion = null    // 已下载的版本号
    this.setupAutoUpdater()
    this.setupEventListeners()
  }

  /**
   * 配置 autoUpdater
   */
  setupAutoUpdater() {
    autoUpdater.logger = log
    autoUpdater.logger.transports.file.level = 'info'
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    log.info('[UpdateManager] Initialized')
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    autoUpdater.on('checking-for-update', () => {
      log.info('[UpdateManager] Checking for updates...')
      this.sendToRenderer('update-checking')
    })

    autoUpdater.on('update-available', (info) => {
      log.info('[UpdateManager] Update available:', info.version)

      // 以磁盘文件为准恢复跨会话的下载状态（重启后内存状态丢失）
      if (this._checkDownloadedOnDisk(info.version)) {
        this.isDownloaded = true
        this.downloadedVersion = info.version
        log.info('[UpdateManager] Found existing download on disk for', info.version)
      } else if (this.downloadedVersion !== info.version) {
        // 磁盘无该版本文件，重置
        this.isDownloaded = false
        this.downloadedVersion = null
      }

      this.hasUpdateAvailable = true
      this.latestUpdateInfo = {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: this.formatReleaseNotes(info.releaseNotes),
        files: info.files
      }

      this.sendToRenderer('update-available', {
        ...this.latestUpdateInfo,
        isDownloaded: this.isDownloaded
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      log.info('[UpdateManager] Already up to date:', info.version)
      this.sendToRenderer('update-not-available', { version: info.version })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.round(progressObj.percent)
      log.info('[UpdateManager] Download progress:', percent + '%',
        `(${(progressObj.transferred / 1024 / 1024).toFixed(2)}MB / ${(progressObj.total / 1024 / 1024).toFixed(2)}MB)`)
      this.sendToRenderer('update-download-progress', {
        percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      log.info('[UpdateManager] Update downloaded:', info.version)
      this.isDownloaded = true
      this.downloadedVersion = info.version
      this.sendToRenderer('update-downloaded', { version: info.version })
    })

    autoUpdater.on('error', (error) => {
      log.error('[UpdateManager] Error:', error)
      this.sendToRenderer('update-error', {
        message: error.message || String(error)
      })
    })
  }

  /**
   * 格式化更新日志（将 GitHub Release Notes HTML 转为纯文本）
   */
  formatReleaseNotes(notes) {
    if (!notes) return ''
    const text = Array.isArray(notes)
      ? notes.map(item => item.note).join('\n\n')
      : String(notes)
    return this.htmlToText(text)
  }

  /**
   * 将 HTML 转换为纯文本（支持多行标签）
   */
  htmlToText(html) {
    if (!html) return ''

    return html
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n$1\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '  - $1\n')
      .replace(/<(?:ol|ul)[^>]*>([\s\S]*?)<\/(?:ol|ul)>/gi, '$1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n$1\n')
      .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '$1')
      .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '$1')
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  /**
   * 向所有窗口广播消息
   */
  sendToRenderer(channel, data = {}) {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        try {
          win.webContents.send(channel, data)
        } catch (err) {
          log.error(`[UpdateManager] Failed to send "${channel}":`, err.message)
        }
      }
    })
  }

  /**
   * 检查更新
   * @param {boolean} silent - 静默检查（启动时后台检查）
   */
  async checkForUpdates(silent = false) {
    try {
      log.info('[UpdateManager] Check for updates, silent:', silent)
      return await autoUpdater.checkForUpdates()
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
   */
  quitAndInstall(isSilent = false, isForceRunAfter = true) {
    if (!this.isDownloaded) {
      log.error('[UpdateManager] Cannot install: update has not been downloaded')
      return
    }

    log.info('[UpdateManager] Quit and install called')

    if (process.platform === 'darwin') {
      // macOS：无代码签名时 autoUpdater.quitAndInstall 不可用，使用手动安装
      log.info('[UpdateManager] Using manual install on macOS')
      this.macOSManualInstall()
      return
    }

    // Windows / Linux：使用标准 autoUpdater
    try {
      autoUpdater.quitAndInstall(isSilent, isForceRunAfter)
    } catch (error) {
      log.error('[UpdateManager] quitAndInstall failed:', error)
      this.sendToRenderer('update-error', {
        message: error.message || String(error)
      })
    }
  }

  /**
   * 检查磁盘缓存目录是否已有指定版本的安装文件
   * 用于 app 重启后恢复跨会话的下载状态
   */
  _checkDownloadedOnDisk(version) {
    try {
      let cacheDir
      if (process.platform === 'darwin') {
        cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'cc-desktop-updater', 'pending')
      } else if (process.platform === 'win32') {
        cacheDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'cc-desktop-updater', 'pending')
      } else {
        cacheDir = path.join(os.homedir(), '.cache', 'cc-desktop-updater', 'pending')
      }

      if (!fs.existsSync(cacheDir)) return false

      const files = fs.readdirSync(cacheDir)
      return files.some(f => f.includes(version))
    } catch (err) {
      log.warn('[UpdateManager] _checkDownloadedOnDisk failed:', err.message)
      return false
    }
  }

  /**
   * macOS 手动安装（跳过签名检查，仅在 macOS 上调用）
   */
  macOSManualInstall() {
    const { spawn } = require('child_process')

    const version = this.downloadedVersion

    try {
      const cacheDir = path.join(os.homedir(), 'Library/Caches/cc-desktop-updater/pending')
      const scriptPath = path.join(os.tmpdir(), 'cc-desktop-install.sh')

      const installScript = `#!/bin/bash
echo "[Install] Starting installation for version ${version}..."
cd "${cacheDir}"

# 精确匹配版本号，避免误装旧版本
ZIP_FILE=$(ls *${version}*.zip 2>/dev/null | head -1)
if [ -z "$ZIP_FILE" ]; then
  echo "[Install] Error: No zip found for version ${version} in ${cacheDir}"
  exit 1
fi

echo "[Install] Found: $ZIP_FILE"
echo "[Install] Waiting for app to quit..."
sleep 2

echo "[Install] Extracting..."
unzip -o "$ZIP_FILE" > /dev/null 2>&1

APP_FILE=$(ls -d *.app 2>/dev/null | head -1)
if [ -z "$APP_FILE" ]; then
  echo "[Install] Error: No .app found after extraction"
  exit 1
fi

echo "[Install] Installing to /Applications: $APP_FILE"
rm -rf "/Applications/$APP_FILE"
cp -R "$APP_FILE" /Applications/

echo "[Install] Cleaning up cache..."
rm -f *.zip

echo "[Install] Launching new version..."
nohup open "/Applications/$APP_FILE" > /dev/null 2>&1 &

echo "[Install] Installation complete!"
exit 0
`

      fs.writeFileSync(scriptPath, installScript, { mode: 0o755 })
      log.info('[UpdateManager] Install script created:', scriptPath)

      const child = spawn('/bin/bash', [scriptPath], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()

      log.info('[UpdateManager] Install script launched (PID:', child.pid, ')')

      setTimeout(() => {
        log.info('[UpdateManager] Quitting app...')
        app.quit()
      }, 1000)

    } catch (error) {
      log.error('[UpdateManager] macOSManualInstall failed:', error)
      this.sendToRenderer('update-error', {
        message: error.message || String(error)
      })
    }
  }

  /**
   * 启动时延迟自动检查更新
   * @param {number} delay - 延迟毫秒数，默认 5000
   */
  scheduleUpdateCheck(delay = 5000) {
    log.info(`[UpdateManager] Scheduled update check in ${delay}ms`)
    setTimeout(() => {
      this.checkForUpdates(true)
    }, delay)
  }

  /**
   * 获取当前更新状态
   */
  getUpdateStatus() {
    return {
      hasUpdate: this.hasUpdateAvailable,
      updateInfo: this.latestUpdateInfo,
      isDownloaded: this.isDownloaded,
      downloadedVersion: this.downloadedVersion
    }
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

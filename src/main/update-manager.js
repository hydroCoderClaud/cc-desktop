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
    this.downloadedFilePath = null   // 已下载的文件路径（来自 update-downloaded 事件）
    this.isDownloading = false       // 是否正在下载（防重入）
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

      // 从持久化状态恢复跨重启的下载状态，并验证文件仍在磁盘
      const persisted = this._loadPersistedState()
      if (persisted && persisted.version === info.version &&
          persisted.downloadedFile && fs.existsSync(persisted.downloadedFile)) {
        this.isDownloaded = true
        this.downloadedVersion = info.version
        this.downloadedFilePath = persisted.downloadedFile
        log.info('[UpdateManager] Found existing download:', this.downloadedFilePath)
      } else if (this.downloadedVersion !== info.version) {
        // 版本不同或文件已消失，重置状态并清除旧的持久化记录
        this.isDownloaded = false
        this.downloadedVersion = null
        this.downloadedFilePath = null
        this._clearPersistedState()
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
      log.info('[UpdateManager] Update downloaded:', info.version, info.downloadedFile)
      this.isDownloading = false
      this.isDownloaded = true
      this.downloadedVersion = info.version
      this.downloadedFilePath = info.downloadedFile || null
      // 持久化状态，重启后可恢复
      this._persistState(info.version, info.downloadedFile)
      this.sendToRenderer('update-downloaded', { version: info.version })
    })

    autoUpdater.on('error', (error) => {
      log.error('[UpdateManager] Error:', error)
      this.isDownloading = false
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
    // 手动检查时取消待执行的自动检查，避免重复触发
    if (!silent && this.updateCheckTimer) {
      clearTimeout(this.updateCheckTimer)
      this.updateCheckTimer = null
      log.info('[UpdateManager] Cancelled pending auto-check (manual check triggered)')
    }

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
   * 开始下载更新（带防重入保护）
   */
  async downloadUpdate() {
    if (this.isDownloading) {
      log.warn('[UpdateManager] Download already in progress, ignoring duplicate call')
      return
    }
    this.isDownloading = true
    try {
      log.info('[UpdateManager] Start downloading update...')
      return await autoUpdater.downloadUpdate()
    } catch (error) {
      this.isDownloading = false
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
   * 持久化下载状态到 userData/update-state.json
   * 使用 userData 目录确保路径准确，无需猜测 electron-updater 缓存路径
   */
  _persistState(version, downloadedFile) {
    try {
      const statePath = path.join(app.getPath('userData'), 'update-state.json')
      fs.writeFileSync(statePath, JSON.stringify({ version, downloadedFile }), 'utf8')
    } catch (err) {
      log.warn('[UpdateManager] Failed to persist state:', err.message)
    }
  }

  /**
   * 读取持久化的下载状态
   */
  _loadPersistedState() {
    try {
      const statePath = path.join(app.getPath('userData'), 'update-state.json')
      if (!fs.existsSync(statePath)) return null
      return JSON.parse(fs.readFileSync(statePath, 'utf8'))
    } catch (err) {
      log.warn('[UpdateManager] Failed to load persisted state:', err.message)
      return null
    }
  }

  /**
   * 清除持久化状态（安装后或检测到更新版本时）
   */
  _clearPersistedState() {
    try {
      const statePath = path.join(app.getPath('userData'), 'update-state.json')
      if (fs.existsSync(statePath)) fs.unlinkSync(statePath)
    } catch (err) {
      log.warn('[UpdateManager] Failed to clear persisted state:', err.message)
    }
  }

  /**
   * macOS 手动安装（跳过签名检查，仅在 macOS 上调用）
   * - 版本号经过格式校验，防止 shell 注入
   * - ZIP 文件路径通过环境变量传入脚本，不做字符串插值
   */
  macOSManualInstall() {
    const { spawn } = require('child_process')

    const version = this.downloadedVersion
    const zipFile = this.downloadedFilePath

    // 校验版本号格式（仅允许 x.y.z），防止注入攻击
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
      log.error('[UpdateManager] Invalid version format:', version)
      this.sendToRenderer('update-error', { message: `Invalid version format: ${version}` })
      return
    }

    // 确认下载文件存在（重启后如果文件被外部删除则提示重新下载）
    if (!zipFile || !fs.existsSync(zipFile)) {
      log.error('[UpdateManager] Downloaded file not found:', zipFile)
      this._clearPersistedState()
      this.isDownloaded = false
      this.downloadedFilePath = null
      this.sendToRenderer('update-error', { message: 'Downloaded file not found, please download again' })
      return
    }

    try {
      const scriptPath = path.join(os.tmpdir(), 'cc-desktop-install.sh')

      // ZIP 路径通过环境变量 CC_DESKTOP_ZIP_FILE 传入，避免路径中特殊字符导致的 shell 注入
      const installScript = `#!/bin/bash
set -e
ZIP_FILE="$CC_DESKTOP_ZIP_FILE"
if [ ! -f "$ZIP_FILE" ]; then
  echo "[Install] Error: File not found: $ZIP_FILE"
  exit 1
fi

echo "[Install] Waiting for app to quit..."
sleep 2

EXTRACT_DIR=$(mktemp -d)
echo "[Install] Extracting to $EXTRACT_DIR..."
unzip -o "$ZIP_FILE" -d "$EXTRACT_DIR" > /dev/null 2>&1

APP_FILE=$(ls -d "$EXTRACT_DIR"/*.app 2>/dev/null | head -1)
if [ -z "$APP_FILE" ]; then
  echo "[Install] Error: No .app found after extraction"
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

APP_NAME=$(basename "$APP_FILE")
echo "[Install] Installing to /Applications: $APP_NAME"
rm -rf "/Applications/$APP_NAME"
cp -R "$APP_FILE" /Applications/

echo "[Install] Cleaning up..."
rm -rf "$EXTRACT_DIR"
rm -f "$ZIP_FILE"

echo "[Install] Launching new version..."
nohup open "/Applications/$APP_NAME" > /dev/null 2>&1 &

echo "[Install] Installation complete!"
exit 0
`

      fs.writeFileSync(scriptPath, installScript, { mode: 0o755 })
      log.info('[UpdateManager] Install script created:', scriptPath)

      const child = spawn('/bin/bash', [scriptPath], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, CC_DESKTOP_ZIP_FILE: zipFile }
      })
      child.unref()

      log.info('[UpdateManager] Install script launched (PID:', child.pid, ')')

      // 安装脚本已启动，清除持久化状态
      this._clearPersistedState()

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
    this.updateCheckTimer = setTimeout(() => {
      this.updateCheckTimer = null
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

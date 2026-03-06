/**
 * 应用自动更新管理器
 * 基于 electron-updater，支持主源 + 镜像双源 fallback
 */

const { app, BrowserWindow } = require('electron')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const path = require('path')
const os = require('os')
const fs = require('fs')

class UpdateManager {
  constructor(mainWindow, configManager) {
    this.mainWindow = mainWindow
    this.configManager = configManager
    this.updateCheckTimer = null
    this.hasUpdateAvailable = false  // 是否有可用更新
    this.latestUpdateInfo = null     // 最新更新信息
    this.isDownloaded = false        // 是否已下载完成
    this.downloadedVersion = null    // 已下载的版本号
    this.downloadedFilePath = null   // 已下载的文件路径（来自 update-downloaded 事件）
    this.isDownloading = false       // 是否正在下载（防重入）
    this._isChecking = false         // 是否正在检查（防重入）
    this._usingMirror = false        // 当前是否使用镜像源
    this._isFallingBack = false       // 是否正在 fallback（抑制 error 事件通知 UI）
    this._pendingInstallError = null  // macOS 上次安装失败信息（供 UpdateManagerContent 读取）
    this.setupAutoUpdater()
    this.setupEventListeners()
    this._checkPreviousInstallResult()
  }

  /**
   * 配置 autoUpdater
   */
  setupAutoUpdater() {
    autoUpdater.logger = log
    autoUpdater.logger.transports.file.level = 'info'
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.disableWebInstaller = true

    // 主源使用 GitHub provider（支持差分更新的 Range 请求）
    this._applyPrimaryFeed()

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

      // 检查持久化状态，判断是否有已下载的文件
      const persisted = this._loadPersistedState()
      const hasPersistedDownload = persisted && persisted.version === info.version &&
          persisted.downloadedFile && fs.existsSync(persisted.downloadedFile)

      if (!hasPersistedDownload && this.downloadedVersion !== info.version) {
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

      // 先通知 UI 有更新可用（此时 isDownloaded 尚未恢复）
      this.sendToRenderer('update-available', {
        ...this.latestUpdateInfo,
        isDownloaded: this.isDownloaded
      })

      // 有持久化的下载文件时，静默调用 downloadUpdate() 让 electron-updater 内部状态同步
      // 文件已存在时会秒完成，触发 update-downloaded 事件后 UI 自动切换到"退出并安装"
      if (hasPersistedDownload && !this.isDownloaded) {
        log.info('[UpdateManager] Found persisted download, triggering silent re-download to sync state:', persisted.downloadedFile)
        autoUpdater.downloadUpdate().catch(err => {
          log.warn('[UpdateManager] Silent re-download failed:', err.message)
          this._clearPersistedState()
        })
      }
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
      // fallback 期间不通知 UI，避免闪现错误后又显示更新可用
      if (!this._isFallingBack) {
        this.sendToRenderer('update-error', {
          message: error.message || String(error)
        })
      }
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
   * 应用主源 feed（GitHub provider，支持 Range 请求 → 差分更新）
   */
  _applyPrimaryFeed() {
    const github = this.configManager?.getConfig()?.updateGithub
    if (!github?.owner || !github?.repo) {
      log.warn('[UpdateManager] GitHub config missing, cannot set primary feed')
      return
    }
    log.info('[UpdateManager] Primary feed: github', `${github.owner}/${github.repo}`)
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: github.owner,
      repo: github.repo
    })
  }

  /**
   * 切换到镜像源（generic provider）
   */
  _switchToMirror() {
    if (this._usingMirror) return
    const mirrorUrl = this.configManager?.getConfig()?.updateMirrorUrl
    if (!mirrorUrl) {
      log.warn('[UpdateManager] No mirror URL configured, skip fallback')
      return
    }
    log.info('[UpdateManager] Switching to mirror:', mirrorUrl)
    autoUpdater.setFeedURL({ provider: 'generic', url: mirrorUrl })
    this._usingMirror = true
  }

  /**
   * 重置回主源
   */
  _resetToPrimary() {
    if (!this._usingMirror) return
    this._applyPrimaryFeed()
    this._usingMirror = false
  }

  /**
   * 检查更新（主源 → 镜像 fallback）
   * @param {boolean} silent - 静默检查（启动时后台检查）
   */
  async checkForUpdates(silent = false) {
    // 防重入：避免并发检查导致源被切换
    if (this._isChecking) {
      log.warn('[UpdateManager] Check already in progress, ignoring duplicate call')
      return
    }
    this._isChecking = true

    // 手动检查时取消待执行的自动检查，避免重复触发
    if (!silent && this.updateCheckTimer) {
      clearTimeout(this.updateCheckTimer)
      this.updateCheckTimer = null
      log.info('[UpdateManager] Cancelled pending auto-check (manual check triggered)')
    }

    // 每次检查先重置回主源
    this._resetToPrimary()

    const hasMirror = !!this.configManager?.getConfig()?.updateMirrorUrl

    try {
      // 有镜像源时预先抑制 error 事件，避免主源失败的错误信息闪现在 UI
      // 主源成功则立即恢复；主源失败则静默 fallback，由镜像结果决定是否报错
      if (hasMirror) this._isFallingBack = true
      log.info('[UpdateManager] Check for updates (primary), silent:', silent)
      const result = await autoUpdater.checkForUpdates()
      this._isFallingBack = false
      return result
    } catch (error) {
      this._isFallingBack = false
      log.warn('[UpdateManager] Primary check failed:', error.message, '- trying mirror')
      if (!hasMirror) {
        if (!silent) {
          this.sendToRenderer('update-error', { message: error.message || String(error) })
        }
        throw error
      }
      try {
        this._isFallingBack = true
        this._switchToMirror()
        return await autoUpdater.checkForUpdates()
      } catch (mirrorError) {
        log.error('[UpdateManager] Mirror check also failed:', mirrorError.message)
        this._resetToPrimary()
        if (!silent) {
          this.sendToRenderer('update-error', {
            message: mirrorError.message || String(mirrorError)
          })
        }
        throw mirrorError
      } finally {
        this._isFallingBack = false
      }
    } finally {
      this._isChecking = false
    }
  }

  /**
   * 开始下载更新（带防重入保护 + 镜像 fallback）
   */
  async downloadUpdate() {
    if (this.isDownloading) {
      log.warn('[UpdateManager] Download already in progress, ignoring duplicate call')
      return
    }
    this.isDownloading = true
    try {
      const source = this._usingMirror ? 'mirror' : 'primary'
      log.info(`[UpdateManager] Start downloading update from ${source}...`)
      return await autoUpdater.downloadUpdate()
    } catch (error) {
      // 如果主源下载失败，尝试镜像
      if (!this._usingMirror) {
        log.warn('[UpdateManager] Primary download failed:', error.message, '- trying mirror')
        try {
          this._isFallingBack = true
          this._switchToMirror()
          // 切换源后需要重新 checkForUpdates 让 electron-updater 感知新源
          await autoUpdater.checkForUpdates()
          return await autoUpdater.downloadUpdate()
        } catch (mirrorError) {
          this.isDownloading = false
          log.error('[UpdateManager] Mirror download also failed:', mirrorError.message)
          this._resetToPrimary()
          this.sendToRenderer('update-error', {
            message: mirrorError.message || String(mirrorError)
          })
          throw mirrorError
        } finally {
          this._isFallingBack = false
        }
      }
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
      log.warn('[UpdateManager] isDownloaded is false, notifying renderer to re-download')
      this.sendToRenderer('update-need-redownload', {
        message: 'Update file not available, please download again'
      })
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
      // 安装失败可能是文件被清理，重置状态让用户重新下载
      this.isDownloaded = false
      this.downloadedFilePath = null
      this._clearPersistedState()
      this.sendToRenderer('update-need-redownload', {
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
   * - ZIP 路径、结果文件路径、脚本路径均通过环境变量传入，不做字符串插值
   * - 安装结果写入 install-result.json，下次启动时由 _checkPreviousInstallResult 读取
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
      // 使用时间戳避免多实例或残留文件冲突（隐患3）
      const scriptPath = path.join(os.tmpdir(), `cc-desktop-install-${Date.now()}.sh`)
      // 结果文件写入 userData，下次启动时读取（隐患2）
      const resultPath = path.join(app.getPath('userData'), 'install-result.json')

      // 所有外部路径通过环境变量传入，脚本内不做字符串插值
      // version 已通过 /^\d+\.\d+\.\d+$/ 校验，可安全嵌入脚本
      const installScript = `#!/bin/bash
ZIP_FILE="$CC_DESKTOP_ZIP_FILE"
RESULT_FILE="$CC_DESKTOP_RESULT_FILE"
SCRIPT_FILE="$CC_DESKTOP_SCRIPT_FILE"
VERSION="${version}"

# 写结果 JSON 到 userData，供下次启动时读取
write_result() {
  printf '{"success":%s,"message":"%s","version":"%s"}\\n' "$1" "$2" "$VERSION" > "$RESULT_FILE" 2>/dev/null || true
}

# 退出时自动删除脚本自身
cleanup_script() { rm -f "$SCRIPT_FILE" 2>/dev/null || true; }
trap cleanup_script EXIT

if [ ! -f "$ZIP_FILE" ]; then
  write_result false "Downloaded file not found"
  exit 1
fi

echo "[Install] Waiting for app to quit..."
sleep 2

EXTRACT_DIR=$(mktemp -d)
echo "[Install] Extracting..."
unzip -o "$ZIP_FILE" -d "$EXTRACT_DIR" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  write_result false "Failed to extract ZIP"
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

APP_FILE=$(ls -d "$EXTRACT_DIR"/*.app 2>/dev/null | head -1)
if [ -z "$APP_FILE" ]; then
  write_result false "No .app found after extraction"
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

APP_NAME=$(basename "$APP_FILE")
NEW_APP="/Applications/\${APP_NAME}.new"
FINAL_APP="/Applications/$APP_NAME"

echo "[Install] Copying to /Applications..."
rm -rf "$NEW_APP" 2>/dev/null || true
cp -R "$APP_FILE" "$NEW_APP"
if [ $? -ne 0 ]; then
  write_result false "Failed to copy .app (check /Applications write permission)"
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

# 原子替换：旧版本在 mv 成功前不会被删除（隐患1）
# cp 成功后再 rm，rm 失败也不删 .new，保证安装失败时旧版本仍在
rm -rf "$FINAL_APP"
if [ $? -ne 0 ]; then
  write_result false "Failed to remove old version (check /Applications write permission)"
  rm -rf "$NEW_APP" "$EXTRACT_DIR"
  exit 1
fi
mv "$NEW_APP" "$FINAL_APP"
if [ $? -ne 0 ]; then
  write_result false "Failed to finalize installation"
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

echo "[Install] Cleaning up..."
rm -rf "$EXTRACT_DIR"
# 保留当前 ZIP（下次差分更新的基础），清理同目录下的其他旧 ZIP
ZIP_DIR=$(dirname "$ZIP_FILE")
ZIP_BASE=$(basename "$ZIP_FILE")
find "$ZIP_DIR" -maxdepth 1 -name "*.zip" ! -name "$ZIP_BASE" -delete 2>/dev/null || true

write_result true "Installation successful"
echo "[Install] Launching new version..."
nohup open "$FINAL_APP" > /dev/null 2>&1 &
exit 0
`

      fs.writeFileSync(scriptPath, installScript, { mode: 0o755 })
      log.info('[UpdateManager] Install script created:', scriptPath)

      const child = spawn('/bin/bash', [scriptPath], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CC_DESKTOP_ZIP_FILE: zipFile,
          CC_DESKTOP_RESULT_FILE: resultPath,
          CC_DESKTOP_SCRIPT_FILE: scriptPath
        }
      })
      child.unref()

      log.info('[UpdateManager] Install script launched (PID:', child.pid, ')')
      // 不在此处清除持久化状态：
      //   成功 → 下次启动由 _checkPreviousInstallResult 在读到 success 后清除
      //   失败 → 保留状态，允许用户重新触发安装

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
   * 检查上次 macOS 安装结果（构造函数中调用）
   * - 成功：清除下载状态（新版本已在运行）
   * - 失败：延迟通知 renderer，保留持久化状态允许用户重试安装
   */
  _checkPreviousInstallResult() {
    if (process.platform !== 'darwin') return
    const resultPath = path.join(app.getPath('userData'), 'install-result.json')
    if (!fs.existsSync(resultPath)) return

    try {
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
      fs.unlinkSync(resultPath) // 消费结果文件，避免重复读取
      log.info('[UpdateManager] Previous install result:', result)

      if (result.success) {
        // 新版本已成功安装并运行，清除旧的下载状态
        this._clearPersistedState()
      } else {
        // 安装失败：保存错误供前端读取，3s 后发事件让 App.vue 打开更新窗口
        log.warn('[UpdateManager] Previous install failed:', result.message)
        this._pendingInstallError = { version: result.version, message: result.message }
        setTimeout(() => {
          if (this._pendingInstallError) {
            this.sendToRenderer('update-install-failed', this._pendingInstallError)
          }
        }, 3000)
      }
    } catch (err) {
      log.warn('[UpdateManager] Failed to read install result:', err.message)
    }
  }

  /**
   * 返回并清除待通知的安装失败信息（供 UpdateManagerContent 在 mount 时读取）
   */
  getPendingInstallError() {
    const err = this._pendingInstallError
    this._pendingInstallError = null
    return err
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

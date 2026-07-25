const path = require('path')

const DEFAULT_TIMEOUT_MS = 15000

class SplashController {
  constructor({ appInstance, BrowserWindowClass, ipcMain, configManager, logger = console, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.app = appInstance
    this.BrowserWindow = BrowserWindowClass
    this.ipcMain = ipcMain
    this.configManager = configManager
    this.logger = logger
    this.timeoutMs = timeoutMs
    this.splashWindow = null
    this.mainWindow = null
    this.mainWindowReady = false
    this.mainServicesReady = false
    this.rendererReady = false
    this.revealed = false
    this.forceReveal = false
    this.timeout = null
    this.splashDomReady = false
    this.status = {
      title: '正在准备智能工作台',
      detail: '正在读取本地配置'
    }
  }

  registerIpc() {
    this.ipcMain?.on('splash:renderer-ready', () => {
      this.markRendererReady()
    })
  }

  start() {
    if (this.splashWindow || this.revealed) return

    const settings = this.configManager?.getConfig?.()?.settings || {}
    const theme = settings.theme === 'dark' ? 'dark' : 'light'
    const splashFile = path.join(__dirname, '../renderer/splash/index.html')
    this.splashWindow = new this.BrowserWindow({
      width: 620,
      height: 390,
      minWidth: 620,
      minHeight: 390,
      maxWidth: 620,
      maxHeight: 390,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      backgroundColor: theme === 'dark' ? '#1a1a1a' : '#f5f5f0',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.splashWindow.once('ready-to-show', () => {
      this.splashWindow?.show()
    })
    this.splashWindow.webContents.once('dom-ready', () => {
      this.splashDomReady = true
      this.renderStatus()
    })
    this.splashWindow.on('closed', () => {
      this.splashWindow = null
    })
    this.splashWindow.loadFile(splashFile, {
      query: {
        theme,
        version: this.app.getVersion()
      }
    }).catch((error) => {
      this.logger.error('[Splash] Failed to load splash screen:', error)
      this.closeSplash()
    })

    this.timeout = setTimeout(() => {
      this.logger.warn('[Splash] Startup readiness timed out; showing the main window')
      this.forceReveal = true
      this.tryReveal()
    }, this.timeoutMs)
  }

  markMainWindowReady(mainWindow) {
    this.mainWindow = mainWindow
    this.mainWindowReady = true
    if (this.revealed) {
      this.revealMainWindow()
      return
    }
    this.tryReveal()
  }

  markMainServicesReady() {
    this.mainServicesReady = true
    this.tryReveal()
  }

  markRendererReady() {
    this.rendererReady = true
    this.tryReveal()
  }

  updateStatus({ title, detail }) {
    this.status = {
      title: title || this.status.title,
      detail: detail || this.status.detail
    }
    this.renderStatus()
  }

  renderStatus() {
    if (!this.splashDomReady || !this.splashWindow || this.splashWindow.isDestroyed()) return
    const payload = JSON.stringify(this.status)
    this.splashWindow.webContents.executeJavaScript(`window.updateSplashStatus?.(${payload})`).catch(() => {})
  }

  tryReveal() {
    if (this.revealed || !this.mainWindowReady || !this.mainWindow) return
    if (!this.forceReveal && (!this.mainServicesReady || !this.rendererReady)) return

    this.revealed = true
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.revealMainWindow()
    this.closeSplash()
  }

  revealMainWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.maximize()
    this.mainWindow.show()
  }

  closeSplash() {
    if (!this.splashWindow || this.splashWindow.isDestroyed()) return
    this.splashDomReady = false
    this.splashWindow.close()
  }

  destroy() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.closeSplash()
  }
}

module.exports = { SplashController, DEFAULT_TIMEOUT_MS }

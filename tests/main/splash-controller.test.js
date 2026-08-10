import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { SplashController } from '../../src/main/splash-controller.js'

function createWindow() {
  const listeners = new Map()
  const webContentsListeners = new Map()
  return {
    once: vi.fn((event, callback) => listeners.set(`once:${event}`, callback)),
    on: vi.fn((event, callback) => listeners.set(event, callback)),
    loadFile: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
    show: vi.fn(),
    maximize: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: {
      once: vi.fn((event, callback) => webContentsListeners.set(event, callback)),
      executeJavaScript: vi.fn(() => Promise.resolve())
    },
    emitReadyToShow: () => listeners.get('once:ready-to-show')?.(),
    emitDomReady: () => webContentsListeners.get('dom-ready')?.()
  }
}

function createController() {
  const splashWindow = createWindow()
  const mainWindow = createWindow()
  const ipcMain = { on: vi.fn() }
  const controller = new SplashController({
    appInstance: { getVersion: () => '1.7.90' },
    BrowserWindowClass: vi.fn(() => splashWindow),
    ipcMain,
    configManager: { getConfig: () => ({ settings: { theme: 'light' } }) },
    timeoutMs: 60000
  })
  return { controller, splashWindow, mainWindow, ipcMain }
}

describe('SplashController', () => {
  it('uses the existing application icon in the splash page', () => {
    const splashHtml = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/splash/index.html'), 'utf8')

    expect(splashHtml).toContain('../../../assets/icon.png')
  })

  it('reveals the main window only after main services and the renderer are ready', () => {
    const { controller, splashWindow, mainWindow } = createController()
    controller.start()
    controller.markMainWindowReady(mainWindow)
    controller.markMainServicesReady()

    expect(mainWindow.show).not.toHaveBeenCalled()

    controller.markRendererReady()

    expect(mainWindow.maximize).toHaveBeenCalledOnce()
    expect(mainWindow.show).toHaveBeenCalledOnce()
    expect(splashWindow.close).toHaveBeenCalledOnce()
  })

  it('shows a recreated main window immediately after the initial splash has completed', () => {
    const { controller, mainWindow } = createController()
    controller.start()
    controller.markMainWindowReady(mainWindow)
    controller.markMainServicesReady()
    controller.markRendererReady()

    const recreatedWindow = createWindow()
    controller.markMainWindowReady(recreatedWindow)

    expect(recreatedWindow.maximize).toHaveBeenCalledOnce()
    expect(recreatedWindow.show).toHaveBeenCalledOnce()
  })

  it('keeps the splash visible on dev startup timeout until the renderer is ready', () => {
    const originalDevServerUrl = process.env.VITE_DEV_SERVER_URL
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173/'

    vi.useFakeTimers()
    try {
      const { controller, mainWindow } = createController()
      controller.timeoutMs = 50

      controller.start()
      controller.markMainWindowReady(mainWindow)
      controller.markMainServicesReady()

      vi.advanceTimersByTime(60)

      expect(mainWindow.show).not.toHaveBeenCalled()

      controller.markRendererReady()

      expect(mainWindow.maximize).toHaveBeenCalledOnce()
      expect(mainWindow.show).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
      if (originalDevServerUrl === undefined) {
        delete process.env.VITE_DEV_SERVER_URL
      } else {
        process.env.VITE_DEV_SERVER_URL = originalDevServerUrl
      }
    }
  })

  it('queues real startup status until the splash DOM is ready', () => {
    const { controller, splashWindow } = createController()
    controller.start()

    controller.updateStatus({ detail: '正在注册应用服务' })
    expect(splashWindow.webContents.executeJavaScript).not.toHaveBeenCalled()

    splashWindow.emitDomReady()
    expect(splashWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('正在注册应用服务')
    )
  })
})

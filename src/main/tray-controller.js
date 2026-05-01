const fs = require('fs')
const path = require('path')
const { app, Menu, Tray, nativeImage } = require('electron')
const { tMain } = require('./utils/app-i18n')

function createSvgDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function buildFallbackTraySvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#3D6FA8"/>
      <path d="M3.5 9.5C4.8 7.7 5.8 7.7 7 9.5C8.2 11.3 9.2 11.3 10.5 9.5C11.4 8.2 12 7.9 12.5 7.9" fill="none" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M3.5 6.6C4.7 4.9 5.7 4.9 7 6.6C8.2 8.3 9.2 8.3 10.5 6.6C11.4 5.3 12 5 12.5 5" fill="none" stroke="#D9ECFF" stroke-width="1.3" stroke-linecap="round"/>
    </svg>
  `.trim()
}

function createFallbackTrayImage(platform, nativeImageModule = nativeImage) {
  const image = nativeImageModule.createFromDataURL(createSvgDataUrl(buildFallbackTraySvg()))
  const size = 16
  const resized = image.resize({ width: size, height: size })
  return resized
}

function resolveTrayImage(platform, {
  appInstance = app,
  nativeImageModule = nativeImage,
  fsModule = fs,
  pathModule = path
} = {}) {
  const iconCandidates = platform === 'win32' || platform === 'darwin'
    ? [
          pathModule.join(appInstance.getAppPath(), 'assets', 'tray.png'),
          pathModule.join(process.resourcesPath || '', 'app.asar', 'assets', 'tray.png'),
          pathModule.join(process.resourcesPath || '', 'assets', 'tray.png'),
          pathModule.join(appInstance.getAppPath(), 'src', 'main', 'assets', 'tray.png'),
          pathModule.join(process.resourcesPath || '', 'app.asar', 'src', 'main', 'assets', 'tray.png'),
          pathModule.join(process.resourcesPath || '', 'app.asar.unpacked', 'src', 'main', 'assets', 'tray.png'),
          pathModule.join(appInstance.getAppPath(), 'assets', 'icon.ico'),
          pathModule.join(appInstance.getAppPath(), 'assets', 'icon.png'),
          pathModule.join(process.resourcesPath || '', 'app.asar', 'assets', 'icon.ico'),
          pathModule.join(process.resourcesPath || '', 'app.asar', 'assets', 'icon.png'),
          pathModule.join(process.resourcesPath || '', 'assets', 'icon.ico'),
          pathModule.join(process.resourcesPath || '', 'assets', 'icon.png'),
          pathModule.join(appInstance.getAppPath(), 'assets', 'tray.ico'),
          pathModule.join(process.resourcesPath || '', 'assets', 'tray.ico')
        ]
    : [
        pathModule.join(appInstance.getAppPath(), 'assets', 'tray.png'),
        pathModule.join(appInstance.getAppPath(), 'assets', 'icon.png'),
        pathModule.join(process.resourcesPath || '', 'assets', 'tray.png'),
        pathModule.join(process.resourcesPath || '', 'assets', 'icon.png')
      ]

  for (const candidate of iconCandidates) {
    if (!candidate || !fsModule.existsSync(candidate)) continue
    const image = nativeImageModule.createFromPath(candidate)
    if (!image.isEmpty()) {
      if (platform === 'darwin' && typeof image.resize === 'function') {
        return image.resize({ width: 16, height: 16 })
      }
      return image
    }
  }

  return createFallbackTrayImage(platform, nativeImageModule)
}

function createTrayController({
  appInstance = app,
  configManager,
  getMainWindow,
  onQuitRequest,
  platform = process.platform,
  TrayClass = Tray,
  MenuModule = Menu,
  nativeImageModule = nativeImage,
  fsModule = fs,
  pathModule = path
} = {}) {
  let tray = null
  let isQuitting = false

  function getWindow() {
    return typeof getMainWindow === 'function' ? getMainWindow() : null
  }

  function isWindowVisible() {
    const win = getWindow()
    return !!win && !win.isDestroyed() && win.isVisible()
  }

  function showMainWindow() {
    const win = getWindow()
    if (!win || win.isDestroyed()) return

    if (win.isMinimized()) {
      win.restore()
    }

    win.show()
    if (platform === 'darwin') {
      appInstance.dock?.show()
    }
    win.focus()
    refreshTrayMenu()
  }

  function hideMainWindow() {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    win.hide()
    refreshTrayMenu()
  }

  function markQuitting() {
    isQuitting = true
  }

  function resetQuitting() {
    isQuitting = false
  }

  function buildContextMenu() {
    const visible = isWindowVisible()

    return MenuModule.buildFromTemplate([
      {
        label: tMain(configManager, 'app.tray.tooltip'),
        enabled: false
      },
      { type: 'separator' },
      {
        label: visible
          ? tMain(configManager, 'app.tray.hide')
          : tMain(configManager, 'app.tray.show'),
        click: visible ? hideMainWindow : showMainWindow
      },
      {
        label: tMain(configManager, 'app.tray.quit'),
        click: () => {
          markQuitting()
          if (typeof onQuitRequest === 'function') {
            onQuitRequest()
            return
          }
          appInstance.quit()
        }
      }
    ])
  }

  function refreshTrayMenu() {
    if (!tray) return
    tray.setToolTip(tMain(configManager, 'app.tray.tooltip'))
    tray.setContextMenu(buildContextMenu())
  }

  function ensureTray() {
    if (tray) {
      refreshTrayMenu()
      return tray
    }

    tray = new TrayClass(resolveTrayImage(platform, {
      appInstance,
      nativeImageModule,
      fsModule,
      pathModule
    }))

    tray.on('click', showMainWindow)
    tray.on('double-click', showMainWindow)
    tray.on('right-click', refreshTrayMenu)

    refreshTrayMenu()
    return tray
  }

  function destroyTray() {
    if (tray?.destroy) {
      tray.destroy()
    }
    tray = null
  }

  function handleWindowClose(event) {
    const win = getWindow()
    if (isQuitting || !tray || !win || win.isDestroyed()) {
      return false
    }

    event?.preventDefault?.()
    hideMainWindow()
    return true
  }

  return {
    destroyTray,
    ensureTray,
    handleWindowClose,
    hideMainWindow,
    isWindowVisible,
    markQuitting,
    refreshTrayMenu,
    resetQuitting,
    showMainWindow
  }
}

module.exports = {
  createFallbackTrayImage,
  createTrayController,
  resolveTrayImage
}

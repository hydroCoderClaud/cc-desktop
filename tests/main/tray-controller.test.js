import { describe, expect, it, vi } from 'vitest'

function createMockWindow({ visible = true, minimized = false } = {}) {
  let isVisible = visible
  let isMinimized = minimized

  return {
    hide: vi.fn(() => {
      isVisible = false
    }),
    show: vi.fn(() => {
      isVisible = true
    }),
    focus: vi.fn(),
    restore: vi.fn(() => {
      isMinimized = false
      isVisible = true
    }),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => isVisible),
    isMinimized: vi.fn(() => isMinimized)
  }
}

function createMockTray() {
  return {
    handlers: {},
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(function(event, handler) {
      this.handlers[event] = handler
      return this
    }),
    destroy: vi.fn()
  }
}

describe('tray-controller', () => {
  it('does not intercept close before tray is initialized', async () => {
    const { createTrayController } = await import('../../src/main/tray-controller.js')
    const win = createMockWindow({ visible: true })
    const controller = createTrayController({
      appInstance: { getAppPath: () => 'C:/app', quit: vi.fn(), dock: { show: vi.fn() } },
      configManager: { getConfig: () => ({ settings: { locale: 'zh-CN' } }) },
      getMainWindow: () => win
    })

    const event = { preventDefault: vi.fn() }
    const intercepted = controller.handleWindowClose(event)

    expect(intercepted).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(win.hide).not.toHaveBeenCalled()
  })

  it('hides the window to tray when close is intercepted', async () => {
    const trayInstances = []
    const trayFactory = vi.fn(() => {
      const tray = createMockTray()
      trayInstances.push(tray)
      return tray
    })
    const menuModule = {
      buildFromTemplate: vi.fn(template => template)
    }
    const nativeImageModule = {
      createFromPath: vi.fn(() => ({ isEmpty: () => true })),
      createFromBuffer: vi.fn(() => ({
        resize: vi.fn(() => ({
          setTemplateImage: vi.fn()
        }))
      })),
      createFromDataURL: vi.fn(() => ({
        resize: vi.fn(() => ({
          setTemplateImage: vi.fn()
        }))
      }))
    }

    const { createTrayController } = await import('../../src/main/tray-controller.js')
    const win = createMockWindow({ visible: true })
    const controller = createTrayController({
      appInstance: { getAppPath: () => 'C:/app', quit: vi.fn(), dock: { show: vi.fn() } },
      configManager: { getConfig: () => ({ settings: { locale: 'zh-CN' } }) },
      getMainWindow: () => win,
      TrayClass: trayFactory,
      MenuModule: menuModule,
      nativeImageModule,
      fsModule: { existsSync: vi.fn(() => false) },
      pathModule: { join: (...parts) => parts.join('/') }
    })

    controller.ensureTray()

    const event = { preventDefault: vi.fn() }
    const intercepted = controller.handleWindowClose(event)

    expect(intercepted).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(win.hide).toHaveBeenCalledOnce()

    const latestMenu = trayInstances[0].setContextMenu.mock.lastCall[0]
    expect(latestMenu[2].label).toBe('显示主窗口')
  })

  it('lets the window close normally after quit is requested', async () => {
    const { createTrayController } = await import('../../src/main/tray-controller.js')
    const win = createMockWindow({ visible: true })
    const controller = createTrayController({
      appInstance: { getAppPath: () => 'C:/app', quit: vi.fn(), dock: { show: vi.fn() } },
      configManager: { getConfig: () => ({ settings: { locale: 'en-US' } }) },
      getMainWindow: () => win,
      TrayClass: vi.fn(() => createMockTray()),
      MenuModule: { buildFromTemplate: vi.fn(template => template) },
      nativeImageModule: {
        createFromPath: vi.fn(() => ({ isEmpty: () => true })),
        createFromBuffer: vi.fn(() => ({
          resize: vi.fn(() => ({
            setTemplateImage: vi.fn()
          }))
        })),
        createFromDataURL: vi.fn(() => ({
          resize: vi.fn(() => ({
            setTemplateImage: vi.fn()
          }))
        }))
      },
      fsModule: { existsSync: vi.fn(() => false) },
      pathModule: { join: (...parts) => parts.join('/') }
    })

    controller.markQuitting()
    const event = { preventDefault: vi.fn() }

    const intercepted = controller.handleWindowClose(event)

    expect(intercepted).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(win.hide).not.toHaveBeenCalled()
  })

  it('restores and focuses a minimized window when showing from tray', async () => {
    const { createTrayController } = await import('../../src/main/tray-controller.js')
    const dockShow = vi.fn()
    const win = createMockWindow({ visible: false, minimized: true })
    const controller = createTrayController({
      appInstance: { getAppPath: () => 'C:/app', quit: vi.fn(), dock: { show: dockShow } },
      configManager: { getConfig: () => ({ settings: { locale: 'en-US' } }) },
      getMainWindow: () => win,
      platform: 'darwin',
      TrayClass: vi.fn(() => createMockTray()),
      MenuModule: { buildFromTemplate: vi.fn(template => template) },
      nativeImageModule: {
        createFromPath: vi.fn(() => ({ isEmpty: () => true })),
        createFromBuffer: vi.fn(() => ({
          resize: vi.fn(() => ({
            setTemplateImage: vi.fn()
          }))
        })),
        createFromDataURL: vi.fn(() => ({
          resize: vi.fn(() => ({
            setTemplateImage: vi.fn()
          }))
        }))
      },
      fsModule: { existsSync: vi.fn(() => false) },
      pathModule: { join: (...parts) => parts.join('/') }
    })

    controller.showMainWindow()

    expect(win.restore).toHaveBeenCalledOnce()
    expect(win.show).toHaveBeenCalledOnce()
    expect(win.focus).toHaveBeenCalledOnce()
    expect(dockShow).toHaveBeenCalledOnce()
  })

  it('uses macOS buffer fallback instead of generic icon.png', async () => {
    const nativeImageModule = {
      createFromPath: vi.fn(() => ({ isEmpty: () => false, setTemplateImage: vi.fn() })),
      createFromBuffer: vi.fn(() => ({
        resize: vi.fn(() => ({
          setTemplateImage: vi.fn()
        }))
      })),
      createFromDataURL: vi.fn(() => ({
        resize: vi.fn(() => ({
          setTemplateImage: vi.fn()
        }))
      }))
    }

    const { resolveTrayImage } = await import('../../src/main/tray-controller.js')
    resolveTrayImage('darwin', {
      appInstance: { getAppPath: () => 'C:/app' },
      nativeImageModule,
      fsModule: {
        existsSync: vi.fn(filePath => filePath.endsWith('icon.png'))
      },
      pathModule: { join: (...parts) => parts.join('/') }
    })

    expect(nativeImageModule.createFromPath).not.toHaveBeenCalled()
    expect(nativeImageModule.createFromBuffer).toHaveBeenCalledOnce()
  })

  it('uses Windows SVG fallback when no tray asset exists', async () => {
    const nativeImageModule = {
      createFromPath: vi.fn(() => ({ isEmpty: () => true })),
      createFromBuffer: vi.fn(() => ({
        resize: vi.fn(() => ({ setTemplateImage: vi.fn() }))
      })),
      createFromDataURL: vi.fn(() => ({
        resize: vi.fn(() => ({ setTemplateImage: vi.fn() }))
      }))
    }

    const { resolveTrayImage } = await import('../../src/main/tray-controller.js')
    resolveTrayImage('win32', {
      appInstance: { getAppPath: () => 'C:/app' },
      nativeImageModule,
      fsModule: { existsSync: vi.fn(() => false) },
      pathModule: { join: (...parts) => parts.join('/') }
    })

    expect(nativeImageModule.createFromBuffer).not.toHaveBeenCalled()
    expect(nativeImageModule.createFromDataURL).toHaveBeenCalledOnce()
  })

  it('prefers the transparent Windows tray png when available', async () => {
    const nativeImage = {
      isEmpty: () => false
    }
    const nativeImageModule = {
      createFromPath: vi.fn(() => nativeImage),
      createFromBuffer: vi.fn(() => ({
        resize: vi.fn(() => ({ setTemplateImage: vi.fn() }))
      })),
      createFromDataURL: vi.fn(() => ({
        resize: vi.fn(() => ({ setTemplateImage: vi.fn() }))
      }))
    }

    const { resolveTrayImage } = await import('../../src/main/tray-controller.js')
    const result = resolveTrayImage('win32', {
      appInstance: { getAppPath: () => 'C:/app' },
      nativeImageModule,
      fsModule: {
        existsSync: vi.fn(filePath => filePath.endsWith('assets/tray.png'))
      },
      pathModule: { join: (...parts) => parts.join('/') }
    })

    expect(nativeImageModule.createFromPath).toHaveBeenCalledWith('C:/app/assets/tray.png')
    expect(nativeImageModule.createFromBuffer).not.toHaveBeenCalled()
    expect(nativeImageModule.createFromDataURL).not.toHaveBeenCalled()
    expect(result).toBe(nativeImage)
  })
})

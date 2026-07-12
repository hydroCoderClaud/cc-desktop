import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('useAppMode', () => {
  const originalWindow = global.window

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalWindow === undefined) {
      delete global.window
    } else {
      global.window = originalWindow
    }
  })

  it('固定以 Agent 模式启动，并在缺省配置下禁用开发者模式', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const setMainWindowTitleByMode = vi.fn().mockResolvedValue(undefined)

    global.window = {
      electronAPI: {
        getConfig: vi.fn().mockResolvedValue({
          settings: {
            appMode: 'developer'
          }
        }),
        updateSettings,
        setMainWindowTitleByMode
      }
    }

    const { useAppMode, AppMode } = await import('../../src/renderer/composables/useAppMode.js')
    const { appMode, developerModeEnabled, initMode } = useAppMode()

    await initMode()

    expect(appMode.value).toBe(AppMode.AGENT)
    expect(developerModeEnabled.value).toBe(false)
    expect(setMainWindowTitleByMode).toHaveBeenCalledWith(AppMode.AGENT)
    expect(updateSettings).toHaveBeenCalledWith({ appMode: AppMode.AGENT })
  })

  it('始终阻止切换到开发者模式', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const setMainWindowTitleByMode = vi.fn().mockResolvedValue(undefined)

    global.window = {
      electronAPI: {
        getConfig: vi.fn().mockResolvedValue({
          settings: {
            enableDeveloperMode: false,
            appMode: 'developer'
          }
        }),
        updateSettings,
        setMainWindowTitleByMode
      }
    }

    const { useAppMode, AppMode } = await import('../../src/renderer/composables/useAppMode.js')
    const { appMode, developerModeEnabled, initMode, switchMode } = useAppMode()

    await initMode()
    updateSettings.mockClear()
    setMainWindowTitleByMode.mockClear()

    await switchMode(AppMode.DEVELOPER)

    expect(developerModeEnabled.value).toBe(false)
    expect(appMode.value).toBe(AppMode.AGENT)
    expect(updateSettings).not.toHaveBeenCalled()
    expect(setMainWindowTitleByMode).not.toHaveBeenCalled()
  })

  it('收到设置广播启用开发者模式时也不会重新开放 Developer', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const setMainWindowTitleByMode = vi.fn().mockResolvedValue(undefined)
    let settingsChangedHandler = null

    global.window = {
      electronAPI: {
        getConfig: vi.fn().mockResolvedValue({
          settings: {
            enableDeveloperMode: true,
            appMode: 'agent'
          }
        }),
        updateSettings,
        setMainWindowTitleByMode,
        onSettingsChanged: (callback) => {
          settingsChangedHandler = callback
          return () => {}
        }
      }
    }

    const { useAppMode, AppMode } = await import('../../src/renderer/composables/useAppMode.js')
    const { appMode, developerModeEnabled, initMode, switchMode } = useAppMode()

    await initMode()
    await switchMode(AppMode.DEVELOPER)
    setMainWindowTitleByMode.mockClear()

    await settingsChangedHandler?.({
      enableDeveloperMode: true,
      appMode: 'developer'
    })

    expect(developerModeEnabled.value).toBe(false)
    expect(appMode.value).toBe(AppMode.AGENT)
    expect(setMainWindowTitleByMode).not.toHaveBeenCalled()
  })
})

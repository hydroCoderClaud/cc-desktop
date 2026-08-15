import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useEmbeddedApps', () => {
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

  it('defaults the workbench menu to hidden and responds to settings broadcasts', async () => {
    let settingsChangedHandler = null

    global.window = {
      electronAPI: {
        getConfig: vi.fn().mockResolvedValue({
          settings: {
            embeddedApps: {
              preferences: {}
            }
          }
        }),
        onSettingsChanged: (callback) => {
          settingsChangedHandler = callback
          return () => {}
        }
      }
    }

    const { useEmbeddedApps } = await import('../../src/renderer/composables/useEmbeddedApps.js')
    const { embeddedWorkbenchMenuVisible, initEmbeddedWorkbenchMenuVisibility } = useEmbeddedApps()

    expect(embeddedWorkbenchMenuVisible.value).toBe(false)

    await initEmbeddedWorkbenchMenuVisibility()
    expect(embeddedWorkbenchMenuVisible.value).toBe(false)

    settingsChangedHandler({ embeddedApps: { showInMenu: true } })
    expect(embeddedWorkbenchMenuVisible.value).toBe(true)

    settingsChangedHandler({ embeddedApps: { preferences: {} } })
    expect(embeddedWorkbenchMenuVisible.value).toBe(true)

    settingsChangedHandler({ embeddedApps: { showInMenu: false } })
    expect(embeddedWorkbenchMenuVisible.value).toBe(false)
  })

  it('loads an enabled menu preference from persisted configuration', async () => {
    global.window = {
      electronAPI: {
        getConfig: vi.fn().mockResolvedValue({
          settings: {
            embeddedApps: {
              showInMenu: true,
              preferences: {}
            }
          }
        })
      }
    }

    const { useEmbeddedApps } = await import('../../src/renderer/composables/useEmbeddedApps.js')
    const { embeddedWorkbenchMenuVisible, initEmbeddedWorkbenchMenuVisibility } = useEmbeddedApps()

    await initEmbeddedWorkbenchMenuVisibility()

    expect(embeddedWorkbenchMenuVisible.value).toBe(true)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createSingletonWindowRegistry, focusWindow } from '../../src/main/utils/singleton-window-registry.js'

function createWindow({ minimized = false, maximized = false, destroyed = false } = {}) {
  let closedHandler = null
  let isMinimized = minimized
  let isMaximized = maximized

  return {
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => isMinimized),
    isMaximized: vi.fn(() => isMaximized),
    restore: vi.fn(() => { isMinimized = false }),
    maximize: vi.fn(() => { isMaximized = true }),
    show: vi.fn(),
    focus: vi.fn(),
    once: vi.fn((event, handler) => {
      if (event === 'closed') closedHandler = handler
    }),
    closeForTest: () => closedHandler?.()
  }
}

describe('singleton window registry', () => {
  it('focuses an existing window instead of creating a duplicate', () => {
    const registry = createSingletonWindowRegistry()
    const window = createWindow()
    const createWindowFactory = vi.fn(() => window)

    expect(registry.open('model-settings', createWindowFactory).reused).toBe(false)
    expect(registry.open('model-settings', createWindowFactory).reused).toBe(true)

    expect(createWindowFactory).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('restores minimized windows and can reapply maximization on reuse', () => {
    const registry = createSingletonWindowRegistry()
    const window = createWindow({ minimized: true, maximized: false })

    registry.open('embedded', () => window)
    registry.open('embedded', () => createWindow(), { startMaximized: true })

    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.maximize).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('forgets a closed window so the key can create a new instance', () => {
    const registry = createSingletonWindowRegistry()
    const firstWindow = createWindow()
    const secondWindow = createWindow()
    const createWindowFactory = vi.fn()
      .mockReturnValueOnce(firstWindow)
      .mockReturnValueOnce(secondWindow)

    registry.open('global-settings', createWindowFactory)
    firstWindow.closeForTest()
    const result = registry.open('global-settings', createWindowFactory)

    expect(result).toEqual({ window: secondWindow, reused: false })
    expect(createWindowFactory).toHaveBeenCalledTimes(2)
  })

  it('keeps separate keys isolated and ignores destroyed windows', () => {
    const registry = createSingletonWindowRegistry()
    const staleWindow = createWindow({ destroyed: true })
    const liveWindow = createWindow()

    registry.open('model-settings', () => staleWindow)
    const recreated = registry.open('model-settings', () => liveWindow)
    const other = registry.open('channel-settings', () => createWindow())

    expect(recreated).toEqual({ window: liveWindow, reused: false })
    expect(other.reused).toBe(false)
  })

  it('does not focus destroyed windows', () => {
    const window = createWindow({ destroyed: true })

    expect(focusWindow(window)).toBe(false)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})

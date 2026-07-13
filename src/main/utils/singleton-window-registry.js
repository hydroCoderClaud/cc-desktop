/**
 * Reuse named Electron windows without coupling the registry to BrowserWindow.
 */
function focusWindow(window, { startMaximized = false } = {}) {
  if (!window || typeof window.isDestroyed !== 'function' || window.isDestroyed()) {
    return false
  }

  if (window.isMinimized?.()) {
    window.restore()
  }
  if (startMaximized && !window.isMaximized?.()) {
    window.maximize()
  }
  window.show()
  window.focus()
  return true
}

function createSingletonWindowRegistry() {
  const windows = new Map()

  const open = (key, createWindow, focusOptions = {}) => {
    if (!key || typeof createWindow !== 'function') {
      throw new TypeError('A window key and factory are required')
    }

    const existingWindow = windows.get(key)
    if (focusWindow(existingWindow, focusOptions)) {
      return { window: existingWindow, reused: true }
    }

    const window = createWindow()
    if (!window) {
      throw new Error(`Window factory returned no window for key: ${key}`)
    }

    windows.set(key, window)
    window.once('closed', () => {
      if (windows.get(key) === window) {
        windows.delete(key)
      }
    })

    return { window, reused: false }
  }

  return { open }
}

module.exports = {
  createSingletonWindowRegistry,
  focusWindow
}

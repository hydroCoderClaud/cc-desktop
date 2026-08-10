function notifyMcpChanged(payload = {}) {
  try {
    const { BrowserWindow } = require('electron')
    const windows = typeof BrowserWindow?.getAllWindows === 'function'
      ? BrowserWindow.getAllWindows()
      : []

    for (const win of windows) {
      try {
        if (win?.isDestroyed?.()) continue
        if (win?.webContents?.isDestroyed?.()) continue
        win.webContents.send('mcp:changed', {
          changedAt: Date.now(),
          ...payload
        })
      } catch {
        // Best effort broadcast; MCP mutations must not fail because a window closed.
      }
    }
  } catch {
    // Electron is not available in unit-test or non-window contexts.
  }
}

module.exports = {
  notifyMcpChanged
}

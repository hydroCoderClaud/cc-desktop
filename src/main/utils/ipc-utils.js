/**
 * IPC 工具函数
 * 提供统一的 IPC handler 创建和错误处理
 */

/**
 * Create IPC handler with unified logging and error handling
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {string} channelName - IPC channel name
 * @param {Function} handler - Handler function (receives args without event)
 */
function createIPCHandler(ipcMain, channelName, handler) {
  ipcMain.handle(channelName, async (event, ...args) => {
    console.log(`[IPC] ${channelName} called with:`, ...args)
    try {
      const result = await handler(...args)
      console.log(`[IPC] ${channelName} success`)
      return result
    } catch (error) {
      console.error(`[IPC] ${channelName} error:`, error)
      throw error
    }
  })
}

/**
 * Create IPC handler that also receives the event object
 * Use this when you need access to event.sender or other event properties
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {string} channelName - IPC channel name
 * @param {Function} handler - Handler function (receives event as first arg)
 */
function createIPCHandlerWithEvent(ipcMain, channelName, handler) {
  ipcMain.handle(channelName, async (event, ...args) => {
    console.log(`[IPC] ${channelName} called with:`, ...args)
    try {
      const result = await handler(event, ...args)
      console.log(`[IPC] ${channelName} success`)
      return result
    } catch (error) {
      console.error(`[IPC] ${channelName} error:`, error)
      throw error
    }
  })
}

/**
 * Register a synchronous IPC handler (ipcMain.on with event.returnValue)
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {string} channelName - IPC channel name
 * @param {Function} handler - Synchronous handler function (receives event)
 */
function createSyncIPCHandler(ipcMain, channelName, handler) {
  ipcMain.on(channelName, (event, ...args) => {
    try {
      event.returnValue = handler(event, ...args)
    } catch (error) {
      console.error(`[IPC] ${channelName} sync error:`, error)
      event.returnValue = null
    }
  })
}

/**
 * Register a fire-and-forget IPC handler (ipcMain.on without returnValue)
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {string} channelName - IPC channel name
 * @param {Function} handler - Handler function
 */
function createIPCListener(ipcMain, channelName, handler) {
  ipcMain.on(channelName, (event, ...args) => {
    try {
      handler(...args)
    } catch (error) {
      console.error(`[IPC] ${channelName} listener error:`, error)
    }
  })
}

module.exports = {
  createIPCHandler,
  createIPCHandlerWithEvent,
  createSyncIPCHandler,
  createIPCListener
}

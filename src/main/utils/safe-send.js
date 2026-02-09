/**
 * 安全地发送 IPC 消息到渲染进程
 * 检查 BrowserWindow 和 webContents 是否存活，防止 macOS 窗口关闭后报错
 *
 * @param {BrowserWindow} mainWindow - Electron 主窗口
 * @param {string} channel - IPC 频道
 * @param {any} data - 数据
 * @returns {boolean} 是否发送成功
 */
function safeSend(mainWindow, channel, data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() &&
        mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
      return true
    }
    console.warn(`[IPC] Cannot send to ${channel}: window destroyed`)
    return false
  } catch (error) {
    console.error(`[IPC] Failed to send to ${channel}:`, error)
    return false
  }
}

module.exports = { safeSend }

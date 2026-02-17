/**
 * 应用更新 IPC 处理器
 */

const { ipcMain, app } = require('electron')

function setupUpdateHandlers(updateManager) {
  /**
   * 检查更新
   */
  ipcMain.handle('update:check', async (event, silent = false) => {
    try {
      return await updateManager.checkForUpdates(silent)
    } catch (error) {
      return { error: error.message }
    }
  })

  /**
   * 开始下载更新
   */
  ipcMain.handle('update:download', async () => {
    try {
      return await updateManager.downloadUpdate()
    } catch (error) {
      return { error: error.message }
    }
  })

  /**
   * 退出并安装
   */
  ipcMain.handle('update:quitAndInstall', () => {
    updateManager.quitAndInstall()
  })

  /**
   * 获取当前应用版本
   */
  ipcMain.handle('update:getVersion', () => {
    return app.getVersion()
  })

  /**
   * 获取更新状态（是否有可用更新）
   */
  ipcMain.handle('update:getStatus', () => {
    return updateManager.getUpdateStatus()
  })
}

module.exports = { setupUpdateHandlers }

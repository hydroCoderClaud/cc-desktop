/**
 * 企业微信 IPC 处理器
 */

function setupEnterpriseWeixinHandlers(ipcMain, bridge, configManager) {
  if (!bridge) return

  ipcMain.handle('enterprise-weixin:getStatus', async () => {
    return bridge.getStatus()
  })

  ipcMain.handle('enterprise-weixin:start', async () => {
    return bridge.start()
  })

  ipcMain.handle('enterprise-weixin:stop', async () => {
    return bridge.stop()
  })

  ipcMain.handle('enterprise-weixin:restart', async () => {
    return bridge.restart()
  })

  ipcMain.handle('enterprise-weixin:updateConfig', async (_event, config) => {
    const current = configManager.getConfig()
    current.enterpriseWeixin = {
      ...current.enterpriseWeixin,
      ...config,
    }
    configManager.saveConfig(current)
    return bridge.restart()
  })

  ipcMain.handle('enterprise-weixin:sendText', async (_event, payload = {}) => {
    return bridge.sendTextToTarget(payload)
  })
}

module.exports = { setupEnterpriseWeixinHandlers }

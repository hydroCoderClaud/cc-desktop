/**
 * 企业微信 IPC 处理器
 */

const { setupImBridgeHandlers } = require('./im-bridge-handlers')

function setupEnterpriseWeixinHandlers(ipcMain, bridge, configManager) {
  if (!bridge) return

  // 注册标准 IM Bridge 处理器：getStatus / start / stop / restart / updateConfig / sendText
  setupImBridgeHandlers(ipcMain, bridge, configManager, 'enterprise-weixin')

  ipcMain.handle('enterprise-weixin:bindSessionToTarget', async (_event, payload = {}) => {
    return bridge.bindSessionToTarget(payload.sessionId, {
      userId: payload.userId || payload.targetId,
      targetId: payload.targetId,
      displayName: payload.displayName,
    })
  })

  ipcMain.handle('enterprise-weixin:unbindSessionTarget', async (_event, payload = {}) => {
    return bridge.unbindSessionTarget(payload.sessionId)
  })

  ipcMain.handle('enterprise-weixin:getSessionBinding', async (_event, sessionId) => {
    return bridge.getSessionBinding(sessionId)
  })
}

module.exports = { setupEnterpriseWeixinHandlers }

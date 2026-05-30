/**
 * 企业微信 IPC 处理器
 */

const { setupImBridgeHandlers } = require('./im-bridge-handlers')
const { WECOM_CLI_ERROR_CODES } = require('../managers/wecom-cli-manager')

function normalizeCliError(err) {
  return {
    success: false,
    error: err?.message || 'Unknown error',
    code: err?.code || WECOM_CLI_ERROR_CODES.CLI_EXEC_FAILED,
    errcode: err?.errcode || null,
    helpMessage: err?.helpMessage || '',
    helpInstruction: err?.helpInstruction || '',
  }
}

function setupEnterpriseWeixinHandlers(ipcMain, bridge, configManager, wecomCliManager = null) {
  if (!bridge) return

  // 注册标准 IM Bridge 处理器：getStatus / start / stop / restart / updateConfig / sendText
  setupImBridgeHandlers(ipcMain, bridge, configManager, 'enterprise-weixin')

  ipcMain.handle('enterprise-weixin:listTargets', async () => {
    if (!wecomCliManager) return []
    try {
      return await wecomCliManager.listContacts()
    } catch (err) {
      return normalizeCliError(err)
    }
  })

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

  ipcMain.handle('enterprise-weixin-cli:getStatus', async () => {
    if (!wecomCliManager) return { installed: false, initialized: false, authStatus: 'unknown', contactAuth: 'unknown' }
    return wecomCliManager.getDetailedStatus()
  })

  ipcMain.handle('enterprise-weixin-cli:getBootstrapStatus', async () => {
    if (!wecomCliManager) return { installed: false, initialized: false, authStatus: 'unknown', contactAuth: 'unknown' }
    return wecomCliManager.getBootstrapStatus()
  })

  ipcMain.handle('enterprise-weixin-cli:listContacts', async () => {
    if (!wecomCliManager) return []
    try {
      return await wecomCliManager.listContacts()
    } catch (err) {
      return normalizeCliError(err)
    }
  })

  ipcMain.handle('enterprise-weixin-cli:getInstallCommand', async () => {
    if (!wecomCliManager) return null
    return wecomCliManager.installCommand()
  })

  ipcMain.handle('enterprise-weixin-cli:runInstallCommand', async () => {
    if (!wecomCliManager) return { success: false, error: 'WeCom CLI manager unavailable' }
    try {
      return await wecomCliManager.runCommand(await wecomCliManager.installCommand())
    } catch (err) {
      return normalizeCliError(err)
    }
  })

  ipcMain.handle('enterprise-weixin-cli:getInitCommand', async () => {
    if (!wecomCliManager) return null
    return wecomCliManager.initCommand()
  })

  ipcMain.handle('enterprise-weixin-cli:runInitCommand', async () => {
    if (!wecomCliManager) return { success: false, error: 'WeCom CLI manager unavailable' }
    try {
      return await wecomCliManager.runCommand(await wecomCliManager.initCommand())
    } catch (err) {
      return normalizeCliError(err)
    }
  })

  ipcMain.handle('enterprise-weixin-cli:getReauthorizeCommand', async () => {
    if (!wecomCliManager) return null
    return wecomCliManager.reauthorizeCommand()
  })
}

module.exports = { setupEnterpriseWeixinHandlers }

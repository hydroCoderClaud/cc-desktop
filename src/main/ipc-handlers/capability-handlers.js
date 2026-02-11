/**
 * Capability Management IPC Handlers
 * 处理 Agent 模式能力管理相关的 IPC 通信
 */

function setupCapabilityHandlers(ipcMain, capabilityManager) {
  if (!capabilityManager) {
    console.warn('[IPC] CapabilityManager not available, skipping capability handlers')
    return
  }

  // 拉取远程能力清单（含组件安装状态检测）
  ipcMain.handle('capabilities:fetch', async () => {
    try {
      return await capabilityManager.fetchCapabilities()
    } catch (err) {
      console.error('[IPC] capabilities:fetch error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取本地能力状态
  ipcMain.handle('capabilities:getState', async () => {
    try {
      return capabilityManager.getState()
    } catch (err) {
      console.error('[IPC] capabilities:getState error:', err)
      return {}
    }
  })

  // 启用能力（安装缺失组件）
  ipcMain.handle('capabilities:enable', async (event, id, capability) => {
    try {
      if (!id || !capability) {
        return { success: false, results: [], errors: ['Invalid parameters'] }
      }
      return await capabilityManager.enableCapability(id, capability)
    } catch (err) {
      console.error('[IPC] capabilities:enable error:', err)
      return { success: false, results: [], errors: [err.message] }
    }
  })

  // 禁用能力（仅标记状态）
  ipcMain.handle('capabilities:disable', async (event, id) => {
    try {
      if (!id) {
        return { success: false, error: 'Invalid capability ID' }
      }
      return await capabilityManager.disableCapability(id)
    } catch (err) {
      console.error('[IPC] capabilities:disable error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Capability handlers registered')
}

module.exports = { setupCapabilityHandlers }

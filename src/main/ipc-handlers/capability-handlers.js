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

  // 安装能力（从 registry 下载组件）
  ipcMain.handle('capabilities:install', async (event, id, capability) => {
    try {
      if (!id || !capability) {
        return { success: false, error: 'Invalid parameters' }
      }
      return await capabilityManager.installCapability(id, capability)
    } catch (err) {
      console.error('[IPC] capabilities:install error:', err)
      return { success: false, error: err.message }
    }
  })

  // 卸载能力（删除组件文件）
  ipcMain.handle('capabilities:uninstall', async (event, id, capability) => {
    try {
      if (!id || !capability) {
        return { success: false, error: 'Invalid parameters' }
      }
      return await capabilityManager.uninstallCapability(id, capability)
    } catch (err) {
      console.error('[IPC] capabilities:uninstall error:', err)
      return { success: false, error: err.message }
    }
  })

  // 启用能力（恢复已禁用组件）
  ipcMain.handle('capabilities:enable', async (event, id, capability) => {
    try {
      if (!id || !capability) {
        return { success: false, error: 'Invalid parameters' }
      }
      return await capabilityManager.enableCapability(id, capability)
    } catch (err) {
      console.error('[IPC] capabilities:enable error:', err)
      return { success: false, error: err.message }
    }
  })

  // 禁用能力（重命名组件文件）
  ipcMain.handle('capabilities:disable', async (event, id, capability) => {
    try {
      if (!id || !capability) {
        return { success: false, error: 'Invalid parameters' }
      }
      return await capabilityManager.disableCapability(id, capability)
    } catch (err) {
      console.error('[IPC] capabilities:disable error:', err)
      return { success: false, error: err.message }
    }
  })

  // 切换单个组件的禁用状态（Developer 模式）
  ipcMain.handle('capabilities:toggleComponent', async (event, type, id, disabled) => {
    try {
      if (!type || !id) {
        return { success: false, error: 'Invalid parameters' }
      }
      return capabilityManager.toggleComponentDisabled(type, id, disabled)
    } catch (err) {
      console.error('[IPC] capabilities:toggleComponent error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Capability handlers registered')
}

module.exports = { setupCapabilityHandlers }

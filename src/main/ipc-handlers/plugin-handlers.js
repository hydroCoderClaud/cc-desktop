/**
 * Plugin Management IPC Handlers
 * 处理插件管理相关的 IPC 通信
 */

const { PluginManager } = require('../plugin-manager')

function setupPluginHandlers(ipcMain) {
  const pluginManager = new PluginManager()

  // 获取插件列表
  ipcMain.handle('plugins:list', async () => {
    try {
      return await pluginManager.listPlugins()
    } catch (err) {
      console.error('[IPC] plugins:list error:', err)
      return []
    }
  })

  // 获取插件详情（含组件）
  ipcMain.handle('plugins:details', async (event, pluginId) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return null
      }
      return await pluginManager.getPluginDetails(pluginId)
    } catch (err) {
      console.error('[IPC] plugins:details error:', err)
      return null
    }
  })

  // 设置插件启用/禁用
  ipcMain.handle('plugins:setEnabled', async (event, pluginId, enabled) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return false
      }
      return await pluginManager.setPluginEnabled(pluginId, !!enabled)
    } catch (err) {
      console.error('[IPC] plugins:setEnabled error:', err)
      return false
    }
  })

  // 打开插件目录
  ipcMain.handle('plugins:openFolder', async () => {
    try {
      return await pluginManager.openPluginsFolder()
    } catch (err) {
      console.error('[IPC] plugins:openFolder error:', err)
      return false
    }
  })

  // 删除插件
  ipcMain.handle('plugins:delete', async (event, pluginId, deleteFiles = true) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return { success: false, error: 'Invalid plugin ID' }
      }
      return await pluginManager.deletePlugin(pluginId, !!deleteFiles)
    } catch (err) {
      console.error('[IPC] plugins:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Plugin handlers registered')
}

module.exports = { setupPluginHandlers }

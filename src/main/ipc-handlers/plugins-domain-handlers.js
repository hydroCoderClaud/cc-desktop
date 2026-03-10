/**
 * Plugins Domain IPC Handlers
 * 插件本体管理（非 Skills/Agents/Hooks/MCP）
 */

const { PluginManager } = require('../plugin-manager')
const { PluginCli } = require('../managers/plugin-cli')
const { shell } = require('electron')

function setupPluginsDomainHandlers(ipcMain) {
  const pluginManager = new PluginManager()
  const pluginCli = new PluginCli()

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

  // 打开 installed_plugins.json 文件
  ipcMain.handle('plugins:openInstalledJson', async () => {
    try {
      const result = await shell.openPath(pluginManager.installedPluginsPath)
      return { success: !result, error: result || undefined }
    } catch (err) {
      console.error('[IPC] plugins:openInstalledJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // 打开 settings.json 文件（查看 enabledPlugins）
  ipcMain.handle('plugins:openSettingsJson', async () => {
    try {
      const result = await shell.openPath(pluginManager.settingsPath)
      return { success: !result, error: result || undefined }
    } catch (err) {
      console.error('[IPC] plugins:openSettingsJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // Plugin CLI Handlers (install/uninstall/update)
  // ========================================

  // 获取已安装 + 可用插件列表
  ipcMain.handle('plugins:cli:listAvailable', async () => {
    return await pluginCli.listAvailable()
  })

  // 安装插件
  ipcMain.handle('plugins:cli:install', async (event, pluginId) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return { success: false, error: 'Invalid plugin ID' }
      }
      return await pluginCli.install(pluginId)
    } catch (err) {
      console.error('[IPC] plugins:cli:install error:', err)
      return { success: false, error: err.message }
    }
  })

  // 卸载插件
  ipcMain.handle('plugins:cli:uninstall', async (event, pluginId) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return { success: false, error: 'Invalid plugin ID' }
      }
      return await pluginCli.uninstall(pluginId)
    } catch (err) {
      console.error('[IPC] plugins:cli:uninstall error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新插件
  ipcMain.handle('plugins:cli:update', async (event, pluginId) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return { success: false, error: 'Invalid plugin ID' }
      }
      return await pluginCli.update(pluginId)
    } catch (err) {
      console.error('[IPC] plugins:cli:update error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取市场列表
  ipcMain.handle('plugins:cli:listMarketplaces', async () => {
    try {
      return await pluginCli.listMarketplaces()
    } catch (err) {
      console.error('[IPC] plugins:cli:listMarketplaces error:', err)
      return { success: false, error: err.message }
    }
  })

  // 添加市场源
  ipcMain.handle('plugins:cli:addMarketplace', async (event, source) => {
    try {
      if (!source || typeof source !== 'string') {
        return { success: false, error: 'Invalid marketplace source' }
      }
      return await pluginCli.addMarketplace(source)
    } catch (err) {
      console.error('[IPC] plugins:cli:addMarketplace error:', err)
      return { success: false, error: err.message }
    }
  })

  // 移除市场源
  ipcMain.handle('plugins:cli:removeMarketplace', async (event, name) => {
    try {
      if (!name || typeof name !== 'string') {
        return { success: false, error: 'Invalid marketplace name' }
      }
      return await pluginCli.removeMarketplace(name)
    } catch (err) {
      console.error('[IPC] plugins:cli:removeMarketplace error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新市场索引
  ipcMain.handle('plugins:cli:updateMarketplace', async (event, name) => {
    try {
      return await pluginCli.updateMarketplace(name || undefined)
    } catch (err) {
      console.error('[IPC] plugins:cli:updateMarketplace error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Plugins domain handlers registered')
}

module.exports = { setupPluginsDomainHandlers }
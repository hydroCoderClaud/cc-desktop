/**
 * Settings IPC Handlers
 * Claude Code Settings 管理（权限 + 环境变量）
 */

const { SettingsManager } = require('../managers')

function setupSettingsHandlers(ipcMain) {
  const settingsManager = new SettingsManager()

  // 获取所有设置（全局 + 项目级）
  ipcMain.handle('settings:getAll', async (event, projectPath) => {
    try {
      return settingsManager.getAllSettings(projectPath || null)
    } catch (err) {
      console.error('[IPC] settings:getAll error:', err)
      return { global: { permissions: { allow: [], deny: [] }, env: {}, filePath: '' }, project: null }
    }
  })

  // 获取权限设置
  ipcMain.handle('settings:getPermissions', async (event, params) => {
    try {
      const { scope, projectPath } = params || {}
      return settingsManager.getPermissions(scope, projectPath)
    } catch (err) {
      console.error('[IPC] settings:getPermissions error:', err)
      return { allow: [], deny: [] }
    }
  })

  // 添加权限规则
  ipcMain.handle('settings:addPermission', async (event, params) => {
    try {
      const { scope, projectPath, type, pattern } = params || {}
      return settingsManager.addPermissionRule(scope, projectPath, type, pattern)
    } catch (err) {
      console.error('[IPC] settings:addPermission error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新权限规则
  ipcMain.handle('settings:updatePermission', async (event, params) => {
    try {
      const { scope, projectPath, type, index, pattern } = params || {}
      return settingsManager.updatePermissionRule(scope, projectPath, type, index, pattern)
    } catch (err) {
      console.error('[IPC] settings:updatePermission error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除权限规则
  ipcMain.handle('settings:removePermission', async (event, params) => {
    try {
      const { scope, projectPath, type, index } = params || {}
      return settingsManager.removePermissionRule(scope, projectPath, type, index)
    } catch (err) {
      console.error('[IPC] settings:removePermission error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取环境变量
  ipcMain.handle('settings:getEnv', async (event, params) => {
    try {
      const { scope, projectPath } = params || {}
      return settingsManager.getEnv(scope, projectPath)
    } catch (err) {
      console.error('[IPC] settings:getEnv error:', err)
      return {}
    }
  })

  // 设置环境变量
  ipcMain.handle('settings:setEnv', async (event, params) => {
    try {
      const { scope, projectPath, key, value } = params || {}
      return settingsManager.setEnv(scope, projectPath, key, value)
    } catch (err) {
      console.error('[IPC] settings:setEnv error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除环境变量
  ipcMain.handle('settings:removeEnv', async (event, params) => {
    try {
      const { scope, projectPath, key } = params || {}
      return settingsManager.removeEnv(scope, projectPath, key)
    } catch (err) {
      console.error('[IPC] settings:removeEnv error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取原始 settings JSON
  ipcMain.handle('settings:getRaw', async (event, params) => {
    try {
      const { scope, projectPath } = params || {}
      return settingsManager.getRawSettings(scope, projectPath)
    } catch (err) {
      console.error('[IPC] settings:getRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  // 保存原始 settings JSON
  ipcMain.handle('settings:saveRaw', async (event, params) => {
    try {
      const { scope, projectPath, data } = params || {}
      return settingsManager.saveRawSettings(scope, projectPath, data)
    } catch (err) {
      console.error('[IPC] settings:saveRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Settings handlers registered')
}

module.exports = { setupSettingsHandlers }
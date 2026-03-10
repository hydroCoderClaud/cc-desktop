/**
 * Hooks IPC Handlers
 * Hooks 管理（全局 + 项目级）
 */

const { HooksManager } = require('../managers')

function setupHooksHandlers(ipcMain) {
  const hooksManager = new HooksManager()

  // 获取全局 Hooks
  ipcMain.handle('hooks:listGlobal', async () => {
    try {
      return await hooksManager.getGlobalHooks()
    } catch (err) {
      console.error('[IPC] hooks:listGlobal error:', err)
      return []
    }
  })

  // 获取项目级 Hooks
  ipcMain.handle('hooks:listProject', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return await hooksManager.getProjectHooks(projectPath)
    } catch (err) {
      console.error('[IPC] hooks:listProject error:', err)
      return []
    }
  })

  // 获取所有 Hooks (全局 + 项目级)
  ipcMain.handle('hooks:listAll', async (event, projectPath) => {
    try {
      return await hooksManager.getAllHooks(projectPath || null)
    } catch (err) {
      console.error('[IPC] hooks:listAll error:', err)
      return []
    }
  })

  // 获取 Hooks Schema
  ipcMain.handle('hooks:getSchema', async () => {
    try {
      return hooksManager.getHooksSchema()
    } catch (err) {
      console.error('[IPC] hooks:getSchema error:', err)
      return { events: [], types: [], typeFields: {} }
    }
  })

  // 创建 Hook
  ipcMain.handle('hooks:create', async (event, params) => {
    try {
      return await hooksManager.createHook(params)
    } catch (err) {
      console.error('[IPC] hooks:create error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新 Hook
  ipcMain.handle('hooks:update', async (event, params) => {
    try {
      return await hooksManager.updateHook(params)
    } catch (err) {
      console.error('[IPC] hooks:update error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除 Hook
  ipcMain.handle('hooks:delete', async (event, params) => {
    try {
      return await hooksManager.deleteHook(params)
    } catch (err) {
      console.error('[IPC] hooks:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // 复制 Hook
  ipcMain.handle('hooks:copy', async (event, params) => {
    try {
      return await hooksManager.copyHook(params)
    } catch (err) {
      console.error('[IPC] hooks:copy error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取 Hooks JSON 原始数据
  ipcMain.handle('hooks:getJson', async (event, params) => {
    try {
      return await hooksManager.getHooksJson(params)
    } catch (err) {
      console.error('[IPC] hooks:getJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // 保存 Hooks JSON 原始数据
  ipcMain.handle('hooks:saveJson', async (event, params) => {
    try {
      return await hooksManager.saveHooksJson(params)
    } catch (err) {
      console.error('[IPC] hooks:saveJson error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Hooks handlers registered')
}

module.exports = { setupHooksHandlers }
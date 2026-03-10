/**
 * Agents IPC Handlers
 * Agents CRUD + 导入导出 + 市场安装
 */

const { AgentsManager } = require('../managers')
const { openComponentFolder } = require('../utils/component-utils')

function setupAgentsHandlers(ipcMain, configManager) {
  const agentsManager = new AgentsManager()

  // ========================================
  // Agents CRUD
  // ========================================

  // 获取用户全局 Agents
  ipcMain.handle('agents:listUser', async () => {
    try {
      return await agentsManager.getUserAgents()
    } catch (err) {
      console.error('[IPC] agents:listUser error:', err)
      return []
    }
  })

  // 获取项目级 Agents
  ipcMain.handle('agents:listProject', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return await agentsManager.getProjectAgents(projectPath)
    } catch (err) {
      console.error('[IPC] agents:listProject error:', err)
      return []
    }
  })

  // 获取插件级 Agents (只读)
  ipcMain.handle('agents:listPlugin', async () => {
    try {
      return await agentsManager.getPluginAgents()
    } catch (err) {
      console.error('[IPC] agents:listPlugin error:', err)
      return []
    }
  })

  // 获取所有 Agents (三级分类)
  ipcMain.handle('agents:listAll', async (event, projectPath) => {
    try {
      return await agentsManager.getAllAgents(projectPath || null)
    } catch (err) {
      console.error('[IPC] agents:listAll error:', err)
      return { user: [], project: [], plugin: [] }
    }
  })

  // 获取 Agent 原始内容
  ipcMain.handle('agents:getRawContent', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.getAgentRawContent(params)
    } catch (err) {
      console.error('[IPC] agents:getRawContent error:', err)
      return { success: false, error: err.message }
    }
  })

  // 创建 Agent（原始内容模式）
  ipcMain.handle('agents:createRaw', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.createAgentRaw(params)
    } catch (err) {
      console.error('[IPC] agents:createRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新 Agent（原始内容模式）
  ipcMain.handle('agents:updateRaw', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.updateAgentRaw(params)
    } catch (err) {
      console.error('[IPC] agents:updateRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除 Agent
  ipcMain.handle('agents:delete', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.deleteAgent(params)
    } catch (err) {
      console.error('[IPC] agents:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // 复制 Agent
  ipcMain.handle('agents:copy', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.copyAgent(params)
    } catch (err) {
      console.error('[IPC] agents:copy error:', err)
      return { success: false, error: err.message }
    }
  })

  // 重命名 Agent
  ipcMain.handle('agents:rename', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.renameAgent(params)
    } catch (err) {
      console.error('[IPC] agents:rename error:', err)
      return { success: false, error: err.message }
    }
  })

  // 打开 Agents 文件夹
  ipcMain.handle('agents:openFolder', async (event, params) => {
    try {
      const { source, projectPath } = params || {}
      return await openComponentFolder(source, projectPath, 'agents')
    } catch (err) {
      console.error('[IPC] agents:openFolder error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // 导入导出
  // ========================================

  // 校验导入源
  ipcMain.handle('agents:validateImport', async (event, sourcePath) => {
    try {
      // sourcePath 可以是字符串（单文件/文件夹/ZIP）或字符串数组（多选文件）
      if (!sourcePath || (typeof sourcePath !== 'string' && !Array.isArray(sourcePath))) {
        return { valid: false, errors: ['Invalid source path'] }
      }
      return await agentsManager.validateAgentImportSource(sourcePath)
    } catch (err) {
      console.error('[IPC] agents:validateImport error:', err)
      return { valid: false, errors: [err.message] }
    }
  })

  // 检测导入冲突
  ipcMain.handle('agents:checkConflicts', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { results: [] }
      }
      return await agentsManager.checkAgentImportConflicts(params)
    } catch (err) {
      console.error('[IPC] agents:checkConflicts error:', err)
      return { results: [] }
    }
  })

  // 导入 Agents
  ipcMain.handle('agents:import', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, errors: ['Invalid parameters'] }
      }
      return await agentsManager.importAgents(params)
    } catch (err) {
      console.error('[IPC] agents:import error:', err)
      return { success: false, errors: [err.message] }
    }
  })

  // 导出单个 Agent
  ipcMain.handle('agents:export', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.exportAgent(params)
    } catch (err) {
      console.error('[IPC] agents:export error:', err)
      return { success: false, error: err.message }
    }
  })

  // 批量导出 Agents
  ipcMain.handle('agents:exportBatch', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      const result = await agentsManager.exportAgentsBatch(params)
      return JSON.parse(JSON.stringify(result))
    } catch (err) {
      console.error('[IPC] agents:exportBatch error:', err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ========================================
  // Agents 市场
  // ========================================

  // 安装市场 Agent
  ipcMain.handle('agents:market:install', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      return await agentsManager.installMarketAgent(params)
    } catch (err) {
      console.error('[IPC] agents:market:install error:', err)
      return { success: false, error: err.message }
    }
  })

  // 强制覆盖安装市场 Agent
  ipcMain.handle('agents:market:installForce', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      return await agentsManager.installMarketAgentForce(params)
    } catch (err) {
      console.error('[IPC] agents:market:installForce error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取已安装的市场 Agents
  ipcMain.handle('agents:market:installed', async () => {
    try {
      return agentsManager.getMarketInstalledAgents()
    } catch (err) {
      console.error('[IPC] agents:market:installed error:', err)
      return []
    }
  })

  // 检查市场 Agents 更新
  ipcMain.handle('agents:market:checkUpdates', async (event, { registryUrl, remoteAgents }) => {
    try {
      return await agentsManager.checkAgentMarketUpdates(registryUrl, remoteAgents)
    } catch (err) {
      console.error('[IPC] agents:market:checkUpdates error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新市场 Agent
  ipcMain.handle('agents:market:update', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      return await agentsManager.updateMarketAgent(params)
    } catch (err) {
      console.error('[IPC] agents:market:update error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Agents handlers registered')
}

module.exports = { setupAgentsHandlers }
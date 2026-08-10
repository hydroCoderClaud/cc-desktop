/**
 * MCP IPC Handlers
 * MCP 四级管理 + 市场安装 + 批量代理
 */

const { McpManager, SettingsManager } = require('../managers')
const { notifyMcpChanged } = require('../utils/mcp-change-notifier')

function setupMcpHandlers(ipcMain, configManager) {
  const mcpManager = new McpManager()
  const settingsManager = new SettingsManager()

  // 注入 configManager 到 mcpManager（供代理注入使用）
  if (configManager) {
    mcpManager.configManager = configManager
  }
  // 注入 settingsManager 到 mcpManager（供 MCP 安装时自动写入工具权限）
  mcpManager.settingsManager = settingsManager

  // ========================================
  // MCP 四级列表
  // ========================================

  // 获取所有 MCP (四级分类)
  ipcMain.handle('mcp:listAll', async (event, projectPath) => {
    try {
      return mcpManager.listMcpAll(projectPath || null)
    } catch (err) {
      console.error('[IPC] mcp:listAll error:', err)
      return { user: [], local: [], project: [], plugin: [] }
    }
  })

  // 获取 User scope MCP
  ipcMain.handle('mcp:listUser', async () => {
    try {
      return mcpManager.listMcpUser()
    } catch (err) {
      console.error('[IPC] mcp:listUser error:', err)
      return []
    }
  })

  // 获取 Local scope MCP
  ipcMain.handle('mcp:listLocal', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return mcpManager.listMcpLocal(projectPath)
    } catch (err) {
      console.error('[IPC] mcp:listLocal error:', err)
      return []
    }
  })

  // 获取 Project scope MCP
  ipcMain.handle('mcp:listProject', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return mcpManager.listMcpProject(projectPath)
    } catch (err) {
      console.error('[IPC] mcp:listProject error:', err)
      return []
    }
  })

  // 获取 Plugin scope MCP (只读)
  ipcMain.handle('mcp:listPlugin', async () => {
    try {
      return mcpManager.listMcpPlugin()
    } catch (err) {
      console.error('[IPC] mcp:listPlugin error:', err)
      return []
    }
  })

  // ========================================
  // MCP CRUD
  // ========================================

  // 创建 MCP
  ipcMain.handle('mcp:create', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      const result = mcpManager.createMcp(params)
      if (result?.success) {
        notifyMcpChanged({
          action: 'created',
          scope: params.scope,
          name: params.name
        })
      }
      return result
    } catch (err) {
      console.error('[IPC] mcp:create error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新 MCP
  ipcMain.handle('mcp:update', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      const result = mcpManager.updateMcp(params)
      if (result?.success) {
        notifyMcpChanged({
          action: 'updated',
          scope: params.scope,
          oldName: params.oldName,
          name: params.name
        })
      }
      return result
    } catch (err) {
      console.error('[IPC] mcp:update error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除 MCP
  ipcMain.handle('mcp:delete', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      const result = mcpManager.deleteMcp(params)
      if (result?.success) {
        notifyMcpChanged({
          action: 'removed',
          scope: params.scope,
          name: params.name
        })
      }
      return result
    } catch (err) {
      console.error('[IPC] mcp:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // MCP 市场
  // ========================================

  // 预览市场 MCP 配置（不写入文件，仅返回解析结果）
  ipcMain.handle('mcps:market:previewConfig', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      return await mcpManager.previewMarketMcpConfig(params)
    } catch (err) {
      console.error('[IPC] mcps:market:previewConfig error:', err)
      return { success: false, error: err.message }
    }
  })

  // 安装市场 MCP
  ipcMain.handle('mcps:market:install', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      const result = await mcpManager.installMarketMcp(params)
      if (result?.success) {
        notifyMcpChanged({
          action: 'installed',
          name: params.componentId || params.id || params.name || null
        })
      }
      return result
    } catch (err) {
      console.error('[IPC] mcps:market:install error:', err)
      return { success: false, error: err.message }
    }
  })

  // 强制覆盖安装市场 MCP
  ipcMain.handle('mcps:market:installForce', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      const result = await mcpManager.installMarketMcpForce(params)
      if (result?.success) {
        notifyMcpChanged({
          action: 'installed',
          name: params.componentId || params.id || params.name || null,
          force: true
        })
      }
      return result
    } catch (err) {
      console.error('[IPC] mcps:market:installForce error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新市场 MCP
  ipcMain.handle('mcps:market:update', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      const result = await mcpManager.updateMarketMcp(params)
      if (result?.success) {
        notifyMcpChanged({
          action: 'updated',
          name: params.componentId || params.id || params.name || null,
          market: true
        })
      }
      return result
    } catch (err) {
      console.error('[IPC] mcps:market:update error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // MCP 批量代理
  // ========================================

  ipcMain.handle('mcps:applyProxyToAll', async (event, proxyConfig) => {
    try {
      return mcpManager.applyProxyToAllMcps(proxyConfig)
    } catch (err) {
      console.error('[IPC] mcps:applyProxyToAll error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] MCP handlers registered')
}

module.exports = { setupMcpHandlers }

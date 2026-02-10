/**
 * 配置相关 IPC 处理器
 * 包含 Config、API Profile、全局设置、服务商定义等
 */

const { createIPCHandler, createSyncIPCHandler } = require('../utils/ipc-utils')

/**
 * 设置配置相关的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {ConfigManager} configManager - ConfigManager instance
 */
function setupConfigHandlers(ipcMain, configManager) {
  // Helper for creating handlers with configManager context
  const registerHandler = (channel, handler) => createIPCHandler(ipcMain, channel, handler)

  // ========================================
  // 同步配置获取（用于 preload 避免闪白）
  // ========================================

  ipcMain.on('theme:getSync', (event) => {
    const config = configManager.getConfig()
    event.returnValue = config?.settings?.theme || 'light'
  })

  ipcMain.on('locale:getSync', (event) => {
    const config = configManager.getConfig()
    event.returnValue = config?.settings?.locale || 'zh-CN'
  })

  // ========================================
  // 设置变更广播（跨窗口同步）
  // ========================================

  ipcMain.on('settings:broadcast', (event, settings) => {
    const { BrowserWindow } = require('electron')
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:changed', settings)
      }
    })
  })

  // ========================================
  // 基础配置
  // ========================================

  registerHandler('config:get', () => {
    return configManager.getConfig()
  })

  registerHandler('config:save', (config) => {
    return configManager.updateConfig(config)
  })

  registerHandler('settings:update', (settings) => {
    return configManager.updateSettings(settings)
  })

  registerHandler('config:getPath', () => {
    return configManager.getConfigPath()
  })

  // ========================================
  // API 配置
  // ========================================

  registerHandler('api:getConfig', () => {
    return configManager.getAPIConfig()
  })

  registerHandler('api:updateConfig', (apiConfig) => {
    return configManager.updateAPIConfig(apiConfig)
  })

  registerHandler('api:validate', () => {
    return configManager.validateAPIConfig()
  })

  registerHandler('api:testConnection', (apiConfig) => {
    return configManager.testAPIConnection(apiConfig)
  })

  // ========================================
  // API Profile 管理
  // ========================================

  registerHandler('api:listProfiles', () => {
    return configManager.getAPIProfiles()
  })

  registerHandler('api:getProfile', (profileId) => {
    return configManager.getAPIProfile(profileId)
  })

  registerHandler('api:addProfile', (profileData) => {
    return configManager.addAPIProfile(profileData)
  })

  registerHandler('api:updateProfile', ({ profileId, updates }) => {
    return configManager.updateAPIProfile(profileId, updates)
  })

  registerHandler('api:deleteProfile', (profileId) => {
    return configManager.deleteAPIProfile(profileId)
  })

  registerHandler('api:setDefault', (profileId) => {
    return configManager.setDefaultProfile(profileId)
  })

  registerHandler('api:getCurrentProfile', () => {
    return configManager.getDefaultProfile()
  })

  // ========================================
  // 全局设置
  // ========================================

  registerHandler('config:getServiceProviders', () => {
    return configManager.getServiceProviders()
  })

  // 组件市场配置
  registerHandler('config:getMarketConfig', () => {
    return configManager.getMarketConfig()
  })

  registerHandler('config:updateMarketConfig', (marketConfig) => {
    return configManager.updateMarketConfig(marketConfig)
  })

  registerHandler('config:getTimeout', () => {
    return configManager.getTimeout()
  })

  registerHandler('config:updateTimeout', (timeout) => {
    return configManager.updateTimeout(timeout)
  })

  registerHandler('config:getMaxActiveSessions', () => {
    return configManager.getMaxActiveSessions()
  })

  registerHandler('config:updateMaxActiveSessions', (maxActiveSessions) => {
    return configManager.updateMaxActiveSessions(maxActiveSessions)
  })

  registerHandler('config:getMaxHistorySessions', () => {
    return configManager.getMaxHistorySessions()
  })

  registerHandler('config:updateMaxHistorySessions', (maxHistorySessions) => {
    return configManager.updateMaxHistorySessions(maxHistorySessions)
  })

  // 自动压缩阈值 (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)
  registerHandler('config:getAutocompactPctOverride', () => {
    return configManager.getAutocompactPctOverride()
  })

  registerHandler('config:updateAutocompactPctOverride', (value) => {
    return configManager.updateAutocompactPctOverride(value)
  })

  registerHandler('config:getTerminalSettings', () => {
    return configManager.getTerminalSettings()
  })

  registerHandler('config:updateTerminalSettings', (terminalSettings) => {
    return configManager.updateTerminalSettings(terminalSettings)
  })

  // ========================================
  // 自定义模型管理
  // ========================================

  registerHandler('api:getCustomModels', (profileId) => {
    const profile = configManager.getAPIProfile(profileId)
    return profile?.customModels || []
  })

  registerHandler('api:updateCustomModels', ({ profileId, models }) => {
    const profile = configManager.getAPIProfile(profileId)
    if (!profile) {
      throw new Error('Profile 不存在')
    }
    profile.customModels = models
    return configManager.save()
  })

  registerHandler('api:addCustomModel', ({ profileId, model }) => {
    return configManager.addCustomModel(profileId, model)
  })

  registerHandler('api:deleteCustomModel', ({ profileId, modelId }) => {
    return configManager.deleteCustomModel(profileId, modelId)
  })

  registerHandler('api:updateCustomModel', ({ profileId, modelId, updates }) => {
    return configManager.updateCustomModel(profileId, modelId, updates)
  })

  // ========================================
  // 服务商定义管理
  // ========================================

  registerHandler('provider:list', () => {
    return configManager.getServiceProviderDefinitions()
  })

  registerHandler('provider:get', (id) => {
    return configManager.getServiceProviderDefinition(id)
  })

  registerHandler('provider:add', (definition) => {
    return configManager.addServiceProviderDefinition(definition)
  })

  registerHandler('provider:update', ({ id, updates }) => {
    return configManager.updateServiceProviderDefinition(id, updates)
  })

  registerHandler('provider:delete', (id) => {
    return configManager.deleteServiceProviderDefinition(id)
  })

  // ========================================
  // AI 助手配置
  // ========================================

  registerHandler('aiAssistant:getConfig', () => {
    return configManager.getAIAssistantConfig()
  })

  registerHandler('aiAssistant:updateConfig', (config) => {
    return configManager.updateAIAssistantConfig(config)
  })

  // ========================================
  // 快捷命令管理
  // ========================================

  registerHandler('quickCommands:list', () => {
    return configManager.getQuickCommands()
  })

  registerHandler('quickCommands:add', (command) => {
    return configManager.addQuickCommand(command)
  })

  registerHandler('quickCommands:update', ({ id, name, command, color }) => {
    return configManager.updateQuickCommand(id, { name, command, color })
  })

  registerHandler('quickCommands:delete', (id) => {
    return configManager.deleteQuickCommand(id)
  })
}

module.exports = { setupConfigHandlers }

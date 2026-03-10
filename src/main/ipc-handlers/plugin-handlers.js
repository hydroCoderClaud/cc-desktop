/**
 * Plugin Management IPC Handlers - 入口
 * 聚合所有组件管理相关的 IPC 处理器
 *
 * 拆分后的模块结构：
 * - plugins-domain-handlers.js: plugins:* + plugins:cli:*
 * - skills-handlers.js: skills:* + skills:market:*
 * - agents-handlers.js: agents:* + agents:market:*
 * - hooks-handlers.js: hooks:*
 * - mcp-handlers.js: mcp:* + mcps:*
 * - settings-handlers.js: settings:*
 * - file-handlers.js: file:*
 */

const { setupPluginsDomainHandlers } = require('./plugins-domain-handlers')
const { setupSkillsHandlers } = require('./skills-handlers')
const { setupAgentsHandlers } = require('./agents-handlers')
const { setupHooksHandlers } = require('./hooks-handlers')
const { setupMcpHandlers } = require('./mcp-handlers')
const { setupSettingsHandlers } = require('./settings-handlers')
const { setupFileHandlers } = require('./file-handlers')

function setupPluginHandlers(ipcMain, configManager) {
  setupPluginsDomainHandlers(ipcMain)
  setupSkillsHandlers(ipcMain, configManager)
  setupAgentsHandlers(ipcMain, configManager)
  setupHooksHandlers(ipcMain)
  setupMcpHandlers(ipcMain, configManager)
  setupSettingsHandlers(ipcMain)
  setupFileHandlers(ipcMain)

  console.log('[IPC] Plugin handlers registered')
}

module.exports = { setupPluginHandlers }
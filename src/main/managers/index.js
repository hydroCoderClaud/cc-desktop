/**
 * Component Managers Index
 * 统一导出所有组件管理器
 */

const { SkillsManager } = require('./skills-manager')
const { AgentsManager } = require('./agents')
const { HooksManager } = require('./hooks-manager')
const { McpManager } = require('./mcp-manager')
const { SettingsManager } = require('./settings-manager')

module.exports = {
  SkillsManager,
  AgentsManager,
  HooksManager,
  McpManager,
  SettingsManager
}

/**
 * Component Managers Index
 * 统一导出所有组件管理器
 */

const { SkillsManager } = require('./skills-manager')
const { CommandsManager } = require('./commands-manager')
const { AgentsManager } = require('./agents-manager')
const { HooksManager } = require('./hooks-manager')
const { McpManager } = require('./mcp-manager')

module.exports = {
  SkillsManager,
  CommandsManager,
  AgentsManager,
  HooksManager,
  McpManager
}

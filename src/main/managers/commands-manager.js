/**
 * Commands Manager - 命令管理
 *
 * 调用方式: /plugin-name:command-name (全局) 或 /command-name (项目级)
 * 全局来源: 插件 commands/ 目录
 * 项目级别: .claude/commands/ 目录
 */

const path = require('path')
const { ComponentScanner } = require('../component-scanner')

class CommandsManager extends ComponentScanner {
  constructor() {
    super()
  }

  /**
   * 获取全局 Commands (来自已安装插件)
   * @returns {Array} Commands 列表
   */
  async getGlobalCommands() {
    const plugins = this.getEnabledPluginPaths()
    const allCommands = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const commandsDir = path.join(installPath, 'commands')
      const commands = this.scanMarkdownFiles(commandsDir)

      for (const cmd of commands) {
        allCommands.push({
          id: cmd.name,
          name: cmd.frontmatter?.name || cmd.name,
          description: cmd.frontmatter?.description || '',
          // 完整调用名称: plugin-name:command-name
          fullName: `${pluginShortName}:${cmd.name}`,
          // 来源信息
          source: 'plugin',
          pluginId,
          pluginShortName,
          filePath: cmd.filePath,
          category: pluginShortName // 使用插件名作为分类
        })
      }
    }

    // 按插件名排序
    allCommands.sort((a, b) => a.pluginShortName.localeCompare(b.pluginShortName))
    return allCommands
  }

  /**
   * 获取项目级 Commands (来自 .claude/commands/ 目录)
   * @param {string} projectPath - 项目根目录
   * @returns {Array} Commands 列表
   */
  async getProjectCommands(projectPath) {
    if (!projectPath) return []

    const commandsDir = path.join(this.getProjectClaudeDir(projectPath), 'commands')
    const commands = this.scanMarkdownFiles(commandsDir)

    return commands.map(cmd => ({
      id: cmd.name,
      name: cmd.frontmatter?.name || cmd.name,
      description: cmd.frontmatter?.description || '',
      // 项目级 command 格式: 直接使用 command 名
      fullName: cmd.name,
      // 来源信息
      source: 'project',
      projectPath,
      filePath: cmd.filePath,
      category: '项目命令'
    }))
  }

  /**
   * 获取所有 Commands (全局 + 项目级)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Array} Commands 列表
   */
  async getAllCommands(projectPath = null) {
    const globalCommands = await this.getGlobalCommands()

    if (!projectPath) {
      return globalCommands
    }

    const projectCommands = await this.getProjectCommands(projectPath)

    // 项目级在前，全局在后
    return [...projectCommands, ...globalCommands]
  }
}

module.exports = { CommandsManager }

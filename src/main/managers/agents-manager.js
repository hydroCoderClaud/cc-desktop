/**
 * Agents Manager - 代理管理
 *
 * 调用方式: 自动触发 (Claude 根据 description 自动选择)
 * 全局来源: 插件 agents/ 目录
 * 项目级别: .claude/agents/ 目录
 *
 * 注意: Agents 不需要用户手动调用，由 Claude 根据 description 中的触发条件自动选择
 */

const path = require('path')
const { ComponentScanner } = require('../component-scanner')

class AgentsManager extends ComponentScanner {
  constructor() {
    super()
  }

  /**
   * 获取全局 Agents (来自已安装插件)
   * @returns {Array} Agents 列表
   */
  async getGlobalAgents() {
    const plugins = this.getEnabledPluginPaths()
    const allAgents = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const agentsDir = path.join(installPath, 'agents')
      const agents = this.scanMarkdownFiles(agentsDir)

      for (const agent of agents) {
        allAgents.push({
          name: agent.frontmatter?.name || agent.name,
          description: agent.frontmatter?.description || '',
          model: agent.frontmatter?.model || 'inherit',
          color: agent.frontmatter?.color || 'blue',
          // 完整名称: plugin-name:agent-name
          fullName: `${pluginShortName}:${agent.name}`,
          // 来源信息
          source: 'plugin',
          pluginId,
          pluginShortName,
          category: pluginShortName,
          // 调用方式标记
          invocationType: 'auto' // 自动触发
        })
      }
    }

    // 按插件名排序
    allAgents.sort((a, b) => a.pluginShortName.localeCompare(b.pluginShortName))
    return allAgents
  }

  /**
   * 获取项目级 Agents
   * @param {string} projectPath - 项目根目录
   * @returns {Array} Agents 列表
   */
  async getProjectAgents(projectPath) {
    if (!projectPath) return []

    const agentsDir = path.join(this.getProjectClaudeDir(projectPath), 'agents')
    const agents = this.scanMarkdownFiles(agentsDir)

    return agents.map(agent => ({
      name: agent.frontmatter?.name || agent.name,
      description: agent.frontmatter?.description || '',
      model: agent.frontmatter?.model || 'inherit',
      color: agent.frontmatter?.color || 'blue',
      // 项目级名称
      fullName: agent.name,
      // 来源信息
      source: 'project',
      projectPath,
      category: '项目代理',
      // 调用方式标记
      invocationType: 'auto' // 自动触发
    }))
  }

  /**
   * 获取所有 Agents (全局 + 项目级)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Array} Agents 列表
   */
  async getAllAgents(projectPath = null) {
    const globalAgents = await this.getGlobalAgents()

    if (!projectPath) {
      return globalAgents
    }

    const projectAgents = await this.getProjectAgents(projectPath)

    // 项目级在前，全局在后
    return [...projectAgents, ...globalAgents]
  }
}

module.exports = { AgentsManager }

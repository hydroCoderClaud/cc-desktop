/**
 * MCP Manager - MCP 服务器管理
 *
 * 调用方式: 自动加载 (Claude Code 启动时加载 MCP 服务器)
 * 全局来源: 插件 .mcp.json
 * 项目级别: 项目根目录 .mcp.json
 *
 * 注意: MCP 服务器不需要用户手动调用，由 Claude Code 启动时自动加载
 */

const path = require('path')
const { ComponentScanner } = require('../component-scanner')

class McpManager extends ComponentScanner {
  constructor() {
    super()
  }

  /**
   * 解析 .mcp.json 配置
   * @param {Object} mcpConfig - MCP 配置对象
   * @param {string} source - 来源标识
   * @param {Object} sourceInfo - 额外来源信息
   * @returns {Array}
   */
  _parseMcpConfig(mcpConfig, source, sourceInfo = {}) {
    if (!mcpConfig) return []

    const mcpServers = []
    for (const [name, config] of Object.entries(mcpConfig)) {
      mcpServers.push({
        name,
        command: config.command || '',
        args: config.args || [],
        env: config.env || {},
        source,
        ...sourceInfo,
        // 调用方式标记
        invocationType: 'auto' // 自动加载
      })
    }

    return mcpServers
  }

  /**
   * 获取插件 MCP (来自已安装插件)
   * @returns {Array} MCP 服务器列表
   */
  async getGlobalMcp() {
    const plugins = this.getEnabledPluginPaths()
    const allMcp = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const mcpJsonPath = path.join(installPath, '.mcp.json')
      const mcpConfig = this.readJsonFile(mcpJsonPath)

      if (mcpConfig) {
        const mcpServers = this._parseMcpConfig(mcpConfig, 'plugin', {
          pluginId,
          pluginShortName,
          category: pluginShortName
        })
        allMcp.push(...mcpServers)
      }
    }

    return allMcp
  }

  /**
   * 获取项目级 MCP
   * @param {string} projectPath - 项目根目录
   * @returns {Array} MCP 服务器列表
   */
  async getProjectMcp(projectPath) {
    if (!projectPath) return []

    // 项目级 .mcp.json 在项目根目录
    const mcpJsonPath = path.join(projectPath, '.mcp.json')
    const mcpConfig = this.readJsonFile(mcpJsonPath)

    if (!mcpConfig) return []

    return this._parseMcpConfig(mcpConfig, 'project', {
      projectPath,
      category: '项目 MCP'
    })
  }

  /**
   * 获取所有 MCP (全局 + 项目级)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Array} MCP 服务器列表
   */
  async getAllMcp(projectPath = null) {
    const globalMcp = await this.getGlobalMcp()

    if (!projectPath) {
      return globalMcp
    }

    const projectMcp = await this.getProjectMcp(projectPath)

    // 项目级在前，全局在后
    return [...projectMcp, ...globalMcp]
  }
}

module.exports = { McpManager }

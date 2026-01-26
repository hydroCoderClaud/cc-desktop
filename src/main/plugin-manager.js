/**
 * Claude Code Plugin Manager
 * 管理 Claude Code CLI 的插件，读取、解析、启用/禁用
 *
 * 重构说明:
 * - 插件级别操作保留在此 (list, enable/disable, delete)
 * - 组件扫描委托给各个 Manager (Skills, Agents, Hooks, MCP)
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { shell } = require('electron')
const { ComponentScanner } = require('./component-scanner')
const {
  SkillsManager,
  AgentsManager,
  HooksManager,
  McpManager
} = require('./managers')

class PluginManager extends ComponentScanner {
  constructor() {
    super()
    // 初始化组件管理器
    this.skillsManager = new SkillsManager()
    this.agentsManager = new AgentsManager()
    this.hooksManager = new HooksManager()
    this.mcpManager = new McpManager()
  }

  /**
   * 获取已安装插件列表
   * @returns {Array} 插件列表
   */
  async listPlugins() {
    try {
      const installedPlugins = this._readInstalledPlugins()
      if (!installedPlugins || !installedPlugins.plugins) {
        return []
      }

      const enabledPlugins = this._readEnabledPlugins()
      const plugins = []

      for (const [pluginId, installations] of Object.entries(installedPlugins.plugins)) {
        const installation = installations[0]
        if (!installation || !installation.installPath) continue

        const pluginJson = this._readPluginJson(installation.installPath)
        const [name, marketplace] = pluginId.split('@')

        plugins.push({
          id: pluginId,
          name: pluginJson?.name || name,
          description: pluginJson?.description || '',
          version: installation.version || 'unknown',
          enabled: enabledPlugins[pluginId] !== false,
          installPath: installation.installPath,
          marketplace: marketplace || 'unknown',
          installedAt: installation.installedAt,
          author: pluginJson?.author?.name || pluginJson?.author || ''
        })
      }

      plugins.sort((a, b) => a.name.localeCompare(b.name))
      return plugins
    } catch (err) {
      console.error('[PluginManager] Failed to list plugins:', err)
      return []
    }
  }

  /**
   * 获取插件详情（含组件列表）
   * @param {string} pluginId - 插件 ID (plugin-name@marketplace)
   * @returns {Object|null} 插件详情
   */
  async getPluginDetails(pluginId) {
    try {
      const installedPlugins = this._readInstalledPlugins()
      const installations = installedPlugins?.plugins?.[pluginId]
      if (!installations || installations.length === 0) {
        return null
      }

      const installation = installations[0]
      const installPath = installation.installPath
      const pluginJson = this._readPluginJson(installPath)
      const enabledPlugins = this._readEnabledPlugins()
      const [name, marketplace] = pluginId.split('@')

      // 使用组件管理器扫描各类组件
      const components = {
        commands: await this._scanPluginCommands(installPath),
        agents: await this._scanPluginAgents(installPath),
        skills: await this._scanPluginSkills(installPath),
        hooks: await this._scanPluginHooks(installPath),
        mcp: await this._scanPluginMcp(installPath)
      }

      return {
        id: pluginId,
        name: pluginJson?.name || name,
        description: pluginJson?.description || '',
        version: installation.version || 'unknown',
        enabled: enabledPlugins[pluginId] !== false,
        installPath,
        marketplace: marketplace || 'unknown',
        installedAt: installation.installedAt,
        author: pluginJson?.author?.name || pluginJson?.author || '',
        components
      }
    } catch (err) {
      console.error('[PluginManager] Failed to get plugin details:', err)
      return null
    }
  }

  /**
   * 设置插件启用/禁用状态
   */
  async setPluginEnabled(pluginId, enabled) {
    try {
      const settings = this._readSettings()
      if (!settings.enabledPlugins) {
        settings.enabledPlugins = {}
      }
      settings.enabledPlugins[pluginId] = enabled
      this._writeSettings(settings)
      console.log(`[PluginManager] Set plugin ${pluginId} enabled: ${enabled}`)
      return true
    } catch (err) {
      console.error('[PluginManager] Failed to set plugin enabled:', err)
      return false
    }
  }

  /**
   * 获取所有插件的 Skills 聚合列表
   * @deprecated 使用 SkillsManager.getGlobalSkills() 代替
   */
  async getAllSkills() {
    return this.skillsManager.getGlobalSkills()
  }

  /**
   * 打开插件目录
   */
  async openPluginsFolder() {
    try {
      await shell.openPath(this.pluginsDir)
      return true
    } catch (err) {
      console.error('[PluginManager] Failed to open plugins folder:', err)
      return false
    }
  }

  // ========================================
  // 私有方法：文件读写
  // ========================================

  _writeSettings(settings) {
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  _readPluginJson(installPath) {
    try {
      const pluginJsonPath = path.join(installPath, '.claude-plugin', 'plugin.json')
      if (!fs.existsSync(pluginJsonPath)) {
        return null
      }
      const content = fs.readFileSync(pluginJsonPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      return null
    }
  }

  // ========================================
  // 私有方法：单个插件的组件扫描
  // 用于 getPluginDetails()
  // ========================================

  async _scanPluginCommands(installPath) {
    const commandsDir = path.join(installPath, 'commands')
    const commands = this.scanMarkdownFiles(commandsDir)
    return commands.map(cmd => ({
      name: cmd.name,
      description: cmd.frontmatter?.description || '',
      argumentHint: cmd.frontmatter?.['argument-hint'] || '',
      filePath: cmd.filePath || path.join(commandsDir, `${cmd.name}.md`)
    }))
  }

  async _scanPluginAgents(installPath) {
    const agentsDir = path.join(installPath, 'agents')
    const agents = this.scanMarkdownFiles(agentsDir)
    return agents.map(agent => ({
      name: agent.frontmatter?.name || agent.name,
      description: agent.frontmatter?.description || '',
      filePath: agent.filePath || path.join(agentsDir, `${agent.name}.md`)
    }))
  }

  async _scanPluginSkills(installPath) {
    const skillsDir = path.join(installPath, 'skills')
    const skills = this.scanSkillDirectories(skillsDir)
    return skills.map(skill => ({
      id: skill.id,
      name: skill.frontmatter?.name || skill.id,
      description: skill.frontmatter?.description || '',
      filePath: skill.filePath || path.join(skillsDir, skill.id, `${skill.id}.md`)
    }))
  }

  async _scanPluginHooks(installPath) {
    const hooksJsonPath = path.join(installPath, 'hooks', 'hooks.json')
    const hooksConfig = this.readJsonFile(hooksJsonPath)
    if (!hooksConfig) return []

    const hooks = []
    const hooksObj = hooksConfig.hooks || hooksConfig

    for (const [event, handlers] of Object.entries(hooksObj)) {
      if (event === 'description') continue
      if (!Array.isArray(handlers)) continue

      for (const handler of handlers) {
        hooks.push({
          event,
          matcher: handler.matcher || '',
          type: handler.hooks?.[0]?.type || handler.type || 'unknown',
          filePath: hooksJsonPath
        })
      }
    }
    return hooks
  }

  async _scanPluginMcp(installPath) {
    const mcpJsonPath = path.join(installPath, '.mcp.json')
    const mcpConfig = this.readJsonFile(mcpJsonPath)
    if (!mcpConfig) return []

    // 支持两种格式：
    // 1. { "mcpServers": { "name": { config } } }
    // 2. { "name": { config } }
    const servers = mcpConfig.mcpServers || mcpConfig

    const mcpServers = []
    for (const [name, config] of Object.entries(servers)) {
      // 跳过非对象值（如 mcpServers 本身是 key 但被遍历到）
      if (typeof config !== 'object' || config === null) continue

      mcpServers.push({
        name,
        command: config.command || '',
        args: config.args || [],
        type: config.type || '',
        url: config.url || '',
        config,  // 保存完整配置用于编辑
        filePath: mcpJsonPath
      })
    }
    return mcpServers
  }
}

module.exports = { PluginManager }

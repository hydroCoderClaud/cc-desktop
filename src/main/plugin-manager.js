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

  /**
   * 删除插件
   */
  async deletePlugin(pluginId, deleteFiles = true) {
    try {
      const installedPlugins = this._readInstalledPlugins()

      if (!installedPlugins.plugins || !installedPlugins.plugins[pluginId]) {
        return { success: false, error: '插件不存在' }
      }

      const installations = installedPlugins.plugins[pluginId]
      const installPaths = installations.map(i => i.installPath).filter(Boolean)

      delete installedPlugins.plugins[pluginId]
      this._writeInstalledPlugins(installedPlugins)

      const settings = this._readSettings()
      if (settings.enabledPlugins && settings.enabledPlugins[pluginId] !== undefined) {
        delete settings.enabledPlugins[pluginId]
        this._writeSettings(settings)
      }

      if (deleteFiles) {
        for (const installPath of installPaths) {
          if (!installPath || !this._isPathSafe(installPath)) {
            console.warn(`[PluginManager] Skipping unsafe path: ${installPath}`)
            continue
          }
          if (fs.existsSync(installPath)) {
            try {
              fs.rmSync(installPath, { recursive: true, force: true })
              console.log(`[PluginManager] Deleted plugin files: ${installPath}`)
            } catch (err) {
              console.warn(`[PluginManager] Failed to delete plugin files: ${installPath}`, err.message)
            }
          }
        }
      }

      console.log(`[PluginManager] Plugin ${pluginId} deleted successfully`)
      return { success: true }
    } catch (err) {
      console.error('[PluginManager] Failed to delete plugin:', err)
      return { success: false, error: err.message }
    }
  }

  // ========================================
  // 私有方法：文件读写
  // ========================================

  _writeInstalledPlugins(data) {
    fs.writeFileSync(this.installedPluginsPath, JSON.stringify(data, null, 2), 'utf-8')
  }

  _writeSettings(settings) {
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  _isPathSafe(targetPath) {
    try {
      const normalizedTarget = path.resolve(targetPath)
      const normalizedPlugins = path.resolve(this.pluginsDir)
      return normalizedTarget.startsWith(normalizedPlugins + path.sep)
    } catch {
      return false
    }
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
      argumentHint: cmd.frontmatter?.['argument-hint'] || ''
    }))
  }

  async _scanPluginAgents(installPath) {
    const agentsDir = path.join(installPath, 'agents')
    const agents = this.scanMarkdownFiles(agentsDir)
    return agents.map(agent => ({
      name: agent.frontmatter?.name || agent.name,
      description: agent.frontmatter?.description || ''
    }))
  }

  async _scanPluginSkills(installPath) {
    const skillsDir = path.join(installPath, 'skills')
    const skills = this.scanSkillDirectories(skillsDir)
    return skills.map(skill => ({
      id: skill.id,
      name: skill.frontmatter?.name || skill.id,
      description: skill.frontmatter?.description || ''
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
          type: handler.hooks?.[0]?.type || handler.type || 'unknown'
        })
      }
    }
    return hooks
  }

  async _scanPluginMcp(installPath) {
    const mcpJsonPath = path.join(installPath, '.mcp.json')
    const mcpConfig = this.readJsonFile(mcpJsonPath)
    if (!mcpConfig) return []

    const mcpServers = []
    for (const [name, config] of Object.entries(mcpConfig)) {
      mcpServers.push({
        name,
        command: config.command || '',
        args: config.args || []
      })
    }
    return mcpServers
  }
}

module.exports = { PluginManager }

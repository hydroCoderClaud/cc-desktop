/**
 * Claude Code Plugin Manager
 * 管理 Claude Code CLI 的插件，读取、解析、启用/禁用
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { shell } = require('electron')

class PluginManager {
  constructor() {
    // Claude Code 配置目录
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.pluginsDir = path.join(this.claudeDir, 'plugins')
    this.installedPluginsPath = path.join(this.pluginsDir, 'installed_plugins.json')
    this.settingsPath = path.join(this.claudeDir, 'settings.json')
  }

  /**
   * 获取已安装插件列表
   * @returns {Array} 插件列表
   */
  async listPlugins() {
    try {
      // 读取已安装插件注册表
      const installedPlugins = this._readInstalledPlugins()
      if (!installedPlugins || !installedPlugins.plugins) {
        return []
      }

      // 读取启用状态
      const enabledPlugins = this._readEnabledPlugins()

      const plugins = []

      for (const [pluginId, installations] of Object.entries(installedPlugins.plugins)) {
        // 取最新安装（数组第一个）
        const installation = installations[0]
        if (!installation || !installation.installPath) continue

        // 解析插件清单
        const pluginJson = this._readPluginJson(installation.installPath)

        // 解析 pluginId: "plugin-name@marketplace"
        const [name, marketplace] = pluginId.split('@')

        plugins.push({
          id: pluginId,
          name: pluginJson?.name || name,
          description: pluginJson?.description || '',
          version: installation.version || 'unknown',
          enabled: enabledPlugins[pluginId] !== false, // 默认启用
          installPath: installation.installPath,
          marketplace: marketplace || 'unknown',
          installedAt: installation.installedAt,
          author: pluginJson?.author?.name || pluginJson?.author || ''
        })
      }

      // 按名称排序
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

      // 基本信息
      const pluginJson = this._readPluginJson(installPath)
      const enabledPlugins = this._readEnabledPlugins()
      const [name, marketplace] = pluginId.split('@')

      // 扫描组件
      const components = {
        commands: this._scanCommands(installPath),
        agents: this._scanAgents(installPath),
        skills: this._scanSkills(installPath),
        hooks: this._scanHooks(installPath),
        mcp: this._scanMcp(installPath)
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
   * @param {string} pluginId - 插件 ID
   * @param {boolean} enabled - 是否启用
   * @returns {boolean} 是否成功
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
   * @param {string} pluginId - 插件 ID (plugin-name@marketplace)
   * @param {boolean} deleteFiles - 是否同时删除插件文件
   * @returns {Object} { success, error? }
   */
  async deletePlugin(pluginId, deleteFiles = true) {
    try {
      const installedPlugins = this._readInstalledPlugins()

      if (!installedPlugins.plugins || !installedPlugins.plugins[pluginId]) {
        return { success: false, error: '插件不存在' }
      }

      // 获取安装路径（用于删除文件）
      const installations = installedPlugins.plugins[pluginId]
      const installPaths = installations.map(i => i.installPath).filter(Boolean)

      // 从注册表中移除
      delete installedPlugins.plugins[pluginId]
      this._writeInstalledPlugins(installedPlugins)

      // 同时从 settings.json 的 enabledPlugins 中移除
      const settings = this._readSettings()
      if (settings.enabledPlugins && settings.enabledPlugins[pluginId] !== undefined) {
        delete settings.enabledPlugins[pluginId]
        this._writeSettings(settings)
      }

      // 删除插件文件
      if (deleteFiles) {
        for (const installPath of installPaths) {
          // 安全检查：确保路径在 plugins 目录内
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

  _writeInstalledPlugins(data) {
    fs.writeFileSync(this.installedPluginsPath, JSON.stringify(data, null, 2), 'utf-8')
  }

  /**
   * 检查路径是否安全（在 plugins 目录内）
   * @param {string} targetPath - 要检查的路径
   * @returns {boolean}
   */
  _isPathSafe(targetPath) {
    try {
      const normalizedTarget = path.resolve(targetPath)
      const normalizedPlugins = path.resolve(this.pluginsDir)
      return normalizedTarget.startsWith(normalizedPlugins + path.sep)
    } catch {
      return false
    }
  }

  // ========================================
  // 私有方法：文件读写
  // ========================================

  _readInstalledPlugins() {
    try {
      if (!fs.existsSync(this.installedPluginsPath)) {
        return { version: 2, plugins: {} }
      }
      const content = fs.readFileSync(this.installedPluginsPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error('[PluginManager] Failed to read installed_plugins.json:', err)
      return { version: 2, plugins: {} }
    }
  }

  _readSettings() {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        return {}
      }
      const content = fs.readFileSync(this.settingsPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error('[PluginManager] Failed to read settings.json:', err)
      return {}
    }
  }

  _writeSettings(settings) {
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }

  _readEnabledPlugins() {
    const settings = this._readSettings()
    return settings.enabledPlugins || {}
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
  // 私有方法：扫描组件
  // ========================================

  /**
   * 扫描 Commands
   */
  _scanCommands(installPath) {
    const commandsDir = path.join(installPath, 'commands')
    if (!fs.existsSync(commandsDir)) return []

    const commands = []
    try {
      const files = fs.readdirSync(commandsDir)
      for (const file of files) {
        if (!file.endsWith('.md')) continue
        const name = file.replace('.md', '')
        const filePath = path.join(commandsDir, file)
        const frontmatter = this._parseYamlFrontmatter(filePath)
        commands.push({
          name,
          description: frontmatter?.description || '',
          argumentHint: frontmatter?.['argument-hint'] || ''
        })
      }
    } catch (err) {
      console.error('[PluginManager] Failed to scan commands:', err)
    }
    return commands
  }

  /**
   * 扫描 Agents
   */
  _scanAgents(installPath) {
    const agentsDir = path.join(installPath, 'agents')
    if (!fs.existsSync(agentsDir)) return []

    const agents = []
    try {
      const files = fs.readdirSync(agentsDir)
      for (const file of files) {
        if (!file.endsWith('.md')) continue
        const filePath = path.join(agentsDir, file)
        const frontmatter = this._parseYamlFrontmatter(filePath)
        agents.push({
          name: frontmatter?.name || file.replace('.md', ''),
          description: frontmatter?.description || ''
        })
      }
    } catch (err) {
      console.error('[PluginManager] Failed to scan agents:', err)
    }
    return agents
  }

  /**
   * 扫描 Skills
   */
  _scanSkills(installPath) {
    const skillsDir = path.join(installPath, 'skills')
    if (!fs.existsSync(skillsDir)) return []

    const skills = []
    try {
      const items = fs.readdirSync(skillsDir, { withFileTypes: true })
      for (const item of items) {
        if (!item.isDirectory()) continue
        const skillMdPath = path.join(skillsDir, item.name, 'SKILL.md')
        if (!fs.existsSync(skillMdPath)) continue

        const frontmatter = this._parseYamlFrontmatter(skillMdPath)
        skills.push({
          name: frontmatter?.name || item.name,
          description: frontmatter?.description || ''
        })
      }
    } catch (err) {
      console.error('[PluginManager] Failed to scan skills:', err)
    }
    return skills
  }

  /**
   * 扫描 Hooks
   */
  _scanHooks(installPath) {
    const hooksJsonPath = path.join(installPath, 'hooks', 'hooks.json')
    if (!fs.existsSync(hooksJsonPath)) return []

    const hooks = []
    try {
      const content = fs.readFileSync(hooksJsonPath, 'utf-8')
      const hooksConfig = JSON.parse(content)

      // hooks.json 可能有 hooks 字段或直接是事件对象
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
    } catch (err) {
      console.error('[PluginManager] Failed to scan hooks:', err)
    }
    return hooks
  }

  /**
   * 扫描 MCP 配置
   */
  _scanMcp(installPath) {
    const mcpJsonPath = path.join(installPath, '.mcp.json')
    if (!fs.existsSync(mcpJsonPath)) return []

    const mcpServers = []
    try {
      const content = fs.readFileSync(mcpJsonPath, 'utf-8')
      const mcpConfig = JSON.parse(content)

      for (const [name, config] of Object.entries(mcpConfig)) {
        mcpServers.push({
          name,
          command: config.command || '',
          args: config.args || []
        })
      }
    } catch (err) {
      console.error('[PluginManager] Failed to scan mcp:', err)
    }
    return mcpServers
  }

  /**
   * 解析 YAML frontmatter
   */
  _parseYamlFrontmatter(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!match) return null

      const yaml = match[1]
      const result = {}

      // 简单的 YAML 解析（支持单行和多行 description）
      let currentKey = null
      let currentValue = ''
      let inMultiline = false

      for (const line of yaml.split('\n')) {
        const trimmed = line.trim()

        // 检查是否是新的 key
        const keyMatch = line.match(/^(\w[\w-]*):(.*)$/)
        if (keyMatch && !inMultiline) {
          // 保存之前的 key-value
          if (currentKey) {
            result[currentKey] = currentValue.trim()
          }

          currentKey = keyMatch[1]
          const value = keyMatch[2].trim()

          if (value === '|' || value === '>') {
            // 多行值
            inMultiline = true
            currentValue = ''
          } else {
            currentValue = value
          }
        } else if (inMultiline && line.startsWith('  ')) {
          // 多行值的续行
          currentValue += (currentValue ? ' ' : '') + trimmed
        } else if (inMultiline && !line.startsWith('  ') && trimmed) {
          // 多行值结束
          inMultiline = false
          if (currentKey) {
            result[currentKey] = currentValue.trim()
          }
          // 处理新的 key
          const newKeyMatch = line.match(/^(\w[\w-]*):(.*)$/)
          if (newKeyMatch) {
            currentKey = newKeyMatch[1]
            currentValue = newKeyMatch[2].trim()
          }
        }
      }

      // 保存最后一个 key-value
      if (currentKey) {
        result[currentKey] = currentValue.trim()
      }

      return result
    } catch (err) {
      return null
    }
  }
}

module.exports = { PluginManager }

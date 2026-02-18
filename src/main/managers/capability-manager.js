/**
 * Capability Manager
 * 管理 Agent 模式的能力清单：从远程拉取、安装检测、启用/禁用
 *
 * v1.1: 一能力一组件模型 — 每个 capability 直接对应一个 skill/agent/plugin
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { httpGet, fetchRegistryIndex, classifyHttpError } = require('../utils/http-client')

class CapabilityManager {
  /**
   * @param {Object} configManager - ConfigManager 实例
   * @param {Object} pluginCli - PluginCli 实例
   * @param {Object} skillsManager - SkillsManager 实例
   * @param {Object} agentsManager - AgentsManager 实例
   */
  constructor(configManager, pluginCli, skillsManager, agentsManager) {
    this.configManager = configManager
    this.pluginCli = pluginCli
    this.skillsManager = skillsManager
    this.agentsManager = agentsManager
    this._legacyCleaned = false

    // 路径常量
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.skillsDir = path.join(this.claudeDir, 'skills')
    this.agentsDir = path.join(this.claudeDir, 'agents')
    this.pluginsDir = path.join(this.claudeDir, 'plugins')
    this.installedPluginsPath = path.join(this.pluginsDir, 'installed_plugins.json')
    this.settingsPath = path.join(this.claudeDir, 'settings.json')
  }

  /**
   * 从远程拉取能力清单，并检测每个组件的安装状态
   * @returns {{ success: boolean, capabilities?: Array, error?: string }}
   */
  async fetchCapabilities() {
    const config = this.configManager.getConfig()
    const registryUrl = config.market?.registryUrl

    if (!registryUrl) {
      return { success: false, error: '未配置市场源 URL' }
    }

    const url = registryUrl.replace(/\/+$/, '') + '/agent-capabilities.json?t=' + Date.now()
    console.log('[CapabilityManager] Fetching capabilities:', url)

    try {
      const body = await httpGet(url)
      const data = JSON.parse(body)

      if (!data.capabilities || !Array.isArray(data.capabilities)) {
        return { success: false, error: '能力清单格式无效：缺少 capabilities 数组' }
      }

      // v1.0 兼容：自动拍平旧格式
      let rawCapabilities = data.capabilities
      if (data.version !== '1.1') {
        rawCapabilities = this._flattenV1Capabilities(data.capabilities)
      }

      // 检测每个组件的安装状态（一能力一组件）
      const capabilities = rawCapabilities.map(cap => {
        const status = this.checkComponentInstalled(cap.type, cap.componentId)
        return {
          ...cap,
          installed: status === 'installed' || status === 'disabled',
          disabled: status === 'disabled'
        }
      })

      // 清理 v1.0 遗留的 config.settings.agent.capabilities 数据
      this._cleanupLegacyState()

      return { success: true, capabilities }
    } catch (err) {
      console.error('[CapabilityManager] Failed to fetch capabilities:', err.message)
      return { success: false, error: classifyHttpError(err) }
    }
  }

  /**
   * 清理 v1.0 遗留的 config.settings.agent.capabilities 持久化状态
   */
  _cleanupLegacyState() {
    if (this._legacyCleaned) return
    try {
      const config = this.configManager.getConfig()
      if (config.settings?.agent?.capabilities && Object.keys(config.settings.agent.capabilities).length > 0) {
        delete config.settings.agent.capabilities
        this.configManager.save(config)
        console.log('[CapabilityManager] Cleaned up legacy v1.0 capability state')
      }
      this._legacyCleaned = true
    } catch (err) {
      // 非关键操作，静默失败
      console.warn('[CapabilityManager] _cleanupLegacyState error:', err.message)
    }
  }

  /**
   * v1.0 兼容：将旧的 components 数组拍平为独立条目
   * @param {Array} capabilities - v1.0 格式的 capabilities
   * @returns {Array} v1.1 格式的 capabilities
   */
  _flattenV1Capabilities(capabilities) {
    const result = []
    for (const cap of capabilities) {
      if (!cap.components || !Array.isArray(cap.components)) continue
      for (const comp of cap.components) {
        result.push({
          id: comp.id.replace(/@.*$/, ''),  // 去掉 marketplace 后缀作为 ID
          name: comp.id,
          description: cap.description || '',
          icon: cap.icon || 'lightning',
          type: comp.type,
          componentId: comp.id,
          category: cap.id
        })
      }
    }
    return result
  }

  /**
   * 检测单个组件的安装状态
   * @param {string} type - 组件类型: 'skill' | 'agent' | 'plugin'
   * @param {string} id - 组件 ID
   * @returns {'installed'|'disabled'|false} - 已安装/已禁用/未安装
   */
  checkComponentInstalled(type, id) {
    try {
      switch (type) {
        case 'skill': {
          const skillDir = path.join(this.skillsDir, id)
          if (!fs.existsSync(skillDir)) return false
          // 检查 SKILL.md 是否存在
          const skillMd = path.join(skillDir, 'SKILL.md')
          const skillMdLower = path.join(skillDir, 'skill.md')
          if (fs.existsSync(skillMd) || fs.existsSync(skillMdLower)) return 'installed'
          // 检查 .disabled
          const disabledMd = path.join(skillDir, 'SKILL.md.disabled')
          const disabledMdLower = path.join(skillDir, 'skill.md.disabled')
          if (fs.existsSync(disabledMd) || fs.existsSync(disabledMdLower)) return 'disabled'
          return false
        }
        case 'agent': {
          const agentPath = path.join(this.agentsDir, `${id}.md`)
          if (fs.existsSync(agentPath)) return 'installed'
          const disabledPath = path.join(this.agentsDir, `${id}.md.disabled`)
          if (fs.existsSync(disabledPath)) return 'disabled'
          return false
        }
        case 'plugin': {
          if (!this._checkPluginInstalled(id)) return false
          if (this._checkPluginDisabled(id)) return 'disabled'
          return 'installed'
        }
        default:
          console.warn(`[CapabilityManager] Unknown component type: ${type}`)
          return false
      }
    } catch (err) {
      console.error(`[CapabilityManager] checkComponentInstalled error (${type}/${id}):`, err.message)
      return false
    }
  }

  /**
   * 检测 plugin 是否已安装（通过读取 installed_plugins.json）
   * @param {string} pluginId - plugin ID (格式: name@marketplace)
   * @returns {boolean}
   */
  _checkPluginInstalled(pluginId) {
    try {
      if (!fs.existsSync(this.installedPluginsPath)) {
        return false
      }
      const content = fs.readFileSync(this.installedPluginsPath, 'utf-8')
      const data = JSON.parse(content)
      const plugins = data.plugins || {}
      return pluginId in plugins && Array.isArray(plugins[pluginId]) && plugins[pluginId].length > 0
    } catch (err) {
      console.error('[CapabilityManager] _checkPluginInstalled error:', err.message)
      return false
    }
  }

  /**
   * 检测 plugin 是否被禁用（通过读取 settings.json 的 enabledPlugins）
   * @param {string} pluginId - plugin ID
   * @returns {boolean}
   */
  _checkPluginDisabled(pluginId) {
    try {
      if (!fs.existsSync(this.settingsPath)) return false
      const content = fs.readFileSync(this.settingsPath, 'utf-8')
      const settings = JSON.parse(content)
      const enabledPlugins = settings.enabledPlugins || {}
      return enabledPlugins[pluginId] === false
    } catch (err) {
      console.error('[CapabilityManager] _checkPluginDisabled error:', err.message)
      return false
    }
  }

  /**
   * 设置 plugin 的启用/禁用状态（写入 settings.json）
   * @param {string} pluginId - plugin ID
   * @param {boolean} enabled - true=启用, false=禁用
   */
  _setPluginEnabled(pluginId, enabled) {
    let settings = {}
    try {
      if (fs.existsSync(this.settingsPath)) {
        settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'))
      }
    } catch (err) {
      console.warn('[CapabilityManager] _setPluginEnabled: failed to read settings, using empty:', err.message)
    }
    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {}
    }
    settings.enabledPlugins[pluginId] = enabled
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    console.log(`[CapabilityManager] Set plugin ${pluginId} enabled: ${enabled}`)
  }

  /**
   * 安装能力：从 registry 下载组件，安装后默认启用
   * @param {Object} capability - 能力对象（v1.1: 含 type + componentId）
   * @returns {{ success: boolean, error?: string }}
   */
  async installCapability(capability) {
    const { type, componentId } = capability
    const config = this.configManager.getConfig()
    const registryUrl = config.market?.registryUrl?.replace(/\/+$/, '')

    if (!registryUrl) {
      return { success: false, error: '未配置市场源 URL' }
    }

    // 如果当前是 disabled 状态，先清理 disabled 文件，避免残留
    const currentStatus = this.checkComponentInstalled(type, componentId)
    if (currentStatus === 'disabled') {
      try {
        await this._restoreDisabledComponent(type, componentId)
      } catch (err) {
        console.warn(`[CapabilityManager] Pre-install restore failed (non-blocking): ${err.message}`)
      }
    }

    try {
      let installResult
      switch (type) {
        case 'skill': {
          const skill = await this._fetchComponentFromIndex(registryUrl, 'skills', componentId)
          if (!skill) {
            throw new Error(`Skill "${componentId}" not found in registry index`)
          }
          installResult = await this.skillsManager.installMarketSkillForce({ registryUrl, skill })
          break
        }
        case 'agent': {
          const agent = await this._fetchComponentFromIndex(registryUrl, 'agents', componentId)
          if (!agent) {
            throw new Error(`Agent "${componentId}" not found in registry index`)
          }
          installResult = await this.agentsManager.installMarketAgentForce({ registryUrl, agent })
          break
        }
        case 'plugin': {
          installResult = await this.pluginCli.install(componentId)
          break
        }
        default:
          throw new Error(`Unknown component type: ${type}`)
      }

      if (installResult.success) {
        console.log(`[CapabilityManager] Installed: ${type}/${componentId}`)
        return { success: true }
      } else {
        console.error(`[CapabilityManager] Install failed: ${type}/${componentId}:`, installResult.error)
        return { success: false, error: installResult.error }
      }
    } catch (err) {
      console.error(`[CapabilityManager] Install error: ${type}/${componentId}:`, err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 卸载能力：删除组件文件（无论启用还是禁用状态）
   * @param {Object} capability - 能力对象（v1.1: 含 type + componentId）
   * @returns {{ success: boolean, error?: string }}
   */
  async uninstallCapability(capability) {
    const { type, componentId } = capability
    try {
      switch (type) {
        case 'skill': {
          const skillDir = path.join(this.skillsDir, componentId)
          if (fs.existsSync(skillDir)) {
            fs.rmSync(skillDir, { recursive: true, force: true })
          }
          break
        }
        case 'agent': {
          // 同时检查正常和 disabled 文件
          const agentPath = path.join(this.agentsDir, `${componentId}.md`)
          const disabledPath = agentPath + '.disabled'
          if (fs.existsSync(agentPath)) fs.unlinkSync(agentPath)
          if (fs.existsSync(disabledPath)) fs.unlinkSync(disabledPath)
          break
        }
        case 'plugin': {
          const result = await this.pluginCli.uninstall(componentId)
          if (!result.success) {
            return { success: false, error: result.error }
          }
          break
        }
        default:
          throw new Error(`Unknown component type: ${type}`)
      }
      console.log(`[CapabilityManager] Uninstalled: ${type}/${componentId}`)
      return { success: true }
    } catch (err) {
      console.error(`[CapabilityManager] Uninstall error: ${type}/${componentId}:`, err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 启用能力：恢复已禁用组件
   * @param {Object} capability - 能力对象（v1.1: 含 type + componentId）
   * @returns {{ success: boolean, error?: string }}
   */
  async enableCapability(capability) {
    const { type, componentId } = capability
    const installStatus = this.checkComponentInstalled(type, componentId)

    if (installStatus === 'disabled') {
      try {
        await this._restoreDisabledComponent(type, componentId)
        console.log(`[CapabilityManager] Restored: ${type}/${componentId}`)
        return { success: true }
      } catch (err) {
        console.error(`[CapabilityManager] Restore failed: ${type}/${componentId}:`, err.message)
        return { success: false, error: err.message }
      }
    }

    if (installStatus === 'installed') {
      return { success: true }
    }

    // 未安装 → 不能启用
    return { success: false, error: '组件未安装，请先下载' }
  }

  /**
   * 禁用能力：将组件文件重命名为 .disabled
   * @param {Object} capability - 能力对象（v1.1: 含 type + componentId）
   * @returns {{ success: boolean, error?: string }}
   */
  async disableCapability(capability) {
    const { type, componentId } = capability
    try {
      await this._disableComponent(type, componentId)
      console.log(`[CapabilityManager] Disabled: ${type}/${componentId}`)
      return { success: true }
    } catch (err) {
      console.error(`[CapabilityManager] Disable failed: ${type}/${componentId}:`, err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 禁用单个组件：重命名文件加 .disabled 后缀
   */
  async _disableComponent(type, id) {
    switch (type) {
      case 'skill': {
        const skillDir = path.join(this.skillsDir, id)
        let src = path.join(skillDir, 'SKILL.md')
        if (!fs.existsSync(src)) {
          src = path.join(skillDir, 'skill.md')
        }
        if (!fs.existsSync(src)) return // 已经不存在，无需操作
        const dest = src + '.disabled'
        if (fs.existsSync(dest)) throw new Error(`Target already exists: ${dest}`)
        fs.renameSync(src, dest)
        break
      }
      case 'agent': {
        const src = path.join(this.agentsDir, `${id}.md`)
        if (!fs.existsSync(src)) return
        const dest = src + '.disabled'
        if (fs.existsSync(dest)) throw new Error(`Target already exists: ${dest}`)
        fs.renameSync(src, dest)
        break
      }
      case 'plugin': {
        this._setPluginEnabled(id, false)
        break
      }
      default:
        throw new Error(`Unknown component type: ${type}`)
    }
  }

  /**
   * 恢复已禁用组件：将 .disabled 后缀文件重命名回正常名称
   */
  async _restoreDisabledComponent(type, id) {
    switch (type) {
      case 'skill': {
        const skillDir = path.join(this.skillsDir, id)
        let src = path.join(skillDir, 'SKILL.md.disabled')
        let dest = path.join(skillDir, 'SKILL.md')
        if (!fs.existsSync(src)) {
          src = path.join(skillDir, 'skill.md.disabled')
          dest = path.join(skillDir, 'skill.md')
        }
        if (!fs.existsSync(src)) throw new Error(`Disabled file not found for skill: ${id}`)
        if (fs.existsSync(dest)) throw new Error(`Target already exists: ${dest}`)
        fs.renameSync(src, dest)
        break
      }
      case 'agent': {
        const src = path.join(this.agentsDir, `${id}.md.disabled`)
        const dest = path.join(this.agentsDir, `${id}.md`)
        if (!fs.existsSync(src)) throw new Error(`Disabled file not found for agent: ${id}`)
        if (fs.existsSync(dest)) throw new Error(`Target already exists: ${dest}`)
        fs.renameSync(src, dest)
        break
      }
      case 'plugin': {
        this._setPluginEnabled(id, true)
        break
      }
      default:
        throw new Error(`Unknown component type: ${type}`)
    }
  }

  /**
   * 切换单个组件的禁用状态（供 Developer 模式调用）
   * @param {string} type - 组件类型: 'skill' | 'agent'
   * @param {string} id - 组件 ID
   * @param {boolean} disabled - true=禁用, false=启用
   * @returns {{ success: boolean, error?: string }}
   */
  async toggleComponentDisabled(type, id, disabled) {
    try {
      if (disabled) {
        await this._disableComponent(type, id)
      } else {
        await this._restoreDisabledComponent(type, id)
      }
      return { success: true }
    } catch (err) {
      console.error(`[CapabilityManager] toggleComponentDisabled error (${type}/${id}):`, err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 从注册表 index.json 获取指定组件的完整信息
   */
  async _fetchComponentFromIndex(registryUrl, arrayKey, componentId) {
    try {
      const indexResult = await fetchRegistryIndex(registryUrl)
      if (!indexResult.success || !indexResult.data) {
        return null
      }
      const items = indexResult.data[arrayKey] || []
      return items.find(item => item.id === componentId) || null
    } catch (err) {
      console.error(`[CapabilityManager] _fetchComponentFromIndex error:`, err.message)
      return null
    }
  }
}

module.exports = { CapabilityManager }

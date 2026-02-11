/**
 * Capability Manager
 * 管理 Agent 模式的能力清单：从远程拉取、安装检测、启用/禁用
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { httpGet, classifyHttpError } = require('../utils/http-client')

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

    // 路径常量
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.skillsDir = path.join(this.claudeDir, 'skills')
    this.agentsDir = path.join(this.claudeDir, 'agents')
    this.pluginsDir = path.join(this.claudeDir, 'plugins')
    this.installedPluginsPath = path.join(this.pluginsDir, 'installed_plugins.json')
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

      // 检测每个组件的安装状态
      const capabilities = data.capabilities.map(cap => ({
        ...cap,
        components: (cap.components || []).map(comp => ({
          ...comp,
          installed: this.checkComponentInstalled(comp.type, comp.id)
        }))
      }))

      return { success: true, capabilities }
    } catch (err) {
      console.error('[CapabilityManager] Failed to fetch capabilities:', err.message)
      return { success: false, error: classifyHttpError(err) }
    }
  }

  /**
   * 检测单个组件是否已安装
   * @param {string} type - 组件类型: 'skill' | 'agent' | 'plugin'
   * @param {string} id - 组件 ID
   * @returns {boolean}
   */
  checkComponentInstalled(type, id) {
    try {
      switch (type) {
        case 'skill': {
          const skillDir = path.join(this.skillsDir, id)
          return fs.existsSync(skillDir)
        }
        case 'agent': {
          const agentPath = path.join(this.agentsDir, `${id}.md`)
          return fs.existsSync(agentPath)
        }
        case 'plugin': {
          return this._checkPluginInstalled(id)
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
   * 获取本地能力状态（已启用/禁用）
   * @returns {Object} { [capabilityId]: { enabled: boolean } }
   */
  getState() {
    const config = this.configManager.getConfig()
    return config.settings?.agent?.capabilities || {}
  }

  /**
   * 启用能力：安装缺失组件，更新本地状态
   * @param {string} capabilityId - 能力 ID
   * @param {Object} capability - 能力对象（含 components 数组）
   * @returns {{ success: boolean, results: Array, errors: Array }}
   */
  async enableCapability(capabilityId, capability) {
    const results = []
    const errors = []
    const config = this.configManager.getConfig()
    const registryUrl = config.market?.registryUrl?.replace(/\/+$/, '')

    if (!registryUrl) {
      return { success: false, results: [], errors: ['未配置市场源 URL'] }
    }

    const components = capability.components || []

    for (const comp of components) {
      const { type, id } = comp

      // 检测是否已安装
      if (this.checkComponentInstalled(type, id)) {
        results.push({ type, id, status: 'skipped' })
        console.log(`[CapabilityManager] Component already installed, skipped: ${type}/${id}`)
        continue
      }

      // 执行安装
      try {
        let installResult
        switch (type) {
          case 'skill': {
            const skill = await this._fetchComponentFromIndex(registryUrl, 'skills', id)
            if (!skill) {
              throw new Error(`Skill "${id}" not found in registry index`)
            }
            installResult = await this.skillsManager.installMarketSkill({ registryUrl, skill })
            break
          }
          case 'agent': {
            const agent = await this._fetchComponentFromIndex(registryUrl, 'agents', id)
            if (!agent) {
              throw new Error(`Agent "${id}" not found in registry index`)
            }
            installResult = await this.agentsManager.installMarketAgent({ registryUrl, agent })
            break
          }
          case 'plugin': {
            installResult = await this.pluginCli.install(id)
            break
          }
          default:
            throw new Error(`Unknown component type: ${type}`)
        }

        if (installResult.success) {
          results.push({ type, id, status: 'installed' })
          console.log(`[CapabilityManager] Installed: ${type}/${id}`)
        } else {
          results.push({ type, id, status: 'failed' })
          errors.push(`${type}/${id}: ${installResult.error}`)
          console.error(`[CapabilityManager] Install failed: ${type}/${id}:`, installResult.error)
        }
      } catch (err) {
        results.push({ type, id, status: 'failed' })
        errors.push(`${type}/${id}: ${err.message}`)
        console.error(`[CapabilityManager] Install error: ${type}/${id}:`, err.message)
      }
    }

    // 更新本地状态
    this._updateCapabilityState(capabilityId, true)

    return {
      success: errors.length === 0,
      results,
      errors
    }
  }

  /**
   * 禁用能力（仅标记状态，不卸载组件）
   * @param {string} capabilityId - 能力 ID
   * @returns {{ success: boolean }}
   */
  async disableCapability(capabilityId) {
    this._updateCapabilityState(capabilityId, false)
    return { success: true }
  }

  /**
   * 从注册表 index.json 获取指定组件的完整信息
   */
  async _fetchComponentFromIndex(registryUrl, arrayKey, componentId) {
    try {
      const indexResult = await this.skillsManager.fetchRegistryIndex(registryUrl)
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

  /**
   * 更新能力的启用/禁用状态到 config
   */
  _updateCapabilityState(capabilityId, enabled) {
    const config = this.configManager.getConfig()

    if (!config.settings) config.settings = {}
    if (!config.settings.agent) config.settings.agent = {}
    if (!config.settings.agent.capabilities) config.settings.agent.capabilities = {}

    config.settings.agent.capabilities[capabilityId] = { enabled }
    this.configManager.save(config)
  }
}

module.exports = { CapabilityManager }

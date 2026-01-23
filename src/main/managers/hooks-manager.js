/**
 * Hooks Manager - 钩子管理
 *
 * 调用方式: 自动执行 (事件触发: PreToolUse, PostToolUse, Stop, Notification 等)
 * 全局来源:
 *   - ~/.claude/settings.json 的 hooks 字段
 *   - 插件 hooks/hooks.json
 * 项目级别: .claude/settings.local.json 的 hooks 字段
 *
 * 注意: Hooks 不需要用户手动调用，由 Claude Code 在特定事件发生时自动执行
 */

const fs = require('fs')
const path = require('path')
const { ComponentScanner } = require('../component-scanner')

class HooksManager extends ComponentScanner {
  constructor() {
    super()
  }

  /**
   * 解析 hooks 配置对象
   * @param {Object} hooksConfig - hooks 配置 (可能有 hooks 字段或直接是事件对象)
   * @param {string} source - 来源标识
   * @param {Object} sourceInfo - 额外来源信息
   * @returns {Array}
   */
  _parseHooksConfig(hooksConfig, source, sourceInfo = {}) {
    if (!hooksConfig) return []

    const hooks = []
    // hooks.json 可能有 hooks 字段或直接是事件对象
    const hooksObj = hooksConfig.hooks || hooksConfig
    let hookIndex = 0

    for (const [event, handlers] of Object.entries(hooksObj)) {
      if (event === 'description') continue
      if (!Array.isArray(handlers)) continue

      for (const handler of handlers) {
        const type = handler.hooks?.[0]?.type || handler.type || 'unknown'
        const matcher = handler.matcher || ''
        const command = handler.hooks?.[0]?.command || handler.command || ''

        hooks.push({
          id: `${source}-${event}-${hookIndex++}`,
          event,
          matcher,
          type,
          command,
          name: type, // 添加 name 字段用于显示
          source,
          ...sourceInfo,
          // 调用方式标记
          invocationType: 'auto' // 自动执行
        })
      }
    }

    return hooks
  }

  /**
   * 获取全局 Hooks (来自 settings.json)
   * @returns {Array} Hooks 列表
   */
  async getGlobalSettingsHooks() {
    const settings = this._readSettings()
    return this._parseHooksConfig(settings.hooks, 'settings', {
      category: '全局设置',
      filePath: this.settingsPath
    })
  }

  /**
   * 获取插件 Hooks (来自已安装插件)
   * @returns {Array} Hooks 列表
   */
  async getPluginHooks() {
    const plugins = this.getEnabledPluginPaths()
    const allHooks = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const hooksJsonPath = path.join(installPath, 'hooks', 'hooks.json')
      const hooksConfig = this.readJsonFile(hooksJsonPath)

      if (hooksConfig) {
        const hooks = this._parseHooksConfig(hooksConfig, 'plugin', {
          pluginId,
          pluginShortName,
          category: pluginShortName,
          filePath: hooksJsonPath
        })
        allHooks.push(...hooks)
      }
    }

    return allHooks
  }

  /**
   * 获取所有全局 Hooks (settings + 插件)
   * @returns {Array} Hooks 列表
   */
  async getGlobalHooks() {
    const settingsHooks = await this.getGlobalSettingsHooks()
    const pluginHooks = await this.getPluginHooks()
    return [...settingsHooks, ...pluginHooks]
  }

  /**
   * 获取项目级 Hooks
   * @param {string} projectPath - 项目根目录
   * @returns {Array} Hooks 列表
   */
  async getProjectHooks(projectPath) {
    if (!projectPath) return []

    const settingsLocalPath = path.join(this.getProjectClaudeDir(projectPath), 'settings.local.json')
    const localSettings = this.readJsonFile(settingsLocalPath)

    if (!localSettings || !localSettings.hooks) return []

    return this._parseHooksConfig(localSettings.hooks, 'project', {
      projectPath,
      category: '项目钩子',
      filePath: settingsLocalPath
    })
  }

  /**
   * 获取所有 Hooks (全局 + 项目级)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Array} Hooks 列表
   */
  async getAllHooks(projectPath = null) {
    const globalHooks = await this.getGlobalHooks()

    if (!projectPath) {
      return globalHooks
    }

    const projectHooks = await this.getProjectHooks(projectPath)

    // 项目级在前，全局在后
    return [...projectHooks, ...globalHooks]
  }
}

module.exports = { HooksManager }

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
const { atomicWriteJson } = require('../utils/path-utils')

// 支持的事件类型 (13 种)
const HOOK_EVENTS = [
  'PreToolUse',         // 工具调用前，可阻止
  'PostToolUse',        // 工具调用后
  'PostToolUseFailure', // 工具调用失败后
  'PermissionRequest',  // 权限请求时，可阻止
  'Notification',       // 通知时
  'UserPromptSubmit',   // 用户提交提示词后，可阻止
  'SessionStart',       // 会话开始
  'SessionEnd',         // 会话结束
  'Stop',               // Claude 停止响应时，可阻止停止
  'SubagentStart',      // 子代理启动
  'SubagentStop',       // 子代理停止
  'PreCompact',         // 上下文压缩前
  'Setup'               // 设置时
]

// Hook 类型 (3 种)
const HOOK_TYPES = ['command', 'prompt', 'agent']

// 各类型支持的字段
const HOOK_TYPE_FIELDS = {
  command: ['command', 'timeout', 'statusMessage', 'once', 'async'],
  prompt: ['prompt', 'timeout', 'model', 'statusMessage', 'once'],
  agent: ['prompt', 'timeout', 'model', 'statusMessage', 'once']
}

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

      for (let handlerIdx = 0; handlerIdx < handlers.length; handlerIdx++) {
        const handler = handlers[handlerIdx]
        const hookData = handler.hooks?.[0] || handler
        const type = hookData.type || 'unknown'
        const matcher = handler.matcher || ''
        const command = hookData.command || ''
        const prompt = hookData.prompt || ''

        hooks.push({
          id: `${source}-${event}-${hookIndex++}`,
          handlerIndex: handlerIdx,  // 用于定位更新/删除
          event,
          matcher,
          type,
          command,
          prompt,
          // 可选字段
          timeout: hookData.timeout,
          model: hookData.model,
          statusMessage: hookData.statusMessage,
          once: hookData.once,
          async: hookData.async,
          // 显示用
          name: type,
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

  /**
   * 获取 Hooks Schema 信息
   * @returns {Object} { events, types, typeFields }
   */
  getHooksSchema() {
    return {
      events: HOOK_EVENTS,
      types: HOOK_TYPES,
      typeFields: HOOK_TYPE_FIELDS
    }
  }

  /**
   * 获取配置文件路径
   * @param {string} scope - 'global' | 'project' | 'plugin'
   * @param {string} projectPath - 项目路径 (scope 为 project 时必需)
   * @param {string} pluginFilePath - 插件 hooks.json 路径 (scope 为 plugin 时必需)
   * @returns {string} 配置文件路径
   */
  _getConfigPath(scope, projectPath, pluginFilePath) {
    if (scope === 'project') {
      if (!projectPath) throw new Error('Project path is required for project scope')
      return path.join(this.getProjectClaudeDir(projectPath), 'settings.local.json')
    }
    if (scope === 'plugin') {
      if (!pluginFilePath) throw new Error('Plugin file path is required for plugin scope')
      return pluginFilePath
    }
    return this.settingsPath
  }

  /**
   * 确保目录存在
   * @param {string} filePath - 文件路径
   */
  _ensureDir(filePath) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * 创建新 Hook
   * @param {Object} params - { scope: 'global'|'project', projectPath?, event, matcher?, hook }
   * @returns {Object} { success, error? }
   */
  async createHook({ scope, projectPath, event, matcher = '', hook }) {
    try {
      const filePath = this._getConfigPath(scope, projectPath)
      this._ensureDir(filePath)

      // 读取现有配置
      let config = this.readJsonFile(filePath) || {}
      if (!config.hooks) config.hooks = {}
      if (!config.hooks[event]) config.hooks[event] = []

      // 构建新 handler
      const newHandler = { hooks: [hook] }
      if (matcher) newHandler.matcher = matcher
      config.hooks[event].push(newHandler)

      // 写入文件
      atomicWriteJson(filePath, config)
      return { success: true }
    } catch (err) {
      console.error('Failed to create hook:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 更新 Hook
   * @param {Object} params - { scope, projectPath?, pluginFilePath?, event, handlerIndex, matcher?, hook }
   * @returns {Object} { success, error? }
   */
  async updateHook({ scope, projectPath, pluginFilePath, event, handlerIndex, matcher, hook }) {
    try {
      const filePath = this._getConfigPath(scope, projectPath, pluginFilePath)
      let config = this.readJsonFile(filePath)

      if (!config?.hooks?.[event]?.[handlerIndex]) {
        return { success: false, error: 'Hook not found' }
      }

      // 更新 handler
      const handler = config.hooks[event][handlerIndex]
      if (matcher !== undefined) {
        if (matcher) {
          handler.matcher = matcher
        } else {
          delete handler.matcher
        }
      }
      handler.hooks = [hook]

      atomicWriteJson(filePath, config)
      return { success: true }
    } catch (err) {
      console.error('Failed to update hook:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 删除 Hook
   * @param {Object} params - { scope, projectPath?, event, handlerIndex }
   * @returns {Object} { success, error? }
   */
  async deleteHook({ scope, projectPath, event, handlerIndex }) {
    try {
      const filePath = this._getConfigPath(scope, projectPath)
      let config = this.readJsonFile(filePath)

      if (!config?.hooks?.[event]) {
        return { success: false, error: 'Event not found' }
      }

      if (handlerIndex < 0 || handlerIndex >= config.hooks[event].length) {
        return { success: false, error: 'Invalid handler index' }
      }

      // 删除指定 handler
      config.hooks[event].splice(handlerIndex, 1)

      // 如果事件下没有 handler 了，删除整个事件
      if (config.hooks[event].length === 0) {
        delete config.hooks[event]
      }

      // 如果没有任何 hooks 了，删除 hooks 字段
      if (Object.keys(config.hooks).length === 0) {
        delete config.hooks
      }

      atomicWriteJson(filePath, config)
      return { success: true }
    } catch (err) {
      console.error('Failed to delete hook:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 获取 Hooks JSON 原始数据
   * @param {Object} params - { scope: 'global'|'project', projectPath? }
   * @returns {Object} { success, data?, filePath?, error? }
   */
  async getHooksJson({ scope, projectPath }) {
    try {
      const filePath = this._getConfigPath(scope, projectPath)
      const config = this.readJsonFile(filePath)

      return {
        success: true,
        data: config?.hooks || {},
        filePath
      }
    } catch (err) {
      console.error('Failed to get hooks json:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 保存 Hooks JSON 原始数据
   * @param {Object} params - { scope, projectPath?, hooks }
   * @returns {Object} { success, error? }
   */
  async saveHooksJson({ scope, projectPath, hooks }) {
    try {
      const filePath = this._getConfigPath(scope, projectPath)
      this._ensureDir(filePath)

      // 读取现有配置，保留其他字段
      let config = this.readJsonFile(filePath) || {}

      // 更新 hooks 字段
      if (hooks && Object.keys(hooks).length > 0) {
        config.hooks = hooks
      } else {
        delete config.hooks
      }

      atomicWriteJson(filePath, config)
      return { success: true }
    } catch (err) {
      console.error('Failed to save hooks json:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 检查 Hook 是否重复
   * @param {Object} params - { targetScope, projectPath, event, matcher, hook }
   * @returns {Object} { duplicate: boolean, handlerIndex?: number }
   */
  checkHookDuplicate({ targetScope, projectPath, event, matcher, hook }) {
    try {
      const filePath = this._getConfigPath(targetScope, projectPath)
      const config = this.readJsonFile(filePath)

      if (!config?.hooks?.[event]) {
        return { duplicate: false }
      }

      const handlers = config.hooks[event]
      for (let i = 0; i < handlers.length; i++) {
        const handler = handlers[i]
        const existingHook = handler.hooks?.[0]

        // 比较 matcher 和 hook 内容
        const matcherSame = (handler.matcher || '') === (matcher || '')
        const hookSame = existingHook &&
          existingHook.type === hook.type &&
          existingHook.command === hook.command &&
          existingHook.prompt === hook.prompt

        if (matcherSame && hookSame) {
          return { duplicate: true, handlerIndex: i }
        }
      }

      return { duplicate: false }
    } catch (err) {
      console.error('Failed to check hook duplicate:', err)
      return { duplicate: false }
    }
  }

  /**
   * 复制 Hook 到目标位置
   * @param {Object} params - { targetScope, projectPath, event, matcher, hook, overwrite, overwriteIndex }
   * @returns {Object} { success, error?, duplicate? }
   */
  async copyHook({ targetScope, projectPath, event, matcher, hook, overwrite = false, overwriteIndex }) {
    try {
      // 检查重复
      if (!overwrite) {
        const duplicateCheck = this.checkHookDuplicate({ targetScope, projectPath, event, matcher, hook })
        if (duplicateCheck.duplicate) {
          return { success: false, duplicate: true, handlerIndex: duplicateCheck.handlerIndex }
        }
      }

      const filePath = this._getConfigPath(targetScope, projectPath)
      this._ensureDir(filePath)

      let config = this.readJsonFile(filePath) || {}
      if (!config.hooks) config.hooks = {}
      if (!config.hooks[event]) config.hooks[event] = []

      const newHandler = { hooks: [hook] }
      if (matcher) newHandler.matcher = matcher

      if (overwrite && overwriteIndex !== undefined) {
        // 覆盖现有的
        config.hooks[event][overwriteIndex] = newHandler
      } else {
        // 追加新的
        config.hooks[event].push(newHandler)
      }

      atomicWriteJson(filePath, config)
      return { success: true }
    } catch (err) {
      console.error('Failed to copy hook:', err)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { HooksManager, HOOK_EVENTS, HOOK_TYPES, HOOK_TYPE_FIELDS }

/**
 * Settings Manager - Claude Code 基本设置管理
 *
 * 管理 ~/.claude/settings.json 中的 permissions 和 env 字段
 * 以及项目级 .claude/settings.local.json 中对应的字段
 *
 * 注意: hooks 由 HooksManager 管理，enabledPlugins 由 PluginManager 管理
 * 本管理器仅负责 permissions 和 env 字段，写入时保留其他字段不变
 */

const fs = require('fs')
const path = require('path')
const { ComponentScanner } = require('../component-scanner')
const { atomicWriteJson } = require('../utils/path-utils')

class SettingsManager extends ComponentScanner {
  constructor() {
    super()
  }

  // ========================================
  // 内部方法
  // ========================================

  /**
   * 获取配置文件路径
   * @param {string} scope - 'global' | 'project'
   * @param {string} projectPath - 项目路径 (scope 为 project 时必需)
   * @returns {string}
   */
  _getConfigPath(scope, projectPath) {
    if (scope === 'project') {
      if (!projectPath) throw new Error('Project path is required for project scope')
      return path.join(this.getProjectClaudeDir(projectPath), 'settings.local.json')
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
   * 读取配置文件
   * @param {string} scope
   * @param {string} projectPath
   * @returns {Object}
   */
  _readConfig(scope, projectPath) {
    const filePath = this._getConfigPath(scope, projectPath)
    return this.readJsonFile(filePath) || {}
  }

  /**
   * 写入配置文件（保留其他字段）
   * @param {string} scope
   * @param {string} projectPath
   * @param {Object} config - 完整配置对象
   */
  _writeConfig(scope, projectPath, config) {
    const filePath = this._getConfigPath(scope, projectPath)
    this._ensureDir(filePath)
    atomicWriteJson(filePath, config)
  }

  // ========================================
  // Permissions 管理
  // ========================================

  /**
   * 获取权限设置
   * @param {string} scope - 'global' | 'project'
   * @param {string} projectPath
   * @returns {Object} { allow: string[], deny: string[] }
   */
  getPermissions(scope = 'global', projectPath = null) {
    const config = this._readConfig(scope, projectPath)
    const permissions = config.permissions || {}
    return {
      allow: Array.isArray(permissions.allow) ? permissions.allow : [],
      deny: Array.isArray(permissions.deny) ? permissions.deny : []
    }
  }

  /**
   * 添加权限规则
   * @param {string} scope
   * @param {string} projectPath
   * @param {string} type - 'allow' | 'deny'
   * @param {string} pattern - 匹配模式，如 "Bash(git *)", "Read"
   * @returns {Object} { success, error? }
   */
  addPermissionRule(scope, projectPath, type, pattern) {
    try {
      if (!['allow', 'deny'].includes(type)) {
        return { success: false, error: 'Type must be "allow" or "deny"' }
      }
      if (!pattern || typeof pattern !== 'string') {
        return { success: false, error: 'Pattern is required' }
      }

      const config = this._readConfig(scope, projectPath)
      if (!config.permissions) config.permissions = {}
      if (!Array.isArray(config.permissions[type])) config.permissions[type] = []

      // 检查重复
      if (config.permissions[type].includes(pattern)) {
        return { success: false, error: 'Rule already exists' }
      }

      config.permissions[type].push(pattern)
      this._writeConfig(scope, projectPath, config)
      return { success: true }
    } catch (err) {
      console.error('[SettingsManager] Failed to add permission rule:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 更新权限规则
   * @param {string} scope
   * @param {string} projectPath
   * @param {string} type - 'allow' | 'deny'
   * @param {number} index - 规则索引
   * @param {string} newPattern - 新模式
   * @returns {Object} { success, error? }
   */
  updatePermissionRule(scope, projectPath, type, index, newPattern) {
    try {
      if (!['allow', 'deny'].includes(type)) {
        return { success: false, error: 'Type must be "allow" or "deny"' }
      }

      const config = this._readConfig(scope, projectPath)
      if (!config.permissions?.[type]?.[index] && config.permissions?.[type]?.[index] !== '') {
        return { success: false, error: 'Rule not found' }
      }

      config.permissions[type][index] = newPattern
      this._writeConfig(scope, projectPath, config)
      return { success: true }
    } catch (err) {
      console.error('[SettingsManager] Failed to update permission rule:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 删除权限规则
   * @param {string} scope
   * @param {string} projectPath
   * @param {string} type - 'allow' | 'deny'
   * @param {number} index - 规则索引
   * @returns {Object} { success, error? }
   */
  removePermissionRule(scope, projectPath, type, index) {
    try {
      if (!['allow', 'deny'].includes(type)) {
        return { success: false, error: 'Type must be "allow" or "deny"' }
      }

      const config = this._readConfig(scope, projectPath)
      if (!config.permissions?.[type]) {
        return { success: false, error: 'No rules found' }
      }

      if (index < 0 || index >= config.permissions[type].length) {
        return { success: false, error: 'Invalid rule index' }
      }

      config.permissions[type].splice(index, 1)

      // 清理空数组
      if (config.permissions[type].length === 0) {
        delete config.permissions[type]
      }
      // 清理空 permissions 对象
      if (Object.keys(config.permissions).length === 0) {
        delete config.permissions
      }

      this._writeConfig(scope, projectPath, config)
      return { success: true }
    } catch (err) {
      console.error('[SettingsManager] Failed to remove permission rule:', err)
      return { success: false, error: err.message }
    }
  }

  // ========================================
  // Env 管理
  // ========================================

  /**
   * 获取环境变量
   * @param {string} scope
   * @param {string} projectPath
   * @returns {Object} { key: value, ... }
   */
  getEnv(scope = 'global', projectPath = null) {
    const config = this._readConfig(scope, projectPath)
    return config.env && typeof config.env === 'object' ? { ...config.env } : {}
  }

  /**
   * 设置环境变量
   * @param {string} scope
   * @param {string} projectPath
   * @param {string} key - 变量名
   * @param {string} value - 变量值
   * @returns {Object} { success, error? }
   */
  setEnv(scope, projectPath, key, value) {
    try {
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Variable name is required' }
      }

      const config = this._readConfig(scope, projectPath)
      if (!config.env) config.env = {}
      config.env[key] = value
      this._writeConfig(scope, projectPath, config)
      return { success: true }
    } catch (err) {
      console.error('[SettingsManager] Failed to set env:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 删除环境变量
   * @param {string} scope
   * @param {string} projectPath
   * @param {string} key - 变量名
   * @returns {Object} { success, error? }
   */
  removeEnv(scope, projectPath, key) {
    try {
      const config = this._readConfig(scope, projectPath)
      if (!config.env || !(key in config.env)) {
        return { success: false, error: 'Variable not found' }
      }

      delete config.env[key]

      // 清理空 env 对象
      if (Object.keys(config.env).length === 0) {
        delete config.env
      }

      this._writeConfig(scope, projectPath, config)
      return { success: true }
    } catch (err) {
      console.error('[SettingsManager] Failed to remove env:', err)
      return { success: false, error: err.message }
    }
  }

  // ========================================
  // 综合查询
  // ========================================

  /**
   * 获取所有设置（全局 + 项目级）
   * @param {string} projectPath - 项目路径（可选）
   * @returns {Object}
   */
  getAllSettings(projectPath = null) {
    const globalConfig = this._readConfig('global')

    const result = {
      global: {
        permissions: this.getPermissions('global'),
        env: this.getEnv('global'),
        filePath: this.settingsPath
      },
      project: null
    }

    if (projectPath) {
      const projectFilePath = this._getConfigPath('project', projectPath)
      result.project = {
        permissions: this.getPermissions('project', projectPath),
        env: this.getEnv('project', projectPath),
        filePath: projectFilePath
      }
    }

    return result
  }

  // ========================================
  // Raw JSON 操作
  // ========================================

  /**
   * 获取原始 settings JSON
   * @param {string} scope
   * @param {string} projectPath
   * @returns {Object} { success, data, filePath }
   */
  getRawSettings(scope = 'global', projectPath = null) {
    try {
      const filePath = this._getConfigPath(scope, projectPath)
      const data = this._readConfig(scope, projectPath)
      return { success: true, data, filePath }
    } catch (err) {
      console.error('[SettingsManager] Failed to get raw settings:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 保存原始 settings JSON（完整覆盖）
   * @param {string} scope
   * @param {string} projectPath
   * @param {Object} data - 完整 JSON 对象
   * @returns {Object} { success, error? }
   */
  saveRawSettings(scope, projectPath, data) {
    try {
      if (!data || typeof data !== 'object') {
        return { success: false, error: 'Invalid data' }
      }

      const filePath = this._getConfigPath(scope, projectPath)
      this._ensureDir(filePath)
      atomicWriteJson(filePath, data)
      return { success: true }
    } catch (err) {
      console.error('[SettingsManager] Failed to save raw settings:', err)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { SettingsManager }

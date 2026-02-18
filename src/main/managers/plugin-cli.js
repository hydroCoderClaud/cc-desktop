/**
 * Plugin CLI Wrapper
 * 封装 Claude Code CLI 的 plugin 命令，提供安装/卸载/更新/列表功能
 */

const { execFile } = require('child_process')

class PluginCli {
  constructor() {
    this.timeout = 60000 // 60s timeout for network operations
  }

  /**
   * 获取可用插件列表（已安装 + 市场可用）
   * @returns {Promise<{installed: Array, available: Array}>}
   */
  async listAvailable() {
    try {
      const result = await this._exec(['plugin', 'list', '--available', '--json'])
      return { success: true, ...this._parseJson(result.stdout, { installed: [], available: [] }) }
    } catch (err) {
      console.error('[PluginCli] listAvailable error:', err)
      return { success: false, error: err.message || 'Failed to list available plugins' }
    }
  }

  /**
   * 安装插件
   * @param {string} pluginId - 插件 ID
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async install(pluginId) {
    if (!pluginId || typeof pluginId !== 'string') {
      throw new Error('Invalid plugin ID')
    }
    try {
      const result = await this._exec(['plugin', 'install', pluginId])
      return { success: true, message: result.stdout.trim() || 'Plugin installed successfully' }
    } catch (err) {
      console.error('[PluginCli] install error:', err)
      return { success: false, error: err.message || 'Failed to install plugin' }
    }
  }

  /**
   * 卸载插件
   * @param {string} pluginId - 插件 ID
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstall(pluginId) {
    if (!pluginId || typeof pluginId !== 'string') {
      throw new Error('Invalid plugin ID')
    }
    try {
      const result = await this._exec(['plugin', 'uninstall', pluginId])
      return { success: true, message: result.stdout.trim() || 'Plugin uninstalled successfully' }
    } catch (err) {
      console.error('[PluginCli] uninstall error:', err)
      return { success: false, error: err.message || 'Failed to uninstall plugin' }
    }
  }

  /**
   * 更新插件
   * @param {string} pluginId - 插件 ID
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async update(pluginId) {
    if (!pluginId || typeof pluginId !== 'string') {
      throw new Error('Invalid plugin ID')
    }
    try {
      const result = await this._exec(['plugin', 'update', pluginId])
      return { success: true, message: result.stdout.trim() || 'Plugin updated successfully' }
    } catch (err) {
      console.error('[PluginCli] update error:', err)
      return { success: false, error: err.message || 'Failed to update plugin' }
    }
  }

  /**
   * 获取市场列表
   * @returns {Promise<Array<{name: string, source: string, repo: string}>>}
   */
  async listMarketplaces() {
    try {
      const result = await this._exec(['plugin', 'marketplace', 'list', '--json'])
      return this._parseJson(result.stdout, [])
    } catch (err) {
      console.error('[PluginCli] listMarketplaces error:', err)
      throw new Error(err.message || 'Failed to list marketplaces')
    }
  }

  /**
   * 添加市场源
   * @param {string} source - GitHub repo (owner/repo)、URL 或本地路径
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async addMarketplace(source) {
    if (!source || typeof source !== 'string') {
      throw new Error('Invalid marketplace source')
    }
    try {
      const result = await this._exec(['plugin', 'marketplace', 'add', source])
      return { success: true, message: result.stdout.trim() || 'Marketplace added successfully' }
    } catch (err) {
      console.error('[PluginCli] addMarketplace error:', err)
      return { success: false, error: err.message || 'Failed to add marketplace' }
    }
  }

  /**
   * 移除市场源
   * @param {string} name - 市场名称
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async removeMarketplace(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid marketplace name')
    }
    try {
      const result = await this._exec(['plugin', 'marketplace', 'remove', name])
      return { success: true, message: result.stdout.trim() || 'Marketplace removed successfully' }
    } catch (err) {
      console.error('[PluginCli] removeMarketplace error:', err)
      return { success: false, error: err.message || 'Failed to remove marketplace' }
    }
  }

  /**
   * 更新市场索引
   * @param {string} [name] - 市场名称，为空则更新全部
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async updateMarketplace(name) {
    try {
      const args = ['plugin', 'marketplace', 'update']
      if (name && typeof name === 'string') {
        args.push(name)
      }
      const result = await this._exec(args)
      return { success: true, message: result.stdout.trim() || 'Marketplace updated successfully' }
    } catch (err) {
      console.error('[PluginCli] updateMarketplace error:', err)
      return { success: false, error: err.message || 'Failed to update marketplace' }
    }
  }

  /**
   * 执行 CLI 命令
   * @param {string[]} args - 命令参数
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
   */
  _exec(args) {
    return new Promise((resolve, reject) => {
      // 构建基础环境变量（增强 PATH，不包含 API 配置）
      // 插件命令只需要找到 claude 命令，不需要 API 认证
      const { buildBasicEnv } = require('../utils/env-builder')
      const env = buildBasicEnv({})

      const options = {
        timeout: this.timeout,
        maxBuffer: 1024 * 1024 * 5, // 5MB
        windowsHide: true,
        env  // 传递增强后的环境变量
      }

      execFile('claude', args, options, (error, stdout, stderr) => {
        if (error) {
          // Extract meaningful error message
          const rawMsg = stderr?.trim() || stdout?.trim() || error.message
          const errMsg = PluginCli._classifyCliError(rawMsg)
          const wrappedErr = new Error(errMsg)
          wrappedErr.exitCode = error.code
          wrappedErr.stderr = stderr
          wrappedErr.stdout = stdout
          reject(wrappedErr)
          return
        }
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: 0
        })
      })
    })
  }

  /**
   * 安全解析 JSON 输出
   * @param {string} text - CLI 输出文本
   * @param {*} fallback - 解析失败时的默认值
   * @returns {*}
   */
  _parseJson(text, fallback) {
    try {
      return JSON.parse(text)
    } catch {
      console.warn('[PluginCli] Failed to parse JSON output:', text?.substring(0, 200))
      return fallback
    }
  }

  /**
   * 将 CLI 错误信息分类为用户友好的中文提示
   * @param {string} rawMsg - CLI 原始错误信息
   * @returns {string}
   */
  static _classifyCliError(rawMsg) {
    if (!rawMsg) return '未知错误'
    const msg = rawMsg.toLowerCase()
    const NETWORK_HINT = '，请检查网络连接或尝试开启 VPN'
    if (msg.includes('econnreset') || msg.includes('read econnreset')) return '连接被重置' + NETWORK_HINT
    if (msg.includes('econnrefused')) return '连接被拒绝' + NETWORK_HINT
    if (msg.includes('enotfound')) return '无法解析服务器地址' + NETWORK_HINT
    if (msg.includes('etimedout') || msg.includes('timeout')) return '连接超时' + NETWORK_HINT
    if (msg.includes('econnaborted')) return '连接被中断' + NETWORK_HINT
    if (msg.includes('epipe')) return '连接已断开' + NETWORK_HINT
    if (msg.includes('ehostunreach')) return '服务器不可达' + NETWORK_HINT
    if (msg.includes('eai_again')) return 'DNS 解析失败' + NETWORK_HINT
    if (msg.includes('not found') || msg.includes('enoent')) return 'claude 命令未找到，请确认已安装 Claude Code CLI'
    if (msg.includes('permission denied') || msg.includes('eacces')) return '权限不足，请检查文件权限'
    return rawMsg
  }
}

module.exports = { PluginCli }

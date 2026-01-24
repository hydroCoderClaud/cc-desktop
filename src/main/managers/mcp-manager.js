/**
 * MCP Manager - MCP 服务器管理
 *
 * 四级来源:
 * - User: ~/.claude.json → mcpServers (跨项目共享)
 * - Local: ~/.claude.json → projects.<path>.mcpServers (项目私有)
 * - Project: <project>/.mcp.json → mcpServers (团队共享)
 * - Plugin: <plugin>/.mcp.json → mcpServers (插件自带，只读)
 *
 * 注意: MCP 服务器不需要用户手动调用，由 Claude Code 启动时自动加载
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { ComponentScanner } = require('../component-scanner')

// ~/.claude.json 路径
const CLAUDE_JSON_PATH = path.join(os.homedir(), '.claude.json')

class McpManager extends ComponentScanner {
  constructor() {
    super()
  }

  // ========================================
  // 文件操作
  // ========================================

  /**
   * 读取 ~/.claude.json
   * @returns {Object} 配置对象
   */
  readClaudeJson() {
    try {
      if (fs.existsSync(CLAUDE_JSON_PATH)) {
        return JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf-8'))
      }
    } catch (err) {
      console.error('[McpManager] Failed to read ~/.claude.json:', err)
    }
    return {}
  }

  /**
   * 写入 ~/.claude.json
   * @param {Object} config - 配置对象
   */
  writeClaudeJson(config) {
    try {
      fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2), 'utf-8')
    } catch (err) {
      console.error('[McpManager] Failed to write ~/.claude.json:', err)
      throw err
    }
  }

  /**
   * 规范化项目路径（统一使用正斜杠）
   * @param {string} projectPath - 项目路径
   * @returns {string} 规范化后的路径
   */
  normalizePath(projectPath) {
    return projectPath ? projectPath.replace(/\\/g, '/') : ''
  }

  // ========================================
  // 读取方法
  // ========================================

  /**
   * 获取 User scope MCP (跨项目共享)
   * @returns {Array} [{ name, config, source: 'user', category }]
   */
  listMcpUser() {
    const claudeJson = this.readClaudeJson()
    const mcpServers = claudeJson.mcpServers || {}

    return Object.entries(mcpServers).map(([name, config]) => ({
      name,
      config,
      source: 'user',
      category: 'User'
    }))
  }

  /**
   * 获取 Local scope MCP (项目私有)
   * @param {string} projectPath - 项目路径
   * @returns {Array} [{ name, config, source: 'local', category }]
   */
  listMcpLocal(projectPath) {
    if (!projectPath) return []

    const claudeJson = this.readClaudeJson()
    const normalizedPath = this.normalizePath(projectPath)
    const projectConfig = claudeJson.projects?.[normalizedPath] || {}
    const mcpServers = projectConfig.mcpServers || {}

    return Object.entries(mcpServers).map(([name, config]) => ({
      name,
      config,
      source: 'local',
      category: 'Local'
    }))
  }

  /**
   * 获取 Project scope MCP (团队共享)
   * @param {string} projectPath - 项目路径
   * @returns {Array} [{ name, config, source: 'project', category }]
   */
  listMcpProject(projectPath) {
    if (!projectPath) return []

    const mcpJsonPath = path.join(projectPath, '.mcp.json')
    try {
      if (fs.existsSync(mcpJsonPath)) {
        const content = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'))
        const mcpServers = content.mcpServers || content || {}

        // 如果顶层就是 mcpServers 的内容（无 mcpServers 包装）
        const servers = content.mcpServers ? content.mcpServers : content

        return Object.entries(servers).map(([name, config]) => ({
          name,
          config,
          source: 'project',
          category: 'Project'
        }))
      }
    } catch (err) {
      console.error('[McpManager] Failed to read .mcp.json:', err)
    }
    return []
  }

  /**
   * 获取 Plugin scope MCP (只读)
   * @returns {Array} [{ name, config, source: 'plugin', pluginId, category, readonly }]
   */
  listMcpPlugin() {
    const plugins = this.getEnabledPluginPaths()
    const result = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const mcpJsonPath = path.join(installPath, '.mcp.json')
      try {
        if (fs.existsSync(mcpJsonPath)) {
          const content = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'))
          const mcpServers = content.mcpServers || content || {}

          for (const [name, config] of Object.entries(mcpServers)) {
            result.push({
              name,
              config,
              source: 'plugin',
              category: pluginShortName || pluginId,
              pluginId,
              readonly: true
            })
          }
        }
      } catch (err) {
        // ignore
      }
    }

    return result
  }

  /**
   * 获取所有 MCP (四级)
   * @param {string} projectPath - 当前项目路径
   * @returns {Object} { user, local, project, plugin }
   */
  listMcpAll(projectPath) {
    return {
      user: this.listMcpUser(),
      local: this.listMcpLocal(projectPath),
      project: this.listMcpProject(projectPath),
      plugin: this.listMcpPlugin()
    }
  }

  // ========================================
  // 旧版兼容方法
  // ========================================

  /**
   * 获取插件 MCP (来自已安装插件) - 旧版兼容
   * @returns {Array} MCP 服务器列表
   */
  async getGlobalMcp() {
    return this.listMcpPlugin()
  }

  /**
   * 获取项目级 MCP - 旧版兼容
   * @param {string} projectPath - 项目根目录
   * @returns {Array} MCP 服务器列表
   */
  async getProjectMcp(projectPath) {
    return this.listMcpProject(projectPath)
  }

  /**
   * 获取所有 MCP (全局 + 项目级) - 旧版兼容
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Array} MCP 服务器列表
   */
  async getAllMcp(projectPath = null) {
    const all = this.listMcpAll(projectPath)
    // 合并为数组，顺序: user -> local -> project -> plugin
    return [...all.user, ...all.local, ...all.project, ...all.plugin]
  }

  // ========================================
  // CRUD 方法
  // ========================================

  /**
   * 创建 MCP Server
   * @param {Object} params - { scope: 'user'|'local'|'project', projectPath?, name, config }
   * @returns {Object} { success, error? }
   */
  createMcp({ scope, projectPath, name, config }) {
    try {
      if (!name || typeof name !== 'string') {
        return { success: false, error: 'Invalid MCP name' }
      }
      if (!config || typeof config !== 'object') {
        return { success: false, error: 'Invalid MCP config' }
      }

      if (scope === 'user') {
        const claudeJson = this.readClaudeJson()
        if (!claudeJson.mcpServers) claudeJson.mcpServers = {}
        if (claudeJson.mcpServers[name]) {
          return { success: false, error: `MCP "${name}" already exists in User scope` }
        }
        claudeJson.mcpServers[name] = config
        this.writeClaudeJson(claudeJson)

      } else if (scope === 'local') {
        if (!projectPath) {
          return { success: false, error: 'Project path required for Local scope' }
        }
        const claudeJson = this.readClaudeJson()
        const normalizedPath = this.normalizePath(projectPath)
        if (!claudeJson.projects) claudeJson.projects = {}
        if (!claudeJson.projects[normalizedPath]) claudeJson.projects[normalizedPath] = {}
        if (!claudeJson.projects[normalizedPath].mcpServers) {
          claudeJson.projects[normalizedPath].mcpServers = {}
        }
        if (claudeJson.projects[normalizedPath].mcpServers[name]) {
          return { success: false, error: `MCP "${name}" already exists in Local scope` }
        }
        claudeJson.projects[normalizedPath].mcpServers[name] = config
        this.writeClaudeJson(claudeJson)

      } else if (scope === 'project') {
        if (!projectPath) {
          return { success: false, error: 'Project path required for Project scope' }
        }
        const mcpJsonPath = path.join(projectPath, '.mcp.json')
        let content = {}
        if (fs.existsSync(mcpJsonPath)) {
          content = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'))
        }
        if (!content.mcpServers) content.mcpServers = {}
        if (content.mcpServers[name]) {
          return { success: false, error: `MCP "${name}" already exists in Project scope` }
        }
        content.mcpServers[name] = config
        fs.writeFileSync(mcpJsonPath, JSON.stringify(content, null, 2), 'utf-8')

      } else {
        return { success: false, error: `Invalid scope: ${scope}` }
      }

      return { success: true }
    } catch (err) {
      console.error('[McpManager] createMcp error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 更新 MCP Server
   * @param {Object} params - { scope, projectPath?, oldName, name, config }
   * @returns {Object} { success, error? }
   */
  updateMcp({ scope, projectPath, oldName, name, config }) {
    try {
      if (!oldName || typeof oldName !== 'string') {
        return { success: false, error: 'Invalid old MCP name' }
      }
      if (!name || typeof name !== 'string') {
        return { success: false, error: 'Invalid new MCP name' }
      }
      if (!config || typeof config !== 'object') {
        return { success: false, error: 'Invalid MCP config' }
      }

      if (scope === 'user') {
        const claudeJson = this.readClaudeJson()
        if (!claudeJson.mcpServers?.[oldName]) {
          return { success: false, error: 'MCP not found' }
        }
        // 如果改名，检查新名是否冲突
        if (oldName !== name && claudeJson.mcpServers[name]) {
          return { success: false, error: `MCP "${name}" already exists` }
        }
        delete claudeJson.mcpServers[oldName]
        claudeJson.mcpServers[name] = config
        this.writeClaudeJson(claudeJson)

      } else if (scope === 'local') {
        if (!projectPath) {
          return { success: false, error: 'Project path required for Local scope' }
        }
        const claudeJson = this.readClaudeJson()
        const normalizedPath = this.normalizePath(projectPath)
        const mcpServers = claudeJson.projects?.[normalizedPath]?.mcpServers
        if (!mcpServers?.[oldName]) {
          return { success: false, error: 'MCP not found' }
        }
        if (oldName !== name && mcpServers[name]) {
          return { success: false, error: `MCP "${name}" already exists` }
        }
        delete mcpServers[oldName]
        mcpServers[name] = config
        this.writeClaudeJson(claudeJson)

      } else if (scope === 'project') {
        if (!projectPath) {
          return { success: false, error: 'Project path required for Project scope' }
        }
        const mcpJsonPath = path.join(projectPath, '.mcp.json')
        if (!fs.existsSync(mcpJsonPath)) {
          return { success: false, error: 'MCP config file not found' }
        }
        const content = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'))
        if (!content.mcpServers?.[oldName]) {
          return { success: false, error: 'MCP not found' }
        }
        if (oldName !== name && content.mcpServers[name]) {
          return { success: false, error: `MCP "${name}" already exists` }
        }
        delete content.mcpServers[oldName]
        content.mcpServers[name] = config
        fs.writeFileSync(mcpJsonPath, JSON.stringify(content, null, 2), 'utf-8')

      } else {
        return { success: false, error: `Invalid scope: ${scope}` }
      }

      return { success: true }
    } catch (err) {
      console.error('[McpManager] updateMcp error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 删除 MCP Server
   * @param {Object} params - { scope, projectPath?, name }
   * @returns {Object} { success, error? }
   */
  deleteMcp({ scope, projectPath, name }) {
    try {
      if (!name || typeof name !== 'string') {
        return { success: false, error: 'Invalid MCP name' }
      }

      if (scope === 'user') {
        const claudeJson = this.readClaudeJson()
        if (!claudeJson.mcpServers?.[name]) {
          return { success: false, error: 'MCP not found' }
        }
        delete claudeJson.mcpServers[name]
        // 清理空对象
        if (Object.keys(claudeJson.mcpServers).length === 0) {
          delete claudeJson.mcpServers
        }
        this.writeClaudeJson(claudeJson)

      } else if (scope === 'local') {
        if (!projectPath) {
          return { success: false, error: 'Project path required for Local scope' }
        }
        const claudeJson = this.readClaudeJson()
        const normalizedPath = this.normalizePath(projectPath)
        const projectConfig = claudeJson.projects?.[normalizedPath]
        if (!projectConfig?.mcpServers?.[name]) {
          return { success: false, error: 'MCP not found' }
        }
        delete projectConfig.mcpServers[name]
        // 清理空对象
        if (Object.keys(projectConfig.mcpServers).length === 0) {
          delete projectConfig.mcpServers
        }
        if (Object.keys(projectConfig).length === 0) {
          delete claudeJson.projects[normalizedPath]
        }
        if (claudeJson.projects && Object.keys(claudeJson.projects).length === 0) {
          delete claudeJson.projects
        }
        this.writeClaudeJson(claudeJson)

      } else if (scope === 'project') {
        if (!projectPath) {
          return { success: false, error: 'Project path required for Project scope' }
        }
        const mcpJsonPath = path.join(projectPath, '.mcp.json')
        if (!fs.existsSync(mcpJsonPath)) {
          return { success: false, error: 'MCP config file not found' }
        }
        const content = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'))
        if (!content.mcpServers?.[name]) {
          return { success: false, error: 'MCP not found' }
        }
        delete content.mcpServers[name]
        // 清理空对象
        if (Object.keys(content.mcpServers).length === 0) {
          delete content.mcpServers
        }
        fs.writeFileSync(mcpJsonPath, JSON.stringify(content, null, 2), 'utf-8')

      } else {
        return { success: false, error: `Invalid scope: ${scope}` }
      }

      return { success: true }
    } catch (err) {
      console.error('[McpManager] deleteMcp error:', err)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { McpManager }

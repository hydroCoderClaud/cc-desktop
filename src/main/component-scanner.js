/**
 * Component Scanner - 组件扫描基础类
 * 提供扫描插件和项目目录中组件的通用功能
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const yaml = require('js-yaml')

class ComponentScanner {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.pluginsDir = path.join(this.claudeDir, 'plugins')
    this.installedPluginsPath = path.join(this.pluginsDir, 'installed_plugins.json')
    this.settingsPath = path.join(this.claudeDir, 'settings.json')
  }

  // ========================================
  // 插件注册表读取
  // ========================================

  /**
   * 读取已安装插件注册表
   * @returns {Object} { version, plugins: { pluginId: [installations] } }
   */
  _readInstalledPlugins() {
    try {
      if (!fs.existsSync(this.installedPluginsPath)) {
        return { version: 2, plugins: {} }
      }
      const content = fs.readFileSync(this.installedPluginsPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error('[ComponentScanner] Failed to read installed_plugins.json:', err)
      return { version: 2, plugins: {} }
    }
  }

  /**
   * 读取全局设置
   * @returns {Object}
   */
  _readSettings() {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        return {}
      }
      const content = fs.readFileSync(this.settingsPath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error('[ComponentScanner] Failed to read settings.json:', err)
      return {}
    }
  }

  /**
   * 读取启用的插件列表
   * @returns {Object} { pluginId: boolean }
   */
  _readEnabledPlugins() {
    const settings = this._readSettings()
    return settings.enabledPlugins || {}
  }

  /**
   * 获取所有已启用插件的安装路径
   * @returns {Array<{pluginId, pluginShortName, installPath}>}
   */
  getEnabledPluginPaths() {
    const installedPlugins = this._readInstalledPlugins()
    const enabledPlugins = this._readEnabledPlugins()
    const result = []

    if (!installedPlugins.plugins) return result

    for (const [pluginId, installations] of Object.entries(installedPlugins.plugins)) {
      // 检查是否启用 (默认启用)
      if (enabledPlugins[pluginId] === false) continue

      const installation = installations[0]
      if (!installation || !installation.installPath) continue

      const [pluginShortName] = pluginId.split('@')
      result.push({
        pluginId,
        pluginShortName,
        installPath: installation.installPath
      })
    }

    return result
  }

  // ========================================
  // 文件扫描通用方法
  // ========================================

  /**
   * 扫描目录中的 .md 文件
   * @param {string} dirPath - 目录路径
   * @returns {Array<{name, filePath, frontmatter}>}
   */
  scanMarkdownFiles(dirPath) {
    if (!fs.existsSync(dirPath)) return []

    const results = []
    try {
      const files = fs.readdirSync(dirPath)
      for (const file of files) {
        if (!file.endsWith('.md')) continue
        const name = file.replace('.md', '')
        const filePath = path.join(dirPath, file)
        const frontmatter = this._parseYamlFrontmatter(filePath)
        results.push({ name, filePath, frontmatter })
      }
    } catch (err) {
      console.error(`[ComponentScanner] Failed to scan directory ${dirPath}:`, err)
    }
    return results
  }

  /**
   * 扫描目录中包含 SKILL.md 或 skill.md 的子目录
   * @param {string} dirPath - 目录路径
   * @returns {Array<{id, skillPath, frontmatter}>}
   */
  scanSkillDirectories(dirPath) {
    if (!fs.existsSync(dirPath)) return []

    const results = []
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const item of items) {
        if (!item.isDirectory()) continue

        // 支持 SKILL.md 或 skill.md (大小写不敏感)
        const skillDir = path.join(dirPath, item.name)
        let skillMdPath = path.join(skillDir, 'SKILL.md')
        if (!fs.existsSync(skillMdPath)) {
          skillMdPath = path.join(skillDir, 'skill.md')
        }
        if (!fs.existsSync(skillMdPath)) continue

        const frontmatter = this._parseYamlFrontmatter(skillMdPath)
        results.push({
          id: item.name,  // 目录名作为 ID
          skillPath: skillDir,
          filePath: skillMdPath,  // SKILL.md 文件路径
          frontmatter
        })
      }
    } catch (err) {
      console.error(`[ComponentScanner] Failed to scan skill directories ${dirPath}:`, err)
    }
    return results
  }

  /**
   * 读取 JSON 文件
   * @param {string} filePath - 文件路径
   * @returns {Object|null}
   */
  readJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error(`[ComponentScanner] Failed to read JSON file ${filePath}:`, err)
      return null
    }
  }

  // ========================================
  // YAML Frontmatter 解析
  // ========================================

  /**
   * 解析 YAML frontmatter
   * @param {string} filePath - 文件路径
   * @returns {Object|null}
   */
  _parseYamlFrontmatter(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!match) return null

      return yaml.load(match[1]) || {}
    } catch (err) {
      console.error(`[ComponentScanner] Failed to parse YAML frontmatter: ${filePath}`, err.message)
      return null
    }
  }

  // ========================================
  // 项目级目录路径
  // ========================================

  /**
   * 获取项目级 .claude 目录路径
   * @param {string} projectPath - 项目根目录
   * @returns {string}
   */
  getProjectClaudeDir(projectPath) {
    return path.join(projectPath, '.claude')
  }
}

module.exports = { ComponentScanner }

/**
 * Skills Manager - 技能管理
 *
 * 调用方式: /plugin-name:skill-id (全局) 或 /skill-name (项目级)
 * 全局来源: 插件 skills/ 目录
 * 项目级别: .claude/skills/ 目录 (项目级 skills)
 */

const path = require('path')
const { ComponentScanner } = require('../component-scanner')

class SkillsManager extends ComponentScanner {
  constructor() {
    super()
  }

  /**
   * 获取全局 Skills (来自已安装插件)
   * @returns {Array} Skills 列表
   */
  async getGlobalSkills() {
    const plugins = this.getEnabledPluginPaths()
    const allSkills = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const skillsDir = path.join(installPath, 'skills')
      const skills = this.scanSkillDirectories(skillsDir)

      for (const skill of skills) {
        allSkills.push({
          id: skill.id,
          name: skill.frontmatter?.name || skill.id,
          description: skill.frontmatter?.description || '',
          // 完整调用名称: plugin-name:skill-id
          fullName: `${pluginShortName}:${skill.id}`,
          // 来源信息
          source: 'plugin',
          pluginId,
          pluginShortName,
          category: pluginShortName // 使用插件名作为分类
        })
      }
    }

    // 按插件名排序
    allSkills.sort((a, b) => a.pluginShortName.localeCompare(b.pluginShortName))
    return allSkills
  }

  /**
   * 获取项目级 Skills (来自 .claude/skills/ 目录)
   * @param {string} projectPath - 项目根目录
   * @returns {Array} Skills 列表
   */
  async getProjectSkills(projectPath) {
    if (!projectPath) return []

    const skillsDir = path.join(this.getProjectClaudeDir(projectPath), 'skills')
    const skills = this.scanSkillDirectories(skillsDir)

    return skills.map(skill => ({
      id: skill.id,
      name: skill.frontmatter?.name || skill.id,
      description: skill.frontmatter?.description || '',
      // 项目级 skill 格式: 直接使用 skill 名
      fullName: skill.id,
      // 来源信息
      source: 'project',
      projectPath,
      skillPath: skill.skillPath,
      category: '项目技能'
    }))
  }

  /**
   * 获取所有 Skills (全局 + 项目级)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Array} Skills 列表
   */
  async getAllSkills(projectPath = null) {
    const globalSkills = await this.getGlobalSkills()

    if (!projectPath) {
      return globalSkills
    }

    const projectSkills = await this.getProjectSkills(projectPath)

    // 项目级在前，全局在后
    return [...projectSkills, ...globalSkills]
  }
}

module.exports = { SkillsManager }

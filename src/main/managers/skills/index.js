/**
 * Skills Manager - 技能管理
 *
 * 三级 Skills 架构:
 * 1. 官方全局 (只读): 来自已安装插件 ~/.claude/plugins/{plugin}/skills/
 *    调用方式: /plugin-name:skill-id
 * 2. 自定义全局 (可编辑): 来自用户目录 ~/.claude/skills/
 *    调用方式: /skill-id
 * 3. 工程级别 (可编辑): 来自项目目录 {project}/.claude/skills/
 *    调用方式: /skill-id
 */

const path = require('path')
const { ComponentScanner } = require('../../component-scanner')

// 导入 mixins
const { skillsUtilsMixin } = require('./utils')
const { skillsCrudMixin } = require('./crud')
const { skillsImportMixin } = require('./import')
const { skillsExportMixin } = require('./export')

class SkillsManager extends ComponentScanner {
  constructor() {
    super()
    // 自定义全局 skills 目录
    this.userSkillsDir = path.join(this.claudeDir, 'skills')
  }
}

// 混入所有功能模块
Object.assign(SkillsManager.prototype, skillsUtilsMixin)
Object.assign(SkillsManager.prototype, skillsCrudMixin)
Object.assign(SkillsManager.prototype, skillsImportMixin)
Object.assign(SkillsManager.prototype, skillsExportMixin)

module.exports = { SkillsManager }

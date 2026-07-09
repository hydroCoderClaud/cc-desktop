/**
 * Skills Manager - 技能管理
 *
 * 三级 Skills 架构:
 * 1. 官方全局 (只读): 来自隔离 Claude 配置目录 plugins/{plugin}/skills/
 *    调用方式: /plugin-name:skill-id
 * 2. 自定义全局 (可编辑): 来自隔离 Claude 配置目录 skills/
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
const { skillsMarketMixin } = require('./market')

class SkillsManager extends ComponentScanner {
  get userSkillsDir() {
    return path.join(this.claudeDir, 'skills')
  }
}

// 混入所有功能模块
Object.assign(SkillsManager.prototype, skillsUtilsMixin)
Object.assign(SkillsManager.prototype, skillsCrudMixin)
Object.assign(SkillsManager.prototype, skillsImportMixin)
Object.assign(SkillsManager.prototype, skillsExportMixin)
Object.assign(SkillsManager.prototype, skillsMarketMixin)

module.exports = { SkillsManager }

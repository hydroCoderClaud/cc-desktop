/**
 * Skills Manager - 技能管理
 *
 * 此文件为向后兼容重导出，实际实现已拆分到 skills/ 目录:
 * - skills/utils.js   - 工具方法
 * - skills/crud.js    - CRUD 操作
 * - skills/import.js  - 导入功能
 * - skills/export.js  - 导出功能
 * - skills/index.js   - 入口文件
 */

const { SkillsManager } = require('./skills')

module.exports = { SkillsManager }

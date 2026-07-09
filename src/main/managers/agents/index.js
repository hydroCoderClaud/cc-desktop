/**
 * Agents Manager - 代理管理
 *
 * 三级 Agents 架构:
 * 1. 插件级 (只读): 来自隔离 Claude 配置目录 plugins/{plugin}/agents/
 *    自动触发，Claude 根据 description 自动选择
 * 2. 用户全局 (可编辑): 来自隔离 Claude 配置目录 agents/
 *    自动触发，Claude 根据 description 自动选择
 * 3. 工程级别 (可编辑): 来自项目目录 {project}/.claude/agents/
 *    自动触发，Claude 根据 description 自动选择
 *
 * 注意: Agents 是单个 .md 文件（不是目录），与 Skills 不同
 */

const path = require('path')
const { ComponentScanner } = require('../../component-scanner')

// 导入 mixins
const { agentsUtilsMixin } = require('./utils')
const { agentsCrudMixin } = require('./crud')
const { agentsImportMixin } = require('./import')
const { agentsExportMixin } = require('./export')
const { agentsMarketMixin } = require('./market')

class AgentsManager extends ComponentScanner {
  get userAgentsDir() {
    return path.join(this.claudeDir, 'agents')
  }
}

// 混入所有功能模块
Object.assign(AgentsManager.prototype, agentsUtilsMixin)
Object.assign(AgentsManager.prototype, agentsCrudMixin)
Object.assign(AgentsManager.prototype, agentsImportMixin)
Object.assign(AgentsManager.prototype, agentsExportMixin)
Object.assign(AgentsManager.prototype, agentsMarketMixin)

module.exports = { AgentsManager }

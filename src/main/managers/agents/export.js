/**
 * Agents Manager 导出功能
 * 提供 Agents 单个和批量导出功能
 *
 * 注意: Agent 是单个 .md 文件（不是目录）
 */

const fs = require('fs')
const path = require('path')
const { getAdmZip } = require('./utils')

const agentsExportMixin = {
  /**
   * 导出单个 Agent
   * @param {Object} params - { source, agentId, projectPath, exportPath, format: 'file'|'zip' }
   */
  async exportAgent(params) {
    const { source, agentId, projectPath, exportPath, format = 'file' } = params

    try {
      const agentPath = this._getAgentFilePath(source, agentId, projectPath)
      if (!fs.existsSync(agentPath)) {
        return { success: false, error: `Agent "${agentId}" 不存在` }
      }

      if (format === 'zip') {
        // 导出为 ZIP
        const zipPath = path.join(exportPath, `${agentId}.zip`)
        const AdmZip = getAdmZip()
        const zip = new AdmZip()
        zip.addLocalFile(agentPath)
        zip.writeZip(zipPath)
        console.log(`[AgentsManager] Exported agent to ZIP: ${zipPath}`)
        return { success: true, path: zipPath }
      } else {
        // 导出为文件
        const targetPath = path.join(exportPath, `${agentId}.md`)
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.copyFileSync(agentPath, targetPath)
        console.log(`[AgentsManager] Exported agent to file: ${targetPath}`)
        return { success: true, path: targetPath }
      }
    } catch (err) {
      console.error('[AgentsManager] Export failed:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 批量导出 Agents
   * @param {Object} params - { source, projectPath, exportPath, format, agentIds }
   */
  async exportAgentsBatch(params) {
    const { source, projectPath, exportPath, format = 'zip', agentIds } = params

    console.log('[AgentsManager] exportAgentsBatch called with:', { source, projectPath, exportPath, format, agentIds })

    try {
      // 获取要导出的 agents
      let agents
      if (source === 'user') {
        agents = await this.getUserAgents()
      } else if (source === 'project') {
        agents = await this.getProjectAgents(projectPath)
      } else {
        return { success: false, error: '不支持导出插件 agents' }
      }

      // 过滤选中的
      if (agentIds && agentIds.length > 0) {
        agents = agents.filter(a => agentIds.includes(a.id))
      }

      if (agents.length === 0) {
        return { success: false, error: '没有可导出的 agent' }
      }

      console.log('[AgentsManager] Agents to export:', agents.map(a => a.id))

      if (format === 'zip') {
        // 使用 adm-zip 同步创建 ZIP
        const AdmZip = getAdmZip()
        const zip = new AdmZip()

        for (const agent of agents) {
          const agentPath = this._getAgentFilePath(source, agent.id, projectPath)
          if (fs.existsSync(agentPath)) {
            zip.addLocalFile(agentPath)
          }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const zipPath = path.join(exportPath, `agents-export-${timestamp}.zip`)
        zip.writeZip(zipPath)

        console.log(`[AgentsManager] Batch exported ${agents.length} agents to ZIP: ${zipPath}`)
        return { success: true, path: zipPath, count: agents.length }
      } else {
        // 导出为文件夹
        fs.mkdirSync(exportPath, { recursive: true })
        for (const agent of agents) {
          const agentPath = this._getAgentFilePath(source, agent.id, projectPath)
          const targetPath = path.join(exportPath, `${agent.id}.md`)
          fs.copyFileSync(agentPath, targetPath)
        }
        console.log(`[AgentsManager] Batch exported ${agents.length} agents to folder: ${exportPath}`)
        return { success: true, path: exportPath, count: agents.length }
      }
    } catch (err) {
      console.error('[AgentsManager] Batch export failed:', err)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { agentsExportMixin }

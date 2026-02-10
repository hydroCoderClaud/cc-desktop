/**
 * Agents Manager 市场功能
 * 提供从远端注册表浏览、安装和更新 Agents 的功能
 *
 * Agents 是单个 .md 文件，元数据存储在 sidecar 目录 .market-meta/
 */

const fs = require('fs')
const path = require('path')
const { httpGet, classifyHttpError, isNewerVersion, isValidMarketId, isSafeFilename } = require('../../utils/http-client')

const MARKET_META_DIR = '.market-meta'

const agentsMarketMixin = {
  /**
   * 下载并安装单个市场 Agent
   * @param {{ registryUrl: string, agent: Object }} params
   * @returns {{ success: boolean, agentId?: string, error?: string, conflict?: boolean }}
   */
  async installMarketAgent({ registryUrl, agent }) {
    if (!registryUrl || !agent || !agent.id) {
      return { success: false, error: '参数不完整' }
    }

    if (!isValidMarketId(agent.id)) {
      return { success: false, error: `非法的 Agent ID: "${agent.id}"` }
    }

    const baseUrl = registryUrl.replace(/\/+$/, '')

    try {
      // 1. 下载 agent .md 文件
      const file = agent.file || `${agent.id}.md`
      if (!isSafeFilename(file)) {
        return { success: false, error: `非法的文件名: "${file}"` }
      }
      const fileUrl = `${baseUrl}/agents/${file}`
      console.log(`[AgentsManager] Downloading: ${fileUrl}`)
      const content = await httpGet(fileUrl)

      if (!content || content.trim().length === 0) {
        return { success: false, error: 'Agent 文件内容为空' }
      }

      // 2. 冲突检测
      const targetPath = path.join(this.userAgentsDir, `${agent.id}.md`)
      if (fs.existsSync(targetPath)) {
        return { success: false, error: `Agent "${agent.id}" 已存在`, conflict: true }
      }

      // 3. 确保目录存在并写入文件
      fs.mkdirSync(this.userAgentsDir, { recursive: true })
      fs.writeFileSync(targetPath, content, 'utf-8')

      // 4. 写入市场元数据
      this._writeAgentMarketMeta(agent.id, {
        source: 'market',
        registryUrl: baseUrl,
        version: agent.version || '0.0.0',
        installedAt: new Date().toISOString()
      })

      console.log(`[AgentsManager] Installed market agent: ${agent.id} v${agent.version}`)
      return { success: true, agentId: agent.id }
    } catch (err) {
      console.error('[AgentsManager] Install market agent failed:', err)
      return { success: false, error: classifyHttpError(err) }
    }
  },

  /**
   * 强制覆盖安装市场 Agent
   */
  async installMarketAgentForce({ registryUrl, agent }) {
    if (!agent || !agent.id) {
      return { success: false, error: '参数不完整' }
    }

    // 先删除已有文件
    const targetPath = path.join(this.userAgentsDir, `${agent.id}.md`)
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath)
      console.log(`[AgentsManager] Removed existing agent for force install: ${agent.id}`)
    }

    return this.installMarketAgent({ registryUrl, agent })
  },

  /**
   * 获取所有已安装的市场 Agents 元数据
   * @returns {Array<{agentId, version, registryUrl, installedAt}>}
   */
  getMarketInstalledAgents() {
    const results = []
    try {
      const metaDir = path.join(this.userAgentsDir, MARKET_META_DIR)
      if (!fs.existsSync(metaDir)) return results

      const entries = fs.readdirSync(metaDir)
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue
        try {
          const metaPath = path.join(metaDir, entry)
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
          const agentId = entry.replace(/\.json$/, '')
          results.push({
            agentId,
            version: meta.version,
            registryUrl: meta.registryUrl,
            installedAt: meta.installedAt
          })
        } catch (e) {
          // 忽略解析错误
        }
      }
    } catch (err) {
      console.error('[AgentsManager] Failed to scan market installed agents:', err)
    }
    return results
  },

  /**
   * 检查已安装市场 Agents 的更新
   * @param {string} registryUrl - 注册表 URL
   * @param {Array} remoteAgents - 远端 agents 列表（从 index.json 获取）
   * @returns {{ success: boolean, updates?: Array, error?: string }}
   */
  async checkAgentMarketUpdates(registryUrl, remoteAgents) {
    try {
      const installed = this.getMarketInstalledAgents()

      const updates = []
      for (const local of installed) {
        const remote = remoteAgents.find(a => a.id === local.agentId)
        if (remote && isNewerVersion(remote.version, local.version)) {
          updates.push({
            agentId: local.agentId,
            localVersion: local.version,
            remoteVersion: remote.version,
            agent: remote
          })
        }
      }

      return { success: true, updates }
    } catch (err) {
      console.error('[AgentsManager] Check updates failed:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 更新已安装的市场 Agent
   */
  async updateMarketAgent({ registryUrl, agent }) {
    return this.installMarketAgentForce({ registryUrl, agent })
  },

  // ========== 内部方法 ==========

  /**
   * 读取 agent 市场元数据
   * @param {string} agentId
   * @returns {Object|null}
   */
  _readAgentMarketMeta(agentId) {
    try {
      const metaPath = path.join(this.userAgentsDir, MARKET_META_DIR, `${agentId}.json`)
      if (!fs.existsSync(metaPath)) return null
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch (e) {
      return null
    }
  },

  /**
   * 写入 agent 市场元数据
   * @param {string} agentId
   * @param {Object} meta
   */
  _writeAgentMarketMeta(agentId, meta) {
    const metaDir = path.join(this.userAgentsDir, MARKET_META_DIR)
    fs.mkdirSync(metaDir, { recursive: true })
    const metaPath = path.join(metaDir, `${agentId}.json`)
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
  },

  /**
   * 删除 agent 市场元数据
   * @param {string} agentId
   */
  _deleteAgentMarketMeta(agentId) {
    try {
      const metaPath = path.join(this.userAgentsDir, MARKET_META_DIR, `${agentId}.json`)
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath)
        console.log(`[AgentsManager] Removed market meta for: ${agentId}`)
      }
    } catch (e) {
      console.warn(`[AgentsManager] Failed to remove market meta for ${agentId}:`, e.message)
    }
  }
}

module.exports = { agentsMarketMixin }

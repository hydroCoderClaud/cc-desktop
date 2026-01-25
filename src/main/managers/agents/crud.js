/**
 * Agents Manager CRUD 操作
 * 提供 Agent 的增删改查功能
 *
 * 注意: Agent 是单个 .md 文件（不是目录）
 */

const fs = require('fs')
const path = require('path')

const agentsCrudMixin = {
  // ========== 获取 Agents ==========

  /**
   * 获取用户全局 Agents (来自 ~/.claude/agents/，可编辑)
   */
  async getUserAgents() {
    const agents = this.scanMarkdownFiles(this.userAgentsDir)
    return agents.map(agent => this._mapAgentToItem(agent, {
      source: 'user',
      editable: true,
      category: '自定义全局'
    }))
  },

  /**
   * 获取工程级 Agents (来自 {project}/.claude/agents/，可编辑)
   */
  async getProjectAgents(projectPath) {
    if (!projectPath) return []
    const agentsDir = path.join(this.getProjectClaudeDir(projectPath), 'agents')
    const agents = this.scanMarkdownFiles(agentsDir)
    return agents.map(agent => this._mapAgentToItem(agent, {
      source: 'project',
      editable: true,
      category: '项目代理',
      extraFields: { projectPath }
    }))
  },

  /**
   * 获取插件级 Agents (来自已安装插件，只读)
   */
  async getPluginAgents() {
    const plugins = this.getEnabledPluginPaths()
    const allAgents = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const agentsDir = path.join(installPath, 'agents')
      const agents = this.scanMarkdownFiles(agentsDir)

      for (const agent of agents) {
        allAgents.push(this._mapAgentToItem(agent, {
          source: 'plugin',
          editable: false,
          category: pluginShortName,
          fullNameFn: a => `${pluginShortName}:${a.id}`,  // 此时 a.id 已由 _mapAgentToItem 正确设置
          extraFields: { pluginId, pluginShortName }
        }))
      }
    }

    allAgents.sort((a, b) => a.pluginShortName.localeCompare(b.pluginShortName))
    return allAgents
  },

  /**
   * 获取所有 Agents (三级分类)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Object} { user, project, plugin } 三级分类的 Agents
   */
  async getAllAgents(projectPath = null) {
    const user = await this.getUserAgents()
    const project = projectPath ? await this.getProjectAgents(projectPath) : []
    const plugin = await this.getPluginAgents()

    return {
      user,
      project,
      plugin,
      // 兼容旧接口: 返回扁平列表
      all: [...project, ...user, ...plugin]
    }
  },

  // ========== CRUD 操作 ==========

  /**
   * 删除 Agent
   */
  async deleteAgent(params) {
    try {
      const validation = this._validateAgentParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, agentId, projectPath } = params
      const agentPath = this._getAgentFilePath(source, agentId, projectPath)

      if (!fs.existsSync(agentPath)) {
        return { success: false, error: `Agent "${agentId}" 不存在` }
      }

      fs.unlinkSync(agentPath)
      console.log(`[AgentsManager] Deleted agent: ${agentId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[AgentsManager] Failed to delete agent:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 读取 Agent 原始内容（完整的 .md 文件）
   */
  async getAgentRawContent(params) {
    try {
      const validation = this._validateAgentParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, agentId, projectPath, agentPath: providedPath } = params

      let agentPath
      if ((source === 'plugin') && providedPath) {
        agentPath = providedPath
      } else {
        agentPath = this._getAgentFilePath(source, agentId, projectPath)
      }

      if (!fs.existsSync(agentPath)) {
        return { success: false, error: `Agent "${agentId}" 不存在` }
      }

      const content = fs.readFileSync(agentPath, 'utf-8')
      return { success: true, content, agentPath }
    } catch (err) {
      console.error('[AgentsManager] Failed to get agent raw content:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 创建 Agent（原始内容模式）
   */
  async createAgentRaw(params) {
    try {
      const { source, agentId, rawContent, projectPath } = params

      if (!agentId) {
        return { success: false, error: '缺少必要参数: agentId' }
      }
      if (!/^[a-zA-Z0-9-]+$/.test(agentId)) {
        return { success: false, error: 'Agent ID 只能包含字母、数字和连字符' }
      }

      const agentPath = this._getAgentFilePath(source, agentId, projectPath)
      if (fs.existsSync(agentPath)) {
        return { success: false, error: `Agent "${agentId}" 已存在` }
      }

      // 确保目录存在
      fs.mkdirSync(path.dirname(agentPath), { recursive: true })
      fs.writeFileSync(agentPath, rawContent || '', 'utf-8')

      console.log(`[AgentsManager] Created agent (raw): ${agentId} (${source})`)
      return { success: true, agentPath }
    } catch (err) {
      console.error('[AgentsManager] Failed to create agent (raw):', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 更新 Agent（原始内容模式）
   */
  async updateAgentRaw(params) {
    try {
      const { source, agentId, rawContent, projectPath, agentPath: providedPath } = params

      if (!agentId) {
        return { success: false, error: '缺少必要参数: agentId' }
      }

      // 获取 agent 文件路径：插件来源使用传入的 agentPath，其他来源计算路径
      let agentPath
      if (source === 'plugin' && providedPath) {
        agentPath = providedPath
      } else {
        agentPath = this._getAgentFilePath(source, agentId, projectPath)
      }

      if (!fs.existsSync(agentPath)) {
        return { success: false, error: `Agent "${agentId}" 不存在` }
      }

      fs.writeFileSync(agentPath, rawContent || '', 'utf-8')

      console.log(`[AgentsManager] Updated agent (raw): ${agentId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[AgentsManager] Failed to update agent (raw):', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 复制 Agent
   */
  async copyAgent(params) {
    try {
      const validation = this._validateAgentParams(params, ['agentId', 'fromSource', 'toSource'])
      if (!validation.valid) return { success: false, error: validation.error }

      const { fromSource, agentId, toSource, projectPath, newAgentId, fromPath } = params

      // 获取源文件路径
      let sourcePath
      if (fromSource === 'plugin' && fromPath) {
        sourcePath = fromPath
      } else {
        sourcePath = this._getAgentFilePath(fromSource, agentId, projectPath)
      }

      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: `源代理 "${agentId}" 不存在` }
      }

      const targetAgentId = newAgentId || agentId
      const targetPath = this._getAgentFilePath(toSource, targetAgentId, projectPath)

      if (fs.existsSync(targetPath)) {
        return { success: false, error: `目标位置已存在 Agent "${targetAgentId}"` }
      }

      // 确保目标目录存在并复制
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })

      // 读取源内容
      let content = fs.readFileSync(sourcePath, 'utf-8')

      // 如果改了 ID，更新 frontmatter 中的 name 字段（只在 frontmatter 内替换）
      if (newAgentId && newAgentId !== agentId) {
        const frontmatterMatch = content.match(/^(---\s*\n)([\s\S]*?)(\n---\s*\n)/)
        if (frontmatterMatch) {
          const [fullMatch, start, yaml, end] = frontmatterMatch
          const updatedYaml = yaml.replace(/^(\s*name:\s*)(.*)$/m, `$1${newAgentId}`)
          content = content.replace(fullMatch, start + updatedYaml + end)
        }
      }

      fs.writeFileSync(targetPath, content, 'utf-8')

      const actionText = fromSource === 'project' ? '升级到全局' : '复制到项目'
      console.log(`[AgentsManager] ${actionText}: ${agentId} → ${targetAgentId}`)
      return { success: true }
    } catch (err) {
      console.error('[AgentsManager] Failed to copy agent:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 重命名 Agent（只重命名文件，内容由 updateAgentRaw 处理）
   */
  async renameAgent(params) {
    try {
      const { source, oldAgentId, newAgentId, projectPath } = params

      if (!oldAgentId || !newAgentId) {
        return { success: false, error: '缺少必要参数: oldAgentId 或 newAgentId' }
      }

      if (!/^[a-zA-Z0-9-]+$/.test(newAgentId)) {
        return { success: false, error: 'Agent ID 只能包含字母、数字和连字符' }
      }

      const oldPath = this._getAgentFilePath(source, oldAgentId, projectPath)
      const newPath = this._getAgentFilePath(source, newAgentId, projectPath)

      if (!fs.existsSync(oldPath)) {
        return { success: false, error: `Agent "${oldAgentId}" 不存在` }
      }

      if (fs.existsSync(newPath)) {
        return { success: false, error: `Agent "${newAgentId}" 已存在` }
      }

      // 重命名文件
      fs.renameSync(oldPath, newPath)

      console.log(`[AgentsManager] Renamed agent: ${oldAgentId} → ${newAgentId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[AgentsManager] Failed to rename agent:', err)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { agentsCrudMixin }

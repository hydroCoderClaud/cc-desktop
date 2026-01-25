/**
 * Agents Manager 导入功能
 * 提供 Agents 校验和导入功能
 *
 * 注意: Agent 是单个 .md 文件（不是目录）
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { getAdmZip } = require('./utils')

const agentsImportMixin = {
  /**
   * 校验单个 agent 文件的合法性
   * @returns {{ valid: boolean, error?: string, agentId?: string, name?: string }}
   */
  validateAgentFile(filePath) {
    const fileName = path.basename(filePath)
    const agentId = path.basename(filePath, '.md')

    // 1. 检查是否是 .md 文件
    if (!fileName.endsWith('.md')) {
      return { valid: false, error: `"${fileName}" 不是 .md 文件` }
    }

    // 2. 检查 agentId 格式
    if (!/^[a-zA-Z0-9-]+$/.test(agentId)) {
      return { valid: false, error: `文件名 "${agentId}" 不合法，只能包含字母、数字和连字符` }
    }

    // 3. 检查文件是否存在
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return { valid: false, error: `"${fileName}" 不是有效的文件` }
    }

    // 4. 解析 frontmatter
    const frontmatter = this._parseYamlFrontmatter(filePath)
    if (!frontmatter) {
      return { valid: false, error: `"${fileName}" 缺少有效的 YAML frontmatter` }
    }

    const name = frontmatter.name || agentId

    return { valid: true, agentId, name, frontmatter, filePath }
  },

  /**
   * 校验导入源（文件数组、单个文件、文件夹或 ZIP）
   * @param {string|string[]} sourcePath - 文件路径数组、单个文件路径、文件夹路径或 ZIP 文件路径
   * @returns {{ valid: boolean, type: 'files'|'file'|'folder'|'zip', agents: Array, errors: Array }}
   */
  async validateAgentImportSource(sourcePath) {
    const result = { valid: true, type: null, agents: [], errors: [] }

    // 处理文件数组（多选文件）
    if (Array.isArray(sourcePath)) {
      result.type = 'files'
      for (const filePath of sourcePath) {
        if (!fs.existsSync(filePath)) {
          result.errors.push(`文件不存在: ${path.basename(filePath)}`)
          continue
        }
        const validation = this.validateAgentFile(filePath)
        if (validation.valid) {
          result.agents.push({ ...validation, sourcePath: filePath })
        } else {
          result.errors.push(validation.error)
        }
      }
      if (result.agents.length === 0) {
        result.valid = false
        if (result.errors.length === 0) {
          result.errors.push('未找到有效的 agent 文件')
        }
      }
      return result
    }

    if (!fs.existsSync(sourcePath)) {
      return { valid: false, errors: ['源路径不存在'], agents: [] }
    }

    const stat = fs.statSync(sourcePath)
    const isZip = sourcePath.toLowerCase().endsWith('.zip')

    if (isZip) {
      // ZIP 文件处理
      result.type = 'zip'
      try {
        const zip = new (getAdmZip())(sourcePath)
        const tempDir = path.join(os.tmpdir(), `agent-import-${Date.now()}`)
        zip.extractAllTo(tempDir, true)

        // 扫描解压后的 .md 文件
        const entries = fs.readdirSync(tempDir, { withFileTypes: true })
        const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'))

        if (mdFiles.length === 0) {
          // 可能在子目录中
          const dirs = entries.filter(e => e.isDirectory())
          for (const dir of dirs) {
            const subDir = path.join(tempDir, dir.name)
            const subEntries = fs.readdirSync(subDir, { withFileTypes: true })
            const subMdFiles = subEntries.filter(e => e.isFile() && e.name.endsWith('.md'))
            for (const file of subMdFiles) {
              const filePath = path.join(subDir, file.name)
              const validation = this.validateAgentFile(filePath)
              if (validation.valid) {
                result.agents.push({ ...validation, sourcePath: filePath })
              } else {
                result.errors.push(validation.error)
              }
            }
          }
        } else {
          for (const file of mdFiles) {
            const filePath = path.join(tempDir, file.name)
            const validation = this.validateAgentFile(filePath)
            if (validation.valid) {
              result.agents.push({ ...validation, sourcePath: filePath })
            } else {
              result.errors.push(validation.error)
            }
          }
        }

        if (result.agents.length === 0) {
          result.valid = false
          result.errors.push('ZIP 文件中未找到有效的 agent 文件')
        }

        result._tempDir = tempDir
      } catch (err) {
        result.valid = false
        result.errors.push(`解压 ZIP 失败: ${err.message}`)
      }
    } else if (stat.isFile() && sourcePath.endsWith('.md')) {
      // 单个 .md 文件
      result.type = 'file'
      const validation = this.validateAgentFile(sourcePath)
      if (validation.valid) {
        result.agents.push({ ...validation, sourcePath })
      } else {
        result.valid = false
        result.errors.push(validation.error)
      }
    } else if (stat.isDirectory()) {
      // 文件夹处理
      result.type = 'folder'
      const entries = fs.readdirSync(sourcePath, { withFileTypes: true })
      const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'))

      for (const file of mdFiles) {
        const filePath = path.join(sourcePath, file.name)
        const validation = this.validateAgentFile(filePath)
        if (validation.valid) {
          result.agents.push({ ...validation, sourcePath: filePath })
        }
        // 忽略无效文件，不报错
      }

      if (result.agents.length === 0) {
        result.valid = false
        result.errors.push('目录中未找到有效的 agent 文件')
      }
    } else {
      result.valid = false
      result.errors.push('源路径必须是文件夹、.md 文件或 .zip 文件')
    }

    return result
  },

  /**
   * 检测导入冲突（只检测 ID 冲突，name 允许重复）
   * @param {Object} params - { agents: Array<{agentId, name}>, projectPath }
   * @returns {{ results: Array<{agentId, name, canImport, reason}> }}
   */
  async checkAgentImportConflicts(params) {
    const { agents, projectPath } = params
    const results = []

    // 获取现有的全局和项目代理
    const userAgents = await this.getUserAgents()
    const projectAgents = projectPath ? await this.getProjectAgents(projectPath) : []

    // 构建现有的 id 集合（只检查 ID，不检查 name）
    const existingIds = new Map()  // id -> { source, name }

    for (const agent of userAgents) {
      existingIds.set(agent.id, { source: 'user', name: agent.name })
    }

    for (const agent of projectAgents) {
      existingIds.set(agent.id, { source: 'project', name: agent.name })
    }

    // 检查每个待导入的 agent
    for (const agent of agents) {
      const { agentId, name } = agent

      // 只检查 ID 冲突
      if (existingIds.has(agentId)) {
        const existing = existingIds.get(agentId)
        const sourceText = existing.source === 'user' ? '全局' : '项目'
        results.push({
          agentId,
          name,
          canImport: false,
          reason: `${sourceText}已存在同 ID 代理`
        })
        continue
      }

      // 无冲突
      results.push({
        agentId,
        name,
        canImport: true,
        reason: null
      })
    }

    return { results }
  },

  /**
   * 导入 Agents（简化版：冲突直接跳过）
   * @param {Object} params - { sourcePath, targetSource, projectPath, selectedAgentIds }
   */
  async importAgents(params) {
    const { sourcePath, targetSource, projectPath, selectedAgentIds } = params

    try {
      // 1. 校验源
      const validation = await this.validateAgentImportSource(sourcePath)
      if (!validation.valid) {
        return { success: false, errors: validation.errors }
      }

      // 2. 过滤选中的 agents
      let agentsToImport = validation.agents
      if (selectedAgentIds && selectedAgentIds.length > 0) {
        agentsToImport = agentsToImport.filter(a => selectedAgentIds.includes(a.agentId))
      }

      if (agentsToImport.length === 0) {
        return { success: false, errors: ['没有可导入的 agent'] }
      }

      // 3. 检测冲突
      const conflictCheck = await this.checkAgentImportConflicts({
        agents: agentsToImport,
        projectPath
      })

      // 4. 执行导入
      const results = { imported: [], skipped: [], errors: [] }

      for (const agent of agentsToImport) {
        // 查找冲突检测结果
        const checkResult = conflictCheck.results.find(r => r.agentId === agent.agentId)

        if (checkResult && !checkResult.canImport) {
          results.skipped.push({ agentId: agent.agentId, name: agent.name, reason: checkResult.reason })
          continue
        }

        const targetPath = this._getAgentFilePath(targetSource, agent.agentId, projectPath)

        try {
          // 确保目录存在
          fs.mkdirSync(path.dirname(targetPath), { recursive: true })

          // 复制文件
          fs.copyFileSync(agent.sourcePath, targetPath)

          results.imported.push({ agentId: agent.agentId, name: agent.name })
        } catch (err) {
          results.errors.push({ agentId: agent.agentId, error: err.message })
        }
      }

      // 5. 清理临时目录（失败不影响导入结果）
      if (validation._tempDir && fs.existsSync(validation._tempDir)) {
        try {
          fs.rmSync(validation._tempDir, { recursive: true, force: true })
        } catch (cleanupErr) {
          console.warn('[AgentsManager] Failed to cleanup temp directory:', cleanupErr.message)
        }
      }

      console.log(`[AgentsManager] Import complete: ${results.imported.length} imported, ${results.skipped.length} skipped`)
      return { success: true, ...results }
    } catch (err) {
      console.error('[AgentsManager] Import failed:', err)
      return { success: false, errors: [err.message] }
    }
  }
}

module.exports = { agentsImportMixin }

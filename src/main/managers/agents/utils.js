/**
 * Agents Manager 工具方法
 * 提供通用的文件操作、验证和辅助方法
 *
 * 注意: Agent 是单个 .md 文件（不是目录）
 */

const fs = require('fs')
const path = require('path')

// ========== 懒加载依赖 ==========

let AdmZip = null
let archiver = null

function getAdmZip() {
  if (!AdmZip) {
    try {
      AdmZip = require('adm-zip')
    } catch (err) {
      console.error('[AgentsManager] adm-zip not available:', err.message)
      throw new Error('adm-zip 模块未安装，请运行 npm install adm-zip')
    }
  }
  return AdmZip
}

function getArchiver() {
  if (!archiver) {
    try {
      archiver = require('archiver')
    } catch (err) {
      console.error('[AgentsManager] archiver not available:', err.message)
      throw new Error('archiver 模块未安装，请运行 npm install archiver')
    }
  }
  return archiver
}

// ========== Agents Manager Utils Mixin ==========

const agentsUtilsMixin = {
  /**
   * 通用 Agent 映射方法
   */
  _mapAgentToItem(agent, options = {}) {
    const { source, editable, category, fullNameFn, extraFields } = options
    // 注意: scanMarkdownFiles 返回 { name, filePath, frontmatter }，其中 name 是文件名（不含 .md）
    const agentId = agent.name  // 文件名即为 ID
    return {
      id: agentId,
      name: agent.frontmatter?.name || agentId,
      description: agent.frontmatter?.description || '',
      model: agent.frontmatter?.model || 'inherit',
      color: agent.frontmatter?.color || 'blue',
      fullName: fullNameFn ? fullNameFn({ ...agent, id: agentId }) : agentId,
      source,
      editable,
      agentPath: agent.filePath,
      category,
      invocationType: 'auto', // Agents 自动触发
      disabled: agent.disabled || false,
      ...extraFields
    }
  },

  /**
   * 验证必要参数
   */
  _validateAgentParams(params, requiredFields = ['agentId', 'source']) {
    for (const field of requiredFields) {
      if (!params[field]) {
        return { valid: false, error: `缺少必要参数: ${field}` }
      }
    }
    return { valid: true }
  },

  /**
   * 获取 agent 文件路径
   * @param {string} source - 来源: 'user' | 'project'
   * @param {string} agentId - Agent ID (文件名不含 .md)
   * @param {string} projectPath - 项目路径 (source='project' 时必需)
   * @returns {string} Agent 文件的完整路径
   */
  _getAgentFilePath(source, agentId, projectPath = null) {
    if (source === 'user') {
      return path.join(this.userAgentsDir, `${agentId}.md`)
    } else if (source === 'project' && projectPath) {
      return path.join(this.getProjectClaudeDir(projectPath), 'agents', `${agentId}.md`)
    }
    throw new Error('Invalid source or missing projectPath')
  },

  /**
   * 获取 agents 目录路径
   */
  _getAgentsDir(source, projectPath = null) {
    if (source === 'user') {
      return this.userAgentsDir
    } else if (source === 'project' && projectPath) {
      return path.join(this.getProjectClaudeDir(projectPath), 'agents')
    }
    throw new Error('Invalid source or missing projectPath')
  },

  /**
   * 生成 Agent .md 文件内容
   */
  _generateAgentMd(frontmatter, body = '') {
    const lines = ['---']

    // 常用字段顺序
    const orderedFields = ['name', 'description', 'model', 'color', 'tools', 'disallowedTools', 'permissionMode', 'skills', 'hooks']

    for (const field of orderedFields) {
      if (frontmatter[field] !== undefined && frontmatter[field] !== null && frontmatter[field] !== '') {
        const value = frontmatter[field]
        if (Array.isArray(value)) {
          if (value.length > 0) {
            lines.push(`${field}:`)
            for (const item of value) {
              lines.push(`  - ${item}`)
            }
          }
        } else {
          lines.push(`${field}: ${value}`)
        }
      }
    }

    // 其他未列出的字段
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!orderedFields.includes(key) && value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            lines.push(`${key}:`)
            for (const item of value) {
              lines.push(`  - ${item}`)
            }
          }
        } else {
          lines.push(`${key}: ${value}`)
        }
      }
    }

    lines.push('---')
    lines.push('')
    lines.push(body)

    return lines.join('\n')
  },

  /**
   * 提取 markdown 文件的 body 内容 (去除 frontmatter)
   */
  _extractAgentBody(content) {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
    return match ? match[1].trim() : content.trim()
  },

  /**
   * 复制单个文件
   */
  _copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  },

  /**
   * 创建 ZIP 文件（用于批量导出多个 agent 文件）
   */
  _createAgentsZip(agentFiles, zipPath) {
    const AdmZip = getAdmZip()
    const zip = new AdmZip()

    for (const { filePath, fileName } of agentFiles) {
      if (fs.existsSync(filePath)) {
        zip.addLocalFile(filePath, '', fileName)
      }
    }

    zip.writeZip(zipPath)
  }
}

module.exports = {
  agentsUtilsMixin,
  getAdmZip,
  getArchiver
}

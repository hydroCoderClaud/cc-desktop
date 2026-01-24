/**
 * Commands Manager - 命令管理
 *
 * 三级 Commands 架构:
 * 1. 插件命令 (只读): 来自已安装插件 ~/.claude/plugins/{plugin}/commands/
 *    调用方式: /plugin-name:command-name
 * 2. 用户命令 (可编辑): 来自用户目录 ~/.claude/commands/
 *    调用方式: /command-name
 * 3. 项目命令 (可编辑): 来自项目目录 {project}/.claude/commands/
 *    调用方式: /command-name
 *
 * 与 Skills 的区别: Command 是单个 .md 文件，Skill 是文件夹
 */

const path = require('path')
const { ComponentScanner } = require('../../component-scanner')

// 导入 mixins
const { commandsCrudMixin } = require('./crud')
const { commandsImportMixin } = require('./import')
const { commandsExportMixin } = require('./export')

class CommandsManager extends ComponentScanner {
  constructor() {
    super()
    // 用户级 commands 目录
    this.userCommandsDir = path.join(this.claudeDir, 'commands')
  }

  // ========== 工具方法 ==========

  /**
   * 获取 command 文件路径
   */
  _getCommandPath(source, commandId, projectPath = null) {
    if (source === 'user') {
      return path.join(this.userCommandsDir, `${commandId}.md`)
    } else if (source === 'project' && projectPath) {
      return path.join(this.getProjectClaudeDir(projectPath), 'commands', `${commandId}.md`)
    }
    throw new Error('Invalid source or missing projectPath')
  }

  /**
   * 获取 commands 目录路径
   */
  _getCommandsDir(source, projectPath = null) {
    if (source === 'user') {
      return this.userCommandsDir
    } else if (source === 'project' && projectPath) {
      return path.join(this.getProjectClaudeDir(projectPath), 'commands')
    }
    throw new Error('Invalid source or missing projectPath')
  }

  /**
   * 生成 command .md 文件内容
   * 只保留 description 字段，符合 Claude Code 原生格式
   */
  _generateCommandMd({ description, content }) {
    if (description) {
      return `---
description: ${description}
---

${content}
`
    }
    // 无 description 时，直接返回纯内容（无 frontmatter）
    return content
  }

  /**
   * 提取 markdown 文件的 body 内容 (去除 frontmatter)
   */
  _extractBodyContent(content) {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
    return match ? match[1].trim() : content.trim()
  }

  /**
   * 验证必要参数
   */
  _validateParams(params, requiredFields = ['commandId', 'source']) {
    for (const field of requiredFields) {
      if (!params[field]) {
        return { valid: false, error: `缺少必要参数: ${field}` }
      }
    }
    return { valid: true }
  }

  /**
   * 通用 Command 映射方法
   */
  _mapCommandToItem(cmd, options = {}) {
    const { source, editable, category, fullNameFn, extraFields } = options
    return {
      id: cmd.name,
      name: cmd.name,  // name 就是 id（文件名）
      description: cmd.frontmatter?.description || '',
      fullName: fullNameFn ? fullNameFn(cmd) : cmd.name,
      source,
      editable,
      filePath: cmd.filePath,
      category,
      ...extraFields
    }
  }
}

// 混入所有功能模块
Object.assign(CommandsManager.prototype, commandsCrudMixin)
Object.assign(CommandsManager.prototype, commandsImportMixin)
Object.assign(CommandsManager.prototype, commandsExportMixin)

module.exports = { CommandsManager }

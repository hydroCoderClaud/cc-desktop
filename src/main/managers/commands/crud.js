/**
 * Commands Manager CRUD 操作
 * 提供 Command 的增删改查功能
 */

const fs = require('fs')
const path = require('path')

const commandsCrudMixin = {
  // ========== 获取 Commands ==========

  /**
   * 获取插件命令 (来自已安装插件，只读)
   */
  async getPluginCommands() {
    const plugins = this.getEnabledPluginPaths()
    const allCommands = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const commandsDir = path.join(installPath, 'commands')
      const commands = this.scanMarkdownFiles(commandsDir)

      for (const cmd of commands) {
        allCommands.push(this._mapCommandToItem(cmd, {
          source: 'plugin',
          editable: false,
          category: pluginShortName,
          fullNameFn: c => `${pluginShortName}:${c.name}`,
          extraFields: { pluginId, pluginShortName }
        }))
      }
    }

    allCommands.sort((a, b) => a.pluginShortName.localeCompare(b.pluginShortName))
    return allCommands
  },

  /**
   * 获取用户命令 (来自 ~/.claude/commands/ 目录，可编辑)
   */
  async getUserCommands() {
    const commands = this.scanMarkdownFiles(this.userCommandsDir)
    return commands.map(cmd => this._mapCommandToItem(cmd, {
      source: 'user',
      editable: true,
      category: '用户命令'
    }))
  },

  /**
   * 获取项目命令 (来自 {project}/.claude/commands/ 目录，可编辑)
   */
  async getProjectCommands(projectPath) {
    if (!projectPath) return []
    const commandsDir = path.join(this.getProjectClaudeDir(projectPath), 'commands')
    const commands = this.scanMarkdownFiles(commandsDir)
    return commands.map(cmd => this._mapCommandToItem(cmd, {
      source: 'project',
      editable: true,
      category: '项目命令',
      extraFields: { projectPath }
    }))
  },

  /**
   * 获取所有 Commands (三级分类)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Object} { plugin, user, project } 三级分类的 Commands
   */
  async getAllCommands(projectPath = null) {
    const plugin = await this.getPluginCommands()
    const user = await this.getUserCommands()
    const project = projectPath ? await this.getProjectCommands(projectPath) : []

    return {
      plugin,
      user,
      project,
      // 兼容旧接口: 返回扁平列表
      all: [...project, ...user, ...plugin]
    }
  },

  // ========== CRUD 操作 ==========

  /**
   * 创建新 Command
   */
  async createCommand(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, commandId, name, description, content, projectPath } = params

      if (!/^[a-zA-Z0-9-]+$/.test(commandId)) {
        return { success: false, error: 'Command ID 只能包含字母、数字和连字符' }
      }

      const commandPath = this._getCommandPath(source, commandId, projectPath)
      if (fs.existsSync(commandPath)) {
        return { success: false, error: `Command "${commandId}" 已存在` }
      }

      // 确保目录存在
      const commandsDir = this._getCommandsDir(source, projectPath)
      fs.mkdirSync(commandsDir, { recursive: true })

      const mdContent = this._generateCommandMd({
        name: name || commandId,
        description: description || '',
        content: content || `# ${name || commandId}\n\n请在此编写命令内容。`
      })
      fs.writeFileSync(commandPath, mdContent, 'utf-8')

      console.log(`[CommandsManager] Created command: ${commandId} (${source})`)
      return { success: true, command: { id: commandId, name: name || commandId, description: description || '', source, filePath: commandPath } }
    } catch (err) {
      console.error('[CommandsManager] Failed to create command:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 更新 Command
   */
  async updateCommand(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, commandId, name, description, content, projectPath } = params
      const commandPath = this._getCommandPath(source, commandId, projectPath)

      if (!fs.existsSync(commandPath)) {
        return { success: false, error: `Command "${commandId}" 不存在` }
      }

      const existingContent = fs.readFileSync(commandPath, 'utf-8')
      const existingFrontmatter = this._parseYamlFrontmatter(commandPath) || {}
      const existingBody = this._extractBodyContent(existingContent)

      const mdContent = this._generateCommandMd({
        name: name !== undefined ? name : existingFrontmatter.name,
        description: description !== undefined ? description : existingFrontmatter.description,
        content: content !== undefined ? content : existingBody
      })
      fs.writeFileSync(commandPath, mdContent, 'utf-8')

      console.log(`[CommandsManager] Updated command: ${commandId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[CommandsManager] Failed to update command:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 删除 Command
   */
  async deleteCommand(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, commandId, projectPath } = params
      const commandPath = this._getCommandPath(source, commandId, projectPath)

      if (!fs.existsSync(commandPath)) {
        return { success: false, error: `Command "${commandId}" 不存在` }
      }

      fs.unlinkSync(commandPath)
      console.log(`[CommandsManager] Deleted command: ${commandId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[CommandsManager] Failed to delete command:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 读取 Command 详细内容
   */
  async getCommandContent(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, commandId, projectPath } = params
      const commandPath = this._getCommandPath(source, commandId, projectPath)

      if (!fs.existsSync(commandPath)) {
        return { success: false, error: `Command "${commandId}" 不存在` }
      }

      const content = fs.readFileSync(commandPath, 'utf-8')
      const frontmatter = this._parseYamlFrontmatter(commandPath) || {}
      const body = this._extractBodyContent(content)

      return {
        success: true,
        command: {
          id: commandId,
          name: frontmatter.name || commandId,
          description: frontmatter.description || '',
          content: body,
          source,
          filePath: commandPath
        }
      }
    } catch (err) {
      console.error('[CommandsManager] Failed to get command content:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 复制 Command
   */
  async copyCommand(params) {
    try {
      const validation = this._validateParams(params, ['commandId', 'fromSource', 'toSource'])
      if (!validation.valid) return { success: false, error: validation.error }

      const { fromSource, commandId, toSource, projectPath, newCommandId } = params
      const sourcePath = this._getCommandPath(fromSource, commandId, projectPath)

      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: `源命令 "${commandId}" 不存在` }
      }

      const targetCommandId = newCommandId || commandId
      const targetPath = this._getCommandPath(toSource, targetCommandId, projectPath)

      if (fs.existsSync(targetPath)) {
        return { success: false, error: `目标位置已存在 Command "${targetCommandId}"` }
      }

      // 确保目标目录存在
      const targetDir = this._getCommandsDir(toSource, projectPath)
      fs.mkdirSync(targetDir, { recursive: true })

      // 复制文件
      fs.copyFileSync(sourcePath, targetPath)

      // 如果改了名，更新文件中的 name 字段
      if (newCommandId && newCommandId !== commandId) {
        const content = fs.readFileSync(targetPath, 'utf-8')
        const frontmatter = this._parseYamlFrontmatter(targetPath) || {}
        const body = this._extractBodyContent(content)
        const newContent = this._generateCommandMd({
          name: newCommandId,
          description: frontmatter.description || '',
          content: body
        })
        fs.writeFileSync(targetPath, newContent, 'utf-8')
      }

      const actionText = fromSource === 'project' ? '升级到全局' : '复制到项目'
      console.log(`[CommandsManager] ${actionText}: ${commandId} → ${targetCommandId}`)
      return { success: true }
    } catch (err) {
      console.error('[CommandsManager] Failed to copy command:', err)
      return { success: false, error: err.message }
    }
  },

  // ========== 兼容旧接口 ==========

  /** @deprecated 使用 getPluginCommands() 代替 */
  async getGlobalCommands() {
    return this.getPluginCommands()
  }
}

module.exports = { commandsCrudMixin }

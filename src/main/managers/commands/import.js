/**
 * Commands Manager 导入功能
 * 提供 Commands 校验和导入功能
 *
 * 与 Skills 的区别: Command 是单个 .md 文件，不是文件夹
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// 懒加载 adm-zip
let AdmZip = null
function getAdmZip() {
  if (!AdmZip) {
    try {
      AdmZip = require('adm-zip')
    } catch (err) {
      console.error('[CommandsManager] adm-zip not available:', err.message)
      throw new Error('adm-zip 模块未安装，请运行 npm install adm-zip')
    }
  }
  return AdmZip
}

const commandsImportMixin = {
  /**
   * 校验单个 command 文件的合法性
   * @returns {{ valid: boolean, error?: string, commandId?: string, name?: string }}
   */
  validateCommandFile(filePath) {
    const fileName = path.basename(filePath)
    const commandId = path.basename(filePath, '.md')

    // 1. 检查是否是 .md 文件
    if (!fileName.toLowerCase().endsWith('.md')) {
      return { valid: false, error: `"${fileName}" 不是 .md 文件` }
    }

    // 2. 检查 commandId 格式
    if (!/^[a-zA-Z0-9-]+$/.test(commandId)) {
      return { valid: false, error: `文件名 "${commandId}" 不合法，只能包含字母、数字和连字符` }
    }

    // 3. 检查文件是否存在
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return { valid: false, error: `"${fileName}" 不是有效的文件` }
    }

    // 4. 解析 frontmatter
    const frontmatter = this._parseYamlFrontmatter(filePath)
    const name = frontmatter?.name || commandId
    const description = frontmatter?.description || ''

    return { valid: true, commandId, name, description, filePath, frontmatter }
  },

  /**
   * 校验导入源（文件、文件夹或 ZIP）
   * @param {string} sourcePath - 文件路径、文件夹路径或 ZIP 文件路径
   * @returns {{ valid: boolean, type: 'file'|'folder'|'zip', commands: Array, errors: Array }}
   */
  async validateImportSource(sourcePath) {
    const result = { valid: true, type: null, commands: [], errors: [], warnings: [] }

    if (!fs.existsSync(sourcePath)) {
      return { valid: false, errors: ['源路径不存在'], commands: [], warnings: [] }
    }

    const stat = fs.statSync(sourcePath)
    const isZip = sourcePath.toLowerCase().endsWith('.zip')
    const isMdFile = sourcePath.toLowerCase().endsWith('.md')

    if (isMdFile && stat.isFile()) {
      // 单个 .md 文件
      result.type = 'file'
      const validation = this.validateCommandFile(sourcePath)
      if (validation.valid) {
        result.commands.push(validation)
      } else {
        result.errors.push(validation.error)
        result.valid = false
      }
    } else if (isZip) {
      // ZIP 文件处理
      result.type = 'zip'
      try {
        const zip = new (getAdmZip())(sourcePath)
        const tempDir = path.join(os.tmpdir(), `command-import-${Date.now()}`)
        zip.extractAllTo(tempDir, true)

        // 扫描解压后的 .md 文件
        const entries = fs.readdirSync(tempDir, { withFileTypes: true })
        const mdFiles = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))

        if (mdFiles.length === 0) {
          // 检查是否有子目录包含 .md 文件
          const dirs = entries.filter(e => e.isDirectory())
          for (const dir of dirs) {
            const subDirPath = path.join(tempDir, dir.name)
            const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true })
            const subMdFiles = subEntries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
            for (const mdFile of subMdFiles) {
              const filePath = path.join(subDirPath, mdFile.name)
              const validation = this.validateCommandFile(filePath)
              if (validation.valid) {
                result.commands.push(validation)
              } else {
                result.errors.push(validation.error)
              }
            }
          }
        } else {
          for (const mdFile of mdFiles) {
            const filePath = path.join(tempDir, mdFile.name)
            const validation = this.validateCommandFile(filePath)
            if (validation.valid) {
              result.commands.push(validation)
            } else {
              result.errors.push(validation.error)
            }
          }
        }

        if (result.commands.length === 0) {
          result.valid = false
          result.errors.push('ZIP 文件中未找到有效的 .md 文件')
        }

        // 清理临时目录在导入完成后进行
        result._tempDir = tempDir
      } catch (err) {
        result.valid = false
        result.errors.push(`解压 ZIP 失败: ${err.message}`)
      }
    } else if (stat.isDirectory()) {
      // 文件夹处理
      result.type = 'folder'

      const entries = fs.readdirSync(sourcePath, { withFileTypes: true })
      const mdFiles = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))

      for (const mdFile of mdFiles) {
        const filePath = path.join(sourcePath, mdFile.name)
        const validation = this.validateCommandFile(filePath)
        if (validation.valid) {
          result.commands.push(validation)
        }
        // 忽略无效文件，不报错
      }

      if (result.commands.length === 0) {
        result.valid = false
        result.errors.push('目录中未找到有效的 .md 文件')
      }
    } else {
      result.valid = false
      result.errors.push('源路径必须是 .md 文件、文件夹或 .zip 文件')
    }

    return result
  },

  /**
   * 检测导入冲突
   * @param {Object} params - { commandIds, targetSource, projectPath }
   * @returns {{ conflicts: Array<string>, shadowedByGlobal: Array<string>, willShadowProject: Array<string> }}
   */
  checkImportConflicts(params) {
    const { commandIds, targetSource, projectPath } = params
    const conflicts = []
    const shadowedByGlobal = []
    const willShadowProject = []

    for (const commandId of commandIds) {
      // 1. 检查目标位置是否有同名
      const targetPath = this._getCommandPath(targetSource, commandId, projectPath)
      if (fs.existsSync(targetPath)) {
        conflicts.push(commandId)
      }

      // 2. 跨作用域检测
      if (targetSource === 'project' && projectPath) {
        // 导入到项目：检查全局是否有同名
        const globalPath = this._getCommandPath('user', commandId, null)
        if (fs.existsSync(globalPath)) {
          shadowedByGlobal.push(commandId)
        }
      } else if (targetSource === 'user' && projectPath) {
        // 导入到全局：检查当前项目是否有同名
        const projectPathCheck = this._getCommandPath('project', commandId, projectPath)
        if (fs.existsSync(projectPathCheck)) {
          willShadowProject.push(commandId)
        }
      }
    }

    return { conflicts, shadowedByGlobal, willShadowProject }
  },

  /**
   * 导入 Commands
   * @param {Object} params - { sourcePath, targetSource, projectPath, selectedCommandIds, renamedCommands, overwriteCommandIds }
   */
  async importCommands(params) {
    const { sourcePath, targetSource, projectPath, selectedCommandIds, renamedCommands = {}, overwriteCommandIds = [] } = params

    try {
      // 1. 校验源
      const validation = await this.validateImportSource(sourcePath)
      if (!validation.valid) {
        return { success: false, errors: validation.errors }
      }

      // 2. 过滤选中的 commands
      let commandsToImport = validation.commands
      if (selectedCommandIds && selectedCommandIds.length > 0) {
        commandsToImport = commandsToImport.filter(c => selectedCommandIds.includes(c.commandId))
      }

      if (commandsToImport.length === 0) {
        return { success: false, errors: ['没有可导入的 command'] }
      }

      // 3. 确保目标目录存在
      const targetDir = this._getCommandsDir(targetSource, projectPath)
      fs.mkdirSync(targetDir, { recursive: true })

      // 4. 执行导入
      const results = { imported: [], skipped: [], errors: [] }

      for (const cmd of commandsToImport) {
        // 检查是否有重命名
        const finalCommandId = renamedCommands[cmd.commandId] || cmd.commandId
        const targetPath = this._getCommandPath(targetSource, finalCommandId, projectPath)
        const exists = fs.existsSync(targetPath)

        // 判断是否应该覆盖
        const shouldOverwrite = overwriteCommandIds.includes(cmd.commandId)

        if (exists && !shouldOverwrite) {
          results.skipped.push({ commandId: cmd.commandId, reason: '已存在' })
          continue
        }

        try {
          // 复制文件
          fs.copyFileSync(cmd.filePath, targetPath)

          // 如果改了名，更新文件中的 name 字段
          if (finalCommandId !== cmd.commandId) {
            const content = fs.readFileSync(targetPath, 'utf-8')
            const frontmatter = this._parseYamlFrontmatter(targetPath) || {}
            const body = this._extractBodyContent(content)
            const newContent = this._generateCommandMd({
              name: finalCommandId,
              description: frontmatter.description || '',
              content: body
            })
            fs.writeFileSync(targetPath, newContent, 'utf-8')
          }

          results.imported.push({ commandId: finalCommandId, originalId: cmd.commandId, name: cmd.name })
        } catch (err) {
          results.errors.push({ commandId: cmd.commandId, error: err.message })
        }
      }

      // 5. 清理临时目录
      if (validation._tempDir && fs.existsSync(validation._tempDir)) {
        fs.rmSync(validation._tempDir, { recursive: true, force: true })
      }

      console.log(`[CommandsManager] Import complete: ${results.imported.length} imported, ${results.skipped.length} skipped`)
      return { success: true, ...results, imported: results.imported.length, warnings: validation.warnings }
    } catch (err) {
      console.error('[CommandsManager] Import failed:', err)
      return { success: false, errors: [err.message] }
    }
  }
}

module.exports = { commandsImportMixin }

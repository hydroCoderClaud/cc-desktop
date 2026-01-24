/**
 * Commands Manager 导出功能
 * 提供 Commands 单个和批量导出功能
 *
 * 与 Skills 的区别: Command 是单个 .md 文件
 */

const fs = require('fs')
const path = require('path')

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

const commandsExportMixin = {
  /**
   * 导出单个 Command
   * @param {Object} params - { source, commandId, projectPath, exportPath }
   */
  async exportCommand(params) {
    const { source, commandId, projectPath, exportPath } = params

    try {
      const commandPath = this._getCommandPath(source, commandId, projectPath)
      if (!fs.existsSync(commandPath)) {
        return { success: false, error: `Command "${commandId}" 不存在` }
      }

      // 直接复制 .md 文件
      const targetPath = path.join(exportPath, `${commandId}.md`)
      fs.copyFileSync(commandPath, targetPath)

      console.log(`[CommandsManager] Exported command: ${targetPath}`)
      return { success: true, path: targetPath }
    } catch (err) {
      console.error('[CommandsManager] Export failed:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 批量导出 Commands
   * @param {Object} params - { source, projectPath, exportPath, format, commandIds }
   */
  async exportCommandsBatch(params) {
    const { source, projectPath, exportPath, format = 'zip', commandIds } = params

    console.log('[CommandsManager] exportCommandsBatch called with:', { source, projectPath, exportPath, format, commandIds })

    try {
      // 获取要导出的 commands
      let commands
      if (source === 'user') {
        commands = await this.getUserCommands()
      } else if (source === 'project') {
        commands = await this.getProjectCommands(projectPath)
      } else {
        return { success: false, error: '不支持导出插件 commands' }
      }

      // 过滤选中的
      if (commandIds && commandIds.length > 0) {
        commands = commands.filter(c => commandIds.includes(c.id))
      }

      if (commands.length === 0) {
        return { success: false, error: '没有可导出的 command' }
      }

      console.log('[CommandsManager] Commands to export:', commands.map(c => c.id))

      if (format === 'zip') {
        // 使用 adm-zip 同步创建 ZIP
        const AdmZipClass = getAdmZip()
        const zip = new AdmZipClass()

        for (const cmd of commands) {
          const commandPath = this._getCommandPath(source, cmd.id, projectPath)
          if (fs.existsSync(commandPath)) {
            zip.addLocalFile(commandPath)
          }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const zipPath = path.join(exportPath, `commands-export-${timestamp}.zip`)
        zip.writeZip(zipPath)

        console.log(`[CommandsManager] Batch exported ${commands.length} commands to ZIP: ${zipPath}`)
        return { success: true, path: zipPath, count: commands.length }
      } else {
        // 导出为文件夹 (复制所有 .md 文件)
        fs.mkdirSync(exportPath, { recursive: true })
        for (const cmd of commands) {
          const commandPath = this._getCommandPath(source, cmd.id, projectPath)
          const targetPath = path.join(exportPath, `${cmd.id}.md`)
          fs.copyFileSync(commandPath, targetPath)
        }
        console.log(`[CommandsManager] Batch exported ${commands.length} commands to folder: ${exportPath}`)
        return { success: true, path: exportPath, count: commands.length }
      }
    } catch (err) {
      console.error('[CommandsManager] Batch export failed:', err)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { commandsExportMixin }

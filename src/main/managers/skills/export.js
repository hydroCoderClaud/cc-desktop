/**
 * Skills Manager 导出功能
 * 提供 Skills 单个和批量导出功能
 */

const fs = require('fs')
const path = require('path')
const { getAdmZip } = require('./utils')

const skillsExportMixin = {
  /**
   * 导出单个 Skill
   * @param {Object} params - { source, skillId, projectPath, exportPath, format: 'folder'|'zip' }
   */
  async exportSkill(params) {
    const { source, skillId, projectPath, exportPath, format = 'zip' } = params

    try {
      const skillDir = this._getSkillDir(source, skillId, projectPath)
      if (!fs.existsSync(skillDir)) {
        return { success: false, error: `Skill "${skillId}" 不存在` }
      }

      if (format === 'zip') {
        // 用户选择的是目录，ZIP 文件放在该目录下
        const zipPath = path.join(exportPath, `${skillId}.zip`)
        await this._createZip(skillDir, zipPath, skillId)
        console.log(`[SkillsManager] Exported skill to ZIP: ${zipPath}`)
        return { success: true, path: zipPath }
      } else {
        // 导出为文件夹
        const targetDir = path.join(exportPath, skillId)
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true })
        }
        fs.mkdirSync(path.dirname(targetDir), { recursive: true })
        this._copyDirRecursive(skillDir, targetDir)
        console.log(`[SkillsManager] Exported skill to folder: ${targetDir}`)
        return { success: true, path: targetDir }
      }
    } catch (err) {
      console.error('[SkillsManager] Export failed:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 批量导出 Skills
   * @param {Object} params - { source, projectPath, exportPath, format, skillIds }
   */
  async exportSkillsBatch(params) {
    const { source, projectPath, exportPath, format = 'zip', skillIds } = params

    console.log('[SkillsManager] exportSkillsBatch called with:', { source, projectPath, exportPath, format, skillIds })

    try {
      // 获取要导出的 skills
      let skills
      if (source === 'user') {
        skills = await this.getUserSkills()
      } else if (source === 'project') {
        skills = await this.getProjectSkills(projectPath)
      } else {
        return { success: false, error: '不支持导出官方 skills' }
      }

      // 过滤选中的
      if (skillIds && skillIds.length > 0) {
        skills = skills.filter(s => skillIds.includes(s.id))
      }

      if (skills.length === 0) {
        return { success: false, error: '没有可导出的 skill' }
      }

      console.log('[SkillsManager] Skills to export:', skills.map(s => s.id))

      if (format === 'zip') {
        // 使用 adm-zip 同步创建 ZIP
        const AdmZip = getAdmZip()
        const zip = new AdmZip()

        for (const skill of skills) {
          const skillDir = this._getSkillDir(source, skill.id, projectPath)
          if (fs.existsSync(skillDir)) {
            zip.addLocalFolder(skillDir, skill.id)
          }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const zipPath = path.join(exportPath, `skills-export-${timestamp}.zip`)
        zip.writeZip(zipPath)

        console.log(`[SkillsManager] Batch exported ${skills.length} skills to ZIP: ${zipPath}`)
        return { success: true, path: zipPath, count: skills.length }
      } else {
        // 导出为文件夹
        fs.mkdirSync(exportPath, { recursive: true })
        for (const skill of skills) {
          const skillDir = this._getSkillDir(source, skill.id, projectPath)
          const targetDir = path.join(exportPath, skill.id)
          this._copyDirRecursive(skillDir, targetDir)
        }
        console.log(`[SkillsManager] Batch exported ${skills.length} skills to folder: ${exportPath}`)
        return { success: true, path: exportPath, count: skills.length }
      }
    } catch (err) {
      console.error('[SkillsManager] Batch export failed:', err)
      return { success: false, error: err.message }
    }
  }
}

module.exports = { skillsExportMixin }

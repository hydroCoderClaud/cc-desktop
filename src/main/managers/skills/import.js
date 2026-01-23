/**
 * Skills Manager 导入功能
 * 提供 Skills 校验和导入功能
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { getAdmZip } = require('./utils')

const skillsImportMixin = {
  /**
   * 校验单个 skill 目录的合法性
   * @returns {{ valid: boolean, error?: string, skillId?: string, name?: string }}
   */
  validateSkillDir(skillDir) {
    const skillId = path.basename(skillDir)

    // 1. 检查 skillId 格式
    if (!/^[a-zA-Z0-9-]+$/.test(skillId)) {
      return { valid: false, error: `目录名 "${skillId}" 不合法，只能包含字母、数字和连字符` }
    }

    // 2. 检查是否是目录
    if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
      return { valid: false, error: `"${skillId}" 不是有效的目录` }
    }

    // 3. 检查 SKILL.md 是否存在
    const skillMdPath = path.join(skillDir, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) {
      return { valid: false, error: `目录 "${skillId}" 缺少 SKILL.md 文件` }
    }

    // 4. 解析 SKILL.md 的 frontmatter
    const frontmatter = this._parseYamlFrontmatter(skillMdPath)
    if (!frontmatter) {
      return { valid: false, error: `"${skillId}/SKILL.md" 缺少有效的 YAML frontmatter` }
    }

    // 5. 检查 name 字段（警告但不阻止）
    const name = frontmatter.name || skillId
    const nameMatch = name === skillId

    return { valid: true, skillId, name, nameMatch, frontmatter }
  },

  /**
   * 校验导入源（文件夹或 ZIP）
   * @param {string} sourcePath - 文件夹路径或 ZIP 文件路径
   * @returns {{ valid: boolean, type: 'folder'|'zip', skills: Array, errors: Array }}
   */
  async validateImportSource(sourcePath) {
    const result = { valid: true, type: null, skills: [], errors: [], warnings: [] }

    if (!fs.existsSync(sourcePath)) {
      return { valid: false, errors: ['源路径不存在'], skills: [], warnings: [] }
    }

    const stat = fs.statSync(sourcePath)
    const isZip = sourcePath.toLowerCase().endsWith('.zip')

    if (isZip) {
      // ZIP 文件处理
      result.type = 'zip'
      try {
        const zip = new (getAdmZip())(sourcePath)
        const tempDir = path.join(os.tmpdir(), `skill-import-${Date.now()}`)
        zip.extractAllTo(tempDir, true)

        // 检查解压后的结构
        const entries = fs.readdirSync(tempDir, { withFileTypes: true })
        const dirs = entries.filter(e => e.isDirectory())

        // 判断是单个 skill 还是多个
        const hasSKILLmd = fs.existsSync(path.join(tempDir, 'SKILL.md'))
        if (hasSKILLmd) {
          // 单个 skill (ZIP 根目录就是 skill)
          const validation = this.validateSkillDir(tempDir)
          if (validation.valid) {
            // 使用 ZIP 文件名作为 skillId
            const zipName = path.basename(sourcePath, '.zip')
            result.skills.push({ ...validation, skillId: zipName, sourcePath: tempDir, fromZipRoot: true })
          } else {
            result.errors.push(validation.error)
            result.valid = false
          }
        } else if (dirs.length > 0) {
          // 多个 skill 或单个 skill 在子目录
          for (const dir of dirs) {
            const dirPath = path.join(tempDir, dir.name)
            const validation = this.validateSkillDir(dirPath)
            if (validation.valid) {
              result.skills.push({ ...validation, sourcePath: dirPath })
              if (!validation.nameMatch) {
                result.warnings.push(`"${validation.skillId}": 目录名与 SKILL.md 中的 name (${validation.name}) 不一致`)
              }
            } else {
              result.errors.push(validation.error)
            }
          }
          if (result.skills.length === 0) result.valid = false
        } else {
          result.valid = false
          result.errors.push('ZIP 文件中未找到有效的 skill 目录')
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

      // 判断是单个 skill 还是包含多个 skill 的目录
      const hasSKILLmd = fs.existsSync(path.join(sourcePath, 'SKILL.md'))
      if (hasSKILLmd) {
        // 单个 skill
        const validation = this.validateSkillDir(sourcePath)
        if (validation.valid) {
          result.skills.push({ ...validation, sourcePath })
        } else {
          result.errors.push(validation.error)
          result.valid = false
        }
      } else {
        // 可能包含多个 skill 子目录
        const entries = fs.readdirSync(sourcePath, { withFileTypes: true })
        const dirs = entries.filter(e => e.isDirectory())

        for (const dir of dirs) {
          const dirPath = path.join(sourcePath, dir.name)
          const validation = this.validateSkillDir(dirPath)
          if (validation.valid) {
            result.skills.push({ ...validation, sourcePath: dirPath })
            if (!validation.nameMatch) {
              result.warnings.push(`"${validation.skillId}": 目录名与 SKILL.md 中的 name (${validation.name}) 不一致`)
            }
          }
          // 忽略无效目录，不报错
        }

        if (result.skills.length === 0) {
          result.valid = false
          result.errors.push('目录中未找到有效的 skill')
        }
      }
    } else {
      result.valid = false
      result.errors.push('源路径必须是文件夹或 .zip 文件')
    }

    return result
  },

  /**
   * 检测导入冲突（包括跨作用域冲突）
   * @param {Object} params - { skillIds, targetSource, projectPath }
   * @returns {{ conflicts: Array<string>, shadowedByGlobal: Array<string>, willShadowProject: Array<string> }}
   */
  checkImportConflicts(params) {
    const { skillIds, targetSource, projectPath } = params
    const conflicts = []
    const shadowedByGlobal = []
    const willShadowProject = []

    for (const skillId of skillIds) {
      // 1. 检查目标位置是否有同名（原有逻辑）
      const targetDir = this._getSkillDir(targetSource, skillId, projectPath)
      if (fs.existsSync(targetDir)) {
        conflicts.push(skillId)
      }

      // 2. 跨作用域检测
      if (targetSource === 'project' && projectPath) {
        // 导入到项目：检查全局是否有同名
        const globalDir = this._getSkillDir('user', skillId, null)
        if (fs.existsSync(globalDir)) {
          shadowedByGlobal.push(skillId)
        }
      } else if (targetSource === 'user' && projectPath) {
        // 导入到全局：检查当前项目是否有同名
        const projectDir = this._getSkillDir('project', skillId, projectPath)
        if (fs.existsSync(projectDir)) {
          willShadowProject.push(skillId)
        }
      }
    }

    return { conflicts, shadowedByGlobal, willShadowProject }
  },

  /**
   * 导入 Skills
   * @param {Object} params - { sourcePath, targetSource, projectPath, selectedSkillIds, renamedSkills, overwriteSkillIds }
   */
  async importSkills(params) {
    const { sourcePath, targetSource, projectPath, selectedSkillIds, renamedSkills = {}, overwriteSkillIds = [] } = params

    try {
      // 1. 校验源
      const validation = await this.validateImportSource(sourcePath)
      if (!validation.valid) {
        return { success: false, errors: validation.errors }
      }

      // 2. 过滤选中的 skills
      let skillsToImport = validation.skills
      if (selectedSkillIds && selectedSkillIds.length > 0) {
        skillsToImport = skillsToImport.filter(s => selectedSkillIds.includes(s.skillId))
      }

      if (skillsToImport.length === 0) {
        return { success: false, errors: ['没有可导入的 skill'] }
      }

      // 3. 执行导入
      const results = { imported: [], skipped: [], errors: [] }

      for (const skill of skillsToImport) {
        // 检查是否有重命名
        const finalSkillId = renamedSkills[skill.skillId] || skill.skillId
        const targetDir = this._getSkillDir(targetSource, finalSkillId, projectPath)
        const exists = fs.existsSync(targetDir)

        // 判断是否应该覆盖: 只有在 overwriteSkillIds 中的才覆盖
        const shouldOverwrite = overwriteSkillIds.includes(skill.skillId)

        if (exists && !shouldOverwrite) {
          results.skipped.push({ skillId: skill.skillId, reason: '已存在' })
          continue
        }

        try {
          // 如果覆盖，先删除
          if (exists) {
            fs.rmSync(targetDir, { recursive: true, force: true })
          }

          // 确保父目录存在
          fs.mkdirSync(path.dirname(targetDir), { recursive: true })

          // 复制
          this._copyDirRecursive(skill.sourcePath, targetDir)

          // 如果改了名，更新 SKILL.md 中的 name 字段
          if (finalSkillId !== skill.skillId) {
            const skillMdPath = path.join(targetDir, 'SKILL.md')
            if (fs.existsSync(skillMdPath)) {
              this._updateSkillName(skillMdPath, finalSkillId)
            }
          }

          results.imported.push({ skillId: finalSkillId, originalId: skill.skillId, name: skill.name })
        } catch (err) {
          results.errors.push({ skillId: skill.skillId, error: err.message })
        }
      }

      // 4. 清理临时目录
      if (validation._tempDir && fs.existsSync(validation._tempDir)) {
        fs.rmSync(validation._tempDir, { recursive: true, force: true })
      }

      console.log(`[SkillsManager] Import complete: ${results.imported.length} imported, ${results.skipped.length} skipped`)
      return { success: true, ...results, imported: results.imported.length, warnings: validation.warnings }
    } catch (err) {
      console.error('[SkillsManager] Import failed:', err)
      return { success: false, errors: [err.message] }
    }
  }
}

module.exports = { skillsImportMixin }

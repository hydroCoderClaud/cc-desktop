/**
 * Skills Manager - 技能管理
 *
 * 三级 Skills 架构:
 * 1. 官方全局 (只读): 来自已安装插件 ~/.claude/plugins/{plugin}/skills/
 *    调用方式: /plugin-name:skill-id
 * 2. 自定义全局 (可编辑): 来自用户目录 ~/.claude/skills/
 *    调用方式: /skill-id
 * 3. 工程级别 (可编辑): 来自项目目录 {project}/.claude/skills/
 *    调用方式: /skill-id
 */

const fs = require('fs')
const path = require('path')
const { ComponentScanner } = require('../component-scanner')

// 懒加载导入导出依赖（避免模块加载失败影响基础功能）
let AdmZip = null
let archiver = null

function getAdmZip() {
  if (!AdmZip) {
    try {
      AdmZip = require('adm-zip')
    } catch (err) {
      console.error('[SkillsManager] adm-zip not available:', err.message)
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
      console.error('[SkillsManager] archiver not available:', err.message)
      throw new Error('archiver 模块未安装，请运行 npm install archiver')
    }
  }
  return archiver
}

class SkillsManager extends ComponentScanner {
  constructor() {
    super()
    // 自定义全局 skills 目录
    this.userSkillsDir = path.join(this.claudeDir, 'skills')
  }

  // ========== 通用方法 ==========

  /**
   * 通用 Skill 映射方法
   */
  _mapSkillToItem(skill, options = {}) {
    const { source, editable, category, fullNameFn, extraFields } = options
    return {
      id: skill.id,
      name: skill.frontmatter?.name || skill.id,
      description: skill.frontmatter?.description || '',
      fullName: fullNameFn ? fullNameFn(skill) : skill.id,
      source,
      editable,
      skillPath: skill.skillPath,
      category,
      ...extraFields
    }
  }

  /**
   * 验证必要参数
   */
  _validateParams(params, requiredFields = ['skillId', 'source']) {
    for (const field of requiredFields) {
      if (!params[field]) {
        return { valid: false, error: `缺少必要参数: ${field}` }
      }
    }
    return { valid: true }
  }

  // ========== 获取 Skills ==========

  /**
   * 获取官方全局 Skills (来自已安装插件，只读)
   */
  async getOfficialSkills() {
    const plugins = this.getEnabledPluginPaths()
    const allSkills = []

    for (const { pluginId, pluginShortName, installPath } of plugins) {
      const skillsDir = path.join(installPath, 'skills')
      const skills = this.scanSkillDirectories(skillsDir)

      for (const skill of skills) {
        allSkills.push(this._mapSkillToItem(skill, {
          source: 'official',
          editable: false,
          category: pluginShortName,
          fullNameFn: s => `${pluginShortName}:${s.id}`,
          extraFields: { pluginId, pluginShortName }
        }))
      }
    }

    allSkills.sort((a, b) => a.pluginShortName.localeCompare(b.pluginShortName))
    return allSkills
  }

  /**
   * 获取自定义全局 Skills (来自 ~/.claude/skills/ 目录，可编辑)
   */
  async getUserSkills() {
    const skills = this.scanSkillDirectories(this.userSkillsDir)
    return skills.map(skill => this._mapSkillToItem(skill, {
      source: 'user',
      editable: true,
      category: '自定义全局'
    }))
  }

  /**
   * 获取工程级 Skills (来自 {project}/.claude/skills/ 目录，可编辑)
   */
  async getProjectSkills(projectPath) {
    if (!projectPath) return []
    const skillsDir = path.join(this.getProjectClaudeDir(projectPath), 'skills')
    const skills = this.scanSkillDirectories(skillsDir)
    return skills.map(skill => this._mapSkillToItem(skill, {
      source: 'project',
      editable: true,
      category: '工程技能',
      extraFields: { projectPath }
    }))
  }

  /**
   * 获取所有 Skills (三级分类)
   * @param {string} projectPath - 项目根目录 (可选)
   * @returns {Object} { official, user, project } 三级分类的 Skills
   */
  async getAllSkills(projectPath = null) {
    const official = await this.getOfficialSkills()
    const user = await this.getUserSkills()
    const project = projectPath ? await this.getProjectSkills(projectPath) : []

    return {
      official,
      user,
      project,
      // 兼容旧接口: 返回扁平列表
      all: [...project, ...user, ...official]
    }
  }

  // ========== CRUD 操作 ==========

  /**
   * 获取 skill 目录路径
   */
  _getSkillDir(source, skillId, projectPath = null) {
    if (source === 'user') {
      return path.join(this.userSkillsDir, skillId)
    } else if (source === 'project' && projectPath) {
      return path.join(this.getProjectClaudeDir(projectPath), 'skills', skillId)
    }
    throw new Error('Invalid source or missing projectPath')
  }

  /**
   * 创建新 Skill
   */
  async createSkill(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, skillId, name, description, content, projectPath } = params

      if (!/^[a-zA-Z0-9-]+$/.test(skillId)) {
        return { success: false, error: 'Skill ID 只能包含字母、数字和连字符' }
      }

      const skillDir = this._getSkillDir(source, skillId, projectPath)
      if (fs.existsSync(skillDir)) {
        return { success: false, error: `Skill "${skillId}" 已存在` }
      }

      fs.mkdirSync(skillDir, { recursive: true })
      const mdContent = this._generateSkillMd({
        name: name || skillId,
        description: description || '',
        content: content || `# ${name || skillId}\n\n请在此编写技能内容。`
      })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), mdContent, 'utf-8')

      console.log(`[SkillsManager] Created skill: ${skillId} (${source})`)
      return { success: true, skill: { id: skillId, name: name || skillId, description: description || '', source, skillPath: skillDir } }
    } catch (err) {
      console.error('[SkillsManager] Failed to create skill:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 更新 Skill
   */
  async updateSkill(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, skillId, name, description, content, projectPath } = params
      const skillMdPath = path.join(this._getSkillDir(source, skillId, projectPath), 'SKILL.md')

      if (!fs.existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${skillId}" 不存在` }
      }

      const existingContent = fs.readFileSync(skillMdPath, 'utf-8')
      const existingFrontmatter = this._parseYamlFrontmatter(skillMdPath) || {}
      const existingBody = this._extractBodyContent(existingContent)

      const mdContent = this._generateSkillMd({
        name: name !== undefined ? name : existingFrontmatter.name,
        description: description !== undefined ? description : existingFrontmatter.description,
        content: content !== undefined ? content : existingBody
      })
      fs.writeFileSync(skillMdPath, mdContent, 'utf-8')

      console.log(`[SkillsManager] Updated skill: ${skillId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[SkillsManager] Failed to update skill:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 删除 Skill
   */
  async deleteSkill(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, skillId, projectPath } = params
      const skillDir = this._getSkillDir(source, skillId, projectPath)

      if (!fs.existsSync(skillDir)) {
        return { success: false, error: `Skill "${skillId}" 不存在` }
      }

      fs.rmSync(skillDir, { recursive: true, force: true })
      console.log(`[SkillsManager] Deleted skill: ${skillId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[SkillsManager] Failed to delete skill:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 读取 Skill 详细内容
   */
  async getSkillContent(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, skillId, projectPath } = params
      const skillDir = this._getSkillDir(source, skillId, projectPath)
      const skillMdPath = path.join(skillDir, 'SKILL.md')

      if (!fs.existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${skillId}" 不存在` }
      }

      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const frontmatter = this._parseYamlFrontmatter(skillMdPath) || {}
      const body = this._extractBodyContent(content)

      return { success: true, skill: { id: skillId, name: frontmatter.name || skillId, description: frontmatter.description || '', content: body, source, skillPath: skillDir } }
    } catch (err) {
      console.error('[SkillsManager] Failed to get skill content:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 生成 SKILL.md 文件内容
   */
  _generateSkillMd({ name, description, content }) {
    return `---
name: ${name}
description: ${description}
---

${content}
`
  }

  /**
   * 提取 markdown 文件的 body 内容 (去除 frontmatter)
   */
  _extractBodyContent(content) {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
    return match ? match[1].trim() : content.trim()
  }

  /**
   * 复制 Skill 目录
   */
  async copySkill(params) {
    try {
      const validation = this._validateParams(params, ['skillId', 'fromSource', 'toSource'])
      if (!validation.valid) return { success: false, error: validation.error }

      const { fromSource, skillId, toSource, projectPath, newSkillId } = params
      const sourceDir = this._getSkillDir(fromSource, skillId, projectPath)

      if (!fs.existsSync(sourceDir)) {
        return { success: false, error: `源技能 "${skillId}" 不存在` }
      }

      const targetSkillId = newSkillId || skillId
      const targetDir = this._getSkillDir(toSource, targetSkillId, projectPath)

      if (fs.existsSync(targetDir)) {
        return { success: false, error: `目标位置已存在 Skill "${targetSkillId}"` }
      }

      // 确保目标父目录存在并复制
      fs.mkdirSync(path.dirname(targetDir), { recursive: true })
      this._copyDirRecursive(sourceDir, targetDir)

      // 如果改了名，更新 SKILL.md 中的 name 字段
      if (newSkillId && newSkillId !== skillId) {
        const skillMdPath = path.join(targetDir, 'SKILL.md')
        if (fs.existsSync(skillMdPath)) {
          this._updateSkillName(skillMdPath, newSkillId)
        }
      }

      const actionText = fromSource === 'project' ? '升级到全局' : '复制到项目'
      console.log(`[SkillsManager] ${actionText}: ${skillId} → ${targetSkillId}`)
      return { success: true }
    } catch (err) {
      console.error('[SkillsManager] Failed to copy skill:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 更新 SKILL.md 中的 name 字段
   */
  _updateSkillName(skillMdPath, newName) {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const frontmatter = this._parseYamlFrontmatter(skillMdPath) || {}
      const body = this._extractBodyContent(content)
      const newContent = this._generateSkillMd({ name: newName, description: frontmatter.description || '', content: body })
      fs.writeFileSync(skillMdPath, newContent, 'utf-8')
      console.log(`[SkillsManager] Updated skill name to: ${newName}`)
    } catch (err) {
      console.error('[SkillsManager] Failed to update skill name:', err)
    }
  }

  /**
   * 递归复制目录
   */
  _copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      entry.isDirectory() ? this._copyDirRecursive(srcPath, destPath) : fs.copyFileSync(srcPath, destPath)
    }
  }

  // ========== 导入导出 ==========

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
  }

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
        const tempDir = path.join(require('os').tmpdir(), `skill-import-${Date.now()}`)
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
  }

  /**
   * 检测导入冲突（包括跨作用域冲突）
   * @param {Object} params - { skillIds, targetSource, projectPath }
   * @returns {{ conflicts: Array<string>, shadowedByGlobal: Array<string>, willShadowProject: Array<string> }}
   *   - conflicts: 目标位置有同名 skill（需要处理：跳过/重命名/覆盖）
   *   - shadowedByGlobal: 导入到项目时，全局有同名 skill（警告：导入后不起作用，因为全局优先）
   *   - willShadowProject: 导入到全局时，项目有同名 skill（警告：导入后项目 skill 会失效）
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
  }

  /**
   * 导入 Skills
   * @param {Object} params - { sourcePath, targetSource, projectPath, selectedSkillIds, renamedSkills, overwriteSkillIds }
   * renamedSkills: { [oldId]: newId } 重命名映射
   * overwriteSkillIds: Array<string> 需要覆盖的 skillId 列表
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
  }

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

  /**
   * 创建 ZIP 文件
   */
  _createZip(sourceDir, zipPath, rootName) {
    return new Promise((resolve, reject) => {
      const archive = getArchiver()('zip', { zlib: { level: 9 } })
      const output = fs.createWriteStream(zipPath)

      output.on('close', resolve)
      archive.on('error', reject)

      archive.pipe(output)
      archive.directory(sourceDir, rootName || path.basename(sourceDir))
      archive.finalize()
    })
  }

  // ========== 兼容旧接口 ==========

  /** @deprecated 使用 getOfficialSkills() 代替 */
  async getGlobalSkills() {
    return this.getOfficialSkills()
  }
}

module.exports = { SkillsManager }

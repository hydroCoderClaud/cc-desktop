/**
 * Skills Manager CRUD 操作
 * 提供 Skill 的增删改查功能
 */

const fs = require('fs')
const path = require('path')

const skillsCrudMixin = {
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
  },

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
  },

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
  },

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
  },

  // ========== CRUD 操作 ==========

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
  },

  /**
   * 读取 Skill 原始内容（完整的 SKILL.md 文件）
   */
  async getSkillRawContent(params) {
    try {
      const validation = this._validateParams(params)
      if (!validation.valid) return { success: false, error: validation.error }

      const { source, skillId, projectPath, skillPath: providedSkillPath } = params

      let skillDir
      if ((source === 'official' || source === 'plugin') && providedSkillPath) {
        skillDir = providedSkillPath
      } else {
        skillDir = this._getSkillDir(source, skillId, projectPath)
      }

      const skillMdPath = path.join(skillDir, 'SKILL.md')

      if (!fs.existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${skillId}" 不存在` }
      }

      const content = fs.readFileSync(skillMdPath, 'utf-8')
      return { success: true, content, skillPath: skillDir }
    } catch (err) {
      console.error('[SkillsManager] Failed to get skill raw content:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 创建 Skill（原始内容模式）
   */
  async createSkillRaw(params) {
    try {
      const { source, skillId, rawContent, projectPath } = params

      if (!skillId) {
        return { success: false, error: '缺少必要参数: skillId' }
      }
      if (!/^[a-zA-Z0-9-]+$/.test(skillId)) {
        return { success: false, error: 'Skill ID 只能包含字母、数字和连字符' }
      }

      const skillDir = this._getSkillDir(source, skillId, projectPath)
      if (fs.existsSync(skillDir)) {
        return { success: false, error: `Skill "${skillId}" 已存在` }
      }

      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), rawContent || '', 'utf-8')

      console.log(`[SkillsManager] Created skill (raw): ${skillId} (${source})`)
      return { success: true, skillPath: skillDir }
    } catch (err) {
      console.error('[SkillsManager] Failed to create skill (raw):', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * 更新 Skill（原始内容模式）
   */
  async updateSkillRaw(params) {
    try {
      const { source, skillId, rawContent, projectPath } = params

      if (!skillId) {
        return { success: false, error: '缺少必要参数: skillId' }
      }

      const skillDir = this._getSkillDir(source, skillId, projectPath)
      const skillMdPath = path.join(skillDir, 'SKILL.md')

      if (!fs.existsSync(skillMdPath)) {
        return { success: false, error: `Skill "${skillId}" 不存在` }
      }

      fs.writeFileSync(skillMdPath, rawContent || '', 'utf-8')

      console.log(`[SkillsManager] Updated skill (raw): ${skillId} (${source})`)
      return { success: true }
    } catch (err) {
      console.error('[SkillsManager] Failed to update skill (raw):', err)
      return { success: false, error: err.message }
    }
  },

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
  },

}

module.exports = { skillsCrudMixin }

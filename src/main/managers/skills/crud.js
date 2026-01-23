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
  },

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
  },

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

  // ========== 兼容旧接口 ==========

  /** @deprecated 使用 getOfficialSkills() 代替 */
  async getGlobalSkills() {
    return this.getOfficialSkills()
  }
}

module.exports = { skillsCrudMixin }

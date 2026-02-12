/**
 * Skills Manager 工具方法
 * 提供通用的文件操作、验证和辅助方法
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

// ========== Skills Manager Utils Mixin ==========

const skillsUtilsMixin = {
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
      filePath: skill.filePath,  // SKILL.md 文件路径
      category,
      disabled: skill.disabled || false,
      ...extraFields
    }
  },

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
  },

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
  },

  /**
   * 生成 SKILL.md 文件内容
   * name: 调用名称（默认等于目录名，可自定义）
   * description: 描述
   */
  _generateSkillMd({ name, description, content }) {
    return `---
name: ${name || ''}
description: ${description || ''}
---

${content}
`
  },

  /**
   * 提取 markdown 文件的 body 内容 (去除 frontmatter)
   */
  _extractBodyContent(content) {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
    return match ? match[1].trim() : content.trim()
  },

  /**
   * 更新 SKILL.md 中的 name 字段（保留其他所有 frontmatter 字段）
   */
  _updateSkillName(skillMdPath, newName) {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8')
      // 使用正则直接替换 name 字段的值，保留其他所有内容
      const updatedContent = content.replace(/^(name:\s*)(.*)$/m, `$1${newName}`)
      fs.writeFileSync(skillMdPath, updatedContent, 'utf-8')
      console.log(`[SkillsManager] Updated skill name to: ${newName}`)
    } catch (err) {
      console.error('[SkillsManager] Failed to update skill name:', err)
    }
  },

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
  },

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
}

module.exports = {
  skillsUtilsMixin,
  getAdmZip,
  getArchiver
}

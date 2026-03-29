/**
 * NotebookManager — Achievements mixin
 * 成果 CRUD
 */

const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const {
  sanitizeChatBaseName,
  buildChatTimestamp,
  ensureUniqueNotebookFile,
  saveNotebookBinaryFile,
  saveNotebookTextFile
} = require('../utils/notebook-helpers')

const ACHIEVEMENT_DIRS = ['audio', 'video', 'report', 'presentation', 'mindmap', 'flashcard', 'quiz', 'infographic', 'table', 'fromchat']

const notebookAchievementMixin = {
  _achievementIndexPath(notebookId) {
    return path.join(this._getNotebookPath(notebookId), 'achievements.json')
  },

  listAchievements(notebookId) {
    return this._readJson(this._achievementIndexPath(notebookId)).achievements
  },

  /**
   * 一致性扫描：清理异常状态的成果记录（仅在打开笔记本时调用）
   * 打开笔记本时不可能有正在生成的成果，因此做全量严格检查：
   * - 任何 generating 状态的记录 → 删除（意外退出残留）
   * - 成果文件不存在的记录 → 删除索引
   * 在 get() 打开笔记本时自动调用
   */
  sanitizeAchievements(notebookId, { removeGenerating = true } = {}) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const notebookPath = this._getNotebookPath(notebookId)
    const toDelete = []

    for (const ach of data.achievements) {
      let shouldDelete = false
      let reason = ''

      // 1. 删除所有 generating 状态的记录（打开时不可能有正在生成的）
      if (ach.status === 'generating') {
        if (removeGenerating) {
          shouldDelete = true
          reason = 'stale generating status'
        }
      }
      // 2. 检查成果文件是否存在
      else if (ach.path) {
        const absPath = path.isAbsolute(ach.path)
          ? ach.path
          : path.join(notebookPath, ach.path)

        if (!fs.existsSync(absPath)) {
          shouldDelete = true
          reason = 'file not found'
        }
      }

      if (shouldDelete) {
        toDelete.push(ach.id)
        console.log(`[NotebookManager] sanitizeAchievements: marking for deletion (${reason}): ${ach.id} - ${ach.path || 'no path'}`)
      }
    }

    // 删除不合法的成果索引
    if (toDelete.length > 0) {
      data.achievements = data.achievements.filter(a => !toDelete.includes(a.id))
      this._writeJsonAtomic(indexPath, data)
      console.log(`[NotebookManager] sanitizeAchievements: removed ${toDelete.length} invalid achievements for ${notebookId}`)
    }

    return toDelete.length
  },

  /**
   * 添加成果（status 默认 generating）
   * @param {string} notebookId
   * @param {{ name, type, sourceIds?, prompt? }} achievementData
   */
  addAchievement(notebookId, achievementData) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)

    const achievement = {
      id: 'ach-' + uuidv4().replace(/-/g, '').slice(0, 8),
      name: achievementData.name || 'achievement',
      type: achievementData.type || 'report',
      path: achievementData.path || null,
      category: achievementData.type || 'report',
      sourceIds: achievementData.sourceIds || [],
      prompt: achievementData.prompt || '',
      status: 'generating',
      selected: false,
      createdAt: this._now()
    }

    data.achievements.push(achievement)
    this._writeJsonAtomic(indexPath, data)
    return achievement
  },


  async saveChatImageToAchievement(notebookId, { filename, dataUrl, sourceIds = [] } = {}) {
    if (!dataUrl || typeof dataUrl !== 'string') throw new Error('图片数据不能为空')
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) throw new Error('无效的图片数据')

    const notebookPath = this._getNotebookPath(notebookId)
    const targetDir = path.join(notebookPath, 'achievements', 'fromchat')
    const baseName = sanitizeChatBaseName(filename, `chat-image-${buildChatTimestamp()}`)
    const { fileName } = saveNotebookBinaryFile(
      targetDir,
      `${baseName}.png`,
      Buffer.from(dataUrl.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''), 'base64')
    )

    const relPath = path.join('achievements', 'fromchat', fileName).replace(/\\/g, '/')
    const achievement = this.addAchievement(notebookId, {
      name: fileName,
      type: 'fromchat',
      path: relPath,
      sourceIds
    })
    return this.updateAchievement(notebookId, achievement.id, { status: 'done', path: relPath, sourceIds })
  },

  saveChatMarkdownToAchievement(notebookId, { filename, content, sourceIds = [] } = {}) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('消息内容不能为空')

    const notebookPath = this._getNotebookPath(notebookId)
    const targetDir = path.join(notebookPath, 'achievements', 'fromchat')
    const baseName = sanitizeChatBaseName(filename, `chat-markdown-${buildChatTimestamp()}`)
    const { fileName } = saveNotebookTextFile(targetDir, `${baseName}.md`, content)

    const relPath = path.join('achievements', 'fromchat', fileName).replace(/\\/g, '/')
    const achievement = this.addAchievement(notebookId, {
      name: fileName,
      type: 'fromchat',
      path: relPath,
      sourceIds
    })
    return this.updateAchievement(notebookId, achievement.id, { status: 'done', path: relPath, sourceIds })
  },

  addPathToAchievement(notebookId, filePath, options = {}) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`文件不存在：${filePath}`)
    }

    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) {
      throw new Error('暂不支持添加目录到成果')
    }

    const notebookPath = this._getNotebookPath(notebookId)
    const targetDir = path.join(notebookPath, 'achievements', 'fromchat')
    const { fileName } = saveNotebookBinaryFile(targetDir, path.basename(filePath), fs.readFileSync(filePath))

    const relPath = path.join('achievements', 'fromchat', fileName).replace(/\\/g, '/')
    const achievement = this.addAchievement(notebookId, {
      name: options.preferredName || fileName,
      type: 'fromchat',
      path: relPath
    })
    return this.updateAchievement(notebookId, achievement.id, { status: 'done', path: relPath, name: options.preferredName || fileName })
  },

  /**
   * 更新成果（status、path 等）
   */
  updateAchievement(notebookId, achievementId, updates) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.achievements.findIndex(a => a.id === achievementId)
    if (idx === -1) throw new Error(`成果不存在：${achievementId}`)
    const allowed = ['name', 'status', 'path', 'category', 'prompt', 'sourceIds', 'selected']
    allowed.forEach(k => { if (k in updates) data.achievements[idx][k] = updates[k] })
    this._writeJsonAtomic(indexPath, data)
    return data.achievements[idx]
  },

  /** 尝试删除成果关联的物理文件（失败不阻断） */
  _tryDeleteAchievementFile(notebookId, achievement) {
    if (!achievement.path) return
    const absPath = path.join(this._getNotebookPath(notebookId), achievement.path)
    try {
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath)
        console.log(`[NotebookManager] Deleted achievement file: ${absPath}`)
      }
    } catch (err) {
      console.warn(`[NotebookManager] Failed to delete achievement file: ${absPath}`, err.message)
    }
  },

  exportAchievement(notebookId, achievementId, targetDir) {
    if (!targetDir) throw new Error('目标目录不能为空')
    if (!fs.existsSync(targetDir)) throw new Error(`目标目录不存在：${targetDir}`)

    const achievement = this.listAchievements(notebookId).find(a => a.id === achievementId)
    if (!achievement) throw new Error(`成果不存在：${achievementId}`)
    if (achievement.status !== 'done') throw new Error('仅已完成的成果可导出')
    if (!achievement.path) throw new Error('成果文件路径不存在')

    const notebookPath = this._getNotebookPath(notebookId)
    const absPath = path.isAbsolute(achievement.path)
      ? achievement.path
      : path.join(notebookPath, achievement.path)

    if (!fs.existsSync(absPath)) {
      throw new Error(`成果文件不存在：${absPath}`)
    }

    const parsedName = path.parse(path.basename(absPath))
    let targetFileName = `${parsedName.name}${parsedName.ext}`
    let counter = 1
    while (fs.existsSync(path.join(targetDir, targetFileName))) {
      targetFileName = `${parsedName.name}_${counter}${parsedName.ext}`
      counter++
    }

    const finalPath = path.join(targetDir, targetFileName)
    fs.copyFileSync(absPath, finalPath)
    return { success: true, path: finalPath }
  },

  /** 批量删除成果（同步删除磁盘文件） */
  deleteAchievements(notebookId, achievementIds) {
    if (!Array.isArray(achievementIds) || achievementIds.length === 0) return { success: true }
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const toDelete = data.achievements.filter(a => achievementIds.includes(a.id))
    if (toDelete.length === 0) return { success: true }

    // 先删物理文件
    toDelete.forEach(a => this._tryDeleteAchievementFile(notebookId, a))

    // 再删索引
    data.achievements = data.achievements.filter(a => !achievementIds.includes(a.id))
    this._writeJsonAtomic(indexPath, data)
    return { success: true, count: toDelete.length }
  },

  /** 删除单条成果（同步删除磁盘文件） */
  deleteAchievement(notebookId, achievementId) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.achievements.findIndex(a => a.id === achievementId)
    if (idx === -1) throw new Error(`成果不存在：${achievementId}`)

    this._tryDeleteAchievementFile(notebookId, data.achievements[idx])

    data.achievements.splice(idx, 1)
    this._writeJsonAtomic(indexPath, data)
    return { success: true }
  }
}

module.exports = { notebookAchievementMixin, ACHIEVEMENT_DIRS }

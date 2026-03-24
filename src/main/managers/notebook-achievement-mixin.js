/**
 * NotebookManager — Achievements mixin
 * 成果 CRUD
 */

const path = require('path')
const { v4: uuidv4 } = require('uuid')

const ACHIEVEMENT_DIRS = ['audio', 'video', 'report', 'presentation', 'mindmap', 'flashcard', 'quiz', 'infographic', 'table']

const notebookAchievementMixin = {
  _achievementIndexPath(notebookId) {
    return path.join(this._getNotebookPath(notebookId), 'achievements.json')
  },

  listAchievements(notebookId) {
    return this._readJson(this._achievementIndexPath(notebookId)).achievements
  },

  /**
   * 一致性扫描：清理异常状态的成果记录
   * - generating → done（意外退出后残留的幽灵记录）
   * 在 get() 打开笔记本时自动调用
   */
  sanitizeAchievements(notebookId) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    let changed = false

    for (const ach of data.achievements) {
      if (ach.status === 'generating') {
        ach.status = 'done'
        changed = true
      }
    }

    if (changed) {
      this._writeJsonAtomic(indexPath, data)
      console.log(`[NotebookManager] sanitizeAchievements: cleaned up stale generating records for ${notebookId}`)
    }
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
      selected: true,
      createdAt: this._now()
    }

    data.achievements.push(achievement)
    this._writeJsonAtomic(indexPath, data)
    return achievement
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

  /** 批量删除成果（不删除磁盘文件） */
  deleteAchievements(notebookId, achievementIds) {
    if (!Array.isArray(achievementIds) || achievementIds.length === 0) return { success: true }
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const originalCount = data.achievements.length
    data.achievements = data.achievements.filter(a => !achievementIds.includes(a.id))
    if (data.achievements.length === originalCount) return { success: true }
    this._writeJsonAtomic(indexPath, data)
    return { success: true, count: originalCount - data.achievements.length }
  },

  /** 删除单条成果（不删除磁盘文件） */
  deleteAchievement(notebookId, achievementId) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.achievements.findIndex(a => a.id === achievementId)
    if (idx === -1) throw new Error(`成果不存在：${achievementId}`)
    data.achievements.splice(idx, 1)
    this._writeJsonAtomic(indexPath, data)
    return { success: true }
  }
}

module.exports = { notebookAchievementMixin, ACHIEVEMENT_DIRS }

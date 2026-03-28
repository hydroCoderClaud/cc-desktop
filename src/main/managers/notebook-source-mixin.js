/**
 * NotebookManager — Sources mixin
 * 来源 CRUD、文件导入、复制开关
 */

const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const SOURCE_DIRS = [
  'document', 'spreadsheet', 'presentation',
  'markdown', 'web', 'code', 'data',
  'image', 'audio', 'video', 'other'
]

function sanitizeChatBaseName(filename, fallback) {
  const raw = (filename || '').trim()
  const ext = path.extname(raw)
  const base = ext ? raw.slice(0, -ext.length) : raw
  const normalized = (base || fallback || 'chat')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || fallback || 'chat'
}

function buildChatTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/** 根据扩展名推断来源类型 */
function detectSourceType(ext) {
  if (['pdf', 'docx', 'doc', 'txt', 'rtf', 'odt'].includes(ext)) return 'document'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet'
  if (['pptx', 'ppt'].includes(ext)) return 'presentation'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['html', 'htm'].includes(ext)) return 'web'
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) return 'data'
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
    'css', 'vue', 'sh', 'ps1', 'sql', 'rb', 'php', 'swift', 'kt'].includes(ext)) return 'code'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio'
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video'
  return 'other'
}

const notebookSourceMixin = {
  _sourceIndexPath(notebookId) {
    return path.join(this._getNotebookPath(notebookId), 'sources.json')
  },

  _isNotebookManagedSource(notebookId, source) {
    if (!source?.path || path.isAbsolute(source.path)) return false
    const normalized = source.path.replace(/\\/g, '/').replace(/^\.\//, '')
    if (!normalized.startsWith('sources/')) return false
    const notebookPath = this._getNotebookPath(notebookId)
    const absPath = path.resolve(notebookPath, source.path)
    const sourcesRoot = path.resolve(path.join(notebookPath, 'sources'))
    return absPath === sourcesRoot || absPath.startsWith(`${sourcesRoot}${path.sep}`)
  },

  _tryDeleteSourceFile(notebookId, source) {
    if (!this._isNotebookManagedSource(notebookId, source)) return
    const notebookPath = this._getNotebookPath(notebookId)
    const absPath = path.resolve(notebookPath, source.path)
    try {
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath)
        console.log(`[NotebookManager] Deleted source file: ${absPath}`)
      }
    } catch (err) {
      console.warn(`[NotebookManager] Failed to delete source file: ${absPath}`, err.message)
    }
  },

  listSources(notebookId) {
    return this._readJson(this._sourceIndexPath(notebookId)).sources
  },

  sanitizeSources(notebookId) {
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const notebookPath = this._getNotebookPath(notebookId)
    const validSources = []
    let removedCount = 0

    for (const source of data.sources) {
      if (!source?.path) {
        validSources.push(source)
        continue
      }

      const fullPath = path.isAbsolute(source.path)
        ? source.path
        : path.join(notebookPath, source.path)

      if (fs.existsSync(fullPath)) {
        validSources.push(source)
        continue
      }

      removedCount++
      console.log(`[NotebookManager] sanitizeSources: removed missing source ${source.id} - ${source.path}`)
    }

    if (removedCount > 0) {
      data.sources = validSources
      this._writeJsonAtomic(indexPath, data)
    }

    return removedCount
  },

  /**
   * 导入文件作为来源
   * @param {string} notebookId
   * @param {string} filePath 外部文件路径
   * @param {string} [type] 可选，手动指定类型
   */
  async importFile(notebookId, filePath, type, options = {}) {
    if (!fs.existsSync(filePath)) throw new Error(`文件不存在：${filePath}`)

    const notebookPath = this._getNotebookPath(notebookId)
    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) throw new Error('暂不支持导入目录')

    const ext = path.extname(filePath).toLowerCase().slice(1)
    const fileName = path.basename(filePath)
    const detectedType = type || detectSourceType(ext)

    // 读取笔记本级别的复制开关；forceCopy=true 时始终复制
    const meta = this._readJson(path.join(notebookPath, 'notebook.json'))
    const copyFiles = options.forceCopy === true ? true : !!meta.copySourceFiles

    let storedPath, summary, targetFileName

    if (copyFiles) {
      const typeDir = SOURCE_DIRS.includes(detectedType) ? detectedType : 'other'
      const relDir = path.join('sources', typeDir)
      const targetDir = path.join(notebookPath, relDir)
      fs.mkdirSync(targetDir, { recursive: true })

      // 避免重名：path.parse 提到循环外
      const parsedName = path.parse(fileName)
      targetFileName = fileName
      let counter = 1
      while (fs.existsSync(path.join(targetDir, targetFileName))) {
        targetFileName = `${parsedName.name}_${counter}${parsedName.ext}`
        counter++
      }

      const targetPath = path.join(targetDir, targetFileName)
      fs.copyFileSync(filePath, targetPath)

      storedPath = path.join(relDir, targetFileName).replace(/\\/g, '/')
      summary = JSON.stringify({
        i18nKey: 'notebook.source.importInfoWithCopy',
        params: { path: filePath, time: new Date().toLocaleString(), currentPath: targetPath }
      })
    } else {
      storedPath = filePath
      summary = JSON.stringify({
        i18nKey: 'notebook.source.importInfo',
        params: { path: filePath, time: new Date().toLocaleString() }
      })
    }

    return this.addSource(notebookId, {
      name: copyFiles ? targetFileName : fileName,
      type: detectedType,
      path: storedPath,
      summary
    })
  },

  /**
   * 批量导入文件
   * @param {string} notebookId
   * @param {string[]} filePaths
   */
  async importFiles(notebookId, filePaths) {
    const results = []
    for (const fp of filePaths) {
      try {
        results.push(await this.importFile(notebookId, fp))
      } catch (err) {
        console.error(`[NotebookManager] Failed to import file: ${fp}`, err)
      }
    }
    return results
  },

  async addAchievementToSource(notebookId, achievementId) {
    const achievement = this.listAchievements(notebookId).find(a => a.id === achievementId)
    if (!achievement) throw new Error(`成果不存在：${achievementId}`)
    if (achievement.status !== 'done') throw new Error('仅已完成的成果可添加到来源')
    if (!achievement.path) throw new Error('成果文件路径不存在')

    const notebookPath = this._getNotebookPath(notebookId)
    const absPath = path.isAbsolute(achievement.path)
      ? achievement.path
      : path.join(notebookPath, achievement.path)

    if (!fs.existsSync(absPath)) {
      throw new Error(`成果文件不存在：${absPath}`)
    }

    return this.importFile(notebookId, absPath, undefined, { forceCopy: true })
  },

  /**
   * 添加来源
   * @param {string} notebookId
   * @param {{ name, type, url?, tags?, summary?, path? }} sourceData
   */
  addSource(notebookId, sourceData) {
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)

    // 确保子目录存在
    const notebookPath = this._getNotebookPath(notebookId)
    const typeDir = SOURCE_DIRS.includes(sourceData.type) ? sourceData.type : 'other'
    fs.mkdirSync(path.join(notebookPath, 'sources', typeDir), { recursive: true })

    const source = {
      id: 'src-' + uuidv4().replace(/-/g, '').slice(0, 8),
      name: sourceData.name || 'source',
      type: sourceData.type || 'text',
      path: sourceData.path || null,
      url: sourceData.url || null,
      tags: sourceData.tags || [],
      summary: sourceData.summary || '',
      selected: true,
      createdAt: this._now()
    }

    data.sources.push(source)
    this._writeJsonAtomic(indexPath, data)
    return source
  },

  _ensureUniqueNotebookFile(targetDir, fileName) {
    const parsedName = path.parse(fileName)
    let uniqueName = fileName
    let counter = 1
    while (fs.existsSync(path.join(targetDir, uniqueName))) {
      uniqueName = `${parsedName.name}_${counter}${parsedName.ext}`
      counter++
    }
    return uniqueName
  },

  _saveNotebookBinaryFile(targetDir, fileName, buffer) {
    fs.mkdirSync(targetDir, { recursive: true })
    const uniqueName = this._ensureUniqueNotebookFile(targetDir, fileName)
    const finalPath = path.join(targetDir, uniqueName)
    fs.writeFileSync(finalPath, buffer)
    return { fileName: uniqueName, fullPath: finalPath }
  },

  _saveNotebookTextFile(targetDir, fileName, content) {
    fs.mkdirSync(targetDir, { recursive: true })
    const uniqueName = this._ensureUniqueNotebookFile(targetDir, fileName)
    const finalPath = path.join(targetDir, uniqueName)
    fs.writeFileSync(finalPath, content, 'utf-8')
    return { fileName: uniqueName, fullPath: finalPath }
  },

  async saveChatImageToSource(notebookId, { filename, dataUrl } = {}) {
    if (!dataUrl || typeof dataUrl !== 'string') throw new Error('图片数据不能为空')
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) throw new Error('无效的图片数据')

    const notebookPath = this._getNotebookPath(notebookId)
    const targetDir = path.join(notebookPath, 'sources', 'image')
    const baseName = sanitizeChatBaseName(filename, `chat-image-${buildChatTimestamp()}`)
    const { fileName } = this._saveNotebookBinaryFile(
      targetDir,
      `${baseName}.png`,
      Buffer.from(dataUrl.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''), 'base64')
    )

    return this.addSource(notebookId, {
      name: fileName,
      type: 'image',
      path: path.join('sources', 'image', fileName).replace(/\\/g, '/')
    })
  },

  saveChatMarkdownToSource(notebookId, { filename, content } = {}) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('消息内容不能为空')

    const notebookPath = this._getNotebookPath(notebookId)
    const targetDir = path.join(notebookPath, 'sources', 'markdown')
    const baseName = sanitizeChatBaseName(filename, `chat-markdown-${buildChatTimestamp()}`)
    const { fileName } = this._saveNotebookTextFile(targetDir, `${baseName}.md`, content)

    return this.addSource(notebookId, {
      name: fileName,
      type: 'markdown',
      path: path.join('sources', 'markdown', fileName).replace(/\\/g, '/')
    })
  },

  /**
   * 更新来源（selected、summary、tags 等）
   */
  updateSource(notebookId, sourceId, updates) {
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.sources.findIndex(s => s.id === sourceId)
    if (idx === -1) throw new Error(`来源不存在：${sourceId}`)
    const allowed = ['name', 'selected', 'summary', 'tags', 'url']
    allowed.forEach(k => { if (k in updates) data.sources[idx][k] = updates[k] })
    this._writeJsonAtomic(indexPath, data)
    return data.sources[idx]
  },

  /** 批量删除来源（内部来源同步删除物理文件，外部来源仅删除索引） */
  deleteSources(notebookId, sourceIds) {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) return { success: true }
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const toDelete = data.sources.filter(s => sourceIds.includes(s.id))
    if (toDelete.length === 0) return { success: true }

    toDelete.forEach(source => this._tryDeleteSourceFile(notebookId, source))

    data.sources = data.sources.filter(s => !sourceIds.includes(s.id))
    this._writeJsonAtomic(indexPath, data)
    return { success: true, count: toDelete.length }
  },

  /** 删除单条来源（内部来源同步删除物理文件，外部来源仅删除索引） */
  deleteSource(notebookId, sourceId) {
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.sources.findIndex(s => s.id === sourceId)
    if (idx === -1) throw new Error(`来源不存在：${sourceId}`)
    this._tryDeleteSourceFile(notebookId, data.sources[idx])
    data.sources.splice(idx, 1)
    this._writeJsonAtomic(indexPath, data)
    return { success: true }
  },

  /** 设置复制来源文件开关，持久化到 notebook.json */
  setCopySourceFiles(notebookId, value) {
    const notebookPath = this._getNotebookPath(notebookId)
    const metaFile = path.join(notebookPath, 'notebook.json')
    const meta = this._readJson(metaFile)
    meta.copySourceFiles = !!value
    meta.updatedAt = this._now()
    this._writeJsonAtomic(metaFile, meta)
    return { success: true, copySourceFiles: meta.copySourceFiles }
  }
}

module.exports = { notebookSourceMixin, SOURCE_DIRS }

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

  listSources(notebookId) {
    return this._readJson(this._sourceIndexPath(notebookId)).sources
  },

  /**
   * 导入文件作为来源
   * @param {string} notebookId
   * @param {string} filePath 外部文件路径
   * @param {string} [type] 可选，手动指定类型
   */
  async importFile(notebookId, filePath, type) {
    if (!fs.existsSync(filePath)) throw new Error(`文件不存在：${filePath}`)

    const notebookPath = this._getNotebookPath(notebookId)
    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) throw new Error('暂不支持导入目录')

    const ext = path.extname(filePath).toLowerCase().slice(1)
    const fileName = path.basename(filePath)
    const detectedType = type || detectSourceType(ext)

    // 读取笔记本级别的复制开关
    const meta = this._readJson(path.join(notebookPath, 'notebook.json'))
    const copyFiles = !!meta.copySourceFiles

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

  /** 批量删除来源（不删除磁盘文件） */
  deleteSources(notebookId, sourceIds) {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) return { success: true }
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const originalCount = data.sources.length
    data.sources = data.sources.filter(s => !sourceIds.includes(s.id))
    if (data.sources.length === originalCount) return { success: true }
    this._writeJsonAtomic(indexPath, data)
    return { success: true, count: originalCount - data.sources.length }
  },

  /** 删除单条来源（不删除磁盘文件） */
  deleteSource(notebookId, sourceId) {
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.sources.findIndex(s => s.id === sourceId)
    if (idx === -1) throw new Error(`来源不存在：${sourceId}`)
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

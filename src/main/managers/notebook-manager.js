/**
 * NotebookManager
 * 管理 Notebook 工程的文件系统操作：创建/列举/删除/重命名笔记本，以及 sources / achievements 的 CRUD。
 * 数据布局（见 docs/superpowers/specs/2026-03-17-notebook-project-structure-design.md）：
 *
 * {baseDir}/{notebook-path}/
 * ├── notebook.json
 * ├── sources.json
 * ├── achievements.json
 * ├── sources/{type}/
 * └── achievements/{type}/
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { v4: uuidv4 } = require('uuid')

const SOURCE_DIRS = ['pdf', 'markdown', 'web', 'image', 'text', 'code', 'audio', 'video']
const ACHIEVEMENT_DIRS = ['audio', 'video', 'report', 'presentation', 'mindmap', 'flashcard', 'quiz', 'infographic', 'table']

class NotebookManager {
  /**
   * @param {import('../config-manager')} configManager
   * @param {import('../agent-session-manager').AgentSessionManager} [agentSessionManager]
   */
  constructor(configManager, agentSessionManager) {
    this.configManager = configManager
    this.agentSessionManager = agentSessionManager
  }

  // ─────────────────────────────── helpers ────────────────────────────────

  _getNotebookConfig() {
    const cfg = this.configManager.getConfig()
    return cfg?.settings?.notebook || {}
  }

  _getBaseDir() {
    const nb = this._getNotebookConfig()
    return nb.baseDir
      ? nb.baseDir.replace(/^~/, os.homedir())
      : path.join(os.homedir(), 'cc-desktop-notebooks')
  }

  /** 将 notebook 注册表中的 path 解析为绝对路径 */
  _resolvePath(notebookPath) {
    if (path.isAbsolute(notebookPath)) return notebookPath
    return path.join(this._getBaseDir(), notebookPath)
  }

  _readJson(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  }

  _writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  /** 安全写入：先写临时文件再重命名，避免损坏 */
  _writeJsonAtomic(filePath, data) {
    const tmp = filePath + '.tmp'
    this._writeJson(tmp, data)
    fs.renameSync(tmp, filePath)
  }

  _now() {
    return new Date().toISOString()
  }

  /** 获取笔记本的绝对路径（通过 ID 查找） */
  _getNotebookPath(notebookId) {
    const entry = this._getRegistry().find(n => n.id === notebookId)
    if (!entry) throw new Error(`笔记本不存在：${notebookId}`)
    return this._resolvePath(entry.path)
  }

  // ─────────────────────────── config registry ─────────────────────────────

  /** 从 config.json 取注册表 */
  _getRegistry() {
    return this._getNotebookConfig().notebooks || []
  }

  /** 保存注册表到 config.json */
  _saveRegistry(notebooks) {
    const cfg = this.configManager.getConfig()
    if (!cfg.settings) cfg.settings = {}
    if (!cfg.settings.notebook) cfg.settings.notebook = {}
    cfg.settings.notebook.notebooks = notebooks
    this.configManager.save()
  }

  // ─────────────────────────── notebook CRUD ───────────────────────────────

  /**
   * 创建新笔记本
   * @param {{ name: string, path?: string, apiProfileId?: string }} options
   * @returns {{ id, name, path, notebookPath }}
   */
  /**
   * 创建新笔记本（带事务保护）
   * @param {{ name: string, path?: string, apiProfileId?: string }} options
   * @returns {{ id, name, path, notebookPath }}
   */
  create({ name, path: relPath, apiProfileId }) {
    if (!name || !name.trim()) throw new Error('名称不能为空')

    const id = 'nb-' + uuidv4().replace(/-/g, '').slice(0, 8)
    const safeName = relPath || name.replace(/[\\/:*?"<>|]/g, '-').trim()
    const baseDir = this._getBaseDir()
    const notebookPath = path.join(baseDir, safeName)

    // 目录已存在则报错
    if (fs.existsSync(notebookPath)) {
      throw new Error(`目录已存在：${notebookPath}`)
    }

    let sessionId = null
    let directoryCreated = false

    try {
      // 1. 创建目录结构
      fs.mkdirSync(notebookPath, { recursive: true })
      SOURCE_DIRS.forEach(d => fs.mkdirSync(path.join(notebookPath, 'sources', d), { recursive: true }))
      ACHIEVEMENT_DIRS.forEach(d => fs.mkdirSync(path.join(notebookPath, 'achievements', d), { recursive: true }))
      directoryCreated = true

      // 2. 创建绑定的 Agent 会话（cwd 指向笔记本目录）
      if (this.agentSessionManager) {
        try {
          const session = this.agentSessionManager.create({
            type: 'notebook',
            title: name,
            cwd: notebookPath,
            apiProfileId: apiProfileId || undefined
          })
          sessionId = session.id
          console.log('[NotebookManager] Created agent session for notebook:', { notebookId: id, sessionId, cwd: notebookPath })
        } catch (err) {
          console.error('[NotebookManager] Failed to create agent session:', err)
        }
      }

      // 3. 写入 notebook.json
      const now = this._now()
      this._writeJson(path.join(notebookPath, 'notebook.json'), {
        id, name, sessionId, apiProfileId: apiProfileId || null,
        createdAt: now, updatedAt: now
      })

      // 4. 写入空索引
      this._writeJson(path.join(notebookPath, 'sources.json'), { version: '1.0', sources: [] })
      this._writeJson(path.join(notebookPath, 'achievements.json'), { version: '1.0', achievements: [] })

      // 5. 注册到 config.json（最后一步，失败时回滚）
      const registry = this._getRegistry()
      registry.push({ id, name, path: safeName })
      this._saveRegistry(registry)

      return { id, name, path: safeName, notebookPath, sessionId }
    } catch (err) {
      // 回滚：删除已创建的目录
      if (directoryCreated && fs.existsSync(notebookPath)) {
        console.error('[NotebookManager] Create failed, rolling back directory:', notebookPath)
        try {
          fs.rmSync(notebookPath, { recursive: true, force: true })
        } catch (cleanupErr) {
          console.error('[NotebookManager] Failed to cleanup directory:', cleanupErr)
        }
      }
      throw err
    }
  }

  /**
   * 列举所有笔记本（含元数据）
   * @returns {Array}
   */
  list() {
    const registry = this._getRegistry()
    return registry.map(entry => {
      const notebookPath = this._resolvePath(entry.path)
      const metaFile = path.join(notebookPath, 'notebook.json')
      let meta = {}
      try {
        meta = this._readJson(metaFile)
      } catch {
        // 目录缺失时仍返回注册信息
      }
      return { ...entry, ...meta, notebookPath }
    })
  }

  /**
   * 获取单个笔记本（含索引文件内容）
   * @param {string} id
   */
  get(id) {
    const entry = this._getRegistry().find(n => n.id === id)
    if (!entry) throw new Error(`笔记本不存在：${id}`)
    const notebookPath = this._resolvePath(entry.path)
    const metaFile = path.join(notebookPath, 'notebook.json')
    const meta = this._readJson(metaFile)

    console.log('[NotebookManager] get() before lazy-bind:', { notebookId: id, sessionId: meta.sessionId, hasAgentSessionManager: !!this.agentSessionManager })

    // 懒绑定：旧笔记本没有 sessionId 时自动补创 Agent 会话
    if (!meta.sessionId && this.agentSessionManager) {
      try {
        const session = this.agentSessionManager.create({
          type: 'notebook',
          title: meta.name,
          cwd: notebookPath,
          apiProfileId: meta.apiProfileId || undefined
        })
        meta.sessionId = session.id
        console.log('[NotebookManager] Lazy-bound agent session:', { notebookId: id, sessionId: meta.sessionId })
        meta.updatedAt = this._now()
        this._writeJsonAtomic(metaFile, meta)
      } catch (err) {
        console.error('[NotebookManager] Failed to lazy-bind agent session:', err)
      }
    }

    const sources = this._readJson(path.join(notebookPath, 'sources.json'))
    const achievements = this._readJson(path.join(notebookPath, 'achievements.json'))
    console.log('[NotebookManager] get() returning:', { notebookId: id, sessionId: meta.sessionId, notebookPath })
    return { ...meta, path: entry.path, notebookPath, sources: sources.sources, achievements: achievements.achievements }
  }

  /**
   * 重命名笔记本（只更新元数据，不重命名物理目录）
   * @param {string} id
   * @param {string} newName
   */
  rename(id, newName) {
    if (!newName || !newName.trim()) throw new Error('名称不能为空')

    const registry = this._getRegistry()
    const idx = registry.findIndex(n => n.id === id)
    if (idx === -1) throw new Error(`笔记本不存在：${id}`)

    const entry = registry[idx]
    const notebookPath = this._resolvePath(entry.path)

    // 更新 notebook.json 中的名称
    const metaFile = path.join(notebookPath, 'notebook.json')
    const meta = this._readJson(metaFile)
    meta.name = newName
    meta.updatedAt = this._now()
    this._writeJsonAtomic(metaFile, meta)

    // 更新注册表中的名称（保持 path 不变）
    registry[idx] = { ...entry, name: newName }
    this._saveRegistry(registry)

    return { id, name: newName, path: entry.path, notebookPath }
  }

  /**
   * 删除笔记本（带事务保护）
   * @param {string} id
   */
  async delete(id) {
    console.log('[NotebookManager] Deleting notebook:', id)
    const registry = this._getRegistry()
    const idx = registry.findIndex(n => n.id === id)
    if (idx === -1) throw new Error(`笔记本不存在：${id}`)

    const notebookPath = this._resolvePath(registry[idx].path)
    const registryBackup = [...registry]  // 备份注册表

    try {
      // 1. 先从注册表移除（失败时可以恢复）
      registry.splice(idx, 1)
      this._saveRegistry(registry)

      // 2. 关闭并删除关联的 Agent 会话（内存 + DB）
      if (this.agentSessionManager) {
        try {
          const metaFile = path.join(notebookPath, 'notebook.json')
          if (fs.existsSync(metaFile)) {
            const meta = this._readJson(metaFile)
            if (meta.sessionId) {
              await this.agentSessionManager.deleteConversation(meta.sessionId)
            }
          }
        } catch (err) {
          console.error('[NotebookManager] Failed to delete agent session:', err)
          // 继续删除目录，即使会话删除失败
        }
      }

      // 3. 删除笔记本目录（递归手动删除，避免 fs.rmSync 在 Windows 中文路径上的 bug）
      if (fs.existsSync(notebookPath)) {
        const deleteRecursive = (dirPath) => {
          if (!fs.existsSync(dirPath)) return

          const entries = fs.readdirSync(dirPath, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
              deleteRecursive(fullPath)
            } else {
              try {
                fs.unlinkSync(fullPath)
              } catch (err) {
                console.warn('[NotebookManager] Failed to delete file:', fullPath, err.message)
                // 继续删除其他文件
              }
            }
          }

          try {
            fs.rmdirSync(dirPath)
          } catch (err) {
            console.warn('[NotebookManager] Failed to delete directory:', dirPath, err.message)
            // 如果是根目录删除失败，抛出异常
            if (dirPath === notebookPath) {
              throw err
            }
          }
        }

        deleteRecursive(notebookPath)
      }

      console.log('[NotebookManager] Notebook deleted successfully')
      return { success: true }
    } catch (err) {
      // 回滚：恢复注册表
      console.error('[NotebookManager] Delete failed, rolling back registry:', err)
      this._saveRegistry(registryBackup)
      throw new Error(`删除失败：${err.message}`)
    }
  }

  /** 绑定 Agent 会话 */
  bindSession(id, sessionId) {
    const notebookPath = this._getNotebookPath(id)
    const metaFile = path.join(notebookPath, 'notebook.json')
    const meta = this._readJson(metaFile)
    meta.sessionId = sessionId
    meta.updatedAt = this._now()
    this._writeJsonAtomic(metaFile, meta)
    return { success: true }
  }

  // ─────────────────────────── sources CRUD ────────────────────────────────

  _sourceIndexPath(notebookId) {
    return path.join(this._getNotebookPath(notebookId), 'sources.json')
  }

  listSources(notebookId) {
    const data = this._readJson(this._sourceIndexPath(notebookId))
    return data.sources
  }

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

    // 自动推断类型
    let detectedType = type
    if (!detectedType) {
      if (['pdf'].includes(ext)) detectedType = 'pdf'
      else if (['md', 'markdown'].includes(ext)) detectedType = 'markdown'
      else if (['html', 'htm'].includes(ext)) detectedType = 'web'
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) detectedType = 'image'
      else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) detectedType = 'audio'
      else if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) detectedType = 'video'
      else if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs', 'html', 'css', 'json', 'yaml', 'yml', 'toml', 'vue', 'sh', 'ps1', 'sql', 'rb', 'php', 'swift', 'kt'].includes(ext)) detectedType = 'code'
      else detectedType = 'text'
    }

    const typeDir = SOURCE_DIRS.includes(detectedType) ? detectedType : 'text'
    const relDir = path.join('sources', typeDir)
    const targetDir = path.join(notebookPath, relDir)
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })

    // 避免重名
    let targetFileName = fileName
    let counter = 1
    while (fs.existsSync(path.join(targetDir, targetFileName))) {
      const parsed = path.parse(fileName)
      targetFileName = `${parsed.name}_${counter}${parsed.ext}`
      counter++
    }

    const targetPath = path.join(targetDir, targetFileName)
    const relPath = path.join(relDir, targetFileName).replace(/\\/g, '/')

    // 复制文件
    fs.copyFileSync(filePath, targetPath)

    // 添加到索引
    return this.addSource(notebookId, {
      name: fileName,
      type: detectedType,
      path: relPath,
      summary: `Imported from ${filePath} at ${new Date().toLocaleString()}`
    })
  }

  /**
   * 批量导入文件
   * @param {string} notebookId
   * @param {string[]} filePaths
   */
  async importFiles(notebookId, filePaths) {
    const results = []
    for (const fp of filePaths) {
      try {
        const res = await this.importFile(notebookId, fp)
        results.push(res)
      } catch (err) {
        console.error(`[NotebookManager] Failed to import file: ${fp}`, err)
      }
    }
    return results
  }

  /**
   * 添加来源
   * @param {string} notebookId
   * @param {{ name, type, url?, tags?, summary?, content? }} sourceData
   */
  addSource(notebookId, sourceData) {
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)

    const notebookPath = this._getNotebookPath(notebookId)

    // 确定存储子目录
    const typeDir = SOURCE_DIRS.includes(sourceData.type) ? sourceData.type : sourceData.type
    const subDir = path.join(notebookPath, 'sources', typeDir)
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true })

    const id = 'src-' + uuidv4().replace(/-/g, '').slice(0, 8)
    const now = this._now()
    const source = {
      id,
      name: sourceData.name || id,
      type: sourceData.type || 'text',
      path: sourceData.path || null,
      url: sourceData.url || null,
      tags: sourceData.tags || [],
      summary: sourceData.summary || '',
      selected: true,
      createdAt: now
    }

    data.sources.push(source)
    this._writeJsonAtomic(indexPath, data)
    return source
  }

  /**
   * 更新来源（selected、summary、tags 等）
   * @param {string} notebookId
   * @param {string} sourceId
   * @param {Object} updates
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
  }

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
  }

  /** 删除来源（不删除磁盘文件） */
  deleteSource(notebookId, sourceId) {
    const indexPath = this._sourceIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.sources.findIndex(s => s.id === sourceId)
    if (idx === -1) throw new Error(`来源不存在：${sourceId}`)
    data.sources.splice(idx, 1)
    this._writeJsonAtomic(indexPath, data)
    return { success: true }
  }

  // ─────────────────────────── achievements CRUD ───────────────────────────

  _achievementIndexPath(notebookId) {
    return path.join(this._getNotebookPath(notebookId), 'achievements.json')
  }

  listAchievements(notebookId) {
    const data = this._readJson(this._achievementIndexPath(notebookId))
    return data.achievements
  }

  /**
   * 添加成果（status 默认 generating）
   * @param {string} notebookId
   * @param {{ name, type, sourceIds?, prompt? }} achievementData
   */
  addAchievement(notebookId, achievementData) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)

    const id = 'ach-' + uuidv4().replace(/-/g, '').slice(0, 8)
    const now = this._now()
    const achievement = {
      id,
      name: achievementData.name || id,
      type: achievementData.type || 'report',
      path: null,
      category: achievementData.type || 'report',
      sourceIds: achievementData.sourceIds || [],
      prompt: achievementData.prompt || '',
      status: 'generating',
      selected: true,
      createdAt: now
    }

    data.achievements.push(achievement)
    this._writeJsonAtomic(indexPath, data)
    return achievement
  }

  /**
   * 更新成果（status、path 等）
   * @param {string} notebookId
   * @param {string} achievementId
   * @param {Object} updates
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
  }

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
  }

  /** 删除成果（不删除磁盘文件） */
  deleteAchievement(notebookId, achievementId) {
    const indexPath = this._achievementIndexPath(notebookId)
    const data = this._readJson(indexPath)
    const idx = data.achievements.findIndex(a => a.id === achievementId)
    if (idx === -1) throw new Error(`成果不存在：${achievementId}`)
    data.achievements.splice(idx, 1)
    this._writeJsonAtomic(indexPath, data)
    return { success: true }
  }

  /**
   * 读取笔记本内的文件内容
   * @param {string} notebookId 
   * @param {string} relPath 相对路径（如 sources/pdf/xxx.pdf）
   * @returns {Promise<{ content: string, type: 'text'|'image'|'binary' }>}
   */
  async readFileContent(notebookId, relPath) {
    const notebookPath = this._getNotebookPath(notebookId)
    const fullPath = path.join(notebookPath, relPath)
    if (!fs.existsSync(fullPath)) throw new Error(`文件不存在：${relPath}`)

    const ext = path.extname(fullPath).toLowerCase().slice(1)
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
    const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)
    const isVideo = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv'].includes(ext)

    const isPdf = ext === 'pdf'
    const isHtml = ext === 'html'
    const isWord = ['docx'].includes(ext)
    const isExcel = ['xlsx', 'xls', 'csv'].includes(ext)
    const isPpt = ['pptx', 'ppt'].includes(ext)

    if (isImage || isAudio || isVideo) {
      const buffer = fs.readFileSync(fullPath)
      let mimeType = ''
      if (isImage) {
        mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
      } else if (isAudio) {
        mimeType = `audio/${ext === 'mp3' ? 'mpeg' : ext}`
      } else {
        mimeType = `video/${ext === 'mov' ? 'quicktime' : ext}`
      }
      return {
        type: isImage ? 'image' : (isAudio ? 'audio' : 'video'),
        content: `data:${mimeType};base64,${buffer.toString('base64')}`
      }
    }

    if (isPdf || isHtml) {
      return {
        type: isPdf ? 'pdf' : 'html',
        content: fullPath // 保持绝对路径，供 webview 使用
      }
    }

    // Word 预览 (docx -> html)
    if (isWord) {
      try {
        const mammoth = require('mammoth')
        const result = await mammoth.convertToHtml({ path: fullPath })
        return { type: 'word', content: result.value }
      } catch (err) {
        console.error('[NotebookManager] Word parse error:', err)
        throw new Error(`Word 文件解析失败：${err.message}`)
      }
    }

    // Excel 预览 (xlsx -> json)
    if (isExcel) {
      try {
        const XLSX = require('xlsx')
        const workbook = XLSX.readFile(fullPath)
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        return { type: 'excel', content: JSON.stringify(data), meta: { sheetNames: workbook.SheetNames } }
      } catch (err) {
        console.error('[NotebookManager] Excel parse error:', err)
        throw new Error(`Excel 文件解析失败：${err.message}`)
      }
    }

    // PPT 预览 (暂不支持深度解析，返回占位)
    if (isPpt) {
      return { type: 'pptx', content: fullPath }
    }

    // 默认作为文本读取
    try {
      const content = fs.readFileSync(fullPath, 'utf-8')
      return { type: 'text', content }
    } catch (err) {
      // 若读取失败（如二进制文件），返回路径
      return { type: 'binary', content: fullPath }
    }
  }
}

module.exports = { NotebookManager }

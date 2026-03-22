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

const { notebookSourceMixin, SOURCE_DIRS } = require('./notebook-source-mixin')
const { notebookAchievementMixin, ACHIEVEMENT_DIRS } = require('./notebook-achievement-mixin')
const { notebookToolsMixin } = require('./notebook-tools-mixin')
const { readFileContent } = require('./notebook-file-reader')

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
    return this.configManager.getConfig()?.settings?.notebook || {}
  }

  _getBaseDir() {
    const nb = this._getNotebookConfig()
    return nb.baseDir
      ? nb.baseDir.replace(/^~/, os.homedir())
      : path.join(os.homedir(), 'cc-desktop-notebooks')
  }

  _resolvePath(notebookPath) {
    if (path.isAbsolute(notebookPath)) return notebookPath
    return path.join(this._getBaseDir(), notebookPath)
  }

  _readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
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

  _getNotebookPath(notebookId) {
    const entry = this._getRegistry().find(n => n.id === notebookId)
    if (!entry) throw new Error(`笔记本不存在：${notebookId}`)
    return this._resolvePath(entry.path)
  }

  // ─────────────────────────── config registry ─────────────────────────────

  _getRegistry() {
    return this._getNotebookConfig().notebooks || []
  }

  _saveRegistry(notebooks) {
    const cfg = this.configManager.getConfig()
    if (!cfg.settings) cfg.settings = {}
    if (!cfg.settings.notebook) cfg.settings.notebook = {}
    cfg.settings.notebook.notebooks = notebooks
    this.configManager.save()
  }

  // ─────────────────────────── notebook CRUD ───────────────────────────────

  /**
   * 创建新笔记本（带事务保护）
   * @param {{ name: string, path?: string, apiProfileId?: string }} options
   */
  create({ name, path: relPath, apiProfileId }) {
    if (!name || !name.trim()) throw new Error('名称不能为空')

    const id = 'nb-' + uuidv4().replace(/-/g, '').slice(0, 8)
    const safeName = relPath || name.replace(/[\\/:*?"<>|]/g, '-').trim()
    const notebookPath = path.join(this._getBaseDir(), safeName)

    if (fs.existsSync(notebookPath)) throw new Error(`目录已存在：${notebookPath}`)

    let sessionId = null
    let directoryCreated = false

    try {
      fs.mkdirSync(notebookPath, { recursive: true })
      SOURCE_DIRS.forEach(d => fs.mkdirSync(path.join(notebookPath, 'sources', d), { recursive: true }))
      ACHIEVEMENT_DIRS.forEach(d => fs.mkdirSync(path.join(notebookPath, 'achievements', d), { recursive: true }))
      directoryCreated = true

      if (this.agentSessionManager) {
        try {
          const session = this.agentSessionManager.create({
            type: 'notebook', title: name, cwd: notebookPath, apiProfileId: apiProfileId || undefined
          })
          sessionId = session.id
          console.log('[NotebookManager] Created agent session:', { notebookId: id, sessionId })
        } catch (err) {
          console.error('[NotebookManager] Failed to create agent session:', err)
        }
      }

      const now = this._now()
      this._writeJson(path.join(notebookPath, 'notebook.json'), {
        id, name, sessionId, apiProfileId: apiProfileId || null, createdAt: now, updatedAt: now
      })
      this._writeJson(path.join(notebookPath, 'sources.json'), { version: '1.0', sources: [] })
      this._writeJson(path.join(notebookPath, 'achievements.json'), { version: '1.0', achievements: [] })

      const registry = this._getRegistry()
      registry.push({ id, name, path: safeName })
      this._saveRegistry(registry)

      return { id, name, path: safeName, notebookPath, sessionId }
    } catch (err) {
      if (directoryCreated && fs.existsSync(notebookPath)) {
        try { fs.rmSync(notebookPath, { recursive: true, force: true }) } catch { /* ignore */ }
      }
      throw err
    }
  }

  /** 列举所有笔记本（含元数据） */
  list() {
    return this._getRegistry().map(entry => {
      const notebookPath = this._resolvePath(entry.path)
      let meta = {}
      try { meta = this._readJson(path.join(notebookPath, 'notebook.json')) } catch { /* 目录缺失时仍返回注册信息 */ }
      return { ...entry, ...meta, notebookPath }
    })
  }

  /** 获取单个笔记本（含索引文件内容） */
  get(id) {
    const entry = this._getRegistry().find(n => n.id === id)
    if (!entry) throw new Error(`笔记本不存在：${id}`)
    const notebookPath = this._resolvePath(entry.path)
    const metaFile = path.join(notebookPath, 'notebook.json')
    const meta = this._readJson(metaFile)

    console.log('[NotebookManager] get() before lazy-bind:', { notebookId: id, sessionId: meta.sessionId })

    // 懒绑定：旧笔记本没有 sessionId 时自动补创 Agent 会话
    if (!meta.sessionId && this.agentSessionManager) {
      try {
        const session = this.agentSessionManager.create({
          type: 'notebook', title: meta.name, cwd: notebookPath, apiProfileId: meta.apiProfileId || undefined
        })
        meta.sessionId = session.id
        meta.updatedAt = this._now()
        this._writeJsonAtomic(metaFile, meta)
        console.log('[NotebookManager] Lazy-bound agent session:', { notebookId: id, sessionId: meta.sessionId })
      } catch (err) {
        console.error('[NotebookManager] Failed to lazy-bind agent session:', err)
      }
    }

    const sources = this._readJson(path.join(notebookPath, 'sources.json'))
    const achievements = this._readJson(path.join(notebookPath, 'achievements.json'))
    return { ...meta, path: entry.path, notebookPath, sources: sources.sources, achievements: achievements.achievements }
  }

  /** 重命名笔记本（只更新元数据，不重命名物理目录） */
  rename(id, newName) {
    if (!newName || !newName.trim()) throw new Error('名称不能为空')
    const registry = this._getRegistry()
    const idx = registry.findIndex(n => n.id === id)
    if (idx === -1) throw new Error(`笔记本不存在：${id}`)

    const entry = registry[idx]
    const notebookPath = this._resolvePath(entry.path)
    const metaFile = path.join(notebookPath, 'notebook.json')
    const meta = this._readJson(metaFile)
    meta.name = newName
    meta.updatedAt = this._now()
    this._writeJsonAtomic(metaFile, meta)

    registry[idx] = { ...entry, name: newName }
    this._saveRegistry(registry)
    return { id, name: newName, path: entry.path, notebookPath }
  }

  /** 删除笔记本（带事务保护） */
  async delete(id) {
    const registry = this._getRegistry()
    const idx = registry.findIndex(n => n.id === id)
    if (idx === -1) throw new Error(`笔记本不存在：${id}`)

    const notebookPath = this._resolvePath(registry[idx].path)
    const registryBackup = [...registry]

    try {
      registry.splice(idx, 1)
      this._saveRegistry(registry)

      if (this.agentSessionManager) {
        try {
          const metaFile = path.join(notebookPath, 'notebook.json')
          if (fs.existsSync(metaFile)) {
            const meta = this._readJson(metaFile)
            if (meta.sessionId) await this.agentSessionManager.deleteConversation(meta.sessionId)
          }
        } catch (err) {
          console.error('[NotebookManager] Failed to delete agent session:', err)
        }
      }

      // 递归删除（避免 fs.rmSync 在 Windows 中文路径上的 bug）
      if (fs.existsSync(notebookPath)) _deleteRecursive(notebookPath)

      console.log('[NotebookManager] Notebook deleted successfully')
      return { success: true }
    } catch (err) {
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

  /** 读取笔记本内的文件内容（代理到 notebook-file-reader） */
  async readFileContent(notebookId, relPath) {
    const notebookPath = this._getNotebookPath(notebookId)
    // 不复制模式下 relPath 是绝对路径，复制模式下是相对路径
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(notebookPath, relPath)
    return readFileContent(fullPath)
  }
}

/** 递归删除目录（避免 fs.rmSync 在 Windows 中文路径上的 bug） */
function _deleteRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      _deleteRecursive(fullPath)
    } else {
      try { fs.unlinkSync(fullPath) } catch (err) {
        console.warn('[NotebookManager] Failed to delete file:', fullPath, err.message)
      }
    }
  }
  try {
    fs.rmdirSync(dirPath)
  } catch (err) {
    console.warn('[NotebookManager] Failed to delete directory:', dirPath, err.message)
    throw err
  }
}

// 混入 sources / achievements 功能
Object.assign(NotebookManager.prototype, notebookSourceMixin)
Object.assign(NotebookManager.prototype, notebookAchievementMixin)
Object.assign(NotebookManager.prototype, notebookToolsMixin)

module.exports = { NotebookManager }

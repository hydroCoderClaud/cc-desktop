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
const { notebookAchievementMixin } = require('./notebook-achievement-mixin')
const { notebookToolsMixin } = require('./notebook-tools-mixin')
const { notebookGenerationMixin } = require('./notebook-generation-mixin')
const { notebookInstallMixin } = require('./notebook-install-mixin')
const { readFileContent } = require('./notebook-file-reader')

class NotebookManager {
  /**
   * @param {import('../config-manager')} configManager
   * @param {import('../agent-session-manager').AgentSessionManager} [agentSessionManager]
   */
  constructor(configManager, agentSessionManager) {
    this.configManager = configManager
    this.agentSessionManager = agentSessionManager
    this.sessionDatabase = null
    this.capabilityManager = null
  }

  /** 延迟注入 SessionDatabase（在 setupIPCHandlers 中调用） */
  setSessionDatabase(db) {
    this.sessionDatabase = db
  }

  /** 延迟注入 CapabilityManager（在 setupIPCHandlers 中调用） */
  setCapabilityManager(cm) {
    this.capabilityManager = cm
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

  /**
   * 获取指定笔记本的基础目录（支持多目录）
   * @param {string} notebookId
   * @returns {string} basePath
   */
  _getNotebookBaseDir(notebookId) {
    const entry = this._getRegistry().find(n => n.id === notebookId)
    if (!entry) {
      // 新笔记本尚未创建时，使用全局 baseDir
      return this._getBaseDir()
    }
    // 优先使用 entry.basePath，兼容旧数据回退到全局 baseDir
    if (entry.basePath) {
      return entry.basePath.replace(/^~/, os.homedir())
    }
    return this._getBaseDir()
  }

  _resolvePath(notebookPath) {
    if (path.isAbsolute(notebookPath)) return notebookPath
    return path.join(this._getBaseDir(), notebookPath)
  }

  /**
   * 解析笔记本的完整路径（基于 basePath + path）
   * @param {string} notebookId
   * @param {{ basePath?: string, path: string }} entry - 注册表条目
   * @returns {string} 绝对路径
   */
  _resolveNotebookPath(notebookId, entry) {
    if (!entry) {
      entry = this._getRegistry().find(n => n.id === notebookId)
      if (!entry) throw new Error(`笔记本不存在：${notebookId}`)
    }
    // 如果有 basePath，直接拼接
    if (entry.basePath) {
      const basePath = entry.basePath.replace(/^~/, os.homedir())
      return path.join(basePath, entry.path)
    }
    // 兼容旧数据：使用全局 baseDir
    return this._resolvePath(entry.path)
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
    return this._resolveNotebookPath(notebookId, entry)
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
   * @param {{ name: string, path?: string, basePath?: string, apiProfileId?: string }} options
   */
  create({ name, path: relPath, basePath, apiProfileId }) {
    if (!name || !name.trim()) throw new Error('名称不能为空')

    const id = 'nb-' + uuidv4().replace(/-/g, '').slice(0, 8)
    const safeName = relPath || name.replace(/[\\/:*?"<>|]/g, '-').trim()
    // 使用 basePath（如果有）或全局 baseDir
    const actualBaseDir = basePath || this._getBaseDir()
    const notebookPath = path.join(actualBaseDir, safeName)

    if (fs.existsSync(notebookPath)) throw new Error(`目录已存在：${notebookPath}`)

    let sessionId = null
    let directoryCreated = false

    try {
      fs.mkdirSync(notebookPath, { recursive: true })
      SOURCE_DIRS.forEach(d => fs.mkdirSync(path.join(notebookPath, 'sources', d), { recursive: true }))
      fs.mkdirSync(path.join(notebookPath, 'achievements'), { recursive: true })
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
      registry.push({ id, name, path: safeName, basePath: actualBaseDir })
      this._saveRegistry(registry)

      return { id, name, path: safeName, basePath: actualBaseDir, notebookPath, sessionId }
    } catch (err) {
      if (directoryCreated && fs.existsSync(notebookPath)) {
        try { fs.rmSync(notebookPath, { recursive: true, force: true }) } catch { /* ignore */ }
      }
      throw err
    }
  }

  /** 列举所有笔记本（含元数据） */
  list() {
    // 迁移：为旧笔记本自动设置 basePath
    this._migrateLegacyNotebooks()

    return this._getRegistry().map(entry => {
      const notebookPath = this._resolveNotebookPath(null, entry)
      let meta = {}
      try { meta = this._readJson(path.join(notebookPath, 'notebook.json')) } catch { /* 目录缺失时仍返回注册信息 */ }
      return { ...entry, ...meta, notebookPath }
    })
  }

  /**
   * 迁移旧笔记本记录：为没有 basePath 的笔记本自动设置 basePath
   * 通过扫描笔记本目录中的 notebook.json 来确认实际存储位置
   */
  _migrateLegacyNotebooks() {
    const registry = this._getRegistry()
    let needsSave = false

    for (const entry of registry) {
      // 已有 basePath 的跳过
      if (entry.basePath) continue

      // 尝试在当前 baseDir 下查找
      const baseDir = this._getBaseDir()
      const expectedPath = path.join(baseDir, entry.path)
      const notebookJsonPath = path.join(expectedPath, 'notebook.json')

      if (fs.existsSync(notebookJsonPath)) {
        // 在当前 baseDir 下找到，设置 basePath
        entry.basePath = baseDir
        needsSave = true
        console.log(`[NotebookManager] Migrated legacy notebook: ${entry.name} → basePath=${baseDir}`)
      } else {
        // 不在当前 baseDir 下，尝试在用户常见目录中扫描
        const searchDirs = [
          path.join(os.homedir(), 'cc-desktop-notebooks'),
          path.join(os.homedir(), 'Documents', 'cc-desktop-notebooks')
        ]

        for (const searchDir of searchDirs) {
          const searchPath = path.join(searchDir, entry.path, 'notebook.json')
          if (fs.existsSync(searchPath)) {
            entry.basePath = searchDir
            needsSave = true
            console.log(`[NotebookManager] Migrated legacy notebook: ${entry.name} → basePath=${searchDir}`)
            break
          }
        }
      }
    }

    if (needsSave) {
      this._saveRegistry(registry)
    }
  }

  /**
   * 获取单个笔记本（含索引文件内容）
   * @param {string} id
   * @param {{ sanitizeOnOpen?: boolean }} [options]
   */
  get(id, { sanitizeOnOpen = false } = {}) {
    const entry = this._getRegistry().find(n => n.id === id)
    if (!entry) throw new Error(`笔记本不存在：${id}`)
    const notebookPath = this._resolveNotebookPath(id, entry)
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

    // 打开笔记本时的一致性扫描：清理意外退出残留的 generating 记录
    if (sanitizeOnOpen) {
      this.sanitizeAchievements(id)
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
    const notebookPath = this._resolveNotebookPath(id, entry)
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

    const notebookPath = this._resolveNotebookPath(id, registry[idx])
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

  /**
   * 重启会话：清空并重建 Agent 会话，更新 notebook.json 绑定
   * @param {string} id - Notebook ID
   * @returns {object} 完整 notebook 数据（含新 sessionId）
   */
  async restartSession(id) {
    const entry = this._getRegistry().find(n => n.id === id)
    if (!entry) throw new Error(`笔记本不存在：${id}`)

    const notebookPath = this._resolveNotebookPath(id, entry)
    const metaFile = path.join(notebookPath, 'notebook.json')
    const meta = this._readJson(metaFile)

    if (!meta.sessionId) {
      throw new Error('当前笔记本未绑定会话')
    }

    if (!this.agentSessionManager) {
      throw new Error('AgentSessionManager 未初始化')
    }

    // 调用核心方法：清空并重建会话
    const newSession = await this.agentSessionManager.clearAndRecreate(meta.sessionId, {
      type: 'notebook',
      title: '', // 新会话默认空标题，由首条消息触发自动命名
      cwd: notebookPath,
      cwdSubDir: 'notebook'
    })

    // 更新 notebook.json
    meta.sessionId = newSession.id
    meta.apiProfileId = newSession.apiProfileId
    meta.updatedAt = this._now()
    this._writeJsonAtomic(metaFile, meta)

    console.log(`[NotebookManager] Restarted session for notebook ${id}: ${meta.sessionId}`)

    // 返回完整 notebook 数据
    const sources = this._readJson(path.join(notebookPath, 'sources.json'))
    const achievements = this._readJson(path.join(notebookPath, 'achievements.json'))
    return { ...meta, path: entry.path, notebookPath, sources: sources.sources, achievements: achievements.achievements }
  }

  sanitizeIndexes(id) {
    const sourcesRemoved = this.sanitizeSources(id)
    const achievementsRemoved = this.sanitizeAchievements(id, { removeGenerating: false })
    return { success: true, sourcesRemoved, achievementsRemoved }
  }

  /** 读取笔记本内的文件内容（代理到 notebook-file-reader） */
  async readFileContent(notebookId, relPath) {
    if (!relPath) {
      throw new Error('文件路径不能为空')
    }
    const notebookPath = this._getNotebookPath(notebookId)
    // 不复制模式下 relPath 是绝对路径，复制模式下是相对路径
    const isAbsolute = path.isAbsolute(relPath)
    const fullPath = isAbsolute ? relPath : path.resolve(notebookPath, relPath)

    // 安全检查：防止路径遍历攻击（如 ../../../etc/passwd）
    if (!isAbsolute) {
      const normalizedNotebookPath = path.resolve(notebookPath)
      if (!(fullPath === normalizedNotebookPath || fullPath.startsWith(`${normalizedNotebookPath}${path.sep}`))) {
        throw new Error('不允许读取笔记本目录之外的文件')
      }
    }

    return readFileContent(fullPath)
  }

  writeFileContent(notebookId, relPath, content) {
    if (!relPath) {
      throw new Error('文件路径不能为空')
    }
    const notebookPath = this._getNotebookPath(notebookId)
    const isAbsolute = path.isAbsolute(relPath)
    const fullPath = isAbsolute ? relPath : path.resolve(notebookPath, relPath)

    if (!isAbsolute) {
      const normalizedNotebookPath = path.resolve(notebookPath)
      if (!(fullPath === normalizedNotebookPath || fullPath.startsWith(`${normalizedNotebookPath}${path.sep}`))) {
        throw new Error('不允许写入笔记本目录之外的文件')
      }
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`文件不存在：${relPath}`)
    }
    fs.writeFileSync(fullPath, content, 'utf-8')
    return { success: true, path: fullPath }
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
Object.assign(NotebookManager.prototype, notebookGenerationMixin)
Object.assign(NotebookManager.prototype, notebookInstallMixin)

module.exports = { NotebookManager }

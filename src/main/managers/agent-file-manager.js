/**
 * Agent 文件操作管理器
 * 从 agent-session-manager.js 提取的文件操作相关功能
 *
 * 职责：
 * - 工作目录管理（_resolveCwd, _safePath）
 * - 文件/目录浏览（listDir, readFile）
 * - 文件操作（saveFile, createFile, renameFile, deleteFile）
 */

const path = require('path')
const fs = require('fs')
const fsp = require('fs').promises
const {
  HIDDEN_DIRS,
  HIDDEN_DIR_SUFFIXES,
  HIDDEN_FILES,
  TEXT_EXTS,
  IMAGE_EXTS,
  LANG_MAP,
  VIDEO_EXTS,
  MAX_TEXT_SIZE,
  MAX_IMG_SIZE,
  MIME_MAP
} = require('../utils/agent-constants')

class AgentFileManager {
  /**
   * @param {AgentSessionManager} sessionManager - 会话管理器实例（依赖注入）
   */
  constructor(sessionManager) {
    this.sessionManager = sessionManager
  }

  /**
   * 获取会话 cwd（内存优先，DB 兜底）
   */
  _resolveCwd(sessionId) {
    const session = this.sessionManager.sessions.get(sessionId)
    if (session?.cwd) return session.cwd

    // DB 兜底
    if (this.sessionManager.sessionDatabase) {
      const row = this.sessionManager.sessionDatabase.getAgentConversation(sessionId)
      if (row?.cwd) return row.cwd
    }
    return null
  }

  /**
   * 路径遍历安全校验
   * 追加 path.sep 防止前缀碰撞（如 /project vs /projectX）
   */
  _safePath(cwd, relativePath) {
    const resolvedCwd = path.resolve(cwd)
    const target = path.resolve(cwd, relativePath)
    if (target !== resolvedCwd && !target.startsWith(resolvedCwd + path.sep)) {
      throw new Error('Path traversal detected')
    }
    return target
  }

  /**
   * 解析文件完整路径（供外部打开使用）
   * @param {string} sessionId
   * @param {string} relativePath
   * @returns {string|null} 完整路径，失败返回 null
   */
  resolveFilePath(sessionId, relativePath) {
    const cwd = this._resolveCwd(sessionId)
    if (!cwd || !relativePath) return null
    try {
      return this._safePath(cwd, relativePath)
    } catch {
      return null
    }
  }

  /**
   * 列出目录内容（支持子目录，异步避免阻塞主进程）
   * @param {string} sessionId 会话 ID
   * @param {string} relativePath 相对于 cwd 的路径，空字符串表示根目录
   * @returns {Promise<{ entries: Array, cwd: string }>}
   */
  async listDir(sessionId, relativePath = '', showHidden = false) {
    const cwd = this._resolveCwd(sessionId)
    if (!cwd) return { entries: [], cwd: null }

    try {
      const targetDir = this._safePath(cwd, relativePath)

      let stat
      try { stat = await fsp.stat(targetDir) } catch { return { entries: [], cwd } }
      if (!stat.isDirectory()) return { entries: [], cwd }

      const dirents = await fsp.readdir(targetDir, { withFileTypes: true })
      const entries = []

      for (const dirent of dirents) {
        // 过滤系统目录和文件（showHidden 关闭时）
        if (!showHidden) {
          if (dirent.isDirectory() && (
            HIDDEN_DIRS.has(dirent.name) ||
            HIDDEN_DIR_SUFFIXES.some(s => dirent.name.endsWith(s))
          )) continue
          if (!dirent.isDirectory() && HIDDEN_FILES.has(dirent.name)) continue
        }

        const entryRelPath = relativePath ? path.join(relativePath, dirent.name) : dirent.name
        let size = 0
        let mtime = null
        try {
          const entryPath = path.join(targetDir, dirent.name)
          const s = await fsp.stat(entryPath)
          size = s.size
          mtime = s.mtime.toISOString()
        } catch {}
        entries.push({
          name: dirent.name,
          isDirectory: dirent.isDirectory(),
          size,
          mtime,
          relativePath: entryRelPath
        })
      }

      // 排序：目录在前，再按名称字母序
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return { entries, cwd }
    } catch (err) {
      console.error('[AgentFileManager] listDir error:', err.message)
      return { entries: [], cwd, error: 'Failed to load directory' }
    }
  }

  /**
   * 读取文件内容用于预览（异步避免阻塞主进程）
   * @param {string} sessionId 会话 ID
   * @param {string} relativePath 相对于 cwd 的文件路径
   * @returns {Promise<{ name, size, mtime, ext, type, content?, language?, tooLarge? }>}
   */
  async readFile(sessionId, relativePath) {
    const cwd = this._resolveCwd(sessionId)
    if (!cwd) return { error: 'No working directory' }

    try {
      const filePath = this._safePath(cwd, relativePath)

      let stat
      try { stat = await fsp.stat(filePath) } catch { return { error: 'File not found' } }
      if (stat.isDirectory()) return { error: 'Is a directory' }

      const ext = path.extname(filePath).toLowerCase()
      const name = path.basename(filePath)
      const base = { name, size: stat.size, mtime: stat.mtime.toISOString(), ext }

      // SVG 作为图片处理（优先于 textExts 检查）
      if (ext === '.svg') {
        if (stat.size > MAX_IMG_SIZE) {
          return { ...base, type: 'image', tooLarge: true, filePath }
        }
        const content = await fsp.readFile(filePath, 'utf-8')
        return { ...base, type: 'image', content: `data:image/svg+xml;base64,${Buffer.from(content).toString('base64')}`, filePath }
      }

      // HTML 文件特殊处理（用于 iframe 渲染）
      if (ext === '.html' || ext === '.htm') {
        if (stat.size > MAX_TEXT_SIZE) {
          return { ...base, type: 'html', tooLarge: true, filePath }
        }
        try {
          const content = await fsp.readFile(filePath, 'utf-8')
          return { ...base, type: 'html', content, filePath }
        } catch {
          return { ...base, type: 'binary' }
        }
      }

      if (TEXT_EXTS.has(ext) || (name.startsWith('.') && !ext)) {
        // 文本文件（含无扩展名的 dotfiles）
        if (stat.size > MAX_TEXT_SIZE) {
          return { ...base, type: 'text', tooLarge: true, language: LANG_MAP[ext] || 'text', filePath }
        }
        try {
          const content = await fsp.readFile(filePath, 'utf-8')
          return { ...base, type: 'text', content, language: LANG_MAP[ext] || 'text', filePath }
        } catch {
          // UTF-8 解码失败（如二进制 dotfile），退化为 binary
          return { ...base, type: 'binary' }
        }
      }

      if (IMAGE_EXTS.has(ext)) {
        if (stat.size > MAX_IMG_SIZE) {
          return { ...base, type: 'image', tooLarge: true, filePath }
        }
        const mime = MIME_MAP[ext] || 'application/octet-stream'
        const buf = await fsp.readFile(filePath)
        const content = `data:${mime};base64,${buf.toString('base64')}`
        return { ...base, type: 'image', content, filePath }
      }

      // 视频文件（与图片相同，返回 base64 data URL）
      if (VIDEO_EXTS.has(ext)) {
        if (stat.size > 50 * 1024 * 1024) {
          return { ...base, type: 'video', tooLarge: true, filePath }
        }
        const videoMimes = {
          '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
          '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.ogg': 'video/ogg'
        }
        const buf = await fsp.readFile(filePath)
        const content = `data:${videoMimes[ext] || 'video/mp4'};base64,${buf.toString('base64')}`
        return { ...base, type: 'video', content, filePath }
      }

      // 其他二进制文件
      return { ...base, type: 'binary' }
    } catch (err) {
      console.error('[AgentFileManager] readFile error:', err.message)
      return { error: 'Failed to read file' }
    }
  }

  /**
   * 保存文件内容
   * @param {string} sessionId - 会话 ID
   * @param {string} relativePath - 相对路径
   * @param {string} content - 文件内容
   * @returns {object} { success: true } 或 { error: string }
   */
  async saveFile(sessionId, relativePath, content) {
    const cwd = this._resolveCwd(sessionId)
    if (!cwd) return { error: 'No working directory' }

    try {
      const filePath = this._safePath(cwd, relativePath)

      // 检查文件是否存在
      try {
        await fsp.access(filePath)
      } catch {
        return { error: 'File not found' }
      }

      // 写入文件
      await fsp.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      console.error('[AgentFileManager] saveFile error:', err.message)
      return { error: 'Failed to save file' }
    }
  }

  /**
   * 创建文件或文件夹
   * @param {string} sessionId - 会话 ID
   * @param {string} parentPath - 父目录相对路径（空字符串表示根目录）
   * @param {string} name - 文件/文件夹名称
   * @param {boolean} isDirectory - 是否为文件夹
   * @returns {object} { success: true } 或 { error: string }
   */
  async createFile(sessionId, parentPath, name, isDirectory) {
    const cwd = this._resolveCwd(sessionId)
    if (!cwd) return { error: 'No working directory' }

    try {
      const parentDir = this._safePath(cwd, parentPath)
      const targetPath = path.join(parentDir, name)

      // 使用原子操作创建文件/目录（避免 TOCTOU 竞态条件）
      if (isDirectory) {
        // mkdir 的 recursive: false 在目录存在时会抛出 EEXIST
        await fsp.mkdir(targetPath, { recursive: false })
      } else {
        // wx 标志确保文件不存在时才创建，存在时抛出 EEXIST
        await fsp.writeFile(targetPath, '', { encoding: 'utf-8', flag: 'wx' })
      }

      return { success: true }
    } catch (err) {
      console.error('[AgentFileManager] createFile error:', err.message)
      // 友好的错误消息
      if (err.code === 'EEXIST') {
        return { error: 'File or folder already exists' }
      }
      return { error: 'Failed to create: ' + err.message }
    }
  }

  /**
   * 重命名文件或文件夹
   * @param {string} sessionId - 会话 ID
   * @param {string} oldPath - 旧路径（相对路径）
   * @param {string} newName - 新名称（不含路径）
   * @returns {object} { success: true } 或 { error: string }
   */
  async renameFile(sessionId, oldPath, newName) {
    const cwd = this._resolveCwd(sessionId)
    if (!cwd) return { error: 'No working directory' }

    try {
      const oldFullPath = this._safePath(cwd, oldPath)
      const dir = path.dirname(oldFullPath)
      const newFullPath = path.join(dir, newName)

      // 检查旧文件是否存在
      try {
        await fsp.access(oldFullPath)
      } catch {
        return { error: 'File or folder not found' }
      }

      // 检查新名称是否已存在
      try {
        await fsp.access(newFullPath)
        return { error: 'Target name already exists' }
      } catch {
        // 不存在，可以重命名
      }

      await fsp.rename(oldFullPath, newFullPath)
      return { success: true }
    } catch (err) {
      console.error('[AgentFileManager] renameFile error:', err.message)
      return { error: 'Failed to rename: ' + err.message }
    }
  }

  /**
   * 删除文件或文件夹
   * @param {string} sessionId - 会话 ID
   * @param {string} relativePath - 相对路径
   * @returns {object} { success: true } 或 { error: string }
   */
  async deleteFile(sessionId, relativePath) {
    const cwd = this._resolveCwd(sessionId)
    if (!cwd) return { error: 'No working directory' }

    try {
      const targetPath = this._safePath(cwd, relativePath)

      // 检查是否存在
      let stat
      try {
        stat = await fsp.stat(targetPath)
      } catch {
        return { error: 'File or folder not found' }
      }

      // 删除
      if (stat.isDirectory()) {
        await fsp.rm(targetPath, { recursive: true, force: true })
      } else {
        await fsp.unlink(targetPath)
      }

      return { success: true }
    } catch (err) {
      console.error('[AgentFileManager] deleteFile error:', err.message)
      return { error: 'Failed to delete: ' + err.message }
    }
  }
}

module.exports = AgentFileManager

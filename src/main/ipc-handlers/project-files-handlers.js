const path = require('path')
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
  MAX_VIDEO_SIZE,
  MIME_MAP,
  VIDEO_MIME_MAP
} = require('../utils/agent-constants')

/**
 * Ensures path is within root directory to prevent directory traversal
 */
function _safePath(rootPath, relativePath) {
  const resolvedRoot = path.resolve(rootPath)
  const target = path.resolve(rootPath, relativePath)
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Path traversal detected')
  }
  return target
}

function setupProjectFilesHandlers(ipcMain) {
  // listDir
  ipcMain.handle('project:listDir', async (event, { rootPath, relativePath = '', showHidden = false }) => {
    if (!rootPath) return { entries: [], cwd: null }

    try {
      const targetDir = _safePath(rootPath, relativePath)

      let stat
      try { stat = await fsp.stat(targetDir) } catch { return { entries: [], cwd: rootPath } }
      if (!stat.isDirectory()) return { entries: [], cwd: rootPath }

      const dirents = await fsp.readdir(targetDir, { withFileTypes: true })
      const entries = []

      for (const dirent of dirents) {
        if (!showHidden) {
          if (dirent.name.startsWith('.')) continue
          if (dirent.isDirectory() && (
            HIDDEN_DIRS.has(dirent.name) ||
            HIDDEN_DIR_SUFFIXES.some(s => dirent.name.endsWith(s))
          )) continue
          if (!dirent.isDirectory() && HIDDEN_FILES.has(dirent.name)) continue
        }

        const entryRelPath = relativePath ? path.posix.join(relativePath, dirent.name) : dirent.name
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

      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return { entries, cwd: rootPath }
    } catch (err) {
      console.error('[ProjectFiles] listDir error:', err.message)
      return { entries: [], cwd: rootPath, error: 'Failed to load directory' }
    }
  })

  // readFile
  ipcMain.handle('project:readFile', async (event, { rootPath, relativePath }) => {
    if (!rootPath) return { error: 'No working directory' }

    try {
      const filePath = _safePath(rootPath, relativePath)

      let stat
      try { stat = await fsp.stat(filePath) } catch { return { error: 'File not found' } }
      if (stat.isDirectory()) return { error: 'Is a directory' }

      const ext = path.extname(filePath).toLowerCase()
      const name = path.basename(filePath)
      const base = { name, size: stat.size, mtime: stat.mtime.toISOString(), ext }

      if (ext === '.svg') {
        if (stat.size > MAX_IMG_SIZE) {
          return { ...base, type: 'image', tooLarge: true, filePath }
        }
        const content = await fsp.readFile(filePath, 'utf-8')
        return { ...base, type: 'image', content: `data:image/svg+xml;base64,${Buffer.from(content).toString('base64')}`, filePath }
      }

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
        if (stat.size > MAX_TEXT_SIZE) {
          return { ...base, type: 'text', tooLarge: true, language: LANG_MAP[ext] || 'text', filePath }
        }
        try {
          const content = await fsp.readFile(filePath, 'utf-8')
          return { ...base, type: 'text', content, language: LANG_MAP[ext] || 'text', filePath }
        } catch {
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

      if (VIDEO_EXTS.has(ext)) {
        if (stat.size > MAX_VIDEO_SIZE) {
          return { ...base, type: 'video', tooLarge: true, filePath }
        }
        const buf = await fsp.readFile(filePath)
        const content = `data:${VIDEO_MIME_MAP[ext] || 'video/mp4'};base64,${buf.toString('base64')}`
        return { ...base, type: 'video', content, filePath }
      }

      return { ...base, type: 'binary' }
    } catch (err) {
      console.error('[ProjectFiles] readFile error:', err.message)
      return { error: 'Failed to read file' }
    }
  })

  // saveFile
  ipcMain.handle('project:saveFile', async (event, { rootPath, relativePath, content }) => {
    if (!rootPath) return { error: 'No working directory' }

    try {
      const filePath = _safePath(rootPath, relativePath)
      try { await fsp.access(filePath) } catch { return { error: 'File not found' } }
      await fsp.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      console.error('[ProjectFiles] saveFile error:', err.message)
      return { error: 'Failed to save file' }
    }
  })

  // createFile
  ipcMain.handle('project:createFile', async (event, { rootPath, parentPath, name, isDirectory }) => {
    if (!rootPath) return { error: 'No working directory' }

    try {
      const parentDir = _safePath(rootPath, parentPath)
      const targetPath = path.join(parentDir, name)

      if (isDirectory) {
        await fsp.mkdir(targetPath, { recursive: false })
      } else {
        await fsp.writeFile(targetPath, '', { encoding: 'utf-8', flag: 'wx' })
      }
      return { success: true }
    } catch (err) {
      console.error('[ProjectFiles] createFile error:', err.message)
      if (err.code === 'EEXIST') {
        return { error: 'File or folder already exists' }
      }
      return { error: 'Failed to create: ' + err.message }
    }
  })

  // renameFile
  ipcMain.handle('project:renameFile', async (event, { rootPath, oldPath, newName }) => {
    if (!rootPath) return { error: 'No working directory' }

    try {
      const oldFullPath = _safePath(rootPath, oldPath)
      const dir = path.dirname(oldFullPath)
      const newFullPath = path.join(dir, newName)

      try { await fsp.access(oldFullPath) } catch { return { error: 'File or folder not found' } }
      try {
        await fsp.access(newFullPath)
        return { error: 'Target name already exists' }
      } catch {}

      await fsp.rename(oldFullPath, newFullPath)
      return { success: true }
    } catch (err) {
      console.error('[ProjectFiles] renameFile error:', err.message)
      return { error: 'Failed to rename: ' + err.message }
    }
  })

  // deleteFile
  ipcMain.handle('project:deleteFile', async (event, { rootPath, path: relPath }) => {
    if (!rootPath) return { error: 'No working directory' }

    try {
      const targetPath = _safePath(rootPath, relPath)
      let stat
      try { stat = await fsp.stat(targetPath) } catch { return { error: 'File or folder not found' } }

      if (stat.isDirectory()) {
        await fsp.rm(targetPath, { recursive: true, force: true })
      } else {
        await fsp.unlink(targetPath)
      }
      return { success: true }
    } catch (err) {
      console.error('[ProjectFiles] deleteFile error:', err.message)
      return { error: 'Failed to delete: ' + err.message }
    }
  })

  // searchFiles
  ipcMain.handle('project:searchFiles', async (event, { rootPath, keyword, showHidden = false }) => {
    if (!rootPath) return { results: [] }
    if (!keyword || !keyword.trim()) return { results: [] }

    const lowerKeyword = keyword.trim().toLowerCase()
    const results = []
    const MAX_RESULTS = 100
    const MAX_DEPTH = 10

    const walk = async (dir, relativePath, depth) => {
      if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return

      let dirents
      try { dirents = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }

      for (const dirent of dirents) {
        if (results.length >= MAX_RESULTS) return

        if (!showHidden) {
          if (dirent.name.startsWith('.')) continue
          if (dirent.isDirectory() && (
            HIDDEN_DIRS.has(dirent.name) ||
            HIDDEN_DIR_SUFFIXES.some(s => dirent.name.endsWith(s))
          )) continue
          if (!dirent.isDirectory() && HIDDEN_FILES.has(dirent.name)) continue
        }

        const entryRelPath = relativePath ? path.posix.join(relativePath, dirent.name) : dirent.name

        if (dirent.name.toLowerCase().includes(lowerKeyword)) {
          let size = 0
          try {
            const s = await fsp.stat(path.join(dir, dirent.name))
            size = s.size
          } catch {}
          results.push({
            name: dirent.name,
            relativePath: entryRelPath,
            isDirectory: dirent.isDirectory(),
            size
          })
        }

        if (dirent.isDirectory()) {
          await walk(path.join(dir, dirent.name), entryRelPath, depth + 1)
        }
      }
    }

    try {
      await walk(rootPath, '', 0)
    } catch (err) {
      console.error('[ProjectFiles] searchFiles error:', err.message)
    }

    results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return { results }
  })
}

module.exports = { setupProjectFilesHandlers }

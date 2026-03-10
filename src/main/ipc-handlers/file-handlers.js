/**
 * File Operations IPC Handlers
 * 通用文件操作
 */

const fs = require('fs')
const { shell } = require('electron')
const { atomicWriteJson } = require('../utils/path-utils')

function setupFileHandlers(ipcMain) {
  // 在系统默认编辑器中打开文件
  ipcMain.handle('file:openInEditor', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      const result = await shell.openPath(filePath)
      if (result) {
        return { success: false, error: result }
      }
      return { success: true }
    } catch (err) {
      console.error('[IPC] file:openInEditor error:', err)
      return { success: false, error: err.message }
    }
  })

  // 读取 JSON 文件内容
  ipcMain.handle('file:readJson', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      return { success: true, data }
    } catch (err) {
      console.error('[IPC] file:readJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // 写入 JSON 文件内容
  ipcMain.handle('file:writeJson', async (event, filePath, data) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      atomicWriteJson(filePath, data)
      return { success: true }
    } catch (err) {
      console.error('[IPC] file:writeJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // 读取文件内容（文本）
  ipcMain.handle('file:read', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content }
    } catch (err) {
      console.error('[IPC] file:read error:', err)
      return { success: false, error: err.message }
    }
  })

  // 写入文件内容（文本）
  ipcMain.handle('file:write', async (event, filePath, content) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      console.error('[IPC] file:write error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] File handlers registered')
}

module.exports = { setupFileHandlers }
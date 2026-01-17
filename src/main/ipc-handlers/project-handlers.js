/**
 * 工程管理 IPC 处理器
 * 包含工程的增删改查、置顶、隐藏等功能
 */

const { dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { createIPCHandler } = require('../utils/ipc-utils')

/**
 * 设置工程管理的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {Object} sessionDatabase - SessionDatabase instance
 * @param {BrowserWindow} mainWindow - Main window instance
 */
function setupProjectHandlers(ipcMain, sessionDatabase, mainWindow) {
  console.log('[IPC] Setting up project handlers...')

  // ========================================
  // 工程列表
  // ========================================

  // 获取所有工程（不含隐藏）
  createIPCHandler(ipcMain, 'project:getAll', (includeHidden = false) => {
    const projects = sessionDatabase.getAllProjects(includeHidden)
    // 检查每个项目的路径是否有效
    return projects.map(project => ({
      ...project,
      pathValid: fs.existsSync(project.path)
    }))
  })

  // 获取隐藏的工程
  createIPCHandler(ipcMain, 'project:getHidden', () => {
    return sessionDatabase.getHiddenProjects()
  })

  // 获取单个工程
  createIPCHandler(ipcMain, 'project:getById', (projectId) => {
    return sessionDatabase.getProjectById(projectId)
  })

  // ========================================
  // 工程创建
  // ========================================

  // 新建工程（选择目录）
  createIPCHandler(ipcMain, 'project:create', async (projectData) => {
    // If path not provided, open directory picker
    if (!projectData.path) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择工程目录',
        properties: ['openDirectory', 'createDirectory']
      })

      if (result.canceled || !result.filePaths[0]) {
        return { canceled: true }
      }

      projectData.path = result.filePaths[0]
    }

    // Check if path exists
    if (!fs.existsSync(projectData.path)) {
      throw new Error('目录不存在')
    }

    // Check if project already exists
    const existing = sessionDatabase.getProjectByPath(projectData.path)
    if (existing) {
      // If hidden, unhide it
      if (existing.is_hidden) {
        sessionDatabase.unhideProject(existing.id)
        return { ...existing, is_hidden: 0, restored: true }
      }
      throw new Error('工程已存在')
    }

    // Default name to directory name if not provided
    if (!projectData.name) {
      projectData.name = path.basename(projectData.path)
    }

    return sessionDatabase.createProject(projectData)
  })

  // 打开工程（选择已有目录）
  createIPCHandler(ipcMain, 'project:open', async () => {
    // macOS 上 mainWindow 可能导致问题，使用条件传参
    const dialogOptions = {
      title: '打开工程目录',
      properties: ['openDirectory']
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    const projectPath = result.filePaths[0]

    // Check if project already exists
    const existing = sessionDatabase.getProjectByPath(projectPath)
    if (existing) {
      // If hidden, unhide it
      if (existing.is_hidden) {
        sessionDatabase.unhideProject(existing.id)
      }
      // 如果是同步导入的项目，用户主动打开后升级为用户项目
      if (existing.source === 'sync') {
        sessionDatabase.updateProject(existing.id, { source: 'user' })
        existing.source = 'user'
      }
      // Update last_opened_at and return
      sessionDatabase.touchProject(existing.id)
      return { ...existing, is_hidden: 0, alreadyExists: true, restored: existing.is_hidden === 1 }
    }

    // Create new project
    return sessionDatabase.createProject({
      path: projectPath,
      name: path.basename(projectPath)
    })
  })

  // ========================================
  // 工程修改
  // ========================================

  // 更新工程
  createIPCHandler(ipcMain, 'project:update', ({ projectId, updates }) => {
    return sessionDatabase.updateProject(projectId, updates)
  })

  // 复制工程配置
  createIPCHandler(ipcMain, 'project:duplicate', async ({ projectId }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择新工程目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    const newPath = result.filePaths[0]
    const newName = path.basename(newPath)

    return sessionDatabase.duplicateProject(projectId, newPath, newName)
  })

  // ========================================
  // 工程删除/隐藏
  // ========================================

  // 从面板移除（隐藏）
  createIPCHandler(ipcMain, 'project:hide', (projectId) => {
    return sessionDatabase.hideProject(projectId)
  })

  // 恢复隐藏的工程
  createIPCHandler(ipcMain, 'project:unhide', (projectId) => {
    return sessionDatabase.unhideProject(projectId)
  })

  // 删除工程
  createIPCHandler(ipcMain, 'project:delete', ({ projectId, deleteSessions = false }) => {
    return sessionDatabase.deleteProject(projectId, deleteSessions)
  })

  // ========================================
  // 工程状态
  // ========================================

  // 切换置顶
  createIPCHandler(ipcMain, 'project:togglePinned', (projectId) => {
    return sessionDatabase.toggleProjectPinned(projectId)
  })

  // 更新最后打开时间
  createIPCHandler(ipcMain, 'project:touch', (projectId) => {
    sessionDatabase.touchProject(projectId)
    return { success: true }
  })

  // 打开文件夹
  createIPCHandler(ipcMain, 'project:openFolder', async (folderPath) => {
    if (!fs.existsSync(folderPath)) {
      throw new Error('目录不存在')
    }
    await shell.openPath(folderPath)
    return { success: true }
  })

  // 检查路径是否存在
  createIPCHandler(ipcMain, 'project:checkPath', (folderPath) => {
    return { valid: fs.existsSync(folderPath) }
  })

  // ========================================
  // 会话相关（占位）
  // ========================================

  // 新建会话（占位）
  createIPCHandler(ipcMain, 'project:newSession', (projectId) => {
    console.log('[IPC] project:newSession - placeholder')
    return { placeholder: true, message: '会话功能待实现' }
  })

  // 打开历史会话（占位）
  createIPCHandler(ipcMain, 'project:openSession', ({ projectId, sessionId }) => {
    console.log('[IPC] project:openSession - placeholder')
    return { placeholder: true, message: '会话功能待实现' }
  })

  console.log('[IPC] Project handlers ready')
}

module.exports = { setupProjectHandlers }

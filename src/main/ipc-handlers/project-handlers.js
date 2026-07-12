/**
 * 项目目录身份 IPC 处理器
 * 保留 Agent/能力管理需要的目录身份、打开目录和路径检查能力。
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
  // ========================================
  // 工程列表
  // ========================================

  // 获取所有工程（不含隐藏）
  createIPCHandler(ipcMain, 'project:getAll', (includeHidden = false) => {
    const projects = sessionDatabase.getAllProjects(includeHidden)
    return projects.map(project => ({
      ...project,
      pathValid: fs.existsSync(project.path)
    }))
  })

  // 获取能力管理可选目录上下文
  createIPCHandler(ipcMain, 'project:getCapabilityContexts', () => {
    const projects = sessionDatabase.getCapabilityContextProjects()
    return projects.map(project => ({
      ...project,
      pathValid: fs.existsSync(project.path)
    }))
  })

  // 确保手动选择的能力管理目录有 workspace project 身份
  createIPCHandler(ipcMain, 'project:ensureWorkspace', (projectData = {}) => {
    const projectPath = projectData.path
    if (!projectPath) {
      throw new Error('目录不能为空')
    }

    if (!fs.existsSync(projectPath)) {
      throw new Error('目录不存在')
    }

    const existing = sessionDatabase.getProjectByPath(projectPath)
    if (existing) {
      if (existing.project_kind === 'workspace') {
        if (existing.is_hidden) {
          sessionDatabase.unhideProject(existing.id)
        }
        sessionDatabase.touchProject(existing.id)
        const project = sessionDatabase.getProjectById(existing.id) || existing
        return { ...project, pathValid: true, alreadyExists: true }
      }

      return { ...existing, pathValid: true, alreadyExists: true }
    }

    const project = sessionDatabase.getOrCreateProject(projectPath, {
      name: projectData.name || path.basename(projectPath),
      projectKind: 'workspace'
    })
    return { ...project, pathValid: true, alreadyExists: false }
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
      // 如果已隐藏，恢复显示
      if (existing.is_hidden) {
        sessionDatabase.unhideProject(existing.id)
      }
      // Update last_opened_at and return
      sessionDatabase.touchProject(existing.id)
      return { ...existing, is_hidden: 0, alreadyExists: true, restored: existing.is_hidden === 1 }
    }

    // Create new project
    const project = sessionDatabase.createProject({
      path: projectPath,
      name: path.basename(projectPath)
    })
    return { ...project }
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
}

module.exports = { setupProjectHandlers }

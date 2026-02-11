/**
 * 活动会话 IPC 处理器
 * 管理运行中的终端会话
 */

const { createIPCHandler, createIPCListener } = require('../utils/ipc-utils')
const path = require('path')

/**
 * 设置活动会话的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {ActiveSessionManager} activeSessionManager - ActiveSessionManager instance
 */
function setupActiveSessionHandlers(ipcMain, activeSessionManager) {
  // 获取 configManager 实例（通过 activeSessionManager）
  const configManager = activeSessionManager.configManager

  // ========================================
  // 会话生命周期
  // ========================================

  // 创建并启动新会话
  createIPCHandler(ipcMain, 'activeSession:create', (options) => {
    // options: { projectId, projectPath, projectName, title, apiProfileId, resumeSessionId, type }
    // type: 'session' (默认) 或 'terminal' (纯终端)

    // 检查路径是否包含 _ 或 -，这会导致 Claude CLI 会话同步问题
    if (options.projectPath) {
      const folderName = path.basename(options.projectPath)
      if (folderName.includes('_') || folderName.includes('-')) {
        return {
          success: false,
          error: `项目文件夹名称 "${folderName}" 包含下划线(_)或连字符(-)，会导致会话同步问题。请重命名文件夹后再打开。`
        }
      }
    }

    // 跨模式占用检查：恢复会话时检查是否被 Agent 模式占用
    if (options.resumeSessionId && activeSessionManager.peerManager?.isCliSessionActive(options.resumeSessionId)) {
      return {
        success: false,
        error: 'SESSION_IN_USE_BY_AGENT'
      }
    }

    // 纯终端不受会话数量限制；Claude 会话需要检查限制
    if (options.type !== 'terminal') {
      const runningCount = activeSessionManager.getRunningCount()
      const maxSessions = configManager.getMaxActiveSessions()
      if (runningCount >= maxSessions) {
        return {
          success: false,
          error: 'maxSessionsReached',
          maxSessions,
          runningCount
        }
      }
    }

    const session = activeSessionManager.create(options)
    const result = activeSessionManager.start(session.id)
    return result
  })

  // 关闭会话（安全退出：先发送两次 Ctrl+C，再终止进程）
  createIPCHandler(ipcMain, 'activeSession:close', async (sessionId) => {
    await activeSessionManager.close(sessionId, true)  // graceful=true
    return { success: true }
  })

  // 断开连接（保持后台运行）
  createIPCHandler(ipcMain, 'activeSession:disconnect', (sessionId) => {
    activeSessionManager.setVisible(sessionId, false)
    return { success: true }
  })

  // 获取会话列表
  createIPCHandler(ipcMain, 'activeSession:list', (includeHidden = true) => {
    return activeSessionManager.list(includeHidden)
  })

  // 获取单个会话
  createIPCHandler(ipcMain, 'activeSession:get', (sessionId) => {
    const session = activeSessionManager.get(sessionId)
    return session ? session.toJSON() : null
  })

  // 获取指定项目的活动会话
  createIPCHandler(ipcMain, 'activeSession:getByProject', (projectId) => {
    return activeSessionManager.getByProject(projectId)
  })

  // ========================================
  // 终端交互
  // ========================================

  // 写入数据到会话
  ipcMain.on('activeSession:write', (event, { sessionId, data }) => {
    activeSessionManager.write(sessionId, data)
  })

  // 调整终端大小
  ipcMain.on('activeSession:resize', (event, { sessionId, cols, rows }) => {
    activeSessionManager.resize(sessionId, cols, rows)
  })

  // ========================================
  // 会话状态
  // ========================================

  // 设置聚焦会话
  createIPCHandler(ipcMain, 'activeSession:focus', (sessionId) => {
    activeSessionManager.focus(sessionId)
    return { success: true }
  })

  // 获取聚焦会话 ID
  createIPCHandler(ipcMain, 'activeSession:getFocused', () => {
    return activeSessionManager.getFocusedSessionId()
  })

  // 设置会话可见性（Tab 显示/后台运行）
  createIPCHandler(ipcMain, 'activeSession:setVisible', ({ sessionId, visible }) => {
    activeSessionManager.setVisible(sessionId, visible)
    return { success: true }
  })

  // 获取运行中的会话数量
  createIPCHandler(ipcMain, 'activeSession:getRunningCount', () => {
    return activeSessionManager.getRunningCount()
  })

  // 获取会话限制信息（合并调用，减少 IPC 开销）
  createIPCHandler(ipcMain, 'activeSession:getSessionLimits', () => {
    return {
      runningCount: activeSessionManager.getRunningCount(),
      maxSessions: configManager.getMaxActiveSessions()
    }
  })

  // 重命名会话
  createIPCHandler(ipcMain, 'activeSession:rename', ({ sessionId, newTitle }) => {
    return activeSessionManager.renameSession(sessionId, newTitle)
  })
}

module.exports = { setupActiveSessionHandlers }

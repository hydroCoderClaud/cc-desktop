/**
 * 活动会话 IPC 处理器
 * 管理运行中的终端会话
 */

/**
 * Create IPC handler with unified logging and error handling
 */
function createIPCHandler(ipcMain, channelName, handler) {
  ipcMain.handle(channelName, async (event, ...args) => {
    console.log(`[IPC] ${channelName} called with:`, ...args)
    try {
      const result = await handler(...args)
      console.log(`[IPC] ${channelName} success`)
      return result
    } catch (error) {
      console.error(`[IPC] ${channelName} error:`, error)
      throw error
    }
  })
}

/**
 * 设置活动会话的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {ActiveSessionManager} activeSessionManager - ActiveSessionManager instance
 */
function setupActiveSessionHandlers(ipcMain, activeSessionManager) {
  console.log('[IPC] Setting up active session handlers...')

  // ========================================
  // 会话生命周期
  // ========================================

  // 创建并启动新会话
  createIPCHandler(ipcMain, 'activeSession:create', (options) => {
    // options: { projectId, projectPath, projectName }
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

  console.log('[IPC] Active session handlers ready')
}

module.exports = { setupActiveSessionHandlers }

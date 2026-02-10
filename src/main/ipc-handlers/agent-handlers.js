/**
 * Agent IPC 处理器
 * 处理 Agent 模式下的所有 IPC 通信
 *
 * 参照 active-session-handlers.js 的模式
 */

const { shell } = require('electron')
const fs = require('fs')

function setupAgentHandlers(ipcMain, agentSessionManager) {
  if (!agentSessionManager) {
    console.warn('[IPC] AgentSessionManager not available, skipping agent handlers')
    return
  }

  // ========================================
  // Agent 会话生命周期
  // ========================================

  // 创建新会话
  ipcMain.handle('agent:create', async (event, options) => {
    try {
      return agentSessionManager.create(options)
    } catch (err) {
      console.error('[IPC] agent:create error:', err)
      return { error: err.message }
    }
  })

  // 发送消息（异步，流式推送结果）
  ipcMain.handle('agent:sendMessage', async (event, { sessionId, message, modelTier, maxTurns }) => {
    try {
      // 不等待完成，让流式消息通过 IPC 事件推送
      agentSessionManager.sendMessage(sessionId, message, { modelTier, maxTurns }).catch(err => {
        console.error('[IPC] agent:sendMessage async error:', err)
        // 推送错误到前端，使用 _safeSend 防止窗口已销毁时报错
        agentSessionManager._safeSend('agent:error', {
          sessionId,
          error: err.message || 'Unknown error'
        })
        agentSessionManager._safeSend('agent:statusChange', {
          sessionId,
          status: 'idle'
        })
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC] agent:sendMessage error:', err)
      return { error: err.message }
    }
  })

  // 取消生成（使用 interrupt，不杀 CLI 进程）
  ipcMain.handle('agent:cancel', async (event, sessionId) => {
    try {
      await agentSessionManager.cancel(sessionId)
      return { success: true }
    } catch (err) {
      console.error('[IPC] agent:cancel error:', err)
      return { error: err.message }
    }
  })

  // 恢复会话（从 DB 重新加载到内存）
  ipcMain.handle('agent:reopen', async (event, sessionId) => {
    try {
      return agentSessionManager.reopen(sessionId)
    } catch (err) {
      console.error('[IPC] agent:reopen error:', err)
      return { error: err.message }
    }
  })

  // 关闭会话
  ipcMain.handle('agent:close', async (event, sessionId) => {
    try {
      agentSessionManager.close(sessionId)
      return { success: true }
    } catch (err) {
      console.error('[IPC] agent:close error:', err)
      return { error: err.message }
    }
  })

  // 获取单个会话
  ipcMain.handle('agent:get', async (event, sessionId) => {
    return agentSessionManager.get(sessionId)
  })

  // 获取所有会话列表
  ipcMain.handle('agent:list', async () => {
    return agentSessionManager.list()
  })

  // 重命名会话
  ipcMain.handle('agent:rename', async (event, { sessionId, title }) => {
    try {
      return agentSessionManager.rename(sessionId, title)
    } catch (err) {
      console.error('[IPC] agent:rename error:', err)
      return { error: err.message }
    }
  })

  // 获取消息历史
  ipcMain.handle('agent:getMessages', async (event, sessionId) => {
    return agentSessionManager.getMessages(sessionId)
  })

  // 压缩会话上下文
  ipcMain.handle('agent:compact', async (event, sessionId) => {
    try {
      agentSessionManager.compactConversation(sessionId).catch(err => {
        console.error('[IPC] agent:compact async error:', err)
        agentSessionManager._safeSend('agent:error', {
          sessionId,
          error: err.message || 'Compact failed'
        })
        agentSessionManager._safeSend('agent:statusChange', {
          sessionId,
          status: 'idle'
        })
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC] agent:compact error:', err)
      return { error: err.message }
    }
  })

  // 物理删除对话
  ipcMain.handle('agent:deleteConversation', async (event, sessionId) => {
    try {
      return agentSessionManager.deleteConversation(sessionId)
    } catch (err) {
      console.error('[IPC] agent:deleteConversation error:', err)
      return { error: err.message }
    }
  })

  // ========================================
  // Streaming Input 控制方法
  // ========================================

  // 切换模型（实时生效）
  ipcMain.handle('agent:setModel', async (event, { sessionId, model }) => {
    try {
      await agentSessionManager.setModel(sessionId, model)
      return { success: true }
    } catch (err) {
      console.error('[IPC] agent:setModel error:', err)
      return { error: err.message }
    }
  })

  // 获取支持的模型列表
  ipcMain.handle('agent:getSupportedModels', async (event, sessionId) => {
    try {
      return await agentSessionManager.getSupportedModels(sessionId)
    } catch (err) {
      console.error('[IPC] agent:getSupportedModels error:', err)
      return { error: err.message }
    }
  })

  // 获取支持的 slash 命令列表
  ipcMain.handle('agent:getSupportedCommands', async (event, sessionId) => {
    try {
      return await agentSessionManager.getSupportedCommands(sessionId)
    } catch (err) {
      console.error('[IPC] agent:getSupportedCommands error:', err)
      return { error: err.message }
    }
  })

  // 获取账户信息
  ipcMain.handle('agent:getAccountInfo', async (event, sessionId) => {
    try {
      return await agentSessionManager.getAccountInfo(sessionId)
    } catch (err) {
      console.error('[IPC] agent:getAccountInfo error:', err)
      return { error: err.message }
    }
  })

  // 获取 MCP 服务器状态
  ipcMain.handle('agent:getMcpServerStatus', async (event, sessionId) => {
    try {
      return await agentSessionManager.getMcpServerStatus(sessionId)
    } catch (err) {
      console.error('[IPC] agent:getMcpServerStatus error:', err)
      return { error: err.message }
    }
  })

  // 获取完整初始化结果
  ipcMain.handle('agent:getInitResult', async (event, sessionId) => {
    try {
      return await agentSessionManager.getInitResult(sessionId)
    } catch (err) {
      console.error('[IPC] agent:getInitResult error:', err)
      return { error: err.message }
    }
  })

  // ========================================
  // 成果目录
  // ========================================

  // 获取输出目录路径
  ipcMain.handle('agent:getOutputDir', async (event, sessionId) => {
    return agentSessionManager.getOutputDir(sessionId)
  })

  // 打开输出目录
  ipcMain.handle('agent:openOutputDir', async (event, sessionId) => {
    const dir = agentSessionManager.getOutputDir(sessionId)
    if (dir) {
      await shell.openPath(dir)
      return { success: true }
    }
    return { success: false, error: 'No output directory' }
  })

  // 列出输出文件
  ipcMain.handle('agent:listOutputFiles', async (event, sessionId) => {
    return agentSessionManager.listOutputFiles(sessionId)
  })

  // ========================================
  // 文件浏览（AgentRightPanel 使用）
  // ========================================

  // 列出目录内容（支持子目录）
  ipcMain.handle('agent:listDir', async (event, { sessionId, relativePath, showHidden }) => {
    try {
      return agentSessionManager.listDir(sessionId, relativePath || '', !!showHidden)
    } catch (err) {
      console.error('[IPC] agent:listDir error:', err)
      return { entries: [], error: err.message }
    }
  })

  // 读取文件内容（用于预览）
  ipcMain.handle('agent:readFile', async (event, { sessionId, relativePath }) => {
    try {
      return agentSessionManager.readFile(sessionId, relativePath)
    } catch (err) {
      console.error('[IPC] agent:readFile error:', err)
      return { error: err.message }
    }
  })

  // 用系统默认应用打开文件
  ipcMain.handle('agent:openFile', async (event, { sessionId, relativePath }) => {
    try {
      const fullPath = agentSessionManager.resolveFilePath(sessionId, relativePath)
      if (!fullPath) return { success: false, error: 'Cannot resolve path' }
      if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' }
      const result = await shell.openPath(fullPath)
      // shell.openPath 返回空字符串表示成功，否则返回错误信息
      return result ? { success: false, error: result } : { success: true }
    } catch (err) {
      console.error('[IPC] agent:openFile error:', err)
      return { success: false, error: 'Failed to open file' }
    }
  })

  console.log('[IPC] Agent handlers registered')
}

module.exports = { setupAgentHandlers }

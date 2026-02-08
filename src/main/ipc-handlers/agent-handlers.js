/**
 * Agent IPC 处理器
 * 处理 Agent 模式下的所有 IPC 通信
 *
 * 参照 active-session-handlers.js 的模式
 */

const { shell } = require('electron')

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
        // 推送错误到前端，避免静默失败
        event.sender.send('agent:error', {
          sessionId,
          error: err.message || 'Unknown error'
        })
        event.sender.send('agent:statusChange', {
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

  // 取消生成
  ipcMain.handle('agent:cancel', async (event, sessionId) => {
    try {
      agentSessionManager.cancel(sessionId)
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
        event.sender.send('agent:error', {
          sessionId,
          error: err.message || 'Compact failed'
        })
        event.sender.send('agent:statusChange', {
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

  console.log('[IPC] Agent handlers registered')
}

module.exports = { setupAgentHandlers }

/**
 * Agent IPC 处理器
 * 处理 Agent 模式下的所有 IPC 通信
 *
 * 参照 active-session-handlers.js 的模式
 */

const { shell } = require('electron')
const fs = require('fs')
const path = require('path')

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
      await agentSessionManager.close(sessionId)
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

  // 保存文件
  ipcMain.handle('agent:saveFile', async (event, { sessionId, relativePath, content }) => {
    try {
      return agentSessionManager.saveFile(sessionId, relativePath, content)
    } catch (err) {
      console.error('[IPC] agent:saveFile error:', err)
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

  // 读取任意绝对路径的文件（用于聊天消息中的文件链接预览）
  ipcMain.handle('agent:readAbsolutePath', async (event, { filePath, sessionId, confirmed = false }) => {
    try {
      // 相对路径 / ~ 路径：基于会话 cwd 解析为绝对路径
      if (!path.isAbsolute(filePath)) {
        if (filePath.startsWith('~/') || filePath === '~') {
          filePath = path.join(require('os').homedir(), filePath.slice(2))
        } else if (sessionId) {
          const cwd = agentSessionManager.fileManager._resolveCwd(sessionId)
          if (cwd) {
            filePath = path.resolve(cwd, filePath)
          } else {
            return { error: 'Cannot resolve relative path: no working directory' }
          }
        } else {
          return { error: 'Cannot resolve relative path: no session context' }
        }
      }

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return { error: 'File not found' }
      }

      // 安全检查：检查是否在 cwd 内（方案 C：用户确认）
      if (sessionId && !confirmed) {
        const cwd = agentSessionManager.fileManager._resolveCwd(sessionId)
        if (cwd) {
          // 规范化路径（解析符号链接，防止绕过）
          const realFilePath = fs.realpathSync(filePath)
          const realCwd = fs.realpathSync(cwd)

          // 检查文件是否在 cwd 内
          const relativePath = path.relative(realCwd, realFilePath)
          const isOutsideCwd = relativePath.startsWith('..') || path.isAbsolute(relativePath)

          if (isOutsideCwd) {
            // 文件在 cwd 外，需要用户确认
            return {
              requiresConfirmation: true,
              filePath: realFilePath,
              cwd: realCwd,
              message: `文件位于工作目录之外。是否允许访问？\n\n文件: ${realFilePath}\n工作目录: ${realCwd}`
            }
          }
        }
      }

      const stats = fs.statSync(filePath)
      const name = path.basename(filePath)

      // 如果是目录，返回目录信息
      if (stats.isDirectory()) {
        return {
          type: 'directory',
          name,
          path: filePath
        }
      }

      // 文件大小限制（10MB）
      if (stats.size > 10 * 1024 * 1024) {
        return { error: 'File too large (max 10MB)' }
      }

      const ext = path.extname(filePath).toLowerCase()

      // 视频文件（与图片相同，返回 base64 data URL，避免 file:// CSP 问题）
      if (['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogg'].includes(ext)) {
        const buffer = fs.readFileSync(filePath)
        const base64 = buffer.toString('base64')
        const videoMimes = {
          '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
          '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.ogg': 'video/ogg'
        }
        return {
          type: 'video',
          name,
          content: `data:${videoMimes[ext] || 'video/mp4'};base64,${base64}`,
          size: stats.size,
          ext
        }
      }

      // 图片文件
      if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) {
        const buffer = fs.readFileSync(filePath)
        const base64 = buffer.toString('base64')
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        }
        return {
          type: 'image',
          name,
          content: `data:${mimeTypes[ext] || 'image/png'};base64,${base64}`,
          size: stats.size,
          ext
        }
      }

      // 文本文件
      const content = fs.readFileSync(filePath, 'utf-8')
      return {
        type: 'text',
        name,
        content,
        size: stats.size,
        ext
      }
    } catch (err) {
      console.error('[IPC] agent:readAbsolutePath error:', err)
      return { error: err.message || 'Failed to read file' }
    }
  })

  // ========================================
  // 队列持久化
  // ========================================

  // 保存队列消息
  ipcMain.handle('agent:saveQueue', async (event, { sessionId, queue }) => {
    try {
      agentSessionManager.sessionDatabase.saveAgentQueue(sessionId, queue)
      return { success: true }
    } catch (err) {
      console.error('[IPC] agent:saveQueue error:', err)
      return { success: false, error: err.message }
    }
  })

  // 读取队列消息
  ipcMain.handle('agent:getQueue', async (event, sessionId) => {
    try {
      const queue = agentSessionManager.sessionDatabase.getAgentQueue(sessionId)
      return { success: true, queue }
    } catch (err) {
      console.error('[IPC] agent:getQueue error:', err)
      return { success: false, error: err.message, queue: [] }
    }
  })

  // ========================================
  // 文件操作
  // ========================================

  // 创建文件或文件夹
  ipcMain.handle('agent:createFile', async (event, { sessionId, parentPath, name, isDirectory }) => {
    try {
      return await agentSessionManager.createFile(sessionId, parentPath, name, isDirectory)
    } catch (err) {
      console.error('[IPC] agent:createFile error:', err)
      return { error: err.message }
    }
  })

  // 重命名文件或文件夹
  ipcMain.handle('agent:renameFile', async (event, { sessionId, oldPath, newName }) => {
    try {
      return await agentSessionManager.renameFile(sessionId, oldPath, newName)
    } catch (err) {
      console.error('[IPC] agent:renameFile error:', err)
      return { error: err.message }
    }
  })

  // 删除文件或文件夹
  ipcMain.handle('agent:deleteFile', async (event, { sessionId, path }) => {
    try {
      return await agentSessionManager.deleteFile(sessionId, path)
    } catch (err) {
      console.error('[IPC] agent:deleteFile error:', err)
      return { error: err.message }
    }
  })

  console.log('[IPC] Agent handlers registered')
}

module.exports = { setupAgentHandlers }

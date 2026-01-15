/**
 * 会话历史相关 IPC 处理器
 * 包含会话管理、标签管理、收藏管理等功能
 */

const { SessionDatabase } = require('../session-database');
const { SessionSyncService } = require('../session-sync-service');

/**
 * Create IPC handler with unified logging and error handling
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {string} channelName - IPC channel name
 * @param {Function} handler - Handler function
 */
function createIPCHandler(ipcMain, channelName, handler) {
  ipcMain.handle(channelName, async (event, ...args) => {
    console.log(`[IPC] ${channelName} called with:`, ...args);
    try {
      const result = await handler(...args);
      console.log(`[IPC] ${channelName} success`);
      return result;
    } catch (error) {
      console.error(`[IPC] ${channelName} error:`, error);
      throw error;
    }
  });
}

/**
 * 设置会话相关的 IPC 处理器
 * @param {Object} ipcMain - Electron ipcMain module
 * @param {SessionDatabase} sessionDatabase - Shared database instance
 * @returns {Object} - { sessionSyncService }
 */
function setupSessionHandlers(ipcMain, sessionDatabase) {
  console.log('[IPC] Setting up session handlers...');

  const sessionSyncService = new SessionSyncService(sessionDatabase);

  // ========================================
  // 会话历史管理（数据库版）
  // ========================================

  // 同步会话数据
  createIPCHandler(ipcMain, 'session:sync', async () => {
    return await sessionSyncService.sync();
  });

  // 获取同步状态
  createIPCHandler(ipcMain, 'session:getSyncStatus', () => {
    return {
      syncing: sessionSyncService.isSyncing(),
      lastSync: sessionSyncService.getLastSyncStats()
    };
  });

  // 清除无效会话（warmup 和 消息少于 2 条的会话）
  createIPCHandler(ipcMain, 'session:clearInvalid', async () => {
    return await sessionSyncService.clearInvalidSessions();
  });

  // 获取所有项目（从数据库）
  createIPCHandler(ipcMain, 'session:getProjects', () => {
    return sessionDatabase.getAllProjects();
  });

  // 获取项目的会话列表（从数据库）
  createIPCHandler(ipcMain, 'session:getProjectSessions', (projectId) => {
    const sessions = sessionDatabase.getProjectSessions(projectId);
    // 获取每个会话的第一条消息用于显示
    return sessions.map(session => {
      const firstMsg = sessionDatabase.getSessionFirstMessage(session.id);
      return {
        ...session,
        firstUserMessage: firstMsg?.content?.substring(0, 100) || null
      };
    });
  });

  // 获取会话的消息列表（从数据库）
  createIPCHandler(ipcMain, 'session:getMessages', ({ sessionId, limit, offset }) => {
    return sessionDatabase.getSessionMessages(sessionId, { limit, offset });
  });

  // 搜索会话（使用 FTS5）
  createIPCHandler(ipcMain, 'session:search', ({ query, projectId, sessionId, limit }) => {
    return sessionDatabase.searchMessages(query, { projectId, sessionId, limit });
  });

  // 导出会话
  createIPCHandler(ipcMain, 'session:export', ({ sessionId, format }) => {
    const session = sessionDatabase.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return null;

    const messages = sessionDatabase.getSessionMessages(sessionId, { limit: 10000 });
    const project = sessionDatabase.db.prepare('SELECT * FROM projects WHERE id = ?').get(session.project_id);

    if (format === 'json') {
      return JSON.stringify({ session, project, messages }, null, 2);
    }

    // Default: markdown
    let markdown = `# Session: ${session.session_uuid}\n\n`;
    markdown += `Project: ${project?.name || 'Unknown'}\n`;
    markdown += `Path: ${project?.path || 'Unknown'}\n\n---\n\n`;

    for (const msg of messages) {
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
      if (msg.role === 'user') {
        markdown += `## User (${time})\n\n${msg.content}\n\n`;
      } else {
        markdown += `## Assistant (${time})\n\n`;
        markdown += `${msg.content}\n\n`;
        if (msg.tokens_in || msg.tokens_out) {
          markdown += `*Tokens: ${msg.tokens_in || 0} in / ${msg.tokens_out || 0} out*\n\n`;
        }
      }
      markdown += '---\n\n';
    }

    return markdown;
  });

  // 获取数据库统计
  createIPCHandler(ipcMain, 'session:getStats', () => {
    return sessionDatabase.getStats();
  });

  // ========================================
  // 标签管理
  // ========================================

  // 创建标签
  createIPCHandler(ipcMain, 'tag:create', ({ name, color }) => {
    return sessionDatabase.createTag(name, color);
  });

  // 获取所有标签
  createIPCHandler(ipcMain, 'tag:getAll', () => {
    return sessionDatabase.getAllTags();
  });

  // 删除标签
  createIPCHandler(ipcMain, 'tag:delete', (tagId) => {
    sessionDatabase.deleteTag(tagId);
    return { success: true };
  });

  // 添加标签到会话
  createIPCHandler(ipcMain, 'tag:addToSession', ({ sessionId, tagId }) => {
    sessionDatabase.addTagToSession(sessionId, tagId);
    return { success: true };
  });

  // 从会话移除标签
  createIPCHandler(ipcMain, 'tag:removeFromSession', ({ sessionId, tagId }) => {
    sessionDatabase.removeTagFromSession(sessionId, tagId);
    return { success: true };
  });

  // 获取会话的标签
  createIPCHandler(ipcMain, 'tag:getSessionTags', (sessionId) => {
    return sessionDatabase.getSessionTags(sessionId);
  });

  // 获取标签下的会话
  createIPCHandler(ipcMain, 'tag:getSessions', (tagId) => {
    return sessionDatabase.getSessionsByTag(tagId);
  });

  // ========================================
  // 消息标签管理
  // ========================================

  // 添加标签到消息
  createIPCHandler(ipcMain, 'tag:addToMessage', ({ messageId, tagId }) => {
    sessionDatabase.addTagToMessage(messageId, tagId);
    return { success: true };
  });

  // 从消息移除标签
  createIPCHandler(ipcMain, 'tag:removeFromMessage', ({ messageId, tagId }) => {
    sessionDatabase.removeTagFromMessage(messageId, tagId);
    return { success: true };
  });

  // 获取消息的标签
  createIPCHandler(ipcMain, 'tag:getMessageTags', (messageId) => {
    return sessionDatabase.getMessageTags(messageId);
  });

  // 获取标签下的消息
  createIPCHandler(ipcMain, 'tag:getMessages', (tagId) => {
    return sessionDatabase.getMessagesByTag(tagId);
  });

  // 获取会话中所有带标签的消息
  createIPCHandler(ipcMain, 'tag:getSessionTaggedMessages', (sessionId) => {
    return sessionDatabase.getSessionTaggedMessages(sessionId);
  });

  // ========================================
  // 收藏管理
  // ========================================

  // 添加收藏
  createIPCHandler(ipcMain, 'favorite:add', ({ sessionId, note }) => {
    sessionDatabase.addFavorite(sessionId, note);
    return { success: true };
  });

  // 移除收藏
  createIPCHandler(ipcMain, 'favorite:remove', (sessionId) => {
    sessionDatabase.removeFavorite(sessionId);
    return { success: true };
  });

  // 检查是否收藏
  createIPCHandler(ipcMain, 'favorite:check', (sessionId) => {
    return sessionDatabase.isFavorite(sessionId);
  });

  // 获取所有收藏
  createIPCHandler(ipcMain, 'favorite:getAll', () => {
    return sessionDatabase.getAllFavorites();
  });

  // 更新收藏备注
  createIPCHandler(ipcMain, 'favorite:updateNote', ({ sessionId, note }) => {
    sessionDatabase.updateFavoriteNote(sessionId, note);
    return { success: true };
  });

  console.log('[IPC] Session handlers ready');

  return { sessionSyncService };
}

module.exports = { setupSessionHandlers };

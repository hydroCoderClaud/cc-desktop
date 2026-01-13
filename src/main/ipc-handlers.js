/**
 * IPC 处理器
 * 处理渲染进程和主进程之间的通信
 */

const { ipcMain, dialog, shell } = require('electron');

/**
 * Create IPC handler with unified logging and error handling
 * @param {string} channelName - IPC channel name
 * @param {Function} handler - Handler function
 */
function createIPCHandler(channelName, handler) {
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

function setupIPCHandlers(mainWindow, configManager, terminalManager) {
  console.log('[IPC] Setting up handlers...');

  // ========================================
  // 同步主题获取（用于 preload 避免闪白）
  // ========================================
  ipcMain.on('theme:getSync', (event) => {
    const config = configManager.getConfig();
    event.returnValue = config?.settings?.theme || 'light';
  });

  // ========================================
  // 同步语言获取（用于 preload）
  // ========================================
  ipcMain.on('locale:getSync', (event) => {
    const config = configManager.getConfig();
    event.returnValue = config?.settings?.locale || 'zh-CN';
  });

  // ========================================
  // 设置变更广播（跨窗口同步）
  // ========================================
  ipcMain.on('settings:broadcast', (event, settings) => {
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:changed', settings);
      }
    });
  });

  // ========================================
  // Config 相关
  // ========================================

  // 获取配置
  ipcMain.handle('config:get', async () => {
    return configManager.getConfig();
  });

  // 保存配置
  ipcMain.handle('config:save', async (event, config) => {
    return configManager.updateConfig(config);
  });

  // 更新设置
  ipcMain.handle('settings:update', async (event, settings) => {
    return configManager.updateSettings(settings);
  });

  // ========================================
  // API 配置相关
  // ========================================

  // 获取 API 配置
  ipcMain.handle('api:getConfig', async () => {
    return configManager.getAPIConfig();
  });

  // 更新 API 配置
  ipcMain.handle('api:updateConfig', async (event, apiConfig) => {
    return configManager.updateAPIConfig(apiConfig);
  });

  // 验证 API 配置
  ipcMain.handle('api:validate', async () => {
    return configManager.validateAPIConfig();
  });

  // 获取配置文件路径
  ipcMain.handle('config:getPath', async () => {
    return configManager.getConfigPath();
  });

  // ========================================
  // API Profile 管理
  // ========================================

  // 获取所有 Profiles
  ipcMain.handle('api:listProfiles', async () => {
    return configManager.getAPIProfiles();
  });

  // 获取指定 Profile
  ipcMain.handle('api:getProfile', async (event, profileId) => {
    return configManager.getAPIProfile(profileId);
  });

  // 添加新 Profile
  ipcMain.handle('api:addProfile', async (event, profileData) => {
    return configManager.addAPIProfile(profileData);
  });

  // 更新 Profile
  ipcMain.handle('api:updateProfile', async (event, { profileId, updates }) => {
    return configManager.updateAPIProfile(profileId, updates);
  });

  // 删除 Profile
  ipcMain.handle('api:deleteProfile', async (event, profileId) => {
    return configManager.deleteAPIProfile(profileId);
  });

  // 设置默认 Profile
  ipcMain.handle('api:setDefault', async (event, profileId) => {
    return configManager.setDefaultProfile(profileId);
  });

  // 获取默认 Profile（用于启动时推荐）
  ipcMain.handle('api:getCurrentProfile', async () => {
    return configManager.getDefaultProfile();
  });

  // 注意：不再有全局 "当前 Profile" 概念
  // Profile 选择将在会话启动时进行（待实现）

  // ========================================
  // 全局设置管理
  // ========================================

  // 获取全局模型配置
  ipcMain.handle('config:getGlobalModels', async () => {
    return configManager.getGlobalModels();
  });

  // 更新全局模型配置
  ipcMain.handle('config:updateGlobalModels', async (event, globalModels) => {
    return configManager.updateGlobalModels(globalModels);
  });

  // 获取服务商枚举定义
  ipcMain.handle('config:getServiceProviders', async () => {
    return configManager.getServiceProviders();
  });

  // 获取超时配置
  ipcMain.handle('config:getTimeout', async () => {
    return configManager.getTimeout();
  });

  // 更新超时配置
  ipcMain.handle('config:updateTimeout', async (event, timeout) => {
    return configManager.updateTimeout(timeout);
  });

  // 测试 API 连接
  ipcMain.handle('api:testConnection', async (event, apiConfig) => {
    return configManager.testAPIConnection(apiConfig);
  });

  // ========================================
  // 自定义模型管理
  // ========================================

  // 获取指定 Profile 的自定义模型列表
  ipcMain.handle('api:getCustomModels', async (event, profileId) => {
    const profile = configManager.getAPIProfile(profileId);
    return profile?.customModels || [];
  });

  // 批量更新自定义模型列表
  ipcMain.handle('api:updateCustomModels', async (event, { profileId, models }) => {
    const profile = configManager.getAPIProfile(profileId);
    if (!profile) {
      throw new Error('Profile 不存在');
    }
    profile.customModels = models;
    return configManager.save();
  });

  // 添加自定义模型
  ipcMain.handle('api:addCustomModel', async (event, { profileId, model }) => {
    return configManager.addCustomModel(profileId, model);
  });

  // 删除自定义模型
  ipcMain.handle('api:deleteCustomModel', async (event, { profileId, modelId }) => {
    return configManager.deleteCustomModel(profileId, modelId);
  });

  // 更新自定义模型
  ipcMain.handle('api:updateCustomModel', async (event, { profileId, modelId, updates }) => {
    return configManager.updateCustomModel(profileId, modelId, updates);
  });

  // ========================================
  // 窗口管理
  // ========================================

  // 获取当前主题的背景色
  const getThemeBackgroundColor = () => {
    const config = configManager.getConfig();
    const isDark = config?.settings?.theme === 'dark';
    return isDark ? '#1a1a1a' : '#f5f5f0';
  };

  // 创建子窗口的通用配置
  const createSubWindow = (options) => {
    const { BrowserWindow } = require('electron');
    const pathModule = require('path');

    const preloadPath = pathModule.join(__dirname, '../preload/preload.js');
    console.log('[IPC] Creating sub window:', options.page);
    console.log('[IPC] Preload path:', preloadPath);
    console.log('[IPC] VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL);

    const window = new BrowserWindow({
      width: options.width || 800,
      height: options.height || 600,
      title: options.title,
      parent: mainWindow,
      modal: false,
      backgroundColor: getThemeBackgroundColor(),
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      const url = `${process.env.VITE_DEV_SERVER_URL}/pages/${options.page}/`;
      console.log('[IPC] Loading URL:', url);
      window.loadURL(url);
    } else {
      const filePath = pathModule.join(__dirname, `../renderer/pages-dist/pages/${options.page}/index.html`);
      console.log('[IPC] Loading file:', filePath);
      window.loadFile(filePath);
    }

    return window;
  };

  // 打开 Profile 管理窗口
  ipcMain.handle('window:openProfileManager', async () => {
    createSubWindow({
      width: 1000,
      height: 700,
      title: 'API 配置管理 - Claude Code Desktop',
      page: 'profile-manager'
    });
    return { success: true };
  });

  // 打开全局设置窗口
  ipcMain.handle('window:openGlobalSettings', async () => {
    createSubWindow({
      width: 750,
      height: 500,
      title: '全局设置 - Claude Code Desktop',
      page: 'global-settings'
    });
    return { success: true };
  });

  // 打开服务商管理窗口
  ipcMain.handle('window:openProviderManager', async () => {
    createSubWindow({
      width: 1000,
      height: 650,
      title: '服务商管理 - Claude Code Desktop',
      page: 'provider-manager'
    });
    return { success: true };
  });

  // 打开会话历史窗口
  ipcMain.handle('window:openSessionManager', async () => {
    createSubWindow({
      width: 1200,
      height: 700,
      title: '会话历史 - Claude Code Desktop',
      page: 'session-manager'
    });
    return { success: true };
  });

  // ========================================
  // Project 相关
  // ========================================

  // 获取最近项目列表
  ipcMain.handle('projects:list', async () => {
    return configManager.getRecentProjects();
  });

  // 添加项目
  ipcMain.handle('project:add', async (event, { name, path }) => {
    return configManager.addRecentProject(name, path);
  });

  // 移除项目
  ipcMain.handle('project:remove', async (event, projectId) => {
    return configManager.removeRecentProject(projectId);
  });

  // 重命名项目
  ipcMain.handle('project:rename', async (event, { projectId, newName }) => {
    return configManager.renameProject(projectId, newName);
  });

  // 切换固定状态
  ipcMain.handle('project:togglePin', async (event, projectId) => {
    return configManager.togglePinProject(projectId);
  });

  // ========================================
  // Dialog 相关
  // ========================================

  // 选择文件夹
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Project Folder'
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0];
  });

  // 打开外部链接（在系统默认浏览器中）
  ipcMain.handle('shell:openExternal', async (event, url) => {
    // 安全检查：只允许 http/https 链接
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL' };
  });

  // ========================================
  // 服务商定义管理
  // ========================================

  createIPCHandler('provider:list', () => {
    return configManager.getServiceProviderDefinitions();
  });

  createIPCHandler('provider:get', (id) => {
    return configManager.getServiceProviderDefinition(id);
  });

  createIPCHandler('provider:add', (definition) => {
    return configManager.addServiceProviderDefinition(definition);
  });

  createIPCHandler('provider:update', ({ id, updates }) => {
    return configManager.updateServiceProviderDefinition(id, updates);
  });

  createIPCHandler('provider:delete', (id) => {
    return configManager.deleteServiceProviderDefinition(id);
  });

  // ========================================
  // 会话历史管理（数据库版）
  // ========================================

  const { SessionDatabase } = require('./session-database');
  const { SessionSyncService } = require('./session-sync-service');

  // 初始化数据库和同步服务
  const sessionDatabase = new SessionDatabase();
  sessionDatabase.init();

  const sessionSyncService = new SessionSyncService(sessionDatabase);

  // 同步会话数据
  createIPCHandler('session:sync', async () => {
    return await sessionSyncService.sync();
  });

  // 获取同步状态
  createIPCHandler('session:getSyncStatus', () => {
    return {
      syncing: sessionSyncService.isSyncing(),
      lastSync: sessionSyncService.getLastSyncStats()
    };
  });

  // 获取所有项目（从数据库）
  createIPCHandler('session:getProjects', () => {
    return sessionDatabase.getAllProjects();
  });

  // 获取项目的会话列表（从数据库）
  createIPCHandler('session:getProjectSessions', (projectId) => {
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
  createIPCHandler('session:getMessages', ({ sessionId, limit, offset }) => {
    return sessionDatabase.getSessionMessages(sessionId, { limit, offset });
  });

  // 搜索会话（使用 FTS5）
  createIPCHandler('session:search', ({ query, projectId, sessionId, limit }) => {
    return sessionDatabase.searchMessages(query, { projectId, sessionId, limit });
  });

  // 导出会话
  createIPCHandler('session:export', ({ sessionId, format }) => {
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
  createIPCHandler('session:getStats', () => {
    return sessionDatabase.getStats();
  });

  // ========================================
  // 标签管理
  // ========================================

  // 创建标签
  createIPCHandler('tag:create', ({ name, color }) => {
    return sessionDatabase.createTag(name, color);
  });

  // 获取所有标签
  createIPCHandler('tag:getAll', () => {
    return sessionDatabase.getAllTags();
  });

  // 删除标签
  createIPCHandler('tag:delete', (tagId) => {
    sessionDatabase.deleteTag(tagId);
    return { success: true };
  });

  // 添加标签到会话
  createIPCHandler('tag:addToSession', ({ sessionId, tagId }) => {
    sessionDatabase.addTagToSession(sessionId, tagId);
    return { success: true };
  });

  // 从会话移除标签
  createIPCHandler('tag:removeFromSession', ({ sessionId, tagId }) => {
    sessionDatabase.removeTagFromSession(sessionId, tagId);
    return { success: true };
  });

  // 获取会话的标签
  createIPCHandler('tag:getSessionTags', (sessionId) => {
    return sessionDatabase.getSessionTags(sessionId);
  });

  // 获取标签下的会话
  createIPCHandler('tag:getSessions', (tagId) => {
    return sessionDatabase.getSessionsByTag(tagId);
  });

  // ========================================
  // 消息标签管理
  // ========================================

  // 添加标签到消息
  createIPCHandler('tag:addToMessage', ({ messageId, tagId }) => {
    sessionDatabase.addTagToMessage(messageId, tagId);
    return { success: true };
  });

  // 从消息移除标签
  createIPCHandler('tag:removeFromMessage', ({ messageId, tagId }) => {
    sessionDatabase.removeTagFromMessage(messageId, tagId);
    return { success: true };
  });

  // 获取消息的标签
  createIPCHandler('tag:getMessageTags', (messageId) => {
    return sessionDatabase.getMessageTags(messageId);
  });

  // 获取标签下的消息
  createIPCHandler('tag:getMessages', (tagId) => {
    return sessionDatabase.getMessagesByTag(tagId);
  });

  // 获取会话中所有带标签的消息
  createIPCHandler('tag:getSessionTaggedMessages', (sessionId) => {
    return sessionDatabase.getSessionTaggedMessages(sessionId);
  });

  // ========================================
  // 收藏管理
  // ========================================

  // 添加收藏
  createIPCHandler('favorite:add', ({ sessionId, note }) => {
    sessionDatabase.addFavorite(sessionId, note);
    return { success: true };
  });

  // 移除收藏
  createIPCHandler('favorite:remove', (sessionId) => {
    sessionDatabase.removeFavorite(sessionId);
    return { success: true };
  });

  // 检查是否收藏
  createIPCHandler('favorite:check', (sessionId) => {
    return sessionDatabase.isFavorite(sessionId);
  });

  // 获取所有收藏
  createIPCHandler('favorite:getAll', () => {
    return sessionDatabase.getAllFavorites();
  });

  // 更新收藏备注
  createIPCHandler('favorite:updateNote', ({ sessionId, note }) => {
    sessionDatabase.updateFavoriteNote(sessionId, note);
    return { success: true };
  });

  // ========================================
  // Terminal 相关
  // ========================================

  // 启动终端
  ipcMain.handle('terminal:start', async (event, projectPath) => {
    return terminalManager.start(projectPath);
  });

  // 写入数据
  ipcMain.on('terminal:write', (event, data) => {
    terminalManager.write(data);
  });

  // 调整大小
  ipcMain.on('terminal:resize', (event, { cols, rows }) => {
    terminalManager.resize(cols, rows);
  });

  // 关闭终端
  ipcMain.handle('terminal:kill', async () => {
    terminalManager.kill();
    return { success: true };
  });

  // 获取状态
  ipcMain.handle('terminal:status', async () => {
    return terminalManager.getStatus();
  });

  console.log('[IPC] Handlers ready');
}

module.exports = { setupIPCHandlers };

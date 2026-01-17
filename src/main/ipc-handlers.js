/**
 * IPC 处理器
 * 处理渲染进程和主进程之间的通信
 */

const { ipcMain, dialog, shell } = require('electron');
const { SessionDatabase } = require('./session-database');
const { SessionHistoryService } = require('./session-history-service');
const { setupConfigHandlers } = require('./ipc-handlers/config-handlers');
const { setupSessionHandlers } = require('./ipc-handlers/session-handlers');
const { setupProjectHandlers } = require('./ipc-handlers/project-handlers');
const { setupActiveSessionHandlers } = require('./ipc-handlers/active-session-handlers');
const { createIPCHandler } = require('./utils/ipc-utils');

// Bind ipcMain to createIPCHandler for local use
const registerHandler = (channelName, handler) => createIPCHandler(ipcMain, channelName, handler);

function setupIPCHandlers(mainWindow, configManager, terminalManager, activeSessionManager) {
  console.log('[IPC] Setting up handlers...');

  // 初始化共享数据库
  const sessionDatabase = new SessionDatabase();
  sessionDatabase.init();

  // 初始化文件读取服务（实时读取 ~/.claude 目录）
  const sessionHistoryService = new SessionHistoryService();

  // ========================================
  // 配置相关处理器（提取到独立模块）
  // ========================================
  setupConfigHandlers(ipcMain, configManager);

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
    const { BrowserWindow, app } = require('electron');
    const pathModule = require('path');
    const fs = require('fs');
    const isMac = process.platform === 'darwin';

    console.log(`[SubWindow] Creating window for page: ${options.page}, platform: ${process.platform}`);

    const preloadPath = pathModule.join(__dirname, '../preload/preload.js');
    console.log(`[SubWindow] Preload path: ${preloadPath}, exists: ${fs.existsSync(preloadPath)}`);

    const window = new BrowserWindow({
      width: options.width || 800,
      height: options.height || 600,
      title: options.title,
      // macOS 上不设置 parent，避免窗口不显示
      ...(isMac ? {} : { parent: mainWindow }),
      modal: false,
      show: false,  // 先隐藏，等待 ready-to-show
      backgroundColor: getThemeBackgroundColor(),
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // 窗口准备好后再显示
    window.once('ready-to-show', () => {
      console.log(`[SubWindow] Window ready-to-show: ${options.page}`);
      window.show();
      window.focus();  // macOS 需要显式 focus
      if (isMac) {
        app.dock?.show();  // 确保 dock 图标显示
      }
    });

    // 加载失败时的处理
    window.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`[SubWindow] Failed to load: ${errorCode} - ${errorDescription}`);
    });

    const query = options.query || ''
    if (process.env.VITE_DEV_SERVER_URL) {
      const baseUrl = process.env.VITE_DEV_SERVER_URL.replace(/\/+$/, '');
      const url = `${baseUrl}/pages/${options.page}/${query}`;
      console.log(`[SubWindow] Loading URL: ${url}`);
      window.loadURL(url);
    } else {
      const filePath = pathModule.join(__dirname, `../renderer/pages-dist/pages/${options.page}/index.html`);
      console.log(`[SubWindow] Loading file: ${filePath}, exists: ${fs.existsSync(filePath)}`);
      window.loadFile(filePath, { query: query.replace('?', '') });
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

  // 打开会话查询窗口
  ipcMain.handle('window:openSessionManager', async (event, options = {}) => {
    const query = options.projectPath ? `?projectPath=${encodeURIComponent(options.projectPath)}` : ''
    createSubWindow({
      width: 1200,
      height: 700,
      title: '会话查询 - Claude Code Desktop',
      page: 'session-manager',
      query
    });
    return { success: true };
  });

  // ========================================
  // Project 相关（简单的列表操作保留在此）
  // ========================================

  ipcMain.handle('projects:list', async () => {
    return configManager.getRecentProjects();
  });

  ipcMain.handle('project:add', async (event, { name, path }) => {
    return configManager.addRecentProject(name, path);
  });

  ipcMain.handle('project:remove', async (event, projectId) => {
    return configManager.removeRecentProject(projectId);
  });

  ipcMain.handle('project:rename', async (event, { projectId, newName }) => {
    return configManager.renameProject(projectId, newName);
  });

  ipcMain.handle('project:togglePin', async (event, projectId) => {
    return configManager.togglePinProject(projectId);
  });

  // ========================================
  // Dialog 相关
  // ========================================

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

  ipcMain.handle('dialog:saveFile', async (event, { filename, content, ext }) => {
    const filters = ext === 'md'
      ? [{ name: 'Markdown', extensions: ['md'] }]
      : [{ name: 'JSON', extensions: ['json'] }];

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Session',
      defaultPath: filename,
      filters
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    const fs = require('fs');
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  });

  ipcMain.handle('shell:openExternal', async (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL' };
  });

  // ========================================
  // 会话历史管理（数据库版）
  // ========================================
  setupSessionHandlers(ipcMain, sessionDatabase);

  // ========================================
  // 实时会话读取（文件版）
  // ========================================

  registerHandler('session:getFileBasedSessions', async (projectPath) => {
    return sessionHistoryService.getProjectSessions(projectPath);
  });

  registerHandler('session:deleteFile', async ({ projectPath, sessionId }) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { encodePath } = require('./utils/path-utils');

    const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
    const encodedPath = encodePath(projectPath);
    const sessionFile = path.join(claudeProjectsDir, encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      return { success: false, error: '会话文件不存在' };
    }

    try {
      fs.unlinkSync(sessionFile);
      return { success: true };
    } catch (err) {
      console.error('[IPC] Failed to delete session file:', err);
      return { success: false, error: err.message };
    }
  });

  // ========================================
  // 工程管理（数据库版）
  // ========================================
  try {
    setupProjectHandlers(ipcMain, sessionDatabase, mainWindow);
    console.log('[IPC] Project handlers registered successfully');
  } catch (err) {
    console.error('[IPC] Failed to setup project handlers:', err);
  }

  // ========================================
  // Terminal 相关
  // ========================================

  ipcMain.handle('terminal:start', async (event, projectPath) => {
    return terminalManager.start(projectPath);
  });

  ipcMain.on('terminal:write', (event, data) => {
    terminalManager.write(data);
  });

  ipcMain.on('terminal:resize', (event, { cols, rows }) => {
    terminalManager.resize(cols, rows);
  });

  ipcMain.handle('terminal:kill', async () => {
    terminalManager.kill();
    return { success: true };
  });

  ipcMain.handle('terminal:status', async () => {
    return terminalManager.getStatus();
  });

  // ========================================
  // 活动会话管理（多终端支持）
  // ========================================
  if (activeSessionManager) {
    setupActiveSessionHandlers(ipcMain, activeSessionManager);
  }

  console.log('[IPC] Handlers ready');
}

module.exports = { setupIPCHandlers };

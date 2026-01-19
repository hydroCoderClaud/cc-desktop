/**
 * IPC 处理器
 * 处理渲染进程和主进程之间的通信
 */

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 安全加载模块，捕获错误
function safeRequire(modulePath, moduleName) {
  try {
    const fullPath = path.join(__dirname, modulePath);
    console.log(`[IPC] Loading ${moduleName} from: ${fullPath}`);
    console.log(`[IPC] File exists: ${fs.existsSync(fullPath + '.js')}`);
    const mod = require(modulePath);
    console.log(`[IPC] ${moduleName} loaded successfully`);
    return mod;
  } catch (err) {
    console.error(`[IPC] Failed to load ${moduleName}:`, err.message);
    console.error(`[IPC] Stack:`, err.stack);
    return null;
  }
}

const { SessionDatabase } = safeRequire('./session-database', 'SessionDatabase') || {};
const { SessionHistoryService } = safeRequire('./session-history-service', 'SessionHistoryService') || {};
const { SessionFileWatcher } = safeRequire('./session-file-watcher', 'SessionFileWatcher') || {};
const configHandlersMod = safeRequire('./ipc-handlers/config-handlers', 'config-handlers');
const sessionHandlersMod = safeRequire('./ipc-handlers/session-handlers', 'session-handlers');
const projectHandlersMod = safeRequire('./ipc-handlers/project-handlers', 'project-handlers');
const activeSessionHandlersMod = safeRequire('./ipc-handlers/active-session-handlers', 'active-session-handlers');
const promptHandlersMod = safeRequire('./ipc-handlers/prompt-handlers', 'prompt-handlers');
const ipcUtilsMod = safeRequire('./utils/ipc-utils', 'ipc-utils');

const setupConfigHandlers = configHandlersMod?.setupConfigHandlers;
const setupSessionHandlers = sessionHandlersMod?.setupSessionHandlers;
const setupProjectHandlers = projectHandlersMod?.setupProjectHandlers;
const setupActiveSessionHandlers = activeSessionHandlersMod?.setupActiveSessionHandlers;
const registerPromptHandlers = promptHandlersMod?.registerPromptHandlers;
const createIPCHandler = ipcUtilsMod?.createIPCHandler;

// Bind ipcMain to createIPCHandler for local use
const registerHandler = (channelName, handler) => {
  if (createIPCHandler) {
    createIPCHandler(ipcMain, channelName, handler);
  } else {
    console.error(`[IPC] Cannot register ${channelName}: createIPCHandler not loaded`);
    // Fallback to direct registration
    ipcMain.handle(channelName, async (event, ...args) => {
      try {
        return await handler(...args);
      } catch (err) {
        console.error(`[IPC] ${channelName} error:`, err);
        throw err;
      }
    });
  }
};

function setupIPCHandlers(mainWindow, configManager, terminalManager, activeSessionManager) {
  console.log('[IPC] Setting up handlers...');

  // 初始化共享数据库
  const sessionDatabase = new SessionDatabase();
  sessionDatabase.init();

  // 初始化文件读取服务（实时读取 ~/.claude 目录）
  const sessionHistoryService = new SessionHistoryService();

  // 初始化会话文件监听器
  const sessionFileWatcher = SessionFileWatcher ? new SessionFileWatcher(mainWindow) : null;
  if (!sessionFileWatcher) {
    console.warn('[IPC] SessionFileWatcher not available');
  }

  // 设置依赖关系
  if (activeSessionManager) {
    activeSessionManager.setSessionDatabase(sessionDatabase);
  }
  if (sessionFileWatcher) {
    sessionFileWatcher.setDependencies({
      sessionDatabase,
      activeSessionManager
    });
  }

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

  // 打开外观设置窗口
  ipcMain.handle('window:openAppearanceSettings', async () => {
    createSubWindow({
      width: 600,
      height: 450,
      title: '外观设置 - Claude Code Desktop',
      page: 'appearance-settings'
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
  // 会话文件监控
  // ========================================

  // 开始监控项目的会话文件变化
  ipcMain.handle('sessionWatcher:watch', async (event, { projectPath, projectId }) => {
    if (sessionFileWatcher) {
      sessionFileWatcher.watch(projectPath, projectId);
      return { success: true };
    }
    return { success: false, error: 'SessionFileWatcher not available' };
  });

  // 停止文件监控
  ipcMain.handle('sessionWatcher:stop', async () => {
    if (sessionFileWatcher) {
      sessionFileWatcher.stop();
      return { success: true };
    }
    return { success: false, error: 'SessionFileWatcher not available' };
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
  // 提示词管理
  // ========================================
  if (registerPromptHandlers) {
    try {
      registerPromptHandlers(sessionDatabase);
      console.log('[IPC] Prompt handlers registered successfully');
    } catch (err) {
      console.error('[IPC] Failed to setup prompt handlers:', err);
    }
  } else {
    console.error('[IPC] registerPromptHandlers not available - module failed to load');
  }

  // ========================================
  // 实时会话读取（文件版）
  // ========================================

  registerHandler('session:getFileBasedSessions', async (projectPath) => {
    return sessionHistoryService.getProjectSessions(projectPath);
  });

  // ========================================
  // 会话面板管理（数据库 + 文件同步）
  // ========================================

  // 获取项目会话列表（从数据库）
  registerHandler('session:getProjectSessionsFromDb', async (projectId) => {
    return sessionDatabase.getProjectSessionsForPanel(projectId);
  });

  // 同步项目会话到数据库（从文件系统增量同步）
  registerHandler('session:syncProjectSessions', async ({ projectPath, projectId }) => {
    // 获取文件系统中的会话
    const fileSessions = await sessionHistoryService.getProjectSessions(projectPath);
    if (!fileSessions || fileSessions.length === 0) {
      return { success: true, synced: 0 };
    }

    let syncedCount = 0;
    for (const fileSession of fileSessions) {
      // 跳过 warmup 会话
      if (fileSession.firstUserMessage?.toLowerCase().includes('warmup')) {
        continue;
      }
      // 同步到数据库
      sessionDatabase.syncSessionFromFile(projectId, fileSession);
      syncedCount++;
    }

    return { success: true, synced: syncedCount };
  });

  // 更新会话标题
  registerHandler('session:updateTitle', async ({ sessionId, title }) => {
    return sessionDatabase.updateSessionTitle(sessionId, title);
  });

  // 删除会话（数据库 + 文件）
  registerHandler('session:deleteWithFile', async ({ sessionId, projectPath, sessionUuid }) => {
    // 删除文件
    if (sessionUuid && projectPath) {
      const path = require('path');
      const os = require('os');
      const { encodePath } = require('./utils/path-utils');

      const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
      const encodedPath = encodePath(projectPath);
      const sessionFile = path.join(claudeProjectsDir, encodedPath, `${sessionUuid}.jsonl`);

      if (fs.existsSync(sessionFile)) {
        try {
          fs.unlinkSync(sessionFile);
        } catch (err) {
          console.error('[IPC] Failed to delete session file:', err);
        }
      }
    }

    // 删除数据库记录
    return sessionDatabase.deleteSession(sessionId);
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
  if (setupProjectHandlers) {
    try {
      setupProjectHandlers(ipcMain, sessionDatabase, mainWindow);
      console.log('[IPC] Project handlers registered successfully');
    } catch (err) {
      console.error('[IPC] Failed to setup project handlers:', err);
    }
  } else {
    console.error('[IPC] setupProjectHandlers not available - module failed to load');
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

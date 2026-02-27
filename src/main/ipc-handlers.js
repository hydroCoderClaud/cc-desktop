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
    return require(modulePath);
  } catch (err) {
    console.error(`[IPC] Failed to load ${moduleName}:`, err.message);
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
const queueHandlersMod = safeRequire('./ipc-handlers/queue-handlers', 'queue-handlers');
const aiHandlersMod = safeRequire('./ipc-handlers/ai-handlers', 'ai-handlers');
const pluginHandlersMod = safeRequire('./ipc-handlers/plugin-handlers', 'plugin-handlers');
const agentHandlersMod = safeRequire('./ipc-handlers/agent-handlers', 'agent-handlers');
const capabilityHandlersMod = safeRequire('./ipc-handlers/capability-handlers', 'capability-handlers');
const updateHandlersMod = safeRequire('./ipc-handlers/update-handlers', 'update-handlers');
const dingtalkHandlersMod = safeRequire('./ipc-handlers/dingtalk-handlers', 'dingtalk-handlers');
const ipcUtilsMod = safeRequire('./utils/ipc-utils', 'ipc-utils');

const setupConfigHandlers = configHandlersMod?.setupConfigHandlers;
const setupSessionHandlers = sessionHandlersMod?.setupSessionHandlers;
const setupProjectHandlers = projectHandlersMod?.setupProjectHandlers;
const setupActiveSessionHandlers = activeSessionHandlersMod?.setupActiveSessionHandlers;
const registerPromptHandlers = promptHandlersMod?.registerPromptHandlers;
const setupQueueHandlers = queueHandlersMod?.setupQueueHandlers;
const setupAIHandlers = aiHandlersMod?.setupAIHandlers;
const setupPluginHandlers = pluginHandlersMod?.setupPluginHandlers;
const setupAgentHandlers = agentHandlersMod?.setupAgentHandlers;
const setupCapabilityHandlers = capabilityHandlersMod?.setupCapabilityHandlers;
const setupUpdateHandlers = updateHandlersMod?.setupUpdateHandlers;
const setupDingTalkHandlers = dingtalkHandlersMod?.setupDingTalkHandlers;
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

function setupIPCHandlers(mainWindow, configManager, terminalManager, activeSessionManager, agentSessionManager, capabilityManager, updateManager, dingtalkBridge) {
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
  if (agentSessionManager) {
    agentSessionManager.setSessionDatabase(sessionDatabase);
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
    const isMac = process.platform === 'darwin';
    const preloadPath = pathModule.join(__dirname, '../preload/preload.js');

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
      window.loadURL(`${baseUrl}/pages/${options.page}/${query}`);
    } else {
      const filePath = pathModule.join(__dirname, `../renderer/pages-dist/pages/${options.page}/index.html`);
      window.loadFile(filePath, { query: query.replace('?', '') });
    }

    return window;
  };

  // 打开 Profile 管理窗口
  ipcMain.handle('window:openProfileManager', async () => {
    createSubWindow({
      width: 1000,
      height: 700,
      title: 'API 配置管理 - CC Desktop',
      page: 'profile-manager'
    });
    return { success: true };
  });

  // 打开全局设置窗口
  ipcMain.handle('window:openGlobalSettings', async () => {
    createSubWindow({
      width: 750,
      height: 500,
      title: '全局设置 - CC Desktop',
      page: 'global-settings'
    });
    return { success: true };
  });

  // 打开外观设置窗口
  ipcMain.handle('window:openAppearanceSettings', async () => {
    createSubWindow({
      width: 600,
      height: 450,
      title: '外观设置 - CC Desktop',
      page: 'appearance-settings'
    });
    return { success: true };
  });

  // 打开服务商管理窗口
  ipcMain.handle('window:openProviderManager', async () => {
    createSubWindow({
      width: 1000,
      height: 650,
      title: '服务商管理 - CC Desktop',
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
      title: '会话查询 - CC Desktop',
      page: 'session-manager',
      query
    });
    return { success: true };
  });

  // 聚焦主窗口
  ipcMain.handle('window:focusMainWindow', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  });

  // 打开应用更新窗口（防止重复打开）
  let updateManagerWindow = null
  ipcMain.handle('window:openUpdateManager', async () => {
    // 如果窗口已存在且未销毁，聚焦它而不是新开
    if (updateManagerWindow && !updateManagerWindow.isDestroyed()) {
      if (updateManagerWindow.isMinimized()) updateManagerWindow.restore()
      updateManagerWindow.show()
      updateManagerWindow.focus()
      return { success: true }
    }
    updateManagerWindow = createSubWindow({
      width: 700,
      height: 600,
      title: '应用更新 - CC Desktop',
      page: 'update-manager'
    })
    // 窗口关闭时清理引用
    updateManagerWindow.on('closed', () => {
      updateManagerWindow = null
    })
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
  // Dialog 相关
  // ========================================

  ipcMain.handle('dialog:selectFolder', async (event) => {
    const { BrowserWindow } = require('electron');
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(senderWindow || mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Project Folder'
    });

    if (result.canceled) {
      return null;
    }

    const selectedPath = result.filePaths[0];

    // 检查路径是否包含 _ 或 -，这会导致 Claude CLI 会话同步问题
    // Claude CLI 会把 _ 和 - 都编码成 -，解码时无法区分
    const folderName = require('path').basename(selectedPath);
    if (folderName.includes('_') || folderName.includes('-')) {
      dialog.showErrorBox(
        '路径不支持',
        `项目文件夹名称 "${folderName}" 包含下划线(_)或连字符(-)。\n\n这会导致 Claude CLI 会话无法正确同步。\n\n请重命名文件夹后再添加。`
      );
      return null;
    }

    return selectedPath;
  });

  ipcMain.handle('dialog:selectDirectory', async (event, options = {}) => {
    const { BrowserWindow } = require('electron')
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(senderWindow || mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: options.title || 'Select Directory'
    })
    return result.canceled ? null : result.filePaths[0]
  });

  ipcMain.handle('dialog:selectFile', async (event, options = {}) => {
    const { title, filters } = options
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: title || 'Select File',
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0];
  });

  // 选择多个文件
  ipcMain.handle('dialog:selectFiles', async (event, options = {}) => {
    const { title, filters } = options
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: title || 'Select Files',
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths;
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

  // 用系统默认程序打开本地文件或目录
  ipcMain.handle('shell:openPath', async (event, filePath) => {
    if (!filePath) {
      return { success: false, error: 'Path is required' };
    }
    try {
      const result = await shell.openPath(filePath);
      if (result) {
        // openPath 返回空字符串表示成功，否则返回错误信息
        return { success: false, error: result };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 获取 Claude 配置文件路径
  ipcMain.handle('claude:getSettingsPath', async () => {
    const homedir = require('os').homedir();
    const settingsPath = require('path').join(homedir, '.claude', 'settings.json');
    return settingsPath;
  });

  // 获取项目 Claude 配置文件路径（settings.local.json），不存在则创建
  ipcMain.handle('claude:getProjectConfigPath', async (event, projectPath) => {
    if (!projectPath) {
      return { success: false, error: 'Project path is required' };
    }
    const path = require('path');
    const fs = require('fs');
    const claudeDir = path.join(projectPath, '.claude');
    const configFile = path.join(claudeDir, 'settings.local.json');

    try {
      // 确保 .claude 目录存在
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }
      // 确保 settings.local.json 文件存在
      if (!fs.existsSync(configFile)) {
        fs.writeFileSync(configFile, '{\n  \n}\n', 'utf-8');
      }
      return configFile;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========================================
  // 会话历史管理（数据库版）
  // ========================================
  setupSessionHandlers(ipcMain, sessionDatabase);

  // ========================================
  // 提示词管理
  // ========================================
  if (registerPromptHandlers) {
    registerPromptHandlers(sessionDatabase);
  }

  // ========================================
  // 消息队列管理
  // ========================================
  if (setupQueueHandlers) {
    setupQueueHandlers(ipcMain, sessionDatabase);
  }

  // ========================================
  // AI 助手
  // ========================================
  if (setupAIHandlers) {
    setupAIHandlers(ipcMain, configManager);
  }

  // ========================================
  // Plugin 管理
  // ========================================
  if (setupPluginHandlers) {
    setupPluginHandlers(ipcMain);
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
  // 参数改为 projectPath，通过路径查找数据库中的项目
  registerHandler('session:getProjectSessionsFromDb', async (projectPath) => {
    const dbProject = sessionDatabase.getProjectByPath(projectPath);
    if (!dbProject) {
      return [];
    }
    return sessionDatabase.getProjectSessionsForPanel(dbProject.id);
  });

  // 同步项目会话到数据库（从文件系统增量同步）
  registerHandler('session:syncProjectSessions', async ({ projectPath, projectName }) => {
    // 获取文件系统中的会话
    const fileSessions = await sessionHistoryService.getProjectSessions(projectPath);
    if (!fileSessions || fileSessions.length === 0) {
      return { success: true, synced: 0 };
    }

    // 获取或创建数据库中的项目（使用路径作为关联键）
    const { encodePath } = require('./utils/path-utils');
    const encodedPath = encodePath(projectPath);
    const dbProject = sessionDatabase.getOrCreateProject(
      projectPath,
      encodedPath,
      projectName || require('path').basename(projectPath)
    );

    let syncedCount = 0;
    for (const fileSession of fileSessions) {
      // 跳过 warmup 会话
      if (fileSession.firstUserMessage?.toLowerCase().includes('warmup')) {
        continue;
      }
      // 跳过 0 条消息的会话
      if (!fileSession.messageCount || fileSession.messageCount === 0) {
        continue;
      }
      // 同步到数据库（使用数据库项目的 INTEGER id）
      sessionDatabase.syncSessionFromFile(dbProject.id, fileSession);
      syncedCount++;
    }

    return { success: true, synced: syncedCount };
  });

  // 更新会话标题
  // 支持两种方式：1. sessionId（数据库ID）2. sessionUuid（Claude Code UUID）
  registerHandler('session:updateTitle', async ({ sessionId, sessionUuid, title }) => {
    if (sessionId) {
      return sessionDatabase.updateSessionTitle(sessionId, title);
    } else if (sessionUuid) {
      return sessionDatabase.updateSessionTitleByUuid(sessionUuid, title);
    }
    return { success: false, error: 'Missing sessionId or sessionUuid' };
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
    setupProjectHandlers(ipcMain, sessionDatabase, mainWindow);
  }

  // ========================================
  // Terminal 相关
  // ========================================

  ipcMain.handle('terminal:start', async (event, projectPath) => {
    // 检查路径是否包含 _ 或 -，这会导致 Claude CLI 会话同步问题
    const folderName = require('path').basename(projectPath);
    if (folderName.includes('_') || folderName.includes('-')) {
      return {
        success: false,
        error: `项目文件夹名称 "${folderName}" 包含下划线(_)或连字符(-)，会导致会话同步问题。请重命名文件夹后再打开。`
      };
    }
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

  // ========================================
  // Agent 会话管理
  // ========================================
  if (agentSessionManager && setupAgentHandlers) {
    setupAgentHandlers(ipcMain, agentSessionManager);
  }

  // ========================================
  // 能力管理（Agent 模式）
  // ========================================
  if (capabilityManager && setupCapabilityHandlers) {
    setupCapabilityHandlers(ipcMain, capabilityManager, agentSessionManager);
  }

  // ========================================
  // 应用更新
  // ========================================
  if (updateManager && setupUpdateHandlers) {
    setupUpdateHandlers(updateManager);
  }

  // ========================================
  // 钉钉桥接
  // ========================================
  if (dingtalkBridge && setupDingTalkHandlers) {
    setupDingTalkHandlers(ipcMain, dingtalkBridge, configManager);
  }

  // 打开钉钉桥接设置窗口
  ipcMain.handle('window:openDingTalkSettings', async () => {
    createSubWindow({
      width: 600,
      height: 600,
      title: '钉钉桥接设置 - CC Desktop',
      page: 'dingtalk-settings'
    });
    return { success: true };
  });
}

module.exports = { setupIPCHandlers };

/**
 * IPC 处理器
 * 处理渲染进程和主进程之间的通信
 */

const { app, ipcMain, dialog, shell, Notification } = require('electron');
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
const projectFilesHandlersMod = safeRequire('./ipc-handlers/project-files-handlers', 'project-files-handlers');
const activeSessionHandlersMod = safeRequire('./ipc-handlers/active-session-handlers', 'active-session-handlers');
const promptHandlersMod = safeRequire('./ipc-handlers/prompt-handlers', 'prompt-handlers');
const queueHandlersMod = safeRequire('./ipc-handlers/queue-handlers', 'queue-handlers');
const pluginHandlersMod = safeRequire('./ipc-handlers/plugin-handlers', 'plugin-handlers');
const agentHandlersMod = safeRequire('./ipc-handlers/agent-handlers', 'agent-handlers');
const agentSessionBrokerMod = safeRequire('./agent-platform/agent-session-broker', 'agent-session-broker');
const agentEventRouterMod = safeRequire('./agent-platform/agent-event-router', 'agent-event-router');
const embeddedAppRuntimeManagerMod = safeRequire('./agent-platform/embedded-app-runtime-manager', 'embedded-app-runtime-manager');
const capabilityHandlersMod = safeRequire('./ipc-handlers/capability-handlers', 'capability-handlers');
const updateHandlersMod = safeRequire('./ipc-handlers/update-handlers', 'update-handlers');
const dingtalkHandlersMod = safeRequire('./ipc-handlers/dingtalk-handlers', 'dingtalk-handlers');
const feishuHandlersMod = safeRequire('./ipc-handlers/feishu-handlers', 'feishu-handlers');
const enterpriseWeixinHandlersMod = safeRequire('./ipc-handlers/enterprise-weixin-handlers', 'enterprise-weixin-handlers');
const notebookHandlersMod = safeRequire('./ipc-handlers/notebook-handlers', 'notebook-handlers');
const scheduledTaskHandlersMod = safeRequire('./ipc-handlers/scheduled-task-handlers', 'scheduled-task-handlers');
const weixinNotifyHandlersMod = safeRequire('./ipc-handlers/weixin-notify-handlers', 'weixin-notify-handlers');
const hydrologyHandlersMod = safeRequire('./ipc-handlers/hydrology-handlers', 'hydrology-handlers');
const ipcUtilsMod = safeRequire('./utils/ipc-utils', 'ipc-utils');
const appI18nMod = safeRequire('./utils/app-i18n', 'app-i18n');
const embeddedAppRegistryMod = safeRequire('./embedded-app-registry', 'embedded-app-registry');
const hydrologyDatabaseMod = safeRequire('./hydrology/hydrology-database', 'hydrology-database');
const stationServiceMod = safeRequire('./hydrology/station-service', 'station-service');
const realtimeServiceMod = safeRequire('./hydrology/realtime-service', 'realtime-service');
const realtimeDemoSeederMod = safeRequire('./hydrology/realtime-demo-seeder', 'realtime-demo-seeder');
const reviewTaskServiceMod = safeRequire('./hydrology/review-task-service', 'review-task-service');
const qualityCheckServiceMod = safeRequire('./hydrology/quality-check-service', 'quality-check-service');

const setupConfigHandlers = configHandlersMod?.setupConfigHandlers;
const setupSessionHandlers = sessionHandlersMod?.setupSessionHandlers;
const setupProjectHandlers = projectHandlersMod?.setupProjectHandlers;
const setupProjectFilesHandlers = projectFilesHandlersMod?.setupProjectFilesHandlers;
const setupActiveSessionHandlers = activeSessionHandlersMod?.setupActiveSessionHandlers;
const registerPromptHandlers = promptHandlersMod?.registerPromptHandlers;
const setupQueueHandlers = queueHandlersMod?.setupQueueHandlers;
const setupPluginHandlers = pluginHandlersMod?.setupPluginHandlers;
const setupAgentHandlers = agentHandlersMod?.setupAgentHandlers;
const AgentSessionBroker = agentSessionBrokerMod?.AgentSessionBroker;
const AgentEventRouter = agentEventRouterMod?.AgentEventRouter;
const EmbeddedAppRuntimeManager = embeddedAppRuntimeManagerMod?.EmbeddedAppRuntimeManager;
const setupCapabilityHandlers = capabilityHandlersMod?.setupCapabilityHandlers;
const setupUpdateHandlers = updateHandlersMod?.setupUpdateHandlers;
const setupDingTalkHandlers = dingtalkHandlersMod?.setupDingTalkHandlers;
const setupFeishuHandlers = feishuHandlersMod?.setupFeishuHandlers;
const setupEnterpriseWeixinHandlers = enterpriseWeixinHandlersMod?.setupEnterpriseWeixinHandlers;
const setupNotebookHandlers = notebookHandlersMod?.setupNotebookHandlers;
const setupScheduledTaskHandlers = scheduledTaskHandlersMod?.setupScheduledTaskHandlers;
const setupWeixinNotifyHandlers = weixinNotifyHandlersMod?.setupWeixinNotifyHandlers;
const setupHydrologyHandlers = hydrologyHandlersMod?.setupHydrologyHandlers;
const createIPCHandler = ipcUtilsMod?.createIPCHandler;
const tMain = appI18nMod?.tMain;
const listEmbeddedApps = embeddedAppRegistryMod?.listEmbeddedApps;
const getEmbeddedAppByMenuKey = embeddedAppRegistryMod?.getEmbeddedAppByMenuKey;
const HydrologyDatabase = hydrologyDatabaseMod?.HydrologyDatabase;
const StationService = stationServiceMod?.StationService;
const RealtimeService = realtimeServiceMod?.RealtimeService;
const RealtimeDemoSeeder = realtimeDemoSeederMod?.RealtimeDemoSeeder;
const ReviewTaskService = reviewTaskServiceMod?.ReviewTaskService;
const QualityCheckService = qualityCheckServiceMod?.QualityCheckService;

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

function normalizeEmbeddedAppIdForPath(appId) {
  const normalized = typeof appId === 'string'
    ? appId.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
  return normalized || 'embedded-app'
}

function getEmbeddedAppWorkspaceDir(appId) {
  const safeAppId = normalizeEmbeddedAppIdForPath(appId)
  const workspaceDir = path.join(app.getPath('userData'), 'embedded-apps', safeAppId, 'workspace')
  fs.mkdirSync(workspaceDir, { recursive: true })
  return workspaceDir
}

function setupIPCHandlers(mainWindow, configManager, terminalManager, activeSessionManager, agentSessionManager, capabilityManager, updateManager, dingtalkBridge, notebookManager, embeddedAppPreferencesManager, scheduledTaskService, weixinNotifyService, weixinBridge, feishuBridge = null, enterpriseWeixinBridge = null, localAgentApiServer = null) {
  const translate = (key, params = {}) => typeof tMain === 'function'
    ? tMain(configManager, key, params)
    : key

  const getModeTitle = () => translate('app.windows.main')

  const trustedWeixinWebContents = new Set()
  const registerTrustedWeixinWindow = (window) => {
    const webContents = window?.webContents
    if (!webContents) return
    trustedWeixinWebContents.add(webContents)
    window.once('closed', () => {
      trustedWeixinWebContents.delete(webContents)
    })
  }
  registerTrustedWeixinWindow(mainWindow)

  // 初始化共享数据库
  const sessionDatabase = new SessionDatabase();
  sessionDatabase.init();
  const hydrologyDatabase = HydrologyDatabase ? new HydrologyDatabase() : null
  hydrologyDatabase?.init()
  const stationService = hydrologyDatabase && StationService
    ? new StationService(hydrologyDatabase)
    : null
  const reviewTaskService = hydrologyDatabase && ReviewTaskService
    ? new ReviewTaskService(hydrologyDatabase)
    : null
  const realtimeService = hydrologyDatabase && RealtimeService
    ? new RealtimeService(hydrologyDatabase, { reviewTaskService })
    : null
  const qualityCheckService = stationService && realtimeService && QualityCheckService
    ? new QualityCheckService({ stationService, realtimeService, hydrologyDatabase })
    : null
  const realtimeDemoSeeder = realtimeService && RealtimeDemoSeeder
    ? new RealtimeDemoSeeder(realtimeService)
    : null

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
  if (capabilityManager) {
    capabilityManager.setSessionDatabase(sessionDatabase);
  }
  const agentSessionBroker = agentSessionManager && AgentSessionBroker
    ? new AgentSessionBroker(agentSessionManager)
    : null
  const embeddedAppRuntimeManager = EmbeddedAppRuntimeManager
    ? new EmbeddedAppRuntimeManager()
    : null
  const agentEventRouter = agentSessionManager && AgentEventRouter
    ? new AgentEventRouter({
        resolveOwnerClientId: (sessionId) => agentSessionBroker?.getSessionOwnerClientId(sessionId)
          || agentSessionManager.getSessionOwnerClientId?.(sessionId)
          || 'host-ui',
        defaultOwnerClientId: 'host-ui'
      })
    : null
  if (agentSessionManager?.setEventRouter) {
    agentSessionManager.setEventRouter(agentEventRouter)
  }
  if (agentSessionManager) {
    agentSessionManager.embeddedAppRuntimeManager = embeddedAppRuntimeManager
    agentSessionManager.stationService = stationService
    agentSessionManager.realtimeService = realtimeService
    agentSessionManager.realtimeDemoSeeder = realtimeDemoSeeder
    agentSessionManager.reviewTaskService = reviewTaskService
    agentSessionManager.qualityCheckService = qualityCheckService
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
  setupConfigHandlers(ipcMain, configManager, agentSessionManager, localAgentApiServer);

  // ========================================
  // 窗口管理
  // ========================================

  const openEmbeddedAppWindow = (menuKey) => {
    const app = typeof getEmbeddedAppByMenuKey === 'function'
      ? getEmbeddedAppByMenuKey(menuKey)
      : null;

    if (!app) {
      return { success: false, error: `Unknown embedded app: ${menuKey}` };
    }

    createSubWindow({
      width: app.window?.width || 1200,
      height: app.window?.height || 800,
      title: translate(app.titleKey || app.labelKey || app.id),
      page: app.page,
      startMaximized: true
    });
    return { success: true };
  };

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
      fullscreenable: !isMac,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true
      }
    });

    // 窗口准备好后再显示
    window.once('ready-to-show', () => {
      if (options.startMaximized) {
        window.maximize();
      }
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

    if (options.trustWeixinNotifyIPC) {
      registerTrustedWeixinWindow(window)
    }

    return window;
  };

  // 打开 Profile 管理窗口
  ipcMain.handle('window:openProfileManager', async () => {
    createSubWindow({
      width: 1000,
      height: 700,
      title: translate('app.windows.profileManager'),
      page: 'profile-manager'
    });
    return { success: true };
  });

  ipcMain.handle('window:openModelSettings', async () => {
    createSubWindow({
      width: 1180,
      height: 820,
      title: translate('app.windows.modelSettings'),
      page: 'model-settings'
    });
    return { success: true };
  });

  // 打开全局设置窗口
  ipcMain.handle('window:openGlobalSettings', async () => {
    createSubWindow({
      width: 750,
      height: 500,
      title: translate('app.windows.globalSettings'),
      page: 'global-settings'
    });
    return { success: true };
  });

  // 打开外观设置窗口
  ipcMain.handle('window:openAppearanceSettings', async () => {
    createSubWindow({
      width: 600,
      height: 450,
      title: translate('app.windows.appearanceSettings'),
      page: 'appearance-settings'
    });
    return { success: true };
  });

  ipcMain.handle('window:openChannelSettings', async () => {
    createSubWindow({
      width: 1180,
      height: 820,
      title: translate('app.windows.channelSettings'),
      page: 'channel-settings',
      trustWeixinNotifyIPC: true
    });
    return { success: true };
  });

  // 打开能力管理窗口（跨模式可访问）
  ipcMain.handle('window:openSettingsWorkbench', async (_event, options = {}) => {
    const params = new URLSearchParams()
    if (options.mode) params.set('mode', options.mode)
    if (options.cwd) params.set('cwd', options.cwd)
    createSubWindow({
      width: 1100,
      height: 760,
      title: translate('app.windows.settingsWorkbench'),
      page: 'settings-workbench',
      trustWeixinNotifyIPC: true,
      query: params.toString() ? `?${params.toString()}` : ''
    });
    return { success: true };
  });

  // 打开服务商管理窗口
  ipcMain.handle('window:openProviderManager', async () => {
    createSubWindow({
      width: 1000,
      height: 650,
      title: translate('app.windows.providerManager'),
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
      title: translate('app.windows.sessionManager'),
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

  ipcMain.handle('window:setMainTitleByMode', async (_event, mode) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'Main window not available' }
    }

    mainWindow.setTitle(getModeTitle())
    return { success: true }
  })

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
      title: translate('app.windows.updateManager'),
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
      title: translate('app.dialogs.selectProjectFolder')
    });

    if (result.canceled) {
      return null;
    }

    const selectedPath = result.filePaths[0];

    return selectedPath;
  });

  ipcMain.handle('dialog:selectDirectory', async (event, options = {}) => {
    const { BrowserWindow } = require('electron')
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(senderWindow || mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: options.title || translate('app.dialogs.selectDirectory')
    })
    return result.canceled ? null : result.filePaths[0]
  });

  ipcMain.handle('dialog:selectFile', async (event, options = {}) => {
    const { title, filters } = options
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: title || translate('app.dialogs.selectFile'),
      filters: filters || [{ name: translate('app.dialogs.allFiles'), extensions: ['*'] }]
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
      title: title || translate('app.dialogs.selectFiles'),
      filters: filters || [{ name: translate('app.dialogs.allFiles'), extensions: ['*'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths;
  });

  ipcMain.handle('dialog:saveFile', async (event, { filename, content, ext }) => {
    const filters = ext === 'md'
      ? [{ name: translate('app.dialogs.markdown'), extensions: ['md'] }]
      : [{ name: translate('app.dialogs.json'), extensions: ['json'] }];

    const result = await dialog.showSaveDialog(mainWindow, {
      title: translate('app.dialogs.exportSession'),
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

  ipcMain.handle('dialog:saveImage', async (event, { filename, base64, dir }) => {
    let filePath;

    if (dir) {
      // 直接写入指定目录
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      filePath = path.join(dir, filename || 'message.png');
    } else {
      // 弹出保存对话框
      const { BrowserWindow } = require('electron');
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(senderWindow || mainWindow, {
        title: translate('app.dialogs.saveImage'),
        defaultPath: filename || 'message.png',
        filters: [{ name: translate('app.dialogs.pngImage'), extensions: ['png'] }]
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      filePath = result.filePath;
    }

    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  });

  ipcMain.handle('notification:show', async (_event, options = {}) => {
    const title = typeof options.title === 'string' ? options.title.trim() : '';
    const body = typeof options.body === 'string' ? options.body : '';

    if (!title) {
      return { success: false, error: 'Notification title is required' };
    }

    if (!Notification.isSupported()) {
      return { success: false, error: 'Notifications are not supported on this system' };
    }

    try {
      new Notification({ title, body }).show();
      return { success: true };
    } catch (err) {
      console.error('[IPC] notification:show error:', err);
      return { success: false, error: err.message || 'Failed to show notification' };
    }
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

  // 解析相对路径为绝对路径（基于指定的 base 目录）
  ipcMain.handle('path:resolve', async (event, basePath, relativePath) => {
    if (!basePath || !relativePath) {
      return null;
    }
    try {
      const path = require('path');
      // 如果 relativePath 已经是绝对路径，直接返回
      if (path.isAbsolute(relativePath)) {
        return relativePath;
      }
      return path.resolve(basePath, relativePath);
    } catch (err) {
      console.error('[IPC] path:resolve error:', err);
      return null;
    }
  });

  ipcMain.handle('path:exists', async (event, targetPath) => {
    if (!targetPath) {
      return false;
    }
    try {
      const fs = require('fs');
      return fs.existsSync(targetPath);
    } catch (err) {
      console.error('[IPC] path:exists error:', err);
      return false;
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
    registerPromptHandlers(sessionDatabase, configManager);
  }

  // ========================================
  // 消息队列管理
  // ========================================
  if (setupQueueHandlers) {
    setupQueueHandlers(ipcMain, sessionDatabase);
  }

  // ========================================
  // Plugin 管理
  // ========================================
  if (setupPluginHandlers) {
    setupPluginHandlers(ipcMain, configManager);
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
  // 工程文件浏览管理
  // ========================================
  if (setupProjectFilesHandlers) {
    setupProjectFilesHandlers(ipcMain);
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

  // ========================================
  // Agent 会话管理
  // ========================================
  if (agentSessionManager && setupAgentHandlers) {
    setupAgentHandlers(ipcMain, agentSessionManager, agentSessionBroker);
  }

  if (agentSessionBroker && agentEventRouter) {
    const embeddedSubscriptions = new Map()
    const embeddedCommandRequests = new Map()

    const normalizeEmbeddedClient = (client = {}) => {
      const rawAppId = typeof client.appId === 'string' ? client.appId.trim() : ''
      const appId = rawAppId || 'embedded-app'
      const defaultCwd = getEmbeddedAppWorkspaceDir(appId)
      return {
        appId,
        defaultCwd,
        clientId: `embed:${appId}`,
        clientType: 'embedded',
        clientMeta: {
          appId,
          ...(client.clientMeta && typeof client.clientMeta === 'object' && !Array.isArray(client.clientMeta)
            ? client.clientMeta
            : {})
        }
      }
    }

    const registerEmbeddedSubscription = (client, event) => {
      const normalizedClient = normalizeEmbeddedClient(client)
      const sender = event?.sender
      if (!sender) {
        throw new Error('Embedded event sender not available')
      }
      trustedWeixinWebContents.add(sender)

      const existingId = embeddedSubscriptions.get(sender.id)
      if (existingId) {
        agentEventRouter.unregisterClient(existingId)
      }

      const { subscriptionId } = agentEventRouter.registerClient(normalizedClient, (payload) => {
        if (!sender.isDestroyed()) {
          sender.send('hydro-agent:event', payload)
        }
      })

      if (embeddedAppRuntimeManager) {
        embeddedAppRuntimeManager.registerCommandClient(
          normalizedClient.appId,
          normalizedClient.clientId,
          ({ command, payload }) => new Promise((resolve, reject) => {
            if (sender.isDestroyed()) {
              reject(new Error('Embedded renderer is unavailable'))
              return
            }

            const requestId = `embedded-cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            const timeout = setTimeout(() => {
              embeddedCommandRequests.delete(requestId)
              reject(new Error(`Embedded app command timed out: ${command}`))
            }, 10000)

            embeddedCommandRequests.set(requestId, {
              senderId: sender.id,
              timeout,
              resolve,
              reject
            })

            sender.send('hydro-agent:command-request', {
              requestId,
              appId: normalizedClient.appId,
              clientId: normalizedClient.clientId,
              command,
              payload: payload && typeof payload === 'object' ? payload : {}
            })
          })
        )
      }

      embeddedSubscriptions.set(sender.id, subscriptionId)
      sender.once('destroyed', () => {
        const currentId = embeddedSubscriptions.get(sender.id)
        if (currentId) {
          agentEventRouter.unregisterClient(currentId)
          embeddedSubscriptions.delete(sender.id)
        }
        clearEmbeddedCurrentSessionIfMatches(normalizedClient.appId, normalizedClient.sessionId)
        if (embeddedAppRuntimeManager) {
          embeddedAppRuntimeManager.unregisterCommandClient(normalizedClient.appId, normalizedClient.clientId)
        }
        trustedWeixinWebContents.delete(sender)
        for (const [requestId, pending] of embeddedCommandRequests.entries()) {
          if (pending.senderId !== sender.id) continue
          clearTimeout(pending.timeout)
          pending.reject(new Error('Embedded renderer is unavailable'))
          embeddedCommandRequests.delete(requestId)
        }
      })

      return normalizedClient
    }

    const withEmbeddedClient = (event, client, handler) => {
      const normalizedClient = normalizeEmbeddedClient(client)
      return handler(normalizedClient)
    }

    const syncEmbeddedCurrentSession = (appId, sessionId) => {
      if (!embeddedAppRuntimeManager || !appId) return
      embeddedAppRuntimeManager.setCurrentSession(appId, sessionId)
    }

    const clearEmbeddedCurrentSessionIfMatches = (appId, sessionId) => {
      if (!embeddedAppRuntimeManager || !appId) return
      if (typeof embeddedAppRuntimeManager.clearCurrentSessionIfMatches === 'function') {
        embeddedAppRuntimeManager.clearCurrentSessionIfMatches(appId, sessionId)
      }
    }

    ipcMain.handle('hydro-agent:connect', async (event, payload = {}) => {
      const client = registerEmbeddedSubscription(payload, event)
      return {
        success: true,
        clientId: client.clientId,
        appId: client.appId,
        defaultCwd: client.defaultCwd
      }
    })

    ipcMain.handle('hydro-agent:disconnect', async (event) => {
      const normalizedClient = normalizeEmbeddedClient(null, event.sender)
      const subscriptionId = embeddedSubscriptions.get(event.sender.id)
      if (subscriptionId) {
        agentEventRouter.unregisterClient(subscriptionId)
        embeddedSubscriptions.delete(event.sender.id)
      }
      clearEmbeddedCurrentSessionIfMatches(normalizedClient.appId, normalizedClient.sessionId)
      if (embeddedAppRuntimeManager) {
        embeddedAppRuntimeManager.unregisterCommandClient(normalizedClient.appId, normalizedClient.clientId)
      }
      trustedWeixinWebContents.delete(event.sender)
      return { success: true }
    })

    ipcMain.handle('hydro-agent:updateContext', async (_event, { client, context } = {}) => {
      if (!embeddedAppRuntimeManager) {
        return { success: false, error: 'Embedded runtime unavailable' }
      }
      const normalizedClient = normalizeEmbeddedClient(client)
      embeddedAppRuntimeManager.updateContext(normalizedClient.appId, context && typeof context === 'object' ? context : null)
      return { success: true }
    })

    ipcMain.handle('hydro-agent:getContext', async (_event, { client } = {}) => {
      if (!embeddedAppRuntimeManager) return null
      const normalizedClient = normalizeEmbeddedClient(client)
      return embeddedAppRuntimeManager.getContext(normalizedClient.appId)
    })

    ipcMain.handle('hydro-agent:commandResult', async (_event, { requestId, result, error } = {}) => {
      const pending = embeddedCommandRequests.get(requestId)
      if (!pending) {
        return { success: false, error: 'Command request not found' }
      }

      clearTimeout(pending.timeout)
      embeddedCommandRequests.delete(requestId)

      if (error) {
        pending.reject(new Error(String(error)))
      } else {
        pending.resolve(result)
      }

      return { success: true }
    })

    ipcMain.handle('hydro-agent:createSession', async (event, { client, options } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => {
        const requestedOptions = options && typeof options === 'object' ? options : {}
        const sessionOptions = {
          ...requestedOptions,
          cwd: typeof requestedOptions.cwd === 'string' && requestedOptions.cwd.trim()
            ? requestedOptions.cwd.trim()
            : normalizedClient.defaultCwd
        }
        const session = agentSessionBroker.create(sessionOptions, normalizedClient)
        syncEmbeddedCurrentSession(normalizedClient.appId, session?.id || null)
        return session
      })
    })
    ipcMain.handle('hydro-agent:listSessions', async (event, { client } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.list(normalizedClient))
    })
    ipcMain.handle('hydro-agent:getSession', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.get(sessionId, normalizedClient))
    })
    ipcMain.handle('hydro-agent:getMessages', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.getMessages(sessionId, normalizedClient))
    })
    ipcMain.handle('hydro-agent:sendMessage', async (event, { client, sessionId, message, options } = {}) => {
      return withEmbeddedClient(event, client, async (normalizedClient) => {
        await agentSessionBroker.sendMessage(sessionId, message, options || {}, normalizedClient)
        return { success: true }
      })
    })
    ipcMain.handle('hydro-agent:cancel', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, async (normalizedClient) => {
        await agentSessionBroker.cancel(sessionId, normalizedClient)
        return { success: true }
      })
    })
    ipcMain.handle('hydro-agent:close', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, async (normalizedClient) => {
        await agentSessionBroker.close(sessionId, normalizedClient)
        return { success: true }
      })
    })
    ipcMain.handle('hydro-agent:reopen', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => {
        const session = agentSessionBroker.reopen(sessionId, normalizedClient)
        syncEmbeddedCurrentSession(normalizedClient.appId, session?.id || null)
        return session
      })
    })
    ipcMain.handle('hydro-agent:switchApiProfile', async (event, { client, sessionId, profileId } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.switchApiProfile(sessionId, profileId, normalizedClient))
    })
    ipcMain.handle('hydro-agent:clearAndRecreate', async (event, { client, sessionId, overrides } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => {
        const session = agentSessionBroker.clearAndRecreate(sessionId, overrides || {}, normalizedClient)
        syncEmbeddedCurrentSession(normalizedClient.appId, session?.id || null)
        return session
      })
    })
    ipcMain.handle('hydro-agent:setCurrentSession', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => {
        const session = agentSessionBroker.syncEmbeddedCurrentSession(sessionId, normalizedClient)
        syncEmbeddedCurrentSession(normalizedClient.appId, session?.id || null)
        return { success: true, sessionId: session?.id || null }
      })
    })
    ipcMain.handle('hydro-agent:getInitResult', async (event, { client, sessionId } = {}) => {
      try {
        return await withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.getInitResult(sessionId, normalizedClient))
      } catch (err) {
        const message = String(err?.message || err || '')
        const isExpectedMissingInit = message.includes('No active streaming session') || message.includes('not found')
        if (!isExpectedMissingInit) {
          console.error('[IPC] hydro-agent:getInitResult error:', err)
        }
        return { error: err.message }
      }
    })
    ipcMain.handle('hydro-agent:getMcpServerStatus', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.getMcpServerStatus(sessionId, normalizedClient))
    })
    ipcMain.handle('hydro-agent:getSupportedCommands', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.getSupportedCommands(sessionId, normalizedClient))
    })
    ipcMain.handle('hydro-agent:setModel', async (event, { client, sessionId, model } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.setModel(sessionId, model, normalizedClient))
    })
    ipcMain.handle('hydro-agent:respondInteraction', async (event, { client, sessionId, interactionId, response } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.resolveInteraction(sessionId, interactionId, response || {}, normalizedClient))
    })
    ipcMain.handle('hydro-agent:cancelInteraction', async (event, { client, sessionId, interactionId, reason } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.cancelInteraction(sessionId, interactionId, reason, normalizedClient))
    })
    ipcMain.handle('hydro-agent:listDir', async (event, { client, sessionId, relativePath, showHidden } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.listDir(sessionId, relativePath || '', !!showHidden, normalizedClient))
    })
    ipcMain.handle('hydro-agent:readFile', async (event, { client, sessionId, relativePath } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.readFile(sessionId, relativePath, normalizedClient))
    })
    ipcMain.handle('hydro-agent:saveFile', async (event, { client, sessionId, relativePath, content } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.saveFile(sessionId, relativePath, content, normalizedClient))
    })
    ipcMain.handle('hydro-agent:searchFiles', async (event, { client, sessionId, keyword, showHidden } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.searchFiles(sessionId, keyword, !!showHidden, normalizedClient))
    })
    ipcMain.handle('hydro-agent:createFile', async (event, { client, sessionId, parentPath, name, isDirectory } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.createFile(sessionId, parentPath || '', name, !!isDirectory, normalizedClient))
    })
    ipcMain.handle('hydro-agent:renameFile', async (event, { client, sessionId, oldPath, newName } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.renameFile(sessionId, oldPath, newName, normalizedClient))
    })
    ipcMain.handle('hydro-agent:deleteFile', async (event, { client, sessionId, path: relativePath } = {}) => {
      return withEmbeddedClient(event, client, (normalizedClient) => agentSessionBroker.deleteFile(sessionId, relativePath, normalizedClient))
    })
    ipcMain.handle('hydro-agent:openFile', async (event, { client, sessionId, relativePath } = {}) => {
      return withEmbeddedClient(event, client, async (normalizedClient) => {
        agentSessionBroker.get(sessionId, normalizedClient)
        const fullPath = agentSessionManager.resolveFilePath(sessionId, relativePath)
        if (!fullPath) return { success: false, error: 'Cannot resolve path' }
        if (!fs.existsSync(fullPath)) return { success: false, error: 'File not found' }
        const result = await shell.openPath(fullPath)
        return result ? { success: false, error: result } : { success: true }
      })
    })
    ipcMain.handle('hydro-agent:openOutputDir', async (event, { client, sessionId } = {}) => {
      return withEmbeddedClient(event, client, async (normalizedClient) => {
        const dir = agentSessionBroker.getOutputDir(sessionId, normalizedClient)
        if (!dir) return { success: false, error: 'No output directory' }
        const result = await shell.openPath(dir)
        return result ? { success: false, error: result } : { success: true }
      })
    })
  }

  // ========================================
  // 能力管理（Agent 模式）
  // ========================================
  if (capabilityManager && setupCapabilityHandlers) {
    setupCapabilityHandlers(ipcMain, capabilityManager, agentSessionManager);
  }

  // 启动后台能力清单更新检测（延迟 5s）
  if (capabilityManager) {
    setTimeout(async () => {
      try {
        const result = await capabilityManager.checkForCapabilityUpdates()
        if (result.hasUpdate) {
          const { BrowserWindow } = require('electron')
          BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) win.webContents.send('capabilities-update-available')
          })
        }
      } catch (err) {
        console.warn('[IPC] Capability update check failed:', err.message)
      }
    }, 5000)
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

  if (feishuBridge && setupFeishuHandlers) {
    setupFeishuHandlers(ipcMain, feishuBridge, configManager);
  }

  // ========================================
  // 企业微信
  // ========================================
  if (enterpriseWeixinBridge && setupEnterpriseWeixinHandlers) {
    setupEnterpriseWeixinHandlers(ipcMain, enterpriseWeixinBridge, configManager);
  }

  // ========================================
  // 微信通知
  // ========================================
  if (weixinNotifyService && setupWeixinNotifyHandlers) {
    setupWeixinNotifyHandlers(ipcMain, weixinNotifyService, weixinBridge, mainWindow, {
      isTrustedSender: (sender) => trustedWeixinWebContents.has(sender)
    });
  }

  // ========================================
  // Notebook 管理
  // ========================================
  if (notebookManager && setupNotebookHandlers) {
    notebookManager.setSessionDatabase(sessionDatabase);
    notebookManager.setCapabilityManager(capabilityManager);
    setupNotebookHandlers(ipcMain, notebookManager);
  }

  if (scheduledTaskService && setupScheduledTaskHandlers) {
    scheduledTaskService.setSessionDatabase(sessionDatabase)
    scheduledTaskService.start()
    setupScheduledTaskHandlers(ipcMain, scheduledTaskService)
  }

  // 打开钉钉桥接设置窗口
  ipcMain.handle('window:openDingTalkSettings', async () => {
    createSubWindow({
      width: 600,
      height: 600,
      title: translate('app.windows.dingtalkSettings'),
      page: 'dingtalk-settings'
    });
    return { success: true };
  });

  // 打开飞书桥接设置窗口
  ipcMain.handle('window:openFeishuSettings', async () => {
    createSubWindow({
      width: 600,
      height: 600,
      title: translate('app.windows.feishuSettings'),
      page: 'feishu-settings'
    });
    return { success: true };
  });

  // 打开 Notebook 工作台
  ipcMain.handle('window:openNotebookWorkspace', async () => {
    createSubWindow({
      width: 1400,
      height: 900,
      title: translate('app.windows.notebookWorkspace'),
      page: 'notebook'
    });
    return { success: true };
  });

  ipcMain.handle('embedded-app:list', async () => {
    const apps = typeof listEmbeddedApps === 'function' ? listEmbeddedApps() : [];
    return apps.map((app) => ({
      id: app.id,
      menuKey: app.menuKey,
      icon: app.icon,
      label: translate(app.labelKey || app.titleKey || app.id)
    }));
  });

  ipcMain.handle('embedded-app:getPreferences', async (_event, appId) => {
    if (!embeddedAppPreferencesManager) {
      return {
        appId: typeof appId === 'string' ? appId.trim() : '',
        apiProfileId: null,
        modelId: null
      }
    }
    return embeddedAppPreferencesManager.getPreferences(appId)
  });

  ipcMain.handle('embedded-app:updatePreferences', async (_event, { appId, updates } = {}) => {
    if (!embeddedAppPreferencesManager) {
      throw new Error('Embedded app preferences manager not available')
    }
    return embeddedAppPreferencesManager.updatePreferences(appId, updates || {})
  });

  ipcMain.handle('embedded-app:open', async (_event, menuKey) => {
    return openEmbeddedAppWindow(menuKey);
  });

  if (setupHydrologyHandlers && stationService) {
    setupHydrologyHandlers(ipcMain, {
      stationService,
      realtimeService,
      realtimeDemoSeeder,
      reviewTaskService,
      qualityCheckService
    })
  }

  return {
    agentSessionBroker,
    agentEventRouter,
    embeddedAppRuntimeManager
  }
}

module.exports = { setupIPCHandlers };

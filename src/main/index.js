/**
 * Electron 主进程入口
 * Claude Code Desktop - 独立版本
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const ConfigManager = require('./config-manager');
const TerminalManager = require('./terminal-manager');
const { ActiveSessionManager } = require('./active-session-manager');
const { setupIPCHandlers } = require('./ipc-handlers');

// 保持窗口引用
let mainWindow = null;
let configManager = null;
let terminalManager = null;
let activeSessionManager = null;

/**
 * 获取主题背景色
 */
function getThemeBackgroundColor() {
  if (configManager) {
    const config = configManager.getConfig();
    const isDark = config?.settings?.theme === 'dark';
    return isDark ? '#1a1a1a' : '#f5f5f0';
  }
  return '#f5f5f0';
}

/**
 * 创建主窗口
 */
function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/preload.js');
  console.log('[Main] Creating main window');
  console.log('[Main] Preload path:', preloadPath);
  console.log('[Main] VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Claude Code Desktop',
    backgroundColor: getThemeBackgroundColor(),
    autoHideMenuBar: true,  // 隐藏菜单栏
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
    },
  });

  // 加载渲染进程 HTML
  // 开发模式：从 Vite 服务器加载 Vue 页面
  // 生产模式：从构建后的文件加载
  const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
  if (VITE_DEV_SERVER_URL) {
    // vite-plugin-electron 设置的 URL 已经包含完整路径
    const url = VITE_DEV_SERVER_URL.endsWith('/')
      ? `${VITE_DEV_SERVER_URL}pages/main/`
      : `${VITE_DEV_SERVER_URL}/pages/main/`;
    console.log('[Main] Loading URL:', url);
    mainWindow.loadURL(url);
  } else {
    const filePath = path.join(__dirname, '../renderer/pages-dist/pages/main/index.html');
    console.log('[Main] Loading file:', filePath);
    mainWindow.loadFile(filePath);
  }

  // 开发模式下打开开发者工具（默认关闭，使用 F12 手动打开）
  // if (process.env.NODE_ENV === 'development') {
  //   mainWindow.webContents.openDevTools();
  // }

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    // 清理终端进程
    if (terminalManager) {
      terminalManager.kill();
    }
    // 清理所有活动会话
    if (activeSessionManager) {
      activeSessionManager.closeAll();
    }
    mainWindow = null;
  });

  // F12 切换开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });
}

/**
 * 应用就绪事件
 */
app.whenReady().then(() => {
  console.log('[Main] Electron app is ready');

  // 初始化管理器
  configManager = new ConfigManager();

  // 创建主窗口
  createWindow();

  // 初始化终端管理器（需要窗口实例）- 保留兼容旧代码
  terminalManager = new TerminalManager(mainWindow, configManager);

  // 初始化活动会话管理器（新的多会话管理）
  activeSessionManager = new ActiveSessionManager(mainWindow, configManager);

  // 设置 IPC 处理器
  setupIPCHandlers(mainWindow, configManager, terminalManager, activeSessionManager);

  // macOS 特定行为
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * 所有窗口关闭事件
 */
app.on('window-all-closed', () => {
  // macOS 下通常不退出应用
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 应用即将退出事件
 */
app.on('will-quit', () => {
  console.log('[Main] Application is quitting...');

  // 清理终端进程
  if (terminalManager) {
    terminalManager.kill();
  }

  // 清理所有活动会话
  if (activeSessionManager) {
    activeSessionManager.closeAll();
  }
});

/**
 * 异常处理
 */
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});

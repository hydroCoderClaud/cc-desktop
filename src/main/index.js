/**
 * Electron 主进程入口
 * Claude Code Desktop - 独立版本
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const ConfigManager = require('./config-manager');
const TerminalManager = require('./terminal-manager');
const { setupIPCHandlers } = require('./ipc-handlers');

// 保持窗口引用
let mainWindow = null;
let configManager = null;
let terminalManager = null;

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Claude Code Desktop',
    backgroundColor: '#f5f5f0',
    autoHideMenuBar: true,  // 隐藏菜单栏
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
    },
  });

  // 加载渲染进程 HTML
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

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

  // 初始化终端管理器（需要窗口实例）
  terminalManager = new TerminalManager(mainWindow, configManager);

  // 设置 IPC 处理器
  setupIPCHandlers(mainWindow, configManager, terminalManager);

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

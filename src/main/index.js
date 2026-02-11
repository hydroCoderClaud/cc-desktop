/**
 * Electron 主进程入口
 * Claude Code Desktop - 独立版本
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const ConfigManager = require('./config-manager');
const TerminalManager = require('./terminal-manager');
const { ActiveSessionManager } = require('./active-session-manager');
const { AgentSessionManager } = require('./agent-session-manager');
const { CapabilityManager } = require('./managers/capability-manager');
const { setupIPCHandlers } = require('./ipc-handlers');

// 保持窗口引用
let mainWindow = null;
let configManager = null;
let terminalManager = null;
let activeSessionManager = null;
let agentSessionManager = null;
let capabilityManager = null;

/**
 * 统一清理函数（幂等，可多次调用）
 * 被 closed / will-quit / SIGTERM / uncaughtException 等多个路径共用
 */
let cleanupDone = false;
function cleanupAllSessions() {
  if (cleanupDone) return;
  cleanupDone = true;
  try {
    if (terminalManager) terminalManager.kill();
    if (activeSessionManager) activeSessionManager.closeAll(false);
    if (agentSessionManager) agentSessionManager.closeAllSync();
    console.log('[Main] All sessions cleaned up');
  } catch (e) {
    console.error('[Main] Cleanup error:', e);
  }
}

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

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,  // 先隐藏，准备好后再显示
    title: 'CC Desktop',
    backgroundColor: getThemeBackgroundColor(),
    autoHideMenuBar: true,  // 隐藏菜单栏
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
    },
  });

  // 窗口准备好后，先最大化再显示（避免过渡闪烁）
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // 加载渲染进程 HTML
  // 开发模式：从 Vite 服务器加载 Vue 页面
  // 生产模式：从构建后的文件加载
  const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
  if (VITE_DEV_SERVER_URL) {
    const url = VITE_DEV_SERVER_URL.endsWith('/')
      ? `${VITE_DEV_SERVER_URL}pages/main/`
      : `${VITE_DEV_SERVER_URL}/pages/main/`;
    mainWindow.loadURL(url);
  } else {
    const filePath = path.join(__dirname, '../renderer/pages-dist/pages/main/index.html');
    mainWindow.loadFile(filePath);
  }

  // 开发模式下打开开发者工具（默认关闭，使用 F12 手动打开）
  // if (process.env.NODE_ENV === 'development') {
  //   mainWindow.webContents.openDevTools();
  // }

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    cleanupAllSessions();
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
 * 修复项目数据（命令行参数 --fix-db 触发）
 */
async function fixProjectsData() {
  const { SessionDatabase } = require('./session-database')
  const { smartDecodePath } = require('./utils/path-utils')
  const fs = require('fs')
  const pathModule = require('path')

  console.log('开始修复项目数据...')

  const db = new SessionDatabase()
  db.init()

  const projects = db.db.prepare('SELECT * FROM projects').all()
  console.log(`找到 ${projects.length} 个项目`)

  let fixedCount = 0

  for (const project of projects) {
    const nameIsNumeric = /^\d+$/.test(String(project.name))
    const pathExists = project.path && fs.existsSync(project.path)
    const needsSourceFix = project.source !== 'user'

    if (nameIsNumeric || !pathExists || needsSourceFix) {
      console.log(`修复项目 ${project.id}: name=${project.name}, path=${project.path}, source=${project.source}`)

      const correctPath = smartDecodePath(project.encoded_path) || project.path
      const correctName = correctPath ? pathModule.basename(correctPath) : project.name

      db.db.prepare(`UPDATE projects SET path = ?, name = ?, source = 'user', updated_at = ? WHERE id = ?`)
        .run(correctPath, correctName, Date.now(), project.id)
      console.log(`  -> path=${correctPath}, name=${correctName}, source=user`)
      fixedCount++
    }
  }

  console.log(`修复完成，共修复 ${fixedCount} 个项目`)
  db.db.close()
}

/**
 * 应用就绪事件
 */
app.whenReady().then(async () => {
  // 检查是否是修复模式
  if (process.argv.includes('--fix-db')) {
    await fixProjectsData()
    app.quit()
    return
  }
  // 初始化管理器
  configManager = new ConfigManager();

  // 创建主窗口
  createWindow();

  // 初始化终端管理器（需要窗口实例）- 保留兼容旧代码
  terminalManager = new TerminalManager(mainWindow, configManager);

  // 初始化活动会话管理器（新的多会话管理）
  activeSessionManager = new ActiveSessionManager(mainWindow, configManager);

  // 初始化 Agent 会话管理器
  agentSessionManager = new AgentSessionManager(mainWindow, configManager);

  // 互相注入引用（跨模式会话占用检查）
  activeSessionManager.setPeerManager(agentSessionManager)
  agentSessionManager.setPeerManager(activeSessionManager)

  // 初始化能力管理器（Agent 模式）
  const { PluginCli } = require('./managers/plugin-cli')
  const { SkillsManager, AgentsManager } = require('./managers')
  const pluginCli = new PluginCli()
  const skillsManager = new SkillsManager()
  const agentsManager = new AgentsManager()
  capabilityManager = new CapabilityManager(configManager, pluginCli, skillsManager, agentsManager)

  // 设置 IPC 处理器
  setupIPCHandlers(mainWindow, configManager, terminalManager, activeSessionManager, agentSessionManager, capabilityManager);

  // macOS 特定行为
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // macOS 重建窗口时重置清理标志，让新一轮 closed 事件可以再次触发清理
      cleanupDone = false;
      createWindow();

      // 更新所有 manager 的 mainWindow 引用
      if (terminalManager) {
        terminalManager.mainWindow = mainWindow;
      }
      if (activeSessionManager) {
        activeSessionManager.mainWindow = mainWindow;
      }
      if (agentSessionManager) {
        agentSessionManager.mainWindow = mainWindow;
        // macOS: CLI 进程在 closed 事件中已被 closeAllSync 清理，通知前端刷新状态
        agentSessionManager.notifyAllSessionsClosed();
      }
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
  cleanupAllSessions();
});

/**
 * 信号处理（SIGTERM / SIGINT）
 * Windows 上 SIGINT 来自 Ctrl+C；SIGTERM 来自 taskkill
 */
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[Main] Received ${signal}, cleaning up...`);
    cleanupAllSessions();
    app.quit();
  });
}

/**
 * 异常处理 — 尽力清理后退出
 */
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
  cleanupAllSessions();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});

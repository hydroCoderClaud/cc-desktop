/**
 * Electron 主进程入口
 * Claude Code Desktop - 独立版本
 */

const { app, BrowserWindow, powerSaveBlocker, powerMonitor } = require('electron');
const path = require('path');
const ConfigManager = require('./config-manager');
const TerminalManager = require('./terminal-manager');
const { ActiveSessionManager } = require('./active-session-manager');
const { AgentSessionManager } = require('./agent-session-manager');
const { CapabilityManager } = require('./managers/capability-manager');
const UpdateManager = require('./update-manager');
const { DingTalkBridge } = require('./managers/dingtalk-bridge');
const { NotebookManager } = require('./managers/notebook-manager');
const { ScheduledTaskService } = require('./managers/scheduled-task-service');
const { WeixinNotifyService } = require('./managers/weixin-notify-service');
const { WeixinBridge } = require('./managers/weixin-bridge');
const { setupIPCHandlers } = require('./ipc-handlers');
const { createTrayController } = require('./tray-controller');
const { tMain } = require('./utils/app-i18n');

// 保持窗口引用
let mainWindow = null;
let configManager = null;
let terminalManager = null;
let activeSessionManager = null;
let agentSessionManager = null;
let capabilityManager = null;
let updateManager = null;
let dingtalkBridge = null;
let notebookManager = null;
let scheduledTaskService = null;
let weixinNotifyService = null;
let weixinBridge = null;
let powerSaveBlockerId = null;
let resumeTimer = null;
let trayController = null;

/**
 * 统一清理函数（幂等，可多次调用）
 * 被 closed / will-quit / SIGTERM / uncaughtException 等多个路径共用
 */
let cleanupDone = false;
function cleanupAllSessions() {
  if (cleanupDone) return;
  cleanupDone = true;
  try {
    if (resumeTimer) {
      clearTimeout(resumeTimer)
      resumeTimer = null
    }
    if (powerSaveBlockerId != null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId)
      console.log('[Main] PowerSaveBlocker stopped')
    }
    if (dingtalkBridge) dingtalkBridge.stop().catch(() => {});
    if (weixinBridge) weixinBridge.stop();
    if (weixinNotifyService) weixinNotifyService.stop();
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

function getMainWindowTitle() {
  return tMain(configManager, 'app.windows.main');
}

function applyMacAppDisplayName() {
  if (process.platform !== 'darwin' || typeof app.setName !== 'function') {
    return
  }

  app.setName('Hydro Desktop')
}

function rebindMainWindowReferences({ notifyAgentSessionsClosed = false, restartDingtalk = false } = {}) {
  if (terminalManager) {
    terminalManager.mainWindow = mainWindow;
  }
  if (activeSessionManager) {
    activeSessionManager.mainWindow = mainWindow;
  }
  if (agentSessionManager) {
    agentSessionManager.mainWindow = mainWindow;
    if (notifyAgentSessionsClosed) {
      agentSessionManager.notifyAllSessionsClosed();
    }
  }
  if (dingtalkBridge) {
    dingtalkBridge.mainWindow = mainWindow;
    if (restartDingtalk) {
      dingtalkBridge.start().catch(err => {
        console.error('[Main] DingTalk bridge restart on activate failed:', err.message)
      })
    }
  }
  if (weixinBridge) {
    weixinBridge.mainWindow = mainWindow;
  }
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
    title: getMainWindowTitle(),
    backgroundColor: getThemeBackgroundColor(),
    autoHideMenuBar: true,  // 隐藏菜单栏
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,  // 启用 webview 标签（用于右侧面板 URL 预览）
    },
  });

  // 窗口准备好后，先最大化再显示（避免过渡闪烁）
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    trayController?.refreshTrayMenu();
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

  mainWindow.on('close', (event) => {
    trayController?.handleWindowClose(event);
  });

  mainWindow.on('show', () => {
    trayController?.refreshTrayMenu();
  });

  mainWindow.on('hide', () => {
    trayController?.refreshTrayMenu();
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    cleanupAllSessions();
    mainWindow = null;
    trayController?.refreshTrayMenu();
  });

  // 全局快捷键：
  //   F12    — 切换开发者工具
  //   Ctrl+F — 切换全屏
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
      return;
    }
    if (input.type === 'keyDown' && input.key === 'Escape' && mainWindow.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
      return;
    }
    if (input.type === 'keyDown' && input.control && !input.alt && !input.shift && input.key.toLowerCase() === 'f') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
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

  applyMacAppDisplayName()

  // 初始化管理器
  configManager = new ConfigManager();
  trayController = createTrayController({
    appInstance: app,
    configManager,
    getMainWindow: () => mainWindow,
    onQuitRequest: () => app.quit()
  });

  // 创建主窗口
  createWindow();
  try {
    trayController.ensureTray();
  } catch (error) {
    console.error('[Main] Failed to initialize tray:', error)
  }

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
  const { PluginService } = require('./plugin-runtime')
  const { SkillsManager, AgentsManager, McpManager } = require('./managers')
  const pluginCli = new PluginService()
  const skillsManager = new SkillsManager()
  const agentsManager = new AgentsManager()
  const capMcpManager = new McpManager()
  capMcpManager.configManager = configManager  // 注入 configManager，供代理注入使用
  const { SettingsManager } = require('./managers/settings-manager')
  capMcpManager.settingsManager = new SettingsManager()  // 注入 settingsManager，供 MCP 安装时自动写入工具权限
  capabilityManager = new CapabilityManager(configManager, pluginCli, skillsManager, agentsManager, capMcpManager)

  // 初始化更新管理器
  updateManager = new UpdateManager(mainWindow, configManager)

  // 初始化钉钉桥接（构造函数内部自动绑定 agentSessionManager 事件）
  dingtalkBridge = new DingTalkBridge(configManager, agentSessionManager, mainWindow)

  // 初始化 Notebook 管理器（需要 configManager 和 agentSessionManager）
  notebookManager = new NotebookManager(configManager, agentSessionManager)

  // 初始化定时任务服务（需要 configManager 和 agentSessionManager）
  scheduledTaskService = new ScheduledTaskService(configManager, agentSessionManager)
  agentSessionManager.scheduledTaskService = scheduledTaskService

  // 初始化微信通知服务（内建 iLink 通道，不依赖 OpenClaw）
  weixinNotifyService = new WeixinNotifyService(configManager)
  weixinNotifyService.start()
  agentSessionManager.weixinNotifyService = weixinNotifyService
  weixinBridge = new WeixinBridge(configManager, agentSessionManager, weixinNotifyService, mainWindow)
  weixinBridge.start()

  // 设置 IPC 处理器
  setupIPCHandlers(mainWindow, configManager, terminalManager, activeSessionManager, agentSessionManager, capabilityManager, updateManager, dingtalkBridge, notebookManager, scheduledTaskService, weixinNotifyService, weixinBridge);

  // 阻止系统挂起本应用（屏幕可正常关闭，但进程、网络、计时器保持活跃）
  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  console.log(`[Main] PowerSaveBlocker started (id=${powerSaveBlockerId})`)

  // 系统从睡眠恢复时，重连钉钉桥接（防抖：30秒内只执行一次）
  powerMonitor.on('resume', () => {
    console.log('[Main] System resumed from sleep')
    if (resumeTimer) return // 已有待执行的重连，跳过
    resumeTimer = setTimeout(() => {
      resumeTimer = null
      if (dingtalkBridge) {
        console.log('[Main] Reconnecting DingTalk bridge...')
        dingtalkBridge.restart().catch(err => {
          console.error('[Main] DingTalk reconnect failed:', err.message)
        })
      }
      if (scheduledTaskService) {
        scheduledTaskService.onSystemResume().catch(err => {
          console.error('[Main] Scheduled task resume handling failed:', err.message)
        })
      }
    }, 3000) // 延迟3秒，等系统完全恢复后再重连
  })

  // 启动后延迟 5 秒检查更新（避免影响启动体验）
  updateManager.scheduleUpdateCheck(5000)

  // 延迟启动钉钉桥接（不阻塞主流程）
  setTimeout(() => {
    dingtalkBridge.start().catch(err => {
      console.error('[Main] DingTalk bridge auto-start failed:', err.message)
    })
  }, 3000)

  // macOS 特定行为
  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      trayController?.showMainWindow()
      return
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      // macOS 重建窗口时重置清理标志，让新一轮 closed 事件可以再次触发清理
      cleanupDone = false;
      trayController?.resetQuitting();
      createWindow();
      trayController?.refreshTrayMenu();

      // 重新启动 powerSaveBlocker（在 cleanup 中已 stop）
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
      console.log(`[Main] PowerSaveBlocker restarted on activate (id=${powerSaveBlockerId})`)

      // 更新所有 manager 的 mainWindow 引用
      rebindMainWindowReferences({
        notifyAgentSessionsClosed: true,
        restartDingtalk: true
      })
    }
  });
});

app.on('before-quit', () => {
  trayController?.markQuitting()
})

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
  trayController?.destroyTray()
  cleanupAllSessions();
  if (scheduledTaskService) {
    scheduledTaskService.destroy()
  }
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
  // uncaughtException 后进程处于未定义状态，应退出避免僵尸进程
  app.quit();
  setTimeout(() => process.exit(1), 3000);  // 兜底强退
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});

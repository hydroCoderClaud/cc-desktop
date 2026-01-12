/**
 * IPC 处理器
 * 处理渲染进程和主进程之间的通信
 */

const { ipcMain, dialog } = require('electron');

function setupIPCHandlers(mainWindow, configManager, terminalManager) {
  console.log('[IPC] Setting up handlers...');

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
  // 窗口管理
  // ========================================

  // 打开 Profile 管理窗口
  ipcMain.handle('window:openProfileManager', async () => {
    const { BrowserWindow } = require('electron');
    const path = require('path');

    // 创建 Profile 管理窗口
    const profileWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'API 配置管理 - Claude Code Desktop',
      parent: mainWindow,
      modal: false,
      backgroundColor: '#f5f5f0',
      autoHideMenuBar: true,  // 隐藏菜单栏
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    profileWindow.loadFile(path.join(__dirname, '../renderer/profile-manager.html'));

    // 开发模式打开开发者工具（默认关闭，使用 F12 手动打开）
    // if (process.env.NODE_ENV === 'development') {
    //   profileWindow.webContents.openDevTools();
    // }

    return { success: true };
  });

  // 打开全局设置窗口
  ipcMain.handle('window:openGlobalSettings', async () => {
    const { BrowserWindow } = require('electron');
    const path = require('path');

    // 创建全局设置窗口
    const globalSettingsWindow = new BrowserWindow({
      width: 750,
      height: 560,
      title: '全局设置 - Claude Code Desktop',
      parent: mainWindow,
      modal: false,
      backgroundColor: '#f5f5f0',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    globalSettingsWindow.loadFile(path.join(__dirname, '../renderer/global-settings.html'));

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

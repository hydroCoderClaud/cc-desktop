/**
 * 预加载脚本
 * 在渲染进程中暴露安全的 IPC API
 */

const { contextBridge, ipcRenderer } = require('electron');

// 同步获取初始主题并立即应用到 DOM，避免闪白
try {
  const initialTheme = ipcRenderer.sendSync('theme:getSync');
  if (initialTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.backgroundColor = '#1a1a1a';
    document.documentElement.style.colorScheme = 'dark';
  }
} catch (err) {
  console.warn('[Preload] Failed to get initial theme:', err.message);
}

// 同步获取初始语言
try {
  const initialLocale = ipcRenderer.sendSync('locale:getSync');
  document.documentElement.setAttribute('data-locale', initialLocale || 'zh-CN');
  document.documentElement.setAttribute('lang', initialLocale === 'en-US' ? 'en' : 'zh-CN');
} catch (err) {
  console.warn('[Preload] Failed to get initial locale:', err.message);
}

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // ========================================
  // Config 相关
  // ========================================
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  getConfigPath: () => ipcRenderer.invoke('config:getPath'),
  
  // Global Models and Timeout
  getGlobalModels: () => ipcRenderer.invoke('config:getGlobalModels'),
  updateGlobalModels: (globalModels) => ipcRenderer.invoke('config:updateGlobalModels', globalModels),
  getServiceProviders: () => ipcRenderer.invoke('config:getServiceProviders'),
  getTimeout: () => ipcRenderer.invoke('config:getTimeout'),
  updateTimeout: (timeout) => ipcRenderer.invoke('config:updateTimeout', timeout),

  // ========================================
  // API 配置相关
  // ========================================
  getAPIConfig: () => ipcRenderer.invoke('api:getConfig'),
  updateAPIConfig: (apiConfig) => ipcRenderer.invoke('api:updateConfig', apiConfig),
  validateAPIConfig: () => ipcRenderer.invoke('api:validate'),

  // ========================================
  // API Profile 管理
  // ========================================
  listAPIProfiles: () => ipcRenderer.invoke('api:listProfiles'),
  getAPIProfile: (profileId) => ipcRenderer.invoke('api:getProfile', profileId),
  addAPIProfile: (profileData) => ipcRenderer.invoke('api:addProfile', profileData),
  updateAPIProfile: ({ profileId, updates }) => ipcRenderer.invoke('api:updateProfile', { profileId, updates }),
  deleteAPIProfile: (profileId) => ipcRenderer.invoke('api:deleteProfile', profileId),
  setDefaultProfile: (profileId) => ipcRenderer.invoke('api:setDefault', profileId),
  getCurrentProfile: () => ipcRenderer.invoke('api:getCurrentProfile'),  // 返回默认 Profile

  // ========================================
  // 自定义模型管理（每个 Profile 独立）
  // ========================================
  getCustomModels: (profileId) => ipcRenderer.invoke('api:getCustomModels', profileId),
  updateCustomModels: ({ profileId, models }) => ipcRenderer.invoke('api:updateCustomModels', { profileId, models }),
  addCustomModel: ({ profileId, model }) => ipcRenderer.invoke('api:addCustomModel', { profileId, model }),
  deleteCustomModel: ({ profileId, modelId }) => ipcRenderer.invoke('api:deleteCustomModel', { profileId, modelId }),
  updateCustomModel: ({ profileId, modelId, updates }) => ipcRenderer.invoke('api:updateCustomModel', { profileId, modelId, updates }),
  testConnection: (apiConfig) => ipcRenderer.invoke('api:testConnection', apiConfig),
  fetchOfficialModels: (apiConfig) => ipcRenderer.invoke('api:fetchOfficialModels', apiConfig),

  // ========================================
  // Project 相关
  // ========================================
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: ({ name, path }) => ipcRenderer.invoke('project:add', { name, path }),
  removeProject: (projectId) => ipcRenderer.invoke('project:remove', projectId),
  renameProject: ({ projectId, newName }) => ipcRenderer.invoke('project:rename', { projectId, newName }),
  togglePinProject: (projectId) => ipcRenderer.invoke('project:togglePin', projectId),

  // ========================================
  // Dialog 相关
  // ========================================
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // ========================================
  // Window 相关
  // ========================================
  openProfileManager: () => ipcRenderer.invoke('window:openProfileManager'),
  openGlobalSettings: () => ipcRenderer.invoke('window:openGlobalSettings'),
  openProviderManager: () => ipcRenderer.invoke('window:openProviderManager'),

  // ========================================
  // 服务商定义管理
  // ========================================
  listProviders: () => ipcRenderer.invoke('provider:list'),
  getProvider: (id) => ipcRenderer.invoke('provider:get', id),
  addProvider: (definition) => ipcRenderer.invoke('provider:add', definition),
  updateProvider: ({ id, updates }) => ipcRenderer.invoke('provider:update', { id, updates }),
  deleteProvider: (id) => ipcRenderer.invoke('provider:delete', id),

  // ========================================
  // Terminal 相关
  // ========================================
  startTerminal: (projectPath) => ipcRenderer.invoke('terminal:start', projectPath),
  writeTerminal: (data) => ipcRenderer.send('terminal:write', data),
  resizeTerminal: ({ cols, rows }) => ipcRenderer.send('terminal:resize', { cols, rows }),
  killTerminal: () => ipcRenderer.invoke('terminal:kill'),
  getTerminalStatus: () => ipcRenderer.invoke('terminal:status'),

  // ========================================
  // 事件监听
  // ========================================
  onTerminalData: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('terminal:data', listener);
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },

  onTerminalExit: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },

  onTerminalError: (callback) => {
    const listener = (event, error) => callback(error);
    ipcRenderer.on('terminal:error', listener);
    return () => ipcRenderer.removeListener('terminal:error', listener);
  },

  // ========================================
  // 设置广播（跨窗口同步）
  // ========================================
  broadcastSettings: (settings) => ipcRenderer.send('settings:broadcast', settings),

  onSettingsChanged: (callback) => {
    const listener = (event, settings) => callback(settings);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  }
});

console.log('[Preload] ElectronAPI exposed to renderer successfully');

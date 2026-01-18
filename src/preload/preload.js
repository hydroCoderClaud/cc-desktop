/**
 * 预加载脚本
 * 在渲染进程中暴露安全的 IPC API
 */

const { contextBridge, ipcRenderer } = require('electron');

// 同步获取初始主题并立即应用到 DOM，避免闪白
try {
  const initialTheme = ipcRenderer.sendSync('theme:getSync');
  if (initialTheme === 'dark' && document.documentElement) {
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
  if (document.documentElement) {
    document.documentElement.setAttribute('data-locale', initialLocale || 'zh-CN');
    document.documentElement.setAttribute('lang', initialLocale === 'en-US' ? 'en' : 'zh-CN');
  }
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

  // Max Active Sessions
  getMaxActiveSessions: () => ipcRenderer.invoke('config:getMaxActiveSessions'),
  updateMaxActiveSessions: (max) => ipcRenderer.invoke('config:updateMaxActiveSessions', max),

  // Max History Sessions (左侧面板历史会话显示条数)
  getMaxHistorySessions: () => ipcRenderer.invoke('config:getMaxHistorySessions'),
  updateMaxHistorySessions: (max) => ipcRenderer.invoke('config:updateMaxHistorySessions', max),

  // Terminal Settings (终端字体大小等)
  getTerminalSettings: () => ipcRenderer.invoke('config:getTerminalSettings'),
  updateTerminalSettings: (settings) => ipcRenderer.invoke('config:updateTerminalSettings', settings),

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
  // 工程管理（数据库版）
  // ========================================
  // 列表
  getProjects: (includeHidden = false) => ipcRenderer.invoke('project:getAll', includeHidden),
  getHiddenProjects: () => ipcRenderer.invoke('project:getHidden'),
  getProjectById: (projectId) => ipcRenderer.invoke('project:getById', projectId),

  // 创建
  createProject: (projectData) => ipcRenderer.invoke('project:create', projectData),
  openProject: () => ipcRenderer.invoke('project:open'),

  // 修改
  updateProject: ({ projectId, updates }) => ipcRenderer.invoke('project:update', { projectId, updates }),
  duplicateProject: (projectId) => ipcRenderer.invoke('project:duplicate', { projectId }),

  // 删除/隐藏
  hideProject: (projectId) => ipcRenderer.invoke('project:hide', projectId),
  unhideProject: (projectId) => ipcRenderer.invoke('project:unhide', projectId),
  deleteProject: ({ projectId, deleteSessions }) => ipcRenderer.invoke('project:delete', { projectId, deleteSessions }),

  // 状态
  toggleProjectPinned: (projectId) => ipcRenderer.invoke('project:togglePinned', projectId),
  touchProject: (projectId) => ipcRenderer.invoke('project:touch', projectId),

  // 工具
  openFolder: (folderPath) => ipcRenderer.invoke('project:openFolder', folderPath),
  checkPath: (folderPath) => ipcRenderer.invoke('project:checkPath', folderPath),

  // 会话（占位）
  newProjectSession: (projectId) => ipcRenderer.invoke('project:newSession', projectId),
  openProjectSession: ({ projectId, sessionId }) => ipcRenderer.invoke('project:openSession', { projectId, sessionId }),

  // ========================================
  // 旧版 Project 相关（保留兼容）
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
  saveFile: ({ filename, content, ext }) => ipcRenderer.invoke('dialog:saveFile', { filename, content, ext }),

  // ========================================
  // Shell 相关
  // ========================================
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ========================================
  // Window 相关
  // ========================================
  openProfileManager: () => ipcRenderer.invoke('window:openProfileManager'),
  openGlobalSettings: () => ipcRenderer.invoke('window:openGlobalSettings'),
  openAppearanceSettings: () => ipcRenderer.invoke('window:openAppearanceSettings'),
  openProviderManager: () => ipcRenderer.invoke('window:openProviderManager'),
  openSessionManager: (options) => ipcRenderer.invoke('window:openSessionManager', options),

  // ========================================
  // 服务商定义管理
  // ========================================
  listProviders: () => ipcRenderer.invoke('provider:list'),
  getProvider: (id) => ipcRenderer.invoke('provider:get', id),
  addProvider: (definition) => ipcRenderer.invoke('provider:add', definition),
  updateProvider: ({ id, updates }) => ipcRenderer.invoke('provider:update', { id, updates }),
  deleteProvider: (id) => ipcRenderer.invoke('provider:delete', id),

  // ========================================
  // 会话历史管理（数据库版）
  // ========================================
  // 同步
  syncSessions: () => ipcRenderer.invoke('session:sync'),
  forceFullSync: () => ipcRenderer.invoke('session:forceFullSync'),
  getSyncStatus: () => ipcRenderer.invoke('session:getSyncStatus'),
  clearInvalidSessions: () => ipcRenderer.invoke('session:clearInvalid'),

  // 项目和会话
  getSessionProjects: () => ipcRenderer.invoke('session:getProjects'),
  getProjectSessions: (projectId) => ipcRenderer.invoke('session:getProjectSessions', projectId),
  getSessionMessages: ({ sessionId, limit, offset }) => ipcRenderer.invoke('session:getMessages', { sessionId, limit, offset }),

  // 实时会话读取（文件版，用于主页面）
  getFileBasedSessions: (projectPath) => ipcRenderer.invoke('session:getFileBasedSessions', projectPath),

  // 删除历史会话文件（硬删除）
  deleteSessionFile: ({ projectPath, sessionId }) => ipcRenderer.invoke('session:deleteFile', { projectPath, sessionId }),

  // 搜索
  searchSessions: ({ query, projectId, sessionId, limit }) => ipcRenderer.invoke('session:search', { query, projectId, sessionId, limit }),

  // 导出
  exportSession: ({ sessionId, format }) => ipcRenderer.invoke('session:export', { sessionId, format }),

  // 统计
  getSessionStats: () => ipcRenderer.invoke('session:getStats'),

  // ========================================
  // 标签管理（会话级别）
  // ========================================
  createTag: ({ name, color }) => ipcRenderer.invoke('tag:create', { name, color }),
  getAllTags: () => ipcRenderer.invoke('tag:getAll'),
  deleteTag: (tagId) => ipcRenderer.invoke('tag:delete', tagId),
  addTagToSession: ({ sessionId, tagId }) => ipcRenderer.invoke('tag:addToSession', { sessionId, tagId }),
  removeTagFromSession: ({ sessionId, tagId }) => ipcRenderer.invoke('tag:removeFromSession', { sessionId, tagId }),
  getSessionTags: (sessionId) => ipcRenderer.invoke('tag:getSessionTags', sessionId),
  getSessionsByTag: (tagId) => ipcRenderer.invoke('tag:getSessions', tagId),

  // ========================================
  // 标签管理（消息级别）
  // ========================================
  addTagToMessage: ({ messageId, tagId }) => ipcRenderer.invoke('tag:addToMessage', { messageId, tagId }),
  removeTagFromMessage: ({ messageId, tagId }) => ipcRenderer.invoke('tag:removeFromMessage', { messageId, tagId }),
  getMessageTags: (messageId) => ipcRenderer.invoke('tag:getMessageTags', messageId),
  getMessagesByTag: (tagId) => ipcRenderer.invoke('tag:getMessages', tagId),
  getSessionTaggedMessages: (sessionId) => ipcRenderer.invoke('tag:getSessionTaggedMessages', sessionId),

  // ========================================
  // 收藏管理
  // ========================================
  addFavorite: ({ sessionId, note }) => ipcRenderer.invoke('favorite:add', { sessionId, note }),
  removeFavorite: (sessionId) => ipcRenderer.invoke('favorite:remove', sessionId),
  checkFavorite: (sessionId) => ipcRenderer.invoke('favorite:check', sessionId),
  getAllFavorites: () => ipcRenderer.invoke('favorite:getAll'),
  updateFavoriteNote: ({ sessionId, note }) => ipcRenderer.invoke('favorite:updateNote', { sessionId, note }),

  // ========================================
  // Terminal 相关（旧版单终端，保留兼容）
  // ========================================
  startTerminal: (projectPath) => ipcRenderer.invoke('terminal:start', projectPath),
  writeTerminal: (data) => ipcRenderer.send('terminal:write', data),
  resizeTerminal: ({ cols, rows }) => ipcRenderer.send('terminal:resize', { cols, rows }),
  killTerminal: () => ipcRenderer.invoke('terminal:kill'),
  getTerminalStatus: () => ipcRenderer.invoke('terminal:status'),

  // ========================================
  // 活动会话管理（新版多终端支持）
  // ========================================
  // 会话生命周期
  createActiveSession: (options) => ipcRenderer.invoke('activeSession:create', options),
  closeActiveSession: (sessionId) => ipcRenderer.invoke('activeSession:close', sessionId),
  disconnectActiveSession: (sessionId) => ipcRenderer.invoke('activeSession:disconnect', sessionId),
  listActiveSessions: (includeHidden = true) => ipcRenderer.invoke('activeSession:list', includeHidden),
  getActiveSession: (sessionId) => ipcRenderer.invoke('activeSession:get', sessionId),
  getActiveSessionsByProject: (projectId) => ipcRenderer.invoke('activeSession:getByProject', projectId),

  // 终端交互
  writeActiveSession: ({ sessionId, data }) => ipcRenderer.send('activeSession:write', { sessionId, data }),
  resizeActiveSession: ({ sessionId, cols, rows }) => ipcRenderer.send('activeSession:resize', { sessionId, cols, rows }),

  // 会话状态
  focusActiveSession: (sessionId) => ipcRenderer.invoke('activeSession:focus', sessionId),
  getFocusedActiveSession: () => ipcRenderer.invoke('activeSession:getFocused'),
  setActiveSessionVisible: ({ sessionId, visible }) => ipcRenderer.invoke('activeSession:setVisible', { sessionId, visible }),
  getRunningSessionCount: () => ipcRenderer.invoke('activeSession:getRunningCount'),
  getSessionLimits: () => ipcRenderer.invoke('activeSession:getSessionLimits'),
  renameActiveSession: ({ sessionId, newTitle }) => ipcRenderer.invoke('activeSession:rename', { sessionId, newTitle }),

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

  // 活动会话事件
  onSessionData: (callback) => {
    const listener = (event, { sessionId, data }) => callback({ sessionId, data });
    ipcRenderer.on('session:data', listener);
    return () => ipcRenderer.removeListener('session:data', listener);
  },

  onSessionStarted: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('session:started', listener);
    return () => ipcRenderer.removeListener('session:started', listener);
  },

  onSessionExit: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('session:exit', listener);
    return () => ipcRenderer.removeListener('session:exit', listener);
  },

  onSessionError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('session:error', listener);
    return () => ipcRenderer.removeListener('session:error', listener);
  },

  onSessionUpdated: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('session:updated', listener);
    return () => ipcRenderer.removeListener('session:updated', listener);
  },

  // ========================================
  // 设置广播（跨窗口同步）
  // ========================================
  broadcastSettings: (settings) => ipcRenderer.send('settings:broadcast', settings),

  onSettingsChanged: (callback) => {
    const listener = (event, settings) => callback(settings);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },

  // ========================================
  // 会话文件监控
  // ========================================
  watchSessionFiles: (projectPath) => ipcRenderer.invoke('sessionWatcher:watch', projectPath),
  stopWatchingSessionFiles: () => ipcRenderer.invoke('sessionWatcher:stop'),

  onSessionFileChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('session:fileChanged', listener);
    return () => ipcRenderer.removeListener('session:fileChanged', listener);
  }
});

console.log('[Preload] ElectronAPI exposed to renderer successfully');

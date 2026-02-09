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
    document.documentElement.setAttribute('data-locale', initialLocale || 'en-US');
    document.documentElement.setAttribute('lang', initialLocale === 'zh-CN' ? 'zh' : 'en');
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
  
  // Global Settings
  getServiceProviders: () => ipcRenderer.invoke('config:getServiceProviders'),
  getTimeout: () => ipcRenderer.invoke('config:getTimeout'),
  updateTimeout: (timeout) => ipcRenderer.invoke('config:updateTimeout', timeout),

  // Max Active Sessions
  getMaxActiveSessions: () => ipcRenderer.invoke('config:getMaxActiveSessions'),
  updateMaxActiveSessions: (max) => ipcRenderer.invoke('config:updateMaxActiveSessions', max),

  // Max History Sessions (左侧面板历史会话显示条数)
  getMaxHistorySessions: () => ipcRenderer.invoke('config:getMaxHistorySessions'),
  updateMaxHistorySessions: (max) => ipcRenderer.invoke('config:updateMaxHistorySessions', max),

  // Autocompact Pct Override (自动压缩阈值百分比)
  getAutocompactPctOverride: () => ipcRenderer.invoke('config:getAutocompactPctOverride'),
  updateAutocompactPctOverride: (value) => ipcRenderer.invoke('config:updateAutocompactPctOverride', value),

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
  // Dialog 相关
  // ========================================
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectFile: (options) => ipcRenderer.invoke('dialog:selectFile', options),
  selectFiles: (options) => ipcRenderer.invoke('dialog:selectFiles', options),
  saveFile: ({ filename, content, ext }) => ipcRenderer.invoke('dialog:saveFile', { filename, content, ext }),

  // ========================================
  // Shell 相关
  // ========================================
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // ========================================
  // Claude 配置文件
  // ========================================
  getClaudeSettingsPath: () => ipcRenderer.invoke('claude:getSettingsPath'),
  getProjectConfigPath: (projectPath) => ipcRenderer.invoke('claude:getProjectConfigPath', projectPath),

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
  // 快捷命令管理
  // ========================================
  getQuickCommands: () => ipcRenderer.invoke('quickCommands:list'),
  addQuickCommand: (command) => ipcRenderer.invoke('quickCommands:add', command),
  updateQuickCommand: ({ id, name, command, color }) => ipcRenderer.invoke('quickCommands:update', { id, name, command, color }),
  deleteQuickCommand: (id) => ipcRenderer.invoke('quickCommands:delete', id),

  // ========================================
  // Plugin 管理 (Claude Code Plugins)
  // ========================================
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  getPluginDetails: (pluginId) => ipcRenderer.invoke('plugins:details', pluginId),
  setPluginEnabled: (pluginId, enabled) => ipcRenderer.invoke('plugins:setEnabled', pluginId, enabled),
  openPluginsFolder: () => ipcRenderer.invoke('plugins:openFolder'),
  openInstalledPluginsJson: () => ipcRenderer.invoke('plugins:openInstalledJson'),
  openSettingsJson: () => ipcRenderer.invoke('plugins:openSettingsJson'),

  // ========================================
  // Skills 管理 (来自插件和项目级)
  // ========================================
  listSkillsGlobal: () => ipcRenderer.invoke('skills:listGlobal'),
  listSkillsProject: (projectPath) => ipcRenderer.invoke('skills:listProject', projectPath),
  listSkillsAll: (projectPath) => ipcRenderer.invoke('skills:listAll', projectPath),
  deleteSkill: (params) => ipcRenderer.invoke('skills:delete', params),
  copySkill: (params) => ipcRenderer.invoke('skills:copy', params),
  getSkillRawContent: (params) => ipcRenderer.invoke('skills:getRawContent', params),
  createSkillRaw: (params) => ipcRenderer.invoke('skills:createRaw', params),
  updateSkillRaw: (params) => ipcRenderer.invoke('skills:updateRaw', params),
  openSkillsFolder: (params) => ipcRenderer.invoke('skills:openFolder', params),
  // 导入导出
  validateSkillImport: (sourcePath) => ipcRenderer.invoke('skills:validateImport', sourcePath),
  checkSkillConflicts: (params) => ipcRenderer.invoke('skills:checkConflicts', params),
  importSkills: (params) => ipcRenderer.invoke('skills:import', params),
  exportSkill: (params) => ipcRenderer.invoke('skills:export', params),
  exportSkillsBatch: (params) => ipcRenderer.invoke('skills:exportBatch', params),

  // ========================================
  // Agents 管理 (三级: 用户全局/项目级/插件)
  // ========================================
  listAgentsUser: () => ipcRenderer.invoke('agents:listUser'),
  listAgentsProject: (projectPath) => ipcRenderer.invoke('agents:listProject', projectPath),
  listAgentsPlugin: () => ipcRenderer.invoke('agents:listPlugin'),
  listAgentsAll: (projectPath) => ipcRenderer.invoke('agents:listAll', projectPath),
  getAgentRawContent: (params) => ipcRenderer.invoke('agents:getRawContent', params),
  createAgentRaw: (params) => ipcRenderer.invoke('agents:createRaw', params),
  updateAgentRaw: (params) => ipcRenderer.invoke('agents:updateRaw', params),
  deleteAgent: (params) => ipcRenderer.invoke('agents:delete', params),
  copyAgent: (params) => ipcRenderer.invoke('agents:copy', params),
  renameAgent: (params) => ipcRenderer.invoke('agents:rename', params),
  openAgentsFolder: (params) => ipcRenderer.invoke('agents:openFolder', params),
  // 导入导出
  validateAgentImport: (sourcePath) => ipcRenderer.invoke('agents:validateImport', sourcePath),
  checkAgentConflicts: (params) => ipcRenderer.invoke('agents:checkConflicts', params),
  importAgents: (params) => ipcRenderer.invoke('agents:import', params),
  exportAgent: (params) => ipcRenderer.invoke('agents:export', params),
  exportAgentsBatch: (params) => ipcRenderer.invoke('agents:exportBatch', params),

  // ========================================
  // Hooks 管理 (来自 settings.json、插件和项目级，自动执行)
  // ========================================
  listHooksGlobal: () => ipcRenderer.invoke('hooks:listGlobal'),
  listHooksProject: (projectPath) => ipcRenderer.invoke('hooks:listProject', projectPath),
  listHooksAll: (projectPath) => ipcRenderer.invoke('hooks:listAll', projectPath),
  getHooksSchema: () => ipcRenderer.invoke('hooks:getSchema'),
  createHook: (params) => ipcRenderer.invoke('hooks:create', params),
  updateHook: (params) => ipcRenderer.invoke('hooks:update', params),
  deleteHook: (params) => ipcRenderer.invoke('hooks:delete', params),
  copyHook: (params) => ipcRenderer.invoke('hooks:copy', params),
  getHooksJson: (params) => ipcRenderer.invoke('hooks:getJson', params),
  saveHooksJson: (params) => ipcRenderer.invoke('hooks:saveJson', params),

  // ========================================
  // MCP 管理 (四级: User/Local/Project/Plugin)
  // ========================================
  listMcpAll: (projectPath) => ipcRenderer.invoke('mcp:listAll', projectPath),
  listMcpUser: () => ipcRenderer.invoke('mcp:listUser'),
  listMcpLocal: (projectPath) => ipcRenderer.invoke('mcp:listLocal', projectPath),
  listMcpProject: (projectPath) => ipcRenderer.invoke('mcp:listProject', projectPath),
  listMcpPlugin: () => ipcRenderer.invoke('mcp:listPlugin'),
  createMcp: (params) => ipcRenderer.invoke('mcp:create', params),
  updateMcp: (params) => ipcRenderer.invoke('mcp:update', params),
  deleteMcp: (params) => ipcRenderer.invoke('mcp:delete', params),

  // ========================================
  // Claude Code Settings 管理 (permissions, env)
  // ========================================
  getClaudeSettings: (projectPath) => ipcRenderer.invoke('settings:getAll', projectPath),
  getClaudePermissions: (params) => ipcRenderer.invoke('settings:getPermissions', params),
  addClaudePermission: (params) => ipcRenderer.invoke('settings:addPermission', params),
  updateClaudePermission: (params) => ipcRenderer.invoke('settings:updatePermission', params),
  removeClaudePermission: (params) => ipcRenderer.invoke('settings:removePermission', params),
  getClaudeEnv: (params) => ipcRenderer.invoke('settings:getEnv', params),
  setClaudeEnv: (params) => ipcRenderer.invoke('settings:setEnv', params),
  removeClaudeEnv: (params) => ipcRenderer.invoke('settings:removeEnv', params),
  getClaudeSettingsRaw: (params) => ipcRenderer.invoke('settings:getRaw', params),
  saveClaudeSettingsRaw: (params) => ipcRenderer.invoke('settings:saveRaw', params),

  // ========================================
  // 文件操作
  // ========================================
  openFileInEditor: (filePath) => ipcRenderer.invoke('file:openInEditor', filePath),
  readJsonFile: (filePath) => ipcRenderer.invoke('file:readJson', filePath),
  writeJsonFile: (filePath, data) => ipcRenderer.invoke('file:writeJson', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),

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

  // ========================================
  // 会话面板管理（数据库 + 文件同步）
  // ========================================
  // 从数据库获取项目会话（用于左侧面板）- 通过 projectPath 查询
  getProjectSessionsFromDb: (projectPath) => ipcRenderer.invoke('session:getProjectSessionsFromDb', projectPath),

  // 同步项目会话到数据库（从文件系统增量同步）
  syncProjectSessions: ({ projectPath, projectName }) => ipcRenderer.invoke('session:syncProjectSessions', { projectPath, projectName }),

  // 更新会话标题（支持通过 sessionId 或 sessionUuid 更新）
  updateSessionTitle: ({ sessionId, sessionUuid, title }) => ipcRenderer.invoke('session:updateTitle', { sessionId, sessionUuid, title }),

  // 删除会话（数据库 + 文件）
  deleteSessionWithFile: ({ sessionId, projectPath, sessionUuid }) =>
    ipcRenderer.invoke('session:deleteWithFile', { sessionId, projectPath, sessionUuid }),

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
  // 提示词管理
  // ========================================
  listPrompts: (options) => ipcRenderer.invoke('prompts:list', options),
  getPrompt: (promptId) => ipcRenderer.invoke('prompts:get', promptId),
  createPrompt: (promptData) => ipcRenderer.invoke('prompts:create', promptData),
  updatePrompt: ({ promptId, updates }) => ipcRenderer.invoke('prompts:update', promptId, updates),
  deletePrompt: (promptId) => ipcRenderer.invoke('prompts:delete', promptId),
  incrementPromptUsage: (promptId) => ipcRenderer.invoke('prompts:incrementUsage', promptId),
  togglePromptFavorite: (promptId) => ipcRenderer.invoke('prompts:toggleFavorite', promptId),

  // 提示词标签
  listPromptTags: () => ipcRenderer.invoke('promptTags:list'),
  createPromptTag: ({ name, color }) => ipcRenderer.invoke('promptTags:create', name, color),
  updatePromptTag: ({ tagId, updates }) => ipcRenderer.invoke('promptTags:update', tagId, updates),
  deletePromptTag: (tagId) => ipcRenderer.invoke('promptTags:delete', tagId),
  addTagToPrompt: ({ promptId, tagId }) => ipcRenderer.invoke('prompts:addTag', promptId, tagId),
  removeTagFromPrompt: ({ promptId, tagId }) => ipcRenderer.invoke('prompts:removeTag', promptId, tagId),

  // ========================================
  // 收藏管理
  // ========================================
  addFavorite: ({ sessionId, note }) => ipcRenderer.invoke('favorite:add', { sessionId, note }),
  removeFavorite: (sessionId) => ipcRenderer.invoke('favorite:remove', sessionId),
  checkFavorite: (sessionId) => ipcRenderer.invoke('favorite:check', sessionId),
  getAllFavorites: () => ipcRenderer.invoke('favorite:getAll'),
  updateFavoriteNote: ({ sessionId, note }) => ipcRenderer.invoke('favorite:updateNote', { sessionId, note }),

  // ========================================
  // 消息队列管理
  // ========================================
  getQueue: (sessionUuid) => ipcRenderer.invoke('queue:list', sessionUuid),
  addToQueue: ({ sessionUuid, content }) => ipcRenderer.invoke('queue:add', { sessionUuid, content }),
  updateQueueItem: ({ id, content }) => ipcRenderer.invoke('queue:update', { id, content }),
  deleteQueueItem: (id) => ipcRenderer.invoke('queue:delete', id),
  clearQueue: (sessionUuid) => ipcRenderer.invoke('queue:clear', sessionUuid),
  swapQueueOrder: ({ id1, id2 }) => ipcRenderer.invoke('queue:swap', { id1, id2 }),

  // ========================================
  // AI 助手
  // ========================================
  aiChat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  aiStream: (messages) => ipcRenderer.invoke('ai:stream', messages),
  aiCompact: (messages) => ipcRenderer.invoke('ai:compact', messages),
  aiCountTokens: (messages) => ipcRenderer.invoke('ai:countTokens', messages),
  aiGetConfig: () => ipcRenderer.invoke('aiAssistant:getConfig'),
  aiUpdateConfig: (config) => ipcRenderer.invoke('aiAssistant:updateConfig', config),

  // AI 流式响应事件
  onAIStreamChunk: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('ai:stream-chunk', listener);
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener);
  },
  onAIStreamEnd: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('ai:stream-end', listener);
    return () => ipcRenderer.removeListener('ai:stream-end', listener);
  },
  onAIStreamError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('ai:stream-error', listener);
    return () => ipcRenderer.removeListener('ai:stream-error', listener);
  },

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
  watchSessionFiles: ({ projectPath, projectId }) => ipcRenderer.invoke('sessionWatcher:watch', { projectPath, projectId }),
  stopWatchingSessionFiles: () => ipcRenderer.invoke('sessionWatcher:stop'),

  onSessionFileChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('session:fileChanged', listener);
    return () => ipcRenderer.removeListener('session:fileChanged', listener);
  },

  // ========================================
  // Agent 会话管理
  // ========================================
  // 生命周期
  createAgentSession: (options) => ipcRenderer.invoke('agent:create', options),
  sendAgentMessage: ({ sessionId, message, modelTier, maxTurns }) => ipcRenderer.invoke('agent:sendMessage', { sessionId, message, modelTier, maxTurns }),
  cancelAgentGeneration: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
  closeAgentSession: (sessionId) => ipcRenderer.invoke('agent:close', sessionId),
  reopenAgentSession: (sessionId) => ipcRenderer.invoke('agent:reopen', sessionId),
  getAgentSession: (sessionId) => ipcRenderer.invoke('agent:get', sessionId),
  listAgentSessions: () => ipcRenderer.invoke('agent:list'),
  renameAgentSession: ({ sessionId, title }) => ipcRenderer.invoke('agent:rename', { sessionId, title }),

  // 消息历史
  getAgentMessages: (sessionId) => ipcRenderer.invoke('agent:getMessages', sessionId),
  deleteAgentConversation: (sessionId) => ipcRenderer.invoke('agent:deleteConversation', sessionId),
  compactAgentConversation: (sessionId) => ipcRenderer.invoke('agent:compact', sessionId),

  // Streaming Input 控制方法
  setAgentModel: (sessionId, model) => ipcRenderer.invoke('agent:setModel', { sessionId, model }),
  getAgentSupportedModels: (sessionId) => ipcRenderer.invoke('agent:getSupportedModels', sessionId),
  getAgentSupportedCommands: (sessionId) => ipcRenderer.invoke('agent:getSupportedCommands', sessionId),
  getAgentAccountInfo: (sessionId) => ipcRenderer.invoke('agent:getAccountInfo', sessionId),
  getAgentMcpServerStatus: (sessionId) => ipcRenderer.invoke('agent:getMcpServerStatus', sessionId),
  getAgentInitResult: (sessionId) => ipcRenderer.invoke('agent:getInitResult', sessionId),

  // 成果目录
  getAgentOutputDir: (sessionId) => ipcRenderer.invoke('agent:getOutputDir', sessionId),
  openAgentOutputDir: (sessionId) => ipcRenderer.invoke('agent:openOutputDir', sessionId),
  listAgentOutputFiles: (sessionId) => ipcRenderer.invoke('agent:listOutputFiles', sessionId),

  // 文件浏览（AgentRightPanel）
  listAgentDir: ({ sessionId, relativePath, showHidden }) =>
    ipcRenderer.invoke('agent:listDir', { sessionId, relativePath, showHidden }),
  readAgentFile: ({ sessionId, relativePath }) =>
    ipcRenderer.invoke('agent:readFile', { sessionId, relativePath }),
  openAgentFile: ({ sessionId, relativePath }) =>
    ipcRenderer.invoke('agent:openFile', { sessionId, relativePath }),

  // Agent 事件监听（main → renderer 推送）
  // 使用工厂模式精简重复的监听器注册
  ...Object.fromEntries(
    [
      ['onAgentInit', 'agent:init'],
      ['onAgentMessage', 'agent:message'],
      ['onAgentStream', 'agent:stream'],
      ['onAgentResult', 'agent:result'],
      ['onAgentError', 'agent:error'],
      ['onAgentStatusChange', 'agent:statusChange'],
      ['onAgentToolProgress', 'agent:toolProgress'],
      ['onAgentSystemStatus', 'agent:systemStatus'],
      ['onAgentRenamed', 'agent:renamed'],
      ['onAgentCompacted', 'agent:compacted'],
      ['onAgentUsage', 'agent:usage'],
      ['onAgentAllSessionsClosed', 'agent:allSessionsClosed']
    ].map(([apiName, channel]) => [
      apiName,
      (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
      }
    ])
  )
});

console.log('[Preload] ElectronAPI exposed to renderer successfully');

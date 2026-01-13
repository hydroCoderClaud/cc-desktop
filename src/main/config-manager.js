/**
 * 配置管理器
 * 管理应用配置和最近打开的项目列表
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const APIClient = require('./api/api-client');
const { DEFAULT_GLOBAL_MODELS, TIMEOUTS } = require('./utils/constants');

class ConfigManager {
  constructor() {
    // 配置文件路径
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'config.json');

    // 默认配置
    this.defaultConfig = {
      recentProjects: [],
      
      // 多 API 配置支持
      apiProfiles: [],
      defaultProfileId: null,  // 默认 Profile（启动时推荐使用）

      // 全局模型配置（用于官方/中转服务）
      globalModels: { ...DEFAULT_GLOBAL_MODELS },

      // 超时配置
      timeout: {
        test: TIMEOUTS.API_TEST,        // 测试连接超时
        request: TIMEOUTS.API_REQUEST   // 实际请求超时
      },

      settings: {
        theme: 'light',

        // 旧版 API 配置（兼容性，将在首次加载时迁移到 apiProfiles）
        api: {
          authToken: '',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-5-20250929',
          useProxy: false,
          httpsProxy: '',
          httpProxy: ''
        },

        // 旧版兼容（已废弃）
        claudeApiKey: '',
        anthropicApiKey: '',

        // 终端设置
        terminal: {
          fontSize: 14,
          fontFamily: 'Consolas, monospace'
        },

        maxRecentProjects: 10
      }
    };

    // 加载配置
    this.config = this.load();
  }

  /**
   * 加载配置文件
   */
  load() {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }

      // 读取配置文件
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const config = JSON.parse(data);

        // 深度合并配置（处理新增的配置项和嵌套对象）
        const mergedConfig = this.deepMerge(this.defaultConfig, config);
        
        // 迁移旧的单 API 配置到 apiProfiles
        let migratedConfig = this.migrateToProfiles(mergedConfig);
        
        // 迁移 Profile 结构（category/model → serviceProvider/selectedModelTier）
        migratedConfig = this.migrateProfileStructure(migratedConfig);
        
        // 如果发生了迁移，保存新配置
        if (migratedConfig !== mergedConfig) {
          this.save(migratedConfig);
        }
        
        return migratedConfig;
      }

      // 配置文件不存在，使用默认配置
      this.save(this.defaultConfig);
      return this.defaultConfig;
    } catch (error) {
      console.error('Failed to load config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * 保存配置到文件
   */
  save(config = this.config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.config = config;
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  }

  /**
   * 获取完整配置
   */
  getConfig() {
    return this.config;
  }

  /**
   * 获取全局模型配置
   */
  getGlobalModels() {
    return this.config.globalModels || { ...DEFAULT_GLOBAL_MODELS };
  }

  /**
   * 更新全局模型配置
   */
  updateGlobalModels(models) {
    this.config.globalModels = {
      ...this.config.globalModels,
      ...models
    };
    return this.save();
  }

  /**
   * 获取超时配置
   */
  getTimeout() {
    return this.config.timeout || {
      test: TIMEOUTS.API_TEST,
      request: TIMEOUTS.API_REQUEST
    };
  }

  /**
   * 更新超时配置
   */
  updateTimeout(timeout) {
    this.config.timeout = {
      ...this.config.timeout,
      ...timeout
    };
    return this.save();
  }

  /**
   * 更新配置
   */
  updateConfig(updates) {
    this.config = {
      ...this.config,
      ...updates
    };
    return this.save();
  }

  /**
   * 更新设置
   */
  updateSettings(settings) {
    this.config.settings = {
      ...this.config.settings,
      ...settings
    };
    return this.save();
  }

  /**
   * 添加最近打开的项目
   */
  addRecentProject(name, projectPath) {
    // 检查是否已存在
    const existingIndex = this.config.recentProjects.findIndex(
      p => p.path === projectPath
    );

    let project;
    if (existingIndex !== -1) {
      // 已存在，更新时间并移到最前面
      project = this.config.recentProjects[existingIndex];
      project.lastOpened = new Date().toISOString();
      this.config.recentProjects.splice(existingIndex, 1);
    } else {
      // 新项目
      project = {
        id: uuidv4(),
        name: name || path.basename(projectPath),
        path: projectPath,
        lastOpened: new Date().toISOString(),
        icon: '📁',
        pinned: false
      };
    }

    // 添加到列表开头
    this.config.recentProjects.unshift(project);

    // 限制数量
    const maxProjects = this.config.settings.maxRecentProjects || 10;
    this.config.recentProjects = this.config.recentProjects.slice(0, maxProjects);

    this.save();
    return project;
  }

  /**
   * 移除项目
   */
  removeRecentProject(projectId) {
    this.config.recentProjects = this.config.recentProjects.filter(
      p => p.id !== projectId
    );
    return this.save();
  }

  /**
   * 重命名项目
   */
  renameProject(projectId, newName) {
    const project = this.config.recentProjects.find(p => p.id === projectId);
    if (project) {
      project.name = newName;
      return this.save();
    }
    return false;
  }

  /**
   * 切换项目固定状态
   */
  togglePinProject(projectId) {
    const project = this.config.recentProjects.find(p => p.id === projectId);
    if (project) {
      project.pinned = !project.pinned;

      // 重新排序：固定的在前面
      this.config.recentProjects.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.lastOpened) - new Date(a.lastOpened);
      });

      return this.save();
    }
    return false;
  }

  /**
   * 获取最近项目列表
   */
  getRecentProjects() {
    return this.config.recentProjects;
  }

  /**
   * 深度合并对象（用于嵌套配置）
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          // 递归合并嵌套对象
          result[key] = this.deepMerge(target[key] || {}, source[key]);
        } else if (Array.isArray(source[key]) && source[key].length === 0 && Array.isArray(target[key]) && target[key].length > 0) {
          // 如果 source 中的数组为空，但 target 中的数组有值，保留 target 的值（避免覆盖默认配置）
          result[key] = target[key];
        } else {
          // 直接覆盖值
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 获取 API 配置（处理兼容性）
   */
  /**
   * 获取 API 配置（返回当前 Profile 的配置）
   */
  /**
   * 获取 API 配置（返回当前 Profile 的配置）
   */
  getAPIConfig() {
    // 尝试从默认 Profile 获取
    const defaultProfile = this.getDefaultProfile();
    
    if (defaultProfile) {
      return {
        authToken: defaultProfile.authToken,
        authType: defaultProfile.authType || 'api_key',  // 默认 api_key（官方标准）
        baseUrl: defaultProfile.baseUrl,
        serviceProvider: defaultProfile.serviceProvider || 'official',
        selectedModelTier: defaultProfile.selectedModelTier || 'sonnet',
        modelMapping: defaultProfile.modelMapping || null,
        requestTimeout: defaultProfile.requestTimeout || this.getTimeout().request,
        disableNonessentialTraffic: defaultProfile.disableNonessentialTraffic !== false,
        useProxy: defaultProfile.useProxy,
        httpsProxy: defaultProfile.httpsProxy,
        httpProxy: defaultProfile.httpProxy
      };
    }

    // 回退到旧的 settings.api（兼容性）
    const settings = this.config.settings;
    const authToken = settings.api?.authToken
      || settings.anthropicApiKey
      || settings.claudeApiKey
      || '';

    return {
      authToken,
      authType: 'api_key',  // 旧配置默认使用 api_key（官方标准）
      baseUrl: settings.api?.baseUrl || 'https://api.anthropic.com',
      model: settings.api?.model || 'claude-sonnet-4-5-20250929',
      useProxy: settings.api?.useProxy || false,
      httpsProxy: settings.api?.httpsProxy || '',
      httpProxy: settings.api?.httpProxy || ''
    };
  }

  /**
   * 更新 API 配置
   */
  /**
   * 更新 API 配置（更新默认 Profile）
   */
  updateAPIConfig(apiConfig) {
    const defaultProfile = this.getDefaultProfile();
    
    if (defaultProfile) {
      // 更新默认 Profile
      return this.updateAPIProfile(defaultProfile.id, apiConfig);
    }

    // 回退到旧的方式（兼容性）
    if (!this.config.settings.api) {
      this.config.settings.api = {};
    }

    this.config.settings.api = {
      ...this.config.settings.api,
      ...apiConfig
    };

    return this.save();
  }

  /**
   * 验证 API 配置是否完整
   */
  validateAPIConfig() {
    const apiConfig = this.getAPIConfig();
    const errors = [];

    if (!apiConfig.authToken || apiConfig.authToken.trim() === '') {
      errors.push('API 认证令牌未配置');
    }

    if (!apiConfig.baseUrl || apiConfig.baseUrl.trim() === '') {
      errors.push('API 基础 URL 未配置');
    }

    if (apiConfig.useProxy) {
      if (!apiConfig.httpsProxy && !apiConfig.httpProxy) {
        errors.push('已启用代理但未配置代理地址');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      config: apiConfig
    };
  }



  /**
   * 迁移旧的单 API 配置到 apiProfiles 数组

  /**
   * 迁移 Profile 结构（从旧的 category/model/customModels 到新的 serviceProvider/selectedModelTier/modelMapping）
   * @param {Object} config - 配置对象
   * @returns {Object} - 迁移后的配置
   */
  migrateProfileStructure(config) {
    if (!config.apiProfiles || config.apiProfiles.length === 0) {
      return config;
    }

    let migrated = false;

    config.apiProfiles = config.apiProfiles.map(profile => {
      // 检查是否需要迁移（是否存在旧字段）
      const needsMigration = profile.category !== undefined || 
                            profile.model !== undefined || 
                            profile.customModels !== undefined;

      if (!needsMigration) {
        return profile;
      }

      console.log(`[ConfigManager] Migrating profile structure for: ${profile.name}`);
      migrated = true;

      // 1. 迁移 category → serviceProvider
      if (profile.category !== undefined && profile.serviceProvider === undefined) {
        profile.serviceProvider = profile.category;
        delete profile.category;
      }

      // 2. 迁移 model → selectedModelTier
      if (profile.model !== undefined && profile.selectedModelTier === undefined) {
        // 根据模型名称判断等级
        const modelName = profile.model.toLowerCase();
        if (modelName.includes('opus')) {
          profile.selectedModelTier = 'opus';
        } else if (modelName.includes('haiku')) {
          profile.selectedModelTier = 'haiku';
        } else {
          profile.selectedModelTier = 'sonnet';  // 默认 Sonnet
        }
        delete profile.model;
      }

      // 3. 删除 customModels
      if (profile.customModels !== undefined) {
        delete profile.customModels;
      }

      // 4. 确保新字段存在
      if (profile.modelMapping === undefined) {
        profile.modelMapping = null;
      }
      if (profile.requestTimeout === undefined) {
        // Use global timeout as default
        const globalTimeout = this.getTimeout();
        profile.requestTimeout = globalTimeout.request;
      }
      if (profile.disableNonessentialTraffic === undefined) {
        profile.disableNonessentialTraffic = true;
      }

      return profile;
    });

    // 5. 删除全局 customModels 配置（如果存在）
    if (config.customModels !== undefined) {
      console.log('[ConfigManager] Removing global customModels field');
      delete config.customModels;
      migrated = true;
    }

    // 6. 确保全局配置存在
    if (config.globalModels === undefined) {
      config.globalModels = { ...DEFAULT_GLOBAL_MODELS };
      migrated = true;
    }

    if (config.timeout === undefined) {
      config.timeout = {
        test: TIMEOUTS.API_TEST,
        request: TIMEOUTS.API_REQUEST
      };
      migrated = true;
    }

    if (migrated) {
      console.log('[ConfigManager] Profile structure migration completed');
    }

    return config;
  }

  /**
   * 迁移旧的单 API 配置到 apiProfiles
   * @param {Object} config - 配置对象
   * @returns {Object} - 迁移后的配置
   */
  migrateToProfiles(config) {
    // 如果已经有 apiProfiles 且不为空，不需要迁移
    if (config.apiProfiles && config.apiProfiles.length > 0) {
      return config;
    }

    // 检查是否有旧的 API 配置
    const oldApi = config.settings?.api;
    const hasOldConfig = oldApi && (
      oldApi.authToken || 
      config.settings?.anthropicApiKey || 
      config.settings?.claudeApiKey
    );

    if (!hasOldConfig) {
      // 没有旧配置，返回原配置
      return config;
    }

    console.log('[ConfigManager] Migrating old API config to profiles...');

    // 创建默认 Profile
    const authToken = oldApi.authToken 
      || config.settings.anthropicApiKey 
      || config.settings.claudeApiKey 
      || '';

    const defaultProfile = {
      id: uuidv4(),
      name: '默认配置',
      authToken: authToken,
      authType: 'api_key',
      serviceProvider: 'official',
      description: '',
      baseUrl: oldApi.baseUrl || 'https://api.anthropic.com',
      selectedModelTier: 'sonnet',  // Default to Sonnet
      modelMapping: null,  // Not needed for official service
      requestTimeout: TIMEOUTS.API_REQUEST,
      disableNonessentialTraffic: true,
      useProxy: oldApi.useProxy || false,
      httpsProxy: oldApi.httpsProxy || '',
      httpProxy: oldApi.httpProxy || '',
      isDefault: true,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      icon: '🟣'
    };

    // 更新配置
    config.apiProfiles = [defaultProfile];
    config.defaultProfileId = defaultProfile.id;  // 改为 defaultProfileId

    // 清理旧配置（可选，保留以便降级）
    // delete config.settings.api;
    // delete config.settings.anthropicApiKey;
    // delete config.settings.claudeApiKey;

    console.log('[ConfigManager] Migration completed. Created default profile:', defaultProfile.id);

    return config;
  }

  /**
   * 获取所有 API Profiles
   */
  getAPIProfiles() {
    return this.config.apiProfiles || [];
  }

  /**
   * 获取指定 Profile
   */
  getAPIProfile(profileId) {
    return this.config.apiProfiles?.find(p => p.id === profileId) || null;
  }

  /**
   * 添加新 Profile
   */
  /**
   * 添加新 Profile
   */
  addAPIProfile(profileData) {
    if (!this.config.apiProfiles) {
      this.config.apiProfiles = [];
    }

    // Get global timeout as default value
    const globalTimeout = this.getTimeout();

    const newProfile = {
      id: uuidv4(),
      name: profileData.name || 'New Profile',
      authToken: profileData.authToken || '',
      authType: profileData.authType || 'api_key',
      serviceProvider: profileData.serviceProvider || 'official',  // 使用新字段名
      description: profileData.description || '',
      baseUrl: profileData.baseUrl || 'https://api.anthropic.com',
      selectedModelTier: profileData.selectedModelTier || 'sonnet',  // 使用新字段名
      modelMapping: profileData.modelMapping || null,  // 使用新字段名
      requestTimeout: profileData.requestTimeout || globalTimeout.request,
      disableNonessentialTraffic: profileData.disableNonessentialTraffic !== false,
      useProxy: profileData.useProxy || false,
      httpsProxy: profileData.httpsProxy || '',
      httpProxy: profileData.httpProxy || '',
      isDefault: false,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      icon: profileData.icon || '🔵'
    };

    // 如果是第一个 Profile，自动设为默认
    if (this.config.apiProfiles.length === 0) {
      newProfile.isDefault = true;
      this.config.defaultProfileId = newProfile.id;
    }

    this.config.apiProfiles.push(newProfile);
    this.save();

    return newProfile;
  }

  /**
   * 更新 Profile
   */
  updateAPIProfile(profileId, updates) {
    const profile = this.getAPIProfile(profileId);
    if (!profile) {
      return false;
    }

    // 更新字段（不允许通过此方法修改 isDefault）
    const { isDefault, ...safeUpdates } = updates;
    Object.assign(profile, safeUpdates);
    profile.lastUsed = new Date().toISOString();

    return this.save();
  }

  /**
   * 删除 Profile
   */
  deleteAPIProfile(profileId) {
    const index = this.config.apiProfiles?.findIndex(p => p.id === profileId);
    
    if (index === -1 || index === undefined) {
      return false;
    }

    // 先检查要删除的是否是默认配置
    const profileToDelete = this.config.apiProfiles[index];
    const wasDefault = profileToDelete.isDefault || this.config.defaultProfileId === profileId;

    // 删除配置
    this.config.apiProfiles.splice(index, 1);

    // 如果删除的是默认配置，需要设置新的默认配置
    if (wasDefault && this.config.apiProfiles.length > 0) {
      this.config.apiProfiles[0].isDefault = true;
      this.config.defaultProfileId = this.config.apiProfiles[0].id;
    } else if (this.config.apiProfiles.length === 0) {
      // 如果没有配置了，清空 defaultProfileId
      this.config.defaultProfileId = null;
    }

    return this.save();
  }

  /**
   * 设置默认 Profile
   */
  setDefaultProfile(profileId) {
    const profile = this.getAPIProfile(profileId);
    if (!profile) {
      return false;
    }

    // 取消所有 Profile 的默认状态
    this.config.apiProfiles.forEach(p => p.isDefault = false);
    
    // 设置新的默认
    profile.isDefault = true;
    this.config.defaultProfileId = profileId;

    return this.save();
  }

  /**
   * 获取默认 Profile（用于启动时推荐）
   */
  getDefaultProfile() {
    if (!this.config.defaultProfileId) {
      // 如果没有设置默认 Profile，返回标记为默认的或第一个
      const defaultProfile = this.config.apiProfiles?.find(p => p.isDefault);
      if (defaultProfile) {
        this.config.defaultProfileId = defaultProfile.id;
        this.save();
        return defaultProfile;
      }
      
      if (this.config.apiProfiles && this.config.apiProfiles.length > 0) {
        this.config.defaultProfileId = this.config.apiProfiles[0].id;
        this.config.apiProfiles[0].isDefault = true;
        this.save();
        return this.config.apiProfiles[0];
      }
      
      return null;
    }

    const profile = this.getAPIProfile(this.config.defaultProfileId);
    
    // 如果默认 Profile 不存在，回退到标记为默认的或第一个
    if (!profile) {
      const fallback = this.config.apiProfiles?.find(p => p.isDefault) 
        || this.config.apiProfiles?.[0];
      
      if (fallback) {
        this.config.defaultProfileId = fallback.id;
        this.save();
        return fallback;
      }
      
      return null;
    }

    return profile;
  }

  /**
   * 获取默认 Profile ID
   */
  getDefaultProfileId() {
    return this.config.defaultProfileId;
  }

  /**
   * 获取配置文件路径（用于用户手动编辑）
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * 为指定 Profile 添加自定义模型
   */
  addCustomModel(profileId, model) {
    if (!profileId) {
      console.error('[ConfigManager] addCustomModel: profileId is required');
      return false;
    }
    
    const profile = this.getAPIProfile(profileId);
    if (!profile) {
      console.error('[ConfigManager] addCustomModel: profile not found:', profileId);
      return false;
    }
    
    if (!profile.customModels) {
      profile.customModels = [];
    }
    profile.customModels.push(model);
    return this.save();
  }

  /**
   * 为指定 Profile 删除自定义模型
   */
  deleteCustomModel(profileId, modelId) {
    if (!profileId) {
      console.error('[ConfigManager] deleteCustomModel: profileId is required');
      return false;
    }
    
    const profile = this.getAPIProfile(profileId);
    if (!profile) {
      console.error('[ConfigManager] deleteCustomModel: profile not found:', profileId);
      return false;
    }
    
    if (!profile.customModels) {
      return false;
    }
    const index = profile.customModels.findIndex(m => m.id === modelId);
    if (index !== -1) {
      profile.customModels.splice(index, 1);
      return this.save();
    }
    return false;
  }

  /**
   * 为指定 Profile 更新自定义模型
   */
  updateCustomModel(profileId, modelId, updates) {
    if (!profileId) {
      console.error('[ConfigManager] updateCustomModel: profileId is required');
      return false;
    }
    
    const profile = this.getAPIProfile(profileId);
    if (!profile) {
      console.error('[ConfigManager] updateCustomModel: profile not found:', profileId);
      return false;
    }
    
    if (!profile.customModels) {
      return false;
    }
    const model = profile.customModels.find(m => m.id === modelId);
    if (model) {
      Object.assign(model, updates);
      return this.save();
    }
    return false;
  }

  /**
   * 测试 API 连接
   */
  async testAPIConnection(apiConfig) {
    console.log('[API Test] ========== Starting new connection test ==========');
    console.log('[API Test] Config:', JSON.stringify({
      baseUrl: apiConfig.baseUrl,
      authType: apiConfig.authType,
      model: apiConfig.model,
      useProxy: apiConfig.useProxy,
      httpsProxy: apiConfig.httpsProxy
    }, null, 2));
    
    const https = require('https');
    const { URL } = require('url');

    return new Promise((resolve) => {
      let isResolved = false;
      let globalTimer = null;
      let request = null;
      
      // 统一的 resolve 函数，确保只调用一次
      const safeResolve = (result) => {
        if (isResolved) {
          console.warn('[API Test] Multiple resolve attempts detected, ignored');
          return;
        }
        isResolved = true;
        
        // 清理定时器
        if (globalTimer) {
          clearTimeout(globalTimer);
          globalTimer = null;
        }
        
        // 销毁请求
        if (request) {
          try {
            request.destroy();
          } catch (e) {
            // 忽略销毁错误
          }
        }
        
        console.log('[API Test] Test completed, result:', result.success ? 'SUCCESS' : 'FAILED');
        console.log('[API Test] ========== Connection test ended ==========\n');
        resolve(result);
      };
      
      // Use global timeout configuration for connection test
      const globalTimeout = this.getTimeout();
      const testTimeoutMs = globalTimeout.test || TIMEOUTS.API_TEST;
      const testTimeoutSec = testTimeoutMs / 1000;
      
      console.log(`[API Test] Using test timeout: ${testTimeoutSec}s`);
      
      globalTimer = setTimeout(() => {
        console.error(`[API Test] Global timeout (${testTimeoutSec}s)`);
        safeResolve({ success: false, message: `连接超时（${testTimeoutSec}秒无响应）` });
      }, testTimeoutMs);
      
      try {
        // 1. 构造完整 URL
        let baseUrl = apiConfig.baseUrl || 'https://api.anthropic.com';
        baseUrl = baseUrl.trim();
        if (!baseUrl.endsWith('/')) {
          baseUrl += '/';
        }
        const fullUrl = baseUrl + 'v1/messages';
        
        console.log('[API Test] Full URL:', fullUrl);
        
        const url = new URL(fullUrl);
        
        console.log('[API Test] - hostname:', url.hostname);
        console.log('[API Test] - port:', url.port || 443);
        console.log('[API Test] - pathname:', url.pathname);
        
        // 2. Build auth header
        const authHeader = apiConfig.authType === 'auth_token' 
          ? { 'Authorization': `Bearer ${apiConfig.authToken}` }
          : { 'x-api-key': apiConfig.authToken };
        
        console.log('[API Test] Auth type:', apiConfig.authType);

        // 3. 构造请求体
        const postData = JSON.stringify({
          model: apiConfig.model || 'claude-sonnet-4-5-20250929',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        });

        // 4. 构造请求选项
        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'anthropic-version': '2023-06-01'
          },
          timeout: 10000
        };

        // 5. Configure proxy (may fail)
        if (apiConfig.useProxy && apiConfig.httpsProxy) {
          try {
            console.log('[API Test] Using proxy:', apiConfig.httpsProxy);
            const HttpsProxyAgent = require('https-proxy-agent');
            options.agent = new HttpsProxyAgent(apiConfig.httpsProxy);
          } catch (proxyError) {
            console.error('[API Test] Proxy config error:', proxyError);
            safeResolve({ 
              success: false, 
              message: `代理配置错误: ${proxyError.message}` 
            });
            return;
          }
        }

        // 6. 创建请求
        console.log('[API Test] 创建 HTTPS 请求...');
        request = https.request(options, (res) => {
          console.log('[API Test] 收到响应，状态码:', res.statusCode);
          
          let responseData = '';
          
          res.on('data', (chunk) => { 
            responseData += chunk; 
          });
          
          res.on('end', () => {
            console.log('[API Test] 响应接收完成');
            
            if (res.statusCode === 200) {
              safeResolve({ 
                success: true, 
                message: 'API 连接成功' 
              });
            } else {
              console.error('[API Test] HTTP 错误:', res.statusCode);
              console.error('[API Test] 响应内容:', responseData);
              safeResolve({ 
                success: false, 
                message: `连接失败 (${res.statusCode})\n请求地址: ${fullUrl}\n响应: ${responseData}` 
              });
            }
          });
        });

        // 7. 错误处理
        request.on('error', (error) => {
          console.error('[API Test] 请求错误:', error.message);
          safeResolve({ 
            success: false, 
            message: `连接错误: ${error.message}` 
          });
        });

        request.on('timeout', () => {
          console.error('[API Test] 请求超时（10秒）');
          safeResolve({ 
            success: false, 
            message: '连接超时（10秒）' 
          });
        });

        // 8. 发送请求
        console.log('[API Test] 发送请求数据...');
        request.write(postData);
        request.end();
        console.log('[API Test] 请求已发送，等待响应...');
        
      } catch (error) {
        console.error('[API Test] 异常:', error);
        safeResolve({ 
          success: false, 
          message: `配置错误: ${error.message}` 
        });
      }
    });
  }


}

module.exports = ConfigManager;

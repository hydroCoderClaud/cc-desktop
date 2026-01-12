/**
 * 配置管理器
 * 管理应用配置和最近打开的项目列表
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const APIClient = require('./api/api-client');

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

      // 自定义模型列表（已废弃，每个 Profile 独立管理）
      customModels: [],
      
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
        const migratedConfig = this.migrateToProfiles(mergedConfig);
        
        // 确保所有 Profile 都有 customModels 字段
        const fixedConfig = this.ensureCustomModels(migratedConfig);
        
        // 如果发生了迁移或修复，保存新配置
        if (fixedConfig !== mergedConfig) {
          this.save(fixedConfig);
        }
        
        return fixedConfig;
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
        model: defaultProfile.model,
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
   * 确保所有 Profile 都有 customModels 字段
   */
  ensureCustomModels(config) {
    if (!config.apiProfiles || config.apiProfiles.length === 0) {
      return config;
    }

    let modified = false;

    config.apiProfiles.forEach(profile => {
      // 只在字段不存在时初始化为空数组，不自动填充默认模型
      if (!profile.customModels) {
        console.log('[ConfigManager] Initializing empty customModels for profile:', profile.id);
        profile.customModels = [];
        modified = true;
      }
    });

    return modified ? config : config;
  }

  /**
   * 迁移旧的单 API 配置到 apiProfiles 数组
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
      category: 'official',
      description: '',
      baseUrl: oldApi.baseUrl || 'https://api.anthropic.com',
      model: oldApi.model || 'claude-sonnet-4-5-20250929',
      useProxy: oldApi.useProxy || false,
      httpsProxy: oldApi.httpsProxy || '',
      httpProxy: oldApi.httpProxy || '',
      isDefault: true,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      icon: '🟣',
      customModels: [
        { id: 'opus-4.5', name: 'claude-opus-4-5-20251101', label: 'Opus 4.5 - 最强大' },
        { id: 'sonnet-4.5', name: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 - 平衡（推荐）' },
        { id: 'haiku-4', name: 'claude-haiku-4-0-20250107', label: 'Haiku 4 - 最快' }
      ]
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

    const newProfile = {
      id: uuidv4(),
      name: profileData.name || 'New Profile',
      authToken: profileData.authToken || '',
      authType: profileData.authType || 'api_key',
      category: profileData.category || 'official',
      description: profileData.description || '',
      baseUrl: profileData.baseUrl || 'https://api.anthropic.com',
      model: profileData.model || 'claude-sonnet-4-5-20250929',
      useProxy: profileData.useProxy || false,
      httpsProxy: profileData.httpsProxy || '',
      httpProxy: profileData.httpProxy || '',
      isDefault: false,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      icon: profileData.icon || '🔵',
      // 每个 Profile 独立的模型列表，初始化为空，用户手动维护
      customModels: profileData.customModels || []
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
   * 获取指定 Profile 的自定义模型列表
   */
  getCustomModels(profileId) {
    if (!profileId) {
      console.error('[ConfigManager] getCustomModels: profileId is required');
      return [];
    }
    
    const profile = this.getAPIProfile(profileId);
    if (!profile) {
      console.error('[ConfigManager] getCustomModels: profile not found:', profileId);
      return [];
    }

    // 如果 profile 没有 customModels 字段（undefined），初始化为空数组
    // 但不自动填充默认模型，保持为空，让用户手动维护
    if (!profile.customModels) {
      profile.customModels = [];
    }

    return profile.customModels;
  }

  /**
   * 更新指定 Profile 的自定义模型列表
   */
  updateCustomModels(profileId, models) {
    if (!profileId) {
      console.error('[ConfigManager] updateCustomModels: profileId is required');
      return false;
    }
    
    const profile = this.getAPIProfile(profileId);
    if (!profile) {
      console.error('[ConfigManager] updateCustomModels: profile not found:', profileId);
      return false;
    }
    
    profile.customModels = models;
    return this.save();
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

    // Construct test payload
    const testPayload = {
      model: apiConfig.model || 'claude-sonnet-4-5-20250929',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }]
    };

    // Use APIClient for the request
    const result = await APIClient.makeRequest(apiConfig, 'v1/messages', {
      method: 'POST',
      body: testPayload
    });

    console.log('[API Test] Test completed, result:', result.success ? 'SUCCESS' : 'FAILED');
    console.log('[API Test] ========== Connection test ended ==========\n');

    // If successful, change message to be more user-friendly
    if (result.success) {
      return {
        success: true,
        message: 'API 连接成功'
      };
    }

    return result;
  }


  /**
   * 获取模型列表
   */
  async fetchOfficialModels(apiConfig) {
    console.log('[Fetch Models] Fetching model list from API...');

    // Use APIClient to make GET request to /v1/models endpoint
    const result = await APIClient.makeRequest(apiConfig, 'v1/models', {
      method: 'GET',
      globalTimeout: 10000,
      requestTimeout: 8000
    });

    // If request failed, return error
    if (!result.success) {
      return result;
    }

    // Parse model list from response
    try {
      const data = result.data;
      console.log('[Fetch Models] Parsed response:', data);

      if (data.data && Array.isArray(data.data)) {
        const models = data.data.map(model => {
          // Generate label based on model name
          let label = model.display_name || model.id;

          // Add friendly labels for known models
          if (model.id.includes('opus')) {
            label = label + ' - 最强大';
          } else if (model.id.includes('sonnet')) {
            label = label + ' - 平衡（推荐）';
          } else if (model.id.includes('haiku')) {
            label = label + ' - 最快';
          }

          return {
            id: model.id.replace(/[^a-zA-Z0-9-_.]/g, '_'), // Safe ID
            name: model.id,
            label: label
          };
        });

        console.log('[Fetch Models] Parsed', models.length, 'models');
        return { success: true, models };
      } else {
        console.error('[Fetch Models] Invalid response format');
        return {
          success: false,
          message: '模型列表格式错误'
        };
      }
    } catch (parseError) {
      console.error('[Fetch Models] Parse error:', parseError);
      return {
        success: false,
        message: `解析响应失败: ${parseError.message}`
      };
    }
  }
}

module.exports = ConfigManager;

/**
 * 配置管理器
 * 管理应用配置和最近打开的项目列表
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DEFAULT_GLOBAL_MODELS, TIMEOUTS } = require('./utils/constants');
const { providerConfigMixin } = require('./config/provider-config');
const { projectConfigMixin } = require('./config/project-config');
const { apiConfigMixin } = require('./config/api-config');

class ConfigManager {
  /**
   * @param {Object} options - 可选配置
   * @param {string} options.userDataPath - 自定义用户数据目录路径（用于测试）
   */
  constructor(options = {}) {
    // 配置文件路径（支持测试时注入自定义路径）
    this.userDataPath = options.userDataPath || app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'config.json');

    // 默认配置
    this.defaultConfig = {
      recentProjects: [],

      // 多 API 配置支持
      apiProfiles: [],
      defaultProfileId: null,  // 默认 Profile（启动时推荐使用）

      // 服务商定义（自定义服务商，内置的在 constants.js 中）
      serviceProviderDefinitions: [],

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
          fontFamily: '"Ubuntu Mono", monospace'
        },

        maxRecentProjects: 10,
        maxActiveSessions: 5,  // 最大同时运行的会话数
        maxHistorySessions: 10  // 左侧面板历史会话最大显示条数
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

  // 服务商管理方法由 providerConfigMixin 提供

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
   * 获取最大活动会话数
   */
  getMaxActiveSessions() {
    return this.config.settings?.maxActiveSessions || 5;
  }

  /**
   * 更新最大活动会话数
   */
  updateMaxActiveSessions(maxActiveSessions) {
    if (!this.config.settings) {
      this.config.settings = {};
    }
    this.config.settings.maxActiveSessions = maxActiveSessions;
    return this.save();
  }

  /**
   * 获取历史会话最大显示条数
   */
  getMaxHistorySessions() {
    return this.config.settings?.maxHistorySessions || 10;
  }

  /**
   * 更新历史会话最大显示条数
   */
  updateMaxHistorySessions(maxHistorySessions) {
    if (!this.config.settings) {
      this.config.settings = {};
    }
    this.config.settings.maxHistorySessions = maxHistorySessions;
    return this.save();
  }

  /**
   * 获取终端设置
   */
  getTerminalSettings() {
    return this.config.settings?.terminal || { fontSize: 14, fontFamily: '"Ubuntu Mono", monospace' };
  }

  /**
   * 更新终端设置
   */
  updateTerminalSettings(terminalSettings) {
    if (!this.config.settings) {
      this.config.settings = {};
    }
    this.config.settings.terminal = {
      ...this.config.settings.terminal,
      ...terminalSettings
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

  // 项目管理方法由 projectConfigMixin 提供

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
   * 获取 API 配置（返回当前默认 Profile 的配置，处理兼容性）
   * @returns {Object} API 配置对象
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
   * 获取配置文件路径（用于用户手动编辑）
   */
  getConfigPath() {
    return this.configPath;
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

        // 6. Create request
        console.log('[API Test] Creating HTTPS request...');
        request = https.request(options, (res) => {
          console.log('[API Test] Received response, status code:', res.statusCode);

          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            console.log('[API Test] Response received');

            if (res.statusCode === 200) {
              safeResolve({
                success: true,
                message: 'API connection successful'
              });
            } else {
              console.error('[API Test] HTTP error:', res.statusCode);
              console.error('[API Test] Response body:', responseData);
              safeResolve({
                success: false,
                message: `Connection failed (${res.statusCode})\nURL: ${fullUrl}\nResponse: ${responseData}`
              });
            }
          });
        });

        // 7. Error handling
        request.on('error', (error) => {
          console.error('[API Test] Request error:', error.message);
          safeResolve({
            success: false,
            message: `Connection error: ${error.message}`
          });
        });

        request.on('timeout', () => {
          console.error('[API Test] Request timeout (10s)');
          safeResolve({
            success: false,
            message: 'Connection timeout (10s)'
          });
        });

        // 8. Send request
        console.log('[API Test] Sending request data...');
        request.write(postData);
        request.end();
        console.log('[API Test] Request sent, waiting for response...');

      } catch (error) {
        console.error('[API Test] Exception:', error);
        safeResolve({
          success: false,
          message: `Configuration error: ${error.message}`
        });
      }
    });
  }


}

// Apply mixins (provider config, project config, api config)
Object.assign(ConfigManager.prototype, providerConfigMixin, projectConfigMixin, apiConfigMixin);

module.exports = ConfigManager;

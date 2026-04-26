/**
 * 配置管理器
 * 管理应用配置和最近打开的项目列表
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { TIMEOUTS } = require('./utils/constants');
const { providerConfigMixin, getDefaultProviders } = require('./config/provider-config');
const { apiConfigMixin } = require('./config/api-config');
const { atomicWriteJson } = require('./utils/path-utils');

const MARKET_REGISTRY_GITHUB = 'https://raw.githubusercontent.com/hydroCoderClaud/hydroSkills/main';
const MARKET_REGISTRY_GITEE = 'https://gitee.com/reistlin/hydroskills/raw/main';
const UPDATE_MIRROR_OSS = 'https://hdupdate.myseek.fun/hydrodesktop_update';

function normalizeModelValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveProviderDefaultModelId(source, serviceProvider) {
  const providerId = normalizeModelValue(serviceProvider);
  if (!providerId) {
    return '';
  }

  const definitions = Array.isArray(source?.serviceProviderDefinitions)
    ? source.serviceProviderDefinitions
    : Array.isArray(source?.config?.serviceProviderDefinitions)
      ? source.config.serviceProviderDefinitions
      : Array.isArray(source?.defaultConfig?.serviceProviderDefinitions)
        ? source.defaultConfig.serviceProviderDefinitions
        : [];
  const provider = definitions.find(item => normalizeModelValue(item?.id) === providerId);
  const defaultModels = Array.isArray(provider?.defaultModels) ? provider.defaultModels : [];
  return normalizeModelValue(defaultModels[0]);
}

function resolveConfiguredModelId(source, profile) {
  const selectedModelId = normalizeModelValue(profile?.selectedModelId);
  if (selectedModelId) return selectedModelId;
  return resolveProviderDefaultModelId(source, profile?.serviceProvider);
}

class ConfigManager {
  /**
   * @param {Object} options - 可选配置
   * @param {string} options.userDataPath - 自定义用户数据目录路径（用于测试）
   */
  constructor(options = {}) {
    // 配置文件路径（支持测试时注入自定义路径）
    this.userDataPath = options.userDataPath || app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'config.json');

    // 写锁：确保配置文件写入串行化，避免并发写入竞态
    this.saveQueue = Promise.resolve();

    // 默认配置
    this.defaultConfig = {
      recentProjects: [],

      // 多 API 配置支持
      apiProfiles: [],
      defaultProfileId: null,  // 默认 Profile（启动时推荐使用）

      // 服务商定义（首次初始化写入默认列表，之后以持久化配置为准）
      serviceProviderDefinitions: getDefaultProviders(),

      // 快捷命令（右侧面板）
      quickCommands: [],

      // 超时配置
      timeout: {
        test: TIMEOUTS.API_TEST,        // 测试连接超时
        request: TIMEOUTS.API_REQUEST   // 实际请求超时
      },

      // 组件市场配置（Skills / Agents / Prompts）
      market: {
        registryUrl: MARKET_REGISTRY_GITEE,
        registryMirrorUrl: '',
      },

      // 自动更新主源（国内 generic provider）
      updatePrimaryUrl: UPDATE_MIRROR_OSS,
      // 自动更新备用源（GitHub Releases）
      updateGithub: {
        owner: 'hydroCoderClaud',
        repo: 'cc-desktop'
      },
      // 旧版国内镜像配置（兼容保留，不再作为默认值写入）
      updateMirrorUrl: '',

      // MCP 代理配置
      mcp: {
        proxy: {
          enabled: false,
          url: ''           // 如 "http://127.0.0.1:7890"
        }
      },

      // 钉钉桥接配置
      dingtalk: {
        enabled: false,
        appKey: '',
        appSecret: '',
        defaultCwd: '',
        maxHistorySessions: 5,
      },

      settings: {
        theme: 'light',

        // 终端设置
        terminal: {
          fontSize: 14,
          fontFamily: '"Ubuntu Mono", monospace',
          darkBackground: true
        },

        maxRecentProjects: 10,
        maxActiveSessions: 5,  // 最大同时运行的会话数
        maxHistorySessions: 10,  // 左侧面板历史会话最大显示条数

        // 应用模式
        appMode: 'agent',  // 启动固定为 'agent'
        enableDeveloperMode: true,

        // Agent 模式配置
        agent: {
          outputBaseDir: '',           // 输出根目录，默认 ~/cc-desktop-agent-output/
          maxAgentSessions: 5,         // 最大并发 Agent 会话数
          defaultAgentType: 'chat',    // 默认 Agent 类型
          messageQueue: true           // 消息队列：流式输出期间允许排队发送
        },

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
        let needsSave = false;

        // 迁移旧的单 API 配置到 apiProfiles
        let migratedConfig = this.migrateToProfiles(mergedConfig);

        // 迁移 Profile 结构（category/model → serviceProvider/selectedModelTier）
        migratedConfig = this.migrateProfileStructure(migratedConfig);

        // 迁移 skillsMarket → market
        if (migratedConfig.skillsMarket) {
          if (!migratedConfig.market) {
            migratedConfig.market = migratedConfig.skillsMarket;
            console.log('[ConfigManager] Migrated skillsMarket → market');
          }
          delete migratedConfig.skillsMarket;
          needsSave = true;
        }

        // 清理旧的 updateUrl 字段（已被 updateGithub 替代）
        if (migratedConfig.updateUrl !== undefined) {
          delete migratedConfig.updateUrl;
          console.log('[ConfigManager] Cleaned up legacy updateUrl field');
          needsSave = true;
        }

        const originalPrimaryUrl = config.updatePrimaryUrl;
        const originalMirrorUrl = config.updateMirrorUrl;
        const hasLegacyGithubPrimaryWithOssMirror = (originalPrimaryUrl === '' || originalPrimaryUrl === undefined) &&
          originalMirrorUrl === UPDATE_MIRROR_OSS;

        if (hasLegacyGithubPrimaryWithOssMirror) {
          migratedConfig.updatePrimaryUrl = UPDATE_MIRROR_OSS;
          migratedConfig.updateMirrorUrl = '';
          console.log('[ConfigManager] Migrated updater source order to OSS primary + GitHub fallback');
          needsSave = true;
        } else {
          // 为旧配置补充新的更新源字段，并持久化到磁盘
          if (config.updatePrimaryUrl === undefined && migratedConfig.updatePrimaryUrl !== undefined) {
            console.log('[ConfigManager] Added missing updatePrimaryUrl field');
            needsSave = true;
          }

          if (config.updateMirrorUrl === undefined && migratedConfig.updateMirrorUrl) {
            console.log('[ConfigManager] Added missing updateMirrorUrl field');
            needsSave = true;
          }
        }

        const originalMarket = config.market || {};
        const currentMarket = migratedConfig.market || {};
        const hasLegacyMarketPrimary = originalMarket.registryUrl === MARKET_REGISTRY_GITHUB;
        const marketPrimaryMissing = originalMarket.registryUrl === undefined;
        const hasMarketMirror = originalMarket.registryMirrorUrl !== undefined && originalMarket.registryMirrorUrl !== '';
        const hasLegacyMarketFallbackUrls = originalMarket.registryFallbackUrls !== undefined;

        if (hasLegacyMarketPrimary || marketPrimaryMissing || hasMarketMirror || hasLegacyMarketFallbackUrls) {
          const nextPrimary = (hasLegacyMarketPrimary || marketPrimaryMissing)
            ? MARKET_REGISTRY_GITEE
            : currentMarket.registryUrl;
          const nextMirror = '';

          if (nextPrimary !== currentMarket.registryUrl || nextMirror !== currentMarket.registryMirrorUrl) {
            migratedConfig.market = {
              ...currentMarket,
              registryUrl: nextPrimary,
              registryMirrorUrl: nextMirror
            };
          }

          if (migratedConfig.market?.registryFallbackUrls !== undefined) {
            delete migratedConfig.market.registryFallbackUrls;
          }

          if (hasLegacyMarketPrimary) {
            console.log('[ConfigManager] Migrated market registry primary to Gitee');
          } else if (hasMarketMirror || hasLegacyMarketFallbackUrls) {
            console.log('[ConfigManager] Removed deprecated market fallback configuration');
          } else {
            console.log('[ConfigManager] Added missing market registry primary');
          }
          needsSave = true;
        }

        if (migratedConfig.settings?.aiAssistant !== undefined) {
          delete migratedConfig.settings.aiAssistant;
          console.log('[ConfigManager] Removed legacy aiAssistant settings');
          needsSave = true;
        }

        // 规范化服务商定义，并将旧 profile 模型列表并入服务商默认模型列表
        this.config = migratedConfig;
        const normalizedProviderDefinitions = this.getServiceProviderDefinitions();
        if (JSON.stringify(normalizedProviderDefinitions) !== JSON.stringify(migratedConfig.serviceProviderDefinitions)) {
          migratedConfig.serviceProviderDefinitions = normalizedProviderDefinitions;
          needsSave = true;
        }

        // 如果发生了迁移，保存新配置
        if (needsSave || migratedConfig !== mergedConfig) {
          this.save(migratedConfig);
        }
        
        return migratedConfig;
      }

      // 配置文件不存在，使用默认配置
      this.config = this.defaultConfig;
      this.save(this.defaultConfig);
      return this.defaultConfig;
    } catch (error) {
      console.error('Failed to load config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * 保存配置到文件（串行化写入，避免并发竞态）
   */
  save(config = this.config) {
    // 将写操作加入队列，确保串行执行
    this.saveQueue = this.saveQueue.then(() => {
      try {
        atomicWriteJson(this.configPath, config);
        this.config = config;
        return true;
      } catch (error) {
        console.error('Failed to save config:', error);
        return false;
      }
    }).catch(err => {
      console.error('Save queue error:', err);
      return false;
    });
    return this.saveQueue;
  }

  /**
   * 获取完整配置
   */
  getConfig() {
    return this.config;
  }

  // 服务商管理方法由 providerConfigMixin 提供

  /**
   * 获取组件市场配置
   */
  getMarketConfig() {
    return this.config.market || { registryUrl: '' };
  }

  /**
   * 更新组件市场配置
   */
  updateMarketConfig(marketConfig) {
    this.config.market = {
      ...this.config.market,
      ...marketConfig
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
   * 获取自动压缩阈值百分比 (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)
   * @returns {number|null} 阈值百分比 (0-100)，null 表示使用默认值
   */
  getAutocompactPctOverride() {
    return this.config.settings?.autocompactPctOverride ?? null;
  }

  /**
   * 更新自动压缩阈值百分比
   * @param {number|null} value - 阈值百分比 (0-100)，null 表示使用默认值
   */
  updateAutocompactPctOverride(value) {
    if (!this.config.settings) {
      this.config.settings = {};
    }
    this.config.settings.autocompactPctOverride = value;
    return this.save();
  }

  // ========================================
  // 快捷命令管理
  // ========================================

  /**
   * 获取快捷命令列表
   */
  getQuickCommands() {
    return this.config.quickCommands || [];
  }

  /**
   * 添加快捷命令
   */
  addQuickCommand(command) {
    if (!this.config.quickCommands) {
      this.config.quickCommands = [];
    }
    const newCommand = {
      id: uuidv4(),
      name: command.name,
      command: command.command,
      color: command.color || null,
      createdAt: new Date().toISOString()
    };
    this.config.quickCommands.push(newCommand);
    this.save();
    return newCommand;
  }

  /**
   * 更新快捷命令
   */
  updateQuickCommand(id, updates) {
    if (!this.config.quickCommands) return null;
    const index = this.config.quickCommands.findIndex(c => c.id === id);
    if (index === -1) return null;

    this.config.quickCommands[index] = {
      ...this.config.quickCommands[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.config.quickCommands[index];
  }

  /**
   * 删除快捷命令
   */
  deleteQuickCommand(id) {
    if (!this.config.quickCommands) return false;
    const index = this.config.quickCommands.findIndex(c => c.id === id);
    if (index === -1) return false;

    this.config.quickCommands.splice(index, 1);
    this.save();
    return true;
  }

  /**
   * 获取终端设置
   */
  getTerminalSettings() {
    return this.config.settings?.terminal || { fontSize: 14, fontFamily: '"Ubuntu Mono", monospace', darkBackground: true };
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
        selectedModelId: resolveConfiguredModelId(this.config, defaultProfile),
        selectedModelTier: null,
        requestTimeout: defaultProfile.requestTimeout || this.getTimeout().request,
        disableNonessentialTraffic: defaultProfile.disableNonessentialTraffic !== false,
        useProxy: defaultProfile.useProxy,
        httpsProxy: defaultProfile.httpsProxy,
        httpProxy: defaultProfile.httpProxy
      };
    }

    return {
      authToken: '',
      authType: 'api_key',
      baseUrl: '',
      serviceProvider: '',
      selectedModelId: '',
      selectedModelTier: null,
      requestTimeout: this.getTimeout().request,
      disableNonessentialTraffic: true,
      useProxy: false,
      httpsProxy: '',
      httpProxy: ''
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
   */

  /**
   * 迁移 Profile 结构（兼容旧的 category/model，并清理废弃字段）
   * @param {Object} config - 配置对象
   * @returns {Object} - 迁移后的配置
   */
  migrateProfileStructure(config) {
    if (!config.apiProfiles || config.apiProfiles.length === 0) {
      return config;
    }

    let migrated = false;
    let nextConfig = config
    const nextProfiles = config.apiProfiles.map(rawProfile => {
      let profile = rawProfile

      // 检查是否需要迁移（是否存在旧字段）
      const needsMigration = profile.category !== undefined ||
                            profile.model !== undefined ||
                            profile.selectedModelId === undefined ||
                            profile.customModels !== undefined ||
                            profile.modelMapping !== undefined ||
                            profile.selectedModelTier !== undefined && profile.selectedModelTier !== null;

      if (!needsMigration) {
        return profile;
      }

      console.log(`[ConfigManager] Migrating profile structure for: ${profile.name}`);
      migrated = true;
      profile = { ...profile }

      // 1. 迁移 category → serviceProvider
      if (profile.category !== undefined && profile.serviceProvider === undefined) {
        profile.serviceProvider = profile.category;
        delete profile.category;
      }

      // 2. 迁移旧 model 字段，仅保留真实模型 ID，不再推导 tier
      if (profile.model !== undefined) {
        const legacyModelId = normalizeModelValue(profile.model);
        if (!normalizeModelValue(profile.selectedModelId) && legacyModelId) {
          profile.selectedModelId = legacyModelId;
        }
        delete profile.model;
      }

      // 3. 清理旧 tier，并只按当前服务商默认模型补齐 selectedModelId
      profile.selectedModelTier = null;
      if (!normalizeModelValue(profile.selectedModelId)) {
        profile.selectedModelId = resolveConfiguredModelId(config, profile);
      }
      if (profile.customModels !== undefined) {
        delete profile.customModels;
      }
      if (profile.selectedModelId === undefined || profile.selectedModelId === null) {
        profile.selectedModelId = '';
      }
      if (profile.modelMapping !== undefined) {
        delete profile.modelMapping;
      }
      if (profile.requestTimeout === undefined) {
        profile.requestTimeout = config.timeout?.request || TIMEOUTS.API_REQUEST;
      }
      if (profile.disableNonessentialTraffic === undefined) {
        profile.disableNonessentialTraffic = true;
      }

      return profile;
    });

    const profilesChanged = nextProfiles.some((profile, index) => profile !== config.apiProfiles[index]);
    if (profilesChanged) {
      nextConfig = { ...nextConfig, apiProfiles: nextProfiles };
    }

    // 4. 删除全局 customModels 配置（如果存在）
    if (nextConfig.customModels !== undefined) {
      console.log('[ConfigManager] Removing global customModels field');
      if (nextConfig === config) {
        nextConfig = { ...nextConfig };
      }
      delete nextConfig.customModels;
      migrated = true;
    }

    // 6. 清理已废弃的 globalModels 配置
    if (nextConfig.globalModels !== undefined) {
      if (nextConfig === config) {
        nextConfig = { ...nextConfig };
      }
      delete nextConfig.globalModels;
      migrated = true;
    }

    if (nextConfig.timeout === undefined) {
      if (nextConfig === config) {
        nextConfig = { ...nextConfig };
      }
      nextConfig.timeout = {
        test: TIMEOUTS.API_TEST,
        request: TIMEOUTS.API_REQUEST
      };
      migrated = true;
    }

    if (migrated) {
      console.log('[ConfigManager] Profile structure migration completed');
    }

    return nextConfig;
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
      selectedModelId: normalizeModelValue(oldApi.model),
      selectedModelTier: null,
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

    // 自动清理旧配置（迁移后保持配置文件干净）
    delete config.settings.api;
    delete config.settings.anthropicApiKey;
    delete config.settings.claudeApiKey;
    delete config.settings.anthropicApiToken;

    console.log('[ConfigManager] Migration completed. Created default profile:', defaultProfile.id);
    console.log('[ConfigManager] Cleaned up legacy API config fields');

    return config;
  }

  /**
   * 获取配置文件路径（用于用户手动编辑）
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * 通过 Agent SDK 测试 API 连接（走 CLI 真实路径，兼容百炼等有来源校验的端点）
   */
  async testAPIConnectionViaSDK(apiConfig) {
    console.log('[API Test SDK] ========== Starting SDK connection test ==========')
    const startTime = Date.now()

    const { buildClaudeEnvVars, buildBasicEnv } = require('./utils/env-builder')
    const ClaudeCodeRunner = require('./runners/claude-code-runner')

    const claudeEnv = buildClaudeEnvVars(apiConfig, this)
    const env = buildBasicEnv(claudeEnv)

    const runner = new ClaudeCodeRunner()

    const globalTimeout = this.getTimeout()
    const testTimeoutMs = globalTimeout.test || TIMEOUTS.API_TEST
    const testTimeoutSec = testTimeoutMs / 1000

    console.log(`[API Test SDK] Timeout: ${testTimeoutSec}s`)

    const testPromise = (async () => {
      try {
        const queryFn = await runner._loadSDK()
        const generator = queryFn({
          prompt: 'hi',
          options: {
            maxTurns: 1,
            env,
            spawnClaudeCodeProcess: (spawnOpts) => {
              const { spawn: cpSpawn } = require('child_process')
              // 修正 CLI 路径：SDK 在 asar 里，需重定向到 unpacked
              let cliPath = spawnOpts.args[0]
              if (cliPath && /[\/\\]app\.asar[\/\\]/.test(cliPath) && !cliPath.includes('app.asar.unpacked')) {
                cliPath = cliPath.replace(/[\/\\]app\.asar[\/\\]/g, (match) => {
                  return match.replace('app.asar', 'app.asar.unpacked')
                })
                spawnOpts.args[0] = cliPath
              }
              return cpSpawn(spawnOpts.command, spawnOpts.args, {
                cwd: spawnOpts.cwd,
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false
              })
            }
          }
        })

        let responseText = ''
        for await (const msg of generator) {
          // 从 assistant 消息中提取文本
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text) {
                responseText += block.text
              }
            }
          }
          if (msg.type === 'result') {
            const durationMs = Date.now() - startTime
            if (msg.is_error) {
              return {
                success: false,
                message: `API error: ${msg.result || 'Unknown error'}`,
                durationMs
              }
            }
            // 优先用累积的 assistant 文本，其次用 result 字段
            const reply = responseText || msg.result || ''
            return {
              success: true,
              message: reply,
              durationMs
            }
          }
        }

        // generator 结束但没收到 result
        const durationMs = Date.now() - startTime
        return { success: true, message: responseText || '', durationMs }
      } catch (error) {
        const durationMs = Date.now() - startTime
        console.error('[API Test SDK] Error:', error.message)
        throw error
      }
    })()

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`SDK 连接超时（${testTimeoutSec}秒无响应）`)), testTimeoutMs)
    })

    try {
      const result = await Promise.race([testPromise, timeoutPromise])
      console.log('[API Test SDK] Result:', result.success ? 'SUCCESS' : 'FAILED')
      console.log('[API Test SDK] ========== SDK connection test ended ==========\n')
      return result
    } catch (error) {
      console.error('[API Test SDK] Failed:', error.message)
      console.log('[API Test SDK] ========== SDK connection test ended ==========\n')
      throw error
    }
  }

  /**
   * 通过 HTTP 直连测试 API 连接（fallback，CLI 未安装时使用）
   */
  async testAPIConnectionViaHTTP(apiConfig) {
    console.log('[API Test] ========== Starting new connection test ==========');
    const configuredModelId = resolveConfiguredModelId(this.config, apiConfig);
    console.log('[API Test] Config:', JSON.stringify({
      baseUrl: apiConfig.baseUrl,
      authType: apiConfig.authType,
      selectedModelId: configuredModelId || null,
      useProxy: apiConfig.useProxy,
      httpsProxy: apiConfig.httpsProxy
    }, null, 2));

    const https = require('https');
    const http = require('http');
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
        console.log('[API Test] - protocol:', url.protocol);
        console.log('[API Test] - port:', url.port || (url.protocol === 'https:' ? 443 : 80));
        console.log('[API Test] - pathname:', url.pathname);

        // 判断是否使用 HTTPS
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;
        const defaultPort = isHttps ? 443 : 80;
        
        // 2. Build auth header
        const authHeader = apiConfig.authType === 'auth_token' 
          ? { 'Authorization': `Bearer ${apiConfig.authToken}` }
          : { 'x-api-key': apiConfig.authToken };
        
        console.log('[API Test] Auth type:', apiConfig.authType);

        if (!configuredModelId) {
          safeResolve({
            success: false,
            message: '未配置模型 ID，请先为当前 API Profile 选择模型 ID'
          });
          return;
        }

        // 3. 构造请求体
        const postData = JSON.stringify({
          model: configuredModelId,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        });

        // 4. 构造请求选项
        const options = {
          hostname: url.hostname,
          port: url.port || defaultPort,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'anthropic-version': '2023-06-01'
          },
          timeout: testTimeoutMs  // 与 globalTimer 保持一致，使用用户配置的超时时间
        };

        // 5. Configure proxy (may fail)
        if (apiConfig.useProxy && apiConfig.httpsProxy) {
          try {
            console.log('[API Test] Using proxy:', apiConfig.httpsProxy);
            const { HttpsProxyAgent } = require('https-proxy-agent');
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
        console.log(`[API Test] Creating ${isHttps ? 'HTTPS' : 'HTTP'} request...`);
        console.log('[API Test] Request options:', JSON.stringify({
          hostname: options.hostname,
          port: options.port,
          path: options.path,
          method: options.method,
          timeout: options.timeout,
          hasProxy: !!options.agent
        }, null, 2));

        const startTime = Date.now();
        request = httpModule.request(options, (res) => {
          const elapsed = Date.now() - startTime;
          console.log(`[API Test] Received response after ${elapsed}ms, status code:`, res.statusCode);

          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            console.log('[API Test] Response received');

            if (res.statusCode === 200) {
              safeResolve({
                success: true,
                message: 'HTTP 直连成功，兼容 Messages API'
              });
            } else {
              console.error('[API Test] HTTP error:', res.statusCode);
              console.error('[API Test] Response body:', responseData);
              safeResolve({
                success: false,
                message: `HTTP 直连失败 (${res.statusCode})\nURL: ${fullUrl}\nResponse: ${responseData}`
              });
            }
          });
        });

        // 7. Error handling
        request.on('error', (error) => {
          console.error('[API Test] Request error:', error.message);
          console.error('[API Test] Error code:', error.code);
          request.destroy();  // 显式销毁请求
          safeResolve({
            success: false,
            message: `HTTP 请求错误：${error.message}${error.code ? ` (${error.code})` : ''}`
          });
        });

        request.on('timeout', () => {
          console.error('[API Test] Request timeout (30s)');
          request.destroy();  // 显式销毁请求，避免挂起
          safeResolve({
            success: false,
            message: `HTTP 请求超时（${testTimeoutSec}秒）`
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
          message: `配置错误：${error.message}`
        });
      }
    });
  }


  // ========================================
  // MCP 代理配置
  // ========================================

  /**
   * 获取 MCP 代理配置
   */
  getMcpProxyConfig() {
    const config = this.getConfig();
    const proxy = config.mcp?.proxy || { enabled: false, url: '' };
    // 检测 proxy-support 环境是否已就绪
    const proxySupportDir = path.join(os.homedir(), '.claude', 'proxy-support');
    proxy.proxySupportReady = fs.existsSync(path.join(proxySupportDir, 'node_modules', 'undici'));
    proxy.proxySupportPath = proxySupportDir;
    return proxy;
  }

  /**
   * 更新 MCP 代理配置
   */
  updateMcpProxyConfig(proxyConfig) {
    const config = this.getConfig();
    if (!config.mcp) config.mcp = {};
    config.mcp.proxy = {
      enabled: !!proxyConfig.enabled,
      url: (proxyConfig.url || '').trim()
    };
    this.save(config);
    return config.mcp.proxy;
  }

  /**
   * 获取打包的 undici 源路径（从 app 资源中获取）
   */
  _getBundledUndiciPath() {
    const { app } = require('electron');
    const appPath = app.getAppPath();
    if (appPath.includes('app.asar')) {
      // 生产模式：从 asarUnpack 解压目录读取
      return path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'node_modules', 'undici');
    }
    // 开发模式：直接从 node_modules 读取
    return path.join(appPath, 'node_modules', 'undici');
  }

  /**
   * 确保代理支持环境就绪（从 app 资源复制 undici + 生成 preload 脚本）
   */
  async ensureProxySupport(proxyUrl) {
    const proxySupportDir = path.join(os.homedir(), '.claude', 'proxy-support');
    const scriptPath = path.join(proxySupportDir, 'proxy-setup.cjs');
    const undiciDir = path.join(proxySupportDir, 'node_modules', 'undici');

    try {
      // 确保目录存在
      fs.mkdirSync(path.join(proxySupportDir, 'node_modules'), { recursive: true });

      // 检查 undici 是否已复制，或版本不一致时更新
      const bundledSrc = this._getBundledUndiciPath();
      if (!fs.existsSync(bundledSrc)) {
        console.error('[ProxySupport] Bundled undici not found at:', bundledSrc);
        return { success: false, error: 'Bundled undici not found' };
      }

      let needCopy = !fs.existsSync(undiciDir);
      if (!needCopy) {
        // 版本不一致时更新（随 app 升级自动同步）
        try {
          const srcVer = JSON.parse(fs.readFileSync(path.join(bundledSrc, 'package.json'), 'utf-8')).version;
          const dstVer = JSON.parse(fs.readFileSync(path.join(undiciDir, 'package.json'), 'utf-8')).version;
          if (srcVer !== dstVer) {
            console.log(`[ProxySupport] Updating undici: ${dstVer} → ${srcVer}`);
            needCopy = true;
          }
        } catch { needCopy = true; }
      }

      if (needCopy) {
        console.log('[ProxySupport] Copying bundled undici...');
        fs.cpSync(bundledSrc, undiciDir, { recursive: true, force: true });
        console.log('[ProxySupport] undici copied');
      }

      // 生成 preload 脚本
      const scriptContent = `// Auto-generated by cc-desktop for MCP proxy support
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  try {
    const path = require('path');
    const undiciPath = path.join(__dirname, 'node_modules', 'undici');
    const { ProxyAgent, setGlobalDispatcher } = require(undiciPath);
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch (e) { /* silent */ }
}
`;
      fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
      console.log('[ProxySupport] proxy-setup.cjs generated');

      return { success: true, proxyScriptPath: scriptPath };
    } catch (err) {
      console.error('[ProxySupport] Setup failed:', err.message);
      return { success: false, error: err.message };
    }
  }

}

// Apply mixins (provider config, api config)
Object.assign(ConfigManager.prototype, providerConfigMixin, apiConfigMixin);

module.exports = ConfigManager;

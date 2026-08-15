/**
 * ConfigManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

// 创建临时测试目录
const testTempDir = path.join(os.tmpdir(), 'cc-desktop-test-' + Date.now())
const dedicatedConfigDir = path.join(os.homedir(), '.hydrocoder', 'agent')

// 设置测试目录
function setupTestDir() {
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true })
  }
  return testTempDir
}

// 清理测试目录
function cleanupTestDir() {
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true })
  }
}

// Mock electron 模块（config-manager 仍会导入它，但不会使用 getPath）
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => ''),
    getName: vi.fn(() => 'claude-code-desktop-test'),
    getVersion: vi.fn(() => '1.0.0-test')
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

describe('ConfigManager', () => {
  let ConfigManager
  let configManager

  beforeEach(async () => {
    // 设置测试目录
    setupTestDir()

    // 清除模块缓存
    vi.resetModules()

    // 动态导入 ConfigManager
    const module = await import('../../src/main/config-manager.js')
    ConfigManager = module.default

    // 使用依赖注入方式传入测试目录路径
    configManager = new ConfigManager({ userDataPath: testTempDir })
  })

  afterEach(() => {
    // 清理测试目录中的配置文件
    const configPath = path.join(testTempDir, 'config.json')
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }
  })

  afterAll(() => {
    cleanupTestDir()
  })

  describe('初始化', () => {
    it('应该创建默认配置', () => {
      const config = configManager.getConfig()
      expect(config).toBeDefined()
      expect(config.recentProjects).toEqual([])
      expect(config.apiProfiles).toEqual([])
      expect(config.imCommon).toEqual({
        desktopInterventionLabel: '桌面端介入'
      })
      expect(config.settings).toBeDefined()
      expect(config.settings.theme).toBe('light')
      expect(config.settings.appMode).toBe('agent')
      expect(config.settings.enableDeveloperMode).toBe(false)
      expect(config.settings.localAgentApi).toEqual({ enabled: false })
      expect(config.settings.embeddedApps).toEqual({
        showInMenu: false,
        preferences: {}
      })
      expect(config.settings.agent.claudeConfigDir).toBe(dedicatedConfigDir)
    })

    it('不再初始化服务商模板层', () => {
      expect(configManager.getConfig()).not.toHaveProperty('serviceProviderDefinitions')
      expect(configManager).not.toHaveProperty('getServiceProviderDefinitions')
    })

    it('启动时应清除已退役的终端设置', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        quickCommands: [
          { id: 'legacy-quick-command', name: 'Compact', command: '/compact' }
        ],
        settings: {
          terminal: {
            fontSize: 16,
            fontFamily: 'Consolas',
            darkBackground: false
          }
        }
      }))

      const migratedManager = new ConfigManager({ userDataPath: testTempDir })
      await migratedManager.saveQueue

      expect(migratedManager.getConfig()).not.toHaveProperty('quickCommands')
      expect(migratedManager.getConfig().settings).not.toHaveProperty('terminal')
      const persistedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(persistedConfig).not.toHaveProperty('quickCommands')
      expect(persistedConfig.settings).not.toHaveProperty('terminal')
    })

    it('新增 profile 不应写入已废弃的 selectedModelTier', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Test Profile',
        authToken: 'token',
        baseUrl: 'https://example.com',
        selectedModelId: 'glm-5.1'
      })
      await configManager.saveQueue

      expect(profile.selectedModelId).toBe('')
      expect(profile).not.toHaveProperty('selectedModelTier')
      expect(configManager.getAPIProfile(profile.id)).not.toHaveProperty('selectedModelTier')
    })

    it('新增 profile 完全使用自身字段', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Qwen Profile',
        authToken: 'token',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
        defaultModels: ['qwen3.7-plus', 'qwen3.7-max'],
        selectedModelId: 'qwen3.7-plus'
      })
      await configManager.saveQueue

      expect(profile.authType).toBe('auth_token')
      expect(profile.defaultModels).toContain('qwen3.7-plus')
      expect(profile).not.toHaveProperty('serviceProvider')
      expect(profile).not.toHaveProperty('providerName')
    })

    it('falls back to the first model when a new profile has a stale default', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Fallback Profile',
        authToken: 'token',
        defaultModels: ['model-a', 'model-b'],
        selectedModelId: 'removed-model'
      })
      await configManager.saveQueue

      expect(profile.defaultModels).toEqual(['model-a', 'model-b'])
      expect(profile.selectedModelId).toBe('model-a')
    })

    it('cleans legacy defaultModelMapping and keeps the selected model inside the migrated list', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        apiProfiles: [{
          id: 'p1',
          name: 'Legacy Profile',
          authToken: 'token',
          baseUrl: 'https://example.com',
          defaultModels: ['model-a', 'model-b'],
          selectedModelId: 'removed-model',
          defaultModelMapping: { sonnet: 'legacy-model' }
        }]
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const migratedManager = new NewConfigManager({ userDataPath: testTempDir })
      await migratedManager.saveQueue

      const profile = migratedManager.getConfig().apiProfiles[0]
      expect(profile.defaultModels).toEqual(['model-a', 'model-b'])
      expect(profile.selectedModelId).toBe('model-a')
      expect(profile).not.toHaveProperty('defaultModelMapping')
      expect(JSON.parse(fs.readFileSync(configPath, 'utf-8')).apiProfiles[0])
        .not.toHaveProperty('defaultModelMapping')
    })

    it('新增 profile 不应从 mapping 回填 selectedModelId', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Mapped Profile',
        authToken: 'token',
        serviceProvider: 'mapping-only-provider',
        baseUrl: 'https://example.com',
        modelMapping: {
          sonnet: 'glm-5.1'
        }
      })
      await configManager.saveQueue

      expect(profile.selectedModelId).toBe('')
      expect(profile.modelMapping).toBeUndefined()
      expect(configManager.getAPIProfile(profile.id)?.selectedModelId).toBe('')
      expect(configManager.getAPIProfile(profile.id)?.modelMapping).toBeUndefined()
    })

    it('新增 profile selectedModelId 为空时不应从服务商默认模型回填', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Blank Model Profile',
        authToken: 'token',
        serviceProvider: 'default-model-provider',
        baseUrl: 'https://example.com',
        defaultModels: ['provider-default-model'],
        selectedModelId: ''
      })
      await configManager.saveQueue

      expect(profile.selectedModelId).toBe('')
      expect(configManager.getAPIProfile(profile.id)?.selectedModelId).toBe('')
    })

    it('getAPIConfig 不应再从 tier 或 mapping 推导模型', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        defaultProfileId: 'p1',
        serviceProviderDefinitions: [{
          id: 'other',
          name: 'Other',
          baseUrl: 'https://example.com',
          defaultModelMapping: {
            sonnet: 'legacy-provider-model'
          },
          defaultModels: ['provider-default-model']
        }],
        apiProfiles: [{
          id: 'p1',
          name: 'Proxy',
          baseUrl: 'https://example.com',
          authToken: 'token',
          serviceProvider: 'other',
          selectedModelId: '',
          selectedModelTier: 'sonnet',
          modelMapping: {
            sonnet: 'mapped-model'
          }
        }]
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      const apiConfig = newConfigManager.getAPIConfig()
      expect(apiConfig.selectedModelId).toBe('')
      expect(apiConfig).not.toHaveProperty('selectedModelTier')
      expect(apiConfig.modelMapping).toBeUndefined()
      expect(newConfigManager.getConfig().apiProfiles[0]).not.toHaveProperty('selectedModelTier')
      expect(newConfigManager.getConfig().apiProfiles[0].modelMapping).toBeUndefined()
      expect(newConfigManager.getConfig().apiProfiles[0]).not.toHaveProperty('serviceProvider')
      expect(newConfigManager.getConfig().apiProfiles[0]).not.toHaveProperty('providerName')

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.serviceProviderDefinitions).toBeUndefined()
      expect(savedConfig.apiProfiles[0].defaultModels).toEqual(['provider-default-model'])
    })

    it('应该有正确的默认超时设置', () => {
      const config = configManager.getConfig()
      expect(config.timeout).toBeDefined()
      expect(config.timeout.test).toBeGreaterThan(0)
      expect(config.timeout.request).toBeGreaterThan(0)
    })

    it('应该默认使用 Gitee 作为市场主源，且不配置备用源', () => {
      const config = configManager.getConfig()
      expect(config.market.registryUrl).toBe('https://gitee.com/reistlin/hydroskills/raw/main')
      expect(config.market.registryMirrorUrl).toBe('')
    })

    it('应该默认使用 Aliyun OSS 作为更新主源，GitHub 作为备用源', () => {
      const config = configManager.getConfig()
      expect(config.updatePrimaryUrl).toBe('https://hdupdate.myseek.fun/hydrodesktop_update')
      expect(config.updateGithub).toEqual({
        owner: 'hydroCoderClaud',
        repo: 'cc-desktop'
      })
      expect(config.updateMirrorUrl).toBe('')
    })

    it('应该初始化 embedded app 偏好存储结构', () => {
      const config = configManager.getConfig()
      expect(config.settings.embeddedApps).toEqual({
        showInMenu: false,
        preferences: {}
      })
    })

    it('删除默认服务商后，重载配置不应自动补回', async () => {
      expect(configManager.getConfig().serviceProviderDefinitions).toBeUndefined()
      expect(configManager.getConfig()).not.toHaveProperty('serviceProviderDefinitions')
    })
  })

  describe('deepMerge', () => {
    it('应该正确合并嵌套对象', () => {
      const target = {
        a: 1,
        b: { c: 2, d: 3 }
      }
      const source = {
        b: { c: 10 },
        e: 5
      }
      const result = configManager.deepMerge(target, source)

      expect(result.a).toBe(1)
      expect(result.b.c).toBe(10)
      expect(result.b.d).toBe(3)
      expect(result.e).toBe(5)
    })

    it('应该保留数组而不合并', () => {
      const target = { arr: [1, 2, 3] }
      const source = { arr: [4, 5] }
      const result = configManager.deepMerge(target, source)

      expect(result.arr).toEqual([4, 5])
    })
  })

  describe('主题设置', () => {
    it('应该能获取当前主题', () => {
      const config = configManager.getConfig()
      expect(['light', 'dark']).toContain(config.settings.theme)
    })

    it('应该能设置主题', () => {
      configManager.updateSettings({ theme: 'dark' })
      expect(configManager.getConfig().settings.theme).toBe('dark')

      configManager.updateSettings({ theme: 'light' })
      expect(configManager.getConfig().settings.theme).toBe('light')
    })
  })

  describe('语言设置', () => {
    it('应该有默认语言或可以设置语言', () => {
      // 设置语言（locale 可能不在默认配置中）
      configManager.updateSettings({ locale: 'en-US' })
      expect(configManager.getConfig().settings.locale).toBe('en-US')
    })

    it('应该能切换语言', () => {
      configManager.updateSettings({ locale: 'en-US' })
      expect(configManager.getConfig().settings.locale).toBe('en-US')

      configManager.updateSettings({ locale: 'zh-CN' })
      expect(configManager.getConfig().settings.locale).toBe('zh-CN')
    })
  })

  describe('超时配置', () => {
    it('应该能获取超时设置', () => {
      const timeout = configManager.getTimeout()
      expect(timeout).toBeDefined()
      expect(timeout.test).toBeGreaterThan(0)
      expect(timeout.request).toBeGreaterThan(0)
    })

    it('应该能更新超时设置', () => {
      configManager.updateTimeout({ test: 60000, request: 300000 })

      const timeout = configManager.getTimeout()
      expect(timeout.test).toBe(60000)
      expect(timeout.request).toBe(300000)
    })
  })

  describe('配置持久化', () => {
    it('应该能保存配置到文件', async () => {
      await configManager.updateSettings({ theme: 'dark' })

      const configPath = path.join(testTempDir, 'config.json')
      expect(fs.existsSync(configPath)).toBe(true)

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.settings.theme).toBe('dark')
    })

    it('应该能从文件加载配置', async () => {
      // 先保存一个配置
      await configManager.updateSettings({ theme: 'dark' })

      // 重新导入模块获得新实例
      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })

      expect(newConfigManager.getConfig().settings.theme).toBe('dark')
    })

    it('应该把旧的市场主备顺序迁移为仅保留 Gitee 主源并写回磁盘', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        market: {
          registryUrl: 'https://raw.githubusercontent.com/hydroCoderClaud/hydroSkills/main',
          registryMirrorUrl: 'https://gitee.com/reistlin/hydroskills/raw/main',
          registryFallbackUrls: ['https://gitee.com/reistlin/hydroskills/raw/main']
        }
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      expect(newConfigManager.getConfig().market.registryUrl).toBe('https://gitee.com/reistlin/hydroskills/raw/main')
      expect(newConfigManager.getConfig().market.registryMirrorUrl).toBe('')
      expect(newConfigManager.getConfig().market.registryFallbackUrls).toBeUndefined()

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.market.registryUrl).toBe('https://gitee.com/reistlin/hydroskills/raw/main')
      expect(savedConfig.market.registryMirrorUrl).toBe('')
      expect(savedConfig.market.registryFallbackUrls).toBeUndefined()
    })

    it('应该把空的运行时配置目录迁移为 HydroAgent 固定目录', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        settings: {
          agent: {
            claudeConfigDir: ''
          }
        }
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(newConfigManager.getConfig().settings.agent.claudeConfigDir).toBe(dedicatedConfigDir)
      expect(savedConfig.settings.agent.claudeConfigDir).toBe(dedicatedConfigDir)
    })

    it('应该从旧配置中清理全局会话限制字段', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        settings: {
          maxActiveSessions: 8,
          maxHistorySessions: 30
        }
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(newConfigManager.getConfig().settings).not.toHaveProperty('maxActiveSessions')
      expect(newConfigManager.getConfig().settings).not.toHaveProperty('maxHistorySessions')
      expect(savedConfig.settings).not.toHaveProperty('maxActiveSessions')
      expect(savedConfig.settings).not.toHaveProperty('maxHistorySessions')
    })

    it('updateSettings 不应重新写入全局会话限制字段', async () => {
      await configManager.updateSettings({
        maxActiveSessions: 9,
        maxHistorySessions: 40,
        theme: 'dark'
      })

      const configPath = path.join(testTempDir, 'config.json')
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(configManager.getConfig().settings.theme).toBe('dark')
      expect(configManager.getConfig().settings).not.toHaveProperty('maxActiveSessions')
      expect(configManager.getConfig().settings).not.toHaveProperty('maxHistorySessions')
      expect(savedConfig.settings).not.toHaveProperty('maxActiveSessions')
      expect(savedConfig.settings).not.toHaveProperty('maxHistorySessions')
    })

    it('应该为缺失的运行时配置目录补 HydroAgent 固定目录并写回磁盘', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        settings: {
          agent: {
            outputBaseDir: ''
          }
        }
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(newConfigManager.getConfig().settings.agent.claudeConfigDir).toBe(dedicatedConfigDir)
      expect(savedConfig.settings.agent.claudeConfigDir).toBe(dedicatedConfigDir)
    })

    it('保存自定义运行时配置目录时应收回到 HydroAgent 固定目录', () => {
      const customDir = path.join(testTempDir, 'hydro-agent-config')
      const config = configManager.getConfig()
      config.settings.agent.claudeConfigDir = `  ${customDir}  `

      configManager.updateConfig(config)

      expect(configManager.getConfig().settings.agent.claudeConfigDir).toBe(dedicatedConfigDir)
      expect(fs.existsSync(customDir)).toBe(false)
    })

    it('保存自定义运行时配置目录为文件路径时应忽略并收回到 HydroAgent 固定目录', () => {
      const filePath = path.join(testTempDir, 'not-a-directory')
      fs.writeFileSync(filePath, 'not a directory', 'utf-8')
      const config = JSON.parse(JSON.stringify(configManager.getConfig()))
      config.settings.agent.claudeConfigDir = filePath

      expect(() => configManager.updateConfig(config)).not.toThrow()
      expect(configManager.getConfig().settings.agent.claudeConfigDir).toBe(dedicatedConfigDir)
    })

    it('应该把旧的 GitHub 主更新源 + 阿里镜像迁移为阿里主源 + GitHub 备用并写回磁盘', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        updatePrimaryUrl: '',
        updateGithub: {
          owner: 'hydroCoderClaud',
          repo: 'cc-desktop'
        },
        updateMirrorUrl: 'https://hdupdate.myseek.fun/hydrodesktop_update'
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      expect(newConfigManager.getConfig().updatePrimaryUrl).toBe('https://hdupdate.myseek.fun/hydrodesktop_update')
      expect(newConfigManager.getConfig().updateMirrorUrl).toBe('')

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.updatePrimaryUrl).toBe('https://hdupdate.myseek.fun/hydrodesktop_update')
      expect(savedConfig.updateMirrorUrl).toBe('')
    })

    it('应该删除旧 profile.customModels 字段且不再凭空补默认 sonnet 模型', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        apiProfiles: [{
          id: 'p1',
          name: 'Proxy',
          baseUrl: 'https://example.com',
          authToken: 'token',
          serviceProvider: 'other',
          selectedModelTier: 'sonnet',
          customModels: [
            { id: 'glm-4.5', name: 'GLM 4.5', tier: 'sonnet' }
          ]
        }]
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue
      const profile = newConfigManager.getConfig().apiProfiles[0]

      expect(profile.selectedModelId).toBe('')
      expect(profile).not.toHaveProperty('selectedModelTier')
      expect(profile.customModels).toBeUndefined()

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.apiProfiles[0]).not.toHaveProperty('selectedModelTier')
      expect(savedConfig.apiProfiles[0].customModels).toBeUndefined()
    })

    it('服务商默认模型列表不应混入 profile 历史模型', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        serviceProviderDefinitions: [{
          id: 'other',
          name: 'Other',
          baseUrl: 'https://example.com',
          defaultModels: ['model-a']
        }],
        apiProfiles: [{
          id: 'p1',
          name: 'Proxy',
          baseUrl: 'https://example.com',
          authToken: 'token',
          serviceProvider: 'other',
          selectedModelId: 'model-b',
          customModels: [
            { id: 'model-c', name: 'Model C', tier: 'sonnet' }
          ]
        }]
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      const profile = newConfigManager.getConfig().apiProfiles[0]

      expect(profile.defaultModels).toEqual(['model-a'])
      expect(profile.customModels).toBeUndefined()
    })

    it('服务商定义更新不持久化已废弃的模型映射', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Qwen',
        authToken: 'token',
        serviceProvider: 'qwen',
        baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic'
      })

      await configManager.updateAPIProfile(profile.id, {
        defaultModelMapping: {
          opus: 'claude-opus-4-7',
          sonnet: 'claude-sonnet-4-6',
          haiku: 'claude-haiku-4-5-20251001'
        }
      })
      await configManager.saveQueue

      const updatedProfile = configManager.getAPIProfile(profile.id)

      expect(updatedProfile).not.toHaveProperty('defaultModelMapping')

      const savedConfig = JSON.parse(fs.readFileSync(path.join(testTempDir, 'config.json'), 'utf-8'))
      expect(savedConfig.serviceProviderDefinitions).toBeUndefined()
      expect(savedConfig.apiProfiles[0]).not.toHaveProperty('defaultModelMapping')
    })

    it('更新 Profile 时应拒绝重新写入已废弃的服务商字段', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Standalone API',
        authToken: 'token',
        baseUrl: 'https://example.com'
      })

      await configManager.updateAPIProfile(profile.id, {
        serviceProvider: 'legacy-provider',
        providerName: 'Legacy Provider',
        category: 'legacy-category',
        defaultModels: ['model-a'],
        selectedModelId: 'model-a'
      })
      await configManager.saveQueue

      const updatedProfile = configManager.getAPIProfile(profile.id)
      expect(updatedProfile).not.toHaveProperty('serviceProvider')
      expect(updatedProfile).not.toHaveProperty('providerName')
      expect(updatedProfile).not.toHaveProperty('category')
      expect(updatedProfile.defaultModels).toEqual(['model-a'])
      expect(updatedProfile.selectedModelId).toBe('model-a')
    })

    it('falls back when an update removes the selected model', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Update Fallback Profile',
        authToken: 'token',
        defaultModels: ['model-a', 'model-b'],
        selectedModelId: 'model-a'
      })

      await configManager.updateAPIProfile(profile.id, {
        defaultModels: ['model-b', 'model-c']
      })
      await configManager.saveQueue

      const updatedProfile = configManager.getAPIProfile(profile.id)
      expect(updatedProfile.defaultModels).toEqual(['model-b', 'model-c'])
      expect(updatedProfile.selectedModelId).toBe('model-b')
    })

    it('clears the selected model when an update removes every model', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Empty Models Profile',
        authToken: 'token',
        defaultModels: ['model-a'],
        selectedModelId: 'model-a'
      })

      await configManager.updateAPIProfile(profile.id, {
        defaultModels: []
      })
      await configManager.saveQueue

      const updatedProfile = configManager.getAPIProfile(profile.id)
      expect(updatedProfile.defaultModels).toEqual([])
      expect(updatedProfile.selectedModelId).toBe('')
    })

    it('旧 settings.api 迁移后不应写入已废弃的 selectedModelTier 或默认 sonnet 模型', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        settings: {
          api: {
            authToken: 'token',
            baseUrl: 'https://example.com'
          }
        }
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      const profile = newConfigManager.getConfig().apiProfiles[0]
      expect(profile.selectedModelId).toBe('')
      expect(profile).not.toHaveProperty('selectedModelTier')

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.settings.api).toBeUndefined()
      expect(savedConfig.apiProfiles[0].selectedModelId).toBe('')
      expect(savedConfig.apiProfiles[0]).not.toHaveProperty('selectedModelTier')
    })

    it('保留旧 settings.api 中的模型并将其纳入迁移后的模型列表', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        settings: {
          api: {
            authToken: 'token',
            baseUrl: 'https://example.com',
            model: 'legacy-model'
          }
        }
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const migratedManager = new NewConfigManager({ userDataPath: testTempDir })
      await migratedManager.saveQueue

      const profile = migratedManager.getConfig().apiProfiles[0]
      expect(profile.defaultModels).toEqual(['legacy-model'])
      expect(profile.selectedModelId).toBe('legacy-model')
    })

    it('HTTP 测试在缺少 selectedModelId 时应直接失败', async () => {
      const { createServer } = await import('http')
      let capturedBody = ''
      const server = createServer((req, res) => {
        req.on('data', chunk => {
          capturedBody += chunk
        })
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{}')
        })
      })

      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null

      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        defaultProfileId: 'p1',
        serviceProviderDefinitions: [{
          id: 'other',
          name: 'Other',
          baseUrl: `http://127.0.0.1:${port}`,
          defaultModels: ['provider-default-model']
        }],
        apiProfiles: [{
          id: 'p1',
          name: 'Proxy',
          baseUrl: `http://127.0.0.1:${port}`,
          authToken: 'token',
          serviceProvider: 'other',
          selectedModelId: '',
          selectedModelTier: 'sonnet',
          modelMapping: {
            sonnet: 'mapped-model'
          }
        }]
      }), 'utf-8')

      vi.resetModules()

      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })
      await newConfigManager.saveQueue

      try {
        const result = await newConfigManager.testAPIConnectionViaHTTP(newConfigManager.getAPIConfig())
        expect(result.success).toBe(false)
        expect(result.message).toContain('未配置模型 ID')
        expect(capturedBody).toBe('')
        expect(newConfigManager.getConfig().apiProfiles[0].modelMapping).toBeUndefined()
      } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      }
    })
  })

  describe('provider definition consolidation', () => {
    it('falls back to built-in provider fields when a stored definition is incomplete', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        serviceProviderDefinitions: [{ id: 'qwen' }],
        apiProfiles: [{
          id: 'p1',
          name: 'Qwen Legacy',
          authToken: 'token',
          serviceProvider: 'qwen',
          selectedModelId: 'stale-model'
        }]
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const migratedManager = new NewConfigManager({ userDataPath: testTempDir })
      await migratedManager.saveQueue

      const profile = migratedManager.getConfig().apiProfiles[0]
      expect(profile.baseUrl).toBe('https://coding.dashscope.aliyuncs.com/apps/anthropic')
      expect(profile.defaultModels.length).toBeGreaterThan(0)
      expect(profile.selectedModelId).toBe(profile.defaultModels[0])
    })

    it('moves provider fields into every linked profile without changing IDs or credentials', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        defaultProfileId: 'profile-b',
        serviceProviderDefinitions: [{
          id: 'custom-gateway',
          name: 'Custom Gateway',
          baseUrl: 'https://gateway.example.com/anthropic',
          defaultModels: ['gateway-fast', 'gateway-reasoning']
        }, {
          id: 'unused-template',
          name: 'Unused Template',
          baseUrl: 'https://unused.example.com',
          defaultModels: ['unused-model']
        }],
        apiProfiles: [{
          id: 'profile-a',
          name: 'Gateway Key A',
          authToken: 'key-a',
          authType: 'auth_token',
          serviceProvider: 'custom-gateway',
          selectedModelId: 'gateway-fast',
          useProxy: true,
          httpsProxy: 'http://127.0.0.1:7890',
          httpProxy: 'http://127.0.0.1:7890'
        }, {
          id: 'profile-b',
          name: 'Gateway Key B',
          authToken: 'key-b',
          authType: 'api_key',
          serviceProvider: 'custom-gateway',
          baseUrl: 'https://override.example.com/anthropic',
          defaultModels: ['override-model'],
          selectedModelId: 'override-model',
          isDefault: true
        }]
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const migratedManager = new NewConfigManager({ userDataPath: testTempDir })
      await migratedManager.saveQueue

      const migrated = migratedManager.getConfig()
      const profileA = migrated.apiProfiles.find(profile => profile.id === 'profile-a')
      const profileB = migrated.apiProfiles.find(profile => profile.id === 'profile-b')

      expect(migrated.defaultProfileId).toBe('profile-b')
      expect(migrated.serviceProviderDefinitions).toBeUndefined()
      expect(profileA).toMatchObject({
        id: 'profile-a',
        authToken: 'key-a',
        authType: 'auth_token',
        baseUrl: 'https://gateway.example.com/anthropic',
        defaultModels: ['gateway-fast', 'gateway-reasoning'],
        useProxy: true,
        httpsProxy: 'http://127.0.0.1:7890',
        httpProxy: 'http://127.0.0.1:7890'
      })
      expect(profileA).not.toHaveProperty('serviceProvider')
      expect(profileA).not.toHaveProperty('providerName')
      expect(profileB).toMatchObject({
        id: 'profile-b',
        authToken: 'key-b',
        baseUrl: 'https://override.example.com/anthropic',
        defaultModels: ['override-model']
      })

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.serviceProviderDefinitions).toBeUndefined()
      expect(savedConfig.apiProfiles.map(profile => profile.id)).toEqual(['profile-a', 'profile-b'])
    })

    it('does not turn unused provider templates into empty profiles', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        serviceProviderDefinitions: [{
          id: 'unused-template',
          name: 'Unused Template',
          baseUrl: 'https://unused.example.com',
          defaultModels: ['unused-model']
        }]
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const migratedManager = new NewConfigManager({ userDataPath: testTempDir })
      await migratedManager.saveQueue

      expect(migratedManager.getConfig().apiProfiles).toEqual([])
      expect(migratedManager.getConfig().serviceProviderDefinitions).toBeUndefined()
    })

    it.each([[], null, { id: 'malformed' }])('removes retired provider definitions when stored value is %j', async (legacyDefinitions) => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        serviceProviderDefinitions: legacyDefinitions,
        apiProfiles: []
      }), 'utf-8')

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const migratedManager = new NewConfigManager({ userDataPath: testTempDir })
      await migratedManager.saveQueue

      expect(migratedManager.getConfig().apiProfiles).toEqual([])
      expect(migratedManager.getConfig().serviceProviderDefinitions).toBeUndefined()

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.serviceProviderDefinitions).toBeUndefined()
    })
  })
})

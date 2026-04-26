/**
 * ConfigManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

// 创建临时测试目录
const testTempDir = path.join(os.tmpdir(), 'cc-desktop-test-' + Date.now())

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
      expect(config.settings).toBeDefined()
      expect(config.settings.theme).toBe('light')
      expect(config.settings.appMode).toBe('agent')
      expect(config.settings.enableDeveloperMode).toBe(true)
    })

    it('应该初始化内置服务商及其默认模型 ID 列表', () => {
      const providers = configManager.getServiceProviderDefinitions()
      const official = providers.find(provider => provider.id === 'official')
      const proxy = providers.find(provider => provider.id === 'proxy')

      expect(official?.defaultModels).toEqual([
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'claude-haiku-4-5'
      ])
      expect(proxy?.defaultModels).toEqual([
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'claude-haiku-4-5'
      ])
      expect(official?.needsMapping).toBe(true)
      expect(proxy?.needsMapping).toBe(true)
    })

    it('新增 profile 不应强制写入隐藏 selectedModelTier', async () => {
      const profile = configManager.addAPIProfile({
        name: 'Test Profile',
        authToken: 'token',
        serviceProvider: 'other',
        baseUrl: 'https://example.com',
        selectedModelId: 'glm-5.1'
      })
      await configManager.saveQueue

      expect(profile.selectedModelId).toBe('glm-5.1')
      expect(profile.selectedModelTier).toBeNull()
      expect(configManager.getAPIProfile(profile.id)?.selectedModelTier).toBeNull()
    })

    it('新增 profile 不应从 mapping 回填 selectedModelId', async () => {
      configManager.addServiceProviderDefinition({
        id: 'mapping-only-provider',
        name: 'Mapping Only Provider',
        baseUrl: 'https://example.com',
        defaultModels: []
      })

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
      expect(configManager.getAPIProfile(profile.id)?.selectedModelId).toBe('')
    })

    it('getAPIConfig 不应再从 tier 或 mapping 推导模型', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        defaultProfileId: 'p1',
        serviceProviderDefinitions: [{
          id: 'other',
          name: 'Other',
          needsMapping: true,
          baseUrl: 'https://example.com',
          defaultModelMapping: null,
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
      expect(apiConfig.selectedModelId).toBe('provider-default-model')
      expect(apiConfig.selectedModelTier).toBeNull()
      expect(newConfigManager.getConfig().apiProfiles[0].selectedModelTier).toBeNull()
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

    it('删除默认服务商后，重载配置不应自动补回', async () => {
      await configManager.deleteServiceProviderDefinition('other')

      expect(configManager.getServiceProviderDefinition('other')).toBeNull()

      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const reloadedConfigManager = new NewConfigManager({ userDataPath: testTempDir })

      expect(reloadedConfigManager.getServiceProviderDefinition('other')).toBeNull()
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

  describe('会话限制配置', () => {
    it('应该有默认的最大活动会话数', () => {
      const max = configManager.getMaxActiveSessions()
      expect(max).toBe(5)
    })

    it('应该能更新最大活动会话数', () => {
      configManager.updateMaxActiveSessions(10)
      expect(configManager.getMaxActiveSessions()).toBe(10)
    })

    it('应该有默认的最大历史会话数', () => {
      const max = configManager.getMaxHistorySessions()
      expect(max).toBe(10)
    })

    it('应该能更新最大历史会话数', () => {
      configManager.updateMaxHistorySessions(20)
      expect(configManager.getMaxHistorySessions()).toBe(20)
    })
  })

  describe('终端设置', () => {
    it('应该有默认的终端设置', () => {
      const settings = configManager.getTerminalSettings()
      expect(settings).toBeDefined()
      expect(settings.fontSize).toBe(14)
      expect(settings.fontFamily).toBeDefined()
    })

    it('应该能更新终端设置', () => {
      configManager.updateTerminalSettings({
        fontSize: 16,
        fontFamily: 'Consolas'
      })

      const settings = configManager.getTerminalSettings()
      expect(settings.fontSize).toBe(16)
      expect(settings.fontFamily).toBe('Consolas')
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
      await configManager.updateMaxActiveSessions(15)

      // 重新导入模块获得新实例
      vi.resetModules()
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager({ userDataPath: testTempDir })

      expect(newConfigManager.getConfig().settings.theme).toBe('dark')
      expect(newConfigManager.getMaxActiveSessions()).toBe(15)
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
      expect(profile.selectedModelTier).toBeNull()
      expect(profile.customModels).toBeUndefined()

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.apiProfiles[0].selectedModelTier).toBeNull()
      expect(savedConfig.apiProfiles[0].customModels).toBeUndefined()
    })

    it('服务商默认模型列表不应混入 profile 历史模型', async () => {
      const configPath = path.join(testTempDir, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify({
        serviceProviderDefinitions: [{
          id: 'other',
          name: 'Other',
          needsMapping: true,
          baseUrl: 'https://example.com',
          defaultModelMapping: null,
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
      const provider = newConfigManager.getServiceProviderDefinition('other')
      const profile = newConfigManager.getConfig().apiProfiles[0]

      expect(provider.defaultModels).toEqual(['model-a'])
      expect(profile.customModels).toBeUndefined()
    })

    it('official 服务商不再强制清空映射配置', async () => {
      await configManager.updateServiceProviderDefinition('official', {
        needsMapping: true,
        defaultModelMapping: {
          opus: 'claude-opus-4-7',
          sonnet: 'claude-sonnet-4-6',
          haiku: 'claude-haiku-4-5-20251001'
        }
      })

      const provider = configManager.getServiceProviderDefinition('official')

      expect(provider.needsMapping).toBe(true)
      expect(provider.defaultModelMapping).toEqual({
        opus: 'claude-opus-4-7',
        sonnet: 'claude-sonnet-4-6',
        haiku: 'claude-haiku-4-5-20251001'
      })
    })

    it('旧 settings.api 迁移后不应写入隐藏 selectedModelTier 或默认 sonnet 模型', async () => {
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
      expect(profile.selectedModelTier).toBeNull()

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.settings.api).toBeUndefined()
      expect(savedConfig.apiProfiles[0].selectedModelId).toBe('')
      expect(savedConfig.apiProfiles[0].selectedModelTier).toBeNull()
    })

    it('HTTP 测试不应从 tier 或 mapping 推导模型', async () => {
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
          needsMapping: true,
          baseUrl: `http://127.0.0.1:${port}`,
          defaultModelMapping: null,
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
        expect(result.success).toBe(true)
        expect(JSON.parse(capturedBody).model).toBe('provider-default-model')
      } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      }
    })
  })
})

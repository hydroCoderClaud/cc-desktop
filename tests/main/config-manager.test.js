/**
 * ConfigManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import { setupTestDir, cleanupTestDir, testTempDir } from '../setup.js'

// 在导入 ConfigManager 之前必须先设置 mock
import '../setup.js'

describe('ConfigManager', () => {
  let ConfigManager
  let configManager

  beforeEach(async () => {
    // 设置测试目录
    setupTestDir()

    // 清除模块缓存以获得新实例
    vi.resetModules()

    // 动态导入 ConfigManager
    const module = await import('../../src/main/config-manager.js')
    ConfigManager = module.default
    configManager = new ConfigManager()
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
    })

    it('应该有正确的默认全局模型', () => {
      const config = configManager.getConfig()
      expect(config.globalModels).toBeDefined()
      expect(config.globalModels.opus).toBeDefined()
      expect(config.globalModels.sonnet).toBeDefined()
      expect(config.globalModels.haiku).toBeDefined()
    })

    it('应该有正确的默认超时设置', () => {
      const config = configManager.getConfig()
      expect(config.timeout).toBeDefined()
      expect(config.timeout.test).toBeGreaterThan(0)
      expect(config.timeout.request).toBeGreaterThan(0)
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
      const theme = configManager.getTheme()
      expect(['light', 'dark']).toContain(theme)
    })

    it('应该能设置主题', () => {
      configManager.setTheme('dark')
      expect(configManager.getTheme()).toBe('dark')

      configManager.setTheme('light')
      expect(configManager.getTheme()).toBe('light')
    })
  })

  describe('语言设置', () => {
    it('应该有默认语言', () => {
      const locale = configManager.getLocale()
      expect(locale).toBeDefined()
    })

    it('应该能设置语言', () => {
      configManager.setLocale('en-US')
      expect(configManager.getLocale()).toBe('en-US')

      configManager.setLocale('zh-CN')
      expect(configManager.getLocale()).toBe('zh-CN')
    })
  })

  describe('全局模型配置', () => {
    it('应该能获取全局模型', () => {
      const models = configManager.getGlobalModels()
      expect(models).toBeDefined()
      expect(models.opus).toBeDefined()
      expect(models.sonnet).toBeDefined()
      expect(models.haiku).toBeDefined()
    })

    it('应该能更新全局模型', () => {
      const newModels = {
        opus: 'test-opus-model',
        sonnet: 'test-sonnet-model',
        haiku: 'test-haiku-model'
      }
      configManager.updateGlobalModels(newModels)

      const models = configManager.getGlobalModels()
      expect(models.opus).toBe('test-opus-model')
      expect(models.sonnet).toBe('test-sonnet-model')
      expect(models.haiku).toBe('test-haiku-model')
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
    it('应该能保存配置到文件', () => {
      configManager.setTheme('dark')

      const configPath = path.join(testTempDir, 'config.json')
      expect(fs.existsSync(configPath)).toBe(true)

      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(savedConfig.settings.theme).toBe('dark')
    })

    it('应该能从文件加载配置', async () => {
      // 先保存一个配置
      configManager.setTheme('dark')
      configManager.updateMaxActiveSessions(15)

      // 重新导入模块获得新实例
      vi.resetModules()
      await import('../setup.js')
      const module = await import('../../src/main/config-manager.js')
      const NewConfigManager = module.default
      const newConfigManager = new NewConfigManager()

      expect(newConfigManager.getTheme()).toBe('dark')
      expect(newConfigManager.getMaxActiveSessions()).toBe(15)
    })
  })
})

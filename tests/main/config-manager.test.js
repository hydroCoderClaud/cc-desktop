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
  })
})

/**
 * Playwright E2E 测试配置
 * 用于 Electron 应用的自动化测试
 */
const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000, // 每个测试 60 秒超时
  retries: 0, // 不重试，失败就失败
  workers: 1, // 串行运行，避免多个 Electron 实例冲突

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }]
  ]
})

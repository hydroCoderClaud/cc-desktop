/**
 * 测试全局设置
 * 用于 mock Electron 模块和其他全局依赖
 */

import { vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

// 创建临时测试目录
const testTempDir = path.join(os.tmpdir(), 'cc-desktop-test-' + Date.now())

// Mock Electron 模块
vi.mock('electron', () => ({
  app: {
    getPath: (name) => {
      if (name === 'userData') {
        return testTempDir
      }
      return testTempDir
    },
    getName: () => 'claude-code-desktop-test',
    getVersion: () => '1.0.0-test'
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

// 清理函数
export function setupTestDir() {
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true })
  }
  return testTempDir
}

export function cleanupTestDir() {
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true })
  }
}

export { testTempDir }

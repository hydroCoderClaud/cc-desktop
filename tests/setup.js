/**
 * 测试全局设置
 * 提供共享的测试工具函数
 */

import path from 'path'
import os from 'os'
import fs from 'fs'

/**
 * 创建临时测试目录
 * @param {string} prefix - 目录前缀
 * @returns {string} 临时目录路径
 */
export function createTestTempDir(prefix = 'cc-desktop-test') {
  const tempDir = path.join(os.tmpdir(), `${prefix}-${Date.now()}`)
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  return tempDir
}

/**
 * 清理测试目录
 * @param {string} dirPath - 要清理的目录路径
 */
export function cleanupTestDir(dirPath) {
  if (dirPath && fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true })
  }
}

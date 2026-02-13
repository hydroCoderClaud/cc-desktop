/**
 * Electron 应用启动辅助工具
 */
import { _electron as electron } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 启动 Electron 应用
 * @returns {Promise<{app, window}>}
 */
export async function launchElectronApp() {
  const electronPath = path.join(__dirname, '../../node_modules/.bin/electron')
  const appPath = path.join(__dirname, '../../src/main/index.js')

  const app = await electron.launch({
    executablePath: electronPath,
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  })

  // 等待第一个窗口
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  return { app, window }
}

/**
 * 关闭 Electron 应用
 * @param {Object} app - Electron 应用实例
 */
export async function closeElectronApp(app) {
  await app.close()
}

/**
 * Electron 应用启动辅助工具
 */
const { _electron: electron } = require('playwright')
const path = require('path')

/**
 * 启动 Electron 应用
 * @returns {Promise<{app, window}>}
 */
async function launchElectronApp() {
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
async function closeElectronApp(app) {
  await app.close()
}

module.exports = {
  launchElectronApp,
  closeElectronApp
}

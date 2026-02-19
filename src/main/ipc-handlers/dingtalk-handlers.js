/**
 * DingTalk IPC Handlers
 * 钉钉桥接相关的 IPC 处理器
 */

function setupDingTalkHandlers(ipcMain, dingtalkBridge, configManager) {
  if (!dingtalkBridge) {
    console.warn('[IPC] DingTalkBridge not available, skipping handlers')
    return
  }

  // 获取钉钉桥接状态
  ipcMain.handle('dingtalk:getStatus', async () => {
    return dingtalkBridge.getStatus()
  })

  // 启动钉钉桥接
  ipcMain.handle('dingtalk:start', async () => {
    return dingtalkBridge.start()
  })

  // 停止钉钉桥接
  ipcMain.handle('dingtalk:stop', async () => {
    await dingtalkBridge.stop()
    return true
  })

  // 重启钉钉桥接（配置变更后）
  ipcMain.handle('dingtalk:restart', async () => {
    return dingtalkBridge.restart()
  })

  // 更新钉钉配置并重启
  ipcMain.handle('dingtalk:updateConfig', async (event, { appKey, appSecret, enabled, defaultCwd }) => {
    const config = configManager.getConfig()
    config.dingtalk = {
      ...config.dingtalk,
      appKey: appKey !== undefined ? appKey : config.dingtalk?.appKey || '',
      appSecret: appSecret !== undefined ? appSecret : config.dingtalk?.appSecret || '',
      enabled: enabled !== undefined ? enabled : config.dingtalk?.enabled || false,
      defaultCwd: defaultCwd !== undefined ? defaultCwd : config.dingtalk?.defaultCwd || ''
    }
    await configManager.save(config)

    // 根据 enabled 状态启动或停止
    if (config.dingtalk.enabled) {
      return dingtalkBridge.restart()
    } else {
      await dingtalkBridge.stop()
      return false
    }
  })
}

module.exports = { setupDingTalkHandlers }

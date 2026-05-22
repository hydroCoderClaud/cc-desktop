/**
 * Feishu IPC Handlers
 * 飞书桥接相关的 IPC 处理器
 */

function setupFeishuHandlers(ipcMain, feishuBridge, configManager) {
  if (!feishuBridge) {
    console.warn('[IPC] FeishuBridge not available, skipping handlers')
    return
  }

  // 获取飞书桥接状态
  ipcMain.handle('feishu:getStatus', async () => {
    return feishuBridge.getStatus()
  })

  // 启动飞书桥接
  ipcMain.handle('feishu:start', async () => {
    return feishuBridge.start()
  })

  // 停止飞书桥接
  ipcMain.handle('feishu:stop', async () => {
    await feishuBridge.stop()
    return true
  })

  // 重启飞书桥接
  ipcMain.handle('feishu:restart', async () => {
    return feishuBridge.restart()
  })

  // 更新飞书配置并重启
  ipcMain.handle('feishu:updateConfig', async (event, { appId, appSecret, enabled, defaultCwd, maxHistorySessions }) => {
    const config = configManager.getConfig()
    config.feishu = {
      ...config.feishu,
      appId: appId !== undefined ? appId : config.feishu?.appId || '',
      appSecret: appSecret !== undefined ? appSecret : config.feishu?.appSecret || '',
      enabled: enabled !== undefined ? enabled : config.feishu?.enabled || false,
      defaultCwd: defaultCwd !== undefined ? defaultCwd : config.feishu?.defaultCwd || '',
      maxHistorySessions: maxHistorySessions !== undefined ? maxHistorySessions : config.feishu?.maxHistorySessions || 5,
    }
    await configManager.save(config)

    if (config.feishu.enabled) {
      return feishuBridge.restart()
    } else {
      await feishuBridge.stop()
      return false
    }
  })
}

module.exports = { setupFeishuHandlers }

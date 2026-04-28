function setupWeixinNotifyHandlers(ipcMain, weixinNotifyService, weixinBridge, mainWindow = null, options = {}) {
  if (!weixinNotifyService) {
    console.warn('[IPC] WeixinNotifyService not available, skipping handlers')
    return
  }

  const assertTrustedSender = (event) => {
    const expectedWebContents = mainWindow?.webContents
    const trustedByExtension = typeof options.isTrustedSender === 'function'
      ? options.isTrustedSender(event?.sender)
      : false
    if (expectedWebContents && event?.sender !== expectedWebContents && !trustedByExtension) {
      throw new Error('未授权的微信通知 IPC 调用')
    }
  }

  const handleTrusted = (handler) => async (event, ...args) => {
    try {
      assertTrustedSender(event)
      return await handler(...args)
    } catch (err) {
      return { error: err.message }
    }
  }

  ipcMain.handle('weixin-notify:startLogin', handleTrusted(async (options = {}) => {
    return await weixinNotifyService.startLogin(options)
  }))

  ipcMain.handle('weixin-notify:waitLogin', handleTrusted(async (options = {}) => {
    return await weixinNotifyService.waitLogin(options)
  }))

  ipcMain.handle('weixin-notify:listAccounts', handleTrusted(async () => {
    return weixinNotifyService.listAccounts()
  }))

  ipcMain.handle('weixin-notify:listTargets', handleTrusted(async () => {
    return weixinNotifyService.listTargets()
  }))

  ipcMain.handle('weixin-notify:updateTarget', handleTrusted(async (payload = {}) => {
    return weixinNotifyService.updateTarget(payload)
  }))

  ipcMain.handle('weixin-notify:deleteTarget', handleTrusted(async (payload = {}) => {
    return weixinNotifyService.deleteTarget(payload)
  }))

  ipcMain.handle('weixin-notify:pollOnce', handleTrusted(async (options = {}) => {
    return await weixinNotifyService.pollOnce(options)
  }))

  ipcMain.handle('weixin-notify:sendText', handleTrusted(async (payload = {}) => {
    return await weixinNotifyService.sendText(payload)
  }))

  // ========================================
  // 会话与微信目标绑定
  // ========================================
  if (weixinBridge) {
    ipcMain.handle('weixin-notify:bindSessionToTarget', handleTrusted(async (payload = {}) => {
      return weixinBridge.bindSessionToTarget(payload.sessionId, {
        accountId: payload.accountId,
        targetId: payload.targetId,
        displayName: payload.displayName
      })
    }))

    ipcMain.handle('weixin-notify:unbindSessionTarget', handleTrusted(async (payload = {}) => {
      return weixinBridge.unbindSessionTarget(payload.sessionId)
    }))

    ipcMain.handle('weixin-notify:getSessionBinding', handleTrusted(async (sessionId) => {
      const binding = weixinBridge.getSessionBinding(sessionId)
      return binding || null
    }))
  }
}

module.exports = {
  setupWeixinNotifyHandlers
}

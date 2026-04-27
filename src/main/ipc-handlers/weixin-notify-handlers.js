function setupWeixinNotifyHandlers(ipcMain, weixinNotifyService, weixinBridge) {
  if (!weixinNotifyService) {
    console.warn('[IPC] WeixinNotifyService not available, skipping handlers')
    return
  }

  ipcMain.handle('weixin-notify:startLogin', async (_event, options = {}) => {
    try {
      return await weixinNotifyService.startLogin(options)
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('weixin-notify:waitLogin', async (_event, options = {}) => {
    try {
      return await weixinNotifyService.waitLogin(options)
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('weixin-notify:listAccounts', async () => {
    return weixinNotifyService.listAccounts()
  })

  ipcMain.handle('weixin-notify:listTargets', async () => {
    return weixinNotifyService.listTargets()
  })

  ipcMain.handle('weixin-notify:updateTarget', async (_event, payload = {}) => {
    try {
      return weixinNotifyService.updateTarget(payload)
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('weixin-notify:deleteTarget', async (_event, payload = {}) => {
    try {
      return weixinNotifyService.deleteTarget(payload)
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('weixin-notify:pollOnce', async (_event, options = {}) => {
    try {
      return await weixinNotifyService.pollOnce(options)
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('weixin-notify:sendText', async (_event, payload = {}) => {
    try {
      return await weixinNotifyService.sendText(payload)
    } catch (err) {
      return { error: err.message }
    }
  })

  // ========================================
  // 会话与微信目标绑定
  // ========================================
  if (weixinBridge) {
    ipcMain.handle('weixin-notify:bindSessionToTarget', async (_event, payload = {}) => {
      try {
        return weixinBridge.bindSessionToTarget(payload.sessionId, {
          accountId: payload.accountId,
          targetId: payload.targetId,
          displayName: payload.displayName
        })
      } catch (err) {
        return { error: err.message }
      }
    })

    ipcMain.handle('weixin-notify:unbindSessionTarget', async (_event, payload = {}) => {
      try {
        return weixinBridge.unbindSessionTarget(payload.sessionId)
      } catch (err) {
        return { error: err.message }
      }
    })

    ipcMain.handle('weixin-notify:getSessionBinding', async (_event, sessionId) => {
      try {
        const binding = weixinBridge.getSessionBinding(sessionId)
        return binding || null
      } catch (err) {
        return { error: err.message }
      }
    })
  }
}

module.exports = {
  setupWeixinNotifyHandlers
}

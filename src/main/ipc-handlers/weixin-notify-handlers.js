function setupWeixinNotifyHandlers(ipcMain, weixinNotifyService) {
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
}

module.exports = {
  setupWeixinNotifyHandlers
}

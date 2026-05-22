/**
 * IM 前端通知 helper
 *
 * 统一向 renderer 推送外部 IM 会话事件，取代各 bridge 中重复的
 * mainWindow.webContents.send() 调用。
 *
 * 事件命名约定：{imType}:sessionCreated / {imType}:sessionClosed /
 *               {imType}:messageReceived / {imType}:statusChange / {imType}:error
 *
 * 所有 IM 渠道共用此模块。
 */

class ImFrontendNotifier {
  /**
   * @param {import('electron').BrowserWindow|null} mainWindow
   * @param {string} imType - IM 渠道 id（dingtalk / weixin / feishu）
   */
  constructor(mainWindow, imType) {
    this._mainWindow = mainWindow
    this._imType = imType
  }

  /**
   * 更新主窗口引用（窗口重建后调用）
   * @param {import('electron').BrowserWindow|null} win
   */
  setMainWindow(win) {
    this._mainWindow = win
  }

  /** @private */
  _send(channel, data) {
    try {
      this._mainWindow?.webContents?.send(channel, data)
    } catch {
      // 窗口已销毁，静默忽略
    }
  }

  // ─── 公共 API ───

  notifySessionCreated(payload) {
    this._send(`${this._imType}:sessionCreated`, payload)
  }

  notifySessionClosed(payload) {
    this._send(`${this._imType}:sessionClosed`, payload)
  }

  notifyMessageReceived(payload) {
    this._send(`${this._imType}:messageReceived`, payload)
  }

  notifyStatusChange(payload) {
    this._send(`${this._imType}:statusChange`, payload)
  }

  notifyError(payload) {
    this._send(`${this._imType}:error`, payload)
  }

  /**
   * 获取事件 channel 名称（供 preload 注册监听器时使用）
   * @param {string} eventName - sessionCreated / sessionClosed / messageReceived / statusChange / error
   */
  channel(eventName) {
    return `${this._imType}:${eventName}`
  }
}

module.exports = { ImFrontendNotifier }

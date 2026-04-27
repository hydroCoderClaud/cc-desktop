const crypto = require('crypto')
const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
const DEFAULT_BOT_TYPE = '3'
const CHANNEL_VERSION = '2.1.7'
const ILINK_APP_ID = 'bot'
const ILINK_APP_CLIENT_VERSION = String((2 << 16) | (1 << 8) | 7)
const QR_LOGIN_TTL_MS = 5 * 60 * 1000
const QR_POLL_TIMEOUT_MS = 35 * 1000
const API_TIMEOUT_MS = 15 * 1000
const UPDATES_TIMEOUT_MS = 45 * 1000
const BACKGROUND_POLL_INTERVAL_MS = 1000

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

function buildClientId() {
  return `hydro-weixin-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

async function buildQRCodeDataUrl(content) {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 6,
    type: 'image/png'
  })
}

function getTextFromMessage(message) {
  const textItem = Array.isArray(message?.item_list)
    ? message.item_list.find(item => item?.type === 1 && item?.text_item?.text)
    : null
  return textItem?.text_item?.text || ''
}

function publicAccount(account) {
  if (!account) return null
  return {
    accountId: account.accountId,
    userId: account.userId || null,
    baseUrl: account.baseUrl || DEFAULT_BASE_URL,
    savedAt: account.savedAt || null,
    hasToken: Boolean(account.token)
  }
}

function publicTarget(target) {
  if (!target) return null
  return {
    id: target.id,
    accountId: target.accountId,
    accountUserId: target.accountUserId || null,
    userId: target.userId,
    displayName: target.displayName || target.userId,
    targetSource: target.targetSource || (target.accountUserId && target.accountUserId === target.userId ? 'authorized_user' : 'inbound_context'),
    isAuthorizedAccountUser: Boolean(target.accountUserId && target.accountUserId === target.userId),
    preferred: target.preferred !== false,
    supersededAt: target.supersededAt || null,
    lastSeenAt: target.lastSeenAt || null,
    lastSentAt: target.lastSentAt || null,
    lastInboundText: target.lastInboundText || '',
    contextExpiredAt: target.contextExpiredAt || null,
    lastError: target.lastError || null,
    hasContextToken: Boolean(target.contextToken && !target.contextExpiredAt)
  }
}

function getWeixinBusinessError(response, action) {
  if (!response || typeof response !== 'object') return
  const ret = Number(response.ret ?? 0)
  const errcode = Number(response.errcode ?? 0)
  if (ret !== 0 || errcode !== 0) {
    const message = response.errmsg || response.message || JSON.stringify(response)
    const error = new Error(`微信接口 ${action} 失败：ret=${ret} errcode=${errcode} ${message}`)
    error.ret = ret
    error.errcode = errcode
    return error
  }
  return null
}

function assertWeixinResponseOk(response, action) {
  const error = getWeixinBusinessError(response, action)
  if (error) throw error
}

function buildSessionTimeoutError(action) {
  const error = new Error(
    `微信接口 ${action} 失败：会话已过期，请让该微信用户重新给 bot 发送一条消息，然后点击“捕获最新消息”刷新目标。`
  )
  error.errcode = -14
  return error
}

function publicSendResponse(response) {
  if (!response || typeof response !== 'object') return {}
  return {
    ret: response.ret ?? null,
    errcode: response.errcode ?? null,
    errmsg: response.errmsg || response.message || null
  }
}

class WeixinNotifyService {
  constructor(configManager, options = {}) {
    this.configManager = configManager
    this.stateDir = options.stateDir || path.join(configManager.userDataPath, 'weixin-notify')
    this.statePath = path.join(this.stateDir, 'state.json')
    this.activeLogins = new Map()
    this.state = this._loadState()
    this.events = new EventEmitter()
    this.pollQueue = Promise.resolve()
    this.backgroundTimer = null
    this.backgroundStopped = true
    this.backgroundPollIntervalMs = Math.max(Number(options.backgroundPollIntervalMs) || BACKGROUND_POLL_INTERVAL_MS, 100)
    this.backgroundPollTimeoutMs = Math.min(
      Math.max(Number(options.backgroundPollTimeoutMs) || UPDATES_TIMEOUT_MS, 1000),
      UPDATES_TIMEOUT_MS
    )
  }

  start() {
    this.state = this._loadState()
    this.startBackgroundPolling()
  }

  stop() {
    this.stopBackgroundPolling()
    this.activeLogins.clear()
  }

  on(eventName, listener) {
    this.events.on(eventName, listener)
    return () => this.off(eventName, listener)
  }

  off(eventName, listener) {
    this.events.off(eventName, listener)
  }

  startBackgroundPolling() {
    if (!this.backgroundStopped) return
    this.backgroundStopped = false
    this._scheduleBackgroundPoll(0)
  }

  stopBackgroundPolling() {
    this.backgroundStopped = true
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer)
      this.backgroundTimer = null
    }
  }

  listAccounts() {
    this.state = this._loadState()
    return this.state.accounts.map(publicAccount)
  }

  listTargets() {
    this.state = this._loadState()
    return this.state.targets
      .filter(target => this._isVisibleTarget(target))
      .map(publicTarget)
  }

  updateTarget({ accountId, targetId, displayName } = {}) {
    const target = this._resolveTarget({ accountId, targetId })
    const normalizedName = String(displayName || '').trim()
    target.displayName = normalizedName || target.userId
    target.updatedAt = Date.now()
    this._saveState()
    return publicTarget(target)
  }

  deleteTarget({ accountId, targetId } = {}) {
    const target = this._resolveTarget({ accountId, targetId })
    target.deletedAt = Date.now()
    target.preferred = false
    this._saveState()
    return {
      deleted: true,
      target: publicTarget(target)
    }
  }

  async startLogin({ force = false } = {}) {
    const sessionKey = crypto.randomUUID()
    if (!force) {
      for (const login of this.activeLogins.values()) {
        if (Date.now() - login.startedAt < QR_LOGIN_TTL_MS && login.qrcodeUrl) {
          return {
            sessionKey: login.sessionKey,
            qrcodeUrl: login.qrcodeUrl,
            qrcodeContent: login.qrcodeContent,
            message: '二维码已就绪，请使用微信扫描。'
          }
        }
      }
    }

    const result = await this._apiGet(
      DEFAULT_BASE_URL,
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(DEFAULT_BOT_TYPE)}`
    )
    if (!result?.qrcode || !result?.qrcode_img_content) {
      throw new Error('微信二维码响应异常')
    }

    const qrcodeContent = result.qrcode_img_content
    const qrcodeUrl = await buildQRCodeDataUrl(qrcodeContent)

    const login = {
      sessionKey,
      qrcode: result.qrcode,
      qrcodeUrl,
      qrcodeContent,
      startedAt: Date.now(),
      baseUrl: DEFAULT_BASE_URL
    }
    this.activeLogins.set(sessionKey, login)

    return {
      sessionKey,
      qrcodeUrl: login.qrcodeUrl,
      qrcodeContent: login.qrcodeContent,
      message: '使用微信扫描二维码并确认授权。'
    }
  }

  async waitLogin({ sessionKey, timeoutMs = QR_LOGIN_TTL_MS } = {}) {
    const login = this.activeLogins.get(sessionKey)
    if (!login) {
      throw new Error('当前没有进行中的微信登录，请先生成二维码')
    }
    if (Date.now() - login.startedAt >= QR_LOGIN_TTL_MS) {
      this.activeLogins.delete(sessionKey)
      throw new Error('二维码已过期，请重新生成')
    }

    const deadline = Date.now() + Math.max(Number(timeoutMs) || QR_LOGIN_TTL_MS, 1000)
    while (Date.now() < deadline) {
      const status = await this._pollLoginStatus(login)
      if (status.status === 'scaned_but_redirect' && status.redirect_host) {
        login.baseUrl = `https://${status.redirect_host}`
      }
      if (status.status === 'expired') {
        this.activeLogins.delete(sessionKey)
        throw new Error('二维码已过期，请重新生成')
      }
      if (status.status === 'confirmed') {
        if (!status.bot_token || !status.ilink_bot_id) {
          throw new Error('登录确认但服务器未返回完整账号凭证')
        }
        this.activeLogins.delete(sessionKey)
        const account = {
          accountId: status.ilink_bot_id,
          token: status.bot_token,
          baseUrl: status.baseurl || login.baseUrl || DEFAULT_BASE_URL,
          userId: status.ilink_user_id || null,
          savedAt: Date.now()
        }
        this._upsertAccount(account)
        this._saveState()
        return {
          connected: true,
          account: publicAccount(account)
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('微信扫码登录超时')
  }

  async pollOnce({ accountId, timeoutMs } = {}) {
    const run = () => this._pollOnceUnlocked({ accountId, timeoutMs })
    this.pollQueue = this.pollQueue.then(run, run)
    return this.pollQueue
  }

  async _pollOnceUnlocked({ accountId, timeoutMs } = {}) {
    const accounts = accountId ? [this._requireAccount(accountId)] : this.state.accounts
    const messages = []
    const targets = []
    const pollTimeoutMs = Math.min(
      Math.max(Number(timeoutMs) || UPDATES_TIMEOUT_MS, 1000),
      UPDATES_TIMEOUT_MS
    )

    for (const account of accounts) {
      const response = await this._apiPost(account.baseUrl, 'ilink/bot/getupdates', account.token, {
        get_updates_buf: account.cursor || '',
        base_info: { channel_version: CHANNEL_VERSION }
      }, pollTimeoutMs)
      assertWeixinResponseOk(response, 'getupdates')

      if (response.get_updates_buf) {
        account.cursor = response.get_updates_buf
      }

      for (const message of response.msgs || []) {
        if (!message?.from_user_id) continue
        const text = getTextFromMessage(message)
        if (!text && !message.context_token) continue
        const target = this._upsertTarget({
          accountId: account.accountId,
          accountUserId: account.userId || null,
          userId: message.from_user_id,
          contextToken: message.context_token || null,
          targetSource: account.userId && account.userId === message.from_user_id ? 'authorized_user' : 'inbound_context',
          lastInboundText: text,
          lastSeenAt: Date.now(),
          contextExpiredAt: null,
          lastError: null
        })
        const publicMessageTarget = publicTarget(target)
        targets.push(publicMessageTarget)
        messages.push({
          accountId: account.accountId,
          targetId: target.id,
          from: message.from_user_id,
          text,
          hasContextToken: Boolean(message.context_token),
          contextToken: message.context_token || null,
          createTimeMs: message.create_time_ms || null,
          target: publicMessageTarget
        })
      }
    }

    this._saveState()
    const result = { messages, targets }
    this._emitInboundMessages(messages)
    return result
  }

  async sendText({ accountId, targetId, text, sessionId } = {}) {
    const normalizedText = String(text || '').trim()
    if (!normalizedText) throw new Error('发送内容不能为空')

    const target = this._resolveTarget({ accountId, targetId })
    const account = this._requireAccount(target.accountId)
    if (!target.contextToken) {
      throw new Error('目标缺少 contextToken，请先让该微信用户向 bot 发送一条消息')
    }

    const clientId = buildClientId()
    const response = await this._apiPost(account.baseUrl, 'ilink/bot/sendmessage', account.token, {
      msg: {
        from_user_id: '',
        to_user_id: target.userId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        context_token: target.contextToken,
        item_list: [{ type: 1, text_item: { text: normalizedText } }]
      },
      base_info: { channel_version: CHANNEL_VERSION }
    }, API_TIMEOUT_MS)
    const businessError = getWeixinBusinessError(response, 'sendmessage')
    if (businessError?.errcode === -14 || businessError?.ret === -14) {
      target.contextExpiredAt = Date.now()
      target.lastError = 'session timeout'
      this._saveState()
      throw buildSessionTimeoutError('sendmessage')
    }
    if (businessError) throw businessError

    target.lastSentAt = Date.now()
    target.contextExpiredAt = null
    target.lastError = null
    this._saveState()
    const result = {
      success: true,
      messageId: clientId,
      response: publicSendResponse(response),
      target: publicTarget(target)
    }
    this.events.emit('sent', {
      accountId: target.accountId,
      targetId: target.id,
      sessionId: sessionId || null,
      messageId: clientId,
      text: normalizedText,
      target: result.target
    })
    return result
  }

  _loadState() {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'))
        return {
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
          targets: Array.isArray(parsed.targets) ? parsed.targets : []
        }
      }
    } catch (err) {
      console.warn('[WeixinNotify] Failed to load state:', err.message)
    }
    return { accounts: [], targets: [] }
  }

  _saveState() {
    fs.mkdirSync(this.stateDir, { recursive: true })
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8')
    try {
      fs.chmodSync(this.statePath, 0o600)
    } catch {
      // Windows may ignore chmod.
    }
  }

  _upsertAccount(account) {
    if (account.userId) {
      const staleAccountIds = this.state.accounts
        .filter(item => item.userId === account.userId && item.accountId !== account.accountId)
        .map(item => item.accountId)
      if (staleAccountIds.length) {
        const staleAccountIdSet = new Set(staleAccountIds)
        this.state.accounts = this.state.accounts.filter(item => !staleAccountIdSet.has(item.accountId))
        for (const target of this.state.targets) {
          if (staleAccountIdSet.has(target.accountId)) {
            target.preferred = false
            target.supersededAt = target.supersededAt || Date.now()
          }
        }
      }
    }

    const existingIndex = this.state.accounts.findIndex(item => item.accountId === account.accountId)
    if (existingIndex >= 0) {
      this.state.accounts[existingIndex] = { ...this.state.accounts[existingIndex], ...account }
      return this.state.accounts[existingIndex]
    }
    this.state.accounts.push(account)
    return account
  }

  _upsertTarget(target) {
    const id = `${target.accountId}:${target.userId}`
    const conflictingTargets = this.state.targets.filter(item =>
      item.userId === target.userId && item.accountId !== target.accountId && !item.deletedAt
    )
    const inheritedDisplayName = conflictingTargets.find(item => item.displayName)?.displayName
    const now = Date.now()
    for (const conflictingTarget of conflictingTargets) {
      conflictingTarget.preferred = false
      conflictingTarget.supersededAt = conflictingTarget.supersededAt || now
    }
    const existingIndex = this.state.targets.findIndex(item => item.id === id)
    const existing = existingIndex >= 0 ? this.state.targets[existingIndex] : null
    const next = {
      id,
      displayName: target.displayName || existing?.displayName || inheritedDisplayName || target.userId,
      ...target,
      contextToken: target.contextToken || existing?.contextToken || null,
      preferred: true,
      supersededAt: null,
      deletedAt: null
    }
    if (existingIndex >= 0) {
      this.state.targets[existingIndex] = { ...this.state.targets[existingIndex], ...next }
      return this.state.targets[existingIndex]
    }
    this.state.targets.push(next)
    return next
  }

  _isVisibleTarget(target) {
    return Boolean(target && !target.deletedAt && target.preferred !== false)
  }

  _emitInboundMessages(messages) {
    for (const message of messages) {
      if (!message.text && !message.hasContextToken) continue
      this.events.emit('message', message)
    }
    if (messages.length) {
      this.events.emit('messages', messages)
    }
  }

  _scheduleBackgroundPoll(delayMs = this.backgroundPollIntervalMs) {
    if (this.backgroundStopped) return
    if (this.backgroundTimer) clearTimeout(this.backgroundTimer)
    this.backgroundTimer = setTimeout(() => {
      this.backgroundTimer = null
      this._runBackgroundPoll()
    }, delayMs)
    if (typeof this.backgroundTimer.unref === 'function') {
      this.backgroundTimer.unref()
    }
  }

  async _runBackgroundPoll() {
    if (this.backgroundStopped) return
    try {
      if (this.state.accounts.length) {
        await this.pollOnce({ timeoutMs: this.backgroundPollTimeoutMs })
      }
    } catch (err) {
      console.warn('[WeixinNotify] Background poll failed:', err.message)
      this.events.emit('pollError', err)
    } finally {
      this._scheduleBackgroundPoll()
    }
  }

  _requireAccount(accountId) {
    const account = this.state.accounts.find(item => item.accountId === accountId)
    if (!account?.token) throw new Error(`微信账号不可用：${accountId || '未指定账号'}`)
    return account
  }

  _resolveTarget({ accountId, targetId }) {
    const rawTarget = String(targetId || '').trim()
    if (!rawTarget) throw new Error('必须指定 targetId')

    const matches = this.state.targets.filter(target => {
      if (!this._isVisibleTarget(target)) return false
      const targetMatched = target.id === rawTarget ||
        target.userId === rawTarget ||
        target.displayName === rawTarget
      return targetMatched && (!accountId || target.accountId === accountId)
    })
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      throw new Error(`目标 ${rawTarget} 匹配多个微信账号，请显式指定 accountId`)
    }
    throw new Error(`未找到微信通知目标：${rawTarget}`)
  }

  async _pollLoginStatus(login) {
    try {
      return await this._apiGet(
        login.baseUrl || DEFAULT_BASE_URL,
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(login.qrcode)}`,
        QR_POLL_TIMEOUT_MS
      )
    } catch (err) {
      if (err.name === 'AbortError') return { status: 'wait' }
      throw err
    }
  }

  _headers(token, body) {
    const headers = {
      'iLink-App-Id': ILINK_APP_ID,
      'iLink-App-ClientVersion': ILINK_APP_CLIENT_VERSION
    }
    if (body != null) {
      headers['Content-Type'] = 'application/json'
      headers.AuthorizationType = 'ilink_bot_token'
      headers.Authorization = `Bearer ${token}`
      headers['Content-Length'] = String(Buffer.byteLength(body, 'utf-8'))
      headers['X-WECHAT-UIN'] = randomWechatUin()
    }
    return headers
  }

  async _apiGet(baseUrl, endpoint, timeoutMs = API_TIMEOUT_MS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await globalThis.fetch(new URL(endpoint, ensureTrailingSlash(baseUrl)), {
        method: 'GET',
        headers: this._headers(),
        signal: controller.signal
      })
      const text = await response.text()
      if (!response.ok) throw new Error(`微信接口请求失败：${response.status} ${text}`)
      return JSON.parse(text)
    } finally {
      clearTimeout(timer)
    }
  }

  async _apiPost(baseUrl, endpoint, token, payload, timeoutMs = API_TIMEOUT_MS) {
    const body = JSON.stringify(payload)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await globalThis.fetch(new URL(endpoint, ensureTrailingSlash(baseUrl)), {
        method: 'POST',
        headers: this._headers(token, body),
        body,
        signal: controller.signal
      })
      const text = await response.text()
      if (!response.ok) throw new Error(`微信接口请求失败：${response.status} ${text}`)
      return text ? JSON.parse(text) : {}
    } finally {
      clearTimeout(timer)
    }
  }
}

module.exports = {
  WeixinNotifyService,
  DEFAULT_BASE_URL
}

const crypto = require('crypto')
const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
const DEFAULT_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'
const DEFAULT_BOT_TYPE = '3'
const CHANNEL_VERSION = '2.1.7'
const ILINK_APP_ID = 'bot'
const ILINK_APP_CLIENT_VERSION = String((2 << 16) | (1 << 8) | 7)
const QR_LOGIN_TTL_MS = 5 * 60 * 1000
const QR_POLL_TIMEOUT_MS = 35 * 1000
const API_TIMEOUT_MS = 15 * 1000
const UPDATES_TIMEOUT_MS = 45 * 1000
const BACKGROUND_POLL_INTERVAL_MS = 1500
const BACKGROUND_FAST_POLL_INTERVAL_MS = 500
const BACKGROUND_POLL_TIMEOUT_MS = 5000
const BACKGROUND_FAST_POLL_TIMEOUT_MS = 2000
const FAST_POLL_WINDOW_MS = 60 * 1000
const IMAGE_MAX_SIZE = 20 * 1024 * 1024
const PRE_CAPTURE_WELCOME_TEXT = '您已经绑定HydroDesktop，可以随时接收和发送信息给后台大模型。'
const STATE_VERSION = 2
const SECRET_ENCRYPTION = 'electron-safe-storage'
const RECENT_MESSAGE_ID_LIMIT = 500
const MESSAGE_ITEM_TYPE = {
  TEXT: 1,
  IMAGE: 2
}
const UPLOAD_MEDIA_TYPE = {
  IMAGE: 1
}

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

function aesEcbPaddedSize(size) {
  const blockSize = 16
  const remainder = size % blockSize
  return size + (remainder === 0 ? blockSize : blockSize - remainder)
}

function encryptAesEcb(buffer, key) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null)
  cipher.setAutoPadding(true)
  return Buffer.concat([cipher.update(buffer), cipher.final()])
}

function decryptAesEcb(buffer, key) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null)
  decipher.setAutoPadding(true)
  return Buffer.concat([decipher.update(buffer), decipher.final()])
}

function parseAesKey(aesKeyBase64, label = 'weixin media') {
  const decoded = Buffer.from(String(aesKeyBase64 || ''), 'base64')
  if (decoded.length === 16) return decoded
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    return Buffer.from(decoded.toString('ascii'), 'hex')
  }
  throw new Error(`${label}: invalid aes_key`)
}

function buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl = DEFAULT_CDN_BASE_URL) {
  return `${ensureTrailingSlash(cdnBaseUrl)}download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`
}

function buildCdnUploadUrl({ uploadParam, filekey, cdnBaseUrl = DEFAULT_CDN_BASE_URL }) {
  return `${ensureTrailingSlash(cdnBaseUrl)}upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`
}

function detectImageMediaType(buffer, fallback = 'image/jpeg') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return fallback
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.slice(0, 6).toString('ascii') === 'GIF87a' || buffer.slice(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return fallback
}

function imageMediaTypeFromPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp'
  }
  return map[ext] || 'image/png'
}

function normalizeBase64Image(image) {
  if (!image?.base64) return null
  const mediaType = image.mediaType || image.mimeType || 'image/png'
  return {
    buffer: Buffer.from(String(image.base64).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ''), 'base64'),
    mediaType
  }
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
    ? message.item_list.find(item => item?.type === MESSAGE_ITEM_TYPE.TEXT && item?.text_item?.text)
    : null
  return textItem?.text_item?.text || ''
}

function getImageItemsFromMessage(message) {
  return Array.isArray(message?.item_list)
    ? message.item_list.filter(item => item?.type === MESSAGE_ITEM_TYPE.IMAGE && item?.image_item)
    : []
}

function publicAccount(account) {
  if (!account) return null
  return {
    accountId: account.accountId,
    userId: account.userId || null,
    baseUrl: account.baseUrl || DEFAULT_BASE_URL,
    cdnBaseUrl: account.cdnBaseUrl || DEFAULT_CDN_BASE_URL,
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

function isAbortError(err) {
  return err?.name === 'AbortError' || err?.message === 'This operation was aborted'
}

function getDefaultSecretStore() {
  try {
    const { safeStorage } = require('electron')
    if (safeStorage?.isEncryptionAvailable?.()) {
      return {
        encrypt: value => safeStorage.encryptString(String(value || '')).toString('base64'),
        decrypt: value => safeStorage.decryptString(Buffer.from(String(value || ''), 'base64'))
      }
    }
  } catch {
    // Electron safeStorage is unavailable in unit tests or non-Electron contexts.
  }
  return null
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

class WeixinNotifyService {
  constructor(configManager, options = {}) {
    this.configManager = configManager
    this.stateDir = options.stateDir || path.join(configManager.userDataPath, 'weixin-notify')
    this.statePath = path.join(this.stateDir, 'state.json')
    this.activeLogins = new Map()
    this.secretStore = options.secretStore === undefined ? getDefaultSecretStore() : options.secretStore
    this.state = this._loadState()
    this.events = new EventEmitter()
    this.preCaptureAccountIds = new Set(this.state.preCaptureAccountIds || [])
    this.accountPollQueues = new Map()
    this.backgroundTimer = null
    this.backgroundStopped = true
    this.backgroundPollIntervalMs = Math.max(Number(options.backgroundPollIntervalMs) || BACKGROUND_POLL_INTERVAL_MS, 100)
    this.backgroundFastPollIntervalMs = Math.max(Number(options.backgroundFastPollIntervalMs) || BACKGROUND_FAST_POLL_INTERVAL_MS, 100)
    this.backgroundPollTimeoutMs = Math.min(
      Math.max(Number(options.backgroundPollTimeoutMs) || BACKGROUND_POLL_TIMEOUT_MS, 1000),
      UPDATES_TIMEOUT_MS
    )
    this.backgroundFastPollTimeoutMs = Math.min(
      Math.max(Number(options.backgroundFastPollTimeoutMs) || BACKGROUND_FAST_POLL_TIMEOUT_MS, 1000),
      UPDATES_TIMEOUT_MS
    )
    this.fastPollUntilMs = 0
  }

  start() {
    this.state = this._loadState()
    this.preCaptureAccountIds = new Set(this.state.preCaptureAccountIds || [])
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
          cdnBaseUrl: DEFAULT_CDN_BASE_URL,
          userId: status.ilink_user_id || null,
          savedAt: Date.now()
        }
        this._upsertAccount(account)
        this.preCaptureAccountIds.add(account.accountId)
        this._syncRuntimeState()
        this._activateFastPolling()
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

  async pollOnce({ accountId, timeoutMs, emitInbound = true } = {}) {
    return this._pollOnceUnlocked({ accountId, timeoutMs, emitInbound })
  }

  async _pollOnceUnlocked({ accountId, timeoutMs, emitInbound = true } = {}) {
    const accounts = accountId ? [this._requireAccount(accountId)] : this.state.accounts
    const pollTimeoutMs = Math.min(
      Math.max(Number(timeoutMs) || UPDATES_TIMEOUT_MS, 1000),
      UPDATES_TIMEOUT_MS
    )
    const results = await Promise.all(accounts.map(account => this._queueAccountPoll(
      account.accountId,
      () => this._pollAccountOnce(account, pollTimeoutMs)
    )))
    const messages = results.flatMap(result => result.messages)
    const inboundMessages = results.flatMap(result => result.inboundMessages)
    const targets = results.flatMap(result => result.targets)

    const result = { messages, targets }
    if (emitInbound) {
      this._emitInboundMessages(inboundMessages)
    }
    return result
  }

  _queueAccountPoll(accountId, run) {
    const previous = this.accountPollQueues.get(accountId) || Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(run)
      .finally(() => {
        if (this.accountPollQueues.get(accountId) === next) {
          this.accountPollQueues.delete(accountId)
        }
      })
    this.accountPollQueues.set(accountId, next)
    return next
  }

  async _pollAccountOnce(account, pollTimeoutMs) {
    const messages = []
    const inboundMessages = []
    const targets = []
    const preCapturing = this.preCaptureAccountIds.has(account.accountId)
    let capturedForPreCapture = false
    let response
    try {
      response = await this._apiPost(account.baseUrl, 'ilink/bot/getupdates', account.token, {
        get_updates_buf: account.cursor || '',
        base_info: { channel_version: CHANNEL_VERSION }
      }, pollTimeoutMs)
    } catch (err) {
      if (isAbortError(err)) {
        return { messages, inboundMessages, targets }
      }
      throw err
    }
    assertWeixinResponseOk(response, 'getupdates')

    if (response.get_updates_buf) {
      account.cursor = response.get_updates_buf
    }

    for (const message of response.msgs || []) {
      if (!message?.from_user_id) continue
      const messageKey = this._buildMessageKey(account, message)
      if (this._hasSeenMessage(messageKey)) continue
      const text = getTextFromMessage(message)
      const images = await this._downloadImagesFromMessage(account, message)
      if (!text && images.length === 0 && !message.context_token) continue
      this._rememberMessageKey(messageKey)
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
      const normalizedMessage = {
        accountId: account.accountId,
        targetId: target.id,
        from: message.from_user_id,
        text,
        images,
        hasContextToken: Boolean(message.context_token),
        contextToken: message.context_token || null,
        createTimeMs: message.create_time_ms || null,
        target: publicMessageTarget
      }
      messages.push(normalizedMessage)
      if (preCapturing) {
        capturedForPreCapture = true
        if (target.contextToken) {
          await this._sendPreCaptureWelcome(account, target)
        }
      } else {
        inboundMessages.push(normalizedMessage)
      }
    }
    if (capturedForPreCapture) {
      this.preCaptureAccountIds.delete(account.accountId)
      this._syncRuntimeState()
    }
    if (messages.length) {
      this._activateFastPolling()
    }
    this._saveState()
    return { messages, inboundMessages, targets }
  }

  async _sendPreCaptureWelcome(account, target) {
    try {
      await this._sendMessageItems({
        accountId: account.accountId,
        targetId: target.id,
        items: [{ type: MESSAGE_ITEM_TYPE.TEXT, text_item: { text: PRE_CAPTURE_WELCOME_TEXT } }],
        text: PRE_CAPTURE_WELCOME_TEXT,
        target,
        account
      })
    } catch (err) {
      console.warn('[WeixinNotify] Failed to send pre-capture welcome:', err.message)
    }
  }

  async sendText({ accountId, targetId, text, sessionId } = {}) {
    const normalizedText = String(text || '').trim()
    if (!normalizedText) throw new Error('发送内容不能为空')

    return this._sendMessageItems({
      accountId,
      targetId,
      sessionId,
      items: [{ type: MESSAGE_ITEM_TYPE.TEXT, text_item: { text: normalizedText } }],
      text: normalizedText
    })
  }

  async sendImages({ accountId, targetId, text = '', images = [], imagePaths = [], sessionId } = {}) {
    const normalizedText = String(text || '').trim()
    const normalizedImages = []

    for (const image of images || []) {
      const normalized = normalizeBase64Image(image)
      if (normalized?.buffer?.length > 0) normalizedImages.push(normalized)
    }
    for (const filePath of imagePaths || []) {
      const stats = await fs.promises.stat(filePath).catch(() => null)
      if (!stats || stats.size <= 0 || stats.size > IMAGE_MAX_SIZE) continue
      const buffer = await fs.promises.readFile(filePath)
      normalizedImages.push({ buffer, mediaType: detectImageMediaType(buffer, imageMediaTypeFromPath(filePath)) })
    }
    if (!normalizedText && normalizedImages.length === 0) throw new Error('发送内容不能为空')

    const target = this._resolveTarget({ accountId, targetId })
    const account = this._requireAccount(target.accountId)
    if (!target.contextToken) {
      throw new Error('目标缺少 contextToken，请先让该微信用户向 bot 发送一条消息')
    }

    let lastResult = null
    if (normalizedText) {
      lastResult = await this._sendMessageItems({
        accountId: target.accountId,
        targetId: target.id,
        sessionId,
        items: [{ type: MESSAGE_ITEM_TYPE.TEXT, text_item: { text: normalizedText } }],
        text: normalizedText,
        target,
        account
      })
    }

    for (const image of normalizedImages) {
      const uploaded = await this._uploadImageBuffer(account, target, image.buffer, image.mediaType)
      lastResult = await this._sendMessageItems({
        accountId: target.accountId,
        targetId: target.id,
        sessionId,
        items: [{
          type: MESSAGE_ITEM_TYPE.IMAGE,
          image_item: {
            media: {
              encrypt_query_param: uploaded.downloadEncryptedQueryParam,
              aes_key: Buffer.from(uploaded.aeskey).toString('base64'),
              encrypt_type: 1
            },
            mid_size: uploaded.fileSizeCiphertext
          }
        }],
        text: normalizedText,
        imageCount: 1,
        target,
        account
      })
    }

    return lastResult || { success: true }
  }

  async _sendMessageItems({ accountId, targetId, items, text = '', sessionId, imageCount = 0, target: resolvedTarget, account: resolvedAccount } = {}) {
    const target = resolvedTarget || this._resolveTarget({ accountId, targetId })
    const account = resolvedAccount || this._requireAccount(target.accountId)
    if (!target.contextToken) {
      throw new Error('目标缺少 contextToken，请先让该微信用户向 bot 发送一条消息')
    }

    let lastResponse = null
    let lastClientId = null
    for (const item of items) {
      const clientId = buildClientId()
      const response = await this._apiPost(account.baseUrl, 'ilink/bot/sendmessage', account.token, {
        msg: {
          from_user_id: '',
          to_user_id: target.userId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          context_token: target.contextToken,
          item_list: [item]
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
      lastResponse = response
      lastClientId = clientId
    }

    target.lastSentAt = Date.now()
    target.contextExpiredAt = null
    target.lastError = null
    this._activateFastPolling()
    this._saveState()
    const result = {
      success: true,
      messageId: lastClientId,
      response: publicSendResponse(lastResponse),
      target: publicTarget(target)
    }
    this.events.emit('sent', {
      accountId: target.accountId,
      targetId: target.id,
      sessionId: sessionId || null,
      messageId: lastClientId,
      text,
      imageCount,
      target: result.target
    })
    return result
  }

  async _downloadImagesFromMessage(account, message) {
    const items = getImageItemsFromMessage(message)
    if (!items.length) return []

    const images = []
    for (const item of items) {
      try {
        const image = await this._downloadImageItem(account, item)
        if (image) images.push(image)
      } catch (err) {
        console.warn('[WeixinNotify] Image download failed:', err.message)
      }
    }
    return images
  }

  async _downloadImageItem(account, item) {
    const imageItem = item?.image_item
    const media = imageItem?.media
    if (!media?.encrypt_query_param && !media?.full_url) return null

    const aesKeyBase64 = imageItem.aeskey
      ? Buffer.from(imageItem.aeskey, 'hex').toString('base64')
      : media.aes_key
    const url = media.full_url || buildCdnDownloadUrl(media.encrypt_query_param, account.cdnBaseUrl || DEFAULT_CDN_BASE_URL)
    const response = await globalThis.fetch(url)
    if (!response.ok) throw new Error(`CDN download failed: ${response.status}`)
    const downloaded = Buffer.from(await response.arrayBuffer())
    const buffer = aesKeyBase64
      ? decryptAesEcb(downloaded, parseAesKey(aesKeyBase64, 'weixin image'))
      : downloaded
    if (buffer.length > IMAGE_MAX_SIZE) throw new Error('微信图片过大')
    const headerType = response.headers?.get?.('content-type')?.split(';')[0]?.trim()
    const mediaType = headerType?.startsWith('image/') ? headerType : detectImageMediaType(buffer)
    return {
      base64: buffer.toString('base64'),
      mediaType,
      sizeBytes: buffer.length
    }
  }

  async _uploadImageBuffer(account, target, buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('图片内容不能为空')
    if (buffer.length > IMAGE_MAX_SIZE) throw new Error('图片过大，不能超过 20MB')

    const rawsize = buffer.length
    const rawfilemd5 = crypto.createHash('md5').update(buffer).digest('hex')
    const filesize = aesEcbPaddedSize(rawsize)
    const filekey = crypto.randomBytes(16).toString('hex')
    const aeskey = crypto.randomBytes(16)
    const aeskeyHex = aeskey.toString('hex')

    const uploadUrlResp = await this._apiPost(account.baseUrl, 'ilink/bot/getuploadurl', account.token, {
      filekey,
      media_type: UPLOAD_MEDIA_TYPE.IMAGE,
      to_user_id: target.userId,
      rawsize,
      rawfilemd5,
      filesize,
      no_need_thumb: true,
      aeskey: aeskeyHex,
      base_info: { channel_version: CHANNEL_VERSION }
    }, API_TIMEOUT_MS)
    assertWeixinResponseOk(uploadUrlResp, 'getuploadurl')

    const uploadFullUrl = uploadUrlResp.upload_full_url?.trim()
    const uploadParam = uploadUrlResp.upload_param
    if (!uploadFullUrl && !uploadParam) {
      throw new Error('微信图片上传失败：未返回 CDN 上传地址')
    }

    const uploadUrl = uploadFullUrl || buildCdnUploadUrl({
      uploadParam,
      filekey,
      cdnBaseUrl: account.cdnBaseUrl || DEFAULT_CDN_BASE_URL
    })
    const encrypted = encryptAesEcb(buffer, aeskey)
    const uploadResponse = await globalThis.fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(encrypted)
    })
    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '')
      throw new Error(`微信图片 CDN 上传失败：${uploadResponse.status} ${detail}`)
    }
    const downloadEncryptedQueryParam = uploadResponse.headers?.get?.('x-encrypted-param')
    if (!downloadEncryptedQueryParam) {
      throw new Error('微信图片 CDN 上传失败：缺少 x-encrypted-param')
    }

    return {
      filekey,
      downloadEncryptedQueryParam,
      aeskey: aeskeyHex,
      fileSize: rawsize,
      fileSizeCiphertext: encrypted.length
    }
  }

  _normalizeState(parsed = {}) {
    return {
      version: Number(parsed.version) || 1,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      preCaptureAccountIds: Array.isArray(parsed.preCaptureAccountIds) ? parsed.preCaptureAccountIds : [],
      recentMessageIds: Array.isArray(parsed.recentMessageIds) ? parsed.recentMessageIds : []
    }
  }

  _loadState() {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'))
        return this._deserializeState(parsed)
      }
    } catch (err) {
      console.warn('[WeixinNotify] Failed to load state:', err.message)
    }
    return this._normalizeState()
  }

  _saveState() {
    fs.mkdirSync(this.stateDir, { recursive: true })
    this._syncRuntimeState()
    fs.writeFileSync(this.statePath, JSON.stringify(this._serializeState(), null, 2), 'utf-8')
    try {
      fs.chmodSync(this.statePath, 0o600)
    } catch {
      // Windows may ignore chmod.
    }
  }

  _syncRuntimeState() {
    this.state.preCaptureAccountIds = [...this.preCaptureAccountIds]
    if (!Array.isArray(this.state.recentMessageIds)) this.state.recentMessageIds = []
    if (this.state.recentMessageIds.length > RECENT_MESSAGE_ID_LIMIT) {
      this.state.recentMessageIds = this.state.recentMessageIds.slice(-RECENT_MESSAGE_ID_LIMIT)
    }
    this.state.version = STATE_VERSION
  }

  _serializeState() {
    const serialized = cloneJson(this.state)
    serialized.version = STATE_VERSION
    for (const account of serialized.accounts || []) {
      account.token = this._protectSecret(account.token)
    }
    for (const target of serialized.targets || []) {
      target.contextToken = this._protectSecret(target.contextToken)
    }
    return serialized
  }

  _deserializeState(parsed) {
    const state = this._normalizeState(parsed)
    for (const account of state.accounts) {
      account.token = this._unprotectSecret(account.token)
    }
    for (const target of state.targets) {
      target.contextToken = this._unprotectSecret(target.contextToken)
    }
    return state
  }

  _protectSecret(value) {
    if (!value || typeof value !== 'string') return value || null
    if (!this.secretStore?.encrypt) return value
    return {
      __secret: SECRET_ENCRYPTION,
      value: this.secretStore.encrypt(value)
    }
  }

  _unprotectSecret(value) {
    if (!value || typeof value === 'string') return value || null
    if (value.__secret !== SECRET_ENCRYPTION) return null
    if (!this.secretStore?.decrypt) {
      console.warn('[WeixinNotify] Encrypted credential cannot be decrypted without safeStorage')
      return null
    }
    try {
      return this.secretStore.decrypt(value.value)
    } catch (err) {
      console.warn('[WeixinNotify] Failed to decrypt credential:', err.message)
      return null
    }
  }

  _buildMessageKey(account, message) {
    const explicitId = message.msg_id || message.msgid || message.message_id || message.client_id || message.id
    if (explicitId) return `${account.accountId}:${explicitId}`
    const payload = {
      accountId: account.accountId,
      from: message.from_user_id,
      createTimeMs: message.create_time_ms || null,
      contextToken: message.context_token || null,
      text: getTextFromMessage(message),
      items: message.item_list || []
    }
    return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex')
  }

  _hasSeenMessage(messageKey) {
    return Boolean(messageKey && this.state.recentMessageIds?.includes(messageKey))
  }

  _rememberMessageKey(messageKey) {
    if (!messageKey) return
    if (!Array.isArray(this.state.recentMessageIds)) this.state.recentMessageIds = []
    if (!this.state.recentMessageIds.includes(messageKey)) {
      this.state.recentMessageIds.push(messageKey)
    }
    if (this.state.recentMessageIds.length > RECENT_MESSAGE_ID_LIMIT) {
      this.state.recentMessageIds = this.state.recentMessageIds.slice(-RECENT_MESSAGE_ID_LIMIT)
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
      if (!message.text && !message.images?.length && !message.hasContextToken) continue
      this.events.emit('message', message)
    }
    if (messages.length) {
      this.events.emit('messages', messages)
    }
  }

  _isFastPollingActive() {
    return Date.now() < this.fastPollUntilMs
  }

  _activateFastPolling(windowMs = FAST_POLL_WINDOW_MS) {
    this.fastPollUntilMs = Math.max(this.fastPollUntilMs, Date.now() + windowMs)
  }

  _getBackgroundPollIntervalMs() {
    return this._isFastPollingActive() ? this.backgroundFastPollIntervalMs : this.backgroundPollIntervalMs
  }

  _getBackgroundPollTimeoutMs() {
    return this._isFastPollingActive() ? this.backgroundFastPollTimeoutMs : this.backgroundPollTimeoutMs
  }

  _scheduleBackgroundPoll(delayMs = this._getBackgroundPollIntervalMs()) {
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
        await this.pollOnce({ timeoutMs: this._getBackgroundPollTimeoutMs() })
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
  DEFAULT_BASE_URL,
  DEFAULT_CDN_BASE_URL
}

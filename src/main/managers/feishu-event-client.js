/**
 * 飞书 WebSocket 事件订阅客户端
 *
 * 封装 @larksuiteoapi/node-sdk 的 WSClient 和 EventDispatcher，
 * 通过飞书"事件订阅长连接模式"接收用户消息事件。
 *
 * SDK WSClient 负责：连接、心跳、重连、protobuf 二进制协议解码
 * 本类负责：EventEmitter 事件转发、消息结构化
 */

const { EventEmitter } = require('events')
const { WSClient, EventDispatcher, Domain } = require('@larksuiteoapi/node-sdk')

class FeishuEventClient extends EventEmitter {
  constructor(opts = {}) {
    super()
    this._appId = null
    this._appSecret = null
    this._connected = false
    this._stopped = false
    this._runtimeState = 'disabled'
    this._wsClient = null
    this._eventDispatcher = null
  }

  // ─── 公开 API ───

  get connected() { return this._connected }
  get runtimeState() { return this._runtimeState }

  /**
   * 连接飞书事件订阅
   * @param {string} appId
   * @param {string} appSecret
   */
  async connect(appId, appSecret) {
    this._appId = appId
    this._appSecret = appSecret
    this._stopped = false
    this._runtimeState = 'connecting'
    this.emit('statusChange', { connected: false, runtimeState: this._runtimeState })

    await this._startClient()
  }

  /** 停止连接 */
  stop() {
    this._stopped = true
    this._connected = false
    this._runtimeState = 'disabled'
    this._closeClient()
    this._eventDispatcher = null
  }

  async _startClient() {
    this._eventDispatcher = new EventDispatcher({
      loggerLevel: 'info',
    })

    this._eventDispatcher.register({
      'im.message.receive_v1': (data) => {
        this._lastEventAt = Date.now()
        this._handleImMessage(data)
      },
    })

    this._wsClient = new WSClient({
      appId: this._appId,
      appSecret: this._appSecret,
      domain: Domain.Feishu,
      autoReconnect: true,
      onReady: () => {
        this._connected = true
        this._runtimeState = 'connected'
        this.emit('statusChange', { connected: true, runtimeState: this._runtimeState })
        console.log('[FeishuEventClient] Connected and ready')
      },
      onError: (err) => {
        console.error('[FeishuEventClient] Error:', err.message)
        this.emit('error', { message: err.message })
      },
      onReconnecting: () => {
        console.log('[FeishuEventClient] Reconnecting...')
        this._runtimeState = 'reconnecting'
        this._markDisconnected()
      },
      onReconnected: () => {
        this._connected = true
        this._runtimeState = 'connected'
        this.emit('statusChange', { connected: true, runtimeState: this._runtimeState })
      },
    })

    try {
      await this._wsClient.start({ eventDispatcher: this._eventDispatcher })
      console.log('[FeishuEventClient] WSClient started')
    } catch (err) {
      console.error('[FeishuEventClient] Start failed:', err.message)
      this.emit('error', { message: `Start failed: ${err.message}` })
      this._runtimeState = 'disconnected'
      this._markDisconnected()
      this._closeClient()
      throw err
    }
  }

  _closeClient() {
    if (this._wsClient) {
      try {
        this._wsClient.close({ force: true })
      } catch {}
      this._wsClient = null
    }
  }

  _markDisconnected() {
    if (this._connected) {
      this._connected = false
      if (this._runtimeState !== 'disabled' && this._runtimeState !== 'reconnecting') {
        this._runtimeState = 'disconnected'
      }
      this.emit('statusChange', { connected: false, runtimeState: this._runtimeState })
    } else {
      this._connected = false
    }
  }

  // ─── 事件处理 ───

  /** @private */
  _handleImMessage(data) {
    const t0 = Date.now()
    try {
      // SDK EventDispatcher 传回的是扁平结构：
      // { schema, event_id, event_type, message: { message_id, message_type, chat_id, chat_type, content }, sender: { sender_id: { open_id, ... } } }
      const msg = data?.message || {}
      const sender = data?.sender || {}
      const senderId = sender?.sender_id?.open_id || sender?.sender_id?.user_id
      const senderName = sender?.sender_name || sender?.name || sender?.display_name || null
      const chatName = data?.chat?.name || data?.chat_name || msg?.chat_name || null

      console.log('[FeishuEventClient] event_type:', data?.event_type, 'message_type:', msg.message_type)

      const attachments = this._extractAttachments(msg, msg.message_id)
      const parsed = {
        msgId: msg.message_id,
        msgType: msg.message_type,
        chatId: msg.chat_id,
        chatType: msg.chat_type,
        senderId,
        senderName,
        chatName,
        mentions: this._extractMentions(msg),
        text: this._extractText(msg),
        images: this._extractImages(msg, msg.message_id),
        attachments,
        unsupported: this._isUnsupportedMessageType(msg, { attachments }),
        content: msg.content,
        raw: data,
      }

      console.log(`[FeishuEventClient] handleImMessage: ${Date.now() - t0}ms, Emitting message`)
      this.emit('message', parsed)
    } catch (err) {
      console.error('[FeishuEventClient] Handle IM message error:', err)
    }
  }

  // ─── 内容提取 ───

  _extractText(msg) {
    const msgType = msg.message_type || msg.msg_type
    if (msgType === 'text') {
      try {
        const parsed = JSON.parse(msg.content)
        return parsed?.text || ''
      } catch {
        return msg.content || ''
      }
    }
    if (msgType === 'post') {
      try {
        const parsed = JSON.parse(msg.content || '{}')
        const parts = []
        for (const elem of this._collectPostElements(parsed)) {
          if (!elem || typeof elem !== 'object') continue
          if (elem.tag === 'text' && elem.text) {
            parts.push(elem.text)
          } else if (elem.tag === 'a' && elem.text) {
            parts.push(elem.text)
          }
        }
        return parts.join('')
      } catch {
        return ''
      }
    }
    return ''
  }

  _extractMentions(msg) {
    const mentions = []
    const seen = new Set()
    try {
      const parsed = typeof msg.content === 'string'
        ? JSON.parse(msg.content || '{}')
        : (msg.content || {})

      const addMention = (mention) => {
        if (!mention || typeof mention !== 'object') return
        const normalizedId = mention.id && typeof mention.id === 'object'
          ? (mention.id.open_id || mention.id.user_id || mention.id.union_id || null)
          : (mention.id || mention.open_id || mention.user_id || mention.user_open_id || mention.app_id || null)
        const normalizedIdType = mention.id_type
          || mention.idType
          || mention.mention_type
          || (mention.id && typeof mention.id === 'object'
            ? (mention.id.open_id ? 'open_id' : (mention.id.user_id ? 'user_id' : null))
            : null)
        const normalized = {
          key: mention.key || mention.mention_key || mention.user_id || mention.open_id || mention.user_open_id || null,
          name: mention.name || mention.display_name || mention.user_name || mention.text || null,
          id: normalizedId,
          idType: normalizedIdType,
        }
        const signature = `${normalized.key || ''}|${normalized.id || ''}|${normalized.name || ''}`
        if (seen.has(signature)) return
        seen.add(signature)
        mentions.push(normalized)
      }

      if (Array.isArray(msg?.mentions)) {
        for (const mention of msg.mentions) {
          addMention(mention)
        }
      }

      if (Array.isArray(parsed?.mentions)) {
        for (const mention of parsed.mentions) {
          addMention(mention)
        }
      }

      if ((msg.message_type || msg.msg_type) === 'post') {
        for (const elem of this._collectPostElements(parsed)) {
          if (elem?.tag !== 'at') continue
          addMention({
            key: elem?.user_id || elem?.open_id || elem?.user_open_id || null,
            name: elem?.user_name || elem?.name || elem?.text || null,
            id: elem?.user_id || elem?.open_id || elem?.user_open_id || null,
            id_type: elem?.user_id ? 'user_id' : (elem?.open_id || elem?.user_open_id ? 'open_id' : null),
          })
        }
      }
    } catch {}
    return mentions
  }

  _extractImages(msg, messageId) {
    const images = []
    const msgType = msg.message_type || msg.msg_type
    try {
      if (msgType === 'image') {
        const parsed = typeof msg.content === 'string'
          ? JSON.parse(msg.content || '{}')
          : (msg.content || {})
        const imageKey = msg.image_key || parsed?.image_key || parsed?.file_key || null
        if (imageKey) {
          images.push({ imageKey, messageId })
        }
      } else if (msgType === 'post') {
        const parsed = JSON.parse(msg.content || '{}')
        for (const elem of this._collectPostElements(parsed)) {
          if (elem?.tag === 'img' && elem?.image_key) {
            images.push({ imageKey: elem.image_key, messageId })
          }
        }
      }
    } catch {}
    return images
  }

  _extractAttachments(msg, messageId) {
    const attachments = []
    const msgType = msg.message_type || msg.msg_type
    if (msgType !== 'file') return attachments

    try {
      const parsed = typeof msg.content === 'string'
        ? JSON.parse(msg.content || '{}')
        : (msg.content || {})
      const fileKey = msg.file_key || msg.fileKey || parsed?.file_key || parsed?.fileKey || parsed?.file_token || parsed?.fileToken || null
      if (!fileKey) return attachments

      const filename = msg.file_name || msg.fileName || parsed?.file_name || parsed?.fileName || parsed?.name || 'attachment'
      const sizeBytes = Number(msg.file_size || msg.fileSize || parsed?.file_size || parsed?.fileSize || parsed?.size || 0) || 0
      attachments.push({
        id: `feishu:${messageId || ''}:${fileKey}`,
        kind: 'document',
        filename,
        sizeBytes,
        source: 'inbound',
        channel: 'feishu',
        localPath: null,
        remoteRef: fileKey,
        preview: null,
        meta: {
          messageId,
          resourceType: 'file',
          rawContent: parsed,
        },
      })
    } catch {}
    return attachments
  }

  _collectPostElements(parsed) {
    const result = []
    const visit = (value) => {
      if (!value) return
      if (Array.isArray(value)) {
        for (const item of value) visit(item)
        return
      }
      if (typeof value !== 'object') return
      if (typeof value.tag === 'string') {
        result.push(value)
        return
      }
      for (const key of Object.keys(value)) {
        visit(value[key])
      }
    }

    visit(parsed?.content || parsed)
    return result
  }

  _isUnsupportedMessageType(msg, context = {}) {
    const msgType = msg?.message_type || msg?.msg_type
    if (msgType === 'file') {
      return !Array.isArray(context.attachments) || context.attachments.length === 0
    }
    return !['text', 'post', 'image', 'file'].includes(msgType)
  }
}

module.exports = { FeishuEventClient }

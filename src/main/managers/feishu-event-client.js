/**
 * 飞书 WebSocket 事件订阅客户端
 *
 * 封装 @larksuiteoapi/node-sdk 的 WSClient 和 EventDispatcher，
 * 通过飞书"事件订阅长连接模式"接收用户消息和卡片交互事件。
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
    this._wsClient = null
    this._eventDispatcher = null
    this._reconnectWatchdog = null
    this._reconnectBackoffMs = 30 * 1000
    this._restartInFlight = null
  }

  // ─── 公开 API ───

  get connected() { return this._connected }

  /**
   * 连接飞书事件订阅
   * @param {string} appId
   * @param {string} appSecret
   */
  async connect(appId, appSecret) {
    this._appId = appId
    this._appSecret = appSecret
    this._stopped = false
    this._reconnectBackoffMs = 30 * 1000

    await this._startClient()
  }

  /** 停止连接 */
  stop() {
    this._stopped = true
    this._connected = false
    this._clearReconnectWatchdog()
    this._restartInFlight = null
    this._closeClient()
    this._eventDispatcher = null
  }

  async _startClient() {
    this._eventDispatcher = new EventDispatcher({
      loggerLevel: 'info',
    })

    this._eventDispatcher.register({
      'im.message.receive_v1': (data) => {
        this._handleImMessage(data)
      },
      'card.action.trigger': (data) => {
        this._handleCardAction(data)
      },
    })

    this._wsClient = new WSClient({
      appId: this._appId,
      appSecret: this._appSecret,
      domain: Domain.Feishu,
      autoReconnect: true,
      onReady: () => {
        this._connected = true
        this._clearReconnectWatchdog()
        this.emit('statusChange', { connected: true })
        console.log('[FeishuEventClient] Connected and ready')
      },
      onError: (err) => {
        console.error('[FeishuEventClient] Error:', err.message)
        if (!this._connected) {
          this._scheduleReconnectWatchdog()
        }
        this.emit('error', { message: err.message })
      },
      onReconnecting: () => {
        console.log('[FeishuEventClient] Reconnecting...')
        this._markDisconnected()
        this._scheduleReconnectWatchdog()
      },
      onReconnected: () => {
        this._connected = true
        this._clearReconnectWatchdog()
        this.emit('statusChange', { connected: true })
      },
    })

    try {
      await this._wsClient.start({ eventDispatcher: this._eventDispatcher })
      console.log('[FeishuEventClient] WSClient started')
    } catch (err) {
      console.error('[FeishuEventClient] Start failed:', err.message)
      this.emit('error', { message: `Start failed: ${err.message}` })
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
      this.emit('statusChange', { connected: false })
    } else {
      this._connected = false
    }
  }

  _scheduleReconnectWatchdog(delayMs = 15 * 1000) {
    if (this._stopped || this._reconnectWatchdog) return
    this._reconnectWatchdog = setTimeout(() => {
      this._reconnectWatchdog = null
      if (this._stopped || this._connected) return
      this._restartFromWatchdog(this._reconnectBackoffMs).catch(() => {})
    }, delayMs)
  }

  _clearReconnectWatchdog() {
    if (this._reconnectWatchdog) {
      clearTimeout(this._reconnectWatchdog)
      this._reconnectWatchdog = null
    }
  }

  async _restartFromWatchdog(nextDelayMs) {
    if (this._stopped || this._connected) return
    if (this._restartInFlight) return this._restartInFlight

    this._restartInFlight = (async () => {
      try {
        this._closeClient()
        await this._startClient()
        this._reconnectBackoffMs = 30 * 1000
      } catch (err) {
        const retryMs = Math.min(nextDelayMs, 5 * 60 * 1000)
        console.error('[FeishuEventClient] Watchdog restart failed:', err.message)
        this._scheduleReconnectWatchdog(retryMs)
        this._reconnectBackoffMs = Math.min(retryMs * 2, 5 * 60 * 1000)
      } finally {
        this._restartInFlight = null
      }
    })()

    return this._restartInFlight
  }

  // ─── 事件处理 ───

  /** @private */
  _handleImMessage(data) {
    try {
      // SDK EventDispatcher 传回的是扁平结构：
      // { schema, event_id, event_type, message: { message_id, message_type, chat_id, chat_type, content }, sender: { sender_id: { open_id, ... } } }
      const msg = data?.message || {}
      const sender = data?.sender || {}
      const senderId = sender?.sender_id?.open_id || sender?.sender_id?.user_id

      console.log('[FeishuEventClient] event_type:', data?.event_type, 'message_type:', msg.message_type, 'senderId:', senderId)

      const parsed = {
        msgId: msg.message_id,
        msgType: msg.message_type,
        chatId: msg.chat_id,
        chatType: msg.chat_type,
        senderId,
        mentions: this._extractMentions(msg),
        text: this._extractText(msg),
        images: this._extractImages(msg, msg.message_id),
        unsupported: this._isUnsupportedMessageType(msg),
        content: msg.content,
        raw: data,
      }

      console.log('[FeishuEventClient] Emitting message, text:', parsed.text?.substring(0, 50))
      this.emit('message', parsed)
    } catch (err) {
      console.error('[FeishuEventClient] Handle IM message error:', err)
    }
  }

  /** @private */
  _handleCardAction(data) {
    try {
      const event = data?.event || data
      const action = event?.action || {}
      const context = event?.context || {}
      const operatorId = event?.operator?.operator_id || event?.operator_id || {}
      const userId = operatorId?.open_id || operatorId?.user_id || event?.open_id || event?.user_id || null
      const chatId = context?.open_chat_id || context?.chat_id || context?.chat?.chat_id || null
      const chatType = context?.chat_type || (chatId ? 'chat' : 'p2p')
      this.emit('cardAction', {
        actionType: action.tag,
        actionValue: action.value,
        userId,
        chatId,
        chatType,
        messageId: context?.open_message_id || null,
        raw: event,
      })
    } catch (err) {
      console.error('[FeishuEventClient] Handle card action error:', err)
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
        for (const lang of ['zh_cn', 'en_us']) {
          const blocks = parsed?.content?.[lang]?.content || parsed?.content?.[lang] || []
          for (const block of blocks) {
            if (Array.isArray(block)) {
              for (const elem of block) {
                if (elem?.tag === 'text' && elem?.text) parts.push(elem.text)
              }
            }
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
        for (const lang of ['zh_cn', 'en_us']) {
          const blocks = parsed?.content?.[lang]?.content || parsed?.content?.[lang] || []
          for (const block of blocks) {
            if (!Array.isArray(block)) continue
            for (const elem of block) {
              if (elem?.tag !== 'at') continue
              addMention({
                key: elem?.user_id || elem?.open_id || elem?.user_open_id || null,
                name: elem?.user_name || elem?.name || elem?.text || null,
                id: elem?.user_id || elem?.open_id || elem?.user_open_id || null,
                id_type: elem?.user_id ? 'user_id' : (elem?.open_id || elem?.user_open_id ? 'open_id' : null),
              })
            }
          }
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
        for (const lang of ['zh_cn', 'en_us']) {
          const blocks = parsed?.content?.[lang]?.content || parsed?.content?.[lang] || []
          for (const block of blocks) {
            if (Array.isArray(block)) {
              for (const elem of block) {
                if (elem?.tag === 'img' && elem?.image_key) {
                  images.push({ imageKey: elem.image_key, messageId })
                }
              }
            }
          }
        }
      }
    } catch {}
    return images
  }

  _isUnsupportedMessageType(msg) {
    const msgType = msg?.message_type || msg?.msg_type
    return !['text', 'post', 'image'].includes(msgType)
  }
}

module.exports = { FeishuEventClient }

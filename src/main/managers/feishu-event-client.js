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

    // 创建 EventDispatcher 并注册事件处理器
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

    // 创建 WSClient
    // SDK 内部会 POST https://open.feishu.cn/callback/ws/endpoint 获取 WebSocket URL
    this._wsClient = new WSClient({
      appId: this._appId,
      appSecret: this._appSecret,
      domain: Domain.Feishu,
      autoReconnect: true,
      onReady: () => {
        this._connected = true
        this.emit('statusChange', { connected: true })
        console.log('[FeishuEventClient] Connected and ready')
      },
      onError: (err) => {
        console.error('[FeishuEventClient] Error:', err.message)
        this.emit('error', { message: err.message })
      },
      onReconnecting: () => {
        console.log('[FeishuEventClient] Reconnecting...')
        this.emit('statusChange', { connected: false })
      },
      onReconnected: () => {
        this._connected = true
        this.emit('statusChange', { connected: true })
      },
    })

    try {
      await this._wsClient.start({ eventDispatcher: this._eventDispatcher })
      console.log('[FeishuEventClient] WSClient started')
    } catch (err) {
      console.error('[FeishuEventClient] Start failed:', err.message)
      this.emit('error', { message: `Start failed: ${err.message}` })
    }
  }

  /** 停止连接 */
  stop() {
    this._stopped = true
    this._connected = false
    if (this._wsClient) {
      try {
        this._wsClient.close({ force: true })
      } catch {}
      this._wsClient = null
    }
    this._eventDispatcher = null
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
        text: this._extractText(msg),
        images: this._extractImages(msg),
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
      this.emit('cardAction', {
        actionType: action.tag,
        actionValue: action.value,
        userId: event?.operator?.operator_id?.open_id,
        chatId: event?.context?.chat_id,
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

  _extractImages(msg) {
    const images = []
    const msgType = msg.message_type || msg.msg_type
    try {
      if (msgType === 'image') {
        images.push({ imageKey: msg.image_key || msg.content })
      } else if (msgType === 'post') {
        const parsed = JSON.parse(msg.content || '{}')
        for (const lang of ['zh_cn', 'en_us']) {
          const blocks = parsed?.content?.[lang]?.content || parsed?.content?.[lang] || []
          for (const block of blocks) {
            if (Array.isArray(block)) {
              for (const elem of block) {
                if (elem?.tag === 'img' && elem?.image_key) {
                  images.push({ imageKey: elem.image_key })
                }
              }
            }
          }
        }
      }
    } catch {}
    return images
  }
}

module.exports = { FeishuEventClient }

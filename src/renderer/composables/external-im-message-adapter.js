/**
 * 外部 IM 消息注入适配器
 *
 * 统一 useAgentChat 中钉钉/微信/飞书/企业微信的消息监听模式，
 * 把 onDingTalkMessageReceived / onWeixinMessageReceived / onFeishuMessageReceived / onEnterpriseWeixinMessageReceived
 * 归一到同一格式，统一组装 message bubble。
 *
 * 新增 IM 渠道时只需在此文件中添加一条 Listener 配置即可。
 */
import { MessageRole } from './useAgentChat'
import { EXTERNAL_IM_CHANNELS, getAllExternalImChannels } from '@shared/external-im-meta'

/**
 * IM 消息监听器配置表
 * key: IM channel id
 * value: { channelName, normalize(data) → message bubble }
 */
const IM_MESSAGE_LISTENER_CONFIG = {
  dingtalk: {
    channelName: 'onDingTalkMessageReceived',
    normalize: (data) => ({
      id: `msg-dt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: data.sessionId || null,
      role: MessageRole.USER,
      content: data.text,
      timestamp: Date.now(),
      origin: 'im-inbound',
      imChannel: 'dingtalk',
      senderNick: data.senderNick,
      ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
      ...(data.attachments && data.attachments.length > 0 ? { attachments: data.attachments } : {}),
    }),
  },
  weixin: {
    channelName: 'onWeixinMessageReceived',
    normalize: (data) => ({
      id: data.messageId || `msg-wx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: data.sessionId || null,
      role: MessageRole.USER,
      content: data.text,
      timestamp: data.timestamp || Date.now(),
      origin: 'im-inbound',
      imChannel: 'weixin',
      senderNick: data.senderNick,
      ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
      ...(data.attachments && data.attachments.length > 0 ? { attachments: data.attachments } : {}),
    }),
  },
  feishu: {
    channelName: 'onFeishuMessageReceived',
    normalize: (data) => ({
      id: `msg-fs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: data.sessionId || null,
      role: MessageRole.USER,
      content: data.text,
      timestamp: Date.now(),
      origin: 'im-inbound',
      imChannel: 'feishu',
      senderNick: data.senderNick,
      ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
      ...(data.attachments && data.attachments.length > 0 ? { attachments: data.attachments } : {}),
    }),
  },
  'enterprise-weixin': {
    channelName: 'onEnterpriseWeixinMessageReceived',
    normalize: (data) => ({
      id: `msg-ewx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: data.sessionId || null,
      role: MessageRole.USER,
      content: data.text,
      timestamp: Date.now(),
      origin: 'im-inbound',
      imChannel: 'enterprise-weixin',
      senderNick: data.senderNick,
      ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
      ...(data.attachments && data.attachments.length > 0 ? { attachments: data.attachments } : {}),
    }),
  },
}

/**
 * 为指定 IM 类型注册消息监听器
 * @param {string} imChannel - IM channel id
 * @param {string} sessionId - 当前会话 ID
 * @param {import('vue').Ref<Array>} messagesRef - 消息数组 ref
 * @param {Array<Function>} cleanupFns - 清理函数数组
 * @returns {boolean} 是否成功注册
 */
function registerImListener(imChannel, sessionId, messagesRef, cleanupFns) {
  const config = IM_MESSAGE_LISTENER_CONFIG[imChannel]
  if (!config) return false

  const api = window.electronAPI
  if (!api || !api[config.channelName]) return false

  const cleanup = api[config.channelName]((data) => {
    if (data.sessionId !== sessionId) return
    const msg = config.normalize({ ...data, sessionId })
    messagesRef.value.push(msg)
  })

  cleanupFns.push(cleanup)
  return true
}

/**
 * 统一注册所有支持的外部 IM 消息监听器
 *
 * @param {string} sessionId - 当前会话 ID
 * @param {import('vue').Ref<Array>} messagesRef - 消息数组 ref
 * @param {Array<Function>} cleanupFns - 清理函数数组（传入现有的 cleanupFns 即可）
 * @param {string[]} [enabledChannels] - 可选，只启用特定渠道；不传则启用全部已注册的 IM 渠道
 */
export function setupExternalImListeners(sessionId, messagesRef, cleanupFns, enabledChannels) {
  const channels = enabledChannels || getAllExternalImChannels()
  for (const imChannel of channels) {
    if (EXTERNAL_IM_CHANNELS[imChannel]) {
      registerImListener(imChannel, sessionId, messagesRef, cleanupFns)
    }
  }
}

/**
 * 外部 IM 消息注入适配器
 *
 * 统一 useAgentChat 中钉钉/微信/飞书的消息监听模式，
 * 把 onDingTalkMessageReceived / onWeixinMessageReceived / onFeishuMessageReceived
 * 归一到同一格式，统一组装 message bubble。
 *
 * 新增 IM 渠道时只需在此文件中添加一条 Listener 配置即可。
 */
import { MessageRole } from './useAgentChat'
import { EXTERNAL_IM_TYPES, getAllExternalImTypeIds } from '@shared/external-im-meta'

/**
 * IM 消息监听器配置表
 * key: IM type id
 * value: { channelName, normalize(data) → message bubble }
 */
const IM_MESSAGE_LISTENER_CONFIG = {
  dingtalk: {
    channelName: 'onDingTalkMessageReceived',
    normalize: (data) => ({
      id: `msg-dt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.USER,
      content: data.text,
      timestamp: Date.now(),
      source: 'dingtalk',
      senderNick: data.senderNick,
      ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
    }),
  },
  weixin: {
    channelName: 'onWeixinMessageReceived',
    normalize: (data) => ({
      id: data.messageId || `msg-wx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.USER,
      content: data.text,
      timestamp: data.timestamp || Date.now(),
      source: 'weixin',
      senderNick: data.senderNick,
      ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
    }),
  },
  feishu: {
    channelName: 'onFeishuMessageReceived',
    normalize: (data) => ({
      id: `msg-fs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: MessageRole.USER,
      content: data.text,
      timestamp: Date.now(),
      source: 'feishu',
      senderNick: data.senderNick,
      ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
    }),
  },
}

/**
 * 为指定 IM 类型注册消息监听器
 * @param {string} imType - IM type id
 * @param {string} sessionId - 当前会话 ID
 * @param {import('vue').Ref<Array>} messagesRef - 消息数组 ref
 * @param {Array<Function>} cleanupFns - 清理函数数组
 * @returns {boolean} 是否成功注册
 */
function registerImListener(imType, sessionId, messagesRef, cleanupFns) {
  const config = IM_MESSAGE_LISTENER_CONFIG[imType]
  if (!config) return false

  const api = window.electronAPI
  if (!api || !api[config.channelName]) return false

  const cleanup = api[config.channelName]((data) => {
    if (data.sessionId !== sessionId) return
    const msg = config.normalize(data)
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
 * @param {string[]} [enabledTypes] - 可选，只启用特定类型；不传则启用全部已注册的 IM 类型
 */
export function setupExternalImListeners(sessionId, messagesRef, cleanupFns, enabledTypes) {
  const types = enabledTypes || getAllExternalImTypeIds()
  for (const imType of types) {
    if (EXTERNAL_IM_TYPES[imType]) {
      registerImListener(imType, sessionId, messagesRef, cleanupFns)
    }
  }
}

/**
 * 构建外部 IM 消息 bubble（供外部手动推送使用）
 * @param {string} imType - IM type id
 * @param {{ text: string, senderNick?: string, images?: Array }} data
 * @returns {{ id: string, role: string, content: string, timestamp: number, source: string, senderNick?: string, images?: Array }|null}
 */
export function buildExternalImMessage(imType, data) {
  const config = IM_MESSAGE_LISTENER_CONFIG[imType]
  if (!config) return null
  return config.normalize({ text: data.text, senderNick: data.senderNick, images: data.images })
}

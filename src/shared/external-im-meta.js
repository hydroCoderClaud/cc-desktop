/**
 * 外部 IM 渠道统一元数据
 *
 * 所有 IM 渠道的标识（图标、标签、来源过滤等）以此文件为单一数据源。
 * 新增 IM 渠道时只需在此文件中添加一条记录即可。
 *
 * 会话的 IM 渠道由 imChannel 字段承载，不再依赖 type/source。
 */

/** @type {Record<string, { id: string, label: Record<string, string>, icon: string, observeKey: string, suffixKey: string, hasCommands: boolean, routeName: string|null, configKey: string|null, listenerPrefix: string }>} */
export const EXTERNAL_IM_CHANNELS = {
  dingtalk: {
    id: 'dingtalk',
    label: { 'zh-CN': '钉钉', 'en-US': 'DingTalk' },
    icon: 'dingtalk',
    observeKey: 'agent.dingtalkObserving',
    suffixKey: 'agent.dingtalkSuffix',
    hasCommands: true,
    routeName: 'dingtalk-settings',
    configKey: 'dingtalk',
    listenerPrefix: 'DingTalk',
  },
  weixin: {
    id: 'weixin',
    label: { 'zh-CN': '微信', 'en-US': 'WeChat' },
    icon: 'weixin',
    observeKey: 'agent.weixinObserving',
    suffixKey: 'agent.weixinSuffix',
    hasCommands: false,
    routeName: null,
    configKey: null,
    listenerPrefix: 'Weixin',
  },
  feishu: {
    id: 'feishu',
    label: { 'zh-CN': '飞书', 'en-US': 'Feishu' },
    icon: 'feishu',
    observeKey: 'agent.feishuObserving',
    suffixKey: 'agent.feishuSuffix',
    hasCommands: true,
    routeName: 'feishu-settings',
    configKey: 'feishu',
    listenerPrefix: 'Feishu',
  },
  'enterprise-weixin': {
    id: 'enterprise-weixin',
    label: { 'zh-CN': '企业微信', 'en-US': 'WeCom' },
    icon: 'weixin',
    observeKey: 'agent.enterpriseWeixinObserving',
    suffixKey: 'agent.enterpriseWeixinSuffix',
    hasCommands: true,
    routeName: 'enterprise-weixin-settings',
    configKey: 'enterpriseWeixin',
    listenerPrefix: 'EnterpriseWeixin',
  },
}

// 兼容旧名字（外部 import 仍在使用）
export const EXTERNAL_IM_TYPES = EXTERNAL_IM_CHANNELS

/** @returns {string[]} */
export function getAllExternalImTypeIds() {
  return Object.keys(EXTERNAL_IM_CHANNELS)
}

export function getAllExternalImChannels() {
  return Object.keys(EXTERNAL_IM_CHANNELS)
}

/** 检查字符串是否为有效的 IM 渠道 */
export function isExternalImChannel(channel) {
  return typeof channel === 'string' && channel in EXTERNAL_IM_CHANNELS
}

// 兼容旧调用名
export const isExternalImType = isExternalImChannel

/** 获取 IM 渠道元数据 */
export function getExternalImMeta(channel) {
  return EXTERNAL_IM_CHANNELS[channel]
}

/** 检查会话是否绑定了 IM 渠道 */
export function isExternalImSession(session) {
  return isExternalImChannel(session?.imChannel)
}

/** 获取会话的 IM 渠道类型（用于侧栏筛选） */
export function getSessionImChannel(conv) {
  return conv?.imChannel || null
}

/** 获取会话图标 */
export function getConversationIcon(conv) {
  if (conv?.imChannel && isExternalImChannel(conv.imChannel)) {
    return EXTERNAL_IM_CHANNELS[conv.imChannel].icon
  }
  if (conv?.taskId) return 'clock'
  if (conv?.type === 'notebook') return 'notebook'
  return 'chat'
}

/** @deprecated 用 getSessionImChannel 替代 */
export function getConversationSource(conv) {
  return getSessionImChannel(conv) || conv?.source || 'manual'
}

/** 获取观察模式提示 i18n key */
export function getObserveKey(channel) {
  const meta = EXTERNAL_IM_CHANNELS[channel]
  return meta?.observeKey || null
}

/** 获取 IM 消息发送者后缀 i18n key */
export function getSuffixKey(channel) {
  const meta = EXTERNAL_IM_CHANNELS[channel]
  return meta?.suffixKey || null
}

/** 需要禁用 slash 命令的 IM 渠道列表 */
export function getExternalObserveSessionTypes() {
  return Object.keys(EXTERNAL_IM_CHANNELS)
}

/**
 * 外部 IM 渠道统一元数据
 *
 * 所有 IM 渠道（钉钉、微信、飞书等）的类型判断、图标、标签、来源过滤等，
 * 都以此文件为单一数据源，避免多文件散落的 if (type === 'dingtalk') ... 分支。
 *
 * 新增 IM 渠道时只需在此文件中添加一条记录即可。
 */

/** @type {Record<string, { id: string, label: Record<string, string>, icon: string, sessionType: string, sourceFilter: string, observeKey: string, suffixKey: string, hasCommands: boolean, routeName: string|null, configKey: string|null, listenerPrefix: string }>} */
export const EXTERNAL_IM_TYPES = {
  dingtalk: {
    id: 'dingtalk',
    label: { 'zh-CN': '钉钉', 'en-US': 'DingTalk' },
    icon: 'dingtalk',
    sessionType: 'dingtalk',
    sourceFilter: 'dingtalk',
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
    sessionType: 'weixin',
    sourceFilter: 'weixin',
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
    sessionType: 'feishu',
    sourceFilter: 'feishu',
    observeKey: 'agent.feishuObserving',
    suffixKey: 'agent.feishuSuffix',
    hasCommands: true,
    routeName: 'feishu-settings',
    configKey: 'feishu',
    listenerPrefix: 'Feishu',
  },
}

/** @returns {string[]} 所有已注册的外部 IM 类型 id */
export function getAllExternalImTypeIds() {
  return Object.keys(EXTERNAL_IM_TYPES)
}

/**
 * 检查 session type 是否为外部 IM 类型
 * @param {string} type
 * @returns {boolean}
 */
export function isExternalImType(type) {
  return typeof type === 'string' && type in EXTERNAL_IM_TYPES
}

/**
 * 获取外部 IM 渠道的元数据
 * @param {string} type
 * @returns {object|undefined}
 */
export function getExternalImMeta(type) {
  return EXTERNAL_IM_TYPES[type]
}

/**
 * 检查整个会话对象是否为外部 IM 会话
 * @param {{ type?: string }} session
 * @returns {boolean}
 */
export function isExternalImSession(session) {
  return isExternalImType(session?.type)
}

/**
 * 获取会话的来源标签（用于 AgentLeftContent 筛选 & 来源过滤）
 * 对 IM 类型返回对应的 sourceFilter，否则回落 conv.source 或 'manual'
 * @param {{ type?: string, source?: string }} conv
 * @returns {string}
 */
export function getConversationSource(conv) {
  if (conv?.type && isExternalImType(conv.type)) return conv.type
  return conv?.source || 'manual'
}

/**
 * 获取会话的图标名称
 * @param {{ type?: string, source?: string }} conv
 * @returns {string}
 */
export function getConversationIcon(conv) {
  if (conv?.type && isExternalImType(conv.type)) {
    return EXTERNAL_IM_TYPES[conv.type].icon
  }
  const source = conv?.source || 'manual'
  if (isExternalImType(source)) {
    return EXTERNAL_IM_TYPES[source].icon
  }
  if (source === 'scheduled') return 'clock'
  return 'chat'
}

/**
 * 获取外部 IM 会话的观察模式提示 i18n key
 * @param {string} type
 * @returns {string|null}
 */
export function getObserveKey(type) {
  const meta = EXTERNAL_IM_TYPES[type]
  return meta?.observeKey || null
}

/**
 * 获取外部 IM 消息发送者后缀 i18n key
 * @param {string} type
 * @returns {string|null}
 */
export function getSuffixKey(type) {
  const meta = EXTERNAL_IM_TYPES[type]
  return meta?.suffixKey || null
}

/**
 * 需要禁用 slash 命令的 session type 列表
 * @returns {string[]}
 */
export function getExternalObserveSessionTypes() {
  return Object.values(EXTERNAL_IM_TYPES).map(m => m.sessionType)
}

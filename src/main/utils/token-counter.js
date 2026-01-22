/**
 * Token 计算工具
 * 简单估算，用于判断是否需要压缩上下文
 */

/**
 * 估算文本的 token 数量
 * @param {string} text - 文本内容
 * @returns {number} - 估算的 token 数量
 *
 * 估算规则：
 * - 中文字符: ~1.5 token/字
 * - 英文/其他: ~0.3 token/字符
 */
function countTokens(text) {
  if (!text) return 0

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  // 其他字符
  const otherChars = text.length - chineseChars

  return Math.ceil(chineseChars * 1.5 + otherChars * 0.3)
}

/**
 * 计算消息数组的总 token 数
 * @param {Array} messages - 消息数组 [{role, content}]
 * @returns {number} - 总 token 数
 */
function countMessagesTokens(messages) {
  if (!messages || !Array.isArray(messages)) return 0

  return messages.reduce((total, msg) => {
    // 每条消息额外开销约 4 tokens (role + 格式)
    return total + countTokens(msg.content || '') + 4
  }, 0)
}

/**
 * 检查是否需要压缩
 * @param {number} currentTokens - 当前 token 数
 * @param {number} maxTokens - 最大 token 数 (默认 200K)
 * @param {number} threshold - 压缩阈值 (默认 0.5 = 50%)
 * @returns {boolean}
 */
function shouldCompact(currentTokens, maxTokens = 200000, threshold = 0.5) {
  return currentTokens > maxTokens * threshold
}

module.exports = {
  countTokens,
  countMessagesTokens,
  shouldCompact
}

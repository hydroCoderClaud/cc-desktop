/**
 * 环境变量构建工具
 * 从 API Profile 生成 Claude Code CLI 所需的环境变量
 */

/**
 * 从 API Profile 生成 Claude Code CLI 环境变量
 * @param {Object} profile - API Profile 对象
 * @returns {Object} 环境变量对象（只包含有值的变量）
 *
 * 映射关系：
 * | Profile 字段                 | 环境变量                                |
 * |-----------------------------|-----------------------------------------|
 * | authToken + authType        | ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN |
 * | baseUrl                     | ANTHROPIC_BASE_URL                      |
 * | selectedModelTier           | ANTHROPIC_MODEL (启动默认模型)           |
 * | requestTimeout              | API_TIMEOUT_MS                          |
 * | disableNonessentialTraffic  | CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC|
 * | modelMapping.opus           | ANTHROPIC_DEFAULT_OPUS_MODEL            |
 * | modelMapping.sonnet         | ANTHROPIC_DEFAULT_SONNET_MODEL          |
 * | modelMapping.haiku          | ANTHROPIC_DEFAULT_HAIKU_MODEL           |
 *
 * authType 说明：
 * - 'api_key' (默认) → ANTHROPIC_API_KEY（官方 API 标准）
 * - 'auth_token'     → ANTHROPIC_AUTH_TOKEN（第三方代理服务）
 */
function buildClaudeEnvVars(profile) {
  const envVars = {}

  if (!profile) return envVars

  // 认证令牌（根据 authType 决定环境变量名，并清除另一个避免冲突）
  if (profile.authToken && profile.authToken.trim()) {
    const authType = profile.authType || 'api_key'
    if (authType === 'api_key') {
      envVars.ANTHROPIC_API_KEY = profile.authToken.trim()
      envVars.ANTHROPIC_AUTH_TOKEN = ''  // 清除，避免与系统环境冲突
    } else if (authType === 'auth_token') {
      envVars.ANTHROPIC_AUTH_TOKEN = profile.authToken.trim()
      envVars.ANTHROPIC_API_KEY = ''  // 清除，避免与系统环境冲突
    } else {
      envVars.ANTHROPIC_API_KEY = profile.authToken.trim()
      envVars.ANTHROPIC_AUTH_TOKEN = ''
    }
  }

  // API 基础 URL
  if (profile.baseUrl && profile.baseUrl.trim()) {
    envVars.ANTHROPIC_BASE_URL = profile.baseUrl.trim()
  }

  // 默认启动模型（根据选择的 tier 确定模型名）
  if (profile.selectedModelTier) {
    const tier = profile.selectedModelTier
    // 优先使用 modelMapping 中配置的模型名，否则使用 tier 别名
    const modelName = profile.modelMapping?.[tier]?.trim() || tier
    envVars.ANTHROPIC_MODEL = modelName
  }

  // 超时设置
  if (profile.requestTimeout && profile.requestTimeout > 0) {
    envVars.API_TIMEOUT_MS = String(profile.requestTimeout)
  }

  // 禁用非必要流量
  if (profile.disableNonessentialTraffic) {
    envVars.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  }

  // 模型映射
  if (profile.modelMapping) {
    const mapping = profile.modelMapping
    if (mapping.opus && mapping.opus.trim()) {
      envVars.ANTHROPIC_DEFAULT_OPUS_MODEL = mapping.opus.trim()
    }
    if (mapping.sonnet && mapping.sonnet.trim()) {
      envVars.ANTHROPIC_DEFAULT_SONNET_MODEL = mapping.sonnet.trim()
    }
    if (mapping.haiku && mapping.haiku.trim()) {
      envVars.ANTHROPIC_DEFAULT_HAIKU_MODEL = mapping.haiku.trim()
    }
  }

  return envVars
}

module.exports = { buildClaudeEnvVars }

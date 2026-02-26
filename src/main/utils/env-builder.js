/**
 * 环境变量构建工具
 * 从 API Profile 生成 Claude Code CLI 所需的环境变量
 */

const { LATEST_MODEL_ALIASES } = require('./constants')

/**
 * 检测是否在打包后的应用中运行
 * @returns {boolean}
 */
function isPackagedApp() {
  // Electron 打包后，主模块路径包含 app.asar
  return require.main && require.main.filename.includes('app.asar')
}

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
 * | useProxy + httpsProxy       | HTTPS_PROXY                             |
 * | useProxy + httpProxy        | HTTP_PROXY                              |
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
    // 优先使用 modelMapping 中配置的模型名，否则用 LATEST_MODEL_ALIASES 显式指定版本
    const modelName = profile.modelMapping?.[tier]?.trim() || LATEST_MODEL_ALIASES[tier] || tier
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

  // 代理设置
  if (profile.useProxy) {
    if (profile.httpsProxy && profile.httpsProxy.trim()) {
      envVars.HTTPS_PROXY = profile.httpsProxy.trim()
      envVars.https_proxy = profile.httpsProxy.trim()
    }
    if (profile.httpProxy && profile.httpProxy.trim()) {
      envVars.HTTP_PROXY = profile.httpProxy.trim()
      envVars.http_proxy = profile.httpProxy.trim()
    }
  }

  return envVars
}

/**
 * 构建基础环境变量（仅 PATH 增强，不含 API 配置）
 * 用于不需要 API 配置的场景，如插件 CLI 命令
 *
 * @param {Object} [extraVars={}] - 额外环境变量
 * @returns {Object} 环境变量对象（包含增强的 PATH）
 */
function buildBasicEnv(extraVars = {}) {
  const os = require('os')
  const path = require('path')
  const homeDir = os.homedir()

  const baseEnv = { ...process.env }

  // 清除可能存在的认证变量（避免干扰）
  delete baseEnv.ANTHROPIC_API_KEY
  delete baseEnv.ANTHROPIC_AUTH_TOKEN

  // 增强 PATH：添加常见的 bin 目录
  const isWindows = process.platform === 'win32'
  const pathSep = isWindows ? ';' : ':'

  // Windows 下 PATH 变量名可能是 Path/PATH/path（取决于启动环境）
  // process.env 是 case-insensitive proxy，但 {...process.env} 展开后是普通对象
  // 必须找到实际的 key 名，避免创建重复 key 导致 PATH 丢失
  const pathKey = isWindows
    ? (Object.keys(baseEnv).find(k => k.toUpperCase() === 'PATH') || 'PATH')
    : 'PATH'

  let commonPaths = []
  if (isWindows) {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    // Windows 路径
    commonPaths = [
      path.join(programFiles, 'nodejs'),
      path.join(homeDir, 'AppData', 'Roaming', 'npm'),
      path.join(homeDir, '.local', 'bin'),              // Claude CLI 独立安装路径
      path.join(homeDir, '.claude', 'local', 'bin'),
      path.join(programFiles, 'Git', 'cmd')             // Git for Windows
    ]
  } else {
    // macOS / Linux 路径
    commonPaths = [
      '/usr/local/bin',      // macOS Homebrew, npm global
      '/opt/homebrew/bin',   // macOS Apple Silicon Homebrew
      '/usr/bin',            // 系统基础命令
      '/bin',                // 系统基础命令
      path.join(homeDir, '.local', 'bin'),     // 用户本地 bin
      path.join(homeDir, '.npm-global', 'bin'), // npm global (某些配置)
      path.join(homeDir, '.claude', 'local', 'bin') // Claude CLI 官方安装路径
    ]
  }

  const existingPath = baseEnv[pathKey] || ''
  const existingPaths = existingPath.split(pathSep).filter(Boolean)

  // Windows 下路径比较需忽略大小写
  const pathsToAdd = isWindows
    ? commonPaths.filter(p => !existingPaths.some(ep => ep.toLowerCase() === p.toLowerCase()))
    : commonPaths.filter(p => !existingPaths.includes(p))

  if (pathsToAdd.length > 0) {
    baseEnv[pathKey] = [...pathsToAdd, ...existingPaths].filter(Boolean).join(pathSep)

    // 调试日志：打包后特别重要
    if (isPackagedApp()) {
      console.log('[env-builder] Running in packaged mode')
      console.log('[env-builder] PATH enhanced, added:', pathsToAdd.join(pathSep))
    }
  }

  // 合并额外变量
  const env = { ...baseEnv, ...extraVars }

  // 清理空值
  for (const key of Object.keys(env)) {
    if (env[key] === '') {
      delete env[key]
    }
  }

  return env
}

/**
 * 构建标准额外环境变量（TERM、SHELL、AUTOCOMPACT）
 * 统一 AgentSessionManager 和 ActiveSessionManager 的 extraVars 逻辑
 *
 * @param {Object} configManager - ConfigManager 实例
 * @returns {Object} extraVars 对象
 */
function buildStandardExtraVars(configManager) {
  const fs = require('fs')
  const extraVars = { TERM: 'xterm-256color' }

  // AUTOCOMPACT 设置
  if (configManager) {
    const autocompactPct = configManager.getAutocompactPctOverride()
    if (autocompactPct !== null && autocompactPct >= 0 && autocompactPct <= 100) {
      extraVars.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = String(autocompactPct)
    }
  }

  // SHELL 设置（非 Windows）
  if (process.platform !== 'win32') {
    let shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    try {
      fs.accessSync(shell, fs.constants.X_OK)
    } catch {
      const alternatives = ['/bin/zsh', '/bin/bash', '/bin/sh']
      for (const alt of alternatives) {
        try {
          fs.accessSync(alt, fs.constants.X_OK)
          shell = alt
          break
        } catch { continue }
      }
    }
    extraVars.SHELL = shell
  }

  return extraVars
}

/**
 * 构建完整的子进程环境变量
 * 统一 AgentSessionManager 和 ActiveSessionManager 的环境构建逻辑：
 *   基础环境（PATH增强）→ 合并 Claude 环境变量 → 合并额外变量
 *
 * @param {Object} profile - API Profile 对象
 * @param {Object} [extraVars={}] - 额外环境变量（如 TERM、CLAUDE_AUTOCOMPACT_PCT_OVERRIDE）
 * @returns {Object} 完整的环境变量对象
 */
function buildProcessEnv(profile, extraVars = {}) {
  // 先构建基础环境（PATH 增强）
  const baseEnv = buildBasicEnv({})

  // 添加 Claude API 配置
  const claudeEnvVars = buildClaudeEnvVars(profile)

  // 合并所有环境变量
  const env = { ...baseEnv, ...claudeEnvVars, ...extraVars }

  // 清理空值
  for (const key of Object.keys(env)) {
    if (env[key] === '') {
      delete env[key]
    }
  }

  return env
}

module.exports = {
  buildClaudeEnvVars,
  buildProcessEnv,
  buildStandardExtraVars,
  buildBasicEnv,
  isPackagedApp
}

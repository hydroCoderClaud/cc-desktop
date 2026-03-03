/**
 * MCP 环境变量工具函数
 * 供 ComponentMarketModal 和 CapabilityModal 共用
 */

/**
 * 检测值是否为占位符（需用户填写）
 */
export const isPlaceholderValue = (val) => {
  if (!val || typeof val !== 'string') return false
  const v = val.trim()
  return /^your[_-].*[_-]here$/i.test(v) ||
    /^<.*>$/.test(v) ||
    /^\/path\/to\//i.test(v) ||
    /^placeholder/i.test(v) ||
    /^enter[_-].*[_-]here$/i.test(v) ||
    /^xxx+$/i.test(v) ||
    /^TODO$/i.test(v) ||
    /^CHANGE[_-]?ME$/i.test(v) ||
    /^YOUR_/i.test(v)
}

/**
 * 从 MCP 配置中提取所有 env 变量
 * @param {Object} config - mcpServers 配置对象 { serverName: { env: { key: value } } }
 * @returns {Array<{ serverName, key, value, placeholder, isPlaceholder }>}
 */
export const extractAllEnvVars = (config) => {
  const vars = []
  for (const [serverName, serverConfig] of Object.entries(config)) {
    if (serverConfig.env && typeof serverConfig.env === 'object') {
      for (const [key, value] of Object.entries(serverConfig.env)) {
        const placeholder = isPlaceholderValue(value)
        vars.push({
          serverName,
          key,
          value: placeholder ? '' : value,
          placeholder: String(value),
          isPlaceholder: placeholder
        })
      }
    }
  }
  return vars
}

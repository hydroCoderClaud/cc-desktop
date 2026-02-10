/**
 * 共享 HTTP 客户端模块
 * 提供统一的 HTTP GET 请求、代理支持和错误分类
 * 供 Skills/Agents/Prompts 市场共用
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

const HTTP_TIMEOUT = 30000

/**
 * HTTP GET 请求
 * @param {string} url - 请求 URL
 * @returns {Promise<string>} 响应体
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const httpModule = isHttps ? https : http

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'CC-Desktop-Market/1.0'
      },
      timeout: HTTP_TIMEOUT
    }

    // 尝试获取代理配置
    const proxyUrl = getProxyUrl()
    if (proxyUrl && isHttps) {
      try {
        const HttpsProxyAgent = require('https-proxy-agent')
        options.agent = new HttpsProxyAgent(proxyUrl)
        console.log('[HttpClient] Using proxy:', proxyUrl)
      } catch (e) {
        console.warn('[HttpClient] https-proxy-agent not available, direct connection')
      }
    }

    const req = httpModule.request(options, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location).then(resolve).catch(reject)
        return
      }

      if (res.statusCode !== 200) {
        const err = new Error(`HTTP ${res.statusCode}`)
        err.statusCode = res.statusCode
        reject(err)
        return
      }

      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      const err = new Error('连接超时')
      err.code = 'TIMEOUT'
      reject(err)
    })

    req.end()
  })
}

/**
 * 获取代理 URL（从应用配置中读取）
 * @returns {string|null}
 */
function getProxyUrl() {
  try {
    const ConfigManager = require('../config-manager')
    const configManager = new ConfigManager()
    const apiConfig = configManager.getAPIConfig()
    if (apiConfig.useProxy && apiConfig.httpsProxy) {
      return apiConfig.httpsProxy
    }
  } catch (e) {
    // 忽略，直连
  }
  return null
}

/**
 * 分类 HTTP 错误为用户友好的消息
 * @param {Error} err
 * @returns {string}
 */
function classifyHttpError(err) {
  if (err.code === 'TIMEOUT') return '连接超时'
  if (err.code === 'ENOTFOUND') return '网络错误，请检查连接'
  if (err.code === 'ECONNREFUSED') return '连接被拒绝'
  if (err.statusCode === 404) return '注册表未找到，请检查 URL'
  if (err.statusCode === 403) return '访问被拒绝'
  if (err.message?.includes('JSON')) return '注册表格式无效'
  return err.message || '未知错误'
}

module.exports = { httpGet, getProxyUrl, classifyHttpError }

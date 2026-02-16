/**
 * 共享 HTTP 客户端模块
 * 提供统一的 HTTP GET 请求、代理支持和错误分类
 * 供 Skills/Agents/Prompts 市场共用
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

const HTTP_TIMEOUT = 30000
const MAX_REDIRECTS = 5
const MAX_CONTENT_LENGTH = 1024 * 1024  // 1MB

// 缓存代理配置，避免每次请求都读磁盘
let _cachedProxyUrl = undefined
let _proxyCacheTime = 0
const PROXY_CACHE_TTL = 30000  // 30 秒

/**
 * HTTP GET 请求
 * @param {string} url - 请求 URL
 * @param {number} _redirectCount - 内部使用，当前重定向次数
 * @returns {Promise<string>} 响应体
 */
function httpGet(url, _redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (_redirectCount > MAX_REDIRECTS) {
      const err = new Error('重定向次数超限')
      err.code = 'TOO_MANY_REDIRECTS'
      return reject(err)
    }

    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const httpModule = isHttps ? https : http

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'CC-Desktop-Market/1.0',
        'Cache-Control': 'no-cache, no-store',
        'Pragma': 'no-cache'
      },
      timeout: HTTP_TIMEOUT
    }

    // 尝试获取代理配置
    const proxyUrl = getProxyUrl()
    if (proxyUrl && isHttps) {
      try {
        const { HttpsProxyAgent } = require('https-proxy-agent')
        options.agent = new HttpsProxyAgent(proxyUrl)
        console.log('[HttpClient] Using proxy:', proxyUrl)
      } catch (e) {
        console.warn('[HttpClient] https-proxy-agent not available, direct connection')
      }
    }

    const req = httpModule.request(options, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, _redirectCount + 1).then(resolve).catch(reject)
        return
      }

      if (res.statusCode !== 200) {
        const err = new Error(`HTTP ${res.statusCode}`)
        err.statusCode = res.statusCode
        reject(err)
        return
      }

      let data = ''
      let totalLength = 0
      let settled = false
      res.on('data', chunk => {
        if (settled) return
        totalLength += chunk.length
        if (totalLength > MAX_CONTENT_LENGTH) {
          settled = true
          res.destroy()
          const err = new Error('响应内容过大')
          err.code = 'CONTENT_TOO_LARGE'
          reject(err)
          return
        }
        data += chunk
      })
      res.on('end', () => { if (!settled) resolve(data) })
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
 * 获取代理 URL（从应用配置中读取，带缓存）
 * @returns {string|null}
 */
function getProxyUrl() {
  const now = Date.now()
  if (_cachedProxyUrl !== undefined && (now - _proxyCacheTime) < PROXY_CACHE_TTL) {
    return _cachedProxyUrl
  }

  try {
    const ConfigManager = require('../config-manager')
    const configManager = new ConfigManager()
    const apiConfig = configManager.getAPIConfig()
    if (apiConfig.useProxy && apiConfig.httpsProxy) {
      _cachedProxyUrl = apiConfig.httpsProxy
    } else {
      _cachedProxyUrl = null
    }
  } catch (e) {
    _cachedProxyUrl = null
  }
  _proxyCacheTime = now
  return _cachedProxyUrl
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
  if (err.code === 'TOO_MANY_REDIRECTS') return '重定向次数过多'
  if (err.code === 'CONTENT_TOO_LARGE') return '响应内容过大（超过 1MB）'
  if (err.statusCode === 404) return '注册表未找到，请检查 URL'
  if (err.statusCode === 403) return '访问被拒绝'
  if (err.message?.includes('JSON')) return '注册表格式无效'
  return err.message || '未知错误'
}

/**
 * 简单 semver 比较：remote 是否比 local 更新
 * 仅支持 x.y.z 格式，不处理 pre-release
 * @param {string} remoteVersion
 * @param {string} localVersion
 * @returns {boolean}
 */
function isNewerVersion(remoteVersion, localVersion) {
  if (!remoteVersion || !localVersion) return false
  const r = remoteVersion.split('.').map(Number)
  const l = localVersion.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const rv = r[i] || 0
    const lv = l[i] || 0
    if (rv > lv) return true
    if (rv < lv) return false
  }
  return false // 相同版本
}

/**
 * 校验市场组件 ID 是否安全（防路径穿越）
 * 只允许小写字母、数字、连字符
 * @param {string} id
 * @returns {boolean}
 */
function isValidMarketId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(id)
}

/**
 * 校验文件名是否安全（防路径穿越）
 * 不允许 ..、绝对路径、反斜杠
 * @param {string} filename
 * @returns {boolean}
 */
function isSafeFilename(filename) {
  if (typeof filename !== 'string') return false
  if (filename.includes('..') || filename.startsWith('/') || filename.startsWith('\\')) return false
  // 不允许反斜杠（Windows 路径分隔符）
  if (filename.includes('\\')) return false
  return true
}

module.exports = { httpGet, getProxyUrl, classifyHttpError, isNewerVersion, isValidMarketId, isSafeFilename }

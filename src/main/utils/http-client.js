/**
 * 共享 HTTP 客户端模块
 * 提供统一的 HTTP GET 请求、系统代理支持和错误分类
 * 供 Skills/Agents/Prompts 市场共用
 */

const https = require('https')
const http = require('http')
const { URL } = require('url')

const HTTP_TIMEOUT = 30000
const MAX_REDIRECTS = 5
const MAX_CONTENT_LENGTH = 1024 * 1024  // 1MB

/**
 * 通过 Electron session.resolveProxy 获取系统代理
 * @param {string} url - 请求 URL
 * @returns {Promise<string|null>} 代理地址或 null
 */
async function resolveSystemProxy(url) {
  try {
    const { session } = require('electron')
    const proxyStr = await session.defaultSession.resolveProxy(url)
    // resolveProxy 返回格式: "PROXY host:port" 或 "DIRECT"
    if (!proxyStr || proxyStr === 'DIRECT') return null
    const match = proxyStr.match(/^PROXY\s+(.+)$/)
    if (match) {
      const proxyAddr = match[1]
      // 补全协议前缀
      if (proxyAddr.startsWith('http://') || proxyAddr.startsWith('https://')) {
        return proxyAddr
      }
      return `http://${proxyAddr}`
    }
    return null
  } catch (e) {
    console.warn('[HttpClient] Failed to resolve system proxy:', e.message)
    return null
  }
}

/**
 * HTTP GET 请求（自动使用系统代理）
 * @param {string} url - 请求 URL
 * @param {number} _redirectCount - 内部使用，当前重定向次数
 * @returns {Promise<string>} 响应体
 */
async function httpGet(url, _redirectCount = 0) {
  if (_redirectCount > MAX_REDIRECTS) {
    const err = new Error('重定向次数超限')
    err.code = 'TOO_MANY_REDIRECTS'
    throw err
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

  // 使用系统代理
  const proxyUrl = await resolveSystemProxy(url)
  if (proxyUrl && isHttps) {
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent')
      options.agent = new HttpsProxyAgent(proxyUrl)
      console.log('[HttpClient] Using system proxy:', proxyUrl)
    } catch (e) {
      console.warn('[HttpClient] https-proxy-agent not available, direct connection')
    }
  }

  return new Promise((resolve, reject) => {
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
 * 分类 HTTP 错误为用户友好的消息
 * @param {Error} err
 * @returns {string}
 */
function classifyHttpError(err) {
  const NETWORK_HINT = '，请检查网络连接或尝试开启 VPN'
  if (err.code === 'TIMEOUT') return '连接超时' + NETWORK_HINT
  if (err.code === 'ENOTFOUND') return '无法解析服务器地址' + NETWORK_HINT
  if (err.code === 'ECONNREFUSED') return '连接被拒绝' + NETWORK_HINT
  if (err.code === 'ECONNRESET') return '连接被重置' + NETWORK_HINT
  if (err.code === 'ECONNABORTED') return '连接被中断' + NETWORK_HINT
  if (err.code === 'EPIPE') return '连接已断开' + NETWORK_HINT
  if (err.code === 'EHOSTUNREACH') return '服务器不可达' + NETWORK_HINT
  if (err.code === 'EAI_AGAIN') return 'DNS 解析失败' + NETWORK_HINT
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

/**
 * 获取注册表索引（skills + agents + prompts 共用）
 * @param {string} registryUrl - 注册表基础 URL
 * @returns {{ success: boolean, data?: { skills, agents, prompts }, error?: string }}
 */
async function fetchRegistryIndex(registryUrl) {
  if (!registryUrl || typeof registryUrl !== 'string') {
    return { success: false, error: '注册表 URL 不能为空' }
  }

  const url = registryUrl.replace(/\/+$/, '') + '/index.json'
  console.log('[HttpClient] Fetching registry index:', url)

  try {
    const body = await httpGet(url)
    const data = JSON.parse(body)

    return {
      success: true,
      data: {
        skills: Array.isArray(data.skills) ? data.skills : [],
        agents: Array.isArray(data.agents) ? data.agents : [],
        prompts: Array.isArray(data.prompts) ? data.prompts : []
      }
    }
  } catch (err) {
    console.error('[HttpClient] Failed to fetch registry index:', err.message)
    return { success: false, error: classifyHttpError(err) }
  }
}

module.exports = { httpGet, fetchRegistryIndex, classifyHttpError, isNewerVersion, isValidMarketId, isSafeFilename }

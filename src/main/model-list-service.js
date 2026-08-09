const http = require('http')
const https = require('https')
const { URL } = require('url')
const { HttpsProxyAgent } = require('https-proxy-agent')
const { HttpProxyAgent } = require('http-proxy-agent')

const DEFAULT_TIMEOUT_MS = 15000
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_MODEL_PAGES = 20
const ANTHROPIC_VERSION = '2023-06-01'

function normalizeBaseUrl(baseUrl) {
  const value = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  if (!value) {
    throw new Error('API base URL is required')
  }

  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API base URL must use http or https')
  }

  url.hash = ''
  return url
}

function buildModelListCandidates(baseUrl) {
  const base = normalizeBaseUrl(baseUrl)
  const scopedBase = new URL(base.toString())
  if (!scopedBase.pathname.endsWith('/')) {
    scopedBase.pathname += '/'
  }

  const candidates = [
    new URL('v1/models', scopedBase),
    new URL('/v1/models', base.origin),
    new URL('/models', base.origin)
  ]

  const seen = new Set()
  return candidates
    .map(url => url.toString())
    .filter(url => {
      if (seen.has(url)) return false
      seen.add(url)
      return true
    })
}

function normalizeModelIds(modelIds) {
  const normalized = []
  const seen = new Set()

  for (const modelId of Array.isArray(modelIds) ? modelIds : []) {
    const value = typeof modelId === 'string' ? modelId.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function extractModelIds(payload) {
  const entries = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.data) ? payload.data : payload?.models)

  if (!Array.isArray(entries)) {
    return { valid: false, ids: [] }
  }

  const ids = entries.map(entry => {
    if (typeof entry === 'string') return entry
    return entry && typeof entry.id === 'string' ? entry.id : ''
  })

  return { valid: true, ids: normalizeModelIds(ids) }
}

function buildAuthHeaders(apiConfig, authScheme) {
  const token = typeof apiConfig?.authToken === 'string' ? apiConfig.authToken.trim() : ''
  if (!token) {
    throw new Error('API key is required')
  }

  const useBearer = authScheme === 'bearer' || apiConfig.authType === 'auth_token'
  return {
    ...(useBearer
      ? { Authorization: `Bearer ${token}` }
      : { 'x-api-key': token }),
    'anthropic-version': ANTHROPIC_VERSION,
    Accept: 'application/json'
  }
}

function appendAfterId(urlString, afterId) {
  const url = new URL(urlString)
  url.searchParams.set('after_id', afterId)
  return url.toString()
}

function resolveProxyUrl(apiConfig, targetUrl) {
  if (!apiConfig?.useProxy) return ''

  const isHttps = new URL(targetUrl).protocol === 'https:'
  const preferred = isHttps ? apiConfig.httpsProxy : apiConfig.httpProxy
  const fallback = isHttps ? apiConfig.httpProxy : apiConfig.httpsProxy
  return typeof preferred === 'string' && preferred.trim()
    ? preferred.trim()
    : (typeof fallback === 'string' ? fallback.trim() : '')
}

function resolveTimeoutMs(value) {
  const timeoutMs = Number(value)
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.max(1000, timeoutMs)
    : DEFAULT_TIMEOUT_MS
}

function requestJson(urlString, { headers, timeoutMs, proxyUrl } = {}) {
  const url = new URL(urlString)
  const isHttps = url.protocol === 'https:'
  const transport = isHttps ? https : http
  const requestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method: 'GET',
    headers,
    timeout: timeoutMs
  }

  if (proxyUrl) {
    requestOptions.agent = isHttps
      ? new HttpsProxyAgent(proxyUrl)
      : new HttpProxyAgent(proxyUrl)
  }

  return new Promise((resolve, reject) => {
    let request
    let settled = false
    let responseData = ''
    let responseBytes = 0

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }

    try {
      request = transport.request(requestOptions, response => {
        response.setEncoding('utf8')

        response.on('data', chunk => {
          responseBytes += Buffer.byteLength(chunk)
          if (responseBytes > MAX_RESPONSE_BYTES) {
            const error = new Error('Model list response is too large')
            error.code = 'MODEL_LIST_RESPONSE_TOO_LARGE'
            request.destroy(error)
            return
          }
          responseData += chunk
        })

        response.on('end', () => {
          let payload = null
          const statusCode = response.statusCode || 0
          if (statusCode >= 200 && statusCode < 300 && responseData.trim()) {
            try {
              payload = JSON.parse(responseData)
            } catch (error) {
              error.code = 'MODEL_LIST_INVALID_JSON'
              finish(reject, error)
              return
            }
          }

          finish(resolve, {
            statusCode,
            payload,
            responseText: responseData
          })
        })
      })

      request.on('error', error => finish(reject, error))
      request.on('timeout', () => {
        const error = new Error(`Model list request timed out after ${timeoutMs}ms`)
        error.code = 'MODEL_LIST_TIMEOUT'
        request.destroy(error)
      })
      request.end()
    } catch (error) {
      finish(reject, error)
    }
  })
}

function getAuthSchemes(apiConfig) {
  if (apiConfig?.authType === 'auth_token') return ['bearer']
  return ['api_key', 'bearer']
}

function formatHttpFailure(statusCode) {
  if (statusCode === 401 || statusCode === 403) return 'Authentication was rejected'
  if (statusCode === 404 || statusCode === 405) return 'Model list endpoint was not found'
  return `Model list request failed with HTTP ${statusCode}`
}

async function requestAllModelPages(urlString, apiConfig, authScheme, timeoutMs) {
  let nextUrl = urlString
  const modelIds = []

  for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
    const response = await requestJson(nextUrl, {
      headers: buildAuthHeaders(apiConfig, authScheme),
      timeoutMs,
      proxyUrl: resolveProxyUrl(apiConfig, nextUrl)
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        success: false,
        kind: 'http',
        statusCode: response.statusCode,
        message: formatHttpFailure(response.statusCode)
      }
    }

    const extracted = extractModelIds(response.payload)
    if (!extracted.valid) {
      return {
        success: false,
        kind: 'format',
        message: 'Model list response did not contain a supported model array'
      }
    }

    modelIds.push(...extracted.ids)

    const hasMore = response.payload && response.payload.has_more === true
    const lastId = typeof response.payload?.last_id === 'string'
      ? response.payload.last_id.trim()
      : ''
    if (!hasMore || !lastId) break

    nextUrl = appendAfterId(nextUrl, lastId)
  }

  return { success: true, models: normalizeModelIds(modelIds) }
}

async function fetchModels(apiConfig, options = {}) {
  try {
    const candidates = buildModelListCandidates(apiConfig?.baseUrl)
    const authSchemes = getAuthSchemes(apiConfig)
    const timeoutMs = resolveTimeoutMs(options.timeoutMs)
    const failures = []

    for (const endpoint of candidates) {
      for (let schemeIndex = 0; schemeIndex < authSchemes.length; schemeIndex += 1) {
        const authScheme = authSchemes[schemeIndex]
        let result
        try {
          result = await requestAllModelPages(endpoint, apiConfig, authScheme, timeoutMs)
        } catch (error) {
          if (error.code === 'MODEL_LIST_INVALID_JSON') {
            failures.push({ endpoint, message: 'Invalid JSON response' })
            break
          }
          return {
            success: false,
            errorCode: error.code || 'MODEL_LIST_REQUEST_FAILED',
            message: error.message || 'Model list request failed'
          }
        }

        if (result.success) {
          return {
            success: true,
            models: result.models,
            endpoint,
            authScheme
          }
        }

        failures.push({ endpoint, statusCode: result.statusCode, message: result.message })

        const canRetryAuth = (result.statusCode === 401 || result.statusCode === 403)
          && schemeIndex < authSchemes.length - 1
        if (canRetryAuth) continue
        break
      }
    }

    const lastFailure = failures[failures.length - 1]
    const errorCode = failures.some(failure => failure.statusCode === 401 || failure.statusCode === 403)
      ? 'MODEL_LIST_AUTH_FAILED'
      : 'MODEL_LIST_UNSUPPORTED'
    return {
      success: false,
      errorCode,
      message: lastFailure?.message || 'This API does not expose a supported model list endpoint'
    }
  } catch (error) {
    return {
      success: false,
      errorCode: 'MODEL_LIST_CONFIG_INVALID',
      message: error.message || 'Invalid API configuration'
    }
  }
}

module.exports = {
  fetchModels,
  buildModelListCandidates,
  extractModelIds,
  normalizeModelIds,
  resolveProxyUrl,
  resolveTimeoutMs
}

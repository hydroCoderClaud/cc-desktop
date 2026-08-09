import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

let server = null

async function startServer(handler) {
  server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  if (!server) return
  await new Promise(resolve => server.close(resolve))
  server = null
})

function profile(baseUrl, overrides = {}) {
  return {
    baseUrl,
    authToken: 'test-key',
    authType: 'api_key',
    requestTimeout: 3000,
    ...overrides
  }
}

describe('model-list-service', () => {
  it('loads and de-duplicates model IDs from the Anthropic model endpoint', async () => {
    const origin = await startServer((request, response) => {
      expect(request.url).toBe('/v1/models')
      expect(request.headers['x-api-key']).toBe('test-key')
      expect(request.headers['anthropic-version']).toBe('2023-06-01')
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        data: [
          { id: 'claude-sonnet-4-6' },
          { id: 'claude-opus-4-6' },
          { id: 'claude-sonnet-4-6' }
        ]
      }))
    })
    const { fetchModels } = await import('../../src/main/model-list-service.js')

    const result = await fetchModels(profile(origin))

    expect(result).toMatchObject({
      success: true,
      endpoint: `${origin}/v1/models`,
      models: ['claude-sonnet-4-6', 'claude-opus-4-6']
    })
  })

  it('falls back from an Anthropic-scoped base URL to a root model endpoint', async () => {
    const seenRequests = []
    const origin = await startServer((request, response) => {
      seenRequests.push({ url: request.url, authorization: request.headers.authorization })
      if (request.url === '/models' && request.headers.authorization === 'Bearer test-key') {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ data: [{ id: 'deepseek-v4-flash' }] }))
        return
      }

      response.statusCode = request.url === '/models' ? 401 : 404
      response.end(JSON.stringify({ error: 'not available' }))
    })
    const { fetchModels } = await import('../../src/main/model-list-service.js')

    const result = await fetchModels(profile(`${origin}/anthropic`))

    expect(result).toMatchObject({
      success: true,
      endpoint: `${origin}/models`,
      authScheme: 'bearer',
      models: ['deepseek-v4-flash']
    })
    expect(seenRequests.map(request => request.url)).toEqual([
      '/anthropic/v1/models',
      '/v1/models',
      '/models',
      '/models'
    ])
  })

  it('collects all paginated Anthropic model results', async () => {
    const origin = await startServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url === '/v1/models') {
        response.end(JSON.stringify({
          data: [{ id: 'claude-sonnet-4-6' }],
          has_more: true,
          last_id: 'claude-sonnet-4-6'
        }))
        return
      }

      expect(request.url).toBe('/v1/models?after_id=claude-sonnet-4-6')
      response.end(JSON.stringify({
        data: [{ id: 'claude-opus-4-6' }],
        has_more: false
      }))
    })
    const { fetchModels } = await import('../../src/main/model-list-service.js')

    const result = await fetchModels(profile(origin))

    expect(result.models).toEqual(['claude-sonnet-4-6', 'claude-opus-4-6'])
  })

  it('reports an unsupported API when no candidate endpoint exists', async () => {
    const origin = await startServer((_request, response) => {
      response.statusCode = 404
      response.end()
    })
    const { fetchModels } = await import('../../src/main/model-list-service.js')

    const result = await fetchModels(profile(`${origin}/anthropic`))

    expect(result).toMatchObject({
      success: false,
      errorCode: 'MODEL_LIST_UNSUPPORTED'
    })
  })

  it('uses the protocol-specific proxy and a short independent default timeout', async () => {
    const { resolveProxyUrl, resolveTimeoutMs } = await import('../../src/main/model-list-service.js')

    expect(resolveProxyUrl({
      useProxy: true,
      httpsProxy: 'https://secure-proxy.example.com:8443',
      httpProxy: 'http://plain-proxy.example.com:8080'
    }, 'https://api.example.com/v1/models')).toBe('https://secure-proxy.example.com:8443')
    expect(resolveProxyUrl({
      useProxy: true,
      httpsProxy: '',
      httpProxy: 'http://plain-proxy.example.com:8080'
    }, 'https://api.example.com/v1/models')).toBe('http://plain-proxy.example.com:8080')
    expect(resolveProxyUrl({ useProxy: true, httpProxy: 'http://plain-proxy.example.com:8080' },
      'http://api.example.com/v1/models')).toBe('http://plain-proxy.example.com:8080')
    expect(resolveTimeoutMs(undefined)).toBe(15000)
    expect(resolveTimeoutMs(120000)).toBe(120000)
    expect(resolveTimeoutMs('invalid')).toBe(15000)
  })
})

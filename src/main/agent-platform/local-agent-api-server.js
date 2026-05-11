const http = require('http')
const { URL } = require('url')
const WebSocket = require('ws')

function normalizeNodeClient(client = {}) {
  const rawAppId = typeof client.appId === 'string' ? client.appId.trim() : ''
  const appId = rawAppId || 'node-app'
  return {
    appId,
    clientId: `node:${appId}`,
    clientType: 'node',
    clientMeta: client.clientMeta && typeof client.clientMeta === 'object' && !Array.isArray(client.clientMeta)
      ? client.clientMeta
      : {}
  }
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!body) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

class LocalAgentApiServer {
  constructor(options = {}) {
    this.agentSessionBroker = options.agentSessionBroker || null
    this.agentEventRouter = options.agentEventRouter || null
    this.configManager = options.configManager || null
    this.host = options.host || '127.0.0.1'
    this.server = null
    this.wsServer = null
    this.port = null
    this.clientSockets = new Map()
  }

  setDependencies(options = {}) {
    if (options.agentSessionBroker) {
      this.agentSessionBroker = options.agentSessionBroker
    }
    if (options.agentEventRouter) {
      this.agentEventRouter = options.agentEventRouter
    }
    if (options.configManager) {
      this.configManager = options.configManager
    }
  }

  isRunning() {
    return !!this.server?.listening
  }

  getStatus() {
    return {
      enabled: !!this.configManager?.getConfig?.()?.settings?.localAgentApi?.enabled,
      running: this.isRunning(),
      host: this.host,
      port: this.port
    }
  }

  async start() {
    if (this.isRunning()) {
      return this.getStatus()
    }
    if (!this.agentSessionBroker || !this.agentEventRouter) {
      throw new Error('Local agent API server dependencies are not ready')
    }

    this.server = http.createServer((req, res) => {
      this._handleHttp(req, res).catch(err => {
        console.error('[LocalAgentApi] HTTP handler failed:', err)
        if (!res.headersSent) {
          writeJson(res, 500, {
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: err.message || 'Internal error'
            }
          })
        }
      })
    })

    this.wsServer = new WebSocket.Server({ noServer: true })
    this.server.on('upgrade', (req, socket, head) => {
      this._handleUpgrade(req, socket, head)
    })
    this.wsServer.on('connection', (socket, req, client) => {
      this._attachSocket(socket, req, client)
    })

    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, this.host, () => {
        this.server.off('error', reject)
        resolve()
      })
    })

    const address = this.server.address()
    this.port = typeof address === 'object' && address ? address.port : null
    console.log('[LocalAgentApi] Listening on', `${this.host}:${this.port}`)
    return this.getStatus()
  }

  async stop() {
    for (const socketState of this.clientSockets.values()) {
      try {
        socketState.unsubscribe?.()
      } catch {}
      try {
        socketState.socket.close()
      } catch {}
    }
    this.clientSockets.clear()

    if (this.wsServer) {
      await new Promise(resolve => this.wsServer.close(() => resolve()))
      this.wsServer = null
    }

    if (this.server) {
      await new Promise(resolve => this.server.close(() => resolve()))
      this.server = null
    }

    this.port = null
    return this.getStatus()
  }

  async restartIfEnabled() {
    const enabled = !!this.configManager?.getConfig?.()?.settings?.localAgentApi?.enabled
    if (enabled) {
      return this.start()
    }
    if (this.isRunning()) {
      await this.stop()
    }
    return this.getStatus()
  }

  _resolveClientFromHeaders(req) {
    const appId = typeof req.headers['x-hydro-app-id'] === 'string'
      ? req.headers['x-hydro-app-id']
      : ''
    const rawMeta = typeof req.headers['x-hydro-client-meta'] === 'string'
      ? req.headers['x-hydro-client-meta']
      : ''
    let clientMeta = {}
    if (rawMeta) {
      try {
        clientMeta = JSON.parse(rawMeta)
      } catch {}
    }
    return normalizeNodeClient({ appId, clientMeta })
  }

  _requireNodeClient(req, res) {
    const client = this._resolveClientFromHeaders(req)
    if (!client.appId || client.appId === 'node-app') {
      writeJson(res, 400, {
        success: false,
        error: {
          code: 'APP_ID_REQUIRED',
          message: 'x-hydro-app-id header is required'
        }
      })
      return null
    }
    return client
  }

  async _handleHttp(req, res) {
    const method = req.method || 'GET'
    const url = new URL(req.url || '/', `http://${this.host}`)
    if (!url.pathname.startsWith('/v1/agent')) {
      writeJson(res, 404, {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found'
        }
      })
      return
    }

    if (url.pathname === '/v1/agent/status' && method === 'GET') {
      writeJson(res, 200, {
        success: true,
        data: this.getStatus()
      })
      return
    }

    const client = this._requireNodeClient(req, res)
    if (!client) return

    if (url.pathname === '/v1/agent/sessions' && method === 'POST') {
      const body = await readJsonBody(req)
      const session = await this.agentSessionBroker.create(body || {}, client)
      writeJson(res, 200, { success: true, data: session })
      return
    }

    if (url.pathname === '/v1/agent/sessions' && method === 'GET') {
      const sessions = await this.agentSessionBroker.list(client)
      writeJson(res, 200, { success: true, data: sessions })
      return
    }

    const sessionMatch = url.pathname.match(/^\/v1\/agent\/sessions\/([^/]+)(?:\/(.*))?$/)
    if (!sessionMatch) {
      writeJson(res, 404, {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found'
        }
      })
      return
    }

    const sessionId = decodeURIComponent(sessionMatch[1])
    const tail = sessionMatch[2] || ''

    if (!tail && method === 'GET') {
      const session = await this.agentSessionBroker.get(sessionId, client)
      writeJson(res, 200, { success: true, data: session })
      return
    }

    if (tail === 'messages' && method === 'GET') {
      const messages = await this.agentSessionBroker.getMessages(sessionId, client)
      writeJson(res, 200, { success: true, data: messages })
      return
    }

    if (tail === 'messages' && method === 'POST') {
      const body = await readJsonBody(req)
      await this.agentSessionBroker.sendMessage(sessionId, body.message, {
        model: body.model || body.modelTier,
        maxTurns: body.maxTurns
      }, client)
      writeJson(res, 200, { success: true, data: { accepted: true } })
      return
    }

    if (tail === 'cancel' && method === 'POST') {
      await this.agentSessionBroker.cancel(sessionId, client)
      writeJson(res, 200, { success: true, data: { cancelled: true } })
      return
    }

    if (tail === 'close' && method === 'POST') {
      await this.agentSessionBroker.close(sessionId, client)
      writeJson(res, 200, { success: true, data: { closed: true } })
      return
    }

    if (tail === 'reopen' && method === 'POST') {
      const session = await this.agentSessionBroker.reopen(sessionId, client)
      writeJson(res, 200, { success: true, data: session })
      return
    }

    if (tail === 'set-model' && method === 'POST') {
      const body = await readJsonBody(req)
      const result = await this.agentSessionBroker.setModel(sessionId, body.model, client)
      writeJson(res, 200, { success: true, data: result || { updated: true } })
      return
    }

    if (tail === 'files/list' && method === 'POST') {
      const body = await readJsonBody(req)
      const result = await this.agentSessionBroker.listDir(sessionId, body.relativePath || '', !!body.showHidden, client)
      writeJson(res, 200, { success: true, data: result })
      return
    }

    if (tail === 'files/read' && method === 'POST') {
      const body = await readJsonBody(req)
      const result = await this.agentSessionBroker.readFile(sessionId, body.relativePath, client)
      writeJson(res, 200, { success: true, data: result })
      return
    }

    if (tail === 'files/save' && method === 'POST') {
      const body = await readJsonBody(req)
      const result = await this.agentSessionBroker.saveFile(sessionId, body.relativePath, body.content, client)
      writeJson(res, 200, { success: true, data: result })
      return
    }

    if (tail === 'files/search' && method === 'POST') {
      const body = await readJsonBody(req)
      const result = await this.agentSessionBroker.searchFiles(sessionId, body.keyword, !!body.showHidden, client)
      writeJson(res, 200, { success: true, data: result })
      return
    }

    const interactionMatch = tail.match(/^interactions\/([^/]+)\/(respond|cancel)$/)
    if (interactionMatch && method === 'POST') {
      const interactionId = decodeURIComponent(interactionMatch[1])
      const action = interactionMatch[2]
      const body = await readJsonBody(req)
      const result = action === 'respond'
        ? await this.agentSessionBroker.resolveInteraction(sessionId, interactionId, body || {}, client)
        : await this.agentSessionBroker.cancelInteraction(sessionId, interactionId, body.reason, client)
      writeJson(res, 200, { success: true, data: result })
      return
    }

    writeJson(res, 404, {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found'
      }
    })
  }

  _handleUpgrade(req, socket, head) {
    const url = new URL(req.url || '/', `http://${this.host}`)
    if (url.pathname !== '/v1/agent/events') {
      socket.destroy()
      return
    }

    const client = this._resolveClientFromHeaders(req)
    if (!client.appId || client.appId === 'node-app') {
      socket.destroy()
      return
    }

    this.wsServer.handleUpgrade(req, socket, head, (ws) => {
      this.wsServer.emit('connection', ws, req, client)
    })
  }

  _attachSocket(socket, _req, client) {
    const normalizedClient = normalizeNodeClient(client)
    const { subscriptionId } = this.agentEventRouter.registerClient(normalizedClient, (event) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event))
      }
    })

    this.clientSockets.set(subscriptionId, {
      socket,
      unsubscribe: () => this.agentEventRouter.unregisterClient(subscriptionId)
    })

    socket.on('close', () => {
      const state = this.clientSockets.get(subscriptionId)
      if (state) {
        state.unsubscribe()
        this.clientSockets.delete(subscriptionId)
      }
    })
  }
}

module.exports = { LocalAgentApiServer, normalizeNodeClient }

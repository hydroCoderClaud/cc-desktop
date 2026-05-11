import { afterEach, describe, expect, it, vi } from 'vitest'
import { once } from 'events'
import WebSocket from 'ws'

const serversToClose = []

async function createServer(overrides = {}) {
  const { AgentEventRouter } = await import('../../src/main/agent-platform/agent-event-router.js')
  const { LocalAgentApiServer } = await import('../../src/main/agent-platform/local-agent-api-server.js')

  const broker = {
    create: vi.fn(async (options, client) => ({
      id: 'session-1',
      options,
      ownerClientId: client.clientId
    })),
    list: vi.fn(async () => []),
    get: vi.fn(async (sessionId) => ({ id: sessionId })),
    getMessages: vi.fn(async () => []),
    sendMessage: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    reopen: vi.fn(async (sessionId) => ({ id: sessionId, reopened: true })),
    setModel: vi.fn(async (_sessionId, model) => ({ updated: true, model })),
    listDir: vi.fn(async () => ({ entries: [] })),
    readFile: vi.fn(async () => ({ content: 'demo' })),
    saveFile: vi.fn(async () => ({ saved: true })),
    searchFiles: vi.fn(async () => ({ entries: [] })),
    resolveInteraction: vi.fn(async () => ({ accepted: true })),
    cancelInteraction: vi.fn(async () => ({ cancelled: true })),
    ...overrides.broker
  }

  const router = new AgentEventRouter({
    resolveOwnerClientId: (sessionId) => {
      if (sessionId === 'session-1') return 'node:demo-app'
      if (sessionId === 'session-2') return 'node:other-app'
      return 'host-ui'
    }
  })

  const configManager = {
    getConfig: () => ({
      settings: {
        localAgentApi: { enabled: true }
      }
    })
  }

  const server = new LocalAgentApiServer({
    agentSessionBroker: broker,
    agentEventRouter: router,
    configManager
  })

  await server.start()
  serversToClose.push(server)
  return { server, broker, router }
}

afterEach(async () => {
  while (serversToClose.length > 0) {
    const server = serversToClose.pop()
    await server.stop()
  }
})

describe('LocalAgentApiServer', () => {
  it('rejects session routes without x-hydro-app-id header', async () => {
    const { server } = await createServer()

    const response = await fetch(`http://${server.host}:${server.port}/v1/agent/sessions`)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('APP_ID_REQUIRED')
  })

  it('creates sessions with normalized node client ownership', async () => {
    const { server, broker } = await createServer()

    const response = await fetch(`http://${server.host}:${server.port}/v1/agent/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hydro-app-id': 'demo-app',
        'x-hydro-client-meta': JSON.stringify({ entry: 'cli' })
      },
      body: JSON.stringify({
        cwd: '/tmp/demo'
      })
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(broker.create).toHaveBeenCalledOnce()
    expect(broker.create).toHaveBeenCalledWith(
      { cwd: '/tmp/demo' },
      {
        appId: 'demo-app',
        clientId: 'node:demo-app',
        clientType: 'node',
        clientMeta: { entry: 'cli' }
      }
    )
    expect(body.data.ownerClientId).toBe('node:demo-app')
  })

  it('routes websocket events only to the owning node client', async () => {
    const { server, router } = await createServer()
    const ws = new WebSocket(`ws://${server.host}:${server.port}/v1/agent/events`, {
      headers: {
        'x-hydro-app-id': 'demo-app'
      }
    })

    await once(ws, 'open')

    const messagePromise = once(ws, 'message')
    router.publish('agent:message', { sessionId: 'session-1', text: 'hello' })
    const [rawMessage] = await messagePromise
    const payload = JSON.parse(rawMessage.toString())

    expect(payload.channel).toBe('agent:message')
    expect(payload.ownerClientId).toBe('node:demo-app')
    expect(payload.payload).toEqual({ sessionId: 'session-1', text: 'hello' })

    ws.close()
    await once(ws, 'close')
  })
})

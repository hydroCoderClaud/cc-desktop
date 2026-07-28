import { describe, it, expect, vi } from 'vitest'

const { AgentEventRouter } = await import('../../src/main/agent-platform/agent-event-router.js')

describe('AgentEventRouter', () => {
  it('routes session events only to the owning client', () => {
    const hostSink = vi.fn()
    const embeddedSink = vi.fn()
    const router = new AgentEventRouter({
      resolveOwnerClientId: (sessionId) => sessionId === 'embed-session' ? 'embed:hydrology' : 'host-ui'
    })

    router.registerClient({ clientId: 'host-ui', clientType: 'host' }, hostSink)
    router.registerClient({ clientId: 'embed:hydrology', clientType: 'embedded' }, embeddedSink)

    router.publish('agent:message', {
      sessionId: 'embed-session',
      message: { role: 'assistant', content: 'ok' }
    })

    expect(embeddedSink).toHaveBeenCalledTimes(1)
    expect(embeddedSink.mock.calls[0][0]).toMatchObject({
      channel: 'agent:message',
      ownerClientId: 'embed:hydrology'
    })
    expect(hostSink).not.toHaveBeenCalled()
  })

  it('delivers host-owned events to each first-party host subscriber', () => {
    const mainWindowSink = vi.fn()
    const notebookWorkbenchSink = vi.fn()
    const router = new AgentEventRouter({
      resolveOwnerClientId: () => 'host-ui'
    })

    router.registerClient({ clientId: 'host-ui', clientType: 'host' }, mainWindowSink)
    router.registerClient({
      clientId: 'host-ui',
      clientType: 'host',
      clientMeta: { surface: 'notebook-workbench' }
    }, notebookWorkbenchSink)

    router.publish('agent:statusChange', {
      sessionId: 'notebook-session',
      status: 'idle'
    })

    expect(mainWindowSink).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'agent:statusChange',
      payload: { sessionId: 'notebook-session', status: 'idle' }
    }))
    expect(notebookWorkbenchSink).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'agent:statusChange',
      payload: { sessionId: 'notebook-session', status: 'idle' }
    }))
  })

  it('broadcasts allSessionsClosed to every registered client', () => {
    const hostSink = vi.fn()
    const embeddedSink = vi.fn()
    const router = new AgentEventRouter()

    router.registerClient({ clientId: 'host-ui', clientType: 'host' }, hostSink)
    router.registerClient({ clientId: 'embed:hydrology', clientType: 'embedded' }, embeddedSink)

    router.publish('agent:allSessionsClosed', {})

    expect(hostSink).toHaveBeenCalledTimes(1)
    expect(embeddedSink).toHaveBeenCalledTimes(1)
  })
})

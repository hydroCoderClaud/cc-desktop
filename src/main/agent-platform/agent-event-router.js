const { normalizeClient } = require('./agent-session-broker')

class AgentEventRouter {
  constructor(options = {}) {
    this.resolveOwnerClientId = typeof options.resolveOwnerClientId === 'function'
      ? options.resolveOwnerClientId
      : null
    this.defaultOwnerClientId = typeof options.defaultOwnerClientId === 'string' && options.defaultOwnerClientId.trim()
      ? options.defaultOwnerClientId.trim()
      : 'host-ui'
    this.clientSubscriptions = new Map()
    this.subscriptionCounter = 0
  }

  registerClient(client, sink) {
    if (typeof sink !== 'function') {
      throw new Error('Client sink must be a function')
    }

    const normalizedClient = normalizeClient(client)
    const subscriptionId = `agent-sub-${++this.subscriptionCounter}`
    const subscriptions = this.clientSubscriptions.get(normalizedClient.clientId) || new Map()
    subscriptions.set(subscriptionId, {
      client: normalizedClient,
      sink
    })
    this.clientSubscriptions.set(normalizedClient.clientId, subscriptions)
    return {
      subscriptionId,
      clientId: normalizedClient.clientId
    }
  }

  unregisterClient(subscriptionId) {
    if (!subscriptionId) return false

    for (const [clientId, subscriptions] of this.clientSubscriptions.entries()) {
      if (!subscriptions.has(subscriptionId)) continue
      subscriptions.delete(subscriptionId)
      if (subscriptions.size === 0) {
        this.clientSubscriptions.delete(clientId)
      }
      return true
    }

    return false
  }

  _resolveEventOwner(channel, payload, explicitOwnerClientId = null) {
    if (explicitOwnerClientId) return explicitOwnerClientId
    if (channel === 'agent:allSessionsClosed') return null

    const sessionId = payload?.sessionId
    if (!sessionId) return this.defaultOwnerClientId

    const resolved = this.resolveOwnerClientId?.(sessionId)
    return resolved || this.defaultOwnerClientId
  }

  _emitToClient(clientId, event) {
    const subscriptions = this.clientSubscriptions.get(clientId)
    if (!subscriptions?.size) return 0

    let delivered = 0
    for (const subscription of subscriptions.values()) {
      try {
        subscription.sink(event)
        delivered++
      } catch (err) {
        console.warn('[AgentEventRouter] Failed to deliver event:', {
          clientId,
          channel: event.channel,
          error: err.message
        })
      }
    }
    return delivered
  }

  publish(channel, payload, options = {}) {
    const ownerClientId = this._resolveEventOwner(channel, payload, options.ownerClientId || null)
    const event = {
      channel,
      payload,
      ownerClientId,
      timestamp: Date.now()
    }

    if (!ownerClientId) {
      let delivered = 0
      for (const clientId of this.clientSubscriptions.keys()) {
        delivered += this._emitToClient(clientId, event)
      }
      return delivered
    }

    return this._emitToClient(ownerClientId, event)
  }
}

module.exports = { AgentEventRouter }

const AGENT_EVENT_METHODS = {
  'agent:init': 'onAgentInit',
  'agent:message': 'onAgentMessage',
  'agent:stream': 'onAgentStream',
  'agent:result': 'onAgentResult',
  'agent:error': 'onAgentError',
  'agent:cliError': 'onAgentCliError',
  'agent:toolProgress': 'onAgentToolProgress',
  'agent:systemStatus': 'onAgentSystemStatus',
  'agent:otherMessage': 'onAgentOtherMessage',
  'agent:statusChange': 'onAgentStatusChange',
  'agent:compacted': 'onAgentCompacted',
  'agent:usage': 'onAgentUsage',
  'agent:interactionRequest': 'onAgentInteractionRequest',
  'agent:interactionResolved': 'onAgentInteractionResolved',
  'agent:allSessionsClosed': 'onAgentAllSessionsClosed'
}

function createEventListener(channel, callbacksByChannel) {
  return (callback) => {
    if (typeof callback !== 'function') return () => {}
    const callbacks = callbacksByChannel.get(channel) || new Set()
    callbacks.add(callback)
    callbacksByChannel.set(channel, callbacks)
    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        callbacksByChannel.delete(channel)
      }
    }
  }
}

export function createHydroAgentApiAdapter(hydroAgent) {
  if (!hydroAgent) return null

  const callbacksByChannel = new Map()
  let disposeHydroEvents = null

  const ensureEvents = () => {
    if (disposeHydroEvents || typeof hydroAgent.onEvent !== 'function') return
    disposeHydroEvents = hydroAgent.onEvent(null, (event) => {
      const callbacks = callbacksByChannel.get(event.channel)
      if (!callbacks?.size) return

      callbacks.forEach((callback) => {
        callback(event.payload)
      })
    })
  }

  ensureEvents()

  const adapter = {
    createAgentSession: (options) => hydroAgent.createSession(options),
    getAgentSession: (sessionId) => hydroAgent.getSession(sessionId),
    getAgentMessages: (sessionId) => hydroAgent.getMessages(sessionId),
    sendAgentMessage: ({ sessionId, message, model, modelTier, maxTurns }) =>
      hydroAgent.sendMessage(sessionId, {
        message,
        options: {
          model: model || modelTier,
          maxTurns
        }
      }),
    cancelAgentGeneration: (sessionId) => hydroAgent.cancel(sessionId),
    closeAgentSession: (sessionId) => hydroAgent.close(sessionId),
    reopenAgentSession: (sessionId) => hydroAgent.reopen(sessionId),
    switchAgentApiProfile: ({ sessionId, profileId }) => hydroAgent.switchApiProfile(sessionId, profileId),
    clearAndRecreateAgentSession: ({ sessionId, overrides }) =>
      hydroAgent.clearAndRecreate(sessionId, overrides || {}),
    setAgentModel: (sessionId, model) => hydroAgent.setModel(sessionId, model),
    getAgentSupportedCommands: (sessionId) => hydroAgent.getSupportedCommands(sessionId),
    getAgentInitResult: (sessionId) => hydroAgent.getInitResult(sessionId),
    getAgentMcpServerStatus: (sessionId) => hydroAgent.getMcpServerStatus(sessionId),
    listAgentDir: (sessionId, relativePath = '', showHidden = false) =>
      hydroAgent.listDir(sessionId, relativePath, showHidden),
    readAgentFile: (sessionId, relativePath) =>
      hydroAgent.readFile(sessionId, relativePath),
    saveAgentFile: ({ sessionId, relativePath, content }) =>
      hydroAgent.saveFile(sessionId, relativePath, content),
    createAgentFile: ({ sessionId, parentPath, name, isDirectory }) =>
      hydroAgent.createFile(sessionId, parentPath, name, isDirectory),
    renameAgentFile: ({ sessionId, oldPath, newName }) =>
      hydroAgent.renameFile(sessionId, oldPath, newName),
    deleteAgentFile: ({ sessionId, path }) =>
      hydroAgent.deleteFile(sessionId, path),
    searchAgentFiles: ({ sessionId, keyword, showHidden }) =>
      hydroAgent.searchFiles(sessionId, keyword, showHidden),
    openAgentFile: ({ sessionId, relativePath }) =>
      hydroAgent.openFile(sessionId, relativePath),
    openAgentOutputDir: (sessionId) =>
      hydroAgent.openOutputDir(sessionId),
    respondAgentInteraction: ({ sessionId, interactionId, answers, questions, annotations, updatedInput, updatedPermissions, decisionClassification, behavior }) =>
      hydroAgent.respondInteraction(sessionId, interactionId, {
        answers,
        questions,
        annotations,
        updatedInput,
        updatedPermissions,
        decisionClassification,
        behavior
      }),
    cancelAgentInteraction: ({ sessionId, interactionId, reason }) =>
      hydroAgent.cancelInteraction(sessionId, interactionId, reason),
    compactAgentConversation: async () => ({ error: 'Embedded Agent does not support compact yet' }),
    renameAgentSession: async () => ({ success: true }),
    getAgentQueue: async () => ({ success: true, queue: [] }),
    saveAgentQueue: async () => ({ success: true }),
    dispose: () => {
      disposeHydroEvents?.()
      disposeHydroEvents = null
      callbacksByChannel.clear()
    }
  }

  for (const [channel, method] of Object.entries(AGENT_EVENT_METHODS)) {
    adapter[method] = createEventListener(channel, callbacksByChannel)
  }

  return adapter
}

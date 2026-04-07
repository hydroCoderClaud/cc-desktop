import { describe, it, expect, vi } from 'vitest'

vi.mock('uuid', () => ({ v4: () => 'interaction-uuid-fixed' }))

const { AgentSessionManager } = await import('../../src/main/agent-session-manager.js')
const { AgentSession } = await import('../../src/main/agent-session.js')

describe('AgentSessionManager interactions', () => {
  function createManager() {
    const sent = []
    const manager = new AgentSessionManager({
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, data) => sent.push({ channel, data })
      }
    }, {
      getConfig: () => ({}),
      getDefaultProfile: () => ({ id: 'p1', baseUrl: 'https://example.com' }),
      getAPIProfile: () => null
    })
    manager.sessionDatabase = {
      insertAgentMessage: vi.fn(),
      updateAgentMessageToolOutput: vi.fn()
    }
    return { manager, sent }
  }

  it('creates interaction request and resolves with answers', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's1', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set('s1', session)

    const promise = manager._requestInteraction(session, 'ask_user_question', {
      questions: [{ question: 'Pick one?', header: 'Pick', multiSelect: false, options: [{ label: 'A', description: 'A desc' }] }]
    })

    await Promise.resolve()

    expect(sent[0].channel).toBe('agent:interactionRequest')
    expect(sent[0].data.sessionId).toBe('s1')
    expect(session.pendingInteractions.size).toBe(1)
    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].toolName).toBe('AskUserQuestion')

    const interactionId = Array.from(session.pendingInteractions.keys())[0]

    manager.resolveInteraction('s1', interactionId, {
      questions: [{ question: 'Pick one?' }],
      answers: [{ question: 'Pick one?', answer: 'A' }]
    })

    const result = await promise
    expect(result.behavior).toBe('allow')
    expect(result.updatedInput.answers).toEqual({ 'Pick one?': 'A' })
    expect(session.pendingInteractions.size).toBe(0)
    expect(session.messages[0].output).toEqual({
      status: 'answered',
      answers: [{ question: 'Pick one?', answer: 'A' }]
    })
    expect(manager.sessionDatabase.updateAgentMessageToolOutput).toHaveBeenCalledOnce()
  })

  it('resolves permission request without mutating tool input', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's3', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set('s3', session)

    const promise = manager._requestInteraction(session, 'permission_request', {
      toolName: 'Read',
      title: 'Claude wants to read a file'
    })

    await Promise.resolve()
    const interactionId = Array.from(session.pendingInteractions.keys())[0]
    manager.resolveInteraction('s3', interactionId, { answers: [] })

    const result = await promise
    expect(result.behavior).toBe('allow')
    expect(result.updatedInput).toEqual({})
    expect(result.decisionClassification).toBe('user_temporary')
  })

  it('resolves permission request with updated permissions action', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's4', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set('s4', session)

    const promise = manager._requestInteraction(session, 'permission_request', {
      toolName: 'Bash',
      title: 'Claude wants to run Bash',
      actions: [{
        key: 'allow_session',
        label: '本会话始终允许',
        updatedPermissions: [{ type: 'addDirectories', directories: ['/tmp'], destination: 'session' }],
        decisionClassification: 'user_permanent'
      }]
    })

    await Promise.resolve()
    const interactionId = Array.from(session.pendingInteractions.keys())[0]
    manager.resolveInteraction('s4', interactionId, {
      updatedInput: {},
      updatedPermissions: [{ type: 'addDirectories', directories: ['/tmp'], destination: 'session' }],
      decisionClassification: 'user_permanent',
      behavior: 'allow'
    })

    const result = await promise
    expect(result.behavior).toBe('allow')
    expect(result.updatedInput).toEqual({})
    expect(result.updatedPermissions).toHaveLength(1)
    expect(result.decisionClassification).toBe('user_permanent')
  })

  it('cancels interaction and returns deny', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's2', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set('s2', session)

    const promise = manager._requestInteraction(session, 'ask_user_question', {
      questions: [{ question: 'Pick one?', header: 'Pick', multiSelect: false, options: [{ label: 'A', description: 'A desc' }] }]
    })

    await Promise.resolve()

    const interactionId = Array.from(session.pendingInteractions.keys())[0]

    manager.cancelInteraction('s2', interactionId, 'cancelled')
    const result = await promise

    expect(result).toEqual({
      behavior: 'deny',
      message: 'cancelled'
    })
    expect(session.pendingInteractions.size).toBe(0)
    expect(session.messages[0].output).toEqual({
      status: 'cancelled',
      reason: 'cancelled'
    })
  })
})

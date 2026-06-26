import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('uuid', () => ({ v4: () => 'interaction-uuid-fixed' }))

const { AgentSessionManager } = await import('../../src/main/agent-session-manager.js')
const { AgentSession } = await import('../../src/main/agent-session.js')
const {
  DESKTOP_CAPABILITY_ALLOWED_TOOLS
} = await import('../../src/main/managers/desktop-capability-query-options.js')
const {
  HYDROLOGY_ALLOWED_TOOLS
} = await import('../../src/main/managers/hydrology-capability-query-options.js')

describe('AgentSessionManager interactions', () => {
  const FIXED_CLAUDE_EXE = '/usr/local/bin/claude'

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
      getAutocompactPctOverride: () => null,
      getDefaultProfile: () => ({ id: 'p1', baseUrl: 'https://example.com' }),
      getAPIProfile: () => null
    })
    vi.spyOn(manager, '_getDeveloperClaudeExecutablePath').mockReturnValue(FIXED_CLAUDE_EXE)
    manager.sessionDatabase = {
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      insertAgentMessage: vi.fn(),
      updateAgentMessageToolOutput: vi.fn(),
      updateAgentConversation: vi.fn(),
      updateAgentConversationModel: vi.fn(),
      getAgentConversation: vi.fn(() => null),
      closeAgentConversation: vi.fn()
    }
    manager.stationService = {
      listStations: vi.fn(() => [{ id: 'st-1', name: '测试站' }]),
      getStation: vi.fn((stationId) => ({ id: stationId, name: '测试站' }))
    }
    manager.realtimeService = {
      listRealtimeSlots: vi.fn(() => [{ id: 'slot-1', slotTime: '2026-05-17 00:00' }]),
      getRealtimeSlotDetail: vi.fn((slotId) => ({ slot: { id: slotId } }))
    }
    manager.reviewTaskService = {
      listReviewTasks: vi.fn(() => [{ id: 'task-1', status: 'needs_review' }])
    }
    manager.qualityCheckService = {
      getLatestRunSummary: vi.fn(() => ({ stationId: 'st-1', checkedSlotCount: 1 })),
      runStationQualityCheck: vi.fn(() => ({ stationId: 'st-1', checkedSlotCount: 1, hitCount: 0 }))
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
      answers: [{ question: 'Pick one?', answer: 'A' }],
      annotations: {
        'Pick one?': { preview: 'Preview A' }
      }
    })

    const result = await promise
    expect(result.behavior).toBe('allow')
    expect(result.updatedInput.answers).toEqual({ 'Pick one?': 'A' })
    expect(result.updatedInput.answersStructured).toEqual([
      { question: 'Pick one?', answer: 'A' }
    ])
    expect(result.updatedInput.annotations).toEqual({
      'Pick one?': { preview: 'Preview A' }
    })
    expect(session.pendingInteractions.size).toBe(0)
    expect(session.messages[0].output).toEqual({
      status: 'answered',
      answers: [{ question: 'Pick one?', answer: 'A' }],
      annotations: {
        'Pick one?': { preview: 'Preview A' }
      }
    })
    expect(manager.sessionDatabase.updateAgentMessageToolOutput).toHaveBeenCalledOnce()
  })

  it('preserves imChannel for dingtalk chat sessions by default', () => {
    const { manager } = createManager()
    manager.sessionDatabase = {
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      listAllAgentConversations: vi.fn(() => []),
      getAgentConversation: vi.fn(() => ({
        id: 1,
        session_id: 'db-dt-1',
        type: 'chat',
        title: '钉钉会话',
        cwd: 'C:/tmp',
        source: null,
        task_id: null,
        im_channel: 'dingtalk',
        cwd_auto: 0,
        message_count: 0,
        total_cost_usd: 0,
        created_at: Date.now(),
        api_profile_id: null,
        api_base_url: null
      })),
      updateAgentConversation: vi.fn()
    }

    const created = manager.create({ type: 'chat', imChannel: 'dingtalk', title: '新钉钉会话' })
    expect(created.imChannel).toBe('dingtalk')

    manager.sessions.clear()
    const reopened = manager.reopen('db-dt-1')
    expect(reopened.imChannel).toBe('dingtalk')
  })

  it('assigns default title when creating a session with empty title', () => {
    const { manager } = createManager()
    const created = manager.create({ type: 'chat', title: '   ' })

    expect(created.title).toBe('对话')
    expect(manager.sessionDatabase.createAgentConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '对话'
      })
    )
  })

  it('normalizes legacy IM session inputs when creating a session', () => {
    const { manager } = createManager()
    const created = manager.create({ type: 'feishu', source: 'feishu', title: '旧飞书会话' })

    expect(created).toEqual(expect.objectContaining({
      type: 'chat',
      source: 'im-inbound',
      imChannel: 'feishu'
    }))
    expect(manager.sessionDatabase.createAgentConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'chat',
        source: 'im-inbound',
        imChannel: 'feishu'
      })
    )
  })

  it('matches IM history rows by imChannel even when type remains chat', () => {
    const rows = [
      {
        session_id: 'chat-fs-1',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'feishu',
        im_user_id: 'ou_xxx',
        im_chat_id: 'oc_xxx',
        updated_at: 100
      },
      {
        session_id: 'chat-other-1',
        type: 'chat',
        source: 'im-inbound',
        im_channel: 'weixin',
        im_user_id: 'ou_xxx',
        im_chat_id: 'oc_xxx',
        updated_at: 200
      }
    ]

    const filtered = rows.filter(row =>
      row.im_channel === 'feishu' &&
      row.im_user_id === 'ou_xxx' &&
      row.im_chat_id === 'oc_xxx'
    )

    expect(filtered).toEqual([
      expect.objectContaining({
        session_id: 'chat-fs-1',
        type: 'chat',
        im_channel: 'feishu'
      })
    ])
  })

  it('emits session updated when binding an IM channel onto a normal chat session', () => {
    const { manager, sent } = createManager()
    const created = manager.create({ type: 'chat', source: 'manual', title: '普通会话' })

    const updated = manager.bindSessionExternalImSource(created.id, 'feishu')

    expect(updated.imChannel).toBe('feishu')
    expect(sent).toContainEqual({
      channel: 'session:updated',
      data: {
        sessionId: created.id,
        session: expect.objectContaining({
          id: created.id,
          type: 'chat',
          source: 'manual',
          imChannel: 'feishu'
        })
      }
    })
  })

  it('emits session updated after unbinding an IM channel even when the session only exists in DB', () => {
    const { manager, sent } = createManager()
    manager.sessionDatabase.getAgentConversation = vi.fn(() => ({
      id: 9,
      session_id: 'db-only-im-session',
      type: 'chat',
      status: 'closed',
      owner_client_id: 'host-ui',
      client_type: 'host',
      client_meta: null,
      sdk_session_id: null,
      title: 'DB 企业微信会话',
      cwd: 'C:/tmp',
      cwd_auto: 0,
      created_at: Date.now() - 1000,
      updated_at: Date.now(),
      message_count: 3,
      total_cost_usd: 0,
      api_profile_id: null,
      api_base_url: null,
      model_id: null,
      source: 'manual',
      im_channel: null,
      task_id: null
    }))
    manager.sessionDatabase.setImChannel = vi.fn()
    manager.sessionDatabase.clearImIdentity = vi.fn()

    const result = manager.unbindSessionExternalImSource('db-only-im-session')

    expect(result).toEqual(expect.objectContaining({
      id: 'db-only-im-session',
      imChannel: null,
      title: 'DB 企业微信会话'
    }))
    expect(manager.sessionDatabase.setImChannel).toHaveBeenCalledWith('db-only-im-session', null)
    expect(manager.sessionDatabase.clearImIdentity).toHaveBeenCalledWith('db-only-im-session')
    expect(sent).toContainEqual({
      channel: 'session:updated',
      data: {
        sessionId: 'db-only-im-session',
        session: expect.objectContaining({
          id: 'db-only-im-session',
          imChannel: null,
          title: 'DB 企业微信会话'
        })
      }
    })
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

  it('emits interruption events when closeAllSync tears down sessions', () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's-close', cwd: '/tmp', source: 'manual' })
    const interrupted = []

    manager.sessionDatabase = {
      closeAgentConversation: vi.fn()
    }
    manager.sessions.set('s-close', session)
    manager.on('agentInterrupted', (sessionId, details) => {
      interrupted.push({ sessionId, details })
    })

    manager.closeAllSync()

    expect(interrupted).toEqual([{
      sessionId: 's-close',
      details: { reason: 'host-cleanup' }
    }])
    expect(manager.sessionDatabase.closeAgentConversation).toHaveBeenCalledWith('s-close')
    expect(manager.sessions.size).toBe(0)
  })

  it('emits interruption events when user cancels an active session', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's-cancel', cwd: '/tmp', source: 'manual' })
    const interrupted = []

    session.queryGenerator = {
      interrupt: vi.fn(async () => undefined)
    }
    manager.sessions.set(session.id, session)
    manager.on('agentInterrupted', (sessionId, details) => {
      interrupted.push({ sessionId, details })
    })

    await manager.cancel(session.id)

    expect(session.queryGenerator.interrupt).toHaveBeenCalledOnce()
    expect(interrupted).toEqual([{
      sessionId: 's-cancel',
      details: { reason: 'user-cancel' }
    }])
    expect(sent.some(item => item.channel === 'agent:statusChange' && item.data.sessionId === 's-cancel' && item.data.status === 'idle')).toBe(true)
  })

  it('suppresses host IPC after shutdown starts even if output loop finishes later', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's-shutdown-late', cwd: '/tmp' })
    let releaseLoop
    const generator = {
      async *[Symbol.asyncIterator]() {
        await new Promise((resolve) => {
          releaseLoop = resolve
        })
      },
      close: vi.fn(() => {
        releaseLoop?.()
      })
    }
    session.queryGenerator = generator
    session.status = 'idle'
    manager.sessions.set(session.id, session)
    session.outputLoopPromise = manager._runOutputLoop(session)

    manager.closeAllSync()
    await session.outputLoopPromise

    expect(manager.isShuttingDown).toBe(true)
    expect(sent.some(item => item.channel === 'agent:statusChange')).toBe(false)
    expect(sent.some(item => item.channel === 'agent:cliError')).toBe(false)
    expect(sent.some(item => item.channel === 'agent:error')).toBe(false)
  })

  it('preserves sdkSessionId when switching API profile', async () => {
    const { manager } = createManager()
    const updateAgentConversation = vi.fn()
    const updateAgentConversationModel = vi.fn()
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? { id: 'p2', name: 'Qwen', baseUrl: 'https://example-qwen.test', selectedModelId: 'qwen-max-latest' }
      : null)
    manager.sessionDatabase = { updateAgentConversation, updateAgentConversationModel }

    const session = new AgentSession({ id: 's-switch', cwd: '/tmp', apiProfileId: 'p1' })
    session.sdkSessionId = 'sdk-old'
    manager.sessions.set('s-switch', session)

    const result = await manager.switchApiProfile('s-switch', 'p2')

    expect(session.apiProfileId).toBe('p2')
    expect(session.apiBaseUrl).toBe('https://example-qwen.test')
    expect(session.modelId).toBe('qwen-max-latest')
    expect(session.sdkSessionId).toBe('sdk-old')
    expect(updateAgentConversation).toHaveBeenCalledWith('s-switch', {
      apiProfileId: 'p2',
      apiBaseUrl: 'https://example-qwen.test'
    })
    expect(updateAgentConversationModel).toHaveBeenCalledWith('s-switch', 'qwen-max-latest')
    expect(result).toEqual({
      success: true,
      apiProfileId: 'p2',
      apiBaseUrl: 'https://example-qwen.test',
      modelId: 'qwen-max-latest'
    })
  })

  it('passes bundled claude executable path during probe connection', async () => {
    const { manager } = createManager()
    const createQuery = vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'ok'
        }
      },
      async close() {}
    }))

    manager.configManager.getConfig = () => ({
      settings: {
        developerClaudeSource: 'bundled'
      }
    })
    manager.runner.createQuery = createQuery

    const result = await manager.probeConnection({
      id: 'profile-1',
      baseUrl: 'https://example.com'
    }, {
      timeoutMs: 1000
    })

    expect(result.success).toBe(true)
    expect(createQuery).toHaveBeenCalledTimes(1)
    expect(createQuery.mock.calls[0][1].pathToClaudeCodeExecutable).toContain('claude')
  })

  it('reopens session from DB before switching API profile', async () => {
    const { manager } = createManager()
    const updateAgentConversation = vi.fn()
    const updateAgentConversationModel = vi.fn()
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? { id: 'p2', name: 'Volc', baseUrl: 'https://volc.example', selectedModelId: 'volc-model' }
      : null)
    manager.sessionDatabase = {
      getAgentConversation: vi.fn(() => ({
        id: 1,
        session_id: 's-reopen-switch',
        type: 'agent',
        title: '',
        cwd: '/tmp',
        source: null,
        task_id: null,
        sdk_session_id: 'sdk-old',
        cwd_auto: 0,
        message_count: 0,
        total_cost_usd: 0,
        created_at: Date.now(),
        api_profile_id: 'p1',
        api_base_url: 'https://old.example',
        model_id: 'legacy-model'
      })),
      updateAgentConversation,
      updateAgentConversationModel
    }

    await manager.switchApiProfile('s-reopen-switch', 'p2')

    const session = manager.sessions.get('s-reopen-switch')
    expect(session).toBeTruthy()
    expect(session.apiProfileId).toBe('p2')
    expect(session.apiBaseUrl).toBe('https://volc.example')
    expect(session.modelId).toBe('volc-model')
    expect(session.sdkSessionId).toBe('sdk-old')
    expect(updateAgentConversation).toHaveBeenCalledWith('s-reopen-switch', {
      apiProfileId: 'p2',
      apiBaseUrl: 'https://volc.example'
    })
    expect(updateAgentConversationModel).toHaveBeenCalledWith('s-reopen-switch', 'volc-model')
  })

  it('preserves resume eligibility after close and reopen', async () => {
    const { manager } = createManager()
    manager.configManager.getConfig = vi.fn(() => ({
      settings: {
        developerClaudeSource: 'bundled'
      }
    }))
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? {
          id: 'p2',
          name: 'ModelScope',
          baseUrl: 'https://api-inference.modelscope.cn',
          serviceProvider: 'modelscope',
          selectedModelId: 'deepseek-ai/DeepSeek-V4-Pro'
        }
      : null)

    let createQueryOptions = null
    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://api-inference.modelscope.cn'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        createQueryOptions = options
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const persistedRow = {
      id: 1,
      session_id: 's-reopen-resume-gap',
      type: 'chat',
      title: '恢复会话',
      cwd: '/tmp',
      source: 'manual',
      task_id: null,
      sdk_session_id: 'sdk-old',
      cwd_auto: 0,
      message_count: 0,
      total_cost_usd: 0,
      created_at: Date.now(),
      api_profile_id: 'p2',
      api_base_url: 'https://api-inference.modelscope.cn',
      model_id: 'deepseek-ai/DeepSeek-V4-Pro',
      owner_client_id: 'host-ui',
      client_type: 'host',
      client_meta: null
    }

    manager.sessionDatabase = {
      insertAgentMessage: vi.fn(),
      updateAgentMessageToolOutput: vi.fn(),
      updateAgentConversationModel: vi.fn(),
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      closeAgentConversation: vi.fn(),
      updateAgentConversation: vi.fn(),
      getAgentConversation: vi.fn(() => persistedRow)
    }

    const session = new AgentSession({
      id: 's-reopen-resume-gap',
      cwd: '/tmp',
      apiProfileId: 'p2',
      apiBaseUrl: 'https://api-inference.modelscope.cn',
      modelId: 'deepseek-ai/DeepSeek-V4-Pro'
    })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-old'
    session.lastBootstrappedRuntime = {
      apiProfileId: 'p2',
      apiBaseUrl: 'https://api-inference.modelscope.cn',
      modelId: 'deepseek-ai/DeepSeek-V4-Pro',
      executablePath: FIXED_CLAUDE_EXE
    }
    session.pendingRuntimeChange = 'none'
    manager.sessions.set(session.id, session)

    await manager.close(session.id)
    expect(manager.sessions.has(session.id)).toBe(false)

    await manager.sendMessage(session.id, 'hello after reopen')

    expect(createQueryOptions).toBeTruthy()
    expect(createQueryOptions.resume).toBe('sdk-old')
  })

  it('keeps resume after close and reopen even when persisted runtime state says api profile changed', async () => {
    const { manager } = createManager()
    manager.configManager.getConfig = vi.fn(() => ({
      settings: {
        developerClaudeSource: 'bundled'
      }
    }))
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? {
          id: 'p2',
          name: 'Mirror Provider',
          baseUrl: 'https://mirror.example.com',
          serviceProvider: 'mirror',
          selectedModelId: 'shared-model'
        }
      : null)

    let createQueryOptions = null
    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://mirror.example.com',
        ANTHROPIC_MODEL: 'shared-model'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        createQueryOptions = options
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const persistedRow = {
      id: 1,
      session_id: 's-reopen-hard-change',
      type: 'chat',
      title: '恢复会话',
      cwd: '/tmp',
      source: 'manual',
      task_id: null,
      sdk_session_id: 'sdk-old',
      cwd_auto: 0,
      message_count: 0,
      total_cost_usd: 0,
      created_at: Date.now(),
      api_profile_id: 'p2',
      api_base_url: 'https://mirror.example.com',
      model_id: 'shared-model',
      last_bootstrapped_runtime: JSON.stringify({
        apiProfileId: 'p1',
        apiBaseUrl: 'https://example.com',
        modelId: 'shared-model',
        executablePath: FIXED_CLAUDE_EXE
      }),
      pending_runtime_change: 'hard',
      owner_client_id: 'host-ui',
      client_type: 'host',
      client_meta: null
    }

    manager.sessionDatabase = {
      insertAgentMessage: vi.fn(),
      updateAgentMessageToolOutput: vi.fn(),
      updateAgentConversationModel: vi.fn(),
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      closeAgentConversation: vi.fn(),
      updateAgentConversation: vi.fn(),
      getAgentConversation: vi.fn(() => persistedRow)
    }

    const session = new AgentSession({
      id: 's-reopen-hard-change',
      cwd: '/tmp',
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'shared-model'
    })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-old'
    session.lastBootstrappedRuntime = {
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'shared-model',
      executablePath: FIXED_CLAUDE_EXE
    }
    session.pendingRuntimeChange = 'hard'
    manager.sessions.set(session.id, session)

    await manager.close(session.id)
    expect(manager.sessions.has(session.id)).toBe(false)

    await manager.sendMessage(session.id, 'hello after reopen')

    expect(createQueryOptions).toBeTruthy()
    expect(createQueryOptions.resume).toBe('sdk-old')
    expect(createQueryOptions.env.ANTHROPIC_MODEL).toBe('shared-model')
  })

  it('passes explicit requestedModel through even when it is not listed by current profile', async () => {
    const { manager } = createManager()
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? {
          id: 'p2',
          name: 'cat-1.2',
          baseUrl: 'https://aicode.cat',
          serviceProvider: 'cat',
          selectedModelId: 'claude-sonnet-4-6'
        }
      : null)
    manager.configManager.getServiceProviderDefinition = vi.fn((id) => id === 'cat'
      ? { id: 'cat', defaultModels: ['claude-sonnet-4-6'] }
      : null)

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://aicode.cat',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const session = new AgentSession({ id: 's-stale-model', cwd: '/tmp', apiProfileId: 'p2' })
    session.dbConversationId = 1
    manager.sessions.set('s-stale-model', session)

    await manager.sendMessage('s-stale-model', 'hello', { model: 'kimi-k2.6' })

    const createQueryOptions = manager.runner.createQuery.mock.calls[0][1]
    expect(createQueryOptions.env.ANTHROPIC_MODEL).toBe('kimi-k2.6')
    expect(createQueryOptions.model).toBe('kimi-k2.6')
    expect(createQueryOptions.appendSystemPrompt).toContain('Hydro Desktop AI')
  })

  it('passes tier alias strings through without local remapping', async () => {
    const { manager } = createManager()
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? {
          id: 'p2',
          name: 'runtime-clean',
          baseUrl: 'https://models.example.com',
          serviceProvider: 'runtime-clean',
          selectedModelId: 'glm-4.5'
        }
      : null)
    manager.configManager.getServiceProviderDefinition = vi.fn((id) => id === 'runtime-clean'
      ? { id: 'runtime-clean', defaultModels: ['glm-4.5'] }
      : null)

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://models.example.com',
        ANTHROPIC_MODEL: 'glm-4.5'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const session = new AgentSession({ id: 's-tier-alias', cwd: '/tmp', apiProfileId: 'p2' })
    session.dbConversationId = 1
    manager.sessions.set('s-tier-alias', session)

    await manager.sendMessage('s-tier-alias', 'hello', { model: 'sonnet' })

    const createQueryOptions = manager.runner.createQuery.mock.calls[0][1]
    expect(createQueryOptions.env.ANTHROPIC_MODEL).toBe('sonnet')
    expect(createQueryOptions.model).toBe('sonnet')
  })

  it('syncs env model with requestedModel when createQuery is rebuilt from a restored session', async () => {
    const { manager } = createManager()
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? {
          id: 'p2',
          name: 'ModelScope',
          baseUrl: 'https://api-inference.modelscope.cn',
          serviceProvider: 'modelscope',
          selectedModelId: 'deepseek-ai/DeepSeek-V4-Pro'
        }
      : null)
    manager.configManager.getServiceProviderDefinition = vi.fn((id) => id === 'modelscope'
      ? {
          id: 'modelscope',
          defaultModels: ['deepseek-ai/DeepSeek-V4-Pro', 'Qwen/Qwen3.6-27B']
        }
      : null)

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://api-inference.modelscope.cn',
        ANTHROPIC_MODEL: 'deepseek-ai/DeepSeek-V4-Pro'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const session = new AgentSession({ id: 's-restored-model', cwd: '/tmp', apiProfileId: 'p2' })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-old'
    session.lastBootstrappedRuntime = {
      apiProfileId: 'p2',
      apiBaseUrl: 'https://api-inference.modelscope.cn',
      modelId: 'deepseek-ai/DeepSeek-V4-Pro',
      executablePath: FIXED_CLAUDE_EXE
    }
    manager.sessions.set('s-restored-model', session)

    await manager.sendMessage('s-restored-model', 'hello', { model: 'Qwen/Qwen3.6-27B' })

    const createQueryOptions = manager.runner.createQuery.mock.calls[0][1]
    expect(createQueryOptions.model).toBe('Qwen/Qwen3.6-27B')
    expect(createQueryOptions.env.ANTHROPIC_MODEL).toBe('Qwen/Qwen3.6-27B')
    expect(createQueryOptions.resume).toBe('sdk-old')
  })

  it('does not re-inject env model or explicit model when restored session runtime is unchanged', async () => {
    const { manager } = createManager()
    manager.configManager.getConfig = vi.fn(() => ({
      settings: {
        developerClaudeSource: 'bundled'
      }
    }))
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? {
          id: 'p2',
          name: 'ModelScope',
          baseUrl: 'https://api-inference.modelscope.cn',
          serviceProvider: 'modelscope',
          selectedModelId: 'deepseek-ai/DeepSeek-V4-Pro'
        }
      : null)

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://api-inference.modelscope.cn'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const session = new AgentSession({
      id: 's-restored-same-runtime',
      cwd: '/tmp',
      apiProfileId: 'p2',
      apiBaseUrl: 'https://api-inference.modelscope.cn',
      modelId: 'deepseek-ai/DeepSeek-V4-Pro'
    })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-old'
    session.lastBootstrappedRuntime = {
      apiProfileId: 'p2',
      apiBaseUrl: 'https://api-inference.modelscope.cn',
      modelId: 'deepseek-ai/DeepSeek-V4-Pro',
      executablePath: FIXED_CLAUDE_EXE
    }
    session.pendingRuntimeChange = 'none'
    manager.sessions.set(session.id, session)

    await manager.sendMessage(session.id, 'hello')

    expect(manager.runner.buildEnv).toHaveBeenCalledWith(expect.any(Object), manager.configManager, { includeModel: false })
    const createQueryOptions = manager.runner.createQuery.mock.calls[0][1]
    expect(createQueryOptions.model).toBeUndefined()
    expect(createQueryOptions.env.ANTHROPIC_MODEL).toBeUndefined()
    expect(createQueryOptions.resume).toBe('sdk-old')
  })

  it('keeps resume prior sdk session when api profile changes with same model id', async () => {
    const { manager } = createManager()
    manager.sessionDatabase.updateAgentConversation = vi.fn()
    manager.configManager.getConfig = vi.fn(() => ({
      settings: {
        developerClaudeSource: 'bundled'
      }
    }))
    manager.configManager.getAPIProfile = vi.fn((id) => id === 'p2'
      ? {
          id: 'p2',
          name: 'Mirror Provider',
          baseUrl: 'https://mirror.example.com',
          serviceProvider: 'mirror',
          selectedModelId: 'shared-model'
        }
      : null)

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://mirror.example.com',
        ANTHROPIC_MODEL: 'shared-model'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const session = new AgentSession({
      id: 's-profile-hard-change',
      cwd: '/tmp',
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'shared-model'
    })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-old'
    session.lastBootstrappedRuntime = {
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'shared-model',
      executablePath: FIXED_CLAUDE_EXE
    }
    manager.sessions.set(session.id, session)

    await manager.switchApiProfile(session.id, 'p2')
    await manager.sendMessage(session.id, 'hello')

    const createQueryOptions = manager.runner.createQuery.mock.calls[0][1]
    expect(createQueryOptions.resume).toBe('sdk-old')
    expect(createQueryOptions.env.ANTHROPIC_MODEL).toBe('shared-model')
  })

  it('rebuilds embedded session runtime when active query was bootstrapped without embedded capability signature', async () => {
    const { manager } = createManager()
    manager.configManager.getDefaultProfile = vi.fn(() => ({
      id: 'p1',
      name: 'Default',
      baseUrl: 'https://example.com',
      selectedModelId: 'sonnet-4'
    }))
    manager.embeddedAppRuntimeManager = {
      getContext: vi.fn(() => ({
        title: '三家店水文站 / 实时数据列表',
        summary: '当前站点：三家店水文站（SJD001）'
      })),
      executeCommand: vi.fn()
    }
    manager.scheduledTaskService = {
      listTasks: vi.fn(() => []),
      getTaskRuns: vi.fn(() => []),
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      }
    }

    const oldQueue = {
      isDone: false,
      push: vi.fn(),
      end: vi.fn()
    }
    const oldGenerator = {
      close: vi.fn(),
      setModel: vi.fn()
    }

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://example.com',
        ANTHROPIC_MODEL: 'sonnet-4'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const session = new AgentSession({
      id: 's-embedded-refresh',
      cwd: '/tmp',
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'sonnet-4',
      ownerClientId: 'embed:hydrology-workbench',
      clientType: 'embedded',
      clientMeta: {
        appId: 'hydrology-workbench'
      }
    })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-embedded-old'
    session.queryGenerator = oldGenerator
    session.messageQueue = oldQueue
    session.outputLoopPromise = Promise.resolve()
    session.lastBootstrappedRuntime = {
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'sonnet-4',
      executablePath: FIXED_CLAUDE_EXE
    }
    session.pendingRuntimeChange = 'none'
    session.initResult = { tools: [{ name: 'stale_tool' }] }
    manager.sessions.set(session.id, session)

    await manager.sendMessage(session.id, '当前站点是什么')

    expect(oldQueue.end).toHaveBeenCalledOnce()
    expect(oldGenerator.close).toHaveBeenCalledOnce()
    expect(manager.runner.createQuery).toHaveBeenCalledOnce()
    const createQueryOptions = manager.runner.createQuery.mock.calls[0][1]
    expect(createQueryOptions.resume).toBe('sdk-embedded-old')
    expect(Object.keys(createQueryOptions.mcpServers || {})).toEqual(['hydrodesktop', 'embeddedapp', 'hydrology'])
    expect(createQueryOptions.allowedTools).toEqual(expect.arrayContaining([
      ...DESKTOP_CAPABILITY_ALLOWED_TOOLS,
      ...HYDROLOGY_ALLOWED_TOOLS,
      'mcp__embeddedapp__context_get',
      'mcp__embeddedapp__command_execute',
      'mcp__embeddedapp__hydrology_context_get',
      'mcp__embeddedapp__hydrology_current_station_get',
      'mcp__embeddedapp__hydrology_tab_open',
      'mcp__embeddedapp__hydrology_review_board_open'
    ]))
    expect(createQueryOptions.disallowedTools).toEqual(expect.arrayContaining([
      'Bash',
      'Glob',
      'Grep',
      'LS',
      'Read'
    ]))
    expect(session.initResult).toBeNull()
    expect(session.lastQueryOptionsSnapshot).toMatchObject({
      clientType: 'embedded',
      appId: 'hydrology-workbench',
      mcpServerNames: ['hydrodesktop', 'embeddedapp', 'hydrology']
    })
    expect(session.lastQueryOptionsSnapshot.allowedTools).toEqual(expect.arrayContaining([
      ...DESKTOP_CAPABILITY_ALLOWED_TOOLS,
      ...HYDROLOGY_ALLOWED_TOOLS,
      'mcp__embeddedapp__context_get',
      'mcp__embeddedapp__command_execute',
      'mcp__embeddedapp__hydrology_context_get',
      'mcp__embeddedapp__hydrology_current_station_get',
      'mcp__embeddedapp__hydrology_tab_open',
      'mcp__embeddedapp__hydrology_review_board_open'
    ]))
    expect(session.lastBootstrappedRuntime).toMatchObject({
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'sonnet-4',
      executablePath: FIXED_CLAUDE_EXE,
      embeddedAppEnabled: true,
      embeddedAppId: 'hydrology-workbench',
      weixinNotifyEnabled: false
    })
  })

  it('does not inject personal weixin MCP tools even when weixin notify service exists', async () => {
    const { manager } = createManager()
    manager.configManager.getDefaultProfile = vi.fn(() => ({
      id: 'p1',
      name: 'Default',
      baseUrl: 'https://example.com',
      selectedModelId: 'sonnet-4'
    }))
    manager.embeddedAppRuntimeManager = {
      getContext: vi.fn(() => ({
        title: '三家店水文站 / 实时数据列表',
        summary: '当前站点：三家店水文站（SJD001）'
      })),
      executeCommand: vi.fn()
    }
    manager.weixinNotifyService = {
      listAccounts: vi.fn(() => []),
      listTargets: vi.fn(() => []),
      sendText: vi.fn()
    }

    const oldQueue = {
      isDone: false,
      push: vi.fn(),
      end: vi.fn()
    }
    const oldGenerator = {
      close: vi.fn(),
      setModel: vi.fn()
    }

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://example.com',
        ANTHROPIC_MODEL: 'sonnet-4'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        async function * emptyGenerator() {}
        const generator = emptyGenerator()
        generator.setModel = vi.fn()
        generator.close = vi.fn()
        generator.options = options
        return generator
      })
    }

    const session = new AgentSession({
      id: 's-embedded-weixin-refresh',
      cwd: '/tmp',
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'sonnet-4',
      ownerClientId: 'embed:hydrology-workbench',
      clientType: 'embedded',
      clientMeta: {
        appId: 'hydrology-workbench'
      }
    })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-embedded-old'
    session.queryGenerator = oldGenerator
    session.messageQueue = oldQueue
    session.outputLoopPromise = Promise.resolve()
    session.lastBootstrappedRuntime = {
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'sonnet-4',
      executablePath: FIXED_CLAUDE_EXE,
      embeddedAppEnabled: true,
      embeddedAppId: 'hydrology-workbench',
      weixinNotifyEnabled: false
    }
    session.pendingRuntimeChange = 'none'
    manager.sessions.set(session.id, session)

    await manager.sendMessage(session.id, '发送微信通知')

    expect(oldQueue.end).toHaveBeenCalledOnce()
    expect(oldGenerator.close).toHaveBeenCalledOnce()
    expect(manager.runner.createQuery).toHaveBeenCalledOnce()
    const createQueryOptions = manager.runner.createQuery.mock.calls[0][1]
    expect(createQueryOptions.resume).toBe('sdk-embedded-old')
    expect(Object.keys(createQueryOptions.mcpServers || {})).toEqual(['embeddedapp', 'hydrology'])
    expect(createQueryOptions.allowedTools || []).not.toEqual(expect.arrayContaining([
      'mcp__hydrodesktop__im_list_targets',
      'mcp__hydrodesktop__im_send',
      'mcp__hydrodesktop__weixin_notify_list_targets',
      'mcp__hydrodesktop__weixin_notify_send'
    ]))
    expect(createQueryOptions.appendSystemPrompt || '').not.toContain('built-in IM messages')
    expect(session.lastBootstrappedRuntime).toMatchObject({
      embeddedAppEnabled: true,
      embeddedAppId: 'hydrology-workbench',
      weixinNotifyEnabled: true
    })
  })

  it('attaches standard tool_use_result to the matching tool message', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's-tool', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set('s-tool', session)
    manager.runner = { normalizeMessage: raw => raw }

    await manager._processMessage(session, {
      type: 'assistant_message',
      content: [{
        type: 'tool_use',
        id: 'tool-use-1',
        name: 'generate_image',
        input: { prompt: 'draw' }
      }],
      sdkSessionId: 'sdk-tool'
    })

    await manager._processMessage(session, {
      type: 'user_message',
      parentToolUseId: 'tool-use-1',
      content: [{
        type: 'tool_result',
        tool_use_id: 'tool-use-1',
        content: [{
          type: 'resource_link',
          uri: 'file:///C:/workspace/output/cover.png',
          name: 'cover.png',
          mimeType: 'image/png'
        }],
        structured_content: {
          type: 'image_result',
          files: [{
            uri: 'file:///C:/workspace/output/cover.png',
            name: 'cover.png',
            mimeType: 'image/png'
          }]
        }
      }],
      toolUseResult: {
        content: [{
          type: 'resource_link',
          uri: 'file:///C:/workspace/output/cover.png',
          name: 'cover.png',
          mimeType: 'image/png'
        }],
        structuredContent: {
          type: 'image_result',
          files: [{
            uri: 'file:///C:/workspace/output/cover.png',
            name: 'cover.png',
            mimeType: 'image/png'
          }]
        }
      }
    })

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].output).toEqual({
      type: 'tool_result',
      parentToolUseId: 'tool-use-1',
      content: [{
        type: 'resource_link',
        uri: 'file:///C:/workspace/output/cover.png',
        name: 'cover.png',
        mimeType: 'image/png'
      }],
      structuredContent: {
        type: 'image_result',
        files: [{
          uri: 'file:///C:/workspace/output/cover.png',
          name: 'cover.png',
          mimeType: 'image/png'
        }]
      },
      isError: false
    })
    expect(manager.sessionDatabase.updateAgentMessageToolOutput).toHaveBeenCalled()
    expect(sent.some(item => item.channel === 'agent:message' && item.data.message.type === 'tool_result')).toBe(true)
  })

  it('emits bridge-friendly image paths for tool_result file resources', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's-tool-bridge', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set('s-tool-bridge', session)
    manager.runner = { normalizeMessage: raw => raw }

    const bridgeMessageHandler = vi.fn()
    manager.on('agentMessage', bridgeMessageHandler)

    await manager._processMessage(session, {
      type: 'assistant_message',
      content: [{
        type: 'tool_use',
        id: 'tool-use-bridge-1',
        name: 'generate_image',
        input: { prompt: 'draw' }
      }],
      sdkSessionId: 'sdk-tool-bridge'
    })

    await manager._processMessage(session, {
      type: 'user_message',
      parentToolUseId: 'tool-use-bridge-1',
      content: [{
        type: 'tool_result',
        tool_use_id: 'tool-use-bridge-1',
        content: [{
          type: 'resource_link',
          uri: 'file:///C:/workspace/output/cover.png',
          name: 'cover.png',
          mimeType: 'image/png'
        }],
        structured_content: {
          type: 'image_result',
          files: [{
            uri: 'file:///C:/workspace/output/cover.png',
            name: 'cover.png',
            mimeType: 'image/png'
          }]
        }
      }],
      toolUseResult: {
        content: [{
          type: 'resource_link',
          uri: 'file:///C:/workspace/output/cover.png',
          name: 'cover.png',
          mimeType: 'image/png'
        }],
        structuredContent: {
          type: 'image_result',
          files: [{
            uri: 'file:///C:/workspace/output/cover.png',
            name: 'cover.png',
            mimeType: 'image/png'
          }]
        }
      }
    })

    expect(bridgeMessageHandler).toHaveBeenCalledWith(
      's-tool-bridge',
      expect.objectContaining({
        type: 'tool_result',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool_use',
            name: '__image_artifact__',
            input: { imagePaths: [path.join('C:', 'workspace', 'output', 'cover.png')] }
          })
        ])
      })
    )
  })

  it('filters sentinel no-response assistant text from task-triggered tool-only runs', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's-no-response', cwd: '/tmp', source: 'manual' })
    session.dbConversationId = 1
    manager.sessions.set('s-no-response', session)
    manager.runner = { normalizeMessage: raw => raw }

    await manager._processMessage(session, {
      type: 'assistant_message',
      content: [{
        type: 'text',
        text: 'No response requested.'
      }],
      sdkSessionId: 'sdk-no-response'
    })

    expect(session.messages).toHaveLength(0)
    expect(sent.some(item => item.channel === 'agent:message')).toBe(false)
    expect(manager.sessionDatabase.insertAgentMessage).not.toHaveBeenCalled()
  })

  it('probeConnection does not persist session state and cleans temp dir', async () => {
    const { manager, sent } = createManager()
    const tempDirs = []

    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (messageQueue, options, sessionRef) => {
        tempDirs.push(options.cwd)
        sessionRef.cliPid = 123
        return {
          async *[Symbol.asyncIterator]() {
            const first = await messageQueue.next()
            expect(first.done).toBe(false)
            expect(first.value.message.content).toBe('hi')
            yield {
              type: 'system',
              subtype: 'init',
              session_id: 'sdk-test-session',
              tools: [],
              model: 'claude-sonnet-4-6'
            }
            yield {
              type: 'assistant',
              message: { content: [{ type: 'text', text: 'pong' }] },
              session_id: 'sdk-test-session'
            }
            yield {
              type: 'result',
              subtype: 'success',
              is_error: false,
              result: 'pong',
              total_cost_usd: 0,
              num_turns: 1,
              duration_ms: 5
            }
          },
          close: vi.fn(async () => {})
        }
      }),
      normalizeMessage: raw => raw
    }

    const emitSpy = vi.spyOn(manager, 'emit')
    const result = await manager.probeConnection({
      id: 'profile-1',
      baseUrl: 'https://example.com',
      authToken: 'token',
      authType: 'api_key'
    })

    expect(result.success).toBe(true)
    expect(result.message).toBe('Claude Code 已连通，请求完成：pong')
    expect(manager.sessions.size).toBe(0)
    expect(manager.sessionDatabase.insertAgentMessage).not.toHaveBeenCalled()
    expect(sent).toEqual([])
    expect(emitSpy).not.toHaveBeenCalledWith('userMessage', expect.anything())
    expect(tempDirs).toHaveLength(1)
    expect(fs.existsSync(tempDirs[0])).toBe(false)

    emitSpy.mockRestore()
  })

  it('probeConnection returns success once assistant text arrives', async () => {
    const { manager } = createManager()

    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (messageQueue) => ({
        async *[Symbol.asyncIterator]() {
          await messageQueue.next()
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'sdk-test-session',
            tools: [],
            model: 'claude-sonnet-4-6'
          }
          yield {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'pong early' }] },
            session_id: 'sdk-test-session'
          }
        },
        close: vi.fn(async () => {})
      })),
      normalizeMessage: raw => {
        if (raw.type === 'assistant') {
          return {
            type: 'assistant_message',
            content: raw.message?.content || [],
            sdkSessionId: raw.session_id,
            usage: raw.message?.usage || null
          }
        }
        if (raw.type === 'system' && raw.subtype === 'init') {
          return {
            type: 'init',
            sdkSessionId: raw.session_id,
            tools: raw.tools,
            model: raw.model,
            slashCommands: raw.slash_commands || []
          }
        }
        return raw
      }
    }

    const result = await manager.probeConnection({
      id: 'profile-1',
      baseUrl: 'https://example.com',
      authToken: 'token',
      authType: 'api_key'
    })

    expect(result.success).toBe(true)
    expect(result.message).toBe('Claude Code 已连通，收到模型回复：pong early')
  })

  it('setModel passes explicit model strings through without local filtering', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 'session-set-model', cwd: '/tmp', apiProfileId: 'profile-1' })
    session.queryGenerator = { setModel: vi.fn(async () => {}) }
    manager.sessions.set(session.id, session)
    manager.configManager.getAPIProfile = vi.fn(() => ({
      id: 'profile-1',
      selectedModelId: 'glm-4.5',
      serviceProvider: 'provider-1'
    }))
    manager.configManager.getServiceProviderDefinition = vi.fn(() => ({
      id: 'provider-1',
      defaultModels: ['glm-4.5']
    }))
    manager.queryManager.setModel = vi.fn(async () => {})

    await manager.setModel(session.id, 'glm-4.5')
    const secondResult = await manager.setModel(session.id, 'sonnet')

    expect(manager.queryManager.setModel).toHaveBeenCalledTimes(2)
    expect(manager.queryManager.setModel).toHaveBeenNthCalledWith(1, session.id, 'glm-4.5')
    expect(manager.queryManager.setModel).toHaveBeenNthCalledWith(2, session.id, 'sonnet')
    expect(manager.sessionDatabase.updateAgentConversationModel).toHaveBeenNthCalledWith(1, session.id, 'glm-4.5')
    expect(manager.sessionDatabase.updateAgentConversationModel).toHaveBeenNthCalledWith(2, session.id, 'sonnet')
    expect(session.modelId).toBe('sonnet')
    expect(secondResult).toBeUndefined()
  })

  it('setModel persists snapshot even without active query', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 'session-set-model-idle', cwd: '/tmp', apiProfileId: 'profile-1' })
    manager.sessions.set(session.id, session)
    manager.sessionDatabase.updateAgentConversation = vi.fn()
    manager.configManager.getAPIProfile = vi.fn(() => ({
      id: 'profile-1',
      selectedModelId: 'glm-4.5',
      serviceProvider: 'provider-1'
    }))
    manager.queryManager.setModel = vi.fn(async () => {})

    const result = await manager.setModel(session.id, 'deepseek-v3')

    expect(manager.queryManager.setModel).not.toHaveBeenCalled()
    expect(manager.sessionDatabase.updateAgentConversationModel).toHaveBeenCalledWith(session.id, 'deepseek-v3')
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(session.id, {
      lastBootstrappedRuntime: null,
      pendingRuntimeChange: 'soft'
    })
    expect(session.modelId).toBe('deepseek-v3')
    expect(result).toEqual({ success: true, persistedOnly: true })
  })

  it('setModel clears snapshot even without active query', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 'session-clear-model-idle', cwd: '/tmp', apiProfileId: 'profile-1' })
    session.modelId = 'glm-4.5'
    manager.sessions.set(session.id, session)
    manager.sessionDatabase.updateAgentConversation = vi.fn()
    manager.queryManager.setModel = vi.fn(async () => {})

    const result = await manager.setModel(session.id, '')

    expect(manager.queryManager.setModel).not.toHaveBeenCalled()
    expect(manager.sessionDatabase.updateAgentConversationModel).toHaveBeenCalledWith(session.id, null)
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith(session.id, {
      lastBootstrappedRuntime: null,
      pendingRuntimeChange: 'soft'
    })
    expect(session.modelId).toBeNull()
    expect(result).toEqual({ success: true, persistedOnly: true })
  })

  it('creates agent sessions with initial model snapshot from profile', () => {
    const { manager } = createManager()
    manager.configManager.getDefaultProfile = vi.fn(() => ({
      id: 'p-default',
      baseUrl: 'https://example.com',
      selectedModelId: 'glm-5.1'
    }))
    manager.sessionDatabase = {
      createAgentConversation: vi.fn(() => ({ id: 7 }))
    }

    const session = manager.create({ type: 'chat', title: 'Demo' })

    expect(manager.sessionDatabase.createAgentConversation).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'glm-5.1'
    }))
    expect(session.modelId).toBe('glm-5.1')
  })

  it('preserves session when query exit is triggered by api switching', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's-preserve', cwd: '/tmp', apiProfileId: 'p1' })
    async function * emptyGenerator() {}
    session.queryGenerator = emptyGenerator()
    session.preserveSessionOnQueryExit = true
    manager.sessions.set(session.id, session)

    await manager._runOutputLoop(session)

    expect(manager.sessions.has(session.id)).toBe(true)
    expect(sent.some(item => item.channel === 'agent:statusChange'
      && item.data.sessionId === 's-preserve'
      && item.data.activeSessionEnded === true
      && !item.data.cliExited)).toBe(true)
  })

  it('emits activeSessionEnded instead of cliError when session is closed intentionally', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's-close', cwd: '/tmp' })
    async function * emptyGenerator() {}
    session.queryGenerator = emptyGenerator()
    session.outputLoopPromise = manager._runOutputLoop(session)
    manager.sessions.set(session.id, session)

    await manager.close(session.id)

    expect(sent.some(item => item.channel === 'agent:cliError' && item.data.sessionId === 's-close')).toBe(false)
    expect(sent.some(item => item.channel === 'agent:statusChange'
      && item.data.sessionId === 's-close'
      && item.data.activeSessionEnded === true
      && item.data.status === 'idle')).toBe(true)
    expect(manager.sessions.has(session.id)).toBe(false)
  })

  it('emits cliError on abnormal exit even without stderr', async () => {
    const { manager, sent } = createManager()
    const session = new AgentSession({ id: 's-cli-error', cwd: '/tmp' })
    async function * emptyGenerator() {}
    session.queryGenerator = emptyGenerator()
    session.status = 'error'
    session._lastCliExitCode = 9
    session._lastCliStderr = ''
    manager.sessions.set(session.id, session)

    await manager._runOutputLoop(session)

    expect(sent).toContainEqual({
      channel: 'agent:cliError',
      data: {
        sessionId: 's-cli-error',
        exitCode: 9,
        stderr: ''
      }
    })
    expect(sent).toContainEqual({
      channel: 'agent:statusChange',
      data: {
        sessionId: 's-cli-error',
        status: 'error',
        cliExited: true,
        cliExitWasError: true
      }
    })
  })

  it('retries once without resume when restored sdkSessionId is no longer valid', async () => {
    const { manager, sent } = createManager()
    const createQueryCalls = []

    manager.runner = {
      buildEnv: vi.fn(() => ({
        ANTHROPIC_BASE_URL: 'https://example.com'
      })),
      createQuery: vi.fn(async (_queue, options) => {
        createQueryCalls.push(options)
        const callIndex = createQueryCalls.length
        if (callIndex === 1) {
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'result',
                subtype: 'error',
                is_error: true,
                result: 'No conversation found with session ID: sdk-stale'
              }
            },
            close: vi.fn()
          }
        }

        return {
          async *[Symbol.asyncIterator]() {
            yield {
              type: 'system',
              subtype: 'init',
              session_id: 'sdk-fresh',
              tools: [],
              model: 'sonnet'
            }
            yield {
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: 'recovered' }]
              },
              session_id: 'sdk-fresh'
            }
            yield {
              type: 'result',
              subtype: 'success',
              is_error: false,
              result: 'ok'
            }
          },
          close: vi.fn()
        }
      }),
      normalizeMessage: raw => {
        switch (raw.type) {
          case 'system':
            return {
              type: 'init',
              sdkSessionId: raw.session_id,
              tools: raw.tools,
              model: raw.model,
              slashCommands: raw.slash_commands || []
            }
          case 'assistant':
            return {
              type: 'assistant_message',
              content: raw.message?.content || [],
              uuid: raw.uuid,
              sdkSessionId: raw.session_id,
              usage: raw.message?.usage || null
            }
          case 'result':
            return {
              type: 'result',
              subtype: raw.subtype,
              isError: raw.is_error,
              result: raw.result,
              totalCostUsd: raw.total_cost_usd,
              numTurns: raw.num_turns,
              durationMs: raw.duration_ms,
              usage: raw.usage,
              modelUsage: raw.modelUsage
            }
          default:
            return raw
        }
      }
    }

    const session = new AgentSession({ id: 's-stale-resume', cwd: '/tmp' })
    session.dbConversationId = 1
    session.sdkSessionId = 'sdk-stale'
    manager.sessions.set(session.id, session)

    await manager.sendMessage(session.id, 'hello after stale resume')
    await session.outputLoopPromise
    await Promise.resolve()
    if (session.outputLoopPromise) {
      await session.outputLoopPromise
    }

    expect(manager.runner.createQuery).toHaveBeenCalledTimes(2)
    expect(createQueryCalls[0].resume).toBe('sdk-stale')
    expect(createQueryCalls[1].resume).toBeUndefined()
    expect(manager.sessionDatabase.updateAgentConversation).toHaveBeenCalledWith('s-stale-resume', {
      sdkSessionId: null
    })
    expect(manager.sessionDatabase.insertAgentMessage).toHaveBeenCalledTimes(2)
    expect(manager.sessionDatabase.insertAgentMessage).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({
      role: 'user',
      content: JSON.stringify({
        text: 'hello after stale resume',
        origin: 'desktop'
      })
    }))
    expect(manager.sessionDatabase.insertAgentMessage).toHaveBeenNthCalledWith(2, 1, expect.objectContaining({
      role: 'assistant',
      content: 'recovered'
    }))
    expect(session.sdkSessionId).toBe('sdk-fresh')
    expect(session.messageCount).toBe(1)
    expect(sent.some(item => item.channel === 'agent:error')).toBe(false)
  })

  it('lists persisted model snapshots from DB history rows', () => {
    const { manager } = createManager()
    manager.sessionDatabase = {
      listAllAgentConversations: vi.fn(() => ([{
        session_id: 'db-row-1',
        type: 'chat',
        status: 'closed',
        sdk_session_id: null,
        title: '历史会话',
        cwd: '/tmp',
        cwd_auto: 1,
        message_count: 2,
        total_cost_usd: 0,
        api_profile_id: 'p1',
        api_base_url: 'https://example.com',
        model_id: 'glm-4.5',
        source: 'manual',
        task_id: null,
        created_at: Date.now(),
        updated_at: Date.now()
      }]))
    }

    const sessions = manager.list()

    expect(sessions).toHaveLength(1)
    expect(sessions[0].modelId).toBe('glm-4.5')
  })

  it('loads the full persisted history for the agent left panel instead of truncating to 100 rows', () => {
    const { manager } = createManager()
    manager.sessionDatabase = {
      listAllAgentConversations: vi.fn(() => ([
        {
          session_id: 'db-row-101',
          type: 'chat',
          status: 'closed',
          sdk_session_id: null,
          title: '历史会话 101',
          cwd: '/tmp',
          cwd_auto: 0,
          message_count: 0,
          total_cost_usd: 0,
          api_profile_id: null,
          api_base_url: null,
          model_id: null,
          source: 'manual',
          task_id: null,
          created_at: 101,
          updated_at: 101
        },
        {
          session_id: 'db-row-1',
          type: 'chat',
          status: 'closed',
          sdk_session_id: null,
          title: '历史会话 1',
          cwd: '/tmp',
          cwd_auto: 0,
          message_count: 0,
          total_cost_usd: 0,
          api_profile_id: null,
          api_base_url: null,
          model_id: null,
          source: 'manual',
          task_id: null,
          created_at: 1,
          updated_at: 1
        }
      ]))
    }

    const sessions = manager.list()

    expect(manager.sessionDatabase.listAllAgentConversations).toHaveBeenCalledWith({ limit: null })
    expect(sessions.map(session => session.id)).toEqual(['db-row-101', 'db-row-1'])
  })

  it('probeConnection labels API refusal clearly', async () => {
    const { manager } = createManager()

    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (messageQueue) => ({
        async *[Symbol.asyncIterator]() {
          await messageQueue.next()
          yield {
            type: 'result',
            subtype: 'error',
            is_error: true,
            result: 'Coding Plan is currently only available for Coding Agents'
          }
        },
        close: vi.fn(async () => {})
      })),
      normalizeMessage: raw => ({
        type: 'result',
        subtype: raw.subtype,
        isError: raw.is_error,
        result: raw.result
      })
    }

    const result = await manager.probeConnection({
      id: 'profile-1',
      baseUrl: 'https://example.com',
      authToken: 'token',
      authType: 'api_key'
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('模型请求被拒绝：Coding Plan is currently only available for Coding Agents')
    expect(result.errorKind).toBe('API_ERROR')
  })

  it('injects scheduled-task MCP tools into manual chat sessions', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 'session-with-tools', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set(session.id, session)
    manager.scheduledTaskService = {
      listTasks: vi.fn(() => []),
      createTask: vi.fn(),
      updateTask: vi.fn()
    }

    let createQueryOptions = null
    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (_messageQueue, options) => {
        createQueryOptions = options
        return {
          async *[Symbol.asyncIterator]() {},
          close: vi.fn(async () => {})
        }
      }),
      normalizeMessage: raw => raw
    }

    await manager.sendMessage(session.id, '帮我创建一个定时任务')

    expect(createQueryOptions).toBeTruthy()
    expect(createQueryOptions.appendSystemPrompt).toContain('Hydro Desktop AI')
    expect(createQueryOptions.appendSystemPrompt).toContain('scheduled tasks')
    expect(createQueryOptions.mcpServers).toBeTruthy()
    expect(Object.keys(createQueryOptions.mcpServers)).toContain('hydrodesktop')
    expect(createQueryOptions.allowedTools).toEqual(
      expect.arrayContaining(DESKTOP_CAPABILITY_ALLOWED_TOOLS)
    )
    expect(createQueryOptions.disallowedTools).toEqual(
      expect.arrayContaining(['CronList', 'CronCreate', 'CronUpdate', 'CronDelete', 'cronList', 'cronCreate', 'cronUpdate', 'cronDelete'])
    )
  })

  it('includes hydrology domain MCP tools alongside embeddedapp and hydrodesktop for hydrology embedded sessions', async () => {
    const { manager } = createManager()
    const session = new AgentSession({
      id: 'embedded-hydro-domain',
      cwd: '/tmp',
      apiProfileId: 'p1',
      apiBaseUrl: 'https://example.com',
      modelId: 'sonnet-4',
      ownerClientId: 'embed:hydrology-workbench',
      clientType: 'embedded',
      clientMeta: {
        appId: 'hydrology-workbench'
      }
    })
    session.dbConversationId = 1
    manager.sessions.set(session.id, session)
    manager.scheduledTaskService = {
      listTasks: vi.fn(() => []),
      getTaskRuns: vi.fn(() => []),
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      }
    }
    manager.embeddedAppRuntimeManager = {
      getContext: vi.fn(() => ({
        title: '测试站 / 实时数据列表',
        summary: '当前站点：测试站，当前功能：实时数据列表',
        payload: {
          station: { id: 'st-1', name: '测试站' },
          function: { key: 'realtime', label: '实时数据列表' }
        }
      })),
      executeCommand: vi.fn()
    }

    let createQueryOptions = null
    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (_messageQueue, options) => {
        createQueryOptions = options
        return {
          async *[Symbol.asyncIterator]() {},
          close: vi.fn(async () => {})
        }
      }),
      normalizeMessage: raw => raw
    }

    await manager.sendMessage(session.id, '检查当前站点的实时数据和审核任务')

    expect(createQueryOptions).toBeTruthy()
    expect(Object.keys(createQueryOptions.mcpServers || {})).toEqual(['hydrodesktop', 'embeddedapp', 'hydrology'])
    expect(createQueryOptions.allowedTools).toEqual(expect.arrayContaining(HYDROLOGY_ALLOWED_TOOLS))
    expect(createQueryOptions.appendSystemPrompt).toContain('hydrology MCP server')
    expect(createQueryOptions.appendSystemPrompt).toContain('Use embeddedapp tools for current UI state')
    expect(createQueryOptions.appendSystemPrompt).toContain('Use hydrology tools for real business entities')
  })

  it('injects scheduled-task MCP tools for task-linked sessions the same as normal sessions', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 'task-linked-session', cwd: '/tmp', taskId: 1 })
    session.dbConversationId = 1
    manager.sessions.set(session.id, session)
    manager.scheduledTaskService = {
      listTasks: vi.fn(() => []),
      configManager: {
        getConfig: () => ({
          settings: {
            locale: 'zh-CN'
          }
        })
      }
    }

    let createQueryOptions = null
    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (_messageQueue, options) => {
        createQueryOptions = options
        return {
          async *[Symbol.asyncIterator]() {},
          close: vi.fn(async () => {})
        }
      }),
      normalizeMessage: raw => raw
    }

    await manager.sendMessage(session.id, '执行定时任务')

    expect(createQueryOptions).toBeTruthy()
    expect(Object.keys(createQueryOptions.mcpServers || {})).toEqual(['hydrodesktop'])
    expect(createQueryOptions.allowedTools).toEqual(expect.arrayContaining(DESKTOP_CAPABILITY_ALLOWED_TOOLS))
    expect(createQueryOptions.appendSystemPrompt).toContain('Hydro Desktop AI')
    expect(createQueryOptions.appendSystemPrompt).toContain('Do not introduce yourself as Claude or Claude Code')
    expect(createQueryOptions.appendSystemPrompt).toContain('HydroDesktop scheduled tasks')
    expect(createQueryOptions.disallowedTools).toEqual(expect.arrayContaining([
      'CronList',
      'CronCreate',
      'CronUpdate',
      'CronDelete'
    ]))
  })

  it('injects Hydro Desktop AI identity prompt for normal chat sessions', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 'session-identity', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set(session.id, session)

    let createQueryOptions = null
    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (_messageQueue, options) => {
        createQueryOptions = options
        return {
          async *[Symbol.asyncIterator]() {},
          close: vi.fn(async () => {})
        }
      }),
      normalizeMessage: raw => raw
    }

    await manager.sendMessage(session.id, '你是谁？')

    expect(createQueryOptions).toBeTruthy()
    expect(createQueryOptions.appendSystemPrompt).toContain('Hydro Desktop AI')
    expect(createQueryOptions.appendSystemPrompt).toContain('你好，我是 Hydro Desktop，是智水工坊研发的AI个人桌面助手')
    expect(createQueryOptions.appendSystemPrompt).toContain('智水工坊研发的AI个人桌面助手')
    expect(createQueryOptions.appendSystemPrompt).toContain('connect to mainstream large models')
    expect(createQueryOptions.appendSystemPrompt).toContain('Do not introduce yourself as Claude or Claude Code')
    expect(createQueryOptions.mcpServers).toBeUndefined()
  })

  it('does not override runner settingSources for normal chat sessions', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 'session-setting-sources', cwd: '/tmp' })
    session.dbConversationId = 1
    manager.sessions.set(session.id, session)

    let createQueryOptions = null
    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (_messageQueue, options) => {
        createQueryOptions = options
        return {
          async *[Symbol.asyncIterator]() {},
          close: vi.fn(async () => {})
        }
      }),
      normalizeMessage: raw => raw
    }

    await manager.sendMessage(session.id, '测试项目级 Claude 配置')

    expect(createQueryOptions).toBeTruthy()
    expect(createQueryOptions.settingSources).toBeUndefined()
  })

  it('probeConnection marks CLI unavailable as HTTP-fallback eligible', async () => {
    const { manager } = createManager()

    manager.runner = {
      buildEnv: vi.fn(() => ({})),
      createQuery: vi.fn(async () => {
        throw new Error('Failed to spawn Claude Code process: spawn node ENOENT')
      })
    }

    const result = await manager.probeConnection({
      id: 'profile-1',
      baseUrl: 'https://example.com',
      authToken: 'token',
      authType: 'api_key'
    })

    expect(result.success).toBe(false)
    expect(result.errorKind).toBe('CLI_UNAVAILABLE')
    expect(result.canFallbackToHttp).toBe(true)
  })

  it('injects saved image paths into multimodal user text so non-vision flows can read local files', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's-image-path-hint', cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'agent-image-hint-')) })
    session.dbConversationId = 1
    manager.sessions.set(session.id, session)

    let firstQueuedMessage = null
    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (messageQueue) => ({
        async *[Symbol.asyncIterator]() {
          const first = await messageQueue.next()
          firstQueuedMessage = first.value
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'sdk-image-hint',
            tools: [],
            model: 'claude-sonnet-4-6'
          }
          yield {
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: 'ok',
            total_cost_usd: 0,
            num_turns: 1,
            duration_ms: 5
          }
        },
        close: vi.fn(async () => {})
      })),
      normalizeMessage: raw => {
        if (raw.type === 'system' && raw.subtype === 'init') {
          return {
            type: 'init',
            sdkSessionId: raw.session_id,
            tools: raw.tools,
            model: raw.model,
            slashCommands: raw.slash_commands || []
          }
        }
        if (raw.type === 'result') {
          return {
            type: 'result',
            subtype: raw.subtype,
            isError: raw.is_error,
            result: raw.result,
            totalCostUsd: raw.total_cost_usd,
            numTurns: raw.num_turns,
            durationMs: raw.duration_ms
          }
        }
        return raw
      }
    }

    await manager.sendMessage(session.id, {
      text: '请查看这张图并读出内容',
      images: [{
        mediaType: 'image/png',
        base64: Buffer.from('pngdata').toString('base64')
      }]
    })

    expect(firstQueuedMessage).toBeTruthy()
    expect(Array.isArray(firstQueuedMessage.message.content)).toBe(true)
    expect(firstQueuedMessage.message.content[0]).toMatchObject({
      type: 'text'
    })
    expect(firstQueuedMessage.message.content[0].text).toContain('请查看这张图并读出内容')
    expect(firstQueuedMessage.message.content[0].text).toContain('图片已保存到以下路径')
    expect(firstQueuedMessage.message.content[0].text).toMatch(/\.\/chat_paste_images\/.+\.png/)
    expect(firstQueuedMessage.message.content[1]).toMatchObject({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png'
      }
    })
    const savedDir = path.join(session.cwd, 'chat_paste_images')
    expect(fs.existsSync(savedDir)).toBe(true)
    expect(fs.readdirSync(savedDir).length).toBe(1)
  })

  it('passes document attachment paths to the agent without extracting text', async () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's-doc-attach', cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'agent-doc-attach-')) })
    session.dbConversationId = 1
    manager.sessions.set(session.id, session)

    let firstQueuedMessage = null
    manager.runner = {
      buildEnv: vi.fn(() => ({ ANTHROPIC_BASE_URL: 'https://example.com' })),
      createQuery: vi.fn(async (messageQueue) => ({
        async *[Symbol.asyncIterator]() {
          const first = await messageQueue.next()
          firstQueuedMessage = first.value
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'sdk-doc-attach',
            tools: [],
            model: 'claude-sonnet-4-6'
          }
          yield {
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: 'ok',
            total_cost_usd: 0,
            num_turns: 1,
            duration_ms: 5
          }
        },
        close: vi.fn(async () => {})
      })),
      normalizeMessage: raw => {
        if (raw.type === 'system' && raw.subtype === 'init') {
          return {
            type: 'init',
            sdkSessionId: raw.session_id,
            tools: raw.tools,
            model: raw.model,
            slashCommands: raw.slash_commands || []
          }
        }
        if (raw.type === 'result') {
          return {
            type: 'result',
            subtype: raw.subtype,
            isError: raw.is_error,
            result: raw.result,
            totalCostUsd: raw.total_cost_usd,
            numTurns: raw.num_turns,
            durationMs: raw.duration_ms
          }
        }
        return raw
      }
    }

    await manager.sendMessage(session.id, {
      text: '请查看附件',
      attachments: [{
        kind: 'document',
        subKind: 'pdf',
        filename: 'report.pdf',
        localPath: path.join(session.cwd, 'report.pdf')
      }]
    })

    expect(firstQueuedMessage).toBeTruthy()
    expect(Array.isArray(firstQueuedMessage.message.content)).toBe(false)
    expect(firstQueuedMessage.message.content).toContain('请查看附件')
    expect(firstQueuedMessage.message.content).toContain('附件已保存到以下路径')
    expect(firstQueuedMessage.message.content).toContain('report.pdf')
    expect(firstQueuedMessage.message.content).toContain(path.join(session.cwd, 'report.pdf'))
  })

  it('stores and reloads attachment metadata with user messages', () => {
    const { manager } = createManager()
    const session = new AgentSession({ id: 's-attachment-history', cwd: '/tmp' })
    session.dbConversationId = 7
    manager.sessions.set(session.id, session)

    let savedMessage = null
    manager.sessionDatabase = {
      insertAgentMessage: vi.fn((_conversationId, message) => {
        savedMessage = message
      }),
      getAgentConversation: vi.fn(() => ({ id: 7 })),
      getAgentMessagesByConversationId: vi.fn(() => ([{
        msg_id: savedMessage.msgId,
        role: savedMessage.role,
        content: savedMessage.content,
        tool_name: savedMessage.toolName,
        tool_input: savedMessage.toolInput,
        tool_output: savedMessage.toolOutput,
        timestamp: savedMessage.timestamp
      }]))
    }

    manager._storeMessage(session, {
      id: 'msg-with-attachment',
      role: 'user',
      content: '请查看附件',
      timestamp: 123,
      attachments: [{
        id: 'att-1',
        kind: 'document',
        subKind: 'pdf',
        mimeType: 'application/pdf',
        filename: 'report.pdf',
        sizeBytes: 42,
        preview: { kind: 'pdf' },
        localPath: '/tmp/report.pdf'
      }]
    })

    expect(savedMessage.content).toContain('"attachments"')

    const messages = manager.getMessages(session.id)
    expect(messages[0]).toMatchObject({
      id: 'msg-with-attachment',
      content: '请查看附件',
      attachments: [{
        id: 'att-1',
        kind: 'document',
        subKind: 'pdf',
        filename: 'report.pdf',
        localPath: '/tmp/report.pdf'
      }]
    })
  })
})

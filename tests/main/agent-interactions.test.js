import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'

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

  it('treats dingtalk sessions as dingtalk source by default', () => {
    const { manager } = createManager()
    manager.sessionDatabase = {
      createAgentConversation: vi.fn(() => ({ id: 1 })),
      listAllAgentConversations: vi.fn(() => []),
      getAgentConversation: vi.fn(() => ({
        id: 1,
        session_id: 'db-dt-1',
        type: 'dingtalk',
        title: '钉钉会话',
        cwd: 'C:/tmp',
        source: null,
        task_id: null,
        cwd_auto: 0,
        message_count: 0,
        total_cost_usd: 0,
        created_at: Date.now(),
        api_profile_id: null,
        api_base_url: null
      })),
      updateAgentConversation: vi.fn()
    }

    const created = manager.create({ type: 'dingtalk', title: '新钉钉会话' })
    expect(created.source).toBe('dingtalk')

    manager.sessions.clear()
    const reopened = manager.reopen('db-dt-1')
    expect(reopened.source).toBe('dingtalk')
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
      authType: 'api_key',
      selectedModelTier: 'sonnet'
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
      authType: 'api_key',
      selectedModelTier: 'sonnet'
    })

    expect(result.success).toBe(true)
    expect(result.message).toBe('Claude Code 已连通，收到模型回复：pong early')
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
      authType: 'api_key',
      selectedModelTier: 'sonnet'
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('模型请求被拒绝：Coding Plan is currently only available for Coding Agents')
    expect(result.errorKind).toBe('API_ERROR')
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
      authType: 'api_key',
      selectedModelTier: 'sonnet'
    })

    expect(result.success).toBe(false)
    expect(result.errorKind).toBe('CLI_UNAVAILABLE')
    expect(result.canFallbackToHttp).toBe(true)
  })
})

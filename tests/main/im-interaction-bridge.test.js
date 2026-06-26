import { describe, it, expect, vi } from 'vitest'

const { ImInteractionBridge } = await import('../../src/main/managers/im-interaction-bridge.js')

describe('ImInteractionBridge', () => {
  it('starts a pending interaction and resolves an action by numeric reply', async () => {
    const bridge = new ImInteractionBridge()
    const sendMenu = vi.fn(async () => {})
    const resolveInteraction = vi.fn(async () => ({ success: true }))
    const cancelInteraction = vi.fn(async () => ({ success: true }))

    bridge.startPending({
      mapKey: 'user-1',
      sessionId: 'session-1',
      interaction: {
        interactionId: 'interaction-1',
        kind: 'permission_request',
        toolName: 'Bash',
        actions: [
          {
            key: 'allow_once',
            label: '允许一次',
            updatedPermissions: [],
            decisionClassification: 'user_temporary',
          },
        ],
      },
      sendMenu,
    })

    expect(sendMenu).toHaveBeenCalledOnce()

    const result = await bridge.consume({
      mapKey: 'user-1',
      text: '1',
      resolveInteraction,
      cancelInteraction,
    })

    expect(result.handled).toBe(true)
    expect(result.resolved).toBe(true)
    expect(resolveInteraction).toHaveBeenCalledWith('session-1', 'interaction-1', expect.objectContaining({
      behavior: 'allow',
      decisionClassification: 'user_temporary',
    }))
    expect(cancelInteraction).not.toHaveBeenCalled()
    expect(bridge.getPending('user-1')).toBe(null)
  })

  it('cancels an interaction when the user replies 0', async () => {
    const bridge = new ImInteractionBridge()
    const cancelInteraction = vi.fn(async () => ({ success: true }))

    bridge.startPending({
      mapKey: 'user-2',
      sessionId: 'session-2',
      interaction: {
        interactionId: 'interaction-2',
        kind: 'permission_request',
        actions: [{ key: 'allow_once', label: '允许一次' }],
      },
      sendMenu: async () => {},
    })

    const result = await bridge.consume({
      mapKey: 'user-2',
      text: '0',
      resolveInteraction: async () => ({ success: true }),
      cancelInteraction,
    })

    expect(result.handled).toBe(true)
    expect(result.cancelled).toBe(true)
    expect(cancelInteraction).toHaveBeenCalledWith('session-2', 'interaction-2', 'User denied from IM')
    expect(bridge.getPending('user-2')).toBe(null)
  })

  it('returns an invalid-choice message for unsupported numeric input', async () => {
    const bridge = new ImInteractionBridge()

    bridge.startPending({
      mapKey: 'user-3',
      sessionId: 'session-3',
      interaction: {
        interactionId: 'interaction-3',
        kind: 'permission_request',
        actions: [{ key: 'allow_once', label: '允许一次' }],
      },
      sendMenu: async () => {},
    })

    const result = await bridge.consume({
      mapKey: 'user-3',
      text: '5',
      resolveInteraction: async () => ({ success: true }),
      cancelInteraction: async () => ({ success: true }),
    })

    expect(result.handled).toBe(true)
    expect(result.invalidChoice).toBe(true)
    expect(result.replyText).toContain('编号错误')
    expect(bridge.getPending('user-3')).toBeTruthy()
  })

  it('renders ask_user_question and resolves a single-select answer from IM', async () => {
    const bridge = new ImInteractionBridge()
    const sendMenu = vi.fn(async () => {})
    const resolveInteraction = vi.fn(async () => ({ success: true }))

    bridge.startPending({
      mapKey: 'user-ask-1',
      sessionId: 'session-ask-1',
      interaction: {
        interactionId: 'interaction-ask-1',
        kind: 'ask_user_question',
        title: '请选择方案',
        questions: [{
          header: '方案选择',
          question: '你想继续哪一个方案？',
          options: [
            { label: 'A 方案', description: '稳妥继续' },
            { label: 'B 方案', description: '直接重试' },
          ],
        }],
      },
      sendMenu,
    })

    expect(sendMenu).toHaveBeenCalledOnce()
    expect(sendMenu.mock.calls[0][0]).toContain('请选择方案')
    expect(sendMenu.mock.calls[0][0]).toContain('1 - A 方案')

    const result = await bridge.consume({
      mapKey: 'user-ask-1',
      text: '2',
      resolveInteraction,
      cancelInteraction: async () => ({ success: true }),
    })

    expect(result.handled).toBe(true)
    expect(result.resolved).toBe(true)
    expect(resolveInteraction).toHaveBeenCalledWith('session-ask-1', 'interaction-ask-1', expect.objectContaining({
      behavior: 'allow',
      questions: expect.any(Array),
      answers: [{
        question: '你想继续哪一个方案？',
        answer: 'B 方案',
      }],
    }))
  })

  it('falls back to desktop-only notice for unsupported ask_user_question payloads', async () => {
    const bridge = new ImInteractionBridge()
    const sendMenu = vi.fn(async () => {})

    const started = bridge.startPending({
      mapKey: 'user-ask-2',
      sessionId: 'session-ask-2',
      interaction: {
        interactionId: 'interaction-ask-2',
        kind: 'ask_user_question',
        title: '复杂问题',
        questions: [],
      },
      sendMenu,
    })

    await Promise.resolve()
    expect(started).toBe(false)
    expect(sendMenu).toHaveBeenCalledOnce()
    expect(sendMenu.mock.calls[0][0]).toContain('暂不支持在 IM 中完成')
    expect(bridge.getPending('user-ask-2')).toBe(null)
  })
})

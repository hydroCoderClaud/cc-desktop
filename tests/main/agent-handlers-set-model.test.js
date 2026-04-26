import { describe, it, expect, vi } from 'vitest'

function createMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn)
    }
  }
}

describe('agent:setModel IPC handler', () => {
  it('forwards ignored result from AgentSessionManager', async () => {
    const { setupAgentHandlers } = await import('../../src/main/ipc-handlers/agent-handlers.js')
    const ipcMain = createMockIpcMain()
    const mockManager = {
      setModel: vi.fn(async () => ({
        ignored: true,
        requestedModel: 'sonnet'
      }))
    }

    setupAgentHandlers(ipcMain, mockManager)
    const handler = ipcMain.handlers.get('agent:setModel')

    const result = await handler(null, { sessionId: 's1', model: 'sonnet' })

    expect(mockManager.setModel).toHaveBeenCalledWith('s1', 'sonnet')
    expect(result).toEqual({
      ignored: true,
      requestedModel: 'sonnet'
    })
  })

  it('returns success when AgentSessionManager.setModel resolves with no payload', async () => {
    const { setupAgentHandlers } = await import('../../src/main/ipc-handlers/agent-handlers.js')
    const ipcMain = createMockIpcMain()
    const mockManager = {
      setModel: vi.fn(async () => {})
    }

    setupAgentHandlers(ipcMain, mockManager)
    const handler = ipcMain.handlers.get('agent:setModel')

    const result = await handler(null, { sessionId: 's1', model: 'glm-4.5' })

    expect(mockManager.setModel).toHaveBeenCalledWith('s1', 'glm-4.5')
    expect(result).toEqual({ success: true })
  })
})

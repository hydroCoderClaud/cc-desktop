import { describe, it, expect, vi } from 'vitest'

function createMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn)
    },
    on: vi.fn()
  }
}

describe('config-handlers api:testConnection', () => {
  it('uses probe result directly when fallback is not allowed', async () => {
    const { setupConfigHandlers } = await import('../../src/main/ipc-handlers/config-handlers.js')
    const ipcMain = createMockIpcMain()
    const configManager = {
      getConfig: () => ({}),
      validateAPIConfig: vi.fn(),
      testAPIConnectionViaHTTP: vi.fn(async () => ({ success: true, message: 'http-ok' }))
    }
    const agentSessionManager = {
      probeConnection: vi.fn(async () => ({
        success: false,
        message: 'API error: Coding Plan is currently only available for Coding Agents',
        errorKind: 'API_ERROR',
        canFallbackToHttp: false
      }))
    }

    setupConfigHandlers(ipcMain, configManager, agentSessionManager)
    const handler = ipcMain.handlers.get('api:testConnection')

    const result = await handler(null, { baseUrl: 'https://example.com' })

    expect(agentSessionManager.probeConnection).toHaveBeenCalledOnce()
    expect(configManager.testAPIConnectionViaHTTP).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.errorKind).toBe('API_ERROR')
  })

  it('falls back to HTTP only when probe marks it fallback-eligible', async () => {
    const { setupConfigHandlers } = await import('../../src/main/ipc-handlers/config-handlers.js')
    const ipcMain = createMockIpcMain()
    const configManager = {
      getConfig: () => ({}),
      validateAPIConfig: vi.fn(),
      testAPIConnectionViaHTTP: vi.fn(async () => ({ success: true, message: 'http-ok' }))
    }
    const agentSessionManager = {
      probeConnection: vi.fn(async () => ({
        success: false,
        message: 'Claude Code CLI 不可用：spawn node ENOENT',
        errorKind: 'CLI_UNAVAILABLE',
        canFallbackToHttp: true
      }))
    }

    setupConfigHandlers(ipcMain, configManager, agentSessionManager)
    const handler = ipcMain.handlers.get('api:testConnection')

    const result = await handler(null, { baseUrl: 'https://example.com' })

    expect(agentSessionManager.probeConnection).toHaveBeenCalledOnce()
    expect(configManager.testAPIConnectionViaHTTP).toHaveBeenCalledOnce()
    expect(result).toEqual({ success: true, message: 'http-ok' })
  })
})

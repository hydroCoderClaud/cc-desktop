import { describe, it, expect } from 'vitest'

const { mcpMarketMixin } = await import('../../src/main/managers/mcp/market.js')

describe('mcp market windows command wrapping', () => {
  it('wraps npm-style shim commands on Windows but leaves node untouched', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })

    try {
      const servers = {
        npmServer: {
          command: 'npm',
          args: ['exec', '--yes']
        },
        nodeServer: {
          command: 'node',
          args: ['server.js', 'a&b']
        }
      }

      mcpMarketMixin._wrapCommandsForWindows(servers)

      expect(servers.npmServer).toEqual({
        command: 'cmd',
        args: ['/c', 'npm', 'exec', '--yes']
      })
      expect(servers.nodeServer).toEqual({
        command: 'node',
        args: ['server.js', 'a&b']
      })
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    }
  })
})

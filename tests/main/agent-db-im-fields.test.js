import { describe, it, expect, vi } from 'vitest'

const { withAgentOperations } = await import('../../src/main/database/agent-db.js')

describe('Agent DB IM field queries', () => {
  function createDbHarness() {
    const calls = []
    class Base {}
    const AgentDb = withAgentOperations(Base)
    const harness = new AgentDb()
    harness.db = {
      prepare: vi.fn((sql) => ({
        all: vi.fn((...params) => {
          calls.push({ kind: 'all', sql, params })
          return []
        }),
        run: vi.fn((...params) => {
          calls.push({ kind: 'run', sql, params })
          return { changes: 1 }
        }),
      })),
    }
    return { harness, calls }
  }

  it('queries IM history only through im_channel, im_user_id, and im_chat_id', () => {
    const { harness, calls } = createDbHarness()

    harness.getImSessionsByType('feishu', 'ou_xxx', 'oc_xxx', 7)

    expect(calls).toHaveLength(1)
    expect(calls[0].kind).toBe('all')
    expect(calls[0].sql).toContain('WHERE im_channel = ?')
    expect(calls[0].sql).toContain('AND im_user_id = ?')
    expect(calls[0].sql).toContain('AND im_chat_id = ?')
    expect(calls[0].sql).not.toContain('type = ?')
    expect(calls[0].sql).not.toContain('source = ?')
    expect(calls[0].sql).not.toContain('staff_id = ?')
    expect(calls[0].sql).not.toContain('conversation_id = ?')
    expect(calls[0].params).toEqual(['feishu', 'ou_xxx', 'oc_xxx', 7])
  })

  it('stores IM identity into the new identity columns when updating legacy metadata', () => {
    const { harness, calls } = createDbHarness()

    harness.updateImIdentity('session-1', { userId: 'staff-1', chatId: 'conv-1' })

    expect(calls).toHaveLength(1)
    expect(calls[0].kind).toBe('run')
    expect(calls[0].sql).toContain('im_user_id = ?')
    expect(calls[0].sql).toContain('im_chat_id = ?')
    expect(calls[0].params).toEqual(['staff-1', 'conv-1', 'staff-1', 'conv-1', null, expect.any(Number), 'session-1'])
  })
})

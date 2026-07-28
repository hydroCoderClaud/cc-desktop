import { describe, expect, it, vi } from 'vitest'
import { createImSessionHostRouter, getSessionHostKind } from '../../src/renderer/utils/im-session-host-router.js'

describe('IM session host router', () => {
  it('classifies specialized hosts before falling back to ordinary Agent sessions', () => {
    expect(getSessionHostKind({ type: 'notebook' })).toBe('notebook')
    expect(getSessionHostKind({ clientType: 'embedded' })).toBe('embedded')
    expect(getSessionHostKind({ type: 'chat' })).toBe('agent')
  })

  it('deduplicates concurrent Notebook restore requests for the same session', async () => {
    let resolveRestore
    const restoreGate = new Promise(resolve => { resolveRestore = resolve })
    const getSessionRouting = vi.fn().mockResolvedValue({ id: 'notebook-session', type: 'notebook' })
    const getSession = vi.fn().mockResolvedValue(null)
    const restoreNotebookSession = vi.fn(async () => {
      await restoreGate
      return true
    })
    const router = createImSessionHostRouter({
      getSessionRouting,
      getSession,
      restoreNotebookSession
    })

    const firstRestore = router.restoreSpecializedHost('notebook-session')
    const secondRestore = router.restoreSpecializedHost('notebook-session')

    expect(secondRestore).toBe(firstRestore)
    await vi.waitFor(() => expect(restoreNotebookSession).toHaveBeenCalledTimes(1))
    resolveRestore()

    await expect(firstRestore).resolves.toMatchObject({
      hostKind: 'notebook',
      restored: true,
      session: { id: 'notebook-session' }
    })
    expect(getSessionRouting).toHaveBeenCalledTimes(1)
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('does not open a specialized host for an ordinary Agent session', async () => {
    const restoreNotebookSession = vi.fn()
    const restoreEmbeddedSession = vi.fn()
    const router = createImSessionHostRouter({
      getSessionRouting: vi.fn().mockResolvedValue({ id: 'agent-session', type: 'chat' }),
      getSession: vi.fn().mockResolvedValue(null),
      restoreNotebookSession,
      restoreEmbeddedSession
    })

    await expect(router.restoreSpecializedHost('agent-session')).resolves.toMatchObject({
      hostKind: 'agent',
      restored: false
    })
    expect(restoreNotebookSession).not.toHaveBeenCalled()
    expect(restoreEmbeddedSession).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNotebookSessionLifecycle } from '../../src/renderer/pages/notebook/composables/useNotebookSessionLifecycle.js'

const originalWindow = globalThis.window

afterEach(() => {
  globalThis.window = originalWindow
  vi.restoreAllMocks()
})

describe('useNotebookSessionLifecycle', () => {
  it('keeps the active notebook session open and reports a loading failure', async () => {
    const currentNotebook = { value: { id: 'current', sessionId: 'current-session' } }
    const message = { error: vi.fn() }
    const closeAgentSession = vi.fn()
    const notebookGet = vi.fn().mockRejectedValue(new Error('Notebook directory is unavailable: D:\\missing'))
    globalThis.window = {
      electronAPI: { closeAgentSession, notebookGet }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { loadNotebook } = useNotebookSessionLifecycle({
      currentNotebook,
      sources: { value: [] },
      achievements: { value: [] },
      activeGenerationAchievementId: { value: null },
      activeGenerationToken: { value: 0 },
      clearStudioTagFilters: vi.fn(),
      processAchievements: vi.fn(),
      refreshSources: vi.fn(),
      refreshAchievements: vi.fn(),
      message,
      t: (key, params) => `${key}: ${params?.error || ''}`
    })

    await loadNotebook({ id: 'missing', sessionId: 'missing-session' })

    expect(notebookGet).toHaveBeenCalledWith('missing')
    expect(closeAgentSession).not.toHaveBeenCalled()
    expect(currentNotebook.value).toEqual({ id: 'current', sessionId: 'current-session' })
    expect(message.error).toHaveBeenCalledWith(
      'notebook.loadFailed: Notebook directory is unavailable: D:\\missing'
    )
  })
})

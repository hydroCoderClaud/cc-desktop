import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

import { useAgentPanel } from '../../src/renderer/composables/useAgentPanel.js'

describe('useAgentPanel filters', () => {
  beforeEach(() => {
    global.window = {
      electronAPI: {
        listAgentSessions: vi.fn().mockResolvedValue([
          { id: 'manual-1', source: 'manual', cwd: 'C:/manual-a', updatedAt: '2026-04-22T01:00:00.000Z' },
          { id: 'manual-2', source: 'manual', cwd: 'C:/shared', updatedAt: '2026-04-22T02:00:00.000Z' },
          { id: 'scheduled-1', source: 'scheduled', cwd: 'C:/scheduled-a', updatedAt: '2026-04-22T03:00:00.000Z' },
          { id: 'scheduled-2', source: 'scheduled', cwd: 'C:/shared', updatedAt: '2026-04-21T03:00:00.000Z' },
          { id: 'ding-1', type: 'dingtalk', source: 'dingtalk', cwd: 'C:/dingtalk-a', updatedAt: '2026-04-20T03:00:00.000Z' }
        ])
      }
    }
  })

  it('limits directory options to the selected source', async () => {
    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(panel.availableCwds.value).toEqual([
      'C:/dingtalk-a',
      'C:/manual-a',
      'C:/scheduled-a',
      'C:/shared'
    ])

    panel.selectedSource.value = 'scheduled'
    await nextTick()

    expect(panel.availableCwds.value).toEqual([
      'C:/scheduled-a',
      'C:/shared'
    ])
  })

  it('clears the selected directory when it is not available for the new source', async () => {
    const panel = useAgentPanel()
    await panel.loadConversations()

    panel.selectedCwd.value = 'C:/manual-a'
    panel.selectedSource.value = 'manual'
    await nextTick()

    expect(panel.selectedCwd.value).toBe('C:/manual-a')

    panel.selectedSource.value = 'scheduled'
    await nextTick()

    expect(panel.selectedCwd.value).toBeNull()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

import { useAgentPanel } from '../../src/renderer/composables/useAgentPanel.js'

describe('useAgentPanel filters', () => {
  beforeEach(() => {
    const localStorageValues = new Map()
    global.window = {
      localStorage: {
        getItem: vi.fn((key) => localStorageValues.get(key) ?? null),
        setItem: vi.fn((key, value) => {
          localStorageValues.set(key, value)
        })
      },
      electronAPI: {
        listAgentSessions: vi.fn().mockResolvedValue([
          { id: 'manual-1', type: 'chat', source: 'manual', cwd: 'C:/manual-a', updatedAt: '2026-04-22T01:00:00.000Z' },
          { id: 'manual-2', type: 'chat', source: 'manual', taskId: 101, cwd: 'C:/shared', updatedAt: '2026-04-22T02:00:00.000Z' },
          { id: 'manual-3', type: 'chat', source: 'manual', taskId: 102, cwd: 'C:/scheduled-a', updatedAt: '2026-04-22T03:00:00.000Z' },
          { id: 'manual-4', type: 'chat', source: 'manual', cwd: 'C:/shared', updatedAt: '2026-04-21T03:00:00.000Z' },
          { id: 'ding-1', type: 'chat', source: 'im-inbound', imChannel: 'dingtalk', cwd: 'C:/dingtalk-a', updatedAt: '2026-04-20T03:00:00.000Z' },
          { id: 'feishu-1', type: 'chat', source: 'im-inbound', imChannel: 'feishu', taskId: 201, cwd: 'C:/feishu-a', updatedAt: '2026-04-20T03:30:00.000Z' },
          { id: 'notebook-1', type: 'notebook', source: 'manual', cwd: 'C:/notebook-a', updatedAt: '2026-04-22T04:00:00.000Z' },
          { id: 'embed-owner', type: 'chat', ownerClientId: 'embed:hydrology-workbench', source: 'manual', cwd: 'C:/embed-owner', updatedAt: '2026-04-22T04:00:00.000Z' },
          { id: 'embed-type', type: 'chat', clientType: 'embedded', source: 'manual', cwd: 'C:/embed-type', updatedAt: '2026-04-22T05:00:00.000Z' },
          { id: 'embed-workspace', type: 'chat', source: 'manual', cwd: 'C:/Users/demo/AppData/Roaming/Hydro/embedded-apps/hydrology-workbench/workspace', updatedAt: '2026-04-22T06:00:00.000Z' }
        ])
      }
    }
  })

  it('limits directory options to the selected chat source and task state', async () => {
    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(panel.availableCwds.value).toEqual([
      'C:/scheduled-a',
      'C:/shared',
      'C:/manual-a',
      'C:/feishu-a',
      'C:/dingtalk-a'
    ])
    expect(panel.conversations.value.map(conv => conv.id)).not.toContain('embed-owner')
    expect(panel.conversations.value.map(conv => conv.id)).not.toContain('embed-type')
    expect(panel.conversations.value.map(conv => conv.id)).not.toContain('embed-workspace')
    expect(panel.conversations.value.map(conv => conv.id)).not.toContain('notebook-1')

    panel.selectedSource.value = 'no-im'
    await nextTick()

    expect(panel.availableCwds.value).toEqual([
      'C:/scheduled-a',
      'C:/shared',
      'C:/manual-a'
    ])

    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(panel.availableCwds.value).toEqual([
      'C:/scheduled-a',
      'C:/shared'
    ])

    panel.selectedTaskFilter.value = 'without-task'
    await nextTick()

    expect(panel.availableCwds.value).toEqual([
      'C:/manual-a',
      'C:/shared'
    ])

    panel.selectedSource.value = 'feishu'
    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(panel.availableCwds.value).toEqual([
      'C:/feishu-a'
    ])
  })

  it('clears the selected directory when it is not available for the new task filter', async () => {
    const panel = useAgentPanel()
    await panel.loadConversations()

    panel.selectedCwd.value = 'C:/scheduled-a'
    panel.selectedSource.value = 'no-im'
    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(panel.selectedCwd.value).toBe('C:/scheduled-a')

    panel.selectedTaskFilter.value = 'without-task'
    await nextTick()

    expect(panel.selectedCwd.value).toBeNull()
  })

  it('keeps IM source filtering isolated from task filtering', async () => {
    const panel = useAgentPanel()
    await panel.loadConversations()

    panel.selectedSource.value = 'dingtalk'
    panel.selectedTaskFilter.value = 'all'
    await nextTick()

    expect(panel.availableCwds.value).toEqual([
      'C:/dingtalk-a'
    ])

    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(panel.availableCwds.value).toEqual([])
  })

  it('shows at most ten recent directories from matching conversations', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `session-${index}`,
        type: 'chat',
        source: 'manual',
        cwd: `C:/dir-${index}`,
        updatedAt: new Date(Date.UTC(2026, 3, 22, 12 - index)).toISOString()
      }))
    )

    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(panel.availableCwds.value).toEqual([
      'C:/dir-0',
      'C:/dir-1',
      'C:/dir-2',
      'C:/dir-3',
      'C:/dir-4',
      'C:/dir-5',
      'C:/dir-6',
      'C:/dir-7',
      'C:/dir-8',
      'C:/dir-9'
    ])
  })

  it('keeps manually opened directories recent, selected, and persisted', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `session-${index}`,
        type: 'chat',
        source: 'manual',
        cwd: `C:/dir-${index}`,
        updatedAt: new Date(Date.UTC(2026, 3, 22, 12 - index)).toISOString()
      }))
    )

    const panel = useAgentPanel()
    await panel.loadConversations()

    panel.selectCwd('C:/manual-picked')
    await nextTick()

    expect(panel.selectedCwd.value).toBe('C:/manual-picked')
    expect(panel.availableCwds.value).toEqual([
      'C:/manual-picked',
      'C:/dir-0',
      'C:/dir-1',
      'C:/dir-2',
      'C:/dir-3',
      'C:/dir-4',
      'C:/dir-5',
      'C:/dir-6',
      'C:/dir-7',
      'C:/dir-8'
    ])
    expect(global.window.localStorage.setItem).toHaveBeenCalledWith(
      'agent.leftPanel.recentCwds',
      JSON.stringify(['C:/manual-picked'])
    )
  })
})

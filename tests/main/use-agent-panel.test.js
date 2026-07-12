import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

import { useAgentPanel } from '../../src/renderer/composables/useAgentPanel.js'

const directoryCwds = (panel) => panel.availableDirectories.value.map(directory => directory.cwd)

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
          { id: 'app-1', type: 'chat', source: 'manual', sessionAppId: 'sap-weekly', cwd: 'C:/app-a', updatedAt: '2026-04-22T03:15:00.000Z' },
          { id: 'app-restored-1', type: 'chat', source: 'manual', ownerClientId: 'embed:session-app-host', clientType: 'embedded', sessionAppId: 'sap-weekly', cwd: 'C:/Users/demo/AppData/Roaming/Hydro/embedded-apps/session-apps/workspace', updatedAt: '2026-04-22T03:20:00.000Z' },
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

    expect(directoryCwds(panel)).toEqual([
      'C:/Users/demo/AppData/Roaming/Hydro/embedded-apps/session-apps/workspace',
      'C:/app-a',
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

    expect(directoryCwds(panel)).toEqual([
      'C:/Users/demo/AppData/Roaming/Hydro/embedded-apps/session-apps/workspace',
      'C:/app-a',
      'C:/scheduled-a',
      'C:/shared',
      'C:/manual-a'
    ])

    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(directoryCwds(panel)).toEqual([
      'C:/scheduled-a',
      'C:/shared'
    ])

    panel.selectedTaskFilter.value = 'without-task'
    await nextTick()

    expect(directoryCwds(panel)).toEqual([
      'C:/Users/demo/AppData/Roaming/Hydro/embedded-apps/session-apps/workspace',
      'C:/app-a',
      'C:/manual-a',
      'C:/shared'
    ])

    panel.selectedSource.value = 'feishu'
    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(directoryCwds(panel)).toEqual([
      'C:/feishu-a'
    ])
  })

  it('filters session app conversations independently from other filters', async () => {
    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(panel.appFilterOptions.value.map(option => option.key)).toContain('sap-weekly')

    panel.selectedAppFilter.value = 'session-app'
    await nextTick()

    expect(panel.groupedConversations.value.today.map(conv => conv.id)).toEqual([])
    expect(panel.groupedConversations.value.older.map(conv => conv.id)).toEqual(['app-1', 'app-restored-1'])

    panel.selectedAppFilter.value = 'plain-session'
    await nextTick()

    expect(panel.groupedConversations.value.today.map(conv => conv.id)).not.toContain('app-1')
    expect(panel.groupedConversations.value.today.map(conv => conv.id)).not.toContain('app-restored-1')

    panel.selectedAppFilter.value = 'sap-weekly'
    await nextTick()

    expect(directoryCwds(panel)).toContain('C:/app-a')
    expect(panel.groupedConversations.value).toEqual({
      today: [],
      yesterday: [],
      older: expect.arrayContaining([
        expect.objectContaining({ id: 'app-restored-1' }),
        expect.objectContaining({ id: 'app-1' })
      ])
    })
  })

  it('uses project identity before cwd for directory filters', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'project-session-a',
        type: 'chat',
        source: 'manual',
        projectId: 7,
        projectName: 'Shared Project',
        projectPath: 'C:/shared-project',
        cwd: 'C:/shared-project',
        updatedAt: '2026-04-22T03:00:00.000Z'
      },
      {
        id: 'project-session-b',
        type: 'chat',
        source: 'manual',
        projectId: 7,
        projectName: 'Shared Project',
        projectPath: 'C:/shared-project',
        cwd: 'C:/shared-project',
        updatedAt: '2026-04-22T02:00:00.000Z'
      },
      {
        id: 'cwd-session',
        type: 'chat',
        source: 'manual',
        cwd: 'C:/cwd-only',
        updatedAt: '2026-04-22T01:00:00.000Z'
      }
    ])

    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(panel.availableDirectories.value).toEqual([
      expect.objectContaining({ key: 'project:7', projectId: '7', projectName: 'Shared Project', cwd: 'C:/shared-project' }),
      expect.objectContaining({ key: 'cwd:C:/cwd-only', projectId: null, cwd: 'C:/cwd-only' })
    ])

    panel.selectCwd('project:7')
    await nextTick()

    expect(panel.groupedConversations.value.older.map(conv => conv.id)).toEqual([
      'project-session-a',
      'project-session-b'
    ])
  })

  it('keeps generated chat conversations visible and selectable by directory', async () => {
    window.localStorage.setItem('agent.leftPanel.recentCwds', JSON.stringify([
      'C:/Users/demo/cc-desktop-agent-output/feishu/conv-cache-old'
    ]))
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'feishu-auto',
        type: 'chat',
        source: 'im-inbound',
        imChannel: 'feishu',
        cwdAuto: true,
        projectKind: 'agent-output',
        projectPath: 'C:/Users/demo/cc-desktop-agent-output/feishu/conv-07f0f200',
        cwd: 'C:/Users/demo/cc-desktop-agent-output/feishu/conv-07f0f200',
        updatedAt: '2026-04-22T03:00:00.000Z'
      },
      {
        id: 'manual-project',
        type: 'chat',
        source: 'manual',
        projectId: 9,
        projectKind: 'workspace',
        projectName: 'Manual Project',
        projectPath: 'C:/workspace/manual',
        cwd: 'C:/workspace/manual',
        updatedAt: '2026-04-22T02:00:00.000Z'
      }
    ])

    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(panel.conversations.value.map(conv => conv.id)).toContain('feishu-auto')
    expect(directoryCwds(panel)).toEqual([
      'C:/Users/demo/cc-desktop-agent-output/feishu/conv-cache-old',
      'C:/Users/demo/cc-desktop-agent-output/feishu/conv-07f0f200',
      'C:/workspace/manual'
    ])

    panel.selectedSource.value = 'feishu'
    await nextTick()

    expect(panel.groupedConversations.value.older.map(conv => conv.id)).toEqual(['feishu-auto'])
    expect(directoryCwds(panel)).toEqual([
      'C:/Users/demo/cc-desktop-agent-output/feishu/conv-cache-old',
      'C:/Users/demo/cc-desktop-agent-output/feishu/conv-07f0f200'
    ])
  })

  it('upgrades recent cwd entries to project directory keys when paths match', async () => {
    window.localStorage.setItem('agent.leftPanel.recentCwds', JSON.stringify(['C:/shared-project']))
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'project-session',
        type: 'chat',
        source: 'manual',
        projectId: 7,
        projectName: 'Shared Project',
        projectPath: 'C:/shared-project',
        cwd: 'C:/shared-project',
        updatedAt: '2026-04-22T03:00:00.000Z'
      }
    ])

    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(panel.availableDirectories.value).toEqual([
      expect.objectContaining({ key: 'project:7', projectId: '7', cwd: 'C:/shared-project' })
    ])

    panel.selectCwd('project:7')
    await nextTick()

    expect(panel.groupedConversations.value.older.map(conv => conv.id)).toEqual(['project-session'])
  })

  it('clears the selected directory when it is not available for the new task filter', async () => {
    const panel = useAgentPanel()
    await panel.loadConversations()

    panel.selectedCwd.value = 'cwd:C:/scheduled-a'
    panel.selectedSource.value = 'no-im'
    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(panel.selectedCwd.value).toBe('cwd:C:/scheduled-a')

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

    expect(directoryCwds(panel)).toEqual([
      'C:/dingtalk-a'
    ])

    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(panel.availableDirectories.value).toEqual([])
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

    expect(directoryCwds(panel)).toEqual([
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

    expect(panel.selectedCwd.value).toBe('cwd:C:/manual-picked')
    expect(directoryCwds(panel)).toEqual([
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

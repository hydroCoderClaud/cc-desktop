import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

import { useAgentPanel } from '../../src/renderer/composables/useAgentPanel.js'

const directoryCwds = (panel) => panel.availableDirectories.value.map(directory => directory.cwd)
const projectGroupKeys = (panel) => panel.projectConversationGroups.value.map(group => group.key)
const externalConversationIds = (panel) => panel.externalImConversations.value.map(conv => conv.id)

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
        ]),
        createAgentSession: vi.fn()
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

  it('clears a removed session-app filter after the panel reloads', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([{
      id: 'app-session-1',
      type: 'chat',
      source: 'manual',
      sessionAppId: 'sap-weekly',
      cwd: 'C:/app-a',
      updatedAt: '2026-04-22T03:15:00.000Z'
    }])
    global.window.electronAPI.listSessionApps = vi.fn().mockResolvedValue([{
      appId: 'sap-weekly',
      name: 'Weekly'
    }])

    const panel = useAgentPanel()
    await panel.loadConversations()
    panel.selectedAppFilter.value = 'sap-weekly'
    await nextTick()

    global.window.electronAPI.listAgentSessions.mockResolvedValue([{
      id: 'app-session-1',
      type: 'chat',
      source: 'manual',
      cwd: 'C:/app-a',
      updatedAt: '2026-04-22T03:16:00.000Z'
    }])
    global.window.electronAPI.listSessionApps.mockResolvedValue([])

    await panel.loadConversations()
    await nextTick()

    expect(panel.appFilterOptions.value.map(option => option.key)).not.toContain('sap-weekly')
    expect(panel.selectedAppFilter.value).toBe('all')
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

  it('builds a project tree from filtered conversations without database changes', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'project-session-a',
        type: 'chat',
        source: 'manual',
        status: 'closed',
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
        status: 'closed',
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
        updatedAt: '2026-04-22T04:00:00.000Z'
      },
      {
        id: 'uncategorized-session',
        type: 'chat',
        source: 'manual',
        updatedAt: '2026-04-22T01:00:00.000Z'
      }
    ])

    const panel = useAgentPanel()
    await panel.loadConversations()
    await nextTick()

    expect(projectGroupKeys(panel)).toEqual([
      'cwd:C:/cwd-only',
      'project:7',
      'uncategorized'
    ])
    expect(panel.projectConversationGroups.value[1]).toEqual(expect.objectContaining({
      key: 'project:7',
      projectId: '7',
      projectName: 'Shared Project',
      cwd: 'C:/shared-project',
      count: 2,
      hasOpenConversation: false,
      expanded: false
    }))
    expect(panel.projectConversationGroups.value[1].items.map(conv => conv.id)).toEqual([
      'project-session-a',
      'project-session-b'
    ])
  })

  it('keeps project pinning and expansion state in localStorage only', async () => {
    window.localStorage.setItem('agent.leftPanel.pinnedProjectKeys', JSON.stringify(['project:7']))
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
      },
      {
        id: 'cwd-session',
        type: 'chat',
        source: 'manual',
        cwd: 'C:/cwd-only',
        updatedAt: '2026-04-22T04:00:00.000Z'
      }
    ])

    const panel = useAgentPanel()
    await panel.loadConversations()
    await nextTick()

    expect(projectGroupKeys(panel)).toEqual(['project:7', 'cwd:C:/cwd-only'])
    expect(panel.projectConversationGroups.value[0].pinned).toBe(true)

    panel.toggleProjectPinned('cwd:C:/cwd-only')
    await nextTick()

    expect(panel.pinnedProjectKeys.value).toEqual(['cwd:C:/cwd-only', 'project:7'])
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'agent.leftPanel.pinnedProjectKeys',
      JSON.stringify(['cwd:C:/cwd-only', 'project:7'])
    )

    panel.collapseOtherProjects('project:7')
    await nextTick()

    expect(panel.expandedProjectKeys.value).toEqual(['project:7'])
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'agent.leftPanel.expandedProjectKeys',
      JSON.stringify(['project:7'])
    )
  })

  it('persists manual project order within pinned and unpinned projects', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'project-a',
        type: 'chat',
        source: 'manual',
        projectId: 7,
        projectName: 'Project A',
        projectPath: 'C:/project-a',
        cwd: 'C:/project-a',
        updatedAt: '2026-04-22T01:00:00.000Z'
      },
      {
        id: 'project-b',
        type: 'chat',
        source: 'manual',
        projectId: 8,
        projectName: 'Project B',
        projectPath: 'C:/project-b',
        cwd: 'C:/project-b',
        updatedAt: '2026-04-22T02:00:00.000Z'
      },
      {
        id: 'project-c',
        type: 'chat',
        source: 'manual',
        projectId: 9,
        projectName: 'Project C',
        projectPath: 'C:/project-c',
        cwd: 'C:/project-c',
        updatedAt: '2026-04-22T03:00:00.000Z'
      }
    ])

    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(projectGroupKeys(panel)).toEqual(['project:9', 'project:8', 'project:7'])

    panel.moveProject('project:7', 'project:9', 'before')
    await nextTick()

    expect(projectGroupKeys(panel)).toEqual(['project:7', 'project:9', 'project:8'])
    expect(panel.projectOrderKeys.value).toEqual(['project:7', 'project:9', 'project:8'])
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'agent.leftPanel.projectOrderKeys',
      JSON.stringify(['project:7', 'project:9', 'project:8'])
    )

    panel.toggleProjectPinned('project:8')
    panel.toggleProjectPinned('project:7')
    await nextTick()

    expect(projectGroupKeys(panel)).toEqual(['project:7', 'project:8', 'project:9'])

    panel.moveProject('project:8', 'project:7', 'before')
    await nextTick()

    expect(projectGroupKeys(panel)).toEqual(['project:8', 'project:7', 'project:9'])
    expect(panel.pinnedProjectKeys.value).toEqual(['project:8', 'project:7'])
  })

  it('clears filters that would hide a newly created conversation', async () => {
    const createdSession = {
      id: 'created-session',
      type: 'chat',
      source: 'manual',
      projectId: 17,
      projectName: 'Created Project',
      projectPath: 'C:/created-project',
      cwd: 'C:/created-project',
      updatedAt: '2026-04-22T05:00:00.000Z'
    }
    global.window.electronAPI.createAgentSession.mockResolvedValue(createdSession)

    const panel = useAgentPanel()
    await panel.loadConversations()
    panel.selectedSource.value = 'feishu'
    panel.selectedTaskFilter.value = 'with-task'
    panel.selectedAppFilter.value = 'session-app'
    panel.selectedCwd.value = 'cwd:C:/manual-a'

    await panel.createConversation({ cwd: createdSession.cwd })
    await nextTick()

    expect(panel.selectedSource.value).toBe('all')
    expect(panel.selectedTaskFilter.value).toBe('all')
    expect(panel.selectedAppFilter.value).toBe('all')
    expect(panel.selectedCwd.value).toBeNull()
    expect(projectGroupKeys(panel)).toContain('project:17')
  })

  it('keeps compatible filters after creating a conversation', async () => {
    const createdSession = {
      id: 'created-session-compatible',
      type: 'chat',
      source: 'manual',
      projectId: 17,
      projectName: 'Created Project',
      projectPath: 'C:/created-project',
      cwd: 'C:/created-project',
      updatedAt: '2026-04-22T05:00:00.000Z'
    }
    global.window.electronAPI.createAgentSession.mockResolvedValue(createdSession)
    global.window.electronAPI.listAgentSessions.mockResolvedValue([{
      id: 'existing-created-project-session',
      type: 'chat',
      source: 'manual',
      projectId: 17,
      projectName: 'Created Project',
      projectPath: 'C:/created-project',
      cwd: 'C:/created-project',
      updatedAt: '2026-04-22T04:00:00.000Z'
    }])

    const panel = useAgentPanel()
    await panel.loadConversations()
    panel.selectedSource.value = 'no-im'
    panel.selectedTaskFilter.value = 'without-task'
    panel.selectedAppFilter.value = 'plain-session'
    panel.selectedCwd.value = 'project:17'

    await panel.createConversation({ cwd: createdSession.cwd })
    await nextTick()

    expect(panel.selectedSource.value).toBe('no-im')
    expect(panel.selectedTaskFilter.value).toBe('without-task')
    expect(panel.selectedAppFilter.value).toBe('plain-session')
    expect(panel.selectedCwd.value).toBe('project:17')
    expect(projectGroupKeys(panel)).toEqual(['project:17'])
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
    expect(projectGroupKeys(panel)).toEqual(['project:9'])
    expect(externalConversationIds(panel)).toEqual(['feishu-auto'])
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

  it('groups only IM-created automatic directories as external conversations', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'feishu-auto-new',
        type: 'chat',
        imChannel: 'feishu',
        cwdAuto: true,
        projectKind: 'agent-output',
        cwd: 'C:/agent-output/feishu/new',
        updatedAt: '2026-04-22T04:00:00.000Z'
      },
      {
        id: 'dingtalk-auto-old',
        type: 'chat',
        imChannel: 'dingtalk',
        projectKind: 'agent-output',
        cwd: 'C:/agent-output/dingtalk/old',
        updatedAt: '2026-04-22T03:00:00.000Z'
      },
      {
        id: 'session-app-auto',
        type: 'chat',
        sessionAppId: 'session-app-1',
        cwdAuto: true,
        projectKind: 'agent-output',
        cwd: 'C:/agent-output/session-app/workspace',
        updatedAt: '2026-04-22T02:00:00.000Z'
      },
      {
        id: 'scheduled-auto',
        type: 'chat',
        source: 'scheduled',
        cwdAuto: true,
        projectKind: 'agent-output',
        cwd: 'C:/agent-output/scheduled/workspace',
        updatedAt: '2026-04-22T01:00:00.000Z'
      },
      {
        id: 'manual-im-workspace',
        type: 'chat',
        imChannel: 'feishu',
        projectKind: 'workspace',
        cwd: 'C:/workspace/feishu',
        updatedAt: '2026-04-22T00:00:00.000Z'
      }
    ])

    const panel = useAgentPanel()
    await panel.loadConversations()

    expect(externalConversationIds(panel)).toEqual(['feishu-auto-new', 'dingtalk-auto-old'])
    expect(projectGroupKeys(panel)).toEqual([
      'cwd:C:/agent-output/session-app/workspace',
      'cwd:C:/agent-output/scheduled/workspace',
      'cwd:C:/workspace/feishu'
    ])
    expect(panel.externalImExpanded.value).toBe(false)

    panel.toggleExternalImExpanded()
    await nextTick()

    expect(panel.externalImExpanded.value).toBe(true)
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'agent.leftPanel.expandedProjectKeys',
      JSON.stringify(['external-im'])
    )

    panel.selectedSource.value = 'feishu'
    await nextTick()

    expect(externalConversationIds(panel)).toEqual(['feishu-auto-new'])

    panel.selectCwd('C:/agent-output/dingtalk/old')
    await nextTick()

    expect(externalConversationIds(panel)).toEqual([])

    panel.selectedSource.value = 'all'
    await nextTick()

    expect(externalConversationIds(panel)).toEqual(['dingtalk-auto-old'])
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

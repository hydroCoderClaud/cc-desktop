import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useAgentPanel } from '../../src/renderer/composables/useAgentPanel.js'

const projectKeys = (panel) => panel.projectConversationGroups.value.map(group => group.key)
const groupByKey = (panel, key) => panel.projectConversationGroups.value.find(group => group.key === key)
const externalConversationIds = (panel) => panel.externalImConversations.value.map(conv => conv.id)

const projects = () => ([
  {
    id: 1,
    name: 'Alpha',
    path: 'C:/workspace/alpha',
    project_kind: 'workspace',
    pathValid: true,
    last_activity: '2026-04-22T04:00:00.000Z'
  },
  {
    id: 2,
    name: 'Empty project',
    path: 'C:/workspace/empty',
    project_kind: 'workspace',
    pathValid: true,
    last_activity: '2026-04-20T04:00:00.000Z'
  }
])

describe('useAgentPanel project tree', () => {
  let localStorageValues

  beforeEach(() => {
    localStorageValues = new Map()
    global.window = {
      localStorage: {
        getItem: vi.fn((key) => localStorageValues.get(key) ?? null),
        setItem: vi.fn((key, value) => {
          localStorageValues.set(key, value)
        })
      },
      electronAPI: {
        listAgentSessions: vi.fn().mockResolvedValue([]),
        listSessionApps: vi.fn().mockResolvedValue([]),
        createAgentSession: vi.fn()
      }
    }
  })

  it('builds normal roots from visible projects, including projects without sessions', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'alpha-session',
        type: 'chat',
        projectId: 1,
        cwd: 'C:/workspace/alpha',
        updatedAt: '2026-04-22T05:00:00.000Z'
      }
    ])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()

    expect(projectKeys(panel)).toEqual(['project:1', 'project:2'])
    expect(groupByKey(panel, 'project:1')).toMatchObject({
      path: 'C:/workspace/alpha',
      projectName: 'Alpha',
      count: 1
    })
    expect(groupByKey(panel, 'project:2')).toMatchObject({
      path: 'C:/workspace/empty',
      projectName: 'Empty project',
      count: 0,
      items: []
    })
    expect(panel.availableDirectories.value.map(project => project.key)).toEqual(['project:1', 'project:2'])
  })

  it('matches sessions only by projectId and retains unmatched non-IM sessions in a fallback group', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'bound',
        type: 'chat',
        projectId: 1,
        cwd: 'C:/workspace/alpha',
        updatedAt: '2026-04-22T05:00:00.000Z'
      },
      {
        id: 'same-cwd-legacy',
        type: 'chat',
        cwd: 'C:/workspace/alpha',
        updatedAt: '2026-04-22T04:00:00.000Z'
      },
      {
        id: 'hidden-project',
        type: 'chat',
        projectId: 999,
        cwd: 'C:/workspace/hidden',
        updatedAt: '2026-04-22T03:00:00.000Z'
      },
      {
        id: 'scheduled-auto',
        type: 'chat',
        cwdAuto: true,
        projectKind: 'agent-output',
        cwd: 'C:/agent-output/scheduled',
        updatedAt: '2026-04-22T02:00:00.000Z'
      },
      {
        id: 'im-auto',
        type: 'chat',
        imChannel: 'feishu',
        cwdAuto: true,
        projectKind: 'agent-output',
        cwd: 'C:/agent-output/feishu',
        updatedAt: '2026-04-22T01:00:00.000Z'
      }
    ])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()

    expect(projectKeys(panel)).toEqual(['project:1', 'project:2', 'uncategorized'])
    expect(groupByKey(panel, 'project:1').items.map(conv => conv.id)).toEqual(['bound'])
    expect(groupByKey(panel, 'uncategorized')).toMatchObject({
      isFallback: true,
      count: 3
    })
    expect(groupByKey(panel, 'uncategorized').items.map(conv => conv.id)).toEqual([
      'same-cwd-legacy',
      'hidden-project',
      'scheduled-auto'
    ])
    expect(externalConversationIds(panel)).toEqual(['im-auto'])
  })

  it('keeps an automatic IM conversation under its visible project binding', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'im-project-bound',
        type: 'chat',
        projectId: 1,
        source: 'im-inbound',
        cwdAuto: true,
        projectKind: 'agent-output',
        cwd: 'C:/workspace/alpha',
        updatedAt: '2026-04-22T05:00:00.000Z'
      },
      {
        id: 'im-internal',
        type: 'chat',
        projectId: 999,
        cwdAuto: true,
        projectKind: 'agent-output',
        imChannel: 'feishu',
        cwd: 'C:/agent-output/feishu',
        updatedAt: '2026-04-22T04:00:00.000Z'
      }
    ])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()

    expect(groupByKey(panel, 'project:1').items.map(conv => conv.id)).toEqual(['im-project-bound'])
    expect(externalConversationIds(panel)).toEqual(['im-internal'])
  })

  it('keeps an unbound historical automatic IM conversation in the IM group after unbinding', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'unbound-im-history',
        type: 'chat',
        source: 'im-inbound',
        cwdAuto: true,
        projectKind: 'agent-output',
        cwd: 'C:/agent-output/feishu',
        updatedAt: '2026-04-22T04:00:00.000Z'
      }
    ])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()

    expect(externalConversationIds(panel)).toEqual(['unbound-im-history'])
    expect(projectKeys(panel)).toEqual(['project:1', 'project:2'])

    panel.selectedSource.value = 'no-im'
    await nextTick()

    expect(externalConversationIds(panel)).toEqual([])
  })

  it('keeps an unbound historical IM row in the IM group without relying on cwdAuto', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([{
      id: 'legacy-unbound-im',
      type: 'chat',
      source: 'im-inbound',
      cwdAuto: false,
      cwd: 'C:/legacy-im/workdir',
      updatedAt: '2026-04-22T04:00:00.000Z'
    }])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()

    expect(externalConversationIds(panel)).toEqual(['legacy-unbound-im'])
    expect(projectKeys(panel)).toEqual(['project:1', 'project:2'])
  })

  it('does not infer an embedded conversation from an arbitrary cwd substring', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'ordinary-embedded-name',
        type: 'chat',
        cwd: 'C:/workspace/embedded-apps-notes',
        updatedAt: '2026-04-22T04:00:00.000Z'
      },
      {
        id: 'embedded-project-kind',
        type: 'chat',
        projectKind: 'embedded',
        cwd: 'C:/workspace/ordinary',
        updatedAt: '2026-04-22T03:00:00.000Z'
      }
    ])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()

    expect(groupByKey(panel, 'uncategorized').items.map(conv => conv.id)).toEqual(['ordinary-embedded-name'])
    expect(panel.conversations.value.map(conv => conv.id)).not.toContain('embedded-project-kind')
  })

  it('migrates legacy cwd preference keys when their project paths are available', async () => {
    localStorageValues.set('agent.leftPanel.pinnedProjectKeys', JSON.stringify([
      'cwd:C:\\workspace\\alpha',
      'project:2'
    ]))
    localStorageValues.set('agent.leftPanel.expandedProjectKeys', JSON.stringify([
      'cwd:C:/workspace/empty',
      'external-im'
    ]))
    localStorageValues.set('agent.leftPanel.projectOrderKeys', JSON.stringify([
      'cwd:C:/workspace/alpha',
      'cwd:C:/workspace/unmatched',
      'project:2'
    ]))

    const panel = useAgentPanel({ projects: ref(projects()) })
    await nextTick()

    expect(panel.pinnedProjectKeys.value).toEqual(['project:1', 'project:2'])
    expect(panel.expandedProjectKeys.value).toEqual(['project:2', 'external-im'])
    expect(panel.projectOrderKeys.value).toEqual([
      'project:1',
      'cwd:C:/workspace/unmatched',
      'project:2'
    ])
    expect(JSON.parse(localStorageValues.get('agent.leftPanel.pinnedProjectKeys'))).toEqual(['project:1', 'project:2'])
    expect(JSON.parse(localStorageValues.get('agent.leftPanel.expandedProjectKeys'))).toEqual(['project:2', 'external-im'])
  })

  it('does not synthesize cwd roots and filters session rows by selected project key', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'alpha-session',
        type: 'chat',
        projectId: 1,
        cwd: 'C:/workspace/alpha',
        updatedAt: '2026-04-22T05:00:00.000Z'
      },
      {
        id: 'legacy-session',
        type: 'chat',
        cwd: 'C:/workspace/legacy',
        updatedAt: '2026-04-22T04:00:00.000Z'
      }
    ])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()

    panel.selectCwd('C:/workspace/legacy')
    await nextTick()
    expect(panel.selectedCwd.value).toBeNull()
    expect(projectKeys(panel)).toEqual(['project:1', 'project:2', 'uncategorized'])

    panel.selectCwd('project:1')
    await nextTick()
    expect(panel.selectedCwd.value).toBe('project:1')
    expect(groupByKey(panel, 'project:1').items.map(conv => conv.id)).toEqual(['alpha-session'])
    expect(groupByKey(panel, 'project:2').count).toBe(0)
    expect(projectKeys(panel)).toEqual(['project:1', 'project:2'])
  })

  it('keeps project roots stable across source and task filters', async () => {
    global.window.electronAPI.listAgentSessions.mockResolvedValue([
      {
        id: 'alpha-task',
        type: 'chat',
        projectId: 1,
        taskId: 7,
        cwd: 'C:/workspace/alpha',
        updatedAt: '2026-04-22T05:00:00.000Z'
      },
      {
        id: 'legacy-im',
        type: 'chat',
        imChannel: 'feishu',
        cwd: 'C:/workspace/legacy',
        updatedAt: '2026-04-22T04:00:00.000Z'
      }
    ])

    const panel = useAgentPanel({ projects: ref(projects()) })
    await panel.loadConversations()
    panel.selectedSource.value = 'no-im'
    panel.selectedTaskFilter.value = 'with-task'
    await nextTick()

    expect(panel.availableDirectories.value.map(project => project.key)).toEqual(['project:1', 'project:2'])
    expect(projectKeys(panel)).toEqual(['project:1', 'project:2'])
    expect(groupByKey(panel, 'project:1').items.map(conv => conv.id)).toEqual(['alpha-task'])
  })

  it('supports pinning and manual ordering for zero-session project roots only', async () => {
    const projectSource = ref([
      { id: 1, name: 'Alpha', path: 'C:/workspace/alpha', project_kind: 'workspace', last_activity: 1 },
      { id: 2, name: 'Beta', path: 'C:/workspace/beta', project_kind: 'workspace', last_activity: 2 }
    ])
    const panel = useAgentPanel({ projects: projectSource })

    expect(projectKeys(panel)).toEqual(['project:2', 'project:1'])
    panel.moveProject('project:1', 'project:2', 'before')
    await nextTick()
    expect(projectKeys(panel)).toEqual(['project:1', 'project:2'])

    panel.toggleProjectPinned('project:2')
    await nextTick()
    expect(projectKeys(panel)).toEqual(['project:2', 'project:1'])

    global.window.electronAPI.listAgentSessions.mockResolvedValue([{
      id: 'legacy',
      type: 'chat',
      cwd: 'C:/workspace/legacy',
      updatedAt: '2026-04-22T04:00:00.000Z'
    }])
    await panel.loadConversations()
    panel.toggleProjectPinned('uncategorized')
    expect(panel.pinnedProjectKeys.value).not.toContain('uncategorized')
  })

  it('forwards projectId and cwd when creating a conversation', async () => {
    const createdSession = {
      id: 'created',
      type: 'chat',
      projectId: 1,
      cwd: 'C:/workspace/alpha',
      updatedAt: '2026-04-22T05:00:00.000Z'
    }
    global.window.electronAPI.createAgentSession.mockResolvedValue(createdSession)

    const panel = useAgentPanel({ projects: ref(projects()) })
    const session = await panel.createConversation({
      type: 'chat',
      projectId: 1,
      cwd: 'C:/workspace/alpha',
      apiProfileId: 'profile-a'
    })

    expect(session).toEqual(createdSession)
    expect(global.window.electronAPI.createAgentSession).toHaveBeenCalledWith({
      type: 'chat',
      title: '',
      projectId: 1,
      cwd: 'C:/workspace/alpha',
      apiProfileId: 'profile-a'
    })
    expect(groupByKey(panel, 'project:1').items.map(conv => conv.id)).toEqual(['created'])
  })
})

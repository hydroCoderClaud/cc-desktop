import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronModulePath = require.resolve('electron')

describe('project-handlers project directory identity', () => {
  let handlers
  let setupProjectHandlers
  let showOpenDialogMock
  let ipcMain
  let sessionDatabase
  let originalElectronCache
  const tempRoots = []

  const makeTempRoot = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-desktop-project-handler-'))
    tempRoots.push(root)
    return root
  }

  beforeEach(async () => {
    handlers = new Map()
    showOpenDialogMock = vi.fn()

    ipcMain = {
      handle: vi.fn((channel, handler) => {
        handlers.set(channel, handler)
      })
    }

    sessionDatabase = {
      getAllProjects: vi.fn(() => []),
      getCapabilityContextProjects: vi.fn(() => []),
      getProjectById: vi.fn(() => null),
      getProjectByPath: vi.fn(() => null),
      getOrCreateProject: vi.fn(() => ({ id: 101 })),
      createProject: vi.fn(() => ({ id: 100 })),
      renameProject: vi.fn(() => ({ id: 101, path: process.cwd(), name: 'Renamed workspace', project_kind: 'workspace' })),
      hideWorkspaceProject: vi.fn(() => ({ id: 101, path: process.cwd(), name: 'Hidden workspace', project_kind: 'workspace', is_hidden: 1 })),
      unhideProject: vi.fn(),
      touchProject: vi.fn()
    }

    originalElectronCache = require.cache[electronModulePath]
    require.cache[electronModulePath] = {
      id: electronModulePath,
      filename: electronModulePath,
      loaded: true,
      exports: {
        dialog: {
          showOpenDialog: showOpenDialogMock
        },
        shell: {
          openPath: vi.fn()
        }
      }
    }

    vi.resetModules()
    ;({ setupProjectHandlers } = await import('../../src/main/ipc-handlers/project-handlers.js'))
    setupProjectHandlers(ipcMain, sessionDatabase, null)
  })

  afterEach(() => {
    while (tempRoots.length) {
      fs.rmSync(tempRoots.pop(), { recursive: true, force: true })
    }
    if (originalElectronCache) {
      require.cache[electronModulePath] = originalElectronCache
    } else {
      delete require.cache[electronModulePath]
    }
  })

  it('opens non-ASCII and hyphenated project directories without warning', async () => {
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/workspace/develop/项目-abc']
    })
    sessionDatabase.createProject.mockReturnValueOnce({
      id: 100,
      path: 'C:/workspace/develop/项目-abc',
      name: '项目-abc'
    })

    const openHandler = handlers.get('project:open')
    const result = await openHandler(null)

    expect(result).toEqual(expect.objectContaining({
      id: 100,
      path: 'C:/workspace/develop/项目-abc',
      name: '项目-abc'
    }))
    expect(sessionDatabase.getProjectByPath).toHaveBeenCalledWith('C:/workspace/develop/项目-abc')
    expect(sessionDatabase.createProject).toHaveBeenCalledWith({
      path: 'C:/workspace/develop/项目-abc',
      name: '项目-abc'
    })
    expect(sessionDatabase.unhideProject).not.toHaveBeenCalled()
  })

  it('restores existing non-ASCII or underscored project directories without warning', async () => {
    sessionDatabase.getProjectByPath.mockReturnValueOnce({
      id: 42,
      path: 'C:/workspace/develop/项目_abc',
      name: '项目_abc',
      is_hidden: 1
    })
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/workspace/develop/项目_abc']
    })

    const openHandler = handlers.get('project:open')
    const result = await openHandler(null)

    expect(result).toEqual(expect.objectContaining({
      id: 42,
      path: 'C:/workspace/develop/项目_abc',
      name: '项目_abc',
      alreadyExists: true,
      restored: true
    }))
    expect(sessionDatabase.createProject).not.toHaveBeenCalled()
    expect(sessionDatabase.unhideProject).toHaveBeenCalledWith(42)
    expect(sessionDatabase.touchProject).toHaveBeenCalledWith(42)
  })

  it('reports the stored path status without decoding or deleting the project', async () => {
    const project = {
      id: 7,
      path: 'C:/missing/real-path',
      encoded_path: 'C--some-colliding-path',
      name: 'real-path'
    }
    sessionDatabase.getAllProjects.mockReturnValueOnce([project])

    const getAllHandler = handlers.get('project:getAll')
    const result = await getAllHandler(false)

    expect(result).toEqual([{ ...project, pathValid: false }])
    expect(sessionDatabase.createProject).not.toHaveBeenCalled()
    expect(sessionDatabase.unhideProject).not.toHaveBeenCalled()
  })

  it('does not register retired project management IPC channels', () => {
    expect([...handlers.keys()]).not.toEqual(expect.arrayContaining([
      'project:create',
      'project:update',
      'project:duplicate',
      'project:hide',
      'project:unhide',
      'project:delete',
      'project:togglePinned',
      'project:touch',
      'project:newSession',
      'project:openSession'
    ]))
  })

  it('renames a workspace project through the dedicated narrow IPC channel', async () => {
    const renameProject = handlers.get('project:rename')

    const result = await renameProject(null, {
      projectId: 101,
      name: '  Renamed workspace  '
    })

    expect(sessionDatabase.renameProject).toHaveBeenCalledWith(101, 'Renamed workspace')
    expect(result).toEqual(expect.objectContaining({
      id: 101,
      name: 'Renamed workspace',
      pathValid: true
    }))
  })

  it('hides a workspace project without exposing the retired delete API', async () => {
    const hideWorkspace = handlers.get('project:hideWorkspace')

    const result = await hideWorkspace(null, { projectId: 101 })

    expect(sessionDatabase.hideWorkspaceProject).toHaveBeenCalledWith(101)
    expect(result).toEqual(expect.objectContaining({
      id: 101,
      project_kind: 'workspace',
      is_hidden: 1,
      pathValid: true
    }))
    expect(handlers.has('project:delete')).toBe(false)
  })

  it('rejects invalid project rename payloads before they reach the database', async () => {
    const renameProject = handlers.get('project:rename')

    await expect(renameProject(null, { projectId: 'invalid', name: 'Workspace' }))
      .rejects.toThrow('项目 ID 无效')
    await expect(renameProject(null, { projectId: 101, name: '   ' }))
      .rejects.toThrow('项目名称不能为空')

    expect(sessionDatabase.renameProject).not.toHaveBeenCalled()
  })

  it('opens whitespace project directories without warning', async () => {
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/workspace/develop/project name']
    })
    sessionDatabase.createProject.mockReturnValueOnce({
      id: 101,
      path: 'C:/workspace/develop/project name',
      name: 'project name'
    })

    const openHandler = handlers.get('project:open')
    const result = await openHandler(null)

    expect(result).toMatchObject({
      id: 101,
      path: 'C:/workspace/develop/project name'
    })
    expect(sessionDatabase.createProject).toHaveBeenCalledWith({
      path: 'C:/workspace/develop/project name',
      name: 'project name'
    })
  })

  it('returns capability context projects with real path validity', async () => {
    sessionDatabase.getCapabilityContextProjects.mockReturnValueOnce([
      {
        id: 1,
        path: process.cwd(),
        name: 'Current Checkout',
        project_kind: 'workspace',
        is_hidden: 0
      },
      {
        id: 2,
        path: 'C:/definitely/missing/path',
        name: 'Missing Notebook',
        project_kind: 'notebook',
        is_hidden: 1
      }
    ])

    const getCapabilityContexts = handlers.get('project:getCapabilityContexts')
    const result = await getCapabilityContexts(null)

    expect(result).toEqual([
      expect.objectContaining({ id: 1, pathValid: true }),
      expect.objectContaining({ id: 2, pathValid: false })
    ])
  })

  it('ensures a selected capability directory as a workspace project', async () => {
    sessionDatabase.getOrCreateProject.mockReturnValueOnce({
      id: 101,
      path: process.cwd(),
      name: 'cc-desktop',
      project_kind: 'workspace',
      is_hidden: 0
    })

    const ensureWorkspace = handlers.get('project:ensureWorkspace')
    const result = await ensureWorkspace(null, { path: process.cwd(), name: 'cc-desktop' })

    expect(result).toEqual(expect.objectContaining({
      id: 101,
      path: process.cwd(),
      pathValid: true,
      alreadyExists: false
    }))
    expect(sessionDatabase.getOrCreateProject).toHaveBeenCalledWith(process.cwd(), {
      name: 'cc-desktop',
      projectKind: 'workspace'
    })
  })

  it('unhides and touches an existing workspace project selected in capability management', async () => {
    const existing = {
      id: 5,
      path: process.cwd(),
      name: 'Hidden Checkout',
      project_kind: 'workspace',
      is_hidden: 1
    }
    sessionDatabase.getProjectByPath.mockReturnValueOnce(existing)
    sessionDatabase.getProjectById.mockReturnValueOnce({ ...existing, is_hidden: 0 })

    const ensureWorkspace = handlers.get('project:ensureWorkspace')
    const result = await ensureWorkspace(null, { path: process.cwd() })

    expect(sessionDatabase.unhideProject).toHaveBeenCalledWith(5)
    expect(sessionDatabase.touchProject).toHaveBeenCalledWith(5)
    expect(result).toEqual(expect.objectContaining({
      id: 5,
      is_hidden: 0,
      pathValid: true,
      alreadyExists: true
    }))
    expect(sessionDatabase.getOrCreateProject).not.toHaveBeenCalled()
  })

  it('rejects an Agent workspace selection that is already owned by an internal project', async () => {
    const existing = {
      id: 18,
      path: process.cwd(),
      name: 'Notebook Scope',
      project_kind: 'notebook',
      is_hidden: 1
    }
    sessionDatabase.getProjectByPath.mockReturnValueOnce(existing)

    const ensureWorkspace = handlers.get('project:ensureWorkspace')

    await expect(ensureWorkspace(null, {
      path: process.cwd(),
      intent: 'agent-workspace'
    })).rejects.toThrow('所选目录已被其他内部项目占用，不能作为 Agent 项目')

    expect(sessionDatabase.unhideProject).not.toHaveBeenCalled()
    expect(sessionDatabase.touchProject).not.toHaveBeenCalled()
    expect(sessionDatabase.getOrCreateProject).not.toHaveBeenCalled()
  })

  it('preserves an existing internal project for non-Agent workspace intents', async () => {
    const existing = {
      id: 19,
      path: process.cwd(),
      name: 'Notebook Scope',
      project_kind: 'notebook',
      is_hidden: 1
    }
    sessionDatabase.getProjectByPath.mockReturnValueOnce(existing)

    const ensureWorkspace = handlers.get('project:ensureWorkspace')
    const result = await ensureWorkspace(null, { path: process.cwd() })

    expect(result).toEqual(expect.objectContaining({
      id: 19,
      project_kind: 'notebook',
      is_hidden: 1,
      alreadyExists: true
    }))
    expect(sessionDatabase.unhideProject).not.toHaveBeenCalled()
    expect(sessionDatabase.touchProject).not.toHaveBeenCalled()
    expect(sessionDatabase.getOrCreateProject).not.toHaveBeenCalled()
  })

  it('blocks relocation when a project session is still active', async () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const project = { id: 101, path: oldPath, project_kind: 'workspace' }
    sessionDatabase.getProjectById.mockReturnValue(project)
    sessionDatabase.listAllAgentConversations = vi.fn(() => [])

    const agentSessionManager = {
      sessions: new Map([['active-1', { id: 'active-1', projectId: 101, queryGenerator: {} }]])
    }
    const configManager = {
      getConfig: () => ({ settings: { agent: { claudeConfigDir: path.join(root, 'claude') } } })
    }
    setupProjectHandlers(ipcMain, sessionDatabase, null, { agentSessionManager, configManager })

    await expect(handlers.get('project:relocate')(null, { projectId: 101, newPath }))
      .rejects.toThrow('Stop active conversations')
    expect(sessionDatabase.relocateProject).toBeUndefined()
  })

  it('relocates a project after confirmation and updates in-memory sessions', async () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'claude')
    const oldClaudeDir = path.join(claudeRoot, 'projects', oldPath.replace(/[:\\/ _]/g, '-'))
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'session.jsonl'), 'history')
    const project = {
      id: 101,
      path: oldPath,
      encoded_path: oldPath.replace(/[:\\/ _]/g, '-'),
      project_kind: 'workspace',
      name: 'Workspace'
    }
    sessionDatabase.getProjectById.mockReturnValue(project)
    sessionDatabase.listAllAgentConversations = vi.fn(() => [{ project_id: 101 }])
    sessionDatabase.relocateProject = vi.fn(() => ({ ...project, path: newPath, name: 'Workspace' }))
    const liveSession = { id: 'idle-1', projectId: 101, cwd: oldPath, projectPath: oldPath }
    const agentSessionManager = { sessions: new Map([['idle-1', liveSession]]) }
    const configManager = {
      getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } })
    }
    setupProjectHandlers(ipcMain, sessionDatabase, null, { agentSessionManager, configManager })

    const result = await handlers.get('project:relocate')(null, { projectId: 101, newPath })

    expect(sessionDatabase.relocateProject).toHaveBeenCalledWith(101, newPath)
    expect(liveSession.cwd).toBe(newPath)
    expect(liveSession.projectPath).toBe(newPath)
    expect(result).toEqual(expect.objectContaining({ path: newPath, pathValid: true }))
    expect(fs.readFileSync(path.join(claudeRoot, 'projects', newPath.replace(/[:\\/ _]/g, '-'), 'session.jsonl'), 'utf8'))
      .toBe('history')
  })

  it('rolls Claude history back when the database update fails', async () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'claude')
    const oldEncoded = oldPath.replace(/[:\\/ _]/g, '-')
    const newEncoded = newPath.replace(/[:\\/ _]/g, '-')
    const oldClaudeDir = path.join(claudeRoot, 'projects', oldEncoded)
    const newClaudeDir = path.join(claudeRoot, 'projects', newEncoded)
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'session.jsonl'), 'history')
    const project = { id: 101, path: oldPath, encoded_path: oldEncoded, project_kind: 'workspace' }
    sessionDatabase.getProjectById.mockReturnValue(project)
    sessionDatabase.listAllAgentConversations = vi.fn(() => [])
    sessionDatabase.relocateProject = vi.fn(() => { throw new Error('database write failed') })
    setupProjectHandlers(ipcMain, sessionDatabase, null, {
      agentSessionManager: { sessions: new Map() },
      configManager: { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) }
    })

    await expect(handlers.get('project:relocate')(null, { projectId: 101, newPath }))
      .rejects.toThrow('database write failed')
    expect(fs.existsSync(newClaudeDir)).toBe(false)
    expect(fs.readFileSync(path.join(oldClaudeDir, 'session.jsonl'), 'utf8')).toBe('history')
  })
})

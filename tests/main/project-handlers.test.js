import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
})

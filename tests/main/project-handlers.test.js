import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronModulePath = require.resolve('electron')

describe('project-handlers openProject path warning', () => {
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
      getHiddenProjects: vi.fn(() => []),
      getProjectById: vi.fn(() => null),
      getProjectByPath: vi.fn(() => null),
      createProject: vi.fn(() => ({ id: 100 })),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      duplicateProject: vi.fn(),
      hideProject: vi.fn(),
      unhideProject: vi.fn(),
      toggleProjectPinned: vi.fn(),
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

  it('returns pathWarning payload for non-ASCII or hyphen path and does not create project', async () => {
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/workspace/develop/项目-abc']
    })

    const openHandler = handlers.get('project:open')
    const result = await openHandler(null)

    expect(result).toEqual({
      pathWarning: true,
      path: 'C:/workspace/develop/项目-abc',
      name: '项目-abc',
      alreadyExists: false,
      existingId: undefined
    })
    expect(sessionDatabase.getProjectByPath).toHaveBeenCalledWith('C:/workspace/develop/项目-abc')
    expect(sessionDatabase.createProject).not.toHaveBeenCalled()
    expect(sessionDatabase.unhideProject).not.toHaveBeenCalled()
  })

  it('returns existing project metadata in pathWarning payload when project already exists', async () => {
    sessionDatabase.getProjectByPath.mockReturnValueOnce({ id: 42, is_hidden: 1 })
    showOpenDialogMock.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:/workspace/develop/项目_abc']
    })

    const openHandler = handlers.get('project:open')
    const result = await openHandler(null)

    expect(result).toEqual({
      pathWarning: true,
      path: 'C:/workspace/develop/项目_abc',
      name: '项目_abc',
      alreadyExists: true,
      existingId: 42
    })
    expect(sessionDatabase.createProject).not.toHaveBeenCalled()
    expect(sessionDatabase.unhideProject).not.toHaveBeenCalled()
    expect(sessionDatabase.touchProject).not.toHaveBeenCalled()
  })
})

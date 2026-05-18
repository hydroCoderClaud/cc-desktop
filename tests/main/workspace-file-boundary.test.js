import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { setupProjectFilesHandlers } from '../../src/main/ipc-handlers/project-files-handlers.js'
import AgentFileManager from '../../src/main/managers/agent-file-manager.js'

function createMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler)
    }
  }
}

describe('workspace file write boundaries', () => {
  let tmpRoot
  let workspaceRoot
  let outsidePath

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-file-boundary-'))
    workspaceRoot = path.join(tmpRoot, 'workspace')
    outsidePath = path.join(tmpRoot, 'outside.txt')
    fs.mkdirSync(workspaceRoot, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('rejects project create and rename targets outside the project root', async () => {
    const ipcMain = createMockIpcMain()
    setupProjectFilesHandlers(ipcMain)

    const createFile = ipcMain.handlers.get('project:createFile')
    const renameFile = ipcMain.handlers.get('project:renameFile')
    expect(createFile).toBeTypeOf('function')
    expect(renameFile).toBeTypeOf('function')

    const createResult = await createFile(null, {
      rootPath: workspaceRoot,
      parentPath: '',
      name: '../outside.txt',
      isDirectory: false
    })
    expect(createResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)

    const sourcePath = path.join(workspaceRoot, 'source.txt')
    fs.writeFileSync(sourcePath, 'source', 'utf-8')

    const renameResult = await renameFile(null, {
      rootPath: workspaceRoot,
      oldPath: 'source.txt',
      newName: '../outside.txt'
    })
    expect(renameResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)
    expect(fs.existsSync(sourcePath)).toBe(true)
  })

  it('rejects agent create and rename targets outside the session cwd', async () => {
    const fileManager = new AgentFileManager({
      sessions: new Map([['s1', { id: 's1', cwd: workspaceRoot }]])
    })

    const createResult = await fileManager.createFile('s1', '', '../outside.txt', false)
    expect(createResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)

    const sourcePath = path.join(workspaceRoot, 'source.txt')
    fs.writeFileSync(sourcePath, 'source', 'utf-8')

    const renameResult = await fileManager.renameFile('s1', 'source.txt', '../outside.txt')
    expect(renameResult.error).toBeTruthy()
    expect(fs.existsSync(outsidePath)).toBe(false)
    expect(fs.existsSync(sourcePath)).toBe(true)
  })
})

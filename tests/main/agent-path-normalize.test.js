import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

function createMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn)
    }
  }
}

describe('agent:readAbsolutePath Windows path normalization', () => {
  it('normalizes /c/... and c/workspace/... but keeps generic relative path as relative', async () => {
    const setupAgentHandlers = (await import('../../src/main/ipc-handlers/agent-handlers.js')).setupAgentHandlers
    const ipcMain = createMockIpcMain()
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-path-test-'))

    const sessionCwd = path.join(tmpRoot, 'session-cwd')
    fs.mkdirSync(sessionCwd, { recursive: true })

    const windowsWorkspaceRoot = 'C:/workspace'
    const windowsWorkspaceFile = 'C:/workspace/cc-desktop-test-path-normalize.txt'
    const relativeFile = path.join(sessionCwd, 'a', 'b', 'note.txt')

    fs.mkdirSync(path.dirname(relativeFile), { recursive: true })
    fs.writeFileSync(relativeFile, 'relative', 'utf-8')

    const mockManager = {
      fileManager: {
        _resolveCwd: () => sessionCwd
      }
    }

    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })

    const originalExistsSync = fs.existsSync
    const originalStatSync = fs.statSync
    const originalReadFileSync = fs.readFileSync
    const originalIsAbsolute = path.isAbsolute

    const isWindowsDrivePath = (value) => /^[A-Za-z]:[\\/]/.test(String(value || ''))

    // 在 Linux CI 上模拟 win32 语义：C:/... 视为绝对路径
    const isAbsoluteSpy = vi.spyOn(path, 'isAbsolute').mockImplementation((target) => {
      if (isWindowsDrivePath(target)) return true
      return originalIsAbsolute(target)
    })

    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
      const normalized = String(target).replace(/\\/g, '/')
      if (normalized === 'C:/') return true
      if (normalized === windowsWorkspaceRoot) return true
      if (normalized === windowsWorkspaceFile) return true
      return originalExistsSync(target)
    })

    const statSpy = vi.spyOn(fs, 'statSync').mockImplementation((target, ...args) => {
      const normalized = String(target).replace(/\\/g, '/')
      if (normalized === windowsWorkspaceFile || normalized.endsWith('/' + windowsWorkspaceFile)) {
        return {
          isDirectory: () => false,
          size: 5
        }
      }
      return originalStatSync(target, ...args)
    })

    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((target, enc) => {
      const normalized = String(target).replace(/\\/g, '/')
      if ((normalized === windowsWorkspaceFile || normalized.endsWith('/' + windowsWorkspaceFile)) && enc === 'utf-8') {
        return 'hello'
      }
      return originalReadFileSync(target, enc)
    })

    try {
      setupAgentHandlers(ipcMain, mockManager)
      const handler = ipcMain.handlers.get('agent:readAbsolutePath')
      expect(handler).toBeTypeOf('function')

      const slashStyle = await handler(null, { filePath: '/c/workspace/cc-desktop-test-path-normalize.txt', sessionId: 's1', confirmed: true })
      expect(slashStyle.error).toBeFalsy()
      expect(String(slashStyle.filePath).replace(/\\/g, '/')).toBe(windowsWorkspaceFile)

      const windowsSlashStyle = await handler(null, { filePath: 'C:/workspace/cc-desktop-test-path-normalize.txt', sessionId: 's1', confirmed: true })
      expect(windowsSlashStyle.error).toBeFalsy()
      expect(String(windowsSlashStyle.filePath).replace(/\\/g, '/')).toBe(windowsWorkspaceFile)

      const shortDriveStyle = await handler(null, { filePath: 'c/workspace/cc-desktop-test-path-normalize.txt', sessionId: 's1', confirmed: true })
      expect(shortDriveStyle.error).toBeFalsy()
      expect(String(shortDriveStyle.filePath).replace(/\\/g, '/')).toBe(windowsWorkspaceFile)

      const relativeStyle = await handler(null, { filePath: 'a/b/note.txt', sessionId: 's1', confirmed: true })
      expect(relativeStyle.error).toBeFalsy()
      expect(String(relativeStyle.filePath).replace(/\\/g, '/')).toBe(relativeFile.replace(/\\/g, '/'))
    } finally {
      existsSpy.mockRestore()
      statSpy.mockRestore()
      readSpy.mockRestore()
      isAbsoluteSpy.mockRestore()
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})

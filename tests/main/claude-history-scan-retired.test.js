import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(process.cwd())
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf-8')

describe('retired Claude history scanning', () => {
  it('does not ship the filesystem history scanner services', () => {
    expect(fs.existsSync(path.join(root, 'src/main/session-history-service.js'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/main/session-sync-service.js'))).toBe(false)
  })

  it('does not expose history scan or sync IPC channels', () => {
    const mainIpc = read('src/main/ipc-handlers.js')
    const sessionIpc = read('src/main/ipc-handlers/session-handlers.js')
    const preload = read('src/preload/preload.js')
    const combined = `${mainIpc}\n${sessionIpc}\n${preload}`

    for (const retiredChannel of [
      'session:sync',
      'session:forceFullSync',
      'session:getSyncStatus',
      'session:clearInvalid',
      'session:getFileBasedSessions',
      'session:syncProjectSessions'
    ]) {
      expect(combined).not.toContain(retiredChannel)
    }
  })

  it('does not write project source values for new projects', () => {
    const projectDb = read('src/main/database/project-db.js')

    expect(projectDb).not.toContain("source = 'sync'")
    expect(projectDb).not.toContain("source: 'sync'")
    expect(projectDb).not.toContain("source = 'user'")
    expect(projectDb).not.toContain("source: 'user'")
    expect(projectDb).toContain('path_key')
  })

  it('does not reverse an encoded Claude directory into a cwd', () => {
    const pathUtils = read('src/main/utils/path-utils.js')
    const projectHandlers = read('src/main/ipc-handlers/project-handlers.js')

    expect(pathUtils).not.toContain('function decodePath')
    expect(pathUtils).not.toContain('function smartDecodePath')
    expect(pathUtils).not.toContain('function findValidPath')
    expect(projectHandlers).not.toContain('smartDecodePath')
  })
})

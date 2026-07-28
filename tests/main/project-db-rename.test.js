import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const { DatabaseSync } = requireCjs('node:sqlite')
const fs = requireCjs('fs')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/tmp/cc-desktop-test')
  }
}))

describe('project rename persistence', () => {
  let SessionDatabase
  let sqlite
  let database

  beforeEach(async () => {
    vi.resetModules()
    ;({ SessionDatabase } = await import('../../src/main/session-database.js'))

    sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL,
        path_key TEXT UNIQUE NOT NULL,
        encoded_path TEXT UNIQUE NOT NULL,
        project_kind TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📁',
        color TEXT DEFAULT '#1890ff',
        api_profile_id TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        last_opened_at INTEGER
      );
    `)
    sqlite.exec(`
      INSERT INTO projects (id, path, path_key, encoded_path, project_kind, name, created_at, updated_at)
      VALUES
        (1, 'C:/workspace/alpha', 'c:/workspace/alpha', 'C--workspace-alpha', 'workspace', 'Alpha', 1, 1),
        (2, 'C:/workspace/notebook', 'c:/workspace/notebook', 'C--workspace-notebook', 'notebook', 'Notebook', 2, 2);
    `)

    database = new SessionDatabase()
    database.db = sqlite
  })

  afterEach(() => {
    sqlite?.close()
  })

  it('updates only the workspace display name and updated_at', () => {
    const renamed = database.renameProject(1, 'Hydro Alpha')

    expect(renamed).toEqual(expect.objectContaining({
      id: 1,
      path: 'C:/workspace/alpha',
      name: 'Hydro Alpha',
      project_kind: 'workspace'
    }))
    expect(renamed.updated_at).toBeGreaterThan(1)
    expect(sqlite.prepare('SELECT path, path_key, encoded_path, name FROM projects WHERE id = 1').get()).toEqual({
      path: 'C:/workspace/alpha',
      path_key: 'c:/workspace/alpha',
      encoded_path: 'C--workspace-alpha',
      name: 'Hydro Alpha'
    })
  })

  it('does not allow internal project kinds to be renamed', () => {
    expect(() => database.renameProject(2, 'Renamed notebook'))
      .toThrow('仅可重命名工作区项目')
    expect(sqlite.prepare('SELECT name FROM projects WHERE id = 2').get()).toEqual({ name: 'Notebook' })
  })

  it('hides a workspace without deleting its project identity', () => {
    const hidden = database.hideWorkspaceProject(1)

    expect(hidden).toEqual(expect.objectContaining({
      id: 1,
      path: 'C:/workspace/alpha',
      project_kind: 'workspace',
      is_hidden: 1
    }))
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM projects WHERE id = 1').get()).toEqual({ count: 1 })
  })

  it('does not allow internal projects to be hidden as user workspaces', () => {
    expect(() => database.hideWorkspaceProject(2))
      .toThrow('仅可从项目树移除工作区项目')
    expect(sqlite.prepare('SELECT is_hidden FROM projects WHERE id = 2').get()).toEqual({ is_hidden: 0 })
  })

  it('reuses a legacy macOS project row when an existing directory differs only by case', () => {
    sqlite.exec(`
      INSERT INTO projects (id, path, path_key, encoded_path, project_kind, name, created_at, updated_at)
      VALUES (3, '/Users/me/Work/demo', 'posix:/Users/me/Work/demo', 'Users-me-Work-demo', 'workspace', 'Demo', 3, 3);
    `)
    const realpathSpy = vi.spyOn(fs.realpathSync, 'native').mockImplementation(target => {
      if (target === '/Users/me/Work/demo' || target === '/Users/me/Work/Demo') {
        return '/Users/me/Work/Demo'
      }
      throw new Error('ENOENT')
    })

    try {
      const project = database.getOrCreateProject('/Users/me/Work/Demo', {
        platform: 'darwin',
        projectKind: 'workspace'
      })

      expect(project).toEqual(expect.objectContaining({ id: 3, path: '/Users/me/Work/demo' }))
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM projects WHERE path_key LIKE 'posix:%'").get().count).toBe(1)
    } finally {
      realpathSpy.mockRestore()
    }
  })

  it('stores the physical macOS path when creating a project from an existing directory', () => {
    const realpathSpy = vi.spyOn(fs.realpathSync, 'native').mockImplementation(target => {
      if (target === '/Users/me/Work/demo') return '/Users/me/Work/Demo'
      throw new Error('ENOENT')
    })

    try {
      const project = database.createProject({
        path: '/Users/me/Work/demo',
        name: 'Demo',
        platform: 'darwin'
      })

      expect(project).toEqual(expect.objectContaining({
        path: '/Users/me/Work/Demo',
        path_key: 'posix:/Users/me/Work/Demo'
      }))
    } finally {
      realpathSpy.mockRestore()
    }
  })
})

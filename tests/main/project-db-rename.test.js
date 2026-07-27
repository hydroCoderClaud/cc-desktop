import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const { DatabaseSync } = requireCjs('node:sqlite')

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
})

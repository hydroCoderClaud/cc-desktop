import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const { DatabaseSync } = requireCjs('node:sqlite')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/tmp/cc-desktop-test')
  }
}))

describe('legacy synced project cleanup', () => {
  let SessionDatabase
  let sqlite
  let database

  beforeEach(async () => {
    vi.resetModules()
    const module = await import('../../src/main/session-database.js')
    SessionDatabase = module.SessionDatabase

    sqlite = new DatabaseSync(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON')
    sqlite.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL,
        encoded_path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        source TEXT DEFAULT 'user'
      );
      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE TABLE prompts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        project_id INTEGER,
        updated_at INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE agent_conversations (
        id INTEGER PRIMARY KEY,
        session_id TEXT UNIQUE NOT NULL
      );
    `)

    database = new SessionDatabase()
    database.db = sqlite
  })

  afterEach(() => {
    sqlite?.close()
  })

  it('removes only sync projects and their legacy session rows', () => {
    sqlite.exec(`
      INSERT INTO projects (id, path, encoded_path, name, source)
      VALUES
        (1, 'C:/workspace/user', 'C--workspace-user', 'user', 'user'),
        (2, 'C:/workspace/sync', 'C--workspace-sync', 'sync', 'sync');
      INSERT INTO sessions (id, project_id) VALUES (10, 1), (20, 2);
      INSERT INTO messages (id, session_id) VALUES (100, 10), (200, 20);
      INSERT INTO agent_conversations (id, session_id) VALUES (1000, 'agent-1');
    `)

    expect(database._removeLegacySyncedProjects()).toBe(1)

    expect(sqlite.prepare('SELECT id, source FROM projects ORDER BY id').all()).toEqual([
      expect.objectContaining({ id: 1, source: 'user' })
    ])
    expect(sqlite.prepare('SELECT id FROM sessions ORDER BY id').all()).toEqual([
      expect.objectContaining({ id: 10 })
    ])
    expect(sqlite.prepare('SELECT id FROM messages ORDER BY id').all()).toEqual([
      expect.objectContaining({ id: 100 })
    ])
    expect(sqlite.prepare('SELECT id FROM agent_conversations').all()).toEqual([
      expect.objectContaining({ id: 1000 })
    ])
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('preserves prompts from sync projects as global prompts', () => {
    sqlite.exec(`
      INSERT INTO projects (id, path, encoded_path, name, source)
      VALUES (2, 'C:/workspace/sync', 'C--workspace-sync', 'sync', 'sync');
      INSERT INTO prompts (id, name, content, scope, project_id)
      VALUES (30, 'project prompt', 'content', 'project', 2);
    `)

    expect(database._removeLegacySyncedProjects()).toBe(1)

    expect(sqlite.prepare('SELECT id FROM projects').all()).toEqual([])
    expect(sqlite.prepare('SELECT id, scope, project_id FROM prompts').all()).toEqual([
      expect.objectContaining({ id: 30, scope: 'global', project_id: null })
    ])
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('is idempotent when no sync projects remain', () => {
    sqlite.exec(`
      INSERT INTO projects (id, path, encoded_path, name, source)
      VALUES (1, 'C:/workspace/user', 'C--workspace-user', 'user', 'user')
    `)

    expect(database._removeLegacySyncedProjects()).toBe(0)
    expect(database._removeLegacySyncedProjects()).toBe(0)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM projects').get().count).toBe(1)
  })

  it('creates automatically ensured projects with path identity after migration', () => {
    database._migrateProjectIdentitySchema()
    database._migrateAgentConversationProjectBindings()
    sqlite.exec('CREATE UNIQUE INDEX idx_projects_path_key ON projects(path_key)')

    const project = database.getOrCreateProject(
      'C:/workspace/new-project',
      'C--workspace-new-project',
      'new-project'
    )

    expect(project.path_key).toBe('win32:c:/workspace/new-project')
    expect(project.project_kind).toBe('workspace')
    expect(sqlite.prepare('SELECT path_key FROM projects WHERE id = ?').get(project.id).path_key).toBe('win32:c:/workspace/new-project')
  })
})

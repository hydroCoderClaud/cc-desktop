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
      CREATE TABLE messages_fts (id INTEGER PRIMARY KEY);
      CREATE TABLE tags (id INTEGER PRIMARY KEY);
      CREATE TABLE session_tags (session_id INTEGER NOT NULL, tag_id INTEGER NOT NULL);
      CREATE TABLE message_tags (message_id INTEGER NOT NULL, tag_id INTEGER NOT NULL);
      CREATE TABLE favorites (id INTEGER PRIMARY KEY);
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

  const legacyTableNames = [
    'sessions',
    'messages',
    'messages_fts',
    'tags',
    'session_tags',
    'message_tags',
    'favorites'
  ]

  const existingLegacyTables = () => sqlite.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name IN (${legacyTableNames.map(() => '?').join(', ')})
    ORDER BY name
  `).all(...legacyTableNames).map(row => row.name)

  afterEach(() => {
    sqlite?.close()
  })

  it('drops developer legacy tables and removes only sync projects', () => {
    sqlite.exec(`
      INSERT INTO projects (id, path, encoded_path, name, source)
      VALUES
        (1, 'C:/workspace/user', 'C--workspace-user', 'user', 'user'),
        (2, 'C:/workspace/sync', 'C--workspace-sync', 'sync', 'sync');
      INSERT INTO sessions (id, project_id) VALUES (10, 1), (20, 2);
      INSERT INTO messages (id, session_id) VALUES (100, 10), (200, 20);
      INSERT INTO agent_conversations (id, session_id) VALUES (1000, 'agent-1');
    `)

    expect(existingLegacyTables()).toEqual([
      'favorites',
      'message_tags',
      'messages',
      'messages_fts',
      'session_tags',
      'sessions',
      'tags'
    ])

    database._dropDeveloperLegacyTables()
    expect(database._removeLegacySyncedProjects()).toBe(1)

    expect(sqlite.prepare('SELECT id, source FROM projects ORDER BY id').all()).toEqual([
      expect.objectContaining({ id: 1, source: 'user' })
    ])
    expect(existingLegacyTables()).toEqual([])
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

  it('lists capability context projects from project identity and agent activity', () => {
    database._migrateProjectIdentitySchema()
    database._migrateAgentConversationProjectBindings()
    sqlite.exec('CREATE UNIQUE INDEX idx_projects_path_key ON projects(path_key)')

    const visibleWorkspace = database.getOrCreateProject('C:/workspace/visible', {
      projectKind: 'workspace',
      name: 'Visible Workspace'
    })
    const hiddenWorkspace = database.getOrCreateProject('C:/workspace/hidden', {
      projectKind: 'workspace',
      name: 'Hidden Workspace',
      isHidden: true
    })
    const notebook = database.getOrCreateProject('C:/workspace/notebook', {
      projectKind: 'notebook',
      name: 'Notebook Scope'
    })
    const embedded = database.getOrCreateProject('C:/workspace/embedded', {
      projectKind: 'embedded',
      name: 'Embedded Scope'
    })

    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-visible-1', visibleWorkspace.path, visibleWorkspace.id, 100)
    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-visible-2', visibleWorkspace.path, visibleWorkspace.id, 300)
    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-hidden', hiddenWorkspace.path, hiddenWorkspace.id, 500)
    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-notebook', notebook.path, notebook.id, 200)
    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-embedded', embedded.path, embedded.id, 600)

    const rows = database.getCapabilityContextProjects()
    const names = rows.map(row => row.name)

    expect(names).toEqual(['Visible Workspace', 'Notebook Scope'])
    expect(rows.find(row => row.id === visibleWorkspace.id)).toEqual(
      expect.objectContaining({ session_count: 2, last_activity: 300 })
    )
    expect(rows.find(row => row.id === notebook.id)).toEqual(
      expect.objectContaining({ project_kind: 'notebook', session_count: 1, last_activity: 200 })
    )
  })

  it('lists visible and hidden workspace projects without developer sessions table', () => {
    database._migrateProjectIdentitySchema()
    database._migrateAgentConversationProjectBindings()
    sqlite.exec('CREATE UNIQUE INDEX idx_projects_path_key ON projects(path_key)')

    const visibleWorkspace = database.getOrCreateProject('C:/workspace/visible-list', {
      projectKind: 'workspace',
      name: 'Visible List'
    })
    const hiddenWorkspace = database.getOrCreateProject('C:/workspace/hidden-list', {
      projectKind: 'workspace',
      name: 'Hidden List',
      isHidden: true
    })
    const notebook = database.getOrCreateProject('C:/workspace/notebook-list', {
      projectKind: 'notebook',
      name: 'Notebook List'
    })

    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-visible-list-1', visibleWorkspace.path, visibleWorkspace.id, 100)
    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-visible-list-2', visibleWorkspace.path, visibleWorkspace.id, 300)
    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-hidden-list', hiddenWorkspace.path, hiddenWorkspace.id, 500)
    sqlite.prepare(`
      INSERT INTO agent_conversations (session_id, cwd, project_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('agent-notebook-list', notebook.path, notebook.id, 700)

    const visibleRows = database.getAllProjects(false)
    expect(visibleRows.map(row => row.name)).toEqual(['Visible List'])
    expect(visibleRows[0]).toEqual(
      expect.objectContaining({ session_count: 2, last_activity: 300 })
    )

    const allRows = database.getAllProjects(true)
    expect(allRows.map(row => row.name).sort()).toEqual(['Hidden List', 'Visible List'])

    const hiddenRows = database.getHiddenProjects()
    expect(hiddenRows).toEqual([
      expect.objectContaining({ name: 'Hidden List', session_count: 1, last_activity: 500 })
    ])
  })
})

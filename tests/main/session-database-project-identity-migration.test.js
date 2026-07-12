import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const { DatabaseSync } = requireCjs('node:sqlite')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/tmp/cc-desktop-test')
  }
}))

describe('project identity migration', () => {
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
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📁',
        color TEXT DEFAULT '#1890ff',
        api_profile_id TEXT,
        is_pinned INTEGER DEFAULT 0,
        is_hidden INTEGER DEFAULT 0,
        source TEXT DEFAULT 'user',
        created_at INTEGER DEFAULT 1000,
        updated_at INTEGER DEFAULT 1000,
        last_opened_at INTEGER
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
        updated_at INTEGER DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE agent_conversations (
        id INTEGER PRIMARY KEY,
        session_id TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'chat',
        status TEXT NOT NULL DEFAULT 'idle',
        title TEXT DEFAULT '',
        cwd TEXT,
        cwd_auto INTEGER DEFAULT 1,
        source TEXT DEFAULT 'manual',
        session_app_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE agent_messages (
        id INTEGER PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        msg_id TEXT NOT NULL,
        role TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
      );
    `)

    database = new SessionDatabase()
    database.db = sqlite
  })

  afterEach(() => {
    sqlite?.close()
  })

  it('backfills projects by path_key without merging encoded_path collisions', () => {
    sqlite.exec(`
      INSERT INTO projects (id, path, encoded_path, name, source, is_hidden)
      VALUES
        (1, 'C:/Work/Demo', 'C--Work-Demo', 'Demo', 'user', 0),
        (2, 'C:/Work/LegacySync', 'C--Work-LegacySync', 'Legacy Sync', 'sync', 0);
      INSERT INTO sessions (id, project_id) VALUES (10, 1), (20, 2);
      INSERT INTO messages (id, session_id) VALUES (100, 10), (200, 20);
      INSERT INTO prompts (id, name, content, scope, project_id)
      VALUES (30, 'sync prompt', 'content', 'project', 2);
      INSERT INTO agent_conversations (id, session_id, type, cwd, cwd_auto, session_app_id, created_at, updated_at)
      VALUES
        (100, 'agent-demo', 'chat', 'c:/work/demo/', 0, NULL, 2000, 2000),
        (101, 'agent-hyphen', 'chat', 'C:/Work/a-b', 0, NULL, 2000, 2000),
        (102, 'agent-underscore', 'chat', 'C:/Work/a_b', 0, NULL, 2000, 2000),
        (103, 'agent-auto', 'chat', 'C:/Work/auto-output', 1, NULL, 2000, 2000),
        (104, 'agent-app', 'chat', 'C:/Work/session-app', 0, 'sap-1', 2000, 2000);
      INSERT INTO agent_messages (id, conversation_id, msg_id, role, timestamp)
      VALUES (1000, 100, 'm1', 'user', 1);
    `)

    database._dropDeveloperLegacyTables()
    expect(database._removeLegacySyncedProjects()).toBe(1)
    database._migrateProjectIdentitySchema()
    database._migrateAgentConversationProjectBindings()
    sqlite.exec('CREATE UNIQUE INDEX idx_projects_path_key ON projects(path_key)')

    const projects = sqlite.prepare(`
      SELECT id, path, path_key, encoded_path, project_kind, is_hidden
      FROM projects
      ORDER BY path_key
    `).all()
    const pathKeys = projects.map(row => row.path_key)

    expect(pathKeys).toContain('win32:c:/work/demo')
    expect(pathKeys).toContain('win32:c:/work/a-b')
    expect(pathKeys).toContain('win32:c:/work/a_b')
    expect(projects.filter(row => row.encoded_path === 'C--Work-a-b')).toHaveLength(2)
    expect(projects.find(row => row.path_key === 'win32:c:/work/auto-output').project_kind).toBe('agent-output')
    expect(projects.find(row => row.path_key === 'win32:c:/work/session-app').project_kind).toBe('agent-output')

    const demoConversation = sqlite.prepare(`
      SELECT ac.project_id, ac.cwd, p.path
      FROM agent_conversations ac
      JOIN projects p ON p.id = ac.project_id
      WHERE ac.session_id = 'agent-demo'
    `).get()
    expect(demoConversation.cwd).toBe('C:\\Work\\Demo')
    expect(demoConversation.path).toBe('C:\\Work\\Demo')

    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get()).toBeUndefined()
    expect(sqlite.prepare('SELECT scope, project_id FROM prompts WHERE id = 30').get()).toEqual(
      expect.objectContaining({ scope: 'global', project_id: null })
    )
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM agent_messages').get().count).toBe(1)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(sqlite.prepare('PRAGMA integrity_check').get()['integrity_check']).toBe('ok')

    const beforeSecondRun = {
      projects: sqlite.prepare('SELECT COUNT(*) AS count FROM projects').get().count,
      conversations: sqlite.prepare('SELECT COUNT(*) AS count FROM agent_conversations').get().count,
      bindings: sqlite.prepare('SELECT COUNT(*) AS count FROM agent_conversations WHERE project_id IS NOT NULL').get().count
    }

    database._migrateProjectIdentitySchema()
    database._migrateAgentConversationProjectBindings()

    expect({
      projects: sqlite.prepare('SELECT COUNT(*) AS count FROM projects').get().count,
      conversations: sqlite.prepare('SELECT COUNT(*) AS count FROM agent_conversations').get().count,
      bindings: sqlite.prepare('SELECT COUNT(*) AS count FROM agent_conversations WHERE project_id IS NOT NULL').get().count
    }).toEqual(beforeSecondRun)
  })
})

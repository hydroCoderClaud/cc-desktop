import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const { DatabaseSync } = requireCjs('node:sqlite')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/tmp/cc-desktop-test')
  }
}))

describe('legacy hidden workspace recovery', () => {
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
        path_key TEXT NOT NULL UNIQUE,
        encoded_path TEXT NOT NULL,
        project_kind TEXT NOT NULL,
        name TEXT NOT NULL,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        last_opened_at INTEGER
      );
      CREATE TABLE agent_conversations (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        cwd TEXT,
        cwd_auto INTEGER DEFAULT 1,
        project_id INTEGER,
        session_app_id TEXT,
        type TEXT DEFAULT 'chat',
        client_type TEXT DEFAULT 'host',
        owner_client_id TEXT DEFAULT 'host-ui',
        source TEXT DEFAULT 'manual',
        im_channel TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
      );
    `)

    database = new SessionDatabase()
    database.db = sqlite
  })

  afterEach(() => {
    sqlite?.close()
  })

  it('restores only a high-confidence batch and is idempotent', () => {
    const legacyTimestamp = 1700000000000
    const singleWorkspaceTimestamp = 1700000001000
    sqlite.exec(`
      INSERT INTO projects (
        id, path, path_key, encoded_path, project_kind, name, is_hidden, created_at, updated_at, last_opened_at
      ) VALUES
        (1, 'C:\\workspace\\one', 'win32:c:/workspace/one', 'C--workspace-one', 'workspace', 'One', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (2, 'C:\\workspace\\two', 'win32:c:/workspace/two', 'C--workspace-two', 'workspace', 'Two', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (3, 'C:\\tmp\\cc-desktop-test\\embedded-apps\\hydrology\\workspace', 'win32:c:/embedded/workspace', 'C--embedded-workspace', 'workspace', 'Embedded', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (4, 'C:\\workspace\\manual-hidden', 'win32:c:/workspace/manual-hidden', 'C--manual-hidden', 'workspace', 'Manual Hidden', 1, 1600000000000, 1600000005000, NULL),
        (5, 'C:\\workspace\\session-app', 'win32:c:/workspace/session-app', 'C--session-app', 'workspace', 'Session App', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (6, 'C:\\workspace\\single', 'win32:c:/workspace/single', 'C--workspace-single', 'workspace', 'Single', 1, ${singleWorkspaceTimestamp}, ${singleWorkspaceTimestamp}, NULL),
        (7, 'C:\\workspace\\notebook-like', 'win32:c:/workspace/notebook-like', 'C--workspace-notebook-like', 'workspace', 'Notebook-like', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (8, 'C:\\workspace\\embedded-client', 'win32:c:/workspace/embedded-client', 'C--workspace-embedded-client', 'workspace', 'Embedded Client', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (9, 'C:\\workspace\\mismatched-cwd', 'win32:c:/workspace/mismatched-cwd', 'C--workspace-mismatched-cwd', 'workspace', 'Mismatched Cwd', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (10, 'C:\\workspace\\im-source', 'win32:c:/workspace/im-source', 'C--workspace-im-source', 'workspace', 'IM Source', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL);
      INSERT INTO agent_conversations (id, session_id, cwd, cwd_auto, project_id, session_app_id, type, client_type, owner_client_id, source, im_channel) VALUES
        (1, 'one', 'C:\\workspace\\one', 0, 1, NULL, 'chat', 'host', 'host-ui', 'manual', NULL),
        (2, 'two', 'C:\\workspace\\two', 0, 2, NULL, 'chat', 'host', 'host-ui', 'manual', NULL),
        (3, 'embedded', 'C:\\tmp\\cc-desktop-test\\embedded-apps\\hydrology\\workspace', 0, 3, NULL, 'chat', 'embedded', 'embed:hydrology', 'manual', NULL),
        (4, 'manual-hidden', 'C:\\workspace\\manual-hidden', 0, 4, NULL, 'chat', 'host', 'host-ui', 'manual', NULL),
        (5, 'session-app', 'C:\\workspace\\session-app', 0, 5, 'app-1', 'chat', 'host', 'host-ui', 'manual', NULL),
        (6, 'single', 'C:\\workspace\\single', 0, 6, NULL, 'chat', 'host', 'host-ui', 'manual', NULL),
        (7, 'notebook-like', 'C:\\workspace\\notebook-like', 0, 7, NULL, 'notebook', 'host', 'host-ui', 'manual', NULL),
        (8, 'embedded-client', 'C:\\workspace\\embedded-client', 0, 8, NULL, 'chat', 'embedded', 'embed:hydrology', 'manual', NULL),
        (9, 'mismatched-cwd', 'C:\\workspace\\different', 0, 9, NULL, 'chat', 'host', 'host-ui', 'manual', NULL),
        (10, 'im-source', 'C:\\workspace\\im-source', 0, 10, NULL, 'chat', 'host', 'host-ui', 'im-inbound', 'feishu');
    `)

    expect(database._recoverLegacyHiddenWorkspaceProjects()).toBe(2)

    const rowsAfterFirstRun = sqlite.prepare(`
      SELECT id, is_hidden, updated_at
      FROM projects
      ORDER BY id
    `).all()
    expect(rowsAfterFirstRun.map(row => ({ id: row.id, is_hidden: row.is_hidden }))).toEqual([
      { id: 1, is_hidden: 0 },
      { id: 2, is_hidden: 0 },
      { id: 3, is_hidden: 1 },
      { id: 4, is_hidden: 1 },
      { id: 5, is_hidden: 1 },
      { id: 6, is_hidden: 1 },
      { id: 7, is_hidden: 1 },
      { id: 8, is_hidden: 1 },
      { id: 9, is_hidden: 1 },
      { id: 10, is_hidden: 1 }
    ])
    expect(rowsAfterFirstRun[0].updated_at).not.toBe(legacyTimestamp)
    expect(rowsAfterFirstRun[1].updated_at).toBe(rowsAfterFirstRun[0].updated_at)
    expect(sqlite.prepare(`
      SELECT id, path, project_kind
      FROM projects
      WHERE id IN (1, 2)
      ORDER BY id
    `).all()).toEqual([
      { id: 1, path: 'C:\\workspace\\one', project_kind: 'workspace' },
      { id: 2, path: 'C:\\workspace\\two', project_kind: 'workspace' }
    ])
    expect(sqlite.prepare(`
      SELECT project_id, cwd
      FROM agent_conversations
      WHERE id IN (1, 2)
      ORDER BY id
    `).all()).toEqual([
      { project_id: 1, cwd: 'C:\\workspace\\one' },
      { project_id: 2, cwd: 'C:\\workspace\\two' }
    ])

    expect(database._recoverLegacyHiddenWorkspaceProjects()).toBe(0)
    expect(sqlite.prepare('SELECT id, is_hidden, updated_at FROM projects ORDER BY id').all()).toEqual(rowsAfterFirstRun)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(sqlite.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok')
  })

  it('does not use an embedded session to reach the recovery batch threshold', () => {
    const legacyTimestamp = 1700000000000
    sqlite.exec(`
      INSERT INTO projects (
        id, path, path_key, encoded_path, project_kind, name, is_hidden, created_at, updated_at, last_opened_at
      ) VALUES
        (1, 'C:\\workspace\\ordinary', 'win32:c:/workspace/ordinary', 'C--workspace-ordinary', 'workspace', 'Ordinary', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (2, 'C:\\tmp\\cc-desktop-test\\embedded-apps\\hydrology\\workspace', 'win32:c:/embedded/workspace', 'C--embedded-workspace', 'workspace', 'Embedded', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL);
      INSERT INTO agent_conversations (id, session_id, cwd, cwd_auto, project_id, session_app_id, type, client_type, owner_client_id, source, im_channel) VALUES
        (1, 'ordinary', 'C:\\workspace\\ordinary', 0, 1, NULL, 'chat', 'host', 'host-ui', 'manual', NULL),
        (2, 'embedded', 'C:\\tmp\\cc-desktop-test\\embedded-apps\\hydrology\\workspace', 0, 2, NULL, 'chat', 'embedded', 'embed:hydrology', 'manual', NULL);
    `)

    expect(database._recoverLegacyHiddenWorkspaceProjects()).toBe(0)
    expect(sqlite.prepare('SELECT id, is_hidden FROM projects ORDER BY id').all()).toEqual([
      { id: 1, is_hidden: 1 },
      { id: 2, is_hidden: 1 }
    ])
  })

  it('does not treat an ordinary workspace as embedded because its path contains embedded-apps', () => {
    const legacyTimestamp = 1700000000000
    sqlite.exec(`
      INSERT INTO projects (
        id, path, path_key, encoded_path, project_kind, name, is_hidden, created_at, updated_at, last_opened_at
      ) VALUES
        (1, 'C:\\workspace\\embedded-apps\\reference', 'win32:c:/workspace/embedded-apps/reference', 'C--workspace-embedded-apps-reference', 'workspace', 'Reference', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (2, 'C:\\workspace\\ordinary', 'win32:c:/workspace/ordinary', 'C--workspace-ordinary', 'workspace', 'Ordinary', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL);
      INSERT INTO agent_conversations (id, session_id, cwd, cwd_auto, project_id, session_app_id, type, client_type, owner_client_id, source, im_channel) VALUES
        (1, 'reference', 'C:\\workspace\\embedded-apps\\reference', 0, 1, NULL, 'chat', 'host', 'host-ui', 'manual', NULL),
        (2, 'ordinary', 'C:\\workspace\\ordinary', 0, 2, NULL, 'chat', 'host', 'host-ui', 'manual', NULL);
    `)

    expect(database._recoverLegacyHiddenWorkspaceProjects()).toBe(2)
    expect(sqlite.prepare('SELECT id, is_hidden FROM projects ORDER BY id').all()).toEqual([
      { id: 1, is_hidden: 0 },
      { id: 2, is_hidden: 0 }
    ])
  })

  it('runs the recovery from the startup migration sequence', () => {
    sqlite.close()
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON')
    database.db = sqlite
    database.createTables()

    const legacyTimestamp = 1700000000000
    sqlite.exec(`
      INSERT INTO projects (
        id, path, path_key, encoded_path, project_kind, name, is_hidden, created_at, updated_at, last_opened_at
      ) VALUES
        (1, 'C:\\workspace\\startup-one', 'win32:c:/workspace/startup-one', 'C--workspace-startup-one', 'workspace', 'Startup One', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL),
        (2, 'C:\\workspace\\startup-two', 'win32:c:/workspace/startup-two', 'C--workspace-startup-two', 'workspace', 'Startup Two', 1, ${legacyTimestamp}, ${legacyTimestamp}, NULL);
      INSERT INTO agent_conversations (
        id, session_id, cwd, cwd_auto, project_id, session_app_id, type, client_type
      ) VALUES
        (1, 'startup-one', 'C:\\workspace\\startup-one', 0, 1, NULL, 'chat', 'host'),
        (2, 'startup-two', 'C:\\workspace\\startup-two', 0, 2, NULL, 'chat', 'host');
    `)

    database.runMigrations()

    expect(sqlite.prepare('SELECT id, is_hidden FROM projects ORDER BY id').all()).toEqual([
      { id: 1, is_hidden: 0 },
      { id: 2, is_hidden: 0 }
    ])

    expect(sqlite.prepare('SELECT key FROM app_migration_state').all()).toEqual([
      { key: 'project-cwd-unification-v1' }
    ])

    // User changes made after the one-time upgrade must not be rewritten by
    // later startups, even when the historical heuristic still matches.
    sqlite.exec(`
      UPDATE projects
      SET is_hidden = 1, name = 'Chat', updated_at = created_at
      WHERE id = 1
    `)
    database.runMigrations()

    expect(sqlite.prepare('SELECT is_hidden, name FROM projects WHERE id = 1').get()).toEqual({
      is_hidden: 1,
      name: 'Chat'
    })
  })
})

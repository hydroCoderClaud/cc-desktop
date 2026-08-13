import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { buildRelocationPreview, migrateClaudeData } = require('../../src/main/utils/project-relocation')
const { encodePath } = require('../../src/main/utils/path-utils')
const { DatabaseSync } = require('node:sqlite')
const { SessionDatabase } = require('../../src/main/session-database')

const tempRoots = []

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-desktop-relocation-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

describe('project relocation', () => {
  it('keeps the project id and bound conversation cwd when relocating', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)

    const database = new SessionDatabase()
    database.db = new DatabaseSync(':memory:')
    database.db.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL,
        path_key TEXT UNIQUE NOT NULL,
        encoded_path TEXT NOT NULL,
        project_kind TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '',
        color TEXT DEFAULT '',
        api_profile_id TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        last_opened_at INTEGER
      );
      CREATE TABLE agent_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        cwd TEXT,
        project_id INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE scheduled_tasks (
        id INTEGER PRIMARY KEY,
        cwd TEXT,
        updated_at INTEGER
      );
    `)
    const project = database.createProject({ path: oldPath, name: 'Old' })
    database.db.prepare('INSERT INTO agent_conversations (session_id, cwd, project_id) VALUES (?, ?, ?)').run('bound-1', oldPath, project.id)
    database.db.prepare('INSERT INTO agent_conversations (session_id, cwd, project_id) VALUES (?, ?, ?)').run('legacy-1', oldPath, null)
    database.db.prepare('INSERT INTO scheduled_tasks (id, cwd) VALUES (?, ?)').run(1, oldPath)
    database.db.prepare('INSERT INTO scheduled_tasks (id, cwd) VALUES (?, ?)').run(2, path.join(oldPath, 'nested'))
    database.db.prepare('INSERT INTO scheduled_tasks (id, cwd) VALUES (?, ?)').run(3, path.join(root, 'other'))

    const relocated = database.relocateProject(project.id, newPath)

    expect(relocated.id).toBe(project.id)
    expect(relocated.path).toBe(newPath)
    expect(database.getAgentConversation('bound-1').cwd).toBe(newPath)
    expect(database.getAgentConversation('legacy-1').cwd).toBe(oldPath)
    expect(database.db.prepare('SELECT cwd FROM scheduled_tasks WHERE id = 1').get().cwd).toBe(newPath)
    expect(database.db.prepare('SELECT cwd FROM scheduled_tasks WHERE id = 2').get().cwd).toBe(path.join(newPath, 'nested'))
    expect(database.db.prepare('SELECT cwd FROM scheduled_tasks WHERE id = 3').get().cwd).toBe(path.join(root, 'other'))
    database.db.close()
  })

  it('reports active sessions and file conflicts before execution', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const projectsRoot = path.join(claudeRoot, 'projects')
    const oldClaudeDir = path.join(projectsRoot, encodePath(oldPath))
    const newClaudeDir = path.join(projectsRoot, encodePath(newPath))
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.mkdirSync(newClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'session.jsonl'), 'old')
    fs.writeFileSync(path.join(newClaudeDir, 'session.jsonl'), 'different')

    const database = {
      getProjectByPath: () => null,
      listAllAgentConversations: () => [{ project_id: 9 }]
    }
    const preview = buildRelocationPreview({
      project: { id: 9, path: oldPath, encoded_path: encodePath(oldPath), project_kind: 'workspace' },
      newPath,
      sessionDatabase: database,
      agentSessionManager: { sessions: new Map([['s1', { projectId: 9, queryGenerator: {} }]]) },
      configManager: { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) }
    })

    expect(preview.activeSessionIds).toEqual(['s1'])
    expect(preview.conflicts).toContain('session.jsonl')
    expect(preview.canExecute).toBe(false)
  })

  it('copies Claude history and rewrites its index without deleting the source', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const oldClaudeDir = path.join(claudeRoot, 'old')
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'session.jsonl'), 'history')
    fs.writeFileSync(path.join(oldClaudeDir, 'sessions-index.json'), JSON.stringify({
      version: 1,
      entries: [{
        sessionId: 's1',
        fullPath: path.join(oldClaudeDir, 'session.jsonl'),
        projectPath: oldPath,
        firstPrompt: `keep this text mentioning ${oldPath}`
      }],
      originalPath: oldPath
    }))

    const preview = {
      oldPath,
      newPath,
      oldClaudeDir,
      newClaudeDir: path.join(claudeRoot, 'new'),
      conflicts: [],
      mcpConflict: false
    }
    const result = migrateClaudeData(preview, { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) })
    const index = JSON.parse(fs.readFileSync(path.join(preview.newClaudeDir, 'sessions-index.json'), 'utf8'))

    expect(result.copied).toBe(true)
    expect(fs.readFileSync(path.join(preview.newClaudeDir, 'session.jsonl'), 'utf8')).toBe('history')
    expect(index.entries[0].fullPath).toContain(path.join(claudeRoot, 'new'))
    expect(index.entries[0].projectPath).toBe(newPath)
    expect(index.originalPath).toBe(newPath)
    expect(index.entries[0].firstPrompt).toContain(oldPath)
    expect(fs.existsSync(oldClaudeDir)).toBe(true)
  })

  it('rejects a corrupted sessions index during preview', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const oldClaudeDir = path.join(claudeRoot, 'projects', encodePath(oldPath))
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'sessions-index.json'), '{broken')

    expect(() => buildRelocationPreview({
      project: { id: 9, path: oldPath, encoded_path: encodePath(oldPath), project_kind: 'workspace' },
      newPath,
      sessionDatabase: { getProjectByPath: () => null, listAllAgentConversations: () => [] },
      agentSessionManager: { sessions: new Map() },
      configManager: { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) }
    })).toThrow('Invalid JSON file')
  })

  it('uses the resolved physical path for macOS symlink relocation previews', () => {
    const root = makeTempRoot()
    const physicalOld = path.join(root, 'physical-old')
    const symlinkOld = path.join(root, 'linked-old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(physicalOld)
    fs.mkdirSync(newPath)
    try {
      fs.symlinkSync(physicalOld, symlinkOld, 'dir')
    } catch {
      return
    }

    const preview = buildRelocationPreview({
      project: { id: 9, path: symlinkOld, encoded_path: encodePath(symlinkOld), project_kind: 'workspace' },
      newPath,
      sessionDatabase: { getProjectByPath: () => null, listAllAgentConversations: () => [] },
      agentSessionManager: { sessions: new Map() },
      configManager: { getConfig: () => ({ settings: { agent: { claudeConfigDir: path.join(root, 'agent') } } }) }
    })

    expect(preview.oldPath).toBe(fs.realpathSync.native(symlinkOld))
  })

  it('does not rewrite path fields when the old path is only a string prefix', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'app')
    const newPath = path.join(root, 'app2')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const oldClaudeDir = path.join(claudeRoot, 'projects', encodePath(oldPath))
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'sessions-index.json'), JSON.stringify({
      version: 1,
      entries: [{ sessionId: 's1', projectPath: path.join(root, 'app2-files') }]
    }))
    const preview = {
      oldPath,
      newPath,
      oldClaudeDir,
      newClaudeDir: path.join(claudeRoot, 'projects', encodePath(newPath)),
      conflicts: [],
      mcpConflict: false
    }
    migrateClaudeData(preview, { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) })
    const index = JSON.parse(fs.readFileSync(path.join(preview.newClaudeDir, 'sessions-index.json'), 'utf8'))
    expect(index.entries[0].projectPath).toBe(path.join(root, 'app2-files'))
  })

  it('removes a copied index when the database update fails', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const oldClaudeDir = path.join(claudeRoot, 'projects', encodePath(oldPath))
    const newClaudeDir = path.join(claudeRoot, 'projects', encodePath(newPath))
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'sessions-index.json'), JSON.stringify({ version: 1, entries: [] }))
    const preview = { oldPath, newPath, oldClaudeDir, newClaudeDir, conflicts: [], mcpConflict: false }
    const state = migrateClaudeData(preview, { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) })
    state.rollback()
    expect(fs.existsSync(path.join(newClaudeDir, 'sessions-index.json'))).toBe(false)
  })

  it('cleans index and config temporary files when migration fails', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const oldClaudeDir = path.join(claudeRoot, 'projects', encodePath(oldPath))
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'session.jsonl'), 'history')
    fs.writeFileSync(path.join(oldClaudeDir, 'sessions-index.json'), JSON.stringify({
      version: 1,
      entries: [{ sessionId: 's1', fullPath: path.join(oldClaudeDir, 'session.jsonl') }]
    }))
    fs.mkdirSync(path.join(claudeRoot, '.claude.json.tmp'), { recursive: true })
    fs.writeFileSync(path.join(claudeRoot, '.claude.json'), JSON.stringify({
      projects: { [oldPath.replace(/\\/g, '/')]: { setting: true } }
    }))

    const preview = {
      oldPath,
      newPath,
      oldClaudeDir,
      newClaudeDir: path.join(claudeRoot, encodePath(newPath)),
      conflicts: [],
      mcpConflict: false
    }
    expect(() => migrateClaudeData(preview, {
      getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } })
    })).toThrow()
    expect(fs.existsSync(path.join(preview.newClaudeDir, 'sessions-index.json.tmp'))).toBe(false)
    expect(fs.existsSync(path.join(claudeRoot, '.claude.json.tmp'))).toBe(false)
  })


  it('blocks an existing target history directory when the old history is missing', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const newClaudeDir = path.join(claudeRoot, 'projects', encodePath(newPath))
    fs.mkdirSync(newClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(newClaudeDir, 'orphan.jsonl'), 'orphan')

    const preview = buildRelocationPreview({
      project: { id: 9, path: oldPath, encoded_path: encodePath(oldPath), project_kind: 'workspace' },
      newPath,
      sessionDatabase: {
        getProjectByPath: () => null,
        listAllAgentConversations: () => []
      },
      agentSessionManager: { sessions: new Map() },
      configManager: { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) }
    })

    expect(preview.canExecute).toBe(false)
    expect(preview.conflicts).toContain('target contains existing Claude history')
  })

  it('allows a reverse relocation when history and Local MCP only differ by migrated paths', () => {
    const root = makeTempRoot()
    const dailyPath = path.join(root, 'daily')
    const daily1Path = path.join(root, 'daily1')
    fs.mkdirSync(dailyPath)
    fs.mkdirSync(daily1Path)
    const claudeRoot = path.join(root, 'agent')
    const dailyClaudeDir = path.join(claudeRoot, 'projects', encodePath(dailyPath))
    fs.mkdirSync(dailyClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(dailyClaudeDir, 'session.jsonl'), 'history')
    fs.writeFileSync(path.join(dailyClaudeDir, 'sessions-index.json'), JSON.stringify({
      version: 1,
      entries: [{
        sessionId: 'daily-session',
        fullPath: path.join(dailyClaudeDir, 'session.jsonl'),
        projectPath: dailyPath
      }],
      originalPath: dailyPath
    }))
    fs.writeFileSync(path.join(claudeRoot, '.claude.json'), JSON.stringify({
      projects: {
        [dailyPath.replace(/\\/g, '/')]: {
          mcpServers: { daily: { command: 'node', args: [dailyPath] } }
        }
      }
    }))

    const sessionDatabase = {
      getProjectByPath: () => null,
      listAllAgentConversations: () => []
    }
    const configManager = { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) }
    const forwardPreview = buildRelocationPreview({
      project: { id: 9, path: dailyPath, encoded_path: encodePath(dailyPath), project_kind: 'workspace' },
      newPath: daily1Path,
      sessionDatabase,
      agentSessionManager: { sessions: new Map() },
      configManager
    })
    expect(forwardPreview.canExecute).toBe(true)
    migrateClaudeData(forwardPreview, configManager)

    const reversePreview = buildRelocationPreview({
      project: { id: 9, path: daily1Path, encoded_path: encodePath(daily1Path), project_kind: 'workspace' },
      newPath: dailyPath,
      sessionDatabase,
      agentSessionManager: { sessions: new Map() },
      configManager
    })

    expect(reversePreview.conflicts).toEqual([])
    expect(reversePreview.mcpConflict).toBe(false)
    expect(reversePreview.canExecute).toBe(true)
    expect(() => migrateClaudeData(reversePreview, configManager)).not.toThrow()
  })

  it('blocks reverse relocation when a session index changes outside migrated path fields', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    const oldClaudeDir = path.join(claudeRoot, 'projects', encodePath(oldPath))
    const newClaudeDir = path.join(claudeRoot, 'projects', encodePath(newPath))
    fs.mkdirSync(oldClaudeDir, { recursive: true })
    fs.mkdirSync(newClaudeDir, { recursive: true })
    fs.writeFileSync(path.join(oldClaudeDir, 'sessions-index.json'), JSON.stringify({
      version: 1,
      entries: [{ sessionId: 's1', fullPath: path.join(oldClaudeDir, 'session.jsonl'), title: 'original' }]
    }))
    fs.writeFileSync(path.join(newClaudeDir, 'sessions-index.json'), JSON.stringify({
      version: 1,
      entries: [{ sessionId: 's1', fullPath: path.join(newClaudeDir, 'session.jsonl'), title: 'changed' }]
    }))

    const preview = buildRelocationPreview({
      project: { id: 9, path: newPath, encoded_path: encodePath(newPath), project_kind: 'workspace' },
      newPath: oldPath,
      sessionDatabase: { getProjectByPath: () => null, listAllAgentConversations: () => [] },
      agentSessionManager: { sessions: new Map() },
      configManager: { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) }
    })

    expect(preview.canExecute).toBe(false)
    expect(preview.conflicts).toContain('sessions-index.json')
  })

  it('blocks reverse relocation when Local MCP changes outside migrated path references', () => {
    const root = makeTempRoot()
    const oldPath = path.join(root, 'old')
    const newPath = path.join(root, 'new')
    fs.mkdirSync(oldPath)
    fs.mkdirSync(newPath)
    const claudeRoot = path.join(root, 'agent')
    fs.mkdirSync(path.join(claudeRoot, 'projects', encodePath(oldPath)), { recursive: true })
    fs.mkdirSync(path.join(claudeRoot, 'projects', encodePath(newPath)), { recursive: true })
    fs.writeFileSync(path.join(claudeRoot, '.claude.json'), JSON.stringify({
      projects: {
        [oldPath.replace(/\\/g, '/')]: {
          mcpServers: { local: { command: 'node', args: [oldPath, 'original'] } }
        },
        [newPath.replace(/\\/g, '/')]: {
          mcpServers: { local: { command: 'node', args: [newPath, 'changed'] } }
        }
      }
    }))

    const preview = buildRelocationPreview({
      project: { id: 9, path: oldPath, encoded_path: encodePath(oldPath), project_kind: 'workspace' },
      newPath,
      sessionDatabase: { getProjectByPath: () => null, listAllAgentConversations: () => [] },
      agentSessionManager: { sessions: new Map() },
      configManager: { getConfig: () => ({ settings: { agent: { claudeConfigDir: claudeRoot } } }) }
    })

    expect(preview.mcpConflict).toBe(true)
    expect(preview.canExecute).toBe(false)
  })
})

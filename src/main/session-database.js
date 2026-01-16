/**
 * Session Database Service
 *
 * SQLite database for storing session history with full-text search support
 * Database location: %APPDATA%/claude-code-desktop/sessions.db
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')

class SessionDatabase {
  constructor() {
    this.db = null
    this.dbPath = null
  }

  /**
   * Initialize database connection and create tables
   */
  init() {
    if (this.db) return

    // Get database path
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'sessions.db')

    console.log('[SessionDB] Initializing database at:', this.dbPath)

    // Ensure directory exists
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Open database
    this.db = new Database(this.dbPath)

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON')

    // Create tables
    this.createTables()

    // Run migrations for existing databases
    this.runMigrations()

    console.log('[SessionDB] Database initialized successfully')
  }

  /**
   * Run database migrations for schema updates
   */
  runMigrations() {
    // Get existing columns in projects table
    const columns = this.db.prepare("PRAGMA table_info(projects)").all()
    const columnNames = columns.map(c => c.name)

    // Add new columns if they don't exist
    const newColumns = [
      { name: 'description', type: "TEXT DEFAULT ''" },
      { name: 'icon', type: "TEXT DEFAULT '📁'" },
      { name: 'color', type: "TEXT DEFAULT '#1890ff'" },
      { name: 'api_profile_id', type: 'TEXT' },
      { name: 'is_pinned', type: 'INTEGER DEFAULT 0' },
      { name: 'is_hidden', type: 'INTEGER DEFAULT 0' },
      { name: 'last_opened_at', type: 'INTEGER' },
      { name: 'source', type: "TEXT DEFAULT 'sync'" }  // 'user' = 用户添加, 'sync' = 同步导入
    ]

    for (const col of newColumns) {
      if (!columnNames.includes(col.name)) {
        console.log(`[SessionDB] Adding column: projects.${col.name}`)
        this.db.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.type}`)
      }
    }
  }

  /**
   * Create all tables and indexes
   */
  createTables() {
    // Projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        encoded_path TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📁',
        color TEXT DEFAULT '#1890ff',
        api_profile_id TEXT,
        is_pinned INTEGER DEFAULT 0,
        is_hidden INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        last_opened_at INTEGER
      )
    `)

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        session_uuid TEXT UNIQUE NOT NULL,
        model TEXT,
        started_at INTEGER,
        last_message_at INTEGER,
        message_count INTEGER DEFAULT 0,
        file_mtime INTEGER,
        last_synced_uuid TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        uuid TEXT UNIQUE NOT NULL,
        parent_uuid TEXT,
        role TEXT NOT NULL,
        content TEXT,
        timestamp INTEGER,
        tokens_in INTEGER,
        tokens_out INTEGER,
        is_meta INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // Tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#1890ff',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `)

    // Session-Tags relation table (many-to-many)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_tags (
        session_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        PRIMARY KEY (session_id, tag_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `)

    // Message-Tags relation table (many-to-many)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_tags (
        message_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        PRIMARY KEY (message_id, tag_id),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `)

    // Favorites table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER UNIQUE NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // Create FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='id',
        tokenize='unicode61'
      )
    `)

    // Create triggers to keep FTS index in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
      END
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
      END
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
      END
    `)

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    `)

    console.log('[SessionDB] Tables and indexes created')
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close()
      this.db = null
      console.log('[SessionDB] Database closed')
    }
  }

  // ========================================
  // Project Operations
  // ========================================

  /**
   * Get or create a project (用于同步服务，source='sync')
   */
  getOrCreateProject(projectPath, encodedPath, name) {
    const existing = this.db.prepare(
      'SELECT * FROM projects WHERE path = ?'
    ).get(projectPath)

    if (existing) {
      return existing
    }

    // 同步导入的项目，source='sync'
    const result = this.db.prepare(
      "INSERT INTO projects (path, encoded_path, name, source) VALUES (?, ?, ?, 'sync')"
    ).run(projectPath, encodedPath, name)

    return {
      id: result.lastInsertRowid,
      path: projectPath,
      encoded_path: encodedPath,
      name,
      source: 'sync'
    }
  }

  /**
   * Get all projects (excluding hidden by default)
   * @param {boolean} includeHidden - 是否包含隐藏项目
   * @param {boolean} userOnly - 是否只返回用户添加的项目（主面板用）
   */
  getAllProjects(includeHidden = false, userOnly = true) {
    const conditions = []

    if (!includeHidden) {
      conditions.push("p.is_hidden = 0")
    }

    if (userOnly) {
      conditions.push("p.source = 'user'")
    }

    let sql = `
      SELECT p.*,
             COUNT(DISTINCT s.id) as session_count,
             MAX(s.last_message_at) as last_activity
      FROM projects p
      LEFT JOIN sessions s ON p.id = s.project_id
    `

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    sql += `
      GROUP BY p.id
      ORDER BY p.is_pinned DESC, p.last_opened_at DESC NULLS LAST
    `
    return this.db.prepare(sql).all()
  }

  /**
   * Get hidden projects
   */
  getHiddenProjects() {
    return this.db.prepare(`
      SELECT p.*,
             COUNT(DISTINCT s.id) as session_count
      FROM projects p
      LEFT JOIN sessions s ON p.id = s.project_id
      WHERE p.is_hidden = 1
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all()
  }

  /**
   * Get project by ID
   */
  getProjectById(projectId) {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  }

  /**
   * Get project by path
   */
  getProjectByPath(projectPath) {
    return this.db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath)
  }

  /**
   * Create a new project
   * @param {Object} projectData - 项目数据
   * @param {string} projectData.source - 来源: 'user' (用户添加) 或 'sync' (同步导入)
   */
  createProject(projectData) {
    const {
      path: projectPath,
      name,
      description = '',
      icon = '📁',
      color = '#1890ff',
      api_profile_id = null,
      source = 'user'  // 默认为用户添加
    } = projectData

    // Generate encoded path (base64 of path)
    const encodedPath = Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '_')

    const now = Date.now()
    const result = this.db.prepare(`
      INSERT INTO projects (path, encoded_path, name, description, icon, color, api_profile_id, source, created_at, updated_at, last_opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projectPath, encodedPath, name, description, icon, color, api_profile_id, source, now, now, now)

    return {
      id: result.lastInsertRowid,
      path: projectPath,
      encoded_path: encodedPath,
      name,
      description,
      icon,
      color,
      api_profile_id,
      source,
      is_pinned: 0,
      is_hidden: 0,
      created_at: now,
      updated_at: now,
      last_opened_at: now
    }
  }

  /**
   * Update project
   */
  updateProject(projectId, updates) {
    const allowedFields = ['name', 'description', 'icon', 'color', 'api_profile_id', 'is_pinned', 'is_hidden', 'last_opened_at', 'source']
    const fields = []
    const values = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (fields.length === 0) return null

    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(projectId)

    this.db.prepare(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)

    return this.getProjectById(projectId)
  }

  /**
   * Delete project (and optionally its sessions)
   */
  deleteProject(projectId, deleteSessions = false) {
    if (deleteSessions) {
      // CASCADE will handle sessions and messages
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
    } else {
      // Just remove the project, keep sessions orphaned (they won't show anyway)
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
    }
    return { success: true }
  }

  /**
   * Toggle project pinned status
   */
  toggleProjectPinned(projectId) {
    const project = this.getProjectById(projectId)
    if (!project) return null

    const newStatus = project.is_pinned ? 0 : 1
    this.updateProject(projectId, { is_pinned: newStatus })
    return { ...project, is_pinned: newStatus }
  }

  /**
   * Hide project (remove from panel)
   */
  hideProject(projectId) {
    return this.updateProject(projectId, { is_hidden: 1 })
  }

  /**
   * Unhide project (restore to panel)
   */
  unhideProject(projectId) {
    return this.updateProject(projectId, { is_hidden: 0 })
  }

  /**
   * Update project's last_opened_at timestamp
   */
  touchProject(projectId) {
    const now = Date.now()
    this.db.prepare(
      'UPDATE projects SET last_opened_at = ?, updated_at = ? WHERE id = ?'
    ).run(now, now, projectId)
  }

  /**
   * Duplicate project config
   */
  duplicateProject(projectId, newPath, newName) {
    const source = this.getProjectById(projectId)
    if (!source) return null

    return this.createProject({
      path: newPath,
      name: newName || `${source.name} (副本)`,
      description: source.description,
      icon: source.icon,
      color: source.color,
      api_profile_id: source.api_profile_id
    })
  }

  // ========================================
  // Session Operations
  // ========================================

  /**
   * Get or create a session
   */
  getOrCreateSession(projectId, sessionUuid) {
    const existing = this.db.prepare(
      'SELECT * FROM sessions WHERE session_uuid = ?'
    ).get(sessionUuid)

    if (existing) {
      return existing
    }

    const result = this.db.prepare(
      'INSERT INTO sessions (project_id, session_uuid) VALUES (?, ?)'
    ).run(projectId, sessionUuid)

    return {
      id: result.lastInsertRowid,
      project_id: projectId,
      session_uuid: sessionUuid
    }
  }

  /**
   * Get session by UUID
   */
  getSessionByUuid(sessionUuid) {
    return this.db.prepare(
      'SELECT * FROM sessions WHERE session_uuid = ?'
    ).get(sessionUuid)
  }

  /**
   * Delete session and its messages
   */
  deleteSession(sessionId) {
    // Delete messages first
    this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
    // Delete session tags
    this.db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(sessionId)
    // Delete favorites
    this.db.prepare('DELETE FROM favorites WHERE session_id = ?').run(sessionId)
    // Delete session
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    return { success: true }
  }

  /**
   * Get sessions for a project
   */
  getProjectSessions(projectId) {
    const sessions = this.db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM favorites f WHERE f.session_id = s.id) as is_favorite
      FROM sessions s
      WHERE s.project_id = ?
      ORDER BY s.last_message_at DESC NULLS LAST
    `).all(projectId)

    // Load tags for each session (with full info)
    const getTagsStmt = this.db.prepare(`
      SELECT t.id, t.name, t.color FROM tags t
      JOIN session_tags st ON t.id = st.tag_id
      WHERE st.session_id = ?
    `)

    for (const session of sessions) {
      session.tags = getTagsStmt.all(session.id)
    }

    return sessions
  }

  /**
   * Update session metadata
   */
  updateSession(sessionId, updates) {
    const fields = []
    const values = []

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`)
      values.push(value)
    }

    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(sessionId)

    this.db.prepare(
      `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)
  }

  /**
   * Get first user message for session (for display)
   */
  getSessionFirstMessage(sessionId) {
    return this.db.prepare(`
      SELECT content FROM messages
      WHERE session_id = ? AND role = 'user' AND is_meta = 0 AND content != ''
      ORDER BY timestamp ASC
      LIMIT 1
    `).get(sessionId)
  }

  // ========================================
  // Message Operations
  // ========================================

  /**
   * Check if message exists
   */
  messageExists(uuid) {
    const result = this.db.prepare(
      'SELECT 1 FROM messages WHERE uuid = ?'
    ).get(uuid)
    return !!result
  }

  /**
   * Insert a message
   */
  insertMessage(message) {
    return this.db.prepare(`
      INSERT INTO messages (session_id, uuid, parent_uuid, role, content, timestamp, tokens_in, tokens_out, is_meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.session_id,
      message.uuid,
      message.parent_uuid || null,
      message.role,
      message.content || '',
      message.timestamp || null,
      message.tokens_in || null,
      message.tokens_out || null,
      message.is_meta ? 1 : 0
    )
  }

  /**
   * Batch insert messages (within transaction)
   */
  insertMessages(messages) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO messages (session_id, uuid, parent_uuid, role, content, timestamp, tokens_in, tokens_out, is_meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = this.db.transaction((msgs) => {
      for (const msg of msgs) {
        insert.run(
          msg.session_id,
          msg.uuid,
          msg.parent_uuid || null,
          msg.role,
          msg.content || '',
          msg.timestamp || null,
          msg.tokens_in || null,
          msg.tokens_out || null,
          msg.is_meta ? 1 : 0
        )
      }
    })

    insertMany(messages)
  }

  /**
   * Get messages for a session
   */
  getSessionMessages(sessionId, options = {}) {
    const { limit = 1000, offset = 0, role = null } = options

    let sql = `
      SELECT * FROM messages
      WHERE session_id = ? AND is_meta = 0
    `
    const params = [sessionId]

    if (role) {
      sql += ' AND role = ?'
      params.push(role)
    }

    sql += ' ORDER BY timestamp ASC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    return this.db.prepare(sql).all(...params)
  }

  /**
   * Get message count for session
   */
  getSessionMessageCount(sessionId) {
    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND is_meta = 0'
    ).get(sessionId)
    return result?.count || 0
  }

  // ========================================
  // Search Operations
  // ========================================

  /**
   * Full-text search across messages
   */
  searchMessages(query, options = {}) {
    const { projectId = null, sessionId = null, limit = 100 } = options

    let sql = `
      SELECT m.*, s.session_uuid, p.name as project_name, p.path as project_path,
             snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
      FROM messages m
      JOIN messages_fts fts ON m.id = fts.rowid
      JOIN sessions s ON m.session_id = s.id
      JOIN projects p ON s.project_id = p.id
      WHERE messages_fts MATCH ?
    `
    const params = [query]

    if (projectId) {
      sql += ' AND p.id = ?'
      params.push(projectId)
    }

    if (sessionId) {
      sql += ' AND s.id = ?'
      params.push(sessionId)
    }

    sql += ' ORDER BY rank LIMIT ?'
    params.push(limit)

    return this.db.prepare(sql).all(...params)
  }

  // ========================================
  // Tag Operations
  // ========================================

  /**
   * Create a tag
   */
  createTag(name, color = '#1890ff') {
    const result = this.db.prepare(
      'INSERT INTO tags (name, color) VALUES (?, ?)'
    ).run(name, color)
    return { id: result.lastInsertRowid, name, color }
  }

  /**
   * Get all tags with usage counts
   */
  getAllTags() {
    return this.db.prepare(`
      SELECT t.*,
             (SELECT COUNT(*) FROM session_tags st WHERE st.tag_id = t.id) as session_count,
             (SELECT COUNT(*) FROM message_tags mt WHERE mt.tag_id = t.id) as message_count
      FROM tags t
      ORDER BY (session_count + message_count) DESC
    `).all()
  }

  /**
   * Delete a tag
   */
  deleteTag(tagId) {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId)
  }

  /**
   * Add tag to session
   */
  addTagToSession(sessionId, tagId) {
    this.db.prepare(
      'INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)'
    ).run(sessionId, tagId)
  }

  /**
   * Remove tag from session
   */
  removeTagFromSession(sessionId, tagId) {
    this.db.prepare(
      'DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?'
    ).run(sessionId, tagId)
  }

  /**
   * Get tags for a session
   */
  getSessionTags(sessionId) {
    return this.db.prepare(`
      SELECT t.* FROM tags t
      JOIN session_tags st ON t.id = st.tag_id
      WHERE st.session_id = ?
    `).all(sessionId)
  }

  /**
   * Get sessions by tag
   */
  getSessionsByTag(tagId) {
    return this.db.prepare(`
      SELECT s.*, p.name as project_name, p.path as project_path
      FROM sessions s
      JOIN session_tags st ON s.id = st.session_id
      JOIN projects p ON s.project_id = p.id
      WHERE st.tag_id = ?
      ORDER BY s.last_message_at DESC
    `).all(tagId)
  }

  // ========================================
  // Message Tag Operations
  // ========================================

  /**
   * Add tag to message
   */
  addTagToMessage(messageId, tagId) {
    this.db.prepare(
      'INSERT OR IGNORE INTO message_tags (message_id, tag_id) VALUES (?, ?)'
    ).run(messageId, tagId)
  }

  /**
   * Remove tag from message
   */
  removeTagFromMessage(messageId, tagId) {
    this.db.prepare(
      'DELETE FROM message_tags WHERE message_id = ? AND tag_id = ?'
    ).run(messageId, tagId)
  }

  /**
   * Get tags for a message
   */
  getMessageTags(messageId) {
    return this.db.prepare(`
      SELECT t.* FROM tags t
      JOIN message_tags mt ON t.id = mt.tag_id
      WHERE mt.message_id = ?
    `).all(messageId)
  }

  /**
   * Get messages by tag
   */
  getMessagesByTag(tagId) {
    return this.db.prepare(`
      SELECT m.*, s.session_uuid, s.id as session_id, p.name as project_name, p.path as project_path
      FROM messages m
      JOIN message_tags mt ON m.id = mt.message_id
      JOIN sessions s ON m.session_id = s.id
      JOIN projects p ON s.project_id = p.id
      WHERE mt.tag_id = ?
      ORDER BY m.timestamp DESC
    `).all(tagId)
  }

  /**
   * Get all tagged messages for a session
   */
  getSessionTaggedMessages(sessionId) {
    return this.db.prepare(`
      SELECT mt.message_id, t.id as tag_id, t.name as tag_name, t.color as tag_color
      FROM message_tags mt
      JOIN tags t ON mt.tag_id = t.id
      JOIN messages m ON mt.message_id = m.id
      WHERE m.session_id = ?
    `).all(sessionId)
  }

  // ========================================
  // Favorite Operations
  // ========================================

  /**
   * Add session to favorites
   */
  addFavorite(sessionId, note = '') {
    this.db.prepare(
      'INSERT OR REPLACE INTO favorites (session_id, note) VALUES (?, ?)'
    ).run(sessionId, note)
  }

  /**
   * Remove session from favorites
   */
  removeFavorite(sessionId) {
    this.db.prepare('DELETE FROM favorites WHERE session_id = ?').run(sessionId)
  }

  /**
   * Check if session is favorite
   */
  isFavorite(sessionId) {
    const result = this.db.prepare(
      'SELECT 1 FROM favorites WHERE session_id = ?'
    ).get(sessionId)
    return !!result
  }

  /**
   * Get all favorites
   */
  getAllFavorites() {
    return this.db.prepare(`
      SELECT f.*, s.session_uuid, s.model, s.started_at, s.last_message_at, s.message_count,
             p.name as project_name, p.path as project_path
      FROM favorites f
      JOIN sessions s ON f.session_id = s.id
      JOIN projects p ON s.project_id = p.id
      ORDER BY f.created_at DESC
    `).all()
  }

  /**
   * Update favorite note
   */
  updateFavoriteNote(sessionId, note) {
    this.db.prepare(
      'UPDATE favorites SET note = ? WHERE session_id = ?'
    ).run(note, sessionId)
  }

  // ========================================
  // Statistics
  // ========================================

  /**
   * Get database statistics
   */
  getStats() {
    const projectCount = this.db.prepare('SELECT COUNT(*) as count FROM projects').get()
    const sessionCount = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get()
    const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get()
    const favoriteCount = this.db.prepare('SELECT COUNT(*) as count FROM favorites').get()
    const tagCount = this.db.prepare('SELECT COUNT(*) as count FROM tags').get()

    return {
      projects: projectCount?.count || 0,
      sessions: sessionCount?.count || 0,
      messages: messageCount?.count || 0,
      favorites: favoriteCount?.count || 0,
      tags: tagCount?.count || 0
    }
  }
}

module.exports = { SessionDatabase }

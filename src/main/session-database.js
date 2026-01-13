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

    console.log('[SessionDB] Database initialized successfully')
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
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
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
   * Get or create a project
   */
  getOrCreateProject(projectPath, encodedPath, name) {
    const existing = this.db.prepare(
      'SELECT * FROM projects WHERE path = ?'
    ).get(projectPath)

    if (existing) {
      return existing
    }

    const result = this.db.prepare(
      'INSERT INTO projects (path, encoded_path, name) VALUES (?, ?, ?)'
    ).run(projectPath, encodedPath, name)

    return {
      id: result.lastInsertRowid,
      path: projectPath,
      encoded_path: encodedPath,
      name
    }
  }

  /**
   * Get all projects
   */
  getAllProjects() {
    return this.db.prepare(`
      SELECT p.*,
             COUNT(DISTINCT s.id) as session_count,
             MAX(s.last_message_at) as last_activity
      FROM projects p
      LEFT JOIN sessions s ON p.id = s.project_id
      GROUP BY p.id
      ORDER BY last_activity DESC NULLS LAST
    `).all()
  }

  /**
   * Update project's updated_at timestamp
   */
  touchProject(projectId) {
    this.db.prepare(
      'UPDATE projects SET updated_at = ? WHERE id = ?'
    ).run(Date.now(), projectId)
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
   * Get sessions for a project
   */
  getProjectSessions(projectId) {
    return this.db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM favorites f WHERE f.session_id = s.id) as is_favorite,
             (SELECT GROUP_CONCAT(t.name) FROM session_tags st
              JOIN tags t ON st.tag_id = t.id
              WHERE st.session_id = s.id) as tag_names
      FROM sessions s
      WHERE s.project_id = ?
      ORDER BY s.last_message_at DESC NULLS LAST
    `).all(projectId)
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
      SELECT m.id, GROUP_CONCAT(t.id) as tag_ids, GROUP_CONCAT(t.name) as tag_names, GROUP_CONCAT(t.color) as tag_colors
      FROM messages m
      JOIN message_tags mt ON m.id = mt.message_id
      JOIN tags t ON mt.tag_id = t.id
      WHERE m.session_id = ?
      GROUP BY m.id
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

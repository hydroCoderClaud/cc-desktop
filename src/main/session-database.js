/**
 * Session Database Service
 *
 * SQLite database for storing session history with full-text search support
 * Database location: %APPDATA%/claude-code-desktop/sessions.db
 *
 * 使用 Mixin 模式组织代码，各模块功能：
 * - project-db.js: 项目操作
 * - session-db.js: 会话操作
 * - message-db.js: 消息操作
 * - tag-db.js: 标签操作（会话标签和消息标签）
 * - favorite-db.js: 收藏操作
 * - prompt-db.js: 提示词操作
 */

const path = require('path')
const fs = require('fs')
const { app } = require('electron')

// 导入所有 mixin
const {
  withProjectOperations,
  withSessionOperations,
  withMessageOperations,
  withTagOperations,
  withFavoriteOperations,
  withPromptOperations,
  withQueueOperations,
  withAgentOperations,
  withPromptMarketOperations,
  withScheduledTaskOperations
} = require('./database')

// 延迟加载 better-sqlite3，允许测试时注入 mock
let DefaultDatabase = null
function getDefaultDatabase() {
  if (!DefaultDatabase) {
    DefaultDatabase = require('better-sqlite3')
  }
  return DefaultDatabase
}

/**
 * 基础数据库类
 * 只包含初始化、表创建和统计方法
 */
class SessionDatabaseBase {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.userDataPath - Custom user data path (for testing)
   * @param {Function} options.Database - Custom Database constructor (for testing)
   */
  constructor(options = {}) {
    this.db = null
    this.dbPath = null
    this._userDataPath = options.userDataPath || null
    this._Database = options.Database || null  // 允许注入 mock Database
  }

  /**
   * Initialize database connection and create tables
   */
  init() {
    if (this.db) return

    // Get database path (use injected path for testing, or app.getPath for production)
    const userDataPath = this._userDataPath || app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'sessions.db')

    console.log('[SessionDB] Initializing database at:', this.dbPath)

    // Ensure directory exists
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Open database (use injected Database or default)
    const Database = this._Database || getDefaultDatabase()
    this.db = new Database(this.dbPath)

    // Set busy timeout to wait for locks (5 seconds)
    this.db.pragma('busy_timeout = 5000')

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON')

    // Create tables
    this.createTables()

    // Run migrations for existing databases
    this.runMigrations()

    // Create indexes after migrations so legacy databases have required columns first
    this.createIndexes()

    // 注入初始默认数据
    this._seedDefaultData()

    console.log('[SessionDB] Database initialized successfully')
  }

  /**
   * 注入初始系统数据（如 Notebook 专用 Prompt 模板）
   */
  _seedDefaultData() {
    try {
      // 检查并注入笔记总结模板
      const notebookId = 'sys-notebook-notes'
      const existing = this.db.prepare(
        'SELECT id FROM market_installed_prompts WHERE market_id = ?'
      ).get(notebookId)

      if (!existing) {
        console.log('[SessionDB] Seeding default notebook prompt:', notebookId)
        const now = Date.now()
        // 1. 插入 prompts 表
        const res = this.db.prepare(`
          INSERT INTO prompts (name, content, scope, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run('笔记总结模板', `# 角色设定
你是一个顶级知识管理专家和高效笔记官。

# 上下文资料 (Sources)
{{sources}}

# 任务目标
请基于上述资料，完成一份结构严谨的【笔记总结】。
请确保最终内容保存到路径：\`{{expected_path}}\`。`, 'notebook', now, now)

        const promptId = res.lastInsertRowid

        // 2. 插入 market 关联表
        this.db.prepare(`
          INSERT INTO market_installed_prompts (market_id, local_prompt_id, registry_url, version, installed_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(notebookId, promptId, 'system-builtin', '1.0.0', now)
      }
    } catch (err) {
      console.warn('[SessionDB] Seed default data failed:', err.message)
    }
  }

  /**
   * Run database migrations for schema updates
   */
  runMigrations() {
    // Get existing columns in projects table
    const projectColumns = this.db.prepare("PRAGMA table_info(projects)").all()
    const projectColumnNames = projectColumns.map(c => c.name)

    // Add new columns if they don't exist
    const projectNewColumns = [
      { name: 'description', type: "TEXT DEFAULT ''" },
      { name: 'icon', type: "TEXT DEFAULT '📁'" },
      { name: 'color', type: "TEXT DEFAULT '#1890ff'" },
      { name: 'api_profile_id', type: 'TEXT' },
      { name: 'is_pinned', type: 'INTEGER DEFAULT 0' },
      { name: 'is_hidden', type: 'INTEGER DEFAULT 0' },
      { name: 'last_opened_at', type: 'INTEGER' },
      { name: 'source', type: "TEXT DEFAULT 'sync'" }  // 'user' = 用户添加, 'sync' = 同步导入
    ]

    for (const col of projectNewColumns) {
      if (!projectColumnNames.includes(col.name)) {
        console.log(`[SessionDB] Adding column: projects.${col.name}`)
        this.db.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    // Migrate sessions table
    const sessionColumns = this.db.prepare("PRAGMA table_info(sessions)").all()
    const sessionColumnNames = sessionColumns.map(c => c.name)

    const sessionNewColumns = [
      { name: 'title', type: 'TEXT' },                    // 用户自定义标题
      { name: 'active_session_id', type: 'TEXT' },        // 关联的活动会话 ID（临时）
      { name: 'first_user_message', type: 'TEXT' }        // 第一条用户消息（用于显示）
    ]

    for (const col of sessionNewColumns) {
      if (!sessionColumnNames.includes(col.name)) {
        console.log(`[SessionDB] Adding column: sessions.${col.name}`)
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    // agent_conversations 表迁移：添加 API Profile 追踪字段
    const agentConvInfo = this.db.prepare("PRAGMA table_info(agent_conversations)").all()
    const agentConvColumns = agentConvInfo.map(col => col.name)

    const agentConvNewColumns = [
      { name: 'api_profile_id', type: 'TEXT' },
      { name: 'api_base_url', type: 'TEXT' },
      { name: 'queued_messages', type: "TEXT DEFAULT '[]'" },  // 存储队列消息（JSON 数组）
      { name: 'staff_id', type: 'TEXT' },         // 钉钉发送者 staffId
      { name: 'conversation_id', type: 'TEXT' },   // 钉钉群/单聊会话 ID
      { name: 'source', type: "TEXT DEFAULT 'manual'" },
      { name: 'task_id', type: 'INTEGER' }
    ]

    for (const col of agentConvNewColumns) {
      if (!agentConvColumns.includes(col.name)) {
        console.log(`[SessionDB] Adding column: agent_conversations.${col.name}`)
        this.db.exec(`ALTER TABLE agent_conversations ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    const scheduledTaskInfo = this.db.prepare("PRAGMA table_info(scheduled_tasks)").all()
    const scheduledTaskColumns = scheduledTaskInfo.map(col => col.name)

    const scheduledTaskNewColumns = [
      { name: 'first_run_mode', type: "TEXT DEFAULT 'next_slot'" },
      { name: 'first_run_at', type: 'INTEGER' }
    ]

    for (const col of scheduledTaskNewColumns) {
      if (!scheduledTaskColumns.includes(col.name)) {
        console.log(`[SessionDB] Adding column: scheduled_tasks.${col.name}`)
        this.db.exec(`ALTER TABLE scheduled_tasks ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    // 迁移：将唯一约束从 path 改为 encoded_path
    // 检查 projects 表的 SQL 定义，判断是否需要重建
    const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'").get()
    const needsRebuild = tableInfo?.sql?.includes('path TEXT UNIQUE')

    if (needsRebuild) {
      console.log('[SessionDB] Migrating: rebuilding projects table (unique constraint from path to encoded_path)')
      // Temporarily disable foreign keys to allow DROP TABLE with references
      this.db.pragma('foreign_keys = OFF')
      this.db.exec('BEGIN TRANSACTION')
      try {
        // 1. 创建新表（唯一约束在 encoded_path）
        this.db.exec(`
          CREATE TABLE projects_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            encoded_path TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            icon TEXT DEFAULT '📁',
            color TEXT DEFAULT '#1890ff',
            api_profile_id TEXT,
            is_pinned INTEGER DEFAULT 0,
            is_hidden INTEGER DEFAULT 0,
            source TEXT DEFAULT 'sync',
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
            last_opened_at INTEGER
          )
        `)

        // 2. 复制数据（去重，保留最新的）
        // 注意：明确指定列名，避免列顺序不同导致数据错位
        // 注意：source 列需要特殊处理，旧表可能没有这列，用 COALESCE 设置默认值 'user'
        this.db.exec(`
          INSERT OR IGNORE INTO projects_new (id, path, encoded_path, name, description, icon, color, api_profile_id, is_pinned, is_hidden, source, created_at, updated_at, last_opened_at)
          SELECT id, path, encoded_path, name, description, icon, color, api_profile_id, is_pinned, is_hidden, COALESCE(source, 'user'), created_at, updated_at, last_opened_at
          FROM projects WHERE id IN (
            SELECT MAX(id) FROM projects GROUP BY encoded_path
          )
        `)

        // 3. 删除旧表，重命名新表
        this.db.exec('DROP TABLE projects')
        this.db.exec('ALTER TABLE projects_new RENAME TO projects')

        this.db.exec('COMMIT')
        console.log('[SessionDB] Migration completed: projects table rebuilt')
      } catch (err) {
        this.db.exec('ROLLBACK')
        console.error('[SessionDB] Migration failed:', err)
      } finally {
        // Re-enable foreign keys after migration
        this.db.pragma('foreign_keys = ON')
      }
    }
  }

  /**
   * Create all tables and indexes
   */
  createTables() {
    // ========================================
    // Core Tables
    // ========================================

    // Projects table
    // 注意：唯一约束在 encoded_path 上，而不是 path
    // 因为 decodePath 对包含 '-' 的路径可能产生歧义
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        encoded_path TEXT UNIQUE NOT NULL,
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
    // Note: session_uuid can be NULL for pending sessions (created before Claude CLI generates the file)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        session_uuid TEXT UNIQUE,
        title TEXT,
        active_session_id TEXT,
        first_user_message TEXT,
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

    // ========================================
    // Tag Tables
    // ========================================

    // Tags table (for sessions/messages)
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

    // ========================================
    // Favorites Table
    // ========================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER UNIQUE NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // ========================================
    // Full-Text Search
    // ========================================

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

    // ========================================
    // Prompts Tables
    // ========================================

    // Prompts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        project_id INTEGER,
        is_favorite INTEGER DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `)

    // Market installed prompts (关联 prompts 表)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_installed_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_id TEXT NOT NULL UNIQUE,
        local_prompt_id INTEGER NOT NULL,
        registry_url TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '0.0.0',
        installed_at INTEGER NOT NULL,
        FOREIGN KEY (local_prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
      )
    `)

    // Prompt tags definition table (separate from session tags)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#1890ff',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `)

    // Prompt-Tag relation table (many-to-many)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_tag_relations (
        prompt_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        PRIMARY KEY (prompt_id, tag_id),
        FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES prompt_tags(id) ON DELETE CASCADE
      )
    `)

    // ========================================
    // Message Queue Table
    // ========================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_message_queue (
        id TEXT PRIMARY KEY,
        session_uuid TEXT NOT NULL,
        content TEXT NOT NULL,
        is_executed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        executed_at INTEGER
      )
    `)

    // ========================================
    // Indexes
    // ========================================

    // ========================================
    // Agent Tables
    // ========================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'chat',
        status TEXT NOT NULL DEFAULT 'idle',
        sdk_session_id TEXT,
        title TEXT DEFAULT '',
        cwd TEXT,
        cwd_auto INTEGER DEFAULT 1,
        message_count INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        api_profile_id TEXT,
        api_base_url TEXT,
        queued_messages TEXT DEFAULT '[]',
        source TEXT DEFAULT 'manual',
        task_id INTEGER,
        created_at INTEGER,
        updated_at INTEGER
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        cwd TEXT,
        api_profile_id TEXT,
        model_tier TEXT,
        max_turns INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        run_on_startup INTEGER NOT NULL DEFAULT 1,
        schedule_type TEXT NOT NULL DEFAULT 'interval',
        interval_minutes INTEGER,
        daily_time TEXT DEFAULT '',
        weekly_days TEXT DEFAULT '[]',
        first_run_mode TEXT NOT NULL DEFAULT 'next_slot',
        first_run_at INTEGER,
        created_at INTEGER,
        updated_at INTEGER
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_task_state (
        task_id INTEGER PRIMARY KEY,
        session_id TEXT,
        runtime_state TEXT,
        last_run_at INTEGER,
        next_run_at INTEGER,
        last_error TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_task_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        session_id TEXT,
        trigger_reason TEXT NOT NULL DEFAULT 'scheduled',
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT,
        started_at INTEGER,
        finished_at INTEGER,
        created_at INTEGER,
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        msg_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        tool_name TEXT,
        tool_input TEXT,
        tool_output TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
      )
    `)

    console.log('[SessionDB] Tables created')
  }

  /**
   * Create indexes after schema migrations are complete.
   */
  createIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
      CREATE INDEX IF NOT EXISTS idx_prompts_scope ON prompts(scope);
      CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
      CREATE INDEX IF NOT EXISTS idx_queue_session ON session_message_queue(session_uuid);
      CREATE INDEX IF NOT EXISTS idx_queue_pending ON session_message_queue(session_uuid, is_executed);
      CREATE INDEX IF NOT EXISTS idx_agent_conv_status ON agent_conversations(status);
      CREATE INDEX IF NOT EXISTS idx_agent_conv_updated ON agent_conversations(updated_at);
      CREATE INDEX IF NOT EXISTS idx_agent_conv_source ON agent_conversations(source);
      CREATE INDEX IF NOT EXISTS idx_agent_conv_task_id ON agent_conversations(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_msg_conv ON agent_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_agent_msg_timestamp ON agent_messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_scheduled_task_state_next_run ON scheduled_task_state(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_id ON scheduled_task_runs(task_id);
    `)

    console.log('[SessionDB] Indexes created')
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
    const agentConvCount = this.db.prepare('SELECT COUNT(*) as count FROM agent_conversations').get()
    const agentMsgCount = this.db.prepare('SELECT COUNT(*) as count FROM agent_messages').get()

    return {
      projects: projectCount?.count || 0,
      sessions: sessionCount?.count || 0,
      messages: messageCount?.count || 0,
      favorites: favoriteCount?.count || 0,
      tags: tagCount?.count || 0,
      agentConversations: agentConvCount?.count || 0,
      agentMessages: agentMsgCount?.count || 0
    }
  }
}

// 应用所有 mixin，构建完整的 SessionDatabase 类
const SessionDatabase = withPromptMarketOperations(
  withScheduledTaskOperations(
    withAgentOperations(
      withQueueOperations(
        withPromptOperations(
          withFavoriteOperations(
            withTagOperations(
              withMessageOperations(
                withSessionOperations(
                  withProjectOperations(SessionDatabaseBase)
                )
              )
            )
          )
        )
      )
    )
  )
)

module.exports = { SessionDatabase }

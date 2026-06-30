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
  withScheduledTaskOperations,
  withSessionAppOperations
} = require('./database')

// 延迟加载 better-sqlite3，允许测试时注入 mock
let DefaultDatabase = null
function getDefaultDatabase() {
  if (!DefaultDatabase) {
    DefaultDatabase = require('better-sqlite3')
  }
  return DefaultDatabase
}

const LEGACY_IM_CHANNEL_TYPES = ['dingtalk', 'weixin', 'feishu', 'enterprise-weixin']

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
    const legacyImChannelSqlList = LEGACY_IM_CHANNEL_TYPES.map(value => `'${value}'`).join(', ')
    const resolvedImChannelExpr = `
      CASE
        WHEN COALESCE(im_channel, '') <> '' THEN im_channel
        WHEN type IN (${legacyImChannelSqlList}) THEN type
        WHEN source IN (${legacyImChannelSqlList}) THEN source
        ELSE NULL
      END
    `.trim()

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
      { name: 'model_id', type: 'TEXT' },
      { name: 'last_bootstrapped_runtime', type: 'TEXT' },
      { name: 'pending_runtime_change', type: "TEXT DEFAULT 'unknown'" },
      { name: 'queued_messages', type: "TEXT DEFAULT '[]'" },
      { name: 'im_user_id', type: 'TEXT' },        // IM 用户标识（userId / openId）
      { name: 'im_chat_id', type: 'TEXT' },        // IM 聊天标识（群聊/单聊 ID）
      { name: 'im_channel', type: 'TEXT' },        // IM 平台类型（dingtalk / weixin / feishu / enterprise-weixin）
      { name: 'im_chat_type', type: 'TEXT' },      // IM 会话类型（p2p / single / group）
      { name: 'source', type: "TEXT DEFAULT 'manual'" },
      { name: 'task_id', type: 'INTEGER' },
      { name: 'owner_client_id', type: "TEXT DEFAULT 'host-ui'" },
      { name: 'client_type', type: "TEXT DEFAULT 'host'" },
      { name: 'client_meta', type: 'TEXT' },
      { name: 'session_app_id', type: 'TEXT' },
      { name: 'session_app_input', type: 'TEXT' }
    ]

    for (const col of agentConvNewColumns) {
      if (!agentConvColumns.includes(col.name)) {
        console.log(`[SessionDB] Adding column: agent_conversations.${col.name}`)
        this.db.exec(`ALTER TABLE agent_conversations ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    const agentConversationLegacyColumns = ['staff_id', 'conversation_id']
    const needsAgentConversationRebuild = agentConversationLegacyColumns.some(col => agentConvColumns.includes(col))

    if (needsAgentConversationRebuild) {
      console.log('[SessionDB] Migrating: rebuilding agent_conversations table (remove legacy IM identity columns)')
      this.db.pragma('foreign_keys = OFF')
      this.db.exec('BEGIN TRANSACTION')
      try {
        this.db.exec(`
          UPDATE agent_conversations
          SET im_channel = ${resolvedImChannelExpr}
        `)

        this.db.exec(`
          UPDATE agent_conversations
          SET im_user_id = CASE
            WHEN COALESCE(im_user_id, '') <> '' THEN im_user_id
            WHEN im_channel = 'weixin' AND COALESCE(staff_id, '') <> '' THEN staff_id
            WHEN im_channel IN ('dingtalk', 'feishu') AND COALESCE(conversation_id, '') = '' AND COALESCE(staff_id, '') <> '' THEN staff_id
            WHEN im_channel IN (${legacyImChannelSqlList}) THEN ''
            ELSE im_user_id
          END
        `)

        this.db.exec(`
          UPDATE agent_conversations
          SET im_chat_id = CASE
            WHEN COALESCE(im_chat_id, '') <> '' THEN im_chat_id
            WHEN im_channel IN ('dingtalk', 'feishu') AND COALESCE(conversation_id, '') <> '' THEN conversation_id
            WHEN im_channel IN (${legacyImChannelSqlList}) THEN ''
            ELSE im_chat_id
          END
        `)

        this.db.exec(`
          UPDATE agent_conversations
          SET im_chat_type = CASE
            WHEN COALESCE(im_chat_type, '') <> '' THEN im_chat_type
            WHEN im_channel = 'weixin' AND COALESCE(staff_id, '') <> '' THEN 'p2p'
            WHEN im_channel IN ('dingtalk', 'feishu') AND COALESCE(conversation_id, '') <> '' THEN 'group'
            WHEN im_channel IN ('dingtalk', 'feishu') AND COALESCE(staff_id, '') <> '' THEN 'p2p'
            ELSE im_chat_type
          END
        `)

        this.db.exec(`
          CREATE TABLE agent_conversations_new (
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
            model_id TEXT,
            last_bootstrapped_runtime TEXT,
            pending_runtime_change TEXT DEFAULT 'unknown',
            queued_messages TEXT DEFAULT '[]',
            im_user_id TEXT,
            im_chat_id TEXT,
            im_channel TEXT,
            im_chat_type TEXT,
            source TEXT DEFAULT 'manual',
            task_id INTEGER,
            owner_client_id TEXT DEFAULT 'host-ui',
            client_type TEXT DEFAULT 'host',
            client_meta TEXT,
            session_app_id TEXT,
            session_app_input TEXT,
            created_at INTEGER,
            updated_at INTEGER
          )
        `)

        this.db.exec(`
          INSERT INTO agent_conversations_new (
            id, session_id, type, status, sdk_session_id, title, cwd, cwd_auto, message_count, total_cost_usd,
            api_profile_id, api_base_url, model_id, last_bootstrapped_runtime, pending_runtime_change, queued_messages,
            im_user_id, im_chat_id, im_channel, im_chat_type, source, task_id, owner_client_id, client_type, client_meta, session_app_id, session_app_input,
            created_at, updated_at
          )
          SELECT
            id, session_id, type, status, sdk_session_id, title, cwd, cwd_auto, message_count, total_cost_usd,
            api_profile_id, api_base_url, model_id, last_bootstrapped_runtime, pending_runtime_change, queued_messages,
            im_user_id, im_chat_id, im_channel, im_chat_type, source, task_id, owner_client_id, client_type, client_meta, session_app_id, session_app_input,
            created_at, updated_at
          FROM agent_conversations
        `)

        this.db.exec('DROP TABLE agent_conversations')
        this.db.exec('ALTER TABLE agent_conversations_new RENAME TO agent_conversations')
        this.db.exec('COMMIT')
        console.log('[SessionDB] Migration completed: agent_conversations table rebuilt')
      } catch (err) {
        this.db.exec('ROLLBACK')
        console.error('[SessionDB] Migration failed: agent_conversations rebuild failed', err)
      } finally {
        this.db.pragma('foreign_keys = ON')
      }
    }

    // 统一修正旧语义：IM 渠道不再通过 type 表达，旧值一律归一为 chat。
    this.db.exec(`
      UPDATE agent_conversations
      SET type = 'chat'
      WHERE type IN (${legacyImChannelSqlList})
    `)

    const scheduledTaskInfo = this.db.prepare("PRAGMA table_info(scheduled_tasks)").all()
    const scheduledTaskColumns = scheduledTaskInfo.map(col => col.name)

    const scheduledTaskNewColumns = [
      { name: 'session_binding_mode', type: "TEXT NOT NULL DEFAULT 'new'" },
      { name: 'model_id', type: 'TEXT' },
      { name: 'max_runs', type: 'INTEGER' },
      { name: 'reset_count_on_enable', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'interval_anchor_mode', type: "TEXT DEFAULT 'started_at'" },
      { name: 'first_run_at', type: 'INTEGER' },
      { name: 'monthly_mode', type: "TEXT DEFAULT 'day_of_month'" },
      { name: 'monthly_day', type: 'INTEGER DEFAULT 1' }
    ]

    for (const col of scheduledTaskNewColumns) {
      if (!scheduledTaskColumns.includes(col.name)) {
        console.log(`[SessionDB] Adding column: scheduled_tasks.${col.name}`)
        this.db.exec(`ALTER TABLE scheduled_tasks ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    const scheduledTaskLegacyColumns = ['run_on_startup', 'first_run_mode']
    const needsScheduledTaskRebuild = scheduledTaskLegacyColumns.some(col => scheduledTaskColumns.includes(col))

    if (needsScheduledTaskRebuild) {
      console.log('[SessionDB] Migrating: rebuilding scheduled_tasks table (remove legacy compatibility columns)')
      this.db.pragma('foreign_keys = OFF')
      this.db.exec('BEGIN TRANSACTION')
      try {
        this.db.exec(`
          CREATE TABLE scheduled_tasks_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            prompt TEXT NOT NULL DEFAULT '',
            cwd TEXT,
            api_profile_id TEXT,
            session_binding_mode TEXT NOT NULL DEFAULT 'new',
            model_id TEXT,
            max_runs INTEGER,
            reset_count_on_enable INTEGER NOT NULL DEFAULT 0,
            interval_anchor_mode TEXT NOT NULL DEFAULT 'started_at',
            enabled INTEGER NOT NULL DEFAULT 1,
            schedule_type TEXT NOT NULL DEFAULT 'interval',
            interval_minutes INTEGER,
            daily_time TEXT DEFAULT '',
            weekly_days TEXT DEFAULT '[]',
            monthly_mode TEXT NOT NULL DEFAULT 'day_of_month',
            monthly_day INTEGER DEFAULT 1,
            first_run_at INTEGER,
            created_at INTEGER,
            updated_at INTEGER
          )
        `)

        this.db.exec(`
          INSERT INTO scheduled_tasks_new (
            id, name, prompt, cwd, api_profile_id, session_binding_mode, model_id, max_runs, reset_count_on_enable,
            interval_anchor_mode, enabled, schedule_type, interval_minutes, daily_time, weekly_days,
            monthly_mode, monthly_day, first_run_at, created_at, updated_at
          )
          SELECT
            id, name, prompt, cwd, api_profile_id, 'new', model_id, max_runs, reset_count_on_enable,
            interval_anchor_mode, enabled, schedule_type, interval_minutes, daily_time, weekly_days,
            monthly_mode, monthly_day, first_run_at, created_at, updated_at
          FROM scheduled_tasks
        `)

        this.db.exec('DROP TABLE scheduled_tasks')
        this.db.exec('ALTER TABLE scheduled_tasks_new RENAME TO scheduled_tasks')
        this.db.exec('COMMIT')
        console.log('[SessionDB] Migration completed: scheduled_tasks table rebuilt')
      } catch (err) {
        this.db.exec('ROLLBACK')
        console.error('[SessionDB] Migration failed: scheduled_tasks rebuild failed', err)
      } finally {
        this.db.pragma('foreign_keys = ON')
      }
    }

    const scheduledTaskStateInfo = this.db.prepare("PRAGMA table_info(scheduled_task_state)").all()
    const scheduledTaskStateColumns = scheduledTaskStateInfo.map(col => col.name)

    const scheduledTaskStateNewColumns = [
      { name: 'run_count', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'last_started_at', type: 'INTEGER' },
      { name: 'last_scheduled_at', type: 'INTEGER' }
    ]

    for (const col of scheduledTaskStateNewColumns) {
      if (!scheduledTaskStateColumns.includes(col.name)) {
        console.log(`[SessionDB] Adding column: scheduled_task_state.${col.name}`)
        this.db.exec(`ALTER TABLE scheduled_task_state ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    const scheduledTaskRunInfo = this.db.prepare("PRAGMA table_info(scheduled_task_runs)").all()
    const scheduledTaskRunColumns = scheduledTaskRunInfo.map(col => col.name)

    const scheduledTaskRunNewColumns = [
      { name: 'scheduled_at', type: 'INTEGER' }
    ]

    for (const col of scheduledTaskRunNewColumns) {
      if (!scheduledTaskRunColumns.includes(col.name)) {
        console.log(`[SessionDB] Adding column: scheduled_task_runs.${col.name}`)
        this.db.exec(`ALTER TABLE scheduled_task_runs ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    const sessionAppsInfo = this.db.prepare("PRAGMA table_info(session_apps)").all()
    const sessionAppsColumns = sessionAppsInfo.map(col => col.name)
    const sessionAppsNewColumns = [
      { name: 'system_prompt', type: "TEXT DEFAULT ''" },
      { name: 'input_schema', type: "TEXT DEFAULT '[]'" },
      { name: 'allowed_capabilities', type: "TEXT DEFAULT '[]'" },
      { name: 'default_context', type: 'TEXT' },
      { name: 'startup_message_template', type: "TEXT DEFAULT ''" },
      { name: 'workflow_hints', type: "TEXT DEFAULT '[]'" },
      { name: 'output_hints', type: "TEXT DEFAULT '[]'" }
    ]

    for (const col of sessionAppsNewColumns) {
      if (!sessionAppsColumns.includes(col.name)) {
        console.log(`[SessionDB] Adding column: session_apps.${col.name}`)
        this.db.exec(`ALTER TABLE session_apps ADD COLUMN ${col.name} ${col.type}`)
      }
    }

    const hasSessionAppVersions = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_app_versions'
    `).get()
    const hasSessionAppDrafts = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_app_drafts'
    `).get()

    const appsMissingDefinitionRows = this.db.prepare(`
      SELECT app_id
      FROM session_apps
      WHERE COALESCE(system_prompt, '') = ''
        AND COALESCE(startup_message_template, '') = ''
        AND COALESCE(default_context, '') = ''
        AND COALESCE(input_schema, '[]') = '[]'
        AND COALESCE(allowed_capabilities, '[]') = '[]'
        AND COALESCE(workflow_hints, '[]') = '[]'
        AND COALESCE(output_hints, '[]') = '[]'
    `).all()

    if (appsMissingDefinitionRows.length > 0 && (hasSessionAppVersions || hasSessionAppDrafts)) {
      const loadLatestVersion = hasSessionAppVersions
        ? this.db.prepare(`
          SELECT *
          FROM session_app_versions
          WHERE app_id = ?
          ORDER BY version DESC, published_at DESC, created_at DESC
          LIMIT 1
        `)
        : null
      const loadLatestDraft = hasSessionAppDrafts
        ? this.db.prepare(`
          SELECT *
          FROM session_app_drafts
          WHERE app_id = ?
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        `)
        : null
      const backfillSessionApp = this.db.prepare(`
        UPDATE session_apps
        SET
          name = ?,
          description = ?,
          icon = ?,
          system_prompt = ?,
          input_schema = ?,
          allowed_capabilities = ?,
          default_context = ?,
          startup_message_template = ?,
          workflow_hints = ?,
          output_hints = ?,
          updated_at = ?
        WHERE app_id = ?
      `)

      for (const row of appsMissingDefinitionRows) {
        const versionRow = loadLatestVersion?.get(row.app_id) || null
        const draftRow = loadLatestDraft?.get(row.app_id) || null
        const sourceRow = versionRow || draftRow
        if (!sourceRow) continue

        backfillSessionApp.run(
          sourceRow.name || 'Untitled Session App',
          sourceRow.description || '',
          sourceRow.icon || 'sessionApp',
          sourceRow.system_prompt || '',
          sourceRow.input_schema || '[]',
          sourceRow.allowed_capabilities || '[]',
          sourceRow.default_context || null,
          sourceRow.startup_message_template || '',
          sourceRow.workflow_hints || '[]',
          sourceRow.output_hints || '[]',
          Date.now(),
          row.app_id
        )
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
        model_id TEXT,
        last_bootstrapped_runtime TEXT,
        pending_runtime_change TEXT DEFAULT 'unknown',
        queued_messages TEXT DEFAULT '[]',
        im_user_id TEXT,
        im_chat_id TEXT,
        im_channel TEXT,
        im_chat_type TEXT,
        source TEXT DEFAULT 'manual',
        task_id INTEGER,
        owner_client_id TEXT DEFAULT 'host-ui',
        client_type TEXT DEFAULT 'host',
        client_meta TEXT,
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
        session_binding_mode TEXT NOT NULL DEFAULT 'new',
        model_id TEXT,
        max_runs INTEGER,
        reset_count_on_enable INTEGER NOT NULL DEFAULT 0,
        interval_anchor_mode TEXT NOT NULL DEFAULT 'started_at',
        enabled INTEGER NOT NULL DEFAULT 1,
        schedule_type TEXT NOT NULL DEFAULT 'interval',
        interval_minutes INTEGER,
        daily_time TEXT DEFAULT '',
        weekly_days TEXT DEFAULT '[]',
        monthly_mode TEXT NOT NULL DEFAULT 'day_of_month',
        monthly_day INTEGER DEFAULT 1,
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
        last_started_at INTEGER,
        last_scheduled_at INTEGER,
        last_run_at INTEGER,
        next_run_at INTEGER,
        last_error TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0,
        run_count INTEGER NOT NULL DEFAULT 0,
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
        scheduled_at INTEGER,
        started_at INTEGER,
        finished_at INTEGER,
        created_at INTEGER,
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_apps (
        app_id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        description TEXT DEFAULT '',
        icon TEXT DEFAULT 'sessionApp',
        system_prompt TEXT DEFAULT '',
        input_schema TEXT DEFAULT '[]',
        allowed_capabilities TEXT DEFAULT '[]',
        default_context TEXT,
        startup_message_template TEXT DEFAULT '',
        workflow_hints TEXT DEFAULT '[]',
        output_hints TEXT DEFAULT '[]',
        created_from_session_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_app_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        description TEXT DEFAULT '',
        icon TEXT DEFAULT 'sessionApp',
        system_prompt TEXT DEFAULT '',
        input_schema TEXT DEFAULT '[]',
        allowed_capabilities TEXT DEFAULT '[]',
        default_context TEXT,
        startup_message_template TEXT DEFAULT '',
        workflow_hints TEXT DEFAULT '[]',
        output_hints TEXT DEFAULT '[]',
        history_policy TEXT,
        source_draft_id TEXT,
        published_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(app_id, version),
        FOREIGN KEY (app_id) REFERENCES session_apps(app_id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_app_drafts (
        draft_id TEXT PRIMARY KEY,
        app_id TEXT,
        source_session_id TEXT,
        creation_mode TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'draft',
        name TEXT NOT NULL DEFAULT '',
        description TEXT DEFAULT '',
        icon TEXT DEFAULT 'sessionApp',
        system_prompt TEXT DEFAULT '',
        input_schema TEXT DEFAULT '[]',
        allowed_capabilities TEXT DEFAULT '[]',
        default_context TEXT,
        startup_message_template TEXT DEFAULT '',
        workflow_hints TEXT DEFAULT '[]',
        output_hints TEXT DEFAULT '[]',
        history_policy TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (app_id) REFERENCES session_apps(app_id) ON DELETE CASCADE
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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS im_known_chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        im_channel TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        chat_name TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(im_channel, chat_id)
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
      CREATE INDEX IF NOT EXISTS idx_agent_conv_im_identity ON agent_conversations(im_channel, im_user_id, im_chat_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_conv_im_user ON agent_conversations(im_channel, im_user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_conv_session_app_id ON agent_conversations(session_app_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_msg_conv ON agent_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_agent_msg_timestamp ON agent_messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_scheduled_task_state_next_run ON scheduled_task_state(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_id ON scheduled_task_runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_im_known_chats_channel ON im_known_chats(im_channel);
      CREATE INDEX IF NOT EXISTS idx_session_apps_updated ON session_apps(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_app_versions_app ON session_app_versions(app_id, version DESC);
      CREATE INDEX IF NOT EXISTS idx_session_app_drafts_app ON session_app_drafts(app_id, updated_at DESC);
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
  withSessionAppOperations(
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
)

module.exports = { SessionDatabase }

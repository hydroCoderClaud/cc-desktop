# 主进程设计

> CC Desktop v1.6.89 | [<< 架构总览](../ARCHITECTURE.md) | [代码索引](../code-index/main.md) | [IPC 通道](../code-index/ipc-channels.md) | [集成模块](integrations.md)

---

## 应用生命周期

### 启动序列

`app.whenReady()` 触发后，按以下顺序初始化：

```
1. ConfigManager            ← 加载 config.json（含迁移）
2. createWindow()           ← BrowserWindow + preload
3. TerminalManager          ← 单 PTY 管理（旧版兼容）
4. ActiveSessionManager     ← 多终端会话（Developer 模式）
5. AgentSessionManager      ← Agent 会话（Agent 模式）
6. 互注入 setPeerManager()  ← 跨模式会话占用检查
7. PluginCli + Managers     ← Skills/Agents/MCP/Settings
8. CapabilityManager        ← 能力市场
9. UpdateManager            ← 自动更新
10. DingTalkBridge          ← 钉钉桥接
11. setupIPCHandlers()      ← IPC 注册 + SessionDatabase 初始化
12. powerSaveBlocker.start  ← 防止系统挂起
13. scheduleUpdateCheck(5s) ← 延迟检查更新
14. DingTalk.start (3s)     ← 延迟启动钉钉
```

**关键文件**: `src/main/index.js`

### Manager 初始化顺序约束

- `ActiveSessionManager` 和 `AgentSessionManager` 互相持有对方引用（`setPeerManager`），用于 CLI 会话 UUID 的跨模式占用检查
- `SessionDatabase` 在 `setupIPCHandlers()` 中创建，然后通过 `setSessionDatabase()` 注入到 `ActiveSessionManager` 和 `AgentSessionManager`
- `CapabilityManager` 依赖 `PluginCli`、`SkillsManager`、`AgentsManager`、`McpManager`，需在它们之后创建
- `McpManager.configManager` 和 `McpManager.settingsManager` 通过属性注入（非构造函数参数）

### 统一清理

`cleanupAllSessions()` 是幂等清理函数，被多个退出路径共用：

| 触发路径 | 场景 |
|---------|------|
| `mainWindow.on('closed')` | 窗口关闭 |
| `app.on('will-quit')` | 应用即将退出 |
| `process.on('SIGTERM/SIGINT')` | 外部终止信号 |
| `process.on('uncaughtException')` | 未捕获异常 |

清理内容：停止 powerSaveBlocker、停止钉钉桥接、kill 终端进程、关闭所有 Active/Agent 会话。

### macOS 特殊处理

macOS 关闭窗口不退出应用（`window-all-closed` 事件不调用 `app.quit()`）。`activate` 事件重建窗口时：

1. 重置 `cleanupDone = false`（允许新一轮清理）
2. 调用 `createWindow()` 重建 `mainWindow`
3. 重启 `powerSaveBlocker`
4. 更新所有 Manager 的 `mainWindow` 引用
5. 通知前端 `agent:allSessionsClosed`（CLI 进程已在 cleanup 中终止）
6. 重启钉钉桥接

---

## 配置管理

### ConfigManager 架构

```
ConfigManager (config-manager.js, 1056行)
├── 核心方法: load(), save(), getConfig(), deepMerge()
├── providerConfigMixin (provider-config.js)  ← Object.assign 混入
│   └── 服务商 CRUD: getServiceProviders, add/update/deleteServiceProviderDefinition
└── apiConfigMixin (api-config.js)  ← Object.assign 混入
    └── API Profile CRUD: getAPIProfiles, add/update/deleteAPIProfile, setDefaultProfile
```

**存储路径**: `%APPDATA%/cc-desktop/config.json`（Windows）或 `~/.config/cc-desktop/config.json`（macOS）

### 写入串行化

`save()` 通过 Promise 链（`this.saveQueue`）确保串行写入，避免并发竞态。文件写入使用 `atomicWriteJson()`（先写临时文件再 rename）。

### 配置迁移

`load()` 时自动执行三种迁移：

| 迁移 | 方法 | 说明 |
|------|------|------|
| 单 API → 多 Profile | `migrateToProfiles()` | 旧版单个 `apiConfig` 迁移到 `apiProfiles[]` |
| Profile 结构升级 | `migrateProfileStructure()` | `category/model` → `serviceProvider/selectedModelTier` |
| 字段重命名 | 内联代码 | `skillsMarket` → `market`、清理废弃的 `updateUrl` |

### API Profile 系统

每个 Profile 包含完整的 API 连接配置：

```javascript
{
  id: "uuid",
  name: "Default API",
  authToken: "sk-ant-...",
  authType: "api_key",       // 'api_key' | 'auth_token'
  baseUrl: "https://api.anthropic.com",
  serviceProvider: "anthropic",
  selectedModelTier: "sonnet", // 启动默认模型
  modelMapping: {
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5"
  },
  useProxy: false,
  httpsProxy: "",
  requestTimeout: 0,
  disableNonessentialTraffic: false
}
```

Profile → 环境变量的映射由 `env-builder.js` 的 `buildClaudeEnvVars()` 完成，详见 [环境变量构建](#环境变量构建)。

### 服务商管理

所有服务商均可编辑/删除，无"内置只读"概念。预设服务商定义在 `constants.js` 的 `BUILT_IN_SERVICE_PROVIDERS` 中，用户自定义服务商存储在 `config.serviceProviderDefinitions[]`。

---

## Terminal 模式

### 单终端（旧版）

`TerminalManager` 管理单个 PTY 进程，保留用于向后兼容。

### 多终端（Developer 模式）

`ActiveSessionManager` 支持多个并发终端会话：

```
ActiveSessionManager
├── sessions: Map<sessionId, ActiveSession>
├── focusedSessionId: string
└── peerManager: AgentSessionManager（跨模式检查）
```

**会话生命周期**：

```
create(options)
  → new ActiveSession({ projectId, projectPath, apiProfileId, resumeSessionId })
  → 写入 DB：createPendingSession()（仅非 resume 的 session 类型）
  → sessions.set(id, session)

start(sessionId)
  → 选择 shell：Windows=COMSPEC, macOS/Linux=SHELL
  → 构建环境变量：buildProcessEnv(profile, standardExtraVars)
  → pty.spawn(shell, args, { cwd, env })
  → 监听 onData → IPC session:data
  → 监听 onExit → 更新状态 + IPC session:exit

close(sessionId)
  → killProcessTree(session.pid)
  → sessions.delete(id)
```

**会话类型**：
- `session`：Claude 会话（启动 shell 后可调用 `claude` CLI）
- `terminal`：纯终端（不关联 Claude CLI）

**后台运行**：关闭 Tab 仅设置 `visible = false`，PTY 进程继续运行。重新打开时从 `allTabs` 恢复，xterm buffer 不丢失（配合前端的[双数组架构](renderer.md#tab-管理)）。

**跨模式占用检查**：`isCliSessionActive(cliSessionUuid)` 检查指定 CLI 会话 UUID 是否在 ActiveSessionManager 中活跃（RUNNING 或 STARTING），防止同一 CLI 会话被 Terminal 和 Agent 模式同时使用。

---

## Agent 模式

### 整体架构

```
AgentSessionManager (1373行)
├── sessions: Map<sessionId, AgentSession>
├── _queryFn: SDK query()（延迟加载 ESM）
├── fileManager: AgentFileManager（文件操作委托）
├── queryManager: AgentQueryManager（模型/命令/MCP 控制委托）
├── messageListener: DingTalkBridge（外部消息监听）
└── peerManager: ActiveSessionManager（跨模式检查）
```

### SDK 加载

`@anthropic-ai/claude-agent-sdk` 是 ESM 模块，通过 `_loadSDK()` 动态 `import()` 延迟加载。加载结果缓存在 `_queryFn`，首次加载期间用 `_sdkLoading` Promise 防止并发重复加载。

### 消息发送流程（Streaming Input 模式）

```
首条消息：
  sendMessage(sessionId, userMessage)
    → _loadSDK()
    → _buildEnvVars(profile)
    → new MessageQueue()
    → queryFn({ prompt: messageQueue, options })  ← 创建持久 query
    → messageQueue.push(sdkUserMessage)
    → _runOutputLoop(session)                     ← 后台遍历 SDK 输出

后续消息（CLI 进程仍活跃）：
  sendMessage(sessionId, userMessage)
    → session.messageQueue.push(sdkUserMessage)   ← 直接 push 到现有队列

CLI 进程退出后的新消息：
  sendMessage(sessionId, userMessage)
    → 检测 queryGenerator 为 null
    → 重新创建持久 query（自动 resume）
```

### QueryGenerator 常驻机制

`queryFn()` 返回 AsyncIterable（queryGenerator），代表一个常驻的 CLI 子进程。只要用户不关闭会话，CLI 进程持续运行：

- 用户发消息 → `messageQueue.push()` → CLI 处理 → 输出通过 generator `yield`
- CLI 空闲时等待新消息（`MessageQueue` 阻塞）
- CLI 异常退出 → `_runOutputLoop` finally 块清理引用 → 下次发消息自动重建

### 输出循环

`_runOutputLoop(session)` 持续遍历 generator 输出，按 `msg.type` 分发：

| msg.type | msg.subtype | 处理 |
|----------|------------|------|
| `system` | `init` | 保存 `sdkSessionId`，推送 `agent:init` |
| `system` | `compact_boundary` | 推送 `agent:compacted` |
| `system` | `status` | 推送 `agent:systemStatus` |
| `assistant` | -- | 推送 `agent:message`，通知 `messageListener`，存储消息 |
| `result` | -- | 推送 `agent:result`，更新状态为 IDLE |

### CWD 分配

Agent 会话的工作目录分配策略：

1. 调用方指定 `cwd` → 直接使用
2. 未指定 → `_assignCwd(session, subDir)` 自动分配
   - 基础目录：`settings.agent.outputBaseDir` 或 `~/cc-desktop-agent-output/`
   - 完整路径：`{baseDir}/{subDir}/conv-{sessionId前8位}/`
   - `subDir` 默认 `'desktop'`，钉钉模式为 `'dingtalk'`

### 会话恢复（resume）

`reopen(sessionId)` 从数据库恢复已关闭的会话到内存：

1. 查询 `agent_conversations` 表
2. 重建 `AgentSession` 对象，恢复 `sdkSessionId`、`messageCount`、`totalCostUsd` 等
3. 放回 `sessions` Map
4. 下次 `sendMessage()` 时通过 `options.resume = session.sdkSessionId` 恢复 CLI 对话上下文

### spawnClaudeCodeProcess

`sendMessage()` 中通过 `options.spawnClaudeCodeProcess` 回调自定义 CLI 进程的启动方式：

1. **asar 路径修正**：SDK 在 `app.asar` 内，但 CLI 可执行文件在 `app.asar.unpacked` 中，需要替换路径
2. **环境变量覆盖**：忽略 SDK 默认环境变量，使用 `_buildEnvVars()` 构建的完整环境
3. **PID 捕获**：保存 `proc.pid` 到 `session.cliPid`，用于 Windows 进程树 kill
4. **stderr 捕获**：收集 CLI 的 stderr 输出用于调试，非零退出时推送 `agent:cliError`

### 环境变量构建

`env-builder.js` 提供三层构建：

```
buildProcessEnv(profile, extraVars)
  ├── buildBasicEnv()          ← process.env 展开 + PATH 保证
  ├── buildClaudeEnvVars(profile)  ← Profile → ANTHROPIC_* 映射
  └── extraVars               ← TERM, SHELL, AUTOCOMPACT 等标准附加变量
```

Profile 字段到环境变量的映射：

| Profile 字段 | 环境变量 |
|-------------|---------|
| `authToken` + `authType='api_key'` | `ANTHROPIC_API_KEY` |
| `authToken` + `authType='auth_token'` | `ANTHROPIC_AUTH_TOKEN` |
| `baseUrl` | `ANTHROPIC_BASE_URL` |
| `selectedModelTier` | `ANTHROPIC_MODEL` |
| `modelMapping.opus/sonnet/haiku` | `ANTHROPIC_DEFAULT_{TIER}_MODEL` |
| `useProxy` + `httpsProxy` | `HTTPS_PROXY` / `HTTP_PROXY` |
| `requestTimeout` | `API_TIMEOUT_MS` |
| `disableNonessentialTraffic` | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` |

`buildStandardExtraVars()` 额外注入 `TERM=xterm-256color`、`SHELL`、`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`。

---

## 数据存储

### SessionDatabase Mixin 模式

```
SessionDatabaseBase (session-database.js)
  → withProjectOperations      (project-db.js)
  → withSessionOperations      (session-db.js)
  → withMessageOperations      (message-db.js)
  → withTagOperations          (tag-db.js)
  → withFavoriteOperations     (favorite-db.js)
  → withPromptOperations       (prompt-db.js)
  → withQueueOperations        (queue-db.js)
  → withAgentOperations        (agent-db.js)
  → withPromptMarketOperations (prompt-market-db.js)
  = SessionDatabase
```

每个 Mixin 是高阶函数 `withXxxOperations(Base)`，返回扩展后的类。链式组合生成最终的 `SessionDatabase` 类。

**存储路径**: `%APPDATA%/cc-desktop/sessions.db`

**依赖**: `better-sqlite3`（支持延迟加载和测试时注入 mock）

### 表结构

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `projects` | 项目记录 | `path`, `encoded_path`(UNIQUE), `is_pinned`, `is_hidden`, `source`, `api_profile_id` |
| `sessions` | Terminal 模式会话 | `project_id`(FK), `session_uuid`(UNIQUE), `title`, `first_user_message`, `model` |
| `messages` | 会话消息 | `session_id`(FK), `uuid`(UNIQUE), `role`, `content`, `tokens_in/out` |
| `messages_fts` | 全文检索（FTS5） | 虚拟表，索引 `content` 字段 |
| `agent_conversations` | Agent 模式对话 | `session_id`, `sdk_session_id`, `type`, `cwd`, `api_profile_id`, `staff_id` |
| `agent_messages` | Agent 消息 | `conversation_id`(FK), `role`, `tool_name`, `tool_input`, `tool_output` |
| `tags` / `session_tags` / `message_tags` | 标签系统 | 多对多关联 |
| `prompts` / `prompt_tags` / `prompt_tag_relations` | 提示词管理 | 多对多关联 |
| `market_installed_prompts` | 市场提示词追踪 | `market_id`(UNIQUE), `version` |
| `favorites` | 消息收藏 | `message_id`, `note` |
| `session_message_queue` | 消息队列 | `session_id`, `content`, `sort_order` |

### 迁移策略

`runMigrations()` 使用 `PRAGMA table_info` 检测列是否存在，按需 `ALTER TABLE ADD COLUMN`。对于需要修改约束的迁移（如 `projects` 表唯一约束从 `path` 改为 `encoded_path`），使用 `CREATE TABLE new → INSERT → DROP old → RENAME` 策略。

### 会话同步管道

```
~/.claude/projects/{encodedPath}/*.jsonl
  ↓ (SessionHistoryService: 只读扫描)
  ↓ (SessionSyncService: 增量同步到 SQLite)
  ↓ (SessionFileWatcher: 实时监控新文件，关联 pending session)
  ↓
sessions.db
```

- `SessionHistoryService`（482行）：从 `~/.claude/` 目录读取 CLI 会话历史（JSONL 格式），提供搜索和导出
- `SessionSyncService`（529行）：增量同步，通过 `file_mtime` 和 `last_synced_uuid` 避免重复处理
- `SessionFileWatcher`（423行）：使用 `chokidar` 监控项目目录，检测新 `.jsonl` 文件后调用 `fillPendingSession()` 关联活动会话

---

## 自动更新

### 双源 Fallback 架构

```
checkForUpdates()
  → 主源（GitHub provider，支持 Range 请求 → 差分更新）
  → 失败 → 镜像（generic provider，国内 CDN）
  → 镜像也失败 → 报错给 UI

downloadUpdate()
  → 当前源（主源或镜像，取决于 checkForUpdates 的结果）
  → 失败且未切换过 → switchToMirror() + 重新 check + download
```

**防重入**: `_isChecking` 和 `isDownloading` 标志位防止并发操作。

**error 事件抑制**: `_isFallingBack` 标志位在 fallback 期间抑制 error 事件通知 UI，避免"闪现错误后又显示更新可用"的体验问题。

### 平台差异

| 特性 | Windows | macOS |
|------|---------|-------|
| 安装方式 | `autoUpdater.quitAndInstall()` | `macOSManualInstall()`（shell 脚本解压） |
| 差分更新 | 支持（blockmap） | 支持（blockmap） |
| 自动安装 | `autoInstallOnAppQuit = true` | `autoInstallOnAppQuit = false` |
| 签名检查 | 正常 | 静默忽略 `Could not get code signature` |
| 稍后安装 | electron-updater 原生 | `before-quit` 事件拦截 → `macOSManualInstall()` |

### macOS 手动安装

`macOSManualInstall()` 通过 shell 脚本实现原子替换：

1. 校验版本号格式（`/^\d+\.\d+\.\d+$/`，防注入）
2. 所有路径通过环境变量传入（`CC_DESKTOP_ZIP_FILE`、`CC_DESKTOP_RESULT_FILE`）
3. 解压 → `cp -R *.app *.app.new` → `rm -rf *.app` → `mv *.app.new *.app`
4. 结果写入 `install-result.json`，下次启动时 `_checkPreviousInstallResult()` 读取

### 状态持久化

下载完成后将 `{ version, downloadedFile }` 写入 `userData/update-state.json`。重启后在 `update-available` 事件中检测：如果持久化文件存在且版本匹配，静默调用 `downloadUpdate()` 同步 electron-updater 内部状态。

---

## IPC 注册架构

### setupIPCHandlers 初始化

`setupIPCHandlers()` 是 IPC 系统的唯一入口，负责：

1. 创建 `SessionDatabase` 并初始化
2. 创建 `SessionHistoryService` 和 `SessionFileWatcher`
3. 通过 `setSessionDatabase()` 注入 DB 到 Manager
4. 调用 12 个 `setupXxxHandlers()` 注册模块化处理器
5. 直接注册顶层通道（dialog、shell、window、terminal、session watcher 等）

### Handler 模块化

每个 Handler 模块导出一个 `setupXxxHandlers(ipcMain, ...dependencies)` 函数：

```javascript
// 典型结构
function setupAgentHandlers(ipcMain, agentSessionManager) {
  ipcMain.handle('agent:create', async (_, options) => {
    return agentSessionManager.create(options)
  })
  // ...
}
```

### IPC 工具函数

`ipc-utils.js` 提供统一的 Handler 注册包装：

| 函数 | 用途 |
|------|------|
| `createIPCHandler(ipcMain, channel, handler)` | 包装 `ipcMain.handle`，统一错误处理和日志 |
| `createIPCHandlerWithEvent(ipcMain, channel, handler)` | 同上，但传递 `event` 参数 |
| `createSyncIPCHandler(ipcMain, channel, handler)` | 同步 Handler（`ipcMain.on` + `returnValue`） |
| `createIPCListener(ipcMain, channel, handler)` | 单向监听（`ipcMain.on`，无返回值） |

### 安全发送

`safeSend(mainWindow, channel, data)` 在发送前检查窗口和 webContents 是否存活，防止 macOS `activate` 重建窗口期间的 `Cannot call send on a destroyed webContents` 错误。

---

## 插件与组件系统

### ComponentScanner 基础类

```
ComponentScanner (component-scanner.js)
├── scanMarkdownFiles(dir)       ← 扫描 .md 文件，解析 YAML frontmatter
├── scanSkillDirectories(dir)    ← 扫描 skill 目录（含 SKILL.md）
├── readJsonFile(path)           ← 安全读取 JSON
├── getEnabledPluginPaths()      ← 从 installed_plugins.json 获取启用的插件路径
└── _parseYamlFrontmatter(text)  ← YAML 解析（js-yaml 库）
```

继承关系：

```
ComponentScanner
├── PluginManager     ← CLI 插件读取/启用/禁用
├── SkillsManager     ← Skills CRUD/导入/导出/市场
├── AgentsManager     ← Agents CRUD/导入/导出/市场
├── HooksManager      ← Hooks 全局/项目/插件级 CRUD
├── McpManager        ← MCP 四级管理 + 市场
└── SettingsManager   ← permissions + env 管理
```

### Manager Mixin 模式

`SkillsManager`、`AgentsManager` 使用与 Database 不同的 Mixin 模式 -- `Object.assign` 到原型：

```javascript
// skills/index.js
class SkillsManager extends ComponentScanner {}
const { crud } = require('./crud')
const { importMixin } = require('./import')
const { exportMixin } = require('./export')
const { marketMixin } = require('./market')
Object.assign(SkillsManager.prototype, crud, importMixin, exportMixin, marketMixin)
```

每个 Mixin 模块导出一个方法集合对象，被合并到 Manager 原型上。

### 文件存储位置

| 组件 | 位置 | 格式 |
|------|------|------|
| Skills | `~/.claude/skills/{id}/SKILL.md` | Markdown + YAML frontmatter |
| Agents | `~/.claude/agents/{id}.md` | Markdown + YAML frontmatter |
| Hooks | `~/.claude/hooks.json` (全局) / `.claude/hooks.json` (项目) | JSON |
| MCP | `~/.claude.json` (user) / `.claude/settings.local.json` (local/project) | JSON |
| Plugins | `~/.claude/plugins/installed_plugins.json` | JSON |
| Settings | `~/.claude/settings.json` | JSON |

### 禁用状态

Skills 和 Agents 的禁用通过文件后缀标记：
- 启用：`SKILL.md` / `agent.md`
- 禁用：`SKILL.md.disabled` / `agent.md.disabled`

`toggleSkillDisabled()` / `toggleAgentDisabled()` 通过 `fs.rename` 切换后缀。

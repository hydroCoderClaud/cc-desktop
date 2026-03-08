# 主进程代码索引

> CC Desktop v1.6.91 | [<< 架构总览](../ARCHITECTURE.md) | [IPC 通道索引](ipc-channels.md) | [渲染进程索引](renderer.md)

## 概览

| 类别 | 文件数 | 总行数 |
|------|--------|--------|
| 顶层模块 | 13 | 7397 |
| IPC Handlers | 12 | 3459 |
| Managers | 16 | 5340 |
| Database | 10 | 1808 |
| Utils | 10 | 1189 |
| Config | 2 | 438 |
| **合计** | **63** | **19631** |

---

## 顶层模块

### index.js
- **行数**：331
- **职责**：应用入口，创建 BrowserWindow，初始化所有 Manager，注册生命周期事件
- **关键导出**：无（入口文件）
- **关键逻辑**：`createWindow()` 创建主窗口、`cleanupAllSessions()` 统一清理、`app.whenReady()` 初始化 Manager 链、macOS `activate` 重建窗口、`powerSaveBlocker` 防挂起、`powerMonitor.on('resume')` 钉钉重连
- **架构上下文**：-> [应用生命周期](../design/main-process.md#应用生命周期)

### config-manager.js
- **行数**：1056
- **职责**：应用配置管理（config.json），含 API Profile、服务商、市场、MCP 代理、AI 助手等
- **关键方法**：`load()`, `save()`, `getConfig()`, `getAPIConfig()`, `testAPIConnection()`, `getMarketConfig()`, `getMcpProxyConfig()`, `ensureProxySupport()`, `migrateToProfiles()`, `migrateProfileStructure()`
- **Mixin**：`providerConfigMixin`（服务商 CRUD）、`apiConfigMixin`（API Profile CRUD）
- **架构上下文**：-> [配置管理](../design/main-process.md#配置管理)

### terminal-manager.js
- **行数**：212
- **职责**：PTY 管理（Terminal 模式），管理单个 PTY 进程的生命周期
- **关键方法**：`start(projectPath)`, `write(data)`, `writeLine(text)`, `resize(cols, rows)`, `kill()`, `getStatus()`
- **架构上下文**：-> [Terminal 模式](../design/main-process.md#terminal-模式)

### agent-session-manager.js
- **行数**：1373
- **职责**：Agent 会话管理，通过 Claude Code CLI SDK 的 Streaming HTTP API 实现多轮 AI 对话
- **关键方法**：`create()`, `sendMessage()`, `cancel()`, `close()`, `closeAll()`, `reopen()`, `toggleMcp()`, `list()`, `rename()`
- **关键类**：`AgentSession`（单个会话）、`AgentSessionManager`（管理器）
- **委托模块**：`AgentFileManager`（文件操作）、`AgentQueryManager`（查询控制）
- **架构上下文**：-> [Agent 模式](../design/main-process.md#agent-模式)

### active-session-manager.js
- **行数**：630
- **职责**：多终端会话管理（Developer 模式），支持并发终端、后台运行、会话恢复
- **关键方法**：`create()`, `start()`, `write()`, `resize()`, `close()`, `closeAll()`, `renameSession()`, `linkSessionUuid()`, `setVisible()`, `focus()`
- **关键类**：`ActiveSession`、`ActiveSessionManager`、`SessionStatus`
- **架构上下文**：-> [Terminal 模式](../design/main-process.md#terminal-模式)

### update-manager.js
- **行数**：679
- **职责**：自动更新（electron-updater），支持主源 GitHub + 镜像 fallback + macOS 手动安装
- **关键方法**：`checkForUpdates()`, `downloadUpdate()`, `quitAndInstall()`, `macOSManualInstall()`, `scheduleUpdateCheck()`, `getUpdateStatus()`
- **内部方法**：`_applyPrimaryFeed()`, `_switchToMirror()`, `_persistState()`, `_setupMacOSAutoInstall()`, `_checkPreviousInstallResult()`
- **架构上下文**：-> [自动更新](../design/integrations.md#自动更新)

### plugin-manager.js
- **行数**：272
- **职责**：Claude Code CLI 插件管理，读取/解析/启用/禁用插件及其组件扫描
- **关键方法**：`listPlugins()`, `getPluginDetails()`, `setPluginEnabled()`, `openPluginsFolder()`
- **继承**：`ComponentScanner`
- **架构上下文**：-> [插件系统](../design/integrations.md#插件系统)

### component-scanner.js
- **行数**：236
- **职责**：组件扫描基础类，提供 Markdown/Skill/JSON 文件扫描和 YAML Frontmatter 解析
- **关键方法**：`scanMarkdownFiles()`, `scanSkillDirectories()`, `readJsonFile()`, `getEnabledPluginPaths()`, `_parseYamlFrontmatter()`
- **架构上下文**：-> [插件系统](../design/integrations.md#插件系统)

### session-database.js
- **行数**：565
- **职责**：SQLite 数据库入口，建表、迁移、应用所有 Mixin 构建完整 `SessionDatabase` 类
- **关键方法**：`init()`, `createTables()`, `runMigrations()`, `close()`, `getStats()`
- **Mixin 链**：project -> session -> message -> tag -> favorite -> prompt -> queue -> agent -> prompt-market
- **架构上下文**：-> [数据存储](../design/main-process.md#数据存储)

### session-history-service.js
- **行数**：482
- **职责**：从 `~/.claude/` 目录读取 CLI 会话历史（只读），提供搜索和导出
- **关键方法**：`getProjects()`, `getProjectSessions()`, `getSessionMessages()`, `searchSessions()`, `exportSession()`, `getGlobalHistory()`

### session-sync-service.js
- **行数**：529
- **职责**：增量同步 `~/.claude/` 会话数据到本地 SQLite 数据库
- **关键方法**：`sync()`, `syncProjectSessions()`, `syncSessionMessages()`, `forceFullSync()`, `clearInvalidSessions()`

### session-file-watcher.js
- **行数**：423
- **职责**：监控 `~/.claude/projects/{encodedPath}/` 目录，检测新 `.jsonl` 文件并关联待定会话
- **关键方法**：`watch()`, `stop()`, `switchProject()`, `handleNewSessionFile()`, `parseSessionFile()`

### ipc-handlers.js
- **行数**：662
- **职责**：IPC 注册入口，初始化 SessionDatabase/SyncService/FileWatcher，注册所有 Handler 模块
- **关键导出**：`setupIPCHandlers()`
- **架构上下文**：-> [IPC 通信](../design/main-process.md#ipc-通信)

---

## IPC Handlers

> 详细通道列表见 [IPC 通道索引](ipc-channels.md)

| 文件 | 通道前缀 | 行数 | 关键 Handler |
|------|---------|------|-------------|
| agent-handlers.js | agent: | 474 | sendMessage, cancel, create, close, reopen, rename, getMessages, listConversations, searchFiles |
| plugin-handlers.js | plugins: / skills: / agents: / hooks: / mcp: / settings: | 1236 | listPlugins, getAllSkills, createSkill, importSkills, getAllAgents, getGlobalHooks, listMcpAll |
| ai-handlers.js | ai: | 333 | ai:stream（独立 AI 对话） |
| config-handlers.js | config: / providers: | 278 | getConfig, updateSettings, testAPI, getProfiles, addProfile |
| prompt-handlers.js | prompt: | 278 | getPrompts, createPrompt, updatePrompt, deletePrompt, getPromptTags |
| project-handlers.js | project: | 290 | listProjects, createProject, updateProject, deleteProject, hasProblematicPath |
| session-handlers.js | session: | 230 | getSessions, getMessages, searchSessions, syncSessions, getTags |
| active-session-handlers.js | activeSession: | 136 | create, start, close, write, resize, rename |
| capability-handlers.js | capabilities: | 101 | fetch, install, uninstall, enable, disable, toggleMcp |
| update-handlers.js | update: | 59 | checkForUpdates, downloadUpdate, quitAndInstall, getStatus |
| dingtalk-handlers.js | dingtalk: | 55 | getStatus, start, stop, getConfig, saveConfig |
| queue-handlers.js | queue: | 45 | getQueue, addToQueue, deleteItem, clearQueue |

---

## Managers

### capability-manager.js
- **行数**：679
- **职责**：Agent 能力管理（远程清单拉取、安装/卸载、启用/禁用、市场自动注册）
- **关键方法**：`fetchCapabilities()`, `installCapability()`, `uninstallCapability()`, `enableCapability()`, `disableCapability()`, `checkComponentInstalled()`, `checkForCapabilityUpdates()`
- **架构上下文**：-> [能力市场](../design/integrations.md#能力市场)

### dingtalk-bridge.js
- **行数**：1335
- **职责**：钉钉机器人桥接（Stream 连接、消息转发、图片上传、命令系统、多会话管理）
- **关键方法**：`start()`, `stop()`, `restart()`, `getStatus()`, `onAgentMessage()`, `onAgentResult()`, `onAgentError()`
- **内部方法**：`_handleDingTalkMessage()`, `_ensureSession()`, `_sendCollectedImages()`, `_handleCommand()`, `_replyToDingTalk()`
- **命令**：`/help`, `/new`, `/close`, `/resume`, `/rename`, `/status`, `/sessions`
- **架构上下文**：-> [钉钉桥接](../design/integrations.md#钉钉桥接)

### hooks-manager.js
- **行数**：462
- **职责**：Hooks 管理（全局/项目/插件级），13 种事件类型的 CRUD
- **关键方法**：`getGlobalHooks()`, `getProjectHooks()`, `getAllHooks()`, `createHook()`, `updateHook()`, `deleteHook()`, `getHooksJson()`, `saveHooksJson()`, `copyHook()`
- **继承**：`ComponentScanner`

### mcp-manager.js
- **行数**：545
- **职责**：MCP 服务器管理（四级来源：User/Local/Project/Plugin）
- **关键方法**：`listMcpAll()`, `listMcpUser()`, `listMcpLocal()`, `listMcpProject()`, `listMcpPlugin()`, `createMcp()`, `updateMcp()`, `deleteMcp()`
- **Mixin**：`mcpMarketMixin`（市场安装/卸载）
- **继承**：`ComponentScanner`

### settings-manager.js
- **行数**：405
- **职责**：Claude Code 基本设置管理（permissions 和 env 字段）
- **关键方法**：`getPermissions()`, `addPermissionRule()`, `updatePermissionRule()`, `removePermissionRule()`, `getEnv()`, `setEnv()`, `removeEnv()`, `getAllSettings()`, `addMcpToolPermissions()`, `getRawSettings()`, `saveRawSettings()`
- **继承**：`ComponentScanner`

### agent-file-manager.js
- **行数**：446
- **职责**：Agent 文件操作（目录浏览、文件读写、创建、重命名、删除、搜索）
- **关键方法**：`listDir()`, `readFile()`, `saveFile()`, `createFile()`, `renameFile()`, `deleteFile()`, `searchFiles()`, `resolveFilePath()`

### agent-query-manager.js
- **行数**：105
- **职责**：Agent Query 控制（模型切换、命令查询、账户信息、MCP 状态）
- **关键方法**：`setModel()`, `getSupportedModels()`, `getSupportedCommands()`, `getAccountInfo()`, `getMcpServerStatus()`, `getInitResult()`

### plugin-cli.js
- **行数**：330
- **职责**：Claude Code CLI 插件命令封装（含错误精确归因：市场未注册 vs 插件不存在）
- **关键方法**：`listAvailable()`, `install()`, `uninstall()`, `update()`, `listMarketplaces()`, `addMarketplace()`, `removeMarketplace()`, `_refineNotFoundError()`

### skills-manager.js
- **行数**：14
- **职责**：Skills 管理重导出入口，实际实现在 `skills/` 目录
- **关键导出**：`SkillsManager`

### index.js
- **行数**：18
- **职责**：Manager 统一导出入口
- **关键导出**：`SkillsManager`, `AgentsManager`, `HooksManager`, `McpManager`, `SettingsManager`

---

### managers/skills/ (Mixin 模块)

| 文件 | 行数 | 职责 | 关键方法 |
|------|------|------|---------|
| index.js | 38 | SkillsManager 入口，混入所有 Mixin | -- |
| crud.js | 267 | Skills CRUD 操作 | getOfficialSkills, getUserSkills, getProjectSkills, getAllSkills, deleteSkill, createSkillRaw, updateSkillRaw, copySkill |
| import.js | 291 | Skills 导入（目录/ZIP） | validateImportSource, checkImportConflicts, importSkills |
| export.js | 114 | Skills 导出（目录/ZIP） | exportSkill |
| market.js | 219 | Skills 市场（安装/卸载/更新） | installFromMarket, uninstallMarketSkill, checkMarketUpdate, listInstalledMarketSkills |
| utils.js | 158 | 工具方法 | getSkillMeta, readSkillContent, toggleSkillDisabled |

### managers/agents/ (Mixin 模块)

| 文件 | 行数 | 职责 | 关键方法 |
|------|------|------|---------|
| index.js | 40 | AgentsManager 入口，混入所有 Mixin | -- |
| crud.js | 323 | Agents CRUD 操作 | getUserAgents, getProjectAgents, getPluginAgents, getAllAgents, deleteAgent, createAgentRaw, updateAgentRaw, copyAgent, renameAgent |
| import.js | 303 | Agents 导入 | validateAgentImportSource, checkAgentImportConflicts, importAgents |
| export.js | 116 | Agents 导出 | exportAgent |
| market.js | 213 | Agents 市场 | installAgentFromMarket, uninstallMarketAgent, checkAgentMarketUpdate |
| utils.js | 192 | 工具方法 | getAgentMeta, readAgentContent, toggleAgentDisabled |

### managers/mcp/ (Mixin 模块)

| 文件 | 行数 | 职责 | 关键方法 |
|------|------|------|---------|
| market.js | 388 | MCP 市场安装/卸载 | installFromMarket, uninstallMarketMcp, listInstalledMarketMcps, checkMcpMarketUpdate |

---

## Database

> 所有 Mixin 通过高阶函数 `withXxxOperations(Base)` 混入 `SessionDatabaseBase`

| 文件 | 表名 | 行数 | 关键方法 |
|------|------|------|---------|
| index.js | -- | 27 | 统一导出所有 Mixin |
| project-db.js | projects | 257 | getOrCreateProject, getAllProjects, createProject, updateProject, deleteProject, getProjectByPath |
| session-db.js | sessions | 395 | getOrCreateSession, getSessionByUuid, updateSession, deleteSession, createPendingSession, fillPendingSession, mergePendingIntoExisting |
| message-db.js | messages, messages_fts | 148 | insertMessages, messageExists, getMessagesBySession, searchMessages |
| agent-db.js | agent_conversations, agent_messages | 249 | createAgentConversation, getAgentConversation, listAgentConversations, updateAgentConversation, insertAgentMessage, getDingTalkSession, saveAgentQueue |
| tag-db.js | tags, session_tags, message_tags | 154 | createTag, getAllTags, addTagToSession, removeTagFromSession, getSessionTags |
| prompt-db.js | prompts, prompt_tags, prompt_tag_relations | 287 | createPrompt, getPrompts, updatePrompt, deletePrompt, createPromptTag, getAllPromptTags |
| prompt-market-db.js | market_installed_prompts | 107 | recordMarketInstall, getMarketInstallByMarketId, removeMarketInstall, listMarketInstalls |
| favorite-db.js | favorites | 69 | addFavorite, removeFavorite, isFavorite, getAllFavorites |
| queue-db.js | session_message_queue | 115 | addToQueue, getQueue, updateQueueItem, deleteQueueItem, clearQueue, swapQueueOrder |

---

## Utils

| 文件 | 行数 | 导出函数 |
|------|------|---------|
| env-builder.js | 271 | `buildProcessEnv`, `buildClaudeEnvVars`, `buildBasicEnv`, `buildStandardExtraVars`, `isPackagedApp` |
| http-client.js | 264 | `httpGet`, `httpGetWithMirror`, `fetchRegistryIndex`, `classifyHttpError`, `isNewerVersion`, `isValidMarketId`, `isSafeFilename` |
| path-utils.js | 156 | `encodePath`, `decodePath`, `smartDecodePath`, `getProjectName`, `atomicWriteJson` |
| agent-constants.js | 115 | `AgentStatus`, `AgentType`, `HIDDEN_DIRS`, `HIDDEN_FILES`, `TEXT_EXTS`, `IMAGE_EXTS`, `LANG_MAP` |
| constants.js | 101 | `TIMEOUTS`, `LATEST_MODEL_ALIASES`, `BUILT_IN_SERVICE_PROVIDERS` |
| message-queue.js | 84 | `MessageQueue`（类：enqueue, drain, cancel, isDone） |
| ipc-utils.js | 79 | `createIPCHandler`, `createIPCHandlerWithEvent`, `createSyncIPCHandler`, `createIPCListener` |
| token-counter.js | 55 | `countTokens`, `countMessagesTokens`, `shouldCompact` |
| process-tree-kill.js | 39 | `killProcessTree` |
| safe-send.js | 25 | `safeSend`（防御性 IPC 发送） |

---

## Config (Mixin)

| 文件 | 行数 | Mixin 名 | 关键方法 |
|------|------|---------|---------|
| api-config.js | 266 | `apiConfigMixin` | getAPIProfiles, getAPIProfile, addAPIProfile, updateAPIProfile, deleteAPIProfile, setDefaultProfile, getDefaultProfile |
| provider-config.js | 172 | `providerConfigMixin` | getServiceProviders, getServiceProviderDefinitions, addServiceProviderDefinition, updateServiceProviderDefinition, deleteServiceProviderDefinition |

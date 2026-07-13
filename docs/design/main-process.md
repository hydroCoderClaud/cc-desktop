# 主进程设计

> Hydro Desktop v1.7.74+ | [<< 架构总览](../ARCHITECTURE.md) | [代码索引](../code-index/main.md) | [IPC 通道](../code-index/ipc-channels.md) | [集成模块](integrations.md)

---

## 应用生命周期

### 单实例约束

主进程在 `app.whenReady()` 之前先调用 `app.requestSingleInstanceLock()`。

- Windows / macOS 均强制单实例运行，避免多个 Electron 主进程同时读写同一个 `{userData}` 目录
- 若当前进程未获取到锁，立即退出，不继续初始化任何 Manager / Tray / BrowserWindow
- 若已运行实例收到 `second-instance` 事件：
  - 已有 `mainWindow` 且窗口仍存活：直接显示并聚焦窗口
  - `mainWindow` 引用失效但仍有存活窗口：恢复并聚焦该窗口
  - 应用进程仍在但没有任何窗口：重建主窗口、恢复 tray 状态、重绑 Manager 的 `mainWindow` 引用，并按需重启 `powerSaveBlocker`

### 启动序列

`app.whenReady()` 触发后，按以下顺序初始化：

```
1. ConfigManager            ← 加载 config.json（含迁移）
2. createWindow()           ← BrowserWindow + preload
3. AgentSessionManager      ← Agent 会话（主工作流）
4. PluginService + Managers ← 插件运行时 + Skills/Agents/MCP/Settings
5. CapabilityManager        ← 能力市场
6. UpdateManager            ← 自动更新
7. DingTalkBridge           ← 钉钉桥接（Stream WebSocket）
8. FeishuBridge             ← 飞书桥接（SDK WebSocket）
9. EnterpriseWeixinBridge   ← 企业微信桥接（aibot SDK WS）
10. NotebookManager         ← Notebook 工作台后端能力
11. EmbeddedAppPreferencesManager ← 内嵌 app API Profile / 模型偏好
12. ScheduledTaskService    ← 桌面端定时任务调度
13. WeixinNotifyService     ← 微信 iLink 授权 / 轮询 / 发送
14. WeixinBridge            ← 微信会话桥接
15. WecomCliManager         ← 企业微信 CLI 联系人管理
16. setupIPCHandlers()      ← IPC 注册 + SessionDatabase 初始化 + scheduledTaskService.start()
17. powerSaveBlocker.start  ← 防止系统挂起
18. scheduleUpdateCheck(5s) ← 延迟检查更新
19. DingTalk.start (3s)     ← 延迟启动钉钉
20. Feishu.start (3s)       ← 延迟启动飞书
21. EnterpriseWeixin.start  ← 延迟启动企业微信
```

**关键文件**: `src/main/index.js`

### Manager 初始化顺序约束

- `SessionDatabase` 在 `setupIPCHandlers()` 中创建，然后通过 `setSessionDatabase()` 注入到 `AgentSessionManager`
- `ScheduledTaskService` 在创建后先挂到 `agentSessionManager.scheduledTaskService`，再在 `setupIPCHandlers()` 内注入 `SessionDatabase` 并启动轮询
- `WeixinNotifyService` 在主进程启动时先创建并注入到 `agentSessionManager.weixinNotifyService`，供 Agent 会话构建内置微信 MCP；是否真正启动后台轮询由 `weixinBridge.start()` 和 `weixin.enabled` 决定
- `WeixinBridge` 依赖 `AgentSessionManager` 和 `WeixinNotifyService`，负责会话绑定、入站微信路由和回复回推
- `EmbeddedAppPreferencesManager` 在 `NotebookManager` 之后初始化，并通过 `setupIPCHandlers()` 暴露给内嵌 app 读写偏好
- `CapabilityManager` 依赖 `PluginService`、`SkillsManager`、`AgentsManager`、`McpManager`，需在它们之后创建
- `McpManager.configManager` 和 `McpManager.settingsManager` 通过属性注入（非构造函数参数）

### 统一清理

`cleanupAllSessions()` 是幂等清理函数，被多个退出路径共用：

| 触发路径 | 场景 |
|---------|------|
| `mainWindow.on('closed')` | 窗口关闭 |
| `app.on('will-quit')` | 应用即将退出 |
| `process.on('SIGTERM/SIGINT')` | 外部终止信号 |
| `process.on('uncaughtException')` | 未捕获异常 |

清理内容：停止 powerSaveBlocker、停止钉钉桥接、停止微信桥接与微信后台轮询、关闭所有 Agent 会话并清理其子进程。

### macOS 特殊处理

macOS 关闭窗口不退出应用（`window-all-closed` 事件不调用 `app.quit()`）。`activate` 事件与 `second-instance` 共用同一套窗口恢复逻辑：

1. 若已有主窗口，则直接显示并聚焦，不重复创建窗口
2. 若主窗口引用丢失但仍存在其他存活窗口，则恢复并聚焦该窗口
3. 若当前无任何窗口，则重置 `cleanupDone = false`，调用 `createWindow()` 重建 `mainWindow`
4. 重建窗口后刷新 tray 菜单，并确保 `powerSaveBlocker` 处于运行状态
5. 更新所有 Manager 的 `mainWindow` 引用
6. 通知前端 `agent:allSessionsClosed`（CLI 进程已在 cleanup 中终止）
7. 重启钉钉桥接，并更新微信桥接的 `mainWindow` 引用

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
| Profile 结构升级 | `migrateProfileStructure()` | `category/model` → `serviceProvider/selectedModelId`，并清理 `customModels` / `modelMapping` / `selectedModelTier` |
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
  serviceProvider: "official",
  selectedModelId: "claude-sonnet-4-6", // 启动默认模型 ID
  useProxy: false,
  httpsProxy: "",
  requestTimeout: 120000,
  disableNonessentialTraffic: true
}
```

Profile → 环境变量的映射由 `env-builder.js` 的 `buildClaudeEnvVars()` 完成，详见 [环境变量构建](#环境变量构建)。

运行时还会通过 `buildRuntimeProfile()` 从 `serviceProviderDefinitions[].defaultModelMapping` 临时补全 `modelMapping`，仅用于填充 `ANTHROPIC_DEFAULT_*_MODEL`，不会回写到 Profile 配置本身。

### 服务商管理

所有服务商均可编辑/删除，无"内置只读"概念。预设服务商定义在 `constants.js` 的 `SERVICE_PROVIDERS` 中，用户自定义服务商存储在 `config.serviceProviderDefinitions[]`。

---

## Agent 模式

### 整体架构

```
AgentSessionManager (1373行)
├── sessions: Map<sessionId, AgentSession>
├── _queryFn: SDK query()（延迟加载 ESM）
├── fileManager: AgentFileManager（文件操作委托）
├── queryManager: AgentQueryManager（模型/命令/MCP 控制委托）
├── messageListener: 外部桥接监听（钉钉/微信）
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
| `assistant` | -- | 推送 `agent:message`，通知外部桥接层并存储消息 |
| `result` | -- | 推送 `agent:result`，更新状态为 IDLE |

### CWD 分配

Agent 会话的工作目录分配策略：

1. 调用方指定 `cwd` → 直接使用
2. 未指定 → `_assignCwd(session, subDir)` 自动分配
   - 基础目录：`settings.agent.outputBaseDir` 或 `~/cc-desktop-agent-output/`
   - 完整路径：`{baseDir}/{subDir}/conv-{sessionId前8位}/`
   - `subDir` 默认 `'desktop'`，钉钉模式为 `'dingtalk'`，微信模式为 `'weixin'`

### 会话恢复（resume）

`reopen(sessionId)` 从数据库恢复已关闭的会话到内存：

1. 查询 `agent_conversations` 表
2. 重建 `AgentSession` 对象，恢复 `sdkSessionId`、`messageCount`、`totalCostUsd` 等
3. 放回 `sessions` Map
4. 下次 `sendMessage()` 时通过 `options.resume = session.sdkSessionId` 恢复 CLI 对话上下文

### 内嵌 App Agent 复用

当前主进程已支持 `clientType = embedded` 的 Agent 会话复用，核心分层如下：

```text
embedded BrowserWindow
  → preload 暴露 window.hydroAgent
  → hydro-agent:* IPC
  → AgentSessionBroker 负责 client / session 归属
  → AgentSessionManager 继续执行底层会话
  → EmbeddedAppRuntimeManager 维护 app context / command bridge
```

当前实现要点：

- embedded client 通过 `window.hydroAgent.connect()` 建立 client 身份
- 主进程为每个 app 分配独立工作目录：`{userData}/embedded-apps/{appId}/workspace`
- `EmbeddedAppRuntimeManager` 按 `appId` 保存当前上下文快照、命令执行桥，以及当前 embedded 会话指针 `currentSessionId`
- `buildEmbeddedAppCapabilityQueryOptions()` 会在 embedded 会话发送消息前注入：
  - 通用 `embeddedapp` MCP 工具：`context_get`、`command_execute`
  - 针对 `hydrology-workbench` 的专属工具与 prompt 约束
- 会话 owner 优先路由回当前 embedded client，避免多个同 app 窗口串命令
- `hydro-agent:createSession`、`reopen`、`clearAndRecreate`、`setCurrentSession` 都会同步刷新该 app 的 `currentSessionId`

这条 `currentSessionId` 运行态指针现在也是定时任务与 embedded app 联动的关键状态：

- 普通聊天里创建、且 `sessionBindingMode=current` 的定时任务，仍然是静态绑定具体 `sessionId`
- embedded app 里创建、且 `sessionBindingMode=current` 的定时任务，不再等价于“永远绑定创建当时那个 sessionId”
- 真实语义是“后续运行时跟随该 app 当前会话”
- 因此 `/clear` 或 embedded 面板里的“新建会话”会让后续任务执行自动跟到新会话
- 如果该 app 当前没有可跟随的会话，任务会记一次 `skipped`，而不是偷偷回落到普通后台独立任务会话

### 水文工作台专属能力注入

`hydrology-workbench` 在通用 embeddedapp 之上，还会额外注入水文场景专属约束：

- 允许工具：
  - `hydrology_context_get`
  - `hydrology_current_station_get`
  - `hydrology_tab_open`
  - `hydrology_review_board_open`
- 禁用工具：
  - `Bash`
  - `Glob`
  - `Grep`
  - `LS`
  - `Read`

这样做的目的不是削弱 Agent，而是强制当前会话优先读取水文工作台的运行态上下文与受控页面动作，避免把“当前站点”“审核任务状态”误判成桌面定时任务或工作区文件问题。

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
| `selectedModelId` | `ANTHROPIC_MODEL` |
| `serviceProviderDefinitions[].defaultModelMapping.{tier}` | `ANTHROPIC_DEFAULT_{TIER}_MODEL` |
| `useProxy` + `httpsProxy` | `HTTPS_PROXY` / `HTTP_PROXY` |
| `requestTimeout` | `API_TIMEOUT_MS` |
| `disableNonessentialTraffic` | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` |

`buildStandardExtraVars()` 额外注入 `TERM=xterm-256color`、`SHELL`、`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`。

---

## 定时任务服务

### ScheduledTaskService

`ScheduledTaskService` 负责桌面端本地定时任务调度，构造时依赖 `ConfigManager` 和 `AgentSessionManager`，启动时再注入 `SessionDatabase`：

```
new ScheduledTaskService(configManager, agentSessionManager)
  → setSessionDatabase(sessionDatabase)
  → start()        // 30 秒轮询一次到期任务
  → _executeTask() // 复用 AgentSessionManager 执行
```

当前执行绑定语义已经和早期版本不同：

- 定时任务不再持有独立 `apiProfileId` / `modelId`
- 任务执行统一复用“绑定会话当前 runtime”
- `sessionBindingMode=new` 仍表示使用独立任务会话
- 普通聊天创建的 `sessionBindingMode=current` 任务，仍静态绑定具体 `sessionId`
- embedded app 创建的 `sessionBindingMode=current` 任务，运行时通过 `runtimeState` 里的 embedded 元信息回查 `appId -> currentSessionId`
- 如果普通/current 绑定会话丢失，执行时会按旧路径重建一个新的默认任务会话
- 只有 embedded current 绑定任务在“app 当前无会话”时会 `skip`，这是刻意保留的差异语义

### 支持的调度类型

- `interval`
- `daily`
- `weekly`
- `monthly`
- `workdays`
- `once`

调度配置统一使用 `firstRunAt`：

- `interval`：`firstRunAt` 既是首次触发时间，也是整个间隔序列的固定相位基准，后续总是按该基准推算最近槽位。
- `daily` / `weekly` / `monthly` / `workdays`：读取 `firstRunAt` 的时分作为周期执行时间，不再额外暴露“首次触发策略”。
- `once`：`firstRunAt` 就是唯一一次触发时间。

### IPC 接口

当前通过 `scheduled-task-handlers.js` 暴露：

- `scheduled-task:list`
- `scheduled-task:create`
- `scheduled-task:update`
- `scheduled-task:delete`
- `scheduled-task:runNow`
- `scheduled-task:listRuns`

状态变更后主进程会推送 `scheduled-task:changed`，供主窗口和设置工作台刷新。

当前还会维护以下运行态一致性：

- 删除某个共用 session 的任务时，只会清理该任务自己的 active run，不会把同 session 的其他任务运行态一并清掉
- embedded app current 绑定任务在 `/clear`、新建会话后不会继续回用旧 session 快照
- 任务运行历史会明确记录 `success` / `failed` / `skipped`

### 系统恢复处理

系统从睡眠恢复后，主进程除了重连钉钉桥接，还会调用 `scheduledTaskService.onSystemResume()`，补做恢复后的到期任务检查。

---

## 微信通知与桥接

### WeixinNotifyService

`WeixinNotifyService` 负责桌面内建的微信 iLink 能力：

```
new WeixinNotifyService(configManager)
  → applyRuntimeConfig()   // 读取 enabled / pollIntervalMs / pollTimeoutMs
  → start()                // 启动后台长轮询
  → startLogin()           // 获取扫码二维码
  → waitLogin()            // 等待扫码授权完成
  → pollOnce() / getupdates
  → sendText() / sendImages()
```

当前职责包括：

- 保存已授权账号 `accountId / botToken / userId`
- 保存可发送目标 `targetId / contextToken`
- 维护“一个用户一个首选目标”的展示语义
- 通过后台长轮询接收入站文本/图片消息
- 对外暴露运行态配置与状态基础能力，供 `WeixinBridge` 和设置页统一使用

### WeixinBridge

`WeixinBridge` 负责把微信消息接入 Agent 会话体系：

- 监听 `WeixinNotifyService` 的 `message` / `sent` 事件
- 维护 `sessionId -> target` 绑定
- 把微信入站消息写入现有会话，或创建 `source === 'weixin'` 新会话
- 把 Agent 文本回复、桌面介入内容和图片回推给微信端
- 向前端广播 `weixin:messageReceived` 与 `weixin:sessionCreated`
- 统一暴露 bridge 运行态：`getStatus()`、`start()`、`stop()`、`restart()`、`weixin:statusChange`

补充现状：

- 微信仍保留 `WeixinNotifyService + WeixinBridge` 双层结构
- 主进程启动阶段不再无条件直接启动 `WeixinNotifyService`
- 当前由 `weixinBridge.start()` 决定是否根据 `weixin.enabled` 真正启动后台轮询
- 设置页与聊天工具栏会基于 bridge 状态决定入口是否显示

### FeishuBridge

> 核心文件：`src/main/managers/feishu-bridge.js`

`FeishuBridge` 负责飞书消息接入 Agent 会话体系：

- 使用 `@larksuiteoapi/node-sdk` WebSocket 长连接
- 消息接收: 事件订阅回调（`on('message')`）
- 回复通道: REST API (`client.im.v1.message.create`)
- 命令层: 已接入共享命令层，命令结果主模式为文本 / Markdown 风格回复
- 共享模块: `ImSessionMapper`、`ImReplyCollector`、`ImFrontendNotifier` 以及共享命令模块
- 图片: SDK `image.create` 上传 → `message.create` 发送
- `FeishuEventClient` 负责事件接入与连接管理

### EnterpriseWeixinBridge

> 核心文件：`src/main/managers/enterprise-weixin-bridge.js`

`EnterpriseWeixinBridge` 负责企业微信消息接入 Agent 会话体系：

- 使用 `@wecom/aibot-node-sdk` WSClient WebSocket 长连接
- 消息接收与回复: 同一条 WebSocket（`replyStream` / `replyMedia` / `sendMessage`）
- 命令层: 完整接入共享命令层 7 个模块
- 图片: `downloadFile(url, aeskey)` 解密入站 / `uploadMedia` + `replyMedia` 出站
- 联系人: `WecomCliManager` 通过 `wecom-cli` CLI 工具获取联系人列表
- 会话管理: `ImSessionMapper` + `_sessionIdentities` + `_sessionTargets`

---

## 数据存储

### SessionDatabase Mixin 模式

```
SessionDatabaseBase (session-database.js)
  → withProjectOperations      (project-db.js)
  → withPromptOperations       (prompt-db.js)
  → withQueueOperations        (queue-db.js)
  → withAgentOperations        (agent-db.js)
  → withPromptMarketOperations (prompt-market-db.js)
  → withScheduledTaskOperations(scheduled-task-db.js)
  → withSessionAppOperations   (session-app-db.js)
  = SessionDatabase
```

每个 Mixin 是高阶函数 `withXxxOperations(Base)`，返回扩展后的类。链式组合生成最终的 `SessionDatabase` 类。

**存储路径**: `%APPDATA%/cc-desktop/sessions.db`

**依赖**: `better-sqlite3`（支持延迟加载和测试时注入 mock）

### 表结构

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `projects` | 项目 / cwd 身份 | `path`, `path_key`(UNIQUE), `encoded_path`, `project_kind`, `is_pinned`, `is_hidden`, `api_profile_id` |
| `agent_conversations` | Agent 模式对话 | `project_id`, `session_id`, `sdk_session_id`, `type`, `source`, `cwd`, `api_profile_id`, `im_channel`, `im_user_id`, `im_chat_id`, `im_chat_type` |
| `agent_messages` | Agent 消息 | `conversation_id`(FK), `role`, `tool_name`, `tool_input`, `tool_output` |
| `prompts` / `prompt_tags` / `prompt_tag_relations` | 提示词管理 | 多对多关联 |
| `market_installed_prompts` | 市场提示词追踪 | `market_id`(UNIQUE), `version` |
| `session_message_queue` | 消息队列 | `session_id`, `content`, `sort_order` |

`projects.project_kind` 表达目录类型，`projects.is_hidden` 只表达普通 `workspace` 在用户工作区列表中的可见性偏好；Agent 会话归属仍以 `agent_conversations.project_id -> projects.path` 为准，内部目录过滤不得依赖 `is_hidden`。

### 迁移策略

`runMigrations()` 使用 `PRAGMA table_info` 检测列是否存在，按需 `ALTER TABLE ADD COLUMN`。对于需要修改约束的迁移（如 `projects` 表按 `path_key` 建立真实 cwd 身份），使用 `CREATE TABLE new → INSERT → DROP old → RENAME` 策略。Claude 历史目录扫描和 Developer 历史数据链路已移除。

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
2. 通过 `setSessionDatabase()` 注入 DB 到 Manager
3. 调用各 `setupXxxHandlers()` 注册模块化处理器
4. 直接注册顶层通道（dialog、shell、window、Agent/Notebook/设置工作台等）

当前还承担两组内嵌 app 相关职责：

1. 创建 `EmbeddedAppRuntimeManager`
2. 注册 `embedded-app:*` 与 `hydro-agent:*` IPC 通道

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

### 内嵌 App 窗口与 IPC

当前内嵌 app 入口由 `embedded-app-registry.js` 维护，主进程通过 `openEmbeddedAppWindow(menuKey)` 统一打开对应页面。

窗口创建约束：

- 统一使用 `createSubWindow()`
- `preload` 仍为共享的 `preload.js`
- `contextIsolation: true`
- `nodeIntegration: false`
- `webviewTag: true`
- 默认 `startMaximized: true`

当前相关 IPC：

- `embedded-app:list`
- `embedded-app:open`
- `embedded-app:getPreferences`
- `embedded-app:updatePreferences`

当前 embedded agent 相关 IPC：

- 连接与上下文：`hydro-agent:connect`、`disconnect`、`updateContext`、`getContext`
- 会话：`createSession`、`listSessions`、`getSession`、`getMessages`、`sendMessage`、`close`、`reopen`
- 模型与能力：`switchApiProfile`、`setModel`、`getInitResult`、`getMcpServerStatus`、`getSupportedCommands`
- 交互：`respondInteraction`、`cancelInteraction`
- 工作目录：`listDir`、`readFile`、`saveFile`、`searchFiles`、`createFile`、`renameFile`、`deleteFile`、`openFile`、`openOutputDir`

### 内嵌 App 偏好存储

内嵌 app 偏好由 `EmbeddedAppPreferencesManager` 管理，当前只保存：

- `apiProfileId`
- `modelId`

存储位置仍在 `config.json` 内：

```json
{
  "settings": {
    "embeddedApps": {
      "preferences": {
        "hydrology-workbench": {
          "apiProfileId": "...",
          "modelId": "..."
        }
      }
    }
  }
}
```

这里保存的是“内嵌 app 默认偏好”，不是定时任务自己的模型快照。当前 embedded 定时任务已经不再单独维护任务级 `apiProfileId` / `modelId`。

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

下表里的 `<Claude profile>` 默认是 `~/.claude`；配置 HydroAgent 隔离目录后指向该目录。`<Claude profile json>` 默认是 `~/.claude.json`，隔离模式下是 `<Claude profile>/.claude.json`。

| 组件 | 位置 | 格式 |
|------|------|------|
| Skills | `<Claude profile>/skills/{id}/SKILL.md` | Markdown + YAML frontmatter |
| Agents | `<Claude profile>/agents/{id}.md` | Markdown + YAML frontmatter |
| Hooks | `<Claude profile>/hooks.json` (全局) / `.claude/hooks.json` (项目) | JSON |
| MCP | `<Claude profile json>` (user/local) / `.mcp.json` (project) | JSON |
| Plugins | `<Claude profile>/plugins/installed_plugins.json` | JSON |
| Settings | `<Claude profile>/settings.json` | JSON |

### 禁用状态

Skills 和 Agents 的禁用通过文件后缀标记：
- 启用：`SKILL.md` / `agent.md`
- 禁用：`SKILL.md.disabled` / `agent.md.disabled`

`toggleSkillDisabled()` / `toggleAgentDisabled()` 通过 `fs.rename` 切换后缀。

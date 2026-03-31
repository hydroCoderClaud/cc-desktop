# 集成系统设计

> CC Desktop v1.6.99 | [← 架构总览](../ARCHITECTURE.md) | [主进程设计](./main-process.md) | [渲染进程设计](./renderer.md)

本文档覆盖 CC Desktop 与外部系统的所有集成：钉钉桥接、MCP 管理、Skills/Agents/Hooks/Plugin 管理、能力市场、Settings 管理。

---

## 钉钉桥接

> 当前钉钉桥接已包含命令拦截与图片发送能力；历史命令规划见 `../DINGTALK-COMMAND-PLAN.md`，但该文档仅作历史参考，现行行为以代码为准。

> 核心文件：`src/main/managers/dingtalk-bridge.js`

### 架构概述

```
钉钉用户 → DingTalk Stream SDK (WebSocket)
  → DingTalkBridge._handleDingTalkMessage()
  → AgentSessionManager（复用 Agent 模式）
  → 文本回复走 sessionWebhook
  → 图片转发走 oToMessages/batchSend (单聊) 或 groupMessages/send (群聊)
```

DingTalkBridge 是**桥接层**，不直接处理 AI 逻辑，而是将钉钉消息转换为 Agent 会话消息，复用 `AgentSessionManager` 的完整能力。

### 连接管理

**Stream 模式连接**：

```
start() → _connect(appKey, appSecret) → DWClient.connect()
  → registerCallbackListener('/v1.0/im/bot/messages/get')
  → _hookSocketEvents() 监听 socket close
```

**断线重连策略**（三层保障）：

| 层级 | 机制 | 说明 |
|------|------|------|
| SDK 内置 | 1 秒后自动重连 | 仅一次尝试，失败静默放弃 |
| Watchdog | 10 秒后检查 `client.registered` | SDK 重连成功则同步状态 |
| 外层兜底 | `_watchdogRestart()` 指数退避 | 30s → 60s → ... → 最长 5 分钟 |

心跳间隔设为 30 秒（SDK 默认 8 秒过于频繁）。

### 消息处理流程

```
_handleDingTalkMessage(res)
  1. JSON 解析 + 消息去重（msgId + 10 分钟 TTL）
  2. / 命令拦截 → _handleCommand()
  3. 待选择状态检查 → _handlePendingChoice()
  4. 消息类型分派：
     - text → 纯文本
     - picture → _downloadImage() → { text, images }
     - richText → 文本 + 图片混合
  5. _ensureSession() → 查找/创建 Agent 会话
  6. Promise chain 串行处理 → _processOneMessage()
```

### 会话映射

```
sessionMap: Map<"staffId:conversationId", sessionId>
```

**会话查找/创建** (`_ensureSession`)：

1. 内存命中 → 检查 DB 状态（deleted/closed/active）→ 恢复或清理
2. DB 有历史 → 返回 `{ needsChoice: true, sessions }` → 发送选择菜单
3. 无历史 → `_createNewSession()` 新建

**历史会话选择菜单**：钉钉用户发消息时如有历史会话，发送编号菜单（最多 10 条），用户回复数字选择。选择后将触发菜单的原始消息自动投入处理队列。

### 图片处理

**入站**（钉钉 → Agent）：

- 图片消息 / 富文本图片 → `_downloadImage(downloadCode)` → base64 → `{ text, images }` 格式
- 通过 `agentSessionManager.sendMessage()` 发送，复用 Agent 模式的 Vision 能力

**出站**（Agent → 钉钉）：

- sessionWebhook **不支持图片消息**（仅 text/markdown/actionCard）
- 图片需走 API：`media/upload` 获取 mediaId → 按路由发送
- **单聊**（`conversationType !== '2'`）：`oToMessages/batchSend` + sampleImageMsg
- **群聊**（`conversationType === '2'`）：`groupMessages/send` + sampleImageMsg
- 图片路径从 tool_use 块的 input 参数提取（Read 工具最可靠）

### CC 桌面介入

钉钉会话在 CC Desktop 前端可见，用户可直接在桌面端输入消息：

- `_sessionWebhooks` Map 存储每个会话最近的 webhook 信息
- `_desktopPendingBlocks` 累积桌面端的文本/图片块
- Agent result 事件触发时，组装 Q&A 块发送回钉钉

### 消息串行化

同一会话的消息通过 **Promise chain** 串行处理，消除竞态：

```javascript
const prevTask = this._sessionProcessQueues.get(sessionId) || Promise.resolve()
const currentTask = prevTask
  .catch(() => {})  // 前一条出错不阻塞后续
  .then(() => this._processOneMessage(...))
this._sessionProcessQueues.set(sessionId, currentTask)
```

---

## MCP 管理

> 核心文件：`src/main/managers/mcp-manager.js` (545 行) + `mcp/market.js` (388 行)

### 四级来源架构

| 级别 | 存储位置 | 作用域 | 可编辑 |
|------|---------|--------|--------|
| **User** | `~/.claude.json` → `mcpServers` | 跨项目共享 | 是 |
| **Local** | `~/.claude.json` → `projects.<path>.mcpServers` | 项目私有 | 是 |
| **Project** | `<project>/.mcp.json` → `mcpServers` | 团队共享（Git 跟踪） | 是 |
| **Plugin** | `<plugin>/.mcp.json` → `mcpServers` | 插件自带 | 只读 |

`listMcpAll(projectPath)` 返回四级分组结果，前端 MCPTab 按来源分组显示。

### CRUD 操作

`createMcp` / `updateMcp` / `deleteMcp` 根据 `scope` 参数操作不同文件：

- User/Local → 读写 `~/.claude.json`（原子写入 `atomicWriteJson`）
- Project → 读写 `<project>/.mcp.json`
- Plugin → 只读，不支持 CRUD

### 代理注入

`applyProxyToAllMcps(proxyConfig)` 批量为所有 User scope MCP 注入/移除代理：

**启用代理时注入三个环境变量**：
```json
{
  "env": {
    "HTTPS_PROXY": "http://proxy:port",
    "HTTP_PROXY": "http://proxy:port",
    "NODE_OPTIONS": "-r \"~/.claude/proxy-support/proxy-setup.cjs\""
  }
}
```

**移除代理时**：删除 `HTTPS_PROXY`、`HTTP_PROXY`，仅当 `NODE_OPTIONS` 包含 `proxy-setup.cjs` 时才删除（避免误删用户自定义 NODE_OPTIONS）。

### MCP 启闭

两种机制：

1. **文件级禁用**（`toggleMcpDisabled`）：写入 `~/.claude.json` 的 `projects.<path>.disabledMcpServers` 数组
2. **运行时启闭**（Agent 模式）：通过 `queryGenerator.toggleMcpServer(name, enabled)` 对当前会话立即生效

---

## Skills 管理

> 核心文件：`src/main/managers/skills/` (6 个 mixin 模块，共 1087 行)

### 三级架构

| 级别 | 路径 | 调用方式 | 可编辑 |
|------|------|---------|--------|
| 插件级 (只读) | `~/.claude/plugins/{plugin}/skills/` | `/plugin-name:skill-id` | 否 |
| 用户全局 | `~/.claude/skills/` | `/skill-id` | 是 |
| 工程级别 | `{project}/.claude/skills/` | `/skill-id` | 是 |

每个 Skill 是一个**目录**，包含 `SKILL.md`（主文件）和可选的辅助文件。

### Mixin 模块设计

`SkillsManager` 继承 `ComponentScanner`，通过 `Object.assign` 混入 5 个功能模块：

| 模块 | 行数 | 职责 |
|------|------|------|
| `utils.js` | 158 | 路径解析、SKILL.md 读取、Front Matter 解析（js-yaml） |
| `crud.js` | 267 | 创建/更新/删除/重命名/启禁用 |
| `import.js` | 291 | 从 JSON/ZIP/Market 导入 |
| `export.js` | 114 | 导出为 JSON（含多文件打包） |
| `market.js` | 219 | 市场安装/卸载（HTTP 下载 + 解压） |

### 启禁用机制

- **启用**：`SKILL.md` 存在
- **禁用**：重命名为 `SKILL.md.disabled`（文件级，不删除内容）
- CapabilityManager 检测状态时检查两种后缀

---

## Agents 管理

> 核心文件：`src/main/managers/agents/` (6 个 mixin 模块，共 1187 行)

### 三级架构

| 级别 | 路径 | 触发方式 | 可编辑 |
|------|------|---------|--------|
| 插件级 (只读) | `~/.claude/plugins/{plugin}/agents/` | 自动（Claude 根据 description 选择） | 否 |
| 用户全局 | `~/.claude/agents/` | 自动 | 是 |
| 工程级别 | `{project}/.claude/agents/` | 自动 | 是 |

与 Skills 不同，Agent 是**单个 .md 文件**（不是目录）。

### Mixin 模块

同 Skills 架构，5 个 mixin：`utils`、`crud`、`import`、`export`、`market`。

---

## Hooks 管理

> 核心文件：`src/main/managers/hooks-manager.js` (462 行)

### 13 种事件类型

| 事件 | 说明 | 可阻止 |
|------|------|--------|
| PreToolUse | 工具调用前 | 是 |
| PostToolUse | 工具调用后 | 否 |
| PostToolUseFailure | 工具调用失败后 | 否 |
| PermissionRequest | 权限请求时 | 是 |
| Notification | 通知时 | 否 |
| UserPromptSubmit | 用户提交提示词后 | 是 |
| SessionStart | 会话开始 | 否 |
| SessionEnd | 会话结束 | 否 |
| Stop | Claude 停止响应时 | 是 |
| SubagentStart | 子代理启动 | 否 |
| SubagentStop | 子代理停止 | 否 |
| PreCompact | 上下文压缩前 | 否 |
| Setup | 设置时 | 否 |

### 3 种 Hook 类型

| 类型 | 执行方式 | 关键字段 |
|------|---------|---------|
| `command` | 执行 shell 命令 | `command`, `timeout`, `statusMessage`, `once`, `async` |
| `prompt` | 注入提示词 | `prompt`, `timeout`, `model`, `statusMessage`, `once` |
| `agent` | 启动子代理 | `prompt`, `timeout`, `model`, `statusMessage`, `once` |

### 数据来源

- **全局**：`~/.claude/settings.json` → `hooks` 字段
- **项目级**：`.claude/settings.local.json` → `hooks` 字段
- **插件**：`{plugin}/hooks/hooks.json`

Hooks 由 Claude Code CLI 在事件发生时自动执行，CC Desktop 仅提供管理 UI（CRUD）。

---

## Plugin 系统

> 核心文件：`src/main/plugin-manager.js` (272 行) + `src/main/managers/plugin-cli.js` (330 行)

### 唯一数据源

`~/.claude/plugins/installed_plugins.json` — 所有插件的安装注册表。

**插件 ID 格式**：`{plugin-name}@{marketplace}`

### PluginManager

继承 `ComponentScanner`，负责：

- 读取已安装插件列表（从 `installed_plugins.json`）
- 读取启用/禁用状态（从 `settings.json` → `enabledPlugins`）
- 初始化 4 个组件管理器：`SkillsManager`、`AgentsManager`、`HooksManager`、`McpManager`

### PluginCli

封装 Claude Code CLI 的 `plugin` 子命令：

| 方法 | CLI 命令 | 说明 |
|------|---------|------|
| `listAvailable()` | `claude plugin list --available --json` | 列出已安装 + 市场可用 |
| `install(id)` | `claude plugin install <id>` | 安装插件 |
| `uninstall(id)` | `claude plugin uninstall <id>` | 卸载插件 |
| `update(id)` | `claude plugin update <id>` | 更新插件 |

**错误精确归因** (`_refineNotFoundError`)：安装失败时区分两种原因：
- "市场未注册" → 提示用户添加市场
- "插件不存在" → 提示检查插件名称

---

## 能力市场 (Capability Manager)

> 核心文件：`src/main/managers/capability-manager.js` (679 行)

### 数据模型 v1.1

一能力一组件 — 每个 capability 直接对应一个 skill/agent/plugin/mcp：

```json
{
  "id": "my-skill",
  "name": "示例技能",
  "type": "skill",
  "componentId": "my-skill",
  "category": "code-review"
}
```

### 清单来源

`{registryUrl}/agent-capabilities.json` — 远程拉取，支持主源 + 镜像 fallback。

### 安装状态检测

`checkComponentInstalled(type, componentId, projectPath)` 按类型分派：

| 类型 | installed | disabled |
|------|-----------|----------|
| skill | `~/.claude/skills/{id}/SKILL.md` 存在 | `SKILL.md.disabled` 存在 |
| agent | `~/.claude/agents/{id}.md` 存在 | `{id}.md.disabled` 存在 |
| plugin | `installed_plugins.json` 有记录 | `settings.json` enabledPlugins 为 false |
| mcp | User scope 有该 MCP | `disabledMcpServers` 包含该名称 |

### 缓存与更新检测

- 本地缓存：`{userData}/capabilities-cache.json`（含 SHA-256 hash）
- `checkForCapabilityUpdates()`：对比远程 hash 与本地缓存 → 设置 `hasCapabilityUpdate` badge

### 市场自动注册

Plugin 类型安装失败且市场未注册时，自动根据 `marketplace` 字段调用 `claude plugin marketplace add` 注册后重试。

---

## Settings 管理

> 核心文件：`src/main/managers/settings-manager.js` (405 行)

### 职责划分

| 字段 | 管理者 |
|------|--------|
| `permissions` | SettingsManager |
| `env` | SettingsManager |
| `hooks` | HooksManager |
| `enabledPlugins` | PluginManager |
| `mcpServers` / `disabledMcpServers` | McpManager |

SettingsManager 写入时**保留其他字段不变**（只修改 permissions/env）。

### 双级别配置

| 级别 | 路径 | 作用域 |
|------|------|--------|
| Global | `~/.claude/settings.json` | 全局 |
| Project | `{project}/.claude/settings.local.json` | 项目 |

### ComponentScanner 基类

`SettingsManager`、`SkillsManager`、`AgentsManager`、`HooksManager`、`McpManager` 均继承 `ComponentScanner` (236 行)，提供：

- `_readInstalledPlugins()` — 读取插件注册表
- `_readSettings()` / `_readEnabledPlugins()` — 读取全局设置
- `getEnabledPluginPaths()` — 获取已启用插件的安装路径
- `readJsonFile()` — 通用 JSON 读取
- `getProjectClaudeDir()` — 获取项目 `.claude/` 目录

YAML 解析使用 `js-yaml` 库（Skills/Agents 的 Front Matter 解析）。

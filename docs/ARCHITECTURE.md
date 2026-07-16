# Hydro Desktop 架构总览

> v1.7.90 | 本文档是架构设计的入口，概述整体设计和模块关系，详细实现见各子文档。

---

## 设计理念

> **Hydro Desktop = Claude Code 的本地 Agent 工作台**

Hydro Desktop（仓库 / 包名仍为 `cc-desktop`）是独立的 Electron 桌面应用，围绕 Claude Code 提供项目化 Agent 对话、Notebook 工作台、能力设置、桌面端定时任务，以及多渠道 IM 桥接能力（钉钉、飞书、企业微信、微信）。

**核心原则**：
- **单用户无认证** -- 无 JWT、无用户管理，所有数据纯本地
- **单实例桌面宿主** -- 应用在 Windows / macOS 均强制单实例运行，共享同一 `userData` 目录；再次启动时只唤起已运行实例，macOS 在进程存活但窗口已关闭时会重建主窗口
- **工作台架构** -- 主 Agent 工作台 + Notebook 工作台 + 能力设置工作台
- **直接 IPC 通信** -- 无 WebSocket，主进程与渲染进程通过 Electron IPC 直连
- **Claude runtime 边界** -- Agent 工作流固定使用内置 bundled Claude runtime；插件市场与插件生命周期管理已由桌面端主进程内建 runtime 独立处理

---

## 技术栈

| 层次 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面框架 | Electron | 40 | 跨平台桌面应用 |
| 主进程 | Node.js | Electron 内置 | 进程管理、文件操作、数据库 |
| 渲染进程 | Vue 3 (Composition API) | 3.5 | UI 框架 |
| UI 组件库 | Naive UI | 2.43 | 表单、弹窗、导航 |
| AI SDK | @anthropic-ai/claude-agent-sdk | 0.2 | Agent 模式 Streaming HTTP |
| 数据库 | better-sqlite3 | 12.6 | 本地 SQLite（会话/项目/消息） |
| 构建 | Vite + electron-builder | 5.4 / 26 | 前端构建 + 应用打包 |
| 自动更新 | electron-updater | 6.7 | 差分更新 + 双源 fallback |
| 测试 | Vitest | 2.1 | 单元测试 |

---

## 进程架构

```
┌─────────────────────────────────────────────────────────┐
│  Electron 主进程 (Node.js)                               │
│                                                         │
│  ┌─────────────┐                      ┌────────────┐ │
│  │ ConfigMgr   │                      │ AgentSess  │ │
│  │ (config.json)                      │ Mgr (SDK)  │ │
│  └─────────────┘                      └────────────┘ │
│         │                                    │        │
│  ┌──────┴──────┐  ┌──────────────────┐  ┌─────┴──────┐ │
│  │ SessionDB   │  │ UpdateManager    │  │ IM Bridges │ │
│  │ (SQLite)    │  │ (electron-updater)│  │ (4 渠道)   │ │
│  └─────────────┘  └──────────────────┘  └────────────┘ │
│  └─────────────┘  └──────────────────┘  └────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ IPC Handlers (22 模块, 270+ 通道)                  │   │
│  └──────────────────────────────────────────────────┘   │
│         ↕ contextBridge (preload.js)                    │
├─────────────────────────────────────────────────────────┤
│  Electron 渲染进程 (Browser)                             │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Vue 3 + Naive UI                                 │   │
│  │ 12 个 BrowserWindow 页面入口                      │   │
│  │ 21 个 Composables                                │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 主要数据流

### Agent 工作流（对话）

```
用户发送消息 → IPC agent:sendMessage
  → AgentSessionManager.sendMessage()
  → MessageQueue.push() → SDK query() → bundled Claude runtime
  → _runOutputLoop() → 逐块 IPC agent:stream/message/result → 前端渲染
```

支持多轮对话（MessageQueue 常驻），CLI 进程退出后自动 resume。

### 钉钉 / 飞书 / 企业微信桥接模式

```
IM 用户发消息 → 平台 Stream/WS → DingTalk / Feishu / EnterpriseWeixin Bridge
  → AgentSessionManager（复用 Agent 模式）
  → 钉钉：文本回复走 sessionWebhook，图片走 API
  → 飞书：文本回复走 REST API
  → 企业微信：文本/图片回复走同一条 WS (replyStream)
```

当前三端已经共享统一的 IM 会话判断模型：

- 会话对象统一使用 `type: 'chat'`
- IM 入站创建统一使用 `source: 'im-inbound'`
- 渠道判断统一使用 `imChannel`
- 数据库存储统一使用 `im_channel / im_user_id / im_chat_id / im_chat_type`

用户可见现象也已对齐到同一套语义：

- 首次入站建会话
- 主动绑定后入站复用
- `/status`
- `/resume`
- `/new`
- `/close`
- 解绑后防复活
- 桌面介入回传

### 微信通知与桥接模式

```
微信用户扫码授权并发送首条消息
  → WeixinNotifyService（iLink HTTP 长轮询）
  → WeixinBridge
  → AgentSessionManager（复用 Agent 模式）
  → 文本/图片在桌面与微信双向流转
```

当前微信仍保留“双层结构”而不是并入三端深共享桥：

- `WeixinNotifyService` 负责授权、目标捕获、后台轮询、文本/图片发送
- `WeixinBridge` 负责会话路由、会话绑定、命令语义和桌面回传

本轮新增的统一能力主要是：

- 标准运行开关 `weixin.enabled`
- 标准运行状态 `weixin:getStatus` / `weixin:statusChange`
- 标准运行控制 `weixin:start` / `weixin:stop` / `weixin:restart`
- 标准轮询配置 `weixin.pollIntervalMs` / `weixin.pollTimeoutMs`
- 设置页与工具栏按照 bridge 是否启用联动显示

### 桌面定时任务

```
聊天中的定时任务草案 / 设置工作台编辑
  → scheduled-task:* IPC
  → ScheduledTaskService
  → AgentSessionManager（执行任务）
  → SQLite 记录任务定义 / 运行历史
  → scheduled-task:changed 通知前端刷新
```

### 内嵌 App 模式

```
主窗口菜单 / Notebook 入口
  → embedded-app:list / embedded-app:open
  → embedded-app-registry.js 选择 app 定义
  → createSubWindow() 打开独立 BrowserWindow 页面
  → EmbeddedAgentPanel + hydroAgent bridge 建立 embedded client
  → EmbeddedAppRuntimeManager 持有当前 app context / command bridge / currentSessionId
  → AgentSessionManager 在会话级注入 embeddedapp / hydrology 能力
  → Agent 对话 / 工作目录 与业务页面并行协作
```

补充现状：

- embedded app 的“当前会话”不是纯前端概念，主进程运行态也会记录 `appId -> currentSessionId`
- 这条指针会被 embedded 定时任务 `sessionBindingMode=current` 复用，因此 `/clear` 和“新建会话”后，任务会自动跟到新的当前会话
- 如果某个 app 当前没有可跟随会话，相关任务会 `skip`，而不是回落到独立任务会话

当前已落地并保留入口的内嵌 app 页面：

- `hydrology-workbench`

---

## 模块地图

### 主进程（112 个文件）

| 类别 | 文件数 | 关键模块 |
|------|--------|---------|
| 顶层模块 | 13 | index.js, config-manager.js, agent-session-manager.js, session-database.js, update-manager.js, plugin-runtime/ |
| IPC Handlers | 21 | 完整 handler 文件列表见 [IPC 通道清单](code-index/ipc-channels.md) |
| Managers | 23 | capability, dingtalk-bridge, weixin-bridge, weixin-notify-service, scheduled-task-service, notebook, agent-file, agent-query 等 |
| Embedded App 支撑 | 4+ | embedded-app-registry, embedded-app-runtime-manager, embedded-app-capability-query-options, embedded-app-preferences-manager |
| Plugin Runtime | 9 | PluginService.js + core/(plugins, marketplaces, installed-registry, state-lock, source, paths) + adapters/ |
| Database | 11 | 位于 database/ 目录，含 project/session/message/agent/tag/prompt/prompt-market/favorite/queue/scheduled-task 共 10 个 mixin + session-database 入口 |
| Utils | 16 | env-builder, http-client, path-utils, constants, message-queue, ipc-utils 等 |
| Config | 2 | api-config, provider-config |

> 兼容说明：`src/main/managers/plugin-cli.js` 仍保留在仓库中，但已标注废弃，仅作为历史兼容与排障入口，不再参与主流程。

### 渲染进程（含主窗口 + Notebook + Settings Workbench）

| 类别 | 文件数 | 关键模块 |
|------|--------|---------|
| 页面（11 个 BrowserWindow 页面入口） | 90+ | 10 个传统桌面页面：main + notebook + 8 个管理窗口；1 个内嵌 app 页面：hydrology-workbench |
| Composables | 28 | useAppMode, useAgentChat, useTabManagement, useTheme, useLocale, useIPC, useAgentFiles, useAgentPanel, useAgentLocalCommands 等（完整列表见 [渲染进程索引](code-index/renderer.md)） |
| 内嵌 App 共享组件 | 3+ | EmbeddedAgentPanel, embedded-app-runtime-bridge, useEmbeddedAgentFiles, WorkspaceFilePanel |
| 共享组件 | 6 | Toast, MarketModal, VersionBadge |
| 国际化 | 3 | zh-CN, en-US, useLocale |

---

## 安全模型

| 机制 | 说明 |
|------|------|
| Context Isolation | 启用，渲染进程无法直接访问 Node.js API |
| Node Integration | 禁用 |
| contextBridge | preload.js 仅暴露 `window.electronAPI` 白名单 API |
| webviewTag | 启用（当前用于子窗口中的 HTML/URL 预览能力） |
| 配置写入 | `atomicWriteJson()`（先写临时文件再 rename，防止写入中断导致损坏） |
| IPC 安全发送 | `safeSend()` 在发送前检查窗口/webContents 是否存活 |
| macOS 安装脚本 | 版本号正则校验 + 路径通过环境变量传入（防注入） |

---

## 数据存储

Claude profile 相关路径由 `settings.agent.claudeConfigDir` 决定：留空时保持 Claude Code 默认行为，使用 `~/.claude` 与 `~/.claude.json`；填写 HydroAgent 配置目录时，CLI 进程会注入 `CLAUDE_CONFIG_DIR`，下表中的 `<Claude profile>` 指向该目录，`<Claude profile json>` 指向该目录下的 `.claude.json`。

| 数据 | 位置 | 格式 |
|------|------|------|
| 应用配置 | `{userData}/config.json` | JSON |
| 会话数据库 | `{userData}/sessions.db` | SQLite（11 张表 + FTS5） |
| 更新状态 | `{userData}/update-state.json` | JSON |
| CLI 会话历史 | `<Claude profile>/projects/{encodedPath}/*.jsonl` | JSONL（只读） |
| Skills | `<Claude profile>/skills/{id}/SKILL.md` | Markdown + YAML |
| Agents | `<Claude profile>/agents/{id}.md` | Markdown + YAML |
| Hooks | `<Claude profile>/hooks.json` | JSON |
| MCP 配置 | `<Claude profile json>` | JSON |
| Settings | `<Claude profile>/settings.json` | JSON |
| Plugin 市场源 | `<Claude profile>/plugins/known_marketplaces.json` | JSON |
| Plugins | `<Claude profile>/plugins/installed_plugins.json` | JSON |

`{userData}` = `%APPDATA%/cc-desktop`（Windows）或 `~/Library/Application Support/cc-desktop`（macOS）

---

## 文档导航

### 设计文档

| 文档 | 内容 | 行数 |
|------|------|------|
| [主进程设计](design/main-process.md) | 应用生命周期、配置管理、Agent 工作流、数据存储、自动更新、IPC 架构、插件系统 | ~500 |
| [渲染进程设计](design/renderer.md) | 页面架构、三栏布局、Agent/Notebook 工作台 UI、Tab 管理、Composables、主题系统 | ~400 |
| [设计文档分类索引](design/README.md) | 按主程序 / 内嵌 App / 独立 App / 水文工作台分类导航全部设计文档 | — |
| [内嵌 App 设计与实现标准](design/embedded-app/embedded-app-development-standard.md) | 内嵌 app 架构分层、复用约束、水文工作台案例与验收清单 | — |
| [内嵌 App 开发 SOP](design/embedded-app/embedded-app-development-sop.md) | 新增一个内嵌 app 的执行流程、阶段检查点、常见失败模式与提交前检查 | — |
| [集成系统设计](design/integrations.md) | IM 桥接、MCP/Skills/Agents/Hooks/Plugin 管理、能力市场、Settings 管理 | ~370 |
| [IM Bridge 架构](design/im-bridge-refactoring.md) | 当前钉钉 / 飞书 / 企业微信 / 微信桥接架构与共享层边界 | — |
| [IM 会话字段与绑定模型](design/im-session-fields-and-binding.md) | IM 字段、单聊/群聊语义、运行态绑定模型 | — |
| [设计系统](design/design-system.md) | UI 规范（颜色、间距、组件样式约定） | — |
| [图片识别](design/image-recognition.md) | 图片粘贴/上传 → base64 → Vision API | — |

### 代码索引

| 文档 | 内容 |
|------|------|
| [主进程代码索引](code-index/main.md) | 89 个文件的行数、职责、关键方法 |
| [渲染进程代码索引](code-index/renderer.md) | 150+ 个文件的行数、职责、关键导出 |
| [IPC 通道索引](code-index/ipc-channels.md) | 270+ 个 IPC 通道的完整清单 |

### 按主题速查

| 我想了解... | 去哪里 |
|------------|--------|
| 应用启动流程 | [主进程设计 § 应用生命周期](design/main-process.md#应用生命周期) |
| Agent 消息发送 | [主进程设计 § Agent 模式](design/main-process.md#agent-模式) |
| 前端组件结构 | [渲染进程索引 § 主页组件树](code-index/renderer.md#主页组件树) |
| Tab 为什么用双数组 | [渲染进程设计 § Tab 管理](design/renderer.md#tab-管理双数组模式) |
| IM 桥接整体如何工作 | [IM Bridge 架构](design/im-bridge-refactoring.md) |
| IM 字段和绑定规则 | [IM 会话字段与绑定模型](design/im-session-fields-and-binding.md) |
| 钉钉如何对接 | [集成系统 § 钉钉桥接](design/integrations.md#钉钉桥接) |
| MCP 服务器管理 | [集成系统 § MCP 管理](design/integrations.md#mcp-管理) |
| 添加新 IPC 通道 | [主进程设计 § IPC 注册架构](design/main-process.md#ipc-注册架构) |
| 某个通道做什么 | [IPC 通道清单](code-index/ipc-channels.md) |
| 自动更新机制 | [主进程设计 § 自动更新](design/main-process.md#自动更新) |
| 主题如何切换 | [渲染进程设计 § 主题系统](design/renderer.md#主题系统) |
| Skills/Agents/Hooks | [集成系统 § Skills 管理](design/integrations.md#skills-管理) |
| 数据库表结构 | [主进程设计 § 数据存储](design/main-process.md#数据存储) |

### 其他文档

| 文档 | 说明 |
|------|------|
| [CHANGELOG](CHANGELOG.md) | 版本更新日志 |
| [QUICKSTART](QUICKSTART.md) | 快速开始 |
| [BUILD](BUILD.md) | 构建说明 |
| [INSTALL](INSTALL.md) / [INSTALL_EN](INSTALL_EN.md) | 安装指南（中/英） |
| [ROADMAP](ROADMAP.md) | 产品路线图 |
| [ADMIN-URL-CONFIG](ADMIN-URL-CONFIG.md) | 管理员源地址配置手册 |

---

## 环境依赖

| 依赖 | 开发模式 | 生产模式 | 说明 |
|------|---------|---------|------|
| Node.js | 需要 | 不需要 | 开发工具链；生产由 Electron 自带 |
| Claude Code CLI | 需要 | 需要 | Agent 模式及 MCP 服务器依赖；插件市场与插件生命周期管理已不再依赖 `claude plugin ...` |

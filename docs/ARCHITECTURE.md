# CC Desktop 架构总览

> v1.7.49+ | 本文档是架构设计的入口，概述整体设计和模块关系，详细实现见各子文档。

---

## 设计理念

> **Desktop = Claude Code CLI 的本地桌面宿主 + AI 工作台**

CC Desktop 是独立的 Electron 桌面应用，围绕 Claude Code CLI 提供本地桌面工作流、Agent 对话、Notebook 工作台和钉钉桥接能力。

**核心原则**：
- **单用户无认证** -- 无 JWT、无用户管理，所有数据纯本地
- **多模式架构** -- Developer 模式 + Agent 模式 + Notebook 模式
- **直接 IPC 通信** -- 无 WebSocket，主进程与渲染进程通过 Electron IPC 直连
- **CLI 依赖边界** -- Terminal/Agent 模式及 MCP 服务器仍依赖 Claude Code CLI；插件市场与插件生命周期管理已由桌面端主进程内建 runtime 独立处理

---

## 技术栈

| 层次 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面框架 | Electron | 40 | 跨平台桌面应用 |
| 主进程 | Node.js | Electron 内置 | 进程管理、文件操作、数据库 |
| 渲染进程 | Vue 3 (Composition API) | 3.5 | UI 框架 |
| UI 组件库 | Naive UI | 2.43 | 表单、弹窗、导航 |
| 终端模拟 | node-pty + xterm.js | -- | PTY 管理 + 终端渲染 |
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
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ ConfigMgr   │  │ ActiveSessionMgr │  │ AgentSess  │ │
│  │ (config.json)│  │ (多 PTY 终端)     │  │ Mgr (SDK)  │ │
│  └─────────────┘  └──────────────────┘  └────────────┘ │
│         │            ↕ setPeerManager ↕        │        │
│  ┌──────┴──────┐  ┌──────────────────┐  ┌─────┴──────┐ │
│  │ SessionDB   │  │ UpdateManager    │  │ DingTalk   │ │
│  │ (SQLite)    │  │ (electron-updater)│  │ Bridge     │ │
│  └─────────────┘  └──────────────────┘  └────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ IPC Handlers (12 模块, 175 通道)                   │   │
│  └──────────────────────────────────────────────────┘   │
│         ↕ contextBridge (preload.js)                    │
├─────────────────────────────────────────────────────────┤
│  Electron 渲染进程 (Browser)                             │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Vue 3 + Naive UI + xterm.js                      │   │
│  │ 11 个独立 BrowserWindow 页面                      │   │
│  │ 21 个 Composables                                │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 双模式数据流

### Developer 模式（Terminal）

```
用户在终端输入 → xterm.onData → IPC terminal:write
  → ActiveSessionManager → pty.write → Shell 处理
  → Shell 输出 → pty.onData → IPC session:data → xterm.write
```

多个终端会话并发运行，可后台保持（关闭 Tab 不终止进程）。

### Agent 模式（对话）

```
用户发送消息 → IPC agent:sendMessage
  → AgentSessionManager.sendMessage()
  → MessageQueue.push() → SDK query() → Claude Code CLI (Streaming HTTP)
  → _runOutputLoop() → 逐块 IPC agent:stream/message/result → 前端渲染
```

支持多轮对话（MessageQueue 常驻），CLI 进程退出后自动 resume。

### 钉钉桥接模式

```
钉钉用户发消息 → DWClient Stream → DingTalkBridge
  → AgentSessionManager（复用 Agent 模式）
  → 文本回复走 sessionWebhook
  → 图片转发走 API（单聊 batchSend / 群聊 groupMessages）
```

---

## 模块地图

### 主进程（102 个文件）

| 类别 | 文件数 | 关键模块 |
|------|--------|---------|
| 顶层模块 | 13 | index.js, config-manager.js, agent-session-manager.js, active-session-manager.js, session-database.js, update-manager.js |
| IPC Handlers | 12 | agent, plugin, ai, config, prompt, project, session, active-session, capability, update, dingtalk, queue |
| Managers | 32 | capability, dingtalk-bridge, hooks, mcp, settings, agent-file, agent-query, skills/\*, agents/\* |
| Plugin Runtime | 9 | plugin-runtime/PluginService, core/plugins, core/marketplaces, core/installed-registry, core/state-lock |
| Database | 10 | project-db, session-db, message-db, agent-db, tag-db, prompt-db, prompt-market-db, favorite-db, queue-db |
| Utils | 10 | env-builder, http-client, path-utils, constants, message-queue, ipc-utils, token-counter |
| Config | 2 | api-config, provider-config |

> 兼容说明：`src/main/managers/plugin-cli.js` 仍保留在仓库中，但已标注废弃，仅作为历史兼容与排障入口，不再参与主流程。

### 渲染进程（含主窗口 + Notebook + Settings Workbench）

| 类别 | 文件数 | 关键模块 |
|------|--------|---------|
| 页面（11 个窗口） | 90+ | main, notebook, settings-workbench, dingtalk-settings, session-manager, profile-manager, provider-manager, update-manager |
| Composables | 21 | useAppMode, useAgentChat, useTabManagement, useTheme, useLocale, useIPC |
| 共享组件 | 6 | Toast, MarketModal, VersionBadge |
| 国际化 | 3 | zh-CN, en-US, useLocale |

---

## 安全模型

| 机制 | 说明 |
|------|------|
| Context Isolation | 启用，渲染进程无法直接访问 Node.js API |
| Node Integration | 禁用 |
| contextBridge | preload.js 仅暴露 `window.electronAPI` 白名单 API |
| webviewTag | 启用（仅用于右侧面板 URL 预览） |
| 配置写入 | `atomicWriteJson()`（先写临时文件再 rename，防止写入中断导致损坏） |
| IPC 安全发送 | `safeSend()` 在发送前检查窗口/webContents 是否存活 |
| macOS 安装脚本 | 版本号正则校验 + 路径通过环境变量传入（防注入） |

---

## 数据存储

| 数据 | 位置 | 格式 |
|------|------|------|
| 应用配置 | `{userData}/config.json` | JSON |
| 会话数据库 | `{userData}/sessions.db` | SQLite（11 张表 + FTS5） |
| 更新状态 | `{userData}/update-state.json` | JSON |
| CLI 会话历史 | `~/.claude/projects/{encodedPath}/*.jsonl` | JSONL（只读） |
| Skills | `~/.claude/skills/{id}/SKILL.md` | Markdown + YAML |
| Agents | `~/.claude/agents/{id}.md` | Markdown + YAML |
| Hooks | `~/.claude/hooks.json` | JSON |
| MCP 配置 | `~/.claude.json` | JSON |
| Settings | `~/.claude/settings.json` | JSON |
| Plugin 市场源 | `~/.claude/plugins/known_marketplaces.json` | JSON |
| Plugins | `~/.claude/plugins/installed_plugins.json` | JSON |

`{userData}` = `%APPDATA%/cc-desktop`（Windows）或 `~/Library/Application Support/cc-desktop`（macOS）

---

## 文档导航

### 设计文档

| 文档 | 内容 | 行数 |
|------|------|------|
| [主进程设计](design/main-process.md) | 应用生命周期、配置管理、Terminal/Agent 模式、数据存储、自动更新、IPC 架构、插件系统 | ~500 |
| [渲染进程设计](design/renderer.md) | 页面架构、三栏布局、Developer/Agent 模式 UI、Tab 管理、Composables、主题系统 | ~400 |
| [集成系统设计](design/integrations.md) | 钉钉桥接、MCP/Skills/Agents/Hooks/Plugin 管理、能力市场、Settings 管理 | ~370 |
| [设计系统](design/design-system.md) | UI 规范（颜色、间距、组件样式约定） | — |
| [会话管理设计](design/session-management.md) | 会话持久化与同步管道 | — |
| [图片识别](design/image-recognition.md) | 图片粘贴/上传 → base64 → Vision API | — |

### 代码索引

| 文档 | 内容 |
|------|------|
| [主进程代码索引](code-index/main.md) | 63 个文件的行数、职责、关键方法 |
| [渲染进程代码索引](code-index/renderer.md) | 126 个文件的行数、职责、关键导出 |
| [IPC 通道索引](code-index/ipc-channels.md) | 175 个 IPC 通道的完整清单 |

### 按主题速查

| 我想了解... | 去哪里 |
|------------|--------|
| 应用启动流程 | [主进程设计 § 应用生命周期](design/main-process.md#应用生命周期) |
| Agent 消息发送 | [主进程设计 § Agent 模式](design/main-process.md#agent-模式) |
| 前端组件结构 | [渲染进程索引 § 主页组件树](code-index/renderer.md#主页组件树) |
| Tab 为什么用双数组 | [渲染进程设计 § Tab 管理](design/renderer.md#tab-管理双数组模式) |
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
| Claude Code CLI | 需要 | 需要 | Terminal/Agent 模式及 MCP 服务器依赖；插件市场与插件生命周期管理已不再依赖 `claude plugin ...` |

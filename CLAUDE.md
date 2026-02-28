# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Claude Code Desktop 是独立的 Electron 桌面终端应用，作为 Claude Code CLI 的启动器。

**当前版本**：1.6.64

**版本号管理规范**：
- 格式：`主版本.次版本.修订号`（如 1.6.52）
- **升级规则**：每次发布只递进修订号，如 1.6.51 → 1.6.52
- 版本号需同步更新：`package.json`、`CLAUDE.md`、`docs/CHANGELOG.md`

**核心理念**：Desktop = Claude Code CLI Launcher + Terminal Emulator

**双模式架构**：Terminal 模式（PTY 直连 CLI）+ Agent 模式（Streaming HTTP API 对话）

**环境依赖**：

| 依赖 | 开发模式 | 生产模式 | 说明 |
|------|---------|---------|------|
| **Node.js** | 需要 | 不需要 | 开发工具链必需；生产由 Electron 自带 |
| **Claude Code CLI** | 需要 | 需要 | Terminal/Agent 模式及 MCP 服务器均依赖 |

## 开发命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（自动打开 DevTools）
npm run build:win    # Windows 构建（CI 用）
npm run build:mac    # macOS 构建（CI 用）
npm run build:win:local  # Windows 本地构建（EXE + 安装包）
npm run build:mac:local  # macOS 本地构建（DMG + 安装包）
npm run build:linux  # Linux 构建
npm test             # 运行测试
npm run test:watch   # 监听模式
npm run rebuild:sqlite   # 原生模块重建（编译问题时使用）
```

**开发提示**：
- F12 切换 DevTools
- 配置文件：`%APPDATA%/cc-desktop/config.json` (Windows) 或 `~/.config/cc-desktop/config.json` (macOS)
- 测试文件位于 `tests/` 目录，使用 Vitest 框架
- 测试中 better-sqlite3 使用 Mock（Electron ABI 与系统 Node.js 不兼容）

## 架构

### 设计原则

1. **单用户无认证** - 无 JWT、无用户管理
2. **多会话并发** - 支持同时运行多个终端会话，可后台运行
3. **直接 IPC 通信** - 无 WebSocket
4. **纯本地** - 所有数据存储在本地 AppData

### 数据流

**Terminal 模式**：
```
用户点击项目 → IPC: terminal:start → TerminalManager.start()
  → PTY spawn shell (cwd: projectPath) → 注入 ANTHROPIC_API_KEY
  → PTY.onData → IPC:terminal:data → xterm.write()
```

**Agent 模式**：
```
用户发送消息 → agent:sendMessage → AgentSessionManager.sendMessage()
  → Streaming HTTP → Claude Code CLI API → agent:stream → 前端逐块渲染

图片识别：粘贴/上传 → base64 → { text, images } → Claude API Vision 格式
```

**钉钉桥接模式**：
```
钉钉用户发消息 → DWClient Stream → DingTalkBridge._handleDingTalkMessage()
  → AgentSessionManager（复用 Agent 模式） → 文本回复走 sessionWebhook
  → 图片转发走 oToMessages/batchSend API 接口（混合发送模式）

图片识别：钉钉图片 → 下载 → base64 → Agent 识别
图片转发：tool_use 中的图片路径 → media/upload → batchSend
```

## 文件结构

```
src/
├── main/
│   ├── index.js                  # 应用入口
│   ├── config-manager.js         # 配置管理
│   ├── terminal-manager.js       # PTY 管理（Terminal 模式）
│   ├── agent-session-manager.js  # Agent 会话管理（Agent 模式）
│   ├── active-session-manager.js # 活动会话管理
│   ├── update-manager.js         # 自动更新（electron-updater，支持差分更新）
│   ├── plugin-manager.js         # 插件管理
│   ├── component-scanner.js      # 组件扫描基础类
│   ├── session-database.js       # 会话数据库入口
│   ├── session-history-service.js # 历史会话服务
│   ├── session-sync-service.js   # 会话同步服务
│   ├── session-file-watcher.js   # 会话文件监听
│   ├── ipc-handlers.js           # IPC 注册入口
│   ├── database/                 # SQLite 数据库模块
│   │   ├── index.js              # DB 统一入口
│   │   ├── agent-db.js           # Agent 会话/消息存储
│   │   ├── session-db.js         # Terminal 会话存储
│   │   ├── project-db.js         # 项目存储
│   │   ├── message-db.js         # 消息存储
│   │   ├── prompt-db.js          # Prompt 存储
│   │   ├── prompt-market-db.js   # Prompt 市场存储
│   │   ├── favorite-db.js        # 收藏存储
│   │   ├── tag-db.js             # 标签存储
│   │   └── queue-db.js           # 队列存储
│   ├── ipc-handlers/             # 模块化 IPC 处理器
│   │   ├── agent-handlers.js     # Agent 模式
│   │   ├── active-session-handlers.js # 活动会话
│   │   ├── capability-handlers.js # 能力管理
│   │   ├── plugin-handlers.js    # 插件管理
│   │   ├── config-handlers.js    # 配置管理
│   │   ├── dingtalk-handlers.js  # 钉钉桥接
│   │   ├── session-handlers.js   # 会话管理
│   │   ├── project-handlers.js   # 项目管理
│   │   ├── update-handlers.js    # 更新管理
│   │   ├── ai-handlers.js        # AI 相关
│   │   ├── prompt-handlers.js    # Prompt 管理
│   │   └── queue-handlers.js     # 队列管理
│   ├── managers/
│   │   ├── index.js              # Manager 注册入口
│   │   ├── agent-file-manager.js # Agent 文件操作
│   │   ├── agent-query-manager.js # Agent Query 控制
│   │   ├── capability-manager.js # Agent 能力管理（含市场自动注册）
│   │   ├── dingtalk-bridge.js    # 钉钉机器人桥接（Stream 连接/消息转发/图片处理）
│   │   ├── skills-manager.js     # Skills 管理
│   │   ├── skills/               # Skills 管理 mixin
│   │   ├── agents/               # Agents 管理 mixin
│   │   ├── plugin-cli.js         # 插件 CLI 封装（含错误精确归因）
│   │   ├── hooks-manager.js      # Hooks 管理
│   │   ├── mcp-manager.js        # MCP 管理
│   │   └── settings-manager.js   # Settings 管理
│   ├── config/                   # ConfigManager mixins
│   │   ├── api-config.js         # API 配置
│   │   └── provider-config.js    # 服务商配置
│   └── utils/
│       ├── agent-constants.js    # Agent 常量定义
│       ├── constants.js          # 全局常量
│       ├── env-builder.js        # 环境变量构建
│       ├── http-client.js        # HTTP 客户端（市场下载等）
│       ├── safe-send.js          # 防御性 IPC 发送
│       ├── token-counter.js      # Token 计数
│       ├── message-queue.js      # 消息队列
│       ├── ipc-utils.js          # IPC 工具
│       ├── path-utils.js         # 路径工具
│       └── process-tree-kill.js  # 进程树终止
│
├── preload/
│   └── preload.js                # contextBridge API
│
└── renderer/
    ├── pages/main/components/
    │   ├── agent/                # Agent 模式 UI 组件
    │   │   ├── AgentLeftContent.vue    # 对话列表
    │   │   ├── AgentNewConversationModal.vue # 新建对话弹窗
    │   │   ├── CapabilityModal.vue     # 能力管理弹窗
    │   │   ├── ChatInput.vue          # 聊天输入框（含能力快捷调用）
    │   │   ├── MessageBubble.vue      # 消息气泡
    │   │   ├── ToolCallCard.vue       # 工具调用卡片
    │   │   └── StreamingIndicator.vue # 流式输出指示器
    │   ├── AgentChatTab.vue      # Agent 对话 Tab
    │   ├── RightPanel/           # Developer 模式右侧面板
    │   │   └── tabs/             # 9 个标签页（Skills/Agents/Hooks/MCP/Plugins/Settings/AI/Prompts/Commands）
    │   └── AgentRightPanel/      # Agent 模式右侧面板
    │       ├── index.vue         # 面板入口
    │       ├── FileTree.vue      # 文件树
    │       ├── FileTreeNode.vue  # 文件树节点（递归）
    │       ├── FileTreeContextMenu.vue # 右键菜单
    │       ├── FilePreview.vue   # 文件预览
    │       └── FileTreeHeader.vue
    ├── pages/dingtalk-settings/  # 钉钉配置独立页面
    │   └── components/DingTalkSettingsContent.vue
    ├── composables/              # 可复用逻辑（21 个模块）
    │   ├── useAppMode.js         # 应用模式切换（Developer/Agent）
    │   ├── useAgentChat.js       # Agent 对话管理
    │   ├── useAgentFiles.js      # Agent 文件操作
    │   ├── useTabManagement.js   # Tab 管理（双数组模式）
    │   ├── useTheme.js           # 主题系统
    │   ├── useLocale.js          # 国际化
    │   ├── useIPC.js             # IPC 通信封装
    │   ├── useProjects.js        # 项目管理
    │   ├── useProviders.js       # 服务商管理
    │   └── ...                   # 其他模块
    ├── components/icons/         # 统一图标系统（90+ 图标）
    ├── utils/
    │   └── image-utils.js        # 图片处理
    └── locales/                  # 国际化（zh-CN / en-US）
```

## 核心模式

### IPC 通信

```javascript
// 渲染进程调用
const projects = await window.electronAPI.listProjects();
window.electronAPI.onTerminalData((data) => terminal.write(data));
```

- `ipcRenderer.invoke()` - 请求-响应
- `ipcRenderer.send()` - 单向发送
- `ipcRenderer.on()` - 监听事件

**添加新 IPC Handler**：
1. 在 `src/main/ipc-handlers/` 对应模块中定义
2. 在 `src/preload/preload.js` 通过 contextBridge 暴露
3. 渲染进程通过 `window.electronAPI.*` 调用

### Tab 管理双数组模式

为了在关闭 Tab 时保持终端缓冲区（xterm.js buffer），使用双数组架构：

```javascript
const tabs = ref([])      // TabBar UI 显示的 tabs
const allTabs = ref([])   // 所有 TerminalTab 组件（包括后台的）
```

- 关闭 Tab：从 `tabs` 移除，但保留在 `allTabs` → xterm buffer 不丢失
- 重新打开 Tab：从 `allTabs` 找到现有组件，添加回 `tabs` → 终端内容恢复

### Agent 能力管理（Capability Manager）

**数据模型 v1.1**：一能力一组件 — 每个 capability 对应一个 skill/agent/plugin

```json
{
  "version": "1.1",
  "capabilities": [
    {
      "id": "my-skill",
      "name": "示例技能",
      "type": "skill",
      "componentId": "my-skill",
      "category": "code-review"
    },
    {
      "id": "my-plugin",
      "type": "plugin",
      "componentId": "plugin-name@marketplace-name",
      "marketplace": "owner/repo"
    }
  ]
}
```

**清单来源**：`{registryUrl}/agent-capabilities.json`（远程拉取）

**安装状态检测**：
- **skill**：`~/.claude/skills/{id}/SKILL.md` 存在 → installed；`.disabled` 后缀 → disabled
- **agent**：`~/.claude/agents/{id}.md` 存在 → installed；`.disabled` 后缀 → disabled
- **plugin**：`installed_plugins.json` 有记录 → installed

**市场自动注册**（v1.6.50）：plugin 类型安装失败且市场未注册时，自动根据 `marketplace` 字段调用 `claude plugin marketplace add` 注册后重试。

**插件错误精确归因**（v1.6.50）：`plugin-cli.js` 的 `_refineNotFoundError` 区分"市场未注册"和"插件不存在"两种失败原因。

**核心文件**：`src/main/managers/capability-manager.js`、`src/main/managers/plugin-cli.js`

### Plugin/Skills 加载机制

**唯一数据源**：`~/.claude/plugins/installed_plugins.json`

**插件 ID 格式**：`{plugin-name}@{marketplace}`

**关键点**：
- 没注册到 `installed_plugins.json` = 不会被加载
- 启用/禁用状态存储在 `~/.claude/settings.json` 的 `enabledPlugins` 字段
- YAML 解析使用 `js-yaml` 库

### 主题系统

6 套配色方案（每套支持 light/dark 模式）：Claude（默认）、Ember、Ocean、Forest、Violet、Graphite

**配置位置**：`src/renderer/composables/useTheme.js`

### 服务商管理

所有服务商均可编辑/删除，无"内置"概念。预设：官方 API / 智谱AI / MiniMax / 阿里千问 / 代理服务 / 其他。

**配置位置**：`src/main/config/provider-config.js`、`src/main/utils/constants.js`

### 自动更新

- **Windows**：electron-updater 标准流程，支持差分更新（v1.6.51 起，基于 blockmap）
- **macOS**：无代码签名，`autoUpdater.quitAndInstall` 不可用，使用 `macOSManualInstall()` 手动解压安装
- **更新缓存目录**：`AppData/Local/cc-desktop-updater/`（含 `current.blockmap`、`installer.exe`、`pending/`）
- **核心文件**：`src/main/update-manager.js`

## 模块化设计原则

遵循"刚好够用"原则：

| 文件行数 | 处理方式 |
|---------|---------|
| < 200 行 | 单文件 |
| 200-500 行 | 2-3 个模块 |
| 500-1000 行 | 3-5 个模块 |
| > 1000 行 | 立即重构 |

**关键原则**：职责单一、边界清晰、避免过度设计、使用依赖注入避免循环依赖。

## 安全模型

- **Context Isolation**: 启用
- **Node Integration**: 禁用
- **contextBridge**: 仅暴露 preload.js 中定义的 API

## 常见陷阱

### 1. Vue Proxy 对象无法通过 IPC 传输

**错误**：`An object could not be cloned`
**解决**：`JSON.parse(JSON.stringify(reactiveObject))` 深拷贝后再发送。

### 2. Naive UI Dialog 回调属性名

使用 `onPositiveClick` / `onNegativeClick`，不是 `onPositive` / `onNegative`。

### 3. macOS BrowserWindow 生命周期

macOS 关闭窗口不退出应用，重新激活时 `mainWindow` 已销毁。解决：`activate` 事件中更新 Manager 引用 + 使用 `_safeSend()` 防御性发送。

## 注意事项

- 修改组件市场相关规范时，**必须同步更新** `C:\workspace\develop\HydroCoder\hydroSkills\CLAUDE.md`
- Developer 模式的 Plugins/Skills/Agents Tab 通过 `watch(isDeveloperMode)` 在模式切换时自动刷新

## 后期计划

### 钉钉：群聊图片发到群而非私发

**问题**：Agent 生成的图片（tool_use 读取）以及 CC 桌面介入时用户输入的截图，当前通过 `oToMessages/batchSend` 接口发送，该接口只支持单聊（私发给 `senderStaffId`）。群聊场景下图片只发给最后发消息的成员，不出现在群里。

**方案**（已完整评估，改动约 10 处，集中在 `dingtalk-bridge.js`）：
1. `_handleDingTalkMessage` 解构中增加 `conversationType`（单聊=`"1"`，群聊=`"2"`）
2. `conversationType` 和 `conversationId` 随 `_processOneMessage` 透传，存入 `_sessionWebhooks` 和 `responseCollectors`
3. 新增 `_sendImageToGroup(mediaId, { robotCode, openConversationId, token })` 调 `groupMessages/send` 接口
4. `_sendImageViaApi` 改为路由函数：`conversationType === '2'` 时走群聊接口，否则走原单聊接口
5. `_sendCollectedImages` / `_sendBase64Images` 签名加 `conversationId`、`conversationType` 并透传
6. `_handlePendingChoice` → `_processOneMessage` 调用也补传两字段

**注意**：现有单聊行为不受影响（`conversationType` 不为 `"2"` 时原路径不变）。

**已实现（v1.6.56）。**

---

### 钉钉：允许选择任意类型会话

**需求**：钉钉用户在历史会话选择菜单中，可以选择任意会话（包括普通 chat 会话），而不仅限于 `type='dingtalk'` 的会话。

**评估结论**：
- 改动量小（查询范围扩大 + 元数据写入），但需要处理 `session.type` 是否变更的问题
- 推荐做法：选中后只写入 DingTalk 元数据，不改 `type`，介入转发逻辑暂不激活
- 风险：chat 会话被 DingTalk 接管后双端同时操作上下文混乱

**已完整评估，暂不实现，等真正有需求时再推进。**

---

### 钉钉：新建会话独立工作目录

**问题**：钉钉端新建会话时，`_createNewSession` 直接传入 `cwd: this._getDefaultCwd()`（固定为 `dingtalk.defaultCwd` 或 `$HOME`），导致所有钉钉会话共用同一个目录，文件操作和代码生成互相干扰。而桌面端 Agent 模式不传 cwd 时会走 `_assignCwd()`，在 `outputBaseDir` 下自动创建 `conv-{id}` 独立子目录。

**方案**（改动集中在 `dingtalk-bridge.js` 的 `_createNewSession`）：
1. 钉钉用户首条消息支持指定子目录名称（如发送 `/dir my-project` 或 `#my-project`）
2. 有指定 → `cwd = {outputBaseDir}/my-project`（支持中文名称）
3. 没指定 → 不传 cwd，走 `AgentSessionManager._assignCwd()` 自动分配 `conv-{id}` 子目录
4. 两端统一使用 `settings.agent.outputBaseDir`（默认 `~/cc-desktop-agent-output`）作为根目录
5. 废弃钉钉端独立的 `_getDefaultCwd()` 逻辑，与 Agent 模式统一

**效果**：
```
~/cc-desktop-agent-output/
├── my-project/        ← 钉钉用户指定名称
├── 前端重构/           ← 钉钉用户指定中文名称
├── conv-a1b2c3d4/     ← 钉钉用户未指定，自动分配
└── conv-e5f6g7h8/     ← 桌面端 Agent 自动分配
```

**已完整评估，暂不实现。**

## 文档索引

### 项目文档

| 文档 | 说明 |
|------|------|
| `docs/CHANGELOG.md` | 版本更新日志 |
| `docs/ARCHITECTURE.md` | 架构设计 |
| `docs/QUICKSTART.md` | 快速开始 |
| `docs/BUILD.md` | 构建说明 |
| `docs/DESIGN-SYSTEM.md` | 设计系统 |
| `docs/SESSION-MANAGEMENT-DESIGN.md` | 会话管理设计 |
| `docs/IMAGE-RECOGNITION-FEATURE.md` | 图片识别功能文档 |
| `docs/dingtalk-architecture.html` | 钉钉架构图（浏览器打开） |
| `docs/theme-preview.html` | 主题预览（浏览器打开） |
| `docs/WEB-SERVER-PLAN.md` | Web 服务端计划（Express 替代 Electron，Linux 无头部署） |
| `docs/DINGTALK-COMMAND-PLAN.md` | 钉钉远程命令系统计划（/ 前缀命令拦截，远程管理） |
| `docs/ROADMAP.md` | 产品路线图（文档推广、能力生态、知识库、自治演进） |

### 用户文档

| 文档 | 说明 |
|------|------|
| `docs/user-guide/DINGTALK-GUIDE.zh.md` | 钉钉机器人使用指南 |
| `docs/user-guide/API-CONFIG-GUIDE.zh.md` | API 配置指南 |
| `docs/user-guide/POWER-SETTINGS-QA.md` | 电源设置 FAQ（英文） |
| `docs/user-guide/POWER-SETTINGS-QA.zh.md` | 电源设置 FAQ（中文） |

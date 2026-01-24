# CLAUDE.md

本文件为 Claude Code 提供项目开发指导。

## 项目概述

Claude Code Desktop 是独立的 Electron 桌面终端应用，作为 Claude Code CLI 的启动器。

**核心理念**：Desktop = Claude Code CLI Launcher + Terminal Emulator

完全独立于 Web 版，代码量减少 60%（~1,200 行 vs ~3,000 行）。

## 开发命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（自动打开 DevTools）
npm run build:win    # Windows 构建
npm run build:mac    # macOS 构建
npm run build:linux  # Linux 构建
```

**开发提示**：
- F12 切换 DevTools
- 配置文件：`%APPDATA%/claude-code-desktop/config.json` (Windows) 或 `~/.config/claude-code-desktop/config.json` (Linux/macOS)

## 架构

### 进程模型

```
Electron 应用
├── Main Process (Node.js)
│   ├── index.js           # 入口，创建窗口
│   ├── config-manager.js  # 配置管理
│   ├── terminal-manager.js # PTY 进程
│   ├── plugin-manager.js  # 插件管理
│   └── ipc-handlers/      # IPC 处理器
│
├── Preload (Security Bridge)
│   └── preload.js         # contextBridge API
│
└── Renderer (Browser)
    ├── pages/main/        # 主页面 (Vue 3)
    └── composables/       # 可复用逻辑
```

### 设计原则

1. **单用户无认证** - 无 JWT、无用户管理
2. **单终端模式** - 切换项目时杀掉旧 PTY 创建新的
3. **简单项目管理** - 最近项目列表存储在单个 JSON
4. **直接 IPC 通信** - 无 WebSocket
5. **纯本地** - 所有数据存储在本地 AppData

### 数据流

```
用户点击项目 → selectProject()
用户点击连接 → connectToProject()
IPC: terminal:start → TerminalManager.start()
  ├── kill() 旧进程
  ├── spawn() 新 shell (cwd: projectPath)
  └── 注入 ANTHROPIC_API_KEY
PTY.onData → IPC:terminal:data → xterm.write()
```

## 核心模式

### IPC 通信

```javascript
// 渲染进程调用
const projects = await window.electronAPI.listProjects();
window.electronAPI.writeTerminal(data);
window.electronAPI.onTerminalData((data) => terminal.write(data));
```

- `ipcRenderer.invoke()` - 请求-响应
- `ipcRenderer.send()` - 单向发送
- `ipcRenderer.on()` - 监听事件

### 添加新 IPC Handler

1. 在 `src/main/ipc-handlers.js` 或 `src/main/ipc-handlers/` 定义
2. 在 `src/preload/preload.js` 通过 contextBridge 暴露
3. 渲染进程通过 `window.electronAPI.*` 调用

### 添加配置字段

1. 更新 `src/main/config-manager.js` 的 `defaultConfig`
2. ConfigManager 自动合并现有配置
3. 通过 `configManager.getConfig()` 或 `config:get` IPC 访问

### Plugin/Skills 加载机制

**唯一数据源**：`~/.claude/plugins/installed_plugins.json`

```
~/.claude/plugins/
├── installed_plugins.json   # 已安装插件注册表（唯一入口）
├── cache/                   # 插件安装目录
└── repos/                   # 本地开发插件
```

**插件 ID 格式**：`{plugin-name}@{marketplace}`

**加载流程**：
```
installed_plugins.json → 读取 installPath → 扫描 skills/ 目录
```

**关键点**：
- 没注册到 `installed_plugins.json` = 不会被加载
- 启用/禁用状态存储在 `~/.claude/settings.json` 的 `enabledPlugins` 字段

## 文件结构

```
src/
├── main/
│   ├── index.js              # 应用入口
│   ├── config-manager.js     # 配置管理
│   ├── terminal-manager.js   # PTY 管理
│   ├── plugin-manager.js     # 插件管理
│   ├── session-manager.js    # SQLite 会话历史
│   ├── hooks-manager.js      # Hooks 管理
│   ├── ipc-handlers/         # 模块化 IPC
│   │   ├── plugin-handlers.js
│   │   ├── ai-handlers.js
│   │   └── ...
│   ├── managers/
│   │   └── skills/           # Skills 管理模块
│   │       ├── index.js      # 入口，混入功能
│   │       ├── utils.js      # 工具方法
│   │       ├── crud.js       # 增删改查
│   │       ├── import.js     # 导入（冲突检测）
│   │       └── export.js     # 导出
│   ├── config/               # ConfigManager mixins
│   │   ├── api-config.js
│   │   ├── provider-config.js
│   │   └── project-config.js
│   └── utils/
│       ├── constants.js
│       └── path-utils.js
│
├── preload/
│   └── preload.js            # contextBridge API
│
└── renderer/
    ├── pages/
    │   └── main/
    │       └── components/
    │           ├── LeftPanel.vue
    │           ├── MainContent.vue
    │           └── RightPanel/
    │               ├── tabs/
    │               │   ├── PromptsTab.vue
    │               │   ├── MessageQueueTab.vue
    │               │   ├── PluginsTab.vue
    │               │   ├── SkillsTab.vue
    │               │   ├── HooksTab.vue
    │               │   ├── MCPTab.vue
    │               │   ├── AgentsTab.vue
    │               │   └── AITab.vue
    │               └── skills/       # Skills 子组件
    │                   ├── SkillGroup.vue
    │                   ├── SkillEditModal.vue
    │                   ├── SkillCopyModal.vue
    │                   ├── SkillImportModal.vue
    │                   └── SkillExportModal.vue
    ├── composables/          # 可复用逻辑
    │   ├── useProjects.js
    │   ├── useTabManagement.js
    │   ├── useSessionPanel.js
    │   ├── useMessageQueue.js
    │   ├── useTheme.js
    │   └── ...
    └── locales/              # 国际化
        ├── zh-CN.js
        └── en-US.js
```

## 安全模型

- **Context Isolation**: 启用，渲染进程无法访问 Node API
- **Node Integration**: 禁用
- **CSP**: 限制资源来源为 self + CDN
- **contextBridge**: 仅暴露 preload.js 中定义的 API

---

## 当前状态

### v1.3.0 (2026-01-24) - 最新

**Skills 完整管理**：
- 三级分类：项目技能、自定义全局、官方全局
- 新建/编辑：原始内容编辑模式，YAML frontmatter + Markdown
- 复制：统一复制功能，可选目标（全局/项目）
- 导入：自动冲突检测（ID/name），跳过重复并显示原因
- 导出：单个/批量导出，支持 ZIP 和文件夹格式
- 显示格式：`id (/name)`，点击发送 `/name`
- 校验：新建/编辑时检查 name 重名

**右侧面板标签**：
```
💬 提示词 | 📜 队列 | 🔧 插件 | ⚡ 技能 | 🪝 Hooks | 🌐 MCP | 🧩 Agents | 🤖 AI
```

### 历史版本

- **v1.2.x** - Hooks 可视化编辑、Plugin 管理、AI 助手增强
- **v1.1.x** - 会话历史浏览器、多 API 配置
- **v1.0.x** - 基础终端、项目管理、消息队列

### 下一步

- [ ] Agents 集成 - 从 Claude Code CLI 加载 agents 列表
- [ ] 语音输入 - 待排查页面重载问题
- [ ] 会话信息面板 - Token 用量、元数据

---

## 文档索引

| 文档 | 说明 |
|------|------|
| `docs/CHANGELOG.md` | 版本更新日志 |
| `docs/DEV-HISTORY.md` | 详细开发历史 |
| `docs/ARCHITECTURE.md` | 架构设计 |
| `docs/QUICKSTART.md` | 快速开始 |
| `docs/CUSTOM-UI-GUIDE.md` | 自定义 UI 模式 |

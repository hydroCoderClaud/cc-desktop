# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Claude Code Desktop 是独立的 Electron 桌面终端应用，作为 Claude Code CLI 的启动器。

**当前版本**：1.5.7

**核心理念**：Desktop = Claude Code CLI Launcher + Terminal Emulator

完全独立于 Web 版，代码量减少 60%（~1,200 行 vs ~3,000 行）。

## 开发命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（自动打开 DevTools）
npm run build:win    # Windows 构建
npm run build:mac    # macOS 构建
npm run build:linux  # Linux 构建

# 测试
npm test             # 运行测试
npm run test:watch   # 监听模式
npm run test:coverage # 覆盖率报告

# 原生模块重建（better-sqlite3、node-pty 编译问题时使用）
npm run rebuild:sqlite
```

**开发提示**：
- F12 切换 DevTools
- 配置文件：`%APPDATA%/claude-code-desktop/config.json` (Windows) 或 `~/.config/claude-code-desktop/config.json` (Linux/macOS)
- 测试文件位于 `tests/` 目录，使用 Vitest 框架

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
2. **多会话并发** - 支持同时运行多个终端会话，可后台运行
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

### Tab 管理双数组模式

为了在关闭 Tab 时保持终端缓冲区（xterm.js buffer），使用双数组架构：

```javascript
const tabs = ref([])      // TabBar UI 显示的 tabs
const allTabs = ref([])   // 所有 TerminalTab 组件（包括后台的）
```

**关键点**：
- `tabs`：控制 TabBar 中显示哪些 Tab（用户可见的 UI 状态）
- `allTabs`：保持所有 TerminalTab 组件实例（即使 Tab 关闭，组件不销毁）
- 关闭 Tab：从 `tabs` 移除，但保留在 `allTabs` → xterm buffer 不丢失
- 重新打开 Tab：从 `allTabs` 找到现有组件，添加回 `tabs` → 终端内容恢复

**实现模式**：
```javascript
// MainContent.vue: 渲染所有终端组件
<TerminalTab
  v-for="tab in allTabs"  // 使用 allTabs，不是 tabs
  :key="tab.id"
  :visible="activeTabId === tab.id"
/>

// useTabManagement.js: 关闭 Tab
const closeTab = async (tab) => {
  // 1. 断开连接（后台运行）
  await invoke('disconnectActiveSession', tab.sessionId)

  // 2. 从 tabs 移除（UI 隐藏）
  const index = tabs.value.findIndex(t => t.id === tab.id)
  if (index !== -1) {
    tabs.value.splice(index, 1)
  }
  // 3. 保留在 allTabs 中（组件不销毁）
}

// useTabManagement.js: 重新打开 Tab
const ensureSessionTab = (session) => {
  // 1. 先在 allTabs 中查找（保持缓冲区）
  const existingTab = findTabBySessionId(allTabs.value, session.id)
  if (existingTab) {
    // 2. 添加回 tabs（UI 显示）
    if (!tabs.value.find(t => t.id === existingTab.id)) {
      tabs.value.push(existingTab)
    }
    return existingTab
  }

  // 3. 不存在则创建新 Tab，同时添加到两个数组
  const newTab = { /* ... */ }
  tabs.value.push(newTab)
  allTabs.value.push(newTab)
}
```

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
- YAML 解析使用 `js-yaml` 库

### 主题系统

**6 套配色方案**（每套支持 light/dark 模式）：

| 方案 | 主色 | 说明 |
|------|------|------|
| Claude | #DA7756 | 官方品牌色（赤陶/珊瑚色），**默认** |
| Ember | #FF6B35 | 橙色 |
| Ocean | #0EA5E9 | 蓝色 |
| Forest | #10B981 | 绿色 |
| Violet | #8B5CF6 | 紫色 |
| Graphite | #6B7280 | 灰色 |

**配置位置**：`src/renderer/composables/useTheme.js`

**使用方式**：
```javascript
import { useTheme } from '@composables/useTheme'

const { isDark, colorScheme, currentColors, toggleTheme, setColorScheme } = useTheme()

// 切换深浅模式
await toggleTheme()

// 切换配色方案
await setColorScheme('ocean')
```

**Naive UI 主题覆盖**（所有图标颜色跟随主题）：
- Button、Input、Switch、Spin
- Dialog（iconColorWarning）
- Message（success/warning/error/info/loading 图标）
- Notification（success/warning/error/info 图标）

### 统一图标系统

**位置**：`src/renderer/components/icons/`

**设计规范**：
- 基于 20x20 viewBox
- stroke-based 设计（stroke-width: 1.5）
- 60+ 个图标，覆盖操作、导航、文件、状态、功能等类别

**使用方式**：
```vue
<Icon name="refresh" :size="20" />
<Icon name="settings" :size="16" class="custom-class" />
```

**图标分类**：
- 操作类：refresh, search, add, close, edit, delete, copy
- 导航类：chevronDown/Up/Left/Right, externalLink
- 文件类：folder, file, fileText
- 终端类：terminal, play, stop, pause
- 状态类：check, warning, info, error
- 功能类：plugin, skill, hook, agent, mcp, prompt
- 字母图标：letterS, letterM, letterA, letterH（用于 Tab 标识）

### 服务商管理

**设计原则**：所有服务商均可编辑/删除，无"内置"概念

**预设服务商**（用户可自由修改）：
| ID | 名称 | 默认 API URL |
|----|------|-------------|
| official | 官方 API | https://api.anthropic.com |
| zhipu | 智谱AI | https://open.bigmodel.cn/api/paas/v4 |
| minimax | MiniMax | https://api.minimax.chat/v1 |
| qwen | 阿里千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| proxy | 代理服务 | （用户填写） |
| other | 其他 | （用户填写） |

**配置位置**：
- 后端：`src/main/config/provider-config.js`
- 常量：`src/main/utils/constants.js`（SERVICE_PROVIDERS）

## 文件结构

```
src/
├── main/
│   ├── index.js              # 应用入口
│   ├── config-manager.js     # 配置管理
│   ├── terminal-manager.js   # PTY 管理
│   ├── plugin-manager.js     # 插件管理
│   ├── session-manager.js    # SQLite 会话历史
│   ├── ipc-handlers/         # 模块化 IPC
│   │   ├── plugin-handlers.js
│   │   ├── ai-handlers.js
│   │   └── ...
│   ├── managers/
│   │   ├── skills/           # Skills 管理（mixin 模式）
│   │   ├── agents/           # Agents 管理（mixin 模式）
│   │   ├── hooks-manager.js  # Hooks 管理
│   │   └── mcp-manager.js    # MCP 管理
│   ├── config/               # ConfigManager mixins
│   └── utils/
│
├── preload/
│   └── preload.js            # contextBridge API
│
└── renderer/
    ├── pages/main/components/RightPanel/
    │   ├── tabs/             # 8 个标签页
    │   ├── skills/           # Skills 组件
    │   ├── agents/           # Agents 组件
    │   ├── hooks/            # Hooks 组件
    │   └── mcp/              # MCP 组件
    ├── composables/          # 可复用逻辑（含共享常量）
    └── locales/              # 国际化
```

## 安全模型

- **Context Isolation**: 启用，渲染进程无法访问 Node API
- **Node Integration**: 禁用
- **CSP**: 限制资源来源为 self + CDN
- **contextBridge**: 仅暴露 preload.js 中定义的 API

## 常见陷阱

### 1. Vue Proxy 对象无法通过 IPC 传输

**错误信息**：`An object could not be cloned`

**原因**：Vue 3 的响应式对象是 Proxy，无法被 Electron IPC 的结构化克隆算法处理。

**解决方案**：在通过 IPC 发送前，使用深拷贝转换为普通对象：
```javascript
// ❌ 错误
await window.electronAPI.someApi(props.reactiveObject)

// ✅ 正确
const plainObject = JSON.parse(JSON.stringify(props.reactiveObject))
await window.electronAPI.someApi(plainObject)
```

### 2. Naive UI Dialog 回调属性名

**错误**：使用 `onPositive` / `onNegative` 无效

**正确属性名**：
```javascript
dialog.warning({
  title: '确认',
  content: '确定删除？',
  positiveText: '删除',
  negativeText: '取消',
  onPositiveClick: async () => { /* ... */ },  // ✅ 不是 onPositive
  onNegativeClick: () => { /* ... */ }         // ✅ 不是 onNegative
})
```

### 3. macOS BrowserWindow 生命周期

**问题**：macOS 上关闭窗口不会退出应用，重新激活时出现 "Object has been destroyed" 错误。

**原因**：
- macOS 窗口关闭时 `mainWindow` 被销毁，但 app 不退出
- Manager 类持有的 `mainWindow` 引用变成已销毁对象
- 重新激活时调用 `mainWindow.webContents.send()` 报错

**解决方案**：

1. **更新 activate 事件处理**：
```javascript
// src/main/index.js
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();

    // 更新 manager 引用，避免使用已销毁的 mainWindow
    if (terminalManager) {
      terminalManager.mainWindow = mainWindow;
    }
    if (activeSessionManager) {
      activeSessionManager.mainWindow = mainWindow;
    }
  }
});
```

2. **防御性 IPC 发送**：
```javascript
// 在所有 Manager 类中添加 _safeSend 方法
_safeSend(channel, data) {
  try {
    if (this.mainWindow &&
        !this.mainWindow.isDestroyed() &&
        this.mainWindow.webContents &&
        !this.mainWindow.webContents.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
      return true
    }
    console.warn(`Cannot send to ${channel}: window destroyed`)
    return false
  } catch (error) {
    console.error(`Failed to send to ${channel}:`, error)
    return false
  }
}

// 替换所有 webContents.send() 调用
this._safeSend('session:data', { sessionId, data })
```

**注意**：Windows/Linux 关闭窗口会退出应用，所以这是 macOS 特定问题。

---

## 最近更新 (v1.5.5)

1. **统一图标系统**：60+ 个 SVG 图标，统一使用 `<Icon>` 组件
2. **多配色主题**：6 套配色方案，Claude 官方色为默认
3. **服务商管理重构**：移除"内置"概念，用户可自由编辑删除所有服务商
4. **Naive UI 主题统一**：Dialog/Message/Notification 图标颜色跟随主题
5. **UI 细节优化**：
   - Logo 使用独特的 Crimson Pro 衬线字体
   - 主区域边框使用主题色
   - 面板折叠箭头跟随主题色
   - TabBar 背景与 header 保持一致

---

## 文档索引

| 文档 | 说明 |
|------|------|
| `docs/CHANGELOG.md` | 版本更新日志 |
| `docs/DEV-HISTORY.md` | 详细开发历史 |
| `docs/ARCHITECTURE.md` | 架构设计 |
| `docs/QUICKSTART.md` | 快速开始 |
| `docs/CUSTOM-UI-GUIDE.md` | 自定义 UI 模式 |

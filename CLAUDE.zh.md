# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

Claude Code Desktop 是一个独立的基于 Electron 的桌面终端应用程序，作为 Claude Code CLI 的启动器。核心理念是：**Desktop = Claude Code CLI 启动器 + 终端模拟器**。

这是一个完全独立于 Web 版本的重写项目，代码量减少 60%（约 1,200 行 vs 约 3,000 行），架构简化，无 Web 依赖。

## 基本命令

### 开发
```bash
# 安装依赖
npm install

# 启动开发模式（自动打开开发者工具）
npm run dev

# 为特定平台构建
npm run build:win    # Windows（NSIS 安装程序）
npm run build:mac    # macOS（DMG）
npm run build:linux  # Linux（AppImage）
```

### 开发注意事项
- 按 F12 可在开发或生产环境中切换开发者工具
- 当 `NODE_ENV=development` 时应用会自动打开开发者工具
- 配置文件位置：`%APPDATA%/claude-code-desktop/config.json`（Windows）或 `~/.config/claude-code-desktop/config.json`（Linux/macOS）

## 架构

### 进程模型
应用遵循 Electron 的多进程架构：

**主进程**（Node.js）：
- `src/main/index.js` - 入口点，创建 BrowserWindow
- `src/main/config-manager.js` - 管理 config.json（最近项目、设置、API 密钥）
- `src/main/terminal-manager.js` - 管理单个 PTY 进程生命周期
- `src/main/ipc-handlers.js` - 渲染进程-主进程通信的 IPC 处理器

**预加载脚本**（安全桥接）：
- `src/preload/preload.js` - 通过 contextBridge 向渲染进程暴露安全 API

**渲染进程**（浏览器）：
- `src/renderer/index.html` - Claude 风格设计的主界面
- `src/renderer/js/app.js` - 应用逻辑，xterm.js 集成

### 核心设计原则

1. **单用户，无认证** - 无 JWT，无用户管理，无会话超时
2. **一次只有一个活动终端** - 切换项目会终止旧 PTY 并创建新的
3. **简单的项目管理** - 最近项目列表（最多 10 个）存储在单个 JSON 文件中
4. **直接 IPC 通信** - 无 WebSocket 复杂性
5. **仅本地** - 所有数据存储在本地 AppData 目录

### 数据流：项目连接

```
用户点击项目 → app.js:selectProject()
用户点击 Connect → app.js:connectToProject()
IPC: terminal:start(project.path)
TerminalManager.start() 终止旧 PTY，生成新 shell：
  - cwd: project.path
  - env: 从配置获取 ANTHROPIC_API_KEY
PTY.onData → IPC:terminal:data → xterm.write() → 显示
```

### 数据流：用户输入

```
用户在终端输入 → xterm.onData()
IPC: terminal:write(data)
TerminalManager.write() → pty.write()
Shell 处理输入 → PTY.onData
IPC: terminal:data → xterm.write() → 显示
```

## 重要模式

### IPC 通信
所有渲染进程-主进程通信使用 `preload.js` 中暴露的 API：
- 使用 `ipcRenderer.invoke()` 进行请求-响应（Handle）
- 使用 `ipcRenderer.send()` 进行发送即忘（On）
- 使用 `ipcRenderer.on()` 监听来自主进程的事件

示例：
```javascript
// 在渲染进程中（app.js）
const projects = await window.electronAPI.listProjects();
window.electronAPI.writeTerminal(data);
window.electronAPI.onTerminalData((data) => terminal.write(data));
```

### 终端管理
- 一次只运行一个终端（TerminalManager 中的单个 PTY 实例）
- 启动新终端前，通过 `kill()` 终止旧终端
- API 密钥自动注入为 `ANTHROPIC_API_KEY` 环境变量
- Shell 选择：Windows 上使用 PowerShell，Linux/macOS 上使用 Bash

### 配置管理
- ConfigManager 在加载时自动与默认配置合并
- 项目自动排序：固定项目优先，然后按 lastOpened 时间戳
- 最多 10 个最近项目（可通过 settings.maxRecentProjects 配置）
- 配置更改立即持久化到磁盘

## 文件结构说明

```
src/
├── main/                     # 主进程（Node.js）
│   ├── index.js              # 应用生命周期，窗口创建
│   ├── config-manager.js     # 配置文件 I/O 和项目列表
│   ├── terminal-manager.js   # PTY 生成/终止/写入/调整大小
│   └── ipc-handlers.js       # IPC 通道定义
│
├── preload/
│   └── preload.js            # contextBridge API（安全）
│
└── renderer/                 # 渲染进程（浏览器）
    ├── index.html            # 使用 CDN 的 xterm.js 的 UI
    └── js/
        └── app.js            # 主应用逻辑，xterm 集成
```

## 安全模型

- **上下文隔离**：已启用，渲染进程无法访问 Node API
- **Node 集成**：已禁用
- **CSP**：限制资源为 self + CDN（xterm.js、字体）
- **contextBridge**：仅暴露 preload.js 中定义的显式 API

## 常见开发模式

### 添加新的 IPC 处理器
1. 在 `src/main/ipc-handlers.js` 中定义处理器
2. 在 `src/preload/preload.js` 中通过 contextBridge 暴露
3. 从渲染进程使用 `window.electronAPI.*` 调用

### 添加配置字段
1. 更新 `src/main/config-manager.js` 中的 `defaultConfig`
2. ConfigManager 自动与现有配置合并
3. 通过 `configManager.getConfig()` 或 `config:get` IPC 访问

### 测试配置更改
在应用关闭时直接编辑配置文件：
- Windows：`%APPDATA%\claude-code-desktop\config.json`
- Linux/macOS：`~/.config/claude-code-desktop/config.json`

## 依赖项

**生产环境：**
- `node-pty` - PTY 进程管理（生成 shell）
- `uuid` - 唯一项目 ID

**开发环境：**
- `electron` - 桌面框架
- `electron-builder` - 应用打包
- `cross-env` - 跨平台环境变量

**CDN（通过渲染进程）：**
- `xterm.js` 5.3.0 - 终端 UI 渲染
- `xterm-addon-fit` - 自动调整终端大小以适应容器

## 与 Web 版本的差异

此桌面应用程序明确**删除**了：
- 多用户认证系统
- JWT 令牌管理
- 会话超时/清理逻辑
- WebSocket 通信
- 模板/Prompt 三级管理
- 复杂的会话池管理
- 对 `cc-web-terminal` 代码库的依赖

主要简化：
- 配置：多个 JSON 文件 → 单个 `config.json`
- 项目：注册 API → 简单的最近列表
- 终端：会话池 → 单个 PTY 实例
- 认证：JWT + 超时 → 无（单个本地用户）

## 高级架构：自定义 UI 模式

当前实现使用**终端模式**（xterm.js 显示 PTY 输出）。但是，Claude Code CLI 支持 **JSON API 模式**，可以实现自定义 UI：

```bash
claude code --print --output-format=stream-json --input-format=stream-json
```

### 两种架构模式

**终端模式（当前）：**
```
用户 → xterm.js → PTY → Shell → claude code（交互式）
```
- 简单，开箱即用
- 完整的终端体验
- UI 定制受限

**API 模式（可用）：**
```
用户 → 自定义 UI → ClaudeAPIManager → claude code（JSON 模式）
```
- 完全控制 UI（React/Vue/原生）
- 结构化数据（JSON）
- Markdown 渲染、代码高亮
- 对话历史、搜索、导出
- Token 使用情况显示

参见 `docs/CUSTOM-UI-GUIDE.md` 了解实现细节，`docs/ARCHITECTURE-COMPARISON.md` 了解对比。

### API 模式的主要优势

1. **结构化数据**：每条消息都是带有类型、内容、元数据的 JSON 对象
2. **丰富的 UI**：Markdown 渲染、语法高亮、自定义主题
3. **对话管理**：历史记录、搜索、导出（JSON/Markdown）
4. **分析功能**：实时 Token 使用情况、成本跟踪
5. **高级功能**：编辑历史、分支对话、文件附件

代码库包含 `src/main/claude-api-manager.js`，演示了 API 模式集成。您可以实现任一模式或同时支持两种模式并提供切换功能。

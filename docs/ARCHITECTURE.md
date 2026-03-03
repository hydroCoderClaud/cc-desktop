# 架构设计文档

## 设计理念

Claude Code Desktop 是一个**完全独立**的桌面应用，其核心理念是：

> **Desktop = Claude Code CLI 启动器 + 终端模拟器**

与 Web 版完全脱离，采用更简单、更符合桌面应用特点的架构。

---

## 架构对比

### Web 版架构（复杂）

```
浏览器
  ↓ WebSocket
服务器 (Node.js + Express)
  ├── JWT 认证
  ├── 多用户管理
  ├── 会话管理（30分钟超时）
  ├── PTY 进程池
  └── 数据库/JSON存储
```

**问题**：
- 多用户设计对单机应用是过度设计
- WebSocket 通信增加复杂度
- 会话管理对本地应用无意义
- 需要同步 Web 版代码更新

### Desktop 版架构（简化）

```
Electron 应用
  ├── 主进程 (Node.js)
  │   ├── ConfigManager - 配置管理
  │   ├── TerminalManager - PTY管理
  │   └── IPC Handlers - 通信
  │
  └── 渲染进程 (Browser)
      ├── index.html - UI界面
      └── app.js - 应用逻辑
```

**优势**：
- 单用户，无需认证
- IPC 通信，更高效
- 一个项目 = 一个进程
- 完全独立，易维护

---

## 技术栈

| 层次 | 技术 | 用途 |
|------|------|------|
| 桌面框架 | Electron 28 | 跨平台桌面应用 |
| 主进程 | Node.js | 文件操作、进程管理 |
| 渲染进程 | Vanilla JS | UI 逻辑（无框架） |
| 终端 | node-pty | PTY 进程管理 |
| 终端 UI | xterm.js 5.3 | 终端渲染 |
| 通信 | Electron IPC | 进程间通信 |
| 打包 | electron-builder | 应用打包 |

---

## 核心模块

### 1. ConfigManager (主进程)

**职责**：管理应用配置和项目列表

**数据模型**：
```javascript
{
  recentProjects: [
    {
      id: "uuid",
      name: "项目名",
      path: "C:\\workspace\\...",
      lastOpened: "2026-01-12T10:30:00Z",
      icon: "📁",
      pinned: false
    }
  ],
  apiProfiles: [
    {
      id: "profile-uuid",
      name: "Default API",
      authToken: "sk-ant-...",
      baseUrl: "https://api.anthropic.com",
      isDefault: true,
      modelMapping: {
        opus: "claude-opus-4-6",    // → ANTHROPIC_DEFAULT_OPUS_MODEL
        sonnet: "claude-sonnet-4-6", // → ANTHROPIC_DEFAULT_SONNET_MODEL
        haiku: "claude-haiku-4-5"   // → ANTHROPIC_DEFAULT_HAIKU_MODEL
      }
    }
  ],
  defaultProfileId: "profile-uuid",
  settings: {
    theme: "light",
    terminal: { fontSize: 14, fontFamily: "Consolas" },
    maxRecentProjects: 10
  }
}
```

**核心方法**：
- `load()` - 加载配置
- `save()` - 保存配置
- `addRecentProject()` - 添加项目
- `removeRecentProject()` - 移除项目
- `updateSettings()` - 更新设置

### 2. TerminalManager (主进程)

**职责**：管理单个 PTY 进程

**生命周期**：
```
用户点击 Connect
  ↓
kill() 旧进程（如果存在）
  ↓
spawn() 新进程 (PowerShell/Bash)
  ↓
设置工作目录 (cwd)
  ↓
注入环境变量 (ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN,
             ANTHROPIC_DEFAULT_OPUS_MODEL,
             ANTHROPIC_DEFAULT_SONNET_MODEL, ANTHROPIC_DEFAULT_HAIKU_MODEL)
  ↓
监听数据输出 → 转发到渲染进程
  ↓
用户切换项目或关闭应用
  ↓
kill() 进程
```

**核心方法**：
- `start(projectPath)` - 启动终端
- `write(data)` - 写入数据
- `resize(cols, rows)` - 调整大小
- `kill()` - 关闭终端

### 3. IPC Handlers (主进程)

**职责**：处理渲染进程的请求

**API 设计**：

| Channel | 类型 | 参数 | 返回 |
|---------|------|------|------|
| `config:get` | Handle | - | Config对象 |
| `config:save` | Handle | config | Boolean |
| `projects:list` | Handle | - | Project[] |
| `project:add` | Handle | {name, path} | Project |
| `project:remove` | Handle | projectId | Boolean |
| `dialog:selectFolder` | Handle | - | String |
| `terminal:start` | Handle | projectPath | {success, path} |
| `terminal:write` | On | data | - |
| `terminal:resize` | On | {cols, rows} | - |
| `terminal:kill` | Handle | - | {success} |

### 4. App.js (渲染进程)

**职责**：UI 逻辑和终端交互

**核心功能**：
```javascript
// 状态管理
state = {
  terminal: xterm实例,
  fitAddon: 自适应插件,
  currentProject: 当前项目,
  projects: 项目列表,
  connected: 是否已连接,
  config: 配置对象
}

// 核心流程
initTerminal() → 创建xterm实例
loadProjects() → 加载项目列表
connectToProject() → 启动终端
applyTheme() → 应用主题
```

---

## 数据流

### 项目连接流程

```
[用户] 点击项目
  ↓
app.js: selectProject()
  ↓
[用户] 点击 Connect
  ↓
app.js: connectToProject(project)
  ↓
IPC: terminal:start(project.path)
  ↓
TerminalManager.start()
  ├── kill() 旧进程
  ├── pty.spawn(shell, [], {cwd: projectPath})
  └── 监听 onData → IPC: terminal:data
  ↓
app.js: 接收 terminal:data
  ↓
xterm.write(data)
  ↓
[终端显示]
```

### 用户输入流程

```
[用户] 在终端输入
  ↓
xterm.onData(data)
  ↓
IPC: terminal:write(data)
  ↓
TerminalManager.write(data)
  ↓
pty.write(data)
  ↓
[Shell 处理]
  ↓
Shell 输出 → pty.onData
  ↓
IPC: terminal:data
  ↓
xterm.write(data)
  ↓
[终端显示]
```

---

## 安全设计

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self' https://cdn.jsdelivr.net;
">
```

### Context Isolation

```javascript
// preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  // 仅暴露必要的API
  startTerminal: (path) => ipcRenderer.invoke('terminal:start', path),
  // ... 其他安全API
});
```

**渲染进程无法直接**：
- 访问 Node.js API
- 访问文件系统
- 执行任意命令

---

## 性能优化

### 1. 终端渲染优化
- 使用 xterm.js 的 WebGL 渲染器
- Fit Addon 自适应窗口大小
- 限制历史缓冲区大小

### 2. 进程管理优化
- 单进程模式（一次只运行一个终端）
- 及时清理退出的进程
- 避免进程泄漏

### 3. 配置读写优化
- 内存缓存配置对象
- 批量写入（防抖）
- 异步 I/O

---

## MCP 市场安装设计

### 安装流程

MCP（Model Context Protocol）服务器通过组件市场安装，支持两个入口：

- **Agent 模式**：能力清单弹窗 → `CapabilityManager` → `McpManager.installMarketMcp()`
- **Developer 模式**：组件市场弹窗 → IPC `mcp:installFromMarket` → `McpManager.installMarketMcp()`

两条路径最终都调用 `market.js` 中的安装方法，流程一致：

```
下载 .mcp.json → 解析 mcpServers
  → 注入代理环境变量（可选）
  → 自动写入工具权限
  → 剔除 tools 自定义字段
  → 注册到 ~/.claude.json user scope
```

### 代理环境变量注入

MCP 服务器进程（如 `npx -y some-mcp-server`）在网络受限环境下可能无法访问 npm 或外部 API。安装时可选择注入代理配置。

**三态决策逻辑**（`_injectProxyEnvToServers(mcpServers, useProxy)`）：

| `useProxy` 值 | 含义 | 行为 |
|---------------|------|------|
| `true` | 用户在环境变量弹窗中勾选了「使用代理」 | 强制注入代理 |
| `false` | 用户明确取消勾选 | 跳过注入 |
| `undefined` | 无环境变量弹窗（直接安装） | 跟随全局代理开关（`proxyConfig.enabled`） |

**注入的环境变量**：

| 变量 | 值 | 用途 |
|------|-----|------|
| `HTTPS_PROXY` | 代理 URL | HTTP 客户端代理 |
| `HTTP_PROXY` | 代理 URL | HTTP 客户端代理 |
| `NODE_OPTIONS` | `-r "~/.claude/proxy-support/proxy-setup.cjs"` | Node.js 进程级代理（通过 startup script 注入） |

**代理配置来源**：`configManager.getMcpProxyConfig()` 返回 `{ enabled, url }`，对应全局设置中的 MCP 代理配置。

### 工具权限自动注入

注册表中的 `.mcp.json` 支持自定义 `tools` 扩展字段，列出该 MCP 暴露的所有工具名称。安装时自动将工具权限写入 `~/.claude/settings.json`，格式为 `mcp__<serverName>__<toolName>`。

**写入逻辑**（`SettingsManager.addMcpToolPermissions()`）：
- 只写 global scope
- 跳过已存在的权限（幂等）
- 一次性读写，避免多次 IO

**清理逻辑**（`SettingsManager.removeMcpToolPermissions()`）：
- 卸载 MCP 时按前缀 `mcp__<serverName>__` 匹配删除
- 自动清理，无残留

**字段剔除**：`tools` 在写入 `~/.claude.json` 前被 `delete cleanConfig.tools` 剔除，不影响 Claude Code CLI 解析。

---

## 扩展性设计

### 插件系统（未来）

```javascript
// 插件接口
interface Plugin {
  name: string;
  onProjectOpen(project): void;
  onTerminalData(data): void;
  contributeCommands(): Command[];
}
```

### 多终端支持（未来）

```javascript
// TerminalManager → TerminalPool
class TerminalPool {
  terminals: Map<projectId, TerminalInstance>;

  createTerminal(project);
  switchTerminal(projectId);
  killAll();
}
```

---

## 与 Web 版的差异

| 特性 | Web 版 | Desktop 版 |
|------|--------|-----------|
| 用户系统 | ✅ 多用户 + JWT | ❌ 单用户 |
| 会话管理 | ✅ 超时清理 | ❌ 简单生命周期 |
| 通信方式 | WebSocket | IPC |
| 数据存储 | 服务器文件系统 | 本地 AppData |
| 认证 | JWT Token | - |
| 模板/Prompt | 三级管理 | ❌ 无需 |
| 项目管理 | 注册+创建API | 简单列表 |
| 依赖关系 | 依赖 Web 代码 | 完全独立 |
| 代码量 | ~3000行 | ~1200行 |

---

## 未来规划

- [ ] 设置对话框（GUI 方式配置 API Key）
- [ ] 右键菜单（重命名、固定、移除项目）
- [ ] 多终端标签页支持
- [ ] 终端历史记录
- [ ] 快捷键配置
- [ ] 插件系统
- [ ] 自动更新

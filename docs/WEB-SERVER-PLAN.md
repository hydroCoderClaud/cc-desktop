# CC Desktop Web 服务端计划

> 状态：规划中 | 创建日期：2026-02-22 | 暂不实现，备用方案

## 一、目标

将 CC Desktop 从纯桌面应用扩展为 **桌面 + Web 双端架构**，支持：

1. **Linux 无头部署** — 服务器上运行，浏览器远程管理和对话
2. **远程管理** — 通过 Web 面板配置 API、管理 Skills/Agents/MCP、控制钉钉桥接
3. **远程对话** — 通过浏览器使用 Agent 模式 Chat 对话（含流式输出）
4. **桌面端零影响** — 现有 Electron 桌面端完全不动

## 二、架构设计

### 核心思路：两个壳，一套核心

```
┌──────────────────┐    ┌──────────────────┐
│  桌面端（不动）    │    │  Web/服务端（新增）│
│  Electron 壳      │    │  Express 壳       │
│  ├── Vue 界面     │    │  ├── Vue 界面(复用)│
│  ├── IPC 通信     │    │  ├── HTTP + WS    │
│  └── Node.js 核心 │    │  └── Node.js 核心  │
└──────────────────┘    └──────────────────┘
        │                        │
        └───── 共享同一套 ────────┘
              manager 代码
```

### 共享的核心层（纯 Node.js，不改）

```
src/main/
├── agent-session-manager.js    ← Agent 会话管理 + SDK 调用
├── config-manager.js           ← 配置管理（改 1 行路径）
├── session-database.js         ← SQLite 数据库（改 1 行路径）
├── managers/
│   ├── dingtalk-bridge.js      ← 钉钉桥接
│   ├── plugin-cli.js           ← 插件 CLI
│   └── ...
├── plugin-manager.js           ← 插件管理
├── capability-manager.js       ← 能力管理
├── prompt-manager.js           ← Prompt 管理
└── utils/                      ← 工具函数
```

### Electron 专有（桌面端保留，Web 端不需要）

| Electron API | 用途 | Web 端处理 |
|-------------|------|-----------|
| `BrowserWindow` | 渲染窗口 | → 浏览器直接访问 |
| `ipcMain.handle` | 前后端通信 | → Express 路由 |
| `dialog` | 文件/文件夹选择框 | → 路径输入框 |
| `shell.openPath` | 打开文件夹/编辑器 | → 显示路径 / 隐藏 |
| `shell.openExternal` | 打开外部链接 | → `window.open()` |
| `electron-updater` | 自动更新 | → 不需要 |
| `powerSaveBlocker` | 防休眠 | → 服务器不休眠 |
| `app.getPath('userData')` | 配置路径 | → `os.homedir() + '/.config/cc-desktop'` |

## 三、新增文件清单

### 服务端入口

```
src/server/                         ← 新增目录
├── index.js                        ← Express 启动入口
├── http-handlers.js                ← IPC → HTTP 路由映射
├── websocket-handlers.js           ← 实时事件推送（Agent 流式、状态变更）
└── static/                         ← Vue 打包产物托管
```

### 前端适配层

```
src/renderer/
└── utils/
    └── web-api-adapter.js          ← 新增，替代 window.electronAPI
```

## 四、前端复用方案

### 现状

- 所有前端组件通过 `window.electronAPI.xxx()` 调用后端
- 有 `useIPC` composable 作为抽象层
- 200+ IPC 方法，21 个 composable

### 方案：adapter 层替换

```js
// web-api-adapter.js — 在 Web 端注入，替代 Electron preload
if (!window.electronAPI) {
  window.electronAPI = {
    // 请求/响应类 → HTTP fetch
    listProviders: () => fetch('/api/providers').then(r => r.json()),
    addProvider: (data) => fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),

    // 流式事件类 → WebSocket
    onAgentStream: (callback) => {
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'agent:stream') callback(null, msg.data)
      })
    },

    // 桌面专属类 → 降级
    selectFolder: () => prompt('请输入服务器上的目录路径：'),
    openExternal: (url) => window.open(url, '_blank'),
    openFolder: () => { /* noop */ },
  }
}
```

**效果：153 个 Vue 组件零改动，composable 层零改动。**

## 五、通信方式对照

| 类型 | 方法数 | Electron | Web |
|------|--------|----------|-----|
| 请求/响应 | ~170 | `ipcMain.handle` | HTTP REST API |
| 事件推送 | ~30 | `webContents.send` | WebSocket / SSE |
| 桌面专属 | ~10 | `dialog` / `shell` | 降级处理 |

### Agent 流式对话（关键路径）

```
Electron 版：
  sendAgentMessage → IPC → SDK → CLI → Claude API
                                         ↓ streaming
  UI ← IPC event(agent:stream) ← _safeSend ← _processMessage

Web 版：
  sendAgentMessage → HTTP POST → SDK → CLI → Claude API
                                                ↓ streaming
  UI ← WebSocket(agent:stream) ← ws.send ← _processMessage
```

组件侧代码不变，`useAgentChat.js` 调的还是 `window.electronAPI.onAgentStream`。

## 六、Web 管理面板功能优先级

### P0 — 必须有（无头部署刚需）

| 模块 | 功能 | API 数 |
|------|------|--------|
| 服务商管理 | 增删改查服务商定义 | ~5 |
| API 配置 | 增删改查配置、测试连接、模型映射 | ~12 |
| 全局设置 | 超时、最大会话数、自动压缩、消息队列 | ~8 |
| 钉钉桥接 | 启停、状态、配置修改 | ~5 |
| MCP 管理 | 多作用域增删改查 MCP Server | ~5 |

### P1 — 应该有（日常管理高频）

| 模块 | 功能 | API 数 |
|------|------|--------|
| Skills 管理 | 三级作用域 CRUD、导入/导出、市场安装 | ~18 |
| Agents 管理 | 多级作用域 CRUD、导入/导出、市场安装 | ~16 |
| Hooks 管理 | 全局/项目级 CRUD、Schema、JSON 编辑 | ~8 |
| 插件管理 | 列表/启禁用、市场源、安装/卸载 | ~10 |
| 权限与环境变量 | allow/deny 规则、环境变量管理 | ~8 |

### P2 — 锦上添花（监控辅助）

| 模块 | 功能 | API 数 |
|------|------|--------|
| 会话监控 | 列表、同步、搜索（FTS5）、导出 | ~15 |
| 项目管理 | 列表/创建/切换、置顶/隐藏 | ~10 |
| Prompt 管理 | CRUD、标签、收藏、市场 | ~12 |
| AI 助手配置 | 模型、temperature、system prompt | ~6 |
| Capability 管理 | 能力清单、安装/启禁用 | ~6 |
| 快捷命令 | CRUD | ~4 |
| 版本信息 | 版本查看 | ~2 |

### 不做

| 模块 | 原因 |
|------|------|
| PTY 终端 | Web 端无意义，用 SSH |
| 外观/主题 | Web 端可简化 |
| 桌面通知 | 浏览器通知替代 |

### 汇总

```
P0：~35 个 API
P1：~60 个 API
P2：~55 个 API
MVP（P0 + P1）：~95 个 API
完整版：~150 个 API
```

## 七、实施路线

### 阶段一：验证（1 天）

xvfb 无头启动 Electron，确认 Linux 上核心功能正常：
- SDK + CLI 子进程 spawn
- 钉钉桥接连接
- SQLite 读写
- 配置管理

```bash
sudo apt install xvfb
xvfb-run electron . --no-sandbox
```

### 阶段二：Express 服务端（2-3 天）

1. 新增 `src/server/index.js`，启动 Express + WebSocket
2. 编写 `http-handlers.js`，从 `ipc-handlers.js` 机械化映射
3. P0 功能 API 全部可用
4. 3 处 `app.getPath('userData')` 替换为 `os.homedir()`

### 阶段三：前端适配（2-3 天）

1. 编写 `web-api-adapter.js`
2. Vue 项目配置独立打包入口（Web 版）
3. Express 静态文件托管打包产物
4. 约 5-10 个组件微调（文件对话框 → 输入框）

### 阶段四：Agent 对话上线（1-2 天）

1. WebSocket 实现 Agent 流式推送
2. Chat 对话框通过浏览器可用
3. 端到端测试

### 阶段五：去 Electron（可选，2-3 天）

抽出纯 Node.js 服务端，不依赖 Electron：
- `ipcMain.handle` → `express.router`
- 去掉所有 Electron import
- 独立 `package.json`（不含 electron 依赖）
- Docker 镜像打包

## 八、工期估算

| 阶段 | 内容 | 工期 |
|------|------|------|
| 阶段一 | xvfb 验证 | 1 天 |
| 阶段二 | Express 服务端 | 2-3 天 |
| 阶段三 | 前端适配 | 2-3 天 |
| 阶段四 | Agent 对话 | 1-2 天 |
| **MVP 合计** | **P0 + P1 + 对话** | **6-9 天** |
| 阶段五（可选） | 去 Electron 化 | 2-3 天 |
| **完整版** | **全部** | **8-12 天** |

## 九、风险与注意事项

1. **claude-agent-sdk 依赖**：SDK 内部 spawn CLI 子进程，需确认 Linux 上路径和权限正常
2. **node-pty**：Web 版不做 PTY，但桌面端共享代码时需条件加载，避免 Linux 编译问题
3. **better-sqlite3**：需要在 Linux 上重新编译 native addon
4. **安全**：Web 端暴露端口后需加认证（至少 token 认证），防止未授权访问
5. **并发**：多个 Web 用户同时操作同一实例，需考虑配置写入冲突
6. **CORS**：如果前端和 Express 不同源，需配置 CORS

## 十、与其他计划的关系

| 计划 | 关系 |
|------|------|
| 钉钉会话独立工作目录 | 独立，可先后实施 |
| 企业微信接入 | 依赖公网 IP，Web 服务端上线后更容易实现 |
| RAG 知识库 MCP Server | 独立，但 Linux 部署后更适合运行 |
| 商业化 Open Core | Web 版可作为 Pro/Enterprise 付费功能 |
